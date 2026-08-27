// Song type + the single within-song advance resolver.
//
// A song is either 'text' (ChordPro/OnSong lyrics, the default and the only
// existing type) or 'pdf' (a stored PDF lead sheet). Everything that needs to
// know "how does Next/Previous move WITHIN this song" must go through
// advanceMode() — never test `song.type === 'pdf'` inline for advance logic.
// That keeps the paging seam in ONE place so a future paged-TEXT mode is an
// additive override here, not a refactor of every caller.

// Content-type test — use ONLY for content-shaped UI gating (e.g. hiding
// transpose / chord tools that make no sense for a PDF). Advance logic must use
// advanceMode() instead.
export function isPdfSong(song) {
  return song?.type === 'pdf';
}

// The within-song advance unit:
//   'page'   — discrete pages (PDF now; paged-text later)
//   'scroll' — a continuous scroll column (today's text songs)
// Both the renderer and the pedal/next-prev handler consult this one function.
export function advanceMode(song) {
  return isPdfSong(song) ? 'page' : 'scroll';
}
