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
  const exact = (n) => [
    ...getActiveChords(instrument).filter(c => c.name === n && !hiddenSet.has(builtinKey(c))),
    ...customs.filter(c => c.name === n),
  ];

  const hit = exact(name);
  if (hit.length) return hit;

  // SLASH CHORDS: play the chord, drop the bass.
  //
  // "Dm7/G" means a Dm7 with a G underneath it, and a ukulele has no string low
  // enough to put it there — so a player plays the Dm7 and lets the bass go.
  // Cue used to show NOTHING for these, which in "Still Got The Blues" was three
  // of the four chords it could not draw: Dm7/G, Am/B and Am/C, where the last
  // two are a bass walk under one unchanging Am.
  //
  // Safe in the strict sense: the shape sounds the notes the written chord
  // already contains, minus one. It never adds a note the chart did not ask for,
  // which is what separates this from SUBSTITUTING a chord.
  //
  // Only after an exact match fails, so a custom "Dm7/G" somebody entered by
  // hand still wins. The result is tagged rather than renamed: the caller keeps
  // the chart's own name and can say which bass note went missing.
  const cut = name ? name.indexOf('/') : -1;
  const slash = cut > 0 ? name.slice(0, cut) : null;
  if (!slash) return hit;
  const bass = name.slice(cut + 1);
  // The bass has to BE a note. normalizeChordName already drops beat slashes
  // ("F////" -> "F"), but a name can reach here by other routes, and without
  // this guard the marker read "no /// bass" — which is what Howard saw.
  if (!/^[A-G][b#]?$/.test(bass)) return hit;
  return exact(slash).map(shape => ({ ...shape, slashBase: slash, droppedBass: bass }));
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
