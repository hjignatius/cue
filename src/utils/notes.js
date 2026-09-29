// What a fingering actually sounds.
//
// The one piece of music arithmetic several parts of Cue need and none of them
// should own: the AI layer checks a proposed shape against the notes it claims,
// the editor's chord dialogs print the notes under a diagram, and the library
// audit checks every shipped shape against its name. Same sum in all three.

import { NOTE_NAMES } from './transpose.js';

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// A note name to its pitch class, tolerant of how it might be spelled — sharps,
// flats, and the double accidentals a proper spelling needs (the #9 of E is F##,
// which sounds as G). Returns null for anything that is not a note.
export function notePitchClass(note) {
  const m = /^([A-Ga-g])([#b♯♭x]*)$/.exec((note || '').trim());
  if (!m) return null;
  let pc = LETTER_PC[m[1].toUpperCase()];
  for (const ch of m[2]) {
    if (ch === '#' || ch === '♯') pc += 1;
    else if (ch === 'x') pc += 2;            // the other way of writing a double sharp
    else pc -= 1;                            // b or ♭
  }
  return ((pc % 12) + 12) % 12;
}

/**
 * The notes a shape sounds, low string to high, muted strings left out.
 *
 * Spelled in sharps, because a pitch class has no opinion about its own name —
 * G# and Ab are one string at one fret, and choosing between them would need the
 * chord's key, which a fingering does not carry.
 */
export function shapeNotes(frets = [], tuning = []) {
  if (!Array.isArray(frets) || frets.length !== tuning.length) return [];
  return frets
    .map((f, i) => {
      if (f === -1) return null;
      const open = notePitchClass(tuning[i]);
      return open == null ? null : NOTE_NAMES[(open + f) % 12];
    })
    .filter(Boolean);
}

// ---- Chord symbols ----------------------------------------------------------

// Semitones above the root that each quality is ALLOWED to use — the notes a
// shape of this chord may contain, not the ones it must. The 5th is in here
// everywhere it belongs even though players drop it constantly.
//
// This table is the app's one opinion about what a chord symbol means. The
// library audit (scripts/chordAudit.mjs) checks all 810 shipped shapes against
// it, so it is a table with 810 tests behind it rather than a list someone typed.
export const CHORD_QUALITIES = {
  '':       [0, 4, 7],
  'm':      [0, 3, 7],
  '5':      [0, 7],
  '6':      [0, 4, 7, 9],
  'm6':     [0, 3, 7, 9],
  '7':      [0, 4, 7, 10],
  'maj7':   [0, 4, 7, 11],
  'm7':     [0, 3, 7, 10],
  'm7b5':   [0, 3, 6, 10],
  // Libraries commonly file the four-note dim7 shape under "dim"; allow both.
  'dim':    [0, 3, 6, 9],
  'aug':    [0, 4, 8],
  'sus2':   [0, 2, 7],
  'sus4':   [0, 5, 7],
  '7sus4':  [0, 5, 7, 10],
  '9':      [0, 2, 4, 7, 10],
  'add9':   [0, 2, 4, 7],
  '13':     [0, 2, 4, 7, 9, 10],
  '7#5':    [0, 4, 8, 10],
  '7b9':    [0, 1, 4, 7, 10],
  '7#9':    [0, 3, 4, 7, 10],
};

/**
 * Split a chord symbol into its root, quality suffix and slash bass.
 * Returns null when the name is not a chord this file understands.
 */
export function splitChord(name) {
  const m = /^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/.exec((name || '').trim());
  if (!m) return null;
  const suffix = m[2] || '';
  if (!(suffix in CHORD_QUALITIES)) return null;
  return { root: m[1], suffix, bass: m[3] || null };
}

/**
 * The pitch classes a chord symbol names — including its slash bass, which is
 * part of the written chord even when no string can reach it.
 * Returns null for a symbol this file cannot read, which callers must treat as
 * "no opinion" rather than as an empty chord.
 */
export function chordPitchClasses(name) {
  const parts = splitChord(name);
  if (!parts) return null;
  const root = notePitchClass(parts.root);
  if (root == null) return null;
  const set = new Set(CHORD_QUALITIES[parts.suffix].map((i) => (root + i) % 12));
  if (parts.bass) {
    const b = notePitchClass(parts.bass);
    if (b != null) set.add(b);
  }
  return set;
}
