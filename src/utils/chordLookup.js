import { getActiveChords, chordPrefKey, DEFAULT_INSTRUMENT } from '../data/chordLibraries.js';
import { loadCustomChords, loadHiddenChords } from './chordStorage.js';

const shapeKey  = (shape) => (shape?.frets ? shape.frets.join(',') : '');
const builtinKey = (c) => `${c.name}:${c.frets.join(',')}`;

// All shapes for a chord name in the ACTIVE instrument: its built-ins (minus any
// the user hid) first, then that instrument's custom shapes — the same order and
// filtering SongChordPanel builds, so a saved preference resolves to the same
// shape everywhere. NO cross-instrument fallback: if the active instrument has no
// shape for a name, the result is empty and the caller renders the name alone.
export function shapesForName(name, instrument = DEFAULT_INSTRUMENT, custom, hidden) {
  const customs   = custom ?? loadCustomChords(instrument);
  const hiddenSet = hidden ?? new Set(loadHiddenChords(instrument));
  return [
    ...getActiveChords(instrument).filter(c => c.name === name && !hiddenSet.has(builtinKey(c))),
    ...customs.filter(c => c.name === name),
  ];
}

// Resolve one chord name to its selected shape for the active instrument.
// chordPrefs is the per-song map; the voicing key is read via chordPrefKey so
// ukulele uses the bare name (existing records) and other instruments use the
// namespaced key. Older ukulele songs stored a numeric index, still honored.
// Returns null when the active instrument has no shape (decision B — no fallback).
export function resolveChordShape(name, chordPrefs = {}, instrument = DEFAULT_INSTRUMENT, custom, hidden) {
  const shapes = shapesForName(name, instrument, custom, hidden);
  if (!shapes.length) return null;
  const p = chordPrefs?.[chordPrefKey(instrument, name)];
  let idx = 0;
  if (typeof p === 'number') idx = Math.min(Math.max(0, p), shapes.length - 1);
  else if (typeof p === 'string') { const i = shapes.findIndex(s => shapeKey(s) === p); if (i >= 0) idx = i; }
  return shapes[idx];
}

// Chord objects {name, frets, fingers?} for the given names in the active
// instrument, honoring the song's shape preferences, customs and hidden shapes.
// Names with no shape in the active instrument are omitted.
export function lookupChordDiagrams(names, chordPrefs = {}, instrument = DEFAULT_INSTRUMENT) {
  const custom = loadCustomChords(instrument);
  const hidden = new Set(loadHiddenChords(instrument));
  return names.map(name => resolveChordShape(name, chordPrefs, instrument, custom, hidden)).filter(Boolean);
}
