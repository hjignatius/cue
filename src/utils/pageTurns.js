// Quarter turns for single pages of a PDF song: a book with a few landscape
// pages in it, say, where the rest of the pages are fine.
//
// song.pdfRotate turns every page together. song.pdfPageTurns adds to that,
// page by page: { 3: 90, 7: 270 }, keyed by page number, holding only the pages
// that are turned. It is a separate field so a song saved before it existed, or
// read by an older Cue, still shows the way it always did.

const QUARTERS = [90, 180, 270];

// The extra turn on page `n`, 0 when it has none or the stored value is junk.
export function pageTurn(turns, n) {
  const t = turns?.[n];
  return QUARTERS.includes(t) ? t : 0;
}

// `turns` after a tap on page `n`: on a quarter turn, and back to no entry at all
// after the fourth, so a page turned full circle reads as never turned.
export function nextPageTurns(turns, n) {
  const next = { ...cleanPageTurns(turns) };
  const t = (pageTurn(next, n) + 90) % 360;
  if (t) next[n] = t; else delete next[n];
  return next;
}

// Only real turns on real page numbers. Integer keys come back in order, so the
// same turns always read the same to the check for a changed song.
export function cleanPageTurns(turns) {
  const out = {};
  for (const k of Object.keys(turns || {})) {
    if (Number.isInteger(Number(k)) && Number(k) > 0 && pageTurn(turns, k)) out[k] = turns[k];
  }
  return out;
}

export const hasPageTurns = (turns) => Object.keys(cleanPageTurns(turns)).length > 0;
