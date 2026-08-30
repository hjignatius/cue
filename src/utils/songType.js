// Song type + the single within-song advance resolver.
//
// A song is either 'text' (ChordPro/OnSong lyrics) or 'pdf' (a stored PDF lead
// sheet). How Next/Previous move WITHIN a song is decided by a per-song
// `fullPage` flag — NOT by the type — so both types share one behavior:
//
//   fullPage OFF (default) → 'scroll': a continuous scroll column; the pedal
//     advances a screenful and rolls to the next song at the bottom. Text
//     scrolls its lyrics; a PDF scrolls a stack of its pages.
//   fullPage ON            → 'page': discrete full pages that fit the screen;
//     the pedal / Next-Back jump a whole page and roll to the next song at the
//     last one. A PDF pages through its pages; a condensed one-screen text song
//     is a single page (so it just advances to the next song).
//
// Everything that needs the within-song advance unit goes through advanceMode()
// — never test type or fullPage inline — so the seam stays in ONE place.

// Content-type test — ONLY for content-shaped UI gating (e.g. hiding transpose /
// chord tools that make no sense for a PDF). Advance logic must use advanceMode().
export function isPdfSong(song) {
  return song?.type === 'pdf';
}

// The within-song advance unit: 'page' when the song is in Full Page mode, else
// 'scroll'. Type-agnostic — text and PDF share it.
export function advanceMode(song) {
  return song?.fullPage === true ? 'page' : 'scroll';
}
