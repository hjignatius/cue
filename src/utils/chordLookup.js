import { UKULELE_CHORDS } from '../data/ukuleleChords.js';

function loadCustom() {
  try { return JSON.parse(localStorage.getItem('cue_custom_chords') || '[]'); } catch { return []; }
}

const shapeKey = (shape) => (shape?.frets ? shape.frets.join(',') : '');

// All shapes for a chord name: built-ins first, then custom shapes — the same
// order SongChordPanel builds, so a saved preference resolves to the same shape.
export function shapesForName(name, custom = loadCustom()) {
  return [
    ...UKULELE_CHORDS.filter(c => c.name === name),
    ...custom.filter(c => c.name === name),
  ];
}

// Resolve one chord name to its selected shape. chordPrefs is the per-song map
// (name → the chosen shape's frets key, e.g. "2,0,2,0"; older songs stored a
// numeric index, still honored). Mirrors SongChordPanel's prefIndex so Preview,
// Present and the PDF all agree. Returns null for unknown chords.
export function resolveChordShape(name, chordPrefs = {}, custom = loadCustom()) {
  const shapes = shapesForName(name, custom);
  if (!shapes.length) return null;
  const p = chordPrefs?.[name];
  let idx = 0;
  if (typeof p === 'number') idx = Math.min(Math.max(0, p), shapes.length - 1);
  else if (typeof p === 'string') { const i = shapes.findIndex(s => shapeKey(s) === p); if (i >= 0) idx = i; }
  return shapes[idx];
}

// Chord objects {name, frets, fingers?} for the given names, honoring the song's
// shape preferences and custom chords. Unknown chords are omitted.
export function lookupChordDiagrams(names, chordPrefs = {}) {
  const custom = loadCustom();
  return names.map(name => resolveChordShape(name, chordPrefs, custom)).filter(Boolean);
}
