import { UKULELE_CHORDS } from '../data/ukuleleChords.js';

function loadCustom() {
  try { return JSON.parse(localStorage.getItem('cue_custom_chords') || '[]'); } catch { return []; }
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('cue_chord_prefs') || '{}'); } catch { return {}; }
}

// Returns chord objects {name, frets, fingers?} for the given names,
// respecting user shape preferences and custom chords. Unknown chords are omitted.
export function lookupChordDiagrams(names) {
  const custom = loadCustom();
  const prefs  = loadPrefs();
  return names.map(name => {
    const shapes = [
      ...UKULELE_CHORDS.filter(c => c.name === name),
      ...custom.filter(c => c.name === name),
    ];
    if (!shapes.length) return null;
    return shapes[Math.min(prefs[name] ?? 0, shapes.length - 1)];
  }).filter(Boolean);
}
