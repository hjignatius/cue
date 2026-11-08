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
  const { PDFDocument, PDFName, PDFArray, PDFDict } = await import('pdf-lib');
  const bytes = data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data : await data.arrayBuffer();
  // A book "protected" against editing still opens; its pages are copied as
  // they are, not changed.
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return {
    pageCount: src.getPageCount(),
    async cut(pages) {
      for (const p of pages) webLinksOnly(src, p - 1, { PDFName, PDFArray, PDFDict });
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, pages.map(p => p - 1));
      for (const page of copied) out.addPage(page);
      return out.save();
    },
  };
}

// A song keeps its web links, and loses its links to other pages of the book.
// Those point at a page the song no longer has, or at the book's contents. And
// copying one brings the page it points to along, unseen: a one-page song from
// the DUS Holiday book came out at 816 KB instead of 132 KB.
function webLinksOnly(src, index, { PDFName, PDFArray, PDFDict }) {
  const node = src.getPage(index).node;
  const annots = node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) return;
  const keep = [];
  for (let i = 0; i < annots.size(); i++) {
    const ref = annots.get(i);
    const a = src.context.lookup(ref);
    if (a instanceof PDFDict && a.get(PDFName.of('Subtype'))?.toString() === '/Link') {
      const action = a.lookupMaybe(PDFName.of('A'), PDFDict);
      if (action?.get(PDFName.of('S'))?.toString() !== '/URI') continue;
    }
    // The page an annotation says it is on is optional, and copying it would
    // bring the whole book's page tree with it.
    if (a instanceof PDFDict) a.delete(PDFName.of('P'));
    keep.push(ref);
  }
  node.set(PDFName.of('Annots'), src.context.obj(keep));
}
