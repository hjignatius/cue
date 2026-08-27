import { parseChordPro } from './chordPro.js';

// Chord names always start with a note letter A-G.
// Strumming markers (↑↓ etc.) start with non-letter — exclude them.
const IS_CHORD = /^[A-G]/;
// Strip trailing strum markers from a chord token (handles "G↓" bracket tokens).
const STRUM_SUFFIX = /[^a-zA-Z0-9#b\/]+$/;
// Normalize uppercase-M major shorthand: BbM7 → Bbmaj7, GM9 → Gmaj9
const MAJOR_M = /^([A-G][b#]?)M(\d+)/;

// Canonicalize the alternate spellings a chord can be written in, so lookup /
// grouping always uses one form (and finds the built-in shape). Instrument-
// agnostic — names are the same across ukulele/baritone/guitar.
//   BbM7    → Bbmaj7   (uppercase-M major)
//   Am7(b5) → Am7b5    (parenthesised alterations)
//   Am7-5   → Am7b5    (dash = flat, jazz shorthand; only between digits so
//                       "A-7"/"F-150"/"B-52" are untouched)
//   C7+5    → C7#5     (plus = sharp)
//   A7aug   → A7#5     (aug after a degree = raised 5th)
//   A+      → Aaug     (plus symbol on a bare triad = augmented)
//   A°/A°7  → Adim/Adim7 (degree symbol = diminished)
export function normalizeChordName(name) {
  if (!name) return name;
  return name
    .replace(MAJOR_M, '$1maj$2')
    .replace(/\(([^)]*)\)/g, '$1')    // strip parens around alterations
    .replace(/(\d)-(\d)/g, '$1b$2')   // 7-5 → 7b5  (dash only between digits)
    .replace(/(\d)\+(\d)/g, '$1#$2')  // 7+5 → 7#5
    .replace(/°/g, 'dim')             // A° → Adim, A°7 → Adim7
    .replace(/(\d)aug/g, '$1#5')      // 7aug → 7#5 (aug raising the 5th)
    .replace(/(\d)\+(?!\d)/g, '$1#5') // 7+ → 7#5 (trailing plus)
    .replace(/^([A-G][b#]?)\+/, '$1aug'); // A+ → Aaug (bare augmented triad)
}

// Back-compat alias — this used to only fold uppercase-M.
export const normalizeMajorSuffix = normalizeChordName;

// Returns unique chord names in order of first appearance in the song.
// Strum decorations are stripped and major-M shorthand is normalized so
// chord panel lookup always uses the canonical form.
export function detectChords(text) {
  const lines = parseChordPro(text || '');
  const seen  = new Set();
  const out   = [];
  for (const line of lines) {
    if (line.type !== 'chords') continue;
    for (const seg of line.segments) {
      // Canonicalize first (folds parens/dash/plus alterations), THEN strip any
      // trailing strum glyph — so "Am7(b5)"'s ")" isn't stripped before the
      // parens are folded away.
      const norm  = normalizeChordName(seg.chord);
      const chord = norm ? norm.replace(STRUM_SUFFIX, '') : norm;
      if (chord && IS_CHORD.test(chord) && !seen.has(chord)) {
        seen.add(chord);
        out.push(chord);
      }
    }
  }
  return out;
}
