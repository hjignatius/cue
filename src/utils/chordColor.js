// Keep chord text readable against the theme background. Only the two default
// extremes are flipped: black chords on a dark theme render white, and white
// chords on a light theme render black. Any custom color the user picked is left
// exactly as-is. Applies to chord names in over-lyrics and brackets, in the
// preview, Present, and PDF export.
export function readableChordColor(color, dark) {
  const c = (color || '').trim().toLowerCase();
  if (dark && (c === '#000000' || c === '#000' || c === 'black' || c === '')) return '#ffffff';
  if (!dark && (c === '#ffffff' || c === '#fff' || c === 'white')) return '#000000';
  return color;
}
