// Songs kept as PDF pages go into Cue's PDF exports as their original pages —
// bars, dots, diagrams and all — not as a title on an empty page. react-pdf can't
// draw another PDF, so the export leaves a slot for each such song (a page of an
// odd, tiny size that names the song by its height) and fillSlots swaps every
// slot for the song's own pages afterwards. Nothing else in a Cue export is
// that size, and the export has no page numbers or contents to put right.
//
// pdf-lib is loaded only when an export has a page song in it.

export const SLOT_WIDTH = 11;

// The size of slot `i`'s page, for react-pdf.
export const slotSize = (i) => ({ width: SLOT_WIDTH, height: SLOT_WIDTH + i });

// Which slot a page is, or -1 for a page of Cue's own.
export function slotOf(page) {
  const { width, height } = page.getSize();
  return Math.round(width) === SLOT_WIDTH ? Math.round(height) - SLOT_WIDTH : -1;
}

// Open a song's stored PDF to go into an export, or null when it won't open —
// that song then prints from its words, as before.
export async function openForSlot(blob) {
  if (!blob) return null;
  try {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount() ? doc : null;
  } catch (err) {
    console.warn('[pdfSlots] a song’s PDF would not open for the export', err);
    return null;
  }
}

// `rendered` is react-pdf's export; `docs[i]` the opened PDF for slot i. Returns
// the finished PDF's bytes, Cue's pages and the songs' pages in their order.
export async function fillSlots(rendered, docs) {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(rendered);
  const out = await PDFDocument.create();
  for (let i = 0; i < src.getPageCount(); i++) {
    const doc = docs[slotOf(src.getPage(i))];
    const pages = doc ? await out.copyPages(doc, doc.getPageIndices()) : await out.copyPages(src, [i]);
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}
