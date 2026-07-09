// Chromatic note names (sharps canonical form)
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENHARMONIC = { Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B' };

function noteToSemitone(note) {
  const canonical = ENHARMONIC[note] ?? note;
  return NOTES.indexOf(canonical);
}

// Strip extensions and bass notes; return { root: 0-11, quality: 'maj'|'min'|'dim' } or null
function parseChord(symbol) {
  const base = symbol.split('/')[0];
  const rootMatch = base.match(/^([A-G][#b]?)/);
  if (!rootMatch) return null;
  const root = noteToSemitone(rootMatch[1]);
  if (root === -1) return null;
  const rest = base.slice(rootMatch[1].length);
  let quality = 'maj';
  if (/dim|°/.test(rest))                         quality = 'dim';
  else if (/^m(?!aj)/i.test(rest) || rest === '-') quality = 'min';
  return { root, quality };
}

function extractChordSymbols(text) {
  return (text.match(/\[([^\]]+)\]/g) || []).map(m => m.slice(1, -1));
}

// Diatonic chords (root semitones + quality) for a given tonic and mode.
// Minor includes both natural-minor v and harmonic-minor V so dominant chords score well.
function diatonicSet(tonic, mode) {
  const t = n => (tonic + n) % 12;
  if (mode === 'major') {
    return new Set([
      `${t(0)}:maj`, `${t(2)}:min`, `${t(4)}:min`,
      `${t(5)}:maj`, `${t(7)}:maj`, `${t(9)}:min`,
      `${t(11)}:dim`,
    ]);
  }
  // Natural minor + harmonic minor V (major)
  return new Set([
    `${t(0)}:min`,  `${t(2)}:dim`,
    `${t(3)}:maj`,  `${t(5)}:min`,
    `${t(7)}:min`,  `${t(7)}:maj`,  // natural v + harmonic V
    `${t(8)}:maj`,  `${t(10)}:maj`,
  ]);
}

// 12 major keys then 12 minor keys: [name, tonic semitone, mode]
const KEYS = [
  ['C',   0, 'major'], ['G',   7, 'major'], ['D',   2, 'major'], ['A',   9, 'major'],
  ['E',   4, 'major'], ['B',  11, 'major'], ['F#',  6, 'major'], ['Db',  1, 'major'],
  ['Ab',  8, 'major'], ['Eb',  3, 'major'], ['Bb', 10, 'major'], ['F',   5, 'major'],
  ['Am',  9, 'minor'], ['Em',  4, 'minor'], ['Bm', 11, 'minor'], ['F#m', 6, 'minor'],
  ['C#m', 1, 'minor'], ['G#m', 8, 'minor'], ['D#m', 3, 'minor'], ['Bbm',10, 'minor'],
  ['Fm',  5, 'minor'], ['Cm',  0, 'minor'], ['Gm',  7, 'minor'], ['Dm',  2, 'minor'],
];

/**
 * Analyse the ChordPro text and return the top candidate keys.
 * Returns an array of { name, score, pct } sorted best-first, or [] if no chords found.
 */
export function detectKey(text) {
  const symbols = extractChordSymbols(text);
  if (!symbols.length) return [];

  // Count occurrences of each (root, quality) pair; skip dim — too ambiguous
  const counts = {};
  for (const sym of symbols) {
    const c = parseChord(sym);
    if (!c || c.quality === 'dim') continue;
    const k = `${c.root}:${c.quality}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return [];
  const total = entries.reduce((s, [, n]) => s + n, 0);

  const candidates = KEYS.map(([name, tonic, mode]) => {
    const set = diatonicSet(tonic, mode);
    const score = entries.reduce((s, [k, n]) => s + (set.has(k) ? n : 0), 0);
    return { name, score, pct: Math.round((score / total) * 100) };
  });

  candidates.sort((a, b) => b.score - a.score || b.pct - a.pct);

  // Return top 3, but only those within 1 chord of the top score
  const best = candidates[0].score;
  return candidates.filter(c => c.score >= best - 1).slice(0, 3);
}
