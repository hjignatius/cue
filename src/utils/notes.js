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
