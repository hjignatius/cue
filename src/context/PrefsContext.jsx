import { createContext, useContext, useEffect, useState } from 'react';

const PREFS_KEY = 'cue_prefs';

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// `symbols` is the editor's insert-a-character palette, stored as the plain
// string the user curates (whitespace is ignored when rendering the grid).
// Seeded with action arrows plus a few common marks.
const DEFAULT_SYMBOLS = '↑ ↓ ← → ↔ ↕ ⤴ ⤵ ↻ • ✓ ✗ ★ ♪ ♩';

// Seconds the Present controls wait after the last interaction before ghosting
// (and collapsing) out of the way. User-configurable 0–5; 3 is the default.
// The sentinel PRESENT_NO_FADE (-1) means "never fade" — practice mode, where
// the floating controls and side gutter stay fully lit until manually collapsed.
const DEFAULT_PRESENT_IDLE_SEC = 3;
export const PRESENT_NO_FADE = -1;
// Seconds Present waits after the scroll button is pressed before auto-scroll
// actually begins — a lead-in to get set. 0–5; 0 (start immediately) is default.
const DEFAULT_SCROLL_START_DELAY_SEC = 0;

// Global chord-diagram instrument (which built-in library the chord panel renders
// from). ukulele_gcea preserves today's behavior for every existing user. Nothing
// reads this functionally until PR2 — PR1 only establishes the default + storage.
const DEFAULT_INSTRUMENT = 'ukulele_gcea';

// Global foot-pedal behavior. false (default) = 'Songs': Next/Prev jump
// song-to-song and you read each song by scrolling. true = 'Screen': the pedal
// pages the current song a screenful at a time (advancing song-to-song only at
// the song's bottom/top) with auto-scroll disabled. A per-song Full Page song
// always turns whole pages regardless of this global setting.
const DEFAULT_PEDAL_PAGING = false;
// Page turn glide: within pedal paging mode, how long (ms) a within-song page
// turn takes to glide to the next screen. 0 = instant jump; larger = slower,
// smoother glide (0–2000). Only meaningful while pedalPaging is on.
const DEFAULT_PAGE_GLIDE_MS = 550;
// Page turn size: how far each pedal press moves within a song — a full screen
// ('full', the default), three quarters of a screen ('threequarters'), or half
// a screen ('half'). Only meaningful while pedalPaging is on.
const DEFAULT_PAGE_SIZE = 'full';

// Playing level for AI answers — tailors Q&A and transposing advice (beginner
// gets more explanation and easier options; pro gets terse expert answers).
export const AI_LEVELS = ['beginner', 'intermediate', 'advanced', 'pro'];
const DEFAULT_AI_LEVEL = 'intermediate';

const DEFAULTS = { theme: 'light', chordColor: '#000000', metronomeMode: 'sound', chordDiagramSize: 2, chordLabelScale: 0, accidentals: 'auto', symbols: DEFAULT_SYMBOLS, presentIdleSec: DEFAULT_PRESENT_IDLE_SEC, scrollStartDelaySec: DEFAULT_SCROLL_START_DELAY_SEC, instrument: DEFAULT_INSTRUMENT, pedalPaging: DEFAULT_PEDAL_PAGING, pageGlideMs: DEFAULT_PAGE_GLIDE_MS, pageSize: DEFAULT_PAGE_SIZE, aiLevel: DEFAULT_AI_LEVEL };

const LEGACY_BLUE = new Set(['#a5b4fc', '#4f46e5', '#6366f1', '#818cf8']);

function load() {
  try {
    const stored = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    if (LEGACY_BLUE.has(stored.chordColor)) stored.chordColor = '#000000';
    return stored;
  }
  catch { return { ...DEFAULTS }; }
}

export const PrefsContext = createContext({ ...DEFAULTS, updatePref: () => {} });
export const usePrefs = () => useContext(PrefsContext);

export function PrefsProvider({ children }) {
  const [prefs, setPrefs] = useState(load);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    document.documentElement.classList.toggle('dark', prefs.theme === 'dark');
  }, [prefs]);

  // Apply immediately on first render
  useEffect(() => {
    document.documentElement.classList.toggle('dark', prefs.theme === 'dark');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updatePref(key, value) {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }

  return (
    <PrefsContext.Provider value={{ ...prefs, updatePref }}>
      {children}
    </PrefsContext.Provider>
  );
}
