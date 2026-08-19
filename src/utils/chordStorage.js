import { DEFAULT_INSTRUMENT } from '../data/chordLibraries.js';

// Per-instrument storage for the user's custom + hidden chord shapes.
//
// History: before multi-instrument support, customs lived in a single flat
// localStorage array `cue_custom_chords` and hidden built-ins in
// `cue_hidden_chords`. Those were implicitly ukulele. This module scopes both by
// instrument (`cue_custom_chords:<id>`, `cue_hidden_chords:<id>`) and migrates the
// legacy keys into the ukulele scope ONCE, non-destructively (legacy keys are
// left in place as a rollback backup).
//
// PR1 note: these helpers exist but no consumer is wired to them yet — the app
// still reads the legacy keys directly, and the migration only *adds* the scoped
// copies, so ukulele behavior is byte-for-byte identical. PR2 switches the
// consumers over to read the active instrument's scope.

const LEGACY_CUSTOM_KEY = 'cue_custom_chords';
const LEGACY_HIDDEN_KEY = 'cue_hidden_chords';
const PREFS_KEY         = 'cue_prefs';
const VERSION_FLAG      = 'cue:chord_lib_version';
const CHORD_LIB_VERSION = 1;

function customKey(instrument) { return `${LEGACY_CUSTOM_KEY}:${instrument}`; }
function hiddenKey(instrument) { return `${LEGACY_HIDDEN_KEY}:${instrument}`; }

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

// ---- Custom shapes ----------------------------------------------------------

// Returns the array of custom shapes for an instrument. If the scoped key does
// not exist yet (half-migrated or rolled-back state), fall back to the legacy
// flat key for ukulele so nothing is lost; other instruments fall back to empty.
export function loadCustomChords(instrument = DEFAULT_INSTRUMENT) {
  const scoped = localStorage.getItem(customKey(instrument));
  if (scoped != null) { try { return JSON.parse(scoped); } catch { return []; } }
  if (instrument === DEFAULT_INSTRUMENT) return readJSON(LEGACY_CUSTOM_KEY, []);
  return [];
}

export function saveCustomChords(instrument, chords) {
  localStorage.setItem(customKey(instrument), JSON.stringify(chords));
}

// ---- Hidden built-ins (array of builtinKey strings) -------------------------

export function loadHiddenChords(instrument = DEFAULT_INSTRUMENT) {
  const scoped = localStorage.getItem(hiddenKey(instrument));
  if (scoped != null) { try { return JSON.parse(scoped); } catch { return []; } }
  if (instrument === DEFAULT_INSTRUMENT) return readJSON(LEGACY_HIDDEN_KEY, []);
  return [];
}

export function saveHiddenChords(instrument, hidden) {
  localStorage.setItem(hiddenKey(instrument), JSON.stringify(hidden));
}

// ---- One-time migration -----------------------------------------------------

// Idempotent, localStorage-only, no network. Mirrors the cue:schema_version
// pattern in storage.js. Call once at startup, before any chord read.
export function migrateChordLibraries() {
  try {
    const v = parseInt(localStorage.getItem(VERSION_FLAG) || '0', 10);
    if (v >= CHORD_LIB_VERSION) return; // already migrated

    // 2 + 3. Copy legacy flat keys into the ukulele scope, but ONLY if the target
    // does not already exist — so a lost flag can't clobber post-migration edits.
    const uCustom = customKey(DEFAULT_INSTRUMENT);
    if (localStorage.getItem(uCustom) == null) {
      const legacy = localStorage.getItem(LEGACY_CUSTOM_KEY);
      if (legacy != null) localStorage.setItem(uCustom, legacy);
    }
    const uHidden = hiddenKey(DEFAULT_INSTRUMENT);
    if (localStorage.getItem(uHidden) == null) {
      const legacy = localStorage.getItem(LEGACY_HIDDEN_KEY);
      if (legacy != null) localStorage.setItem(uHidden, legacy);
    }

    // 4. Default the instrument pref to ukulele if it is not already set. DEFAULTS
    // in PrefsContext also provides this at runtime; persisting it keeps the
    // stored blob explicit.
    try {
      const prefs = readJSON(PREFS_KEY, {});
      if (prefs && typeof prefs === 'object' && prefs.instrument == null) {
        prefs.instrument = DEFAULT_INSTRUMENT;
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      }
    } catch { /* prefs blob unreadable — DEFAULTS still supplies the value */ }

    // 5. Legacy keys are intentionally left in place as a rollback backup.
    // 6. Stamp the version.
    localStorage.setItem(VERSION_FLAG, String(CHORD_LIB_VERSION));
  } catch { /* storage unavailable — app still runs, reads fall back to legacy */ }
}
