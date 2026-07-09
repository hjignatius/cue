import { parseChordPro } from './chordPro.js';

// Chord names always start with a note letter A-G.
// Strumming markers (↑↓ etc.) start with non-letter — exclude them.
const IS_CHORD = /^[A-G]/;
// Strip trailing strum markers from a chord token (handles "G↓" bracket tokens).
const STRUM_SUFFIX = /[^a-zA-Z0-9#b\/]+$/;
// Normalize uppercase-M major shorthand: BbM7 → Bbmaj7, GM9 → Gmaj9
const MAJOR_M = /^([A-G][b#]?)M(\d+)/;

export function normalizeMajorSuffix(name) {
  return name ? name.replace(MAJOR_M, '$1maj$2') : name;
}

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
      const bare  = seg.chord?.replace(STRUM_SUFFIX, '');
      const chord = normalizeMajorSuffix(bare);
      if (chord && IS_CHORD.test(chord) && !seen.has(chord)) {
        seen.add(chord);
        out.push(chord);
      }
    }
  }
  return out;
}
