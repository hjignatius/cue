// One press of ◀/▶ (or the pedal) on a Full Page song, worked out from where the
// song stands. Next turns the pages and rolls on to the next song. Previous turns
// back within the song, and from its first page goes to the song before: to the
// TOP of it by default, since going back usually means starting that song again
// (Howard's call, 2026-11-06), or to its LAST page with the Present setting on,
// for reading back through a book.
//
// Returns { page } to turn within the song, { index, lastPage } to change song,
// or null when there is nowhere to go. `count` is the song's page count, and a
// text song is one page. No wrap at either end of the list.
export function pdfTurn({ dir, page, count, index, total, previousToLast = false }) {
  if (dir > 0) {
    if (page < count) return { page: page + 1 };
    return index < total - 1 ? { index: index + 1, lastPage: false } : null;
  }
  if (page > 1) return { page: page - 1 };
  return index > 0 ? { index: index - 1, lastPage: previousToLast } : null;
}
