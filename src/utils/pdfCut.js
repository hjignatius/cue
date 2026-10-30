// Cutting a book into songs, for the page picker: each song keeps its pages
// exactly as printed — bars, dots, diagrams and all — as a PDF of its own, so
// it shares, exports and annotates like any other PDF song.
//
// pdf-lib is loaded only here, the first time a book is cut; nothing else in
// Cue needs it.

/**
 * Open a PDF once and cut it as many times as needed. `pages` are numbered
 * from 1, in the order they go into the new PDF. Returns the new PDF's bytes.
 */
export async function openBook(data) {
  const { PDFDocument } = await import('pdf-lib');
  const bytes = data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data : await data.arrayBuffer();
  // A book "protected" against editing still opens; its pages are copied as
  // they are, not changed.
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return {
    pageCount: src.getPageCount(),
    async cut(pages) {
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, pages.map(p => p - 1));
      for (const page of copied) out.addPage(page);
      return out.save();
    },
  };
}
