// Lazy PDF.js loader. Dynamically imported ONLY when a pdf song opens, so the
// pdfjs chunk never lands in the text-path bundle. The worker is a BUNDLED LOCAL
// asset (Vite ?url import), never a CDN — required for the strict-CSP offline
// PWA. (Stage 1b: the hand-rolled service worker must precache pdfjs' hashed
// chunk AND this worker file via the build manifest so PDFs render offline.)

let _pdfjsPromise = null;

export function loadPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return _pdfjsPromise;
}

// Pull a PDF's text layer out as lines of text, with the blank lines the format
// never stored put back (see pdfText.js for how, and why it matters).
//
// PER PAGE, and concatenated after. y starts again at the foot of every page, so
// throwing all the items into one pile and sorting by y would shuffle page two
// up into page one.
//
// An empty result is the normal answer for a scanned songbook: pages of images
// with no text layer at all. The caller decides what to do about it.
// A chart is a handful of pages; a songbook is not a song. Jim's Ukulele
// Songbook is 5155 pages — reading them all takes ~20s of main-thread work and
// produces a multi-megabyte blob that is nonsense as a single song. Over this,
// Cue does not offer to unpack at all and the PDF is attached as pages, which
// is what you want from a book anyway.
export const MAX_UNPACK_PAGES = 12;

export async function extractPdfLines(data) {
  const { linesFromItems } = await import('./pdfText.js');
  const pdfjs = await loadPdfjs();
  const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  if (doc.numPages > MAX_UNPACK_PAGES) return [];
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(linesFromItems(content.items));
  }
  return pages;
}

// The same, as the text Cue would put in the editor.
export async function extractPdfText(data) {
  const { textFromLines } = await import('./pdfText.js');
  const pages = await extractPdfLines(data);
  // Each page keeps its own line spacing, so each is measured on its own; a
  // blank line joins them, the way a page turn reads.
  return pages.map(lines => textFromLines(lines)).filter(Boolean).join('\n\n');
}

// A songbook, read for splitting into songs (see songbook.js). Lines per page as
// above, plus the page's web links with where they sit, because a book often
// puts a song's video behind a caption ("The Chipmunk Song") rather than
// printing the address. No page cap: this path exists for books.
//
// `onPage(done, total)` reports real progress — a page read is a page read.
//
// Returns { pages, marks }: `marks` are the book's bookmarks, which say where
// each song starts far better than anything on the page can (songbook.js).
export async function extractSongbookPages(data, { onPage, signal } = {}) {
  const { linesFromItems } = await import('./pdfText.js');
  const pdfjs = await loadPdfjs();
  const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const marks = await readBookmarks(doc);
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { code: 'aborted' });
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const links = (await page.getAnnotations())
      .filter(a => a.url && Array.isArray(a.rect))
      .map(a => ({ url: a.url, bottom: Math.min(a.rect[1], a.rect[3]), top: Math.max(a.rect[1], a.rect[3]) }));
    pages.push({ lines: linesFromItems(content.items), links });
    page.cleanup();
    onPage?.(p, doc.numPages);
  }
  return { pages, marks };
}

// A PDF's bookmarks, flattened, as [{ title, page, top }]: page numbered from 1,
// `top` the height the bookmark points at, or null when it names none ("FitH"
// with no height, "Fit"). Nested lists are walked — the USGB book keeps its
// 1,616 songs under one "Jims-Ukulele-Songbook" entry that points nowhere.
//
// A bookmark that cannot be resolved is left out rather than guessed at: a
// book cut down in Preview (DUS modified) keeps bookmarks to pages it no longer
// has.
export async function readBookmarks(doc) {
  let outline;
  try { outline = await doc.getOutline(); } catch { return []; }
  const out = [];
  const walk = async (items) => {
    for (const item of items || []) {
      try {
        let dest = item.dest;
        if (typeof dest === 'string') dest = await doc.getDestination(dest);
        if (Array.isArray(dest) && dest[0] != null) {
          const index = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0]);
          const kind = dest[1]?.name;
          const top = kind === 'XYZ' ? dest[3] : (kind === 'FitH' || kind === 'FitBH') ? dest[2] : null;
          if (index >= 0 && index < doc.numPages) {
            out.push({ title: String(item.title || '').trim(), page: index + 1, top: typeof top === 'number' ? top : null });
          }
        }
      } catch { /* a bookmark to nothing */ }
      await walk(item.items);
    }
  };
  await walk(outline);
  return out;
}
