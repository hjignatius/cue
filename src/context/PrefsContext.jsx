import { createContext, useContext, useEffect, useState } from 'react';

const PREFS_KEY = 'cue_prefs';

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const DEFAULTS = { theme: 'light', chordColor: '#000000', metronomeMode: 'sound', chordDiagramSize: 2, chordLabelScale: 0, accidentals: 'auto' };

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
