import { UKULELE_CHORDS } from './ukuleleChords.js';
import { BARITONE_CHORDS } from './baritoneChords.js';
import { GUITAR_CHORDS } from './guitarChords.js';

// Registry of the built-in chord-diagram libraries, keyed by instrument id. The
// chord NAMES are instrument-agnostic; only the fingering (frets) and the string
// tuning labels differ per instrument. A global "instrument" pref selects which
// library the chord panel / diagrams look names up in.
//
// PR1 note: this registry is created but NOT yet wired to any consumer — every
// chord site still reads the ukulele set directly. PR2 switches them to read the
// active library via getActiveLibrary(). Guitar is deferred to a later phase.
export const CHORD_LIBRARIES = {
  // 'none' is an explicit value (chord diagrams off): an empty library, so
  // getActive* resolve it WITHOUT falling back to ukulele diagrams. The panel is
  // hidden under 'none', so these empties are only a safety net for stray calls.
  none:          { name: 'None',      chords: [],             tuning: [],                  label: 'None' },
  ukulele_gcea:  { name: 'Ukulele',  chords: UKULELE_CHORDS,  tuning: ['G', 'C', 'E', 'A'], label: 'GCEA Ukulele' },
  baritone_dgbe: { name: 'Baritone', chords: BARITONE_CHORDS, tuning: ['D', 'G', 'B', 'E'], label: 'DGBE Baritone' },
  guitar:        { name: 'Guitar',   chords: GUITAR_CHORDS,   tuning: ['E', 'A', 'D', 'G', 'B', 'E'], label: 'Guitar' },
};

// True when chord diagrams are switched off entirely.
export function isNoneInstrument(instrument) {
  return instrument === 'none';
}

// The safe fallback for any unknown/missing/legacy instrument id. Existing users
// (and anything that reads the pref before it is set) resolve to ukulele.
export const DEFAULT_INSTRUMENT = 'ukulele_gcea';

// Resolve an instrument id to its library entry, falling back to ukulele for an
// unknown or missing id so callers never get undefined.
export function getActiveLibrary(instrument) {
  return CHORD_LIBRARIES[instrument] || CHORD_LIBRARIES[DEFAULT_INSTRUMENT];
}

// Convenience accessors built on the same fallback.
export function getActiveChords(instrument) {
  return getActiveLibrary(instrument).chords;
}
export function getActiveTuning(instrument) {
  return getActiveLibrary(instrument).tuning;
}

// Namespaced key for a song's per-chord voicing preference (finding 6i). Ukulele
// keeps the bare chord name so EXISTING song records are read/written unchanged;
// every other instrument uses an "<instrument>:<name>" key, so selecting a
// baritone voicing can never touch the ukulele selection stored under the bare
// name. Song records are never migrated — namespaced keys are added lazily.
export function chordPrefKey(instrument, name) {
  return (!instrument || instrument === DEFAULT_INSTRUMENT) ? name : `${instrument}:${name}`;
}
