// Formatting a number of seconds for display.
//
// This was written out five times — twice as an identical `formatDuration`
// (MetadataForm, Present), once inline in a set-list prompt, once for the gap
// between songs, and once more for an AI progress counter. Five copies of one
// rule is how the chord lookup and the bookmark name came to disagree with
// themselves, so it lives here now.

// M:SS. Clamped and rounded, because callers pass measured values: a negative
// or fractional second is a measurement artefact, not something to render.
export function mmss(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Under a minute reads better as "47s" than "0:47" — a bare seconds count is
// what you want for a short wait or a gap, where the leading "0:" is noise.
export function shortDuration(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  return s < 60 ? `${s}s` : mmss(s);
}
