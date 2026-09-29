// Does every shipped chord shape sound the chord it is named after?
//
// Not a guess and not a model: the tuning plus the fret numbers gives the notes,
// and a chord symbol gives the notes it is allowed to contain. Anything in the
// shape that is NOT in the chord is a hard error — a wrong note is wrong however
// you voice it. A MISSING note is only reported, never failed: four strings
// cannot hold a six-note chord, and dropping the 5th is what players do.
//
// When a shape has foreign notes, this also asks whether transposing it would
// make it right. A shape that is correct a semitone up is not a random mistake,
// it is an entry that slipped a fret, and saying so turns a bug report into a
// fix.
//
// Run: node scripts/chordAudit.mjs
import { UKULELE_CHORDS } from '../src/data/ukuleleChords.js';
import { BARITONE_CHORDS } from '../src/data/baritoneChords.js';
import { GUITAR_CHORDS } from '../src/data/guitarChords.js';
import { CHORD_LIBRARIES } from '../src/data/chordLibraries.js';
import { notePitchClass } from '../src/utils/notes.js';

// Semitones above the root that each quality is allowed to use. The 5th is
// included everywhere it belongs even when players drop it — this is the set of
// notes a shape may contain, not the set it must.
const QUALITIES = {
  '':       [0, 4, 7],
  'm':      [0, 3, 7],
  '5':      [0, 7],
  '6':      [0, 4, 7, 9],
  'm6':     [0, 3, 7, 9],
  '7':      [0, 4, 7, 10],
  'maj7':   [0, 4, 7, 11],
  'm7':     [0, 3, 7, 10],
  'm7b5':   [0, 3, 6, 10],
  // Libraries commonly file the four-note dim7 shape under "dim"; allow both.
  'dim':    [0, 3, 6, 9],
  'aug':    [0, 4, 8],
  'sus2':   [0, 2, 7],
  'sus4':   [0, 5, 7],
  '7sus4':  [0, 5, 7, 10],
  '9':      [0, 2, 4, 7, 10],
  'add9':   [0, 2, 4, 7],
  '13':     [0, 2, 4, 7, 9, 10],
  '7#5':    [0, 4, 8, 10],
  '7b9':    [0, 1, 4, 7, 10],
  '7#9':    [0, 3, 4, 7, 10],   // the #9 sounds as the minor 3rd
};
// The notes that MAKE the chord what it is — reported when absent, never failed.
const DEFINING = {
  '6': [9], 'm6': [9], '7': [10], 'maj7': [11], 'm7': [10], 'm7b5': [6, 10],
  'aug': [8], '7#5': [8, 10], '7b9': [1, 10], '7#9': [3, 4, 10], '9': [2, 10],
  'add9': [2], '13': [9, 10], 'sus2': [2], 'sus4': [5], '7sus4': [5, 10],
};

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const split = (name) => {
  const m = /^([A-G][b#]?)(.*)$/.exec(name);
  return m ? { root: m[1], suffix: m[2] } : null;
};
const soundedPCs = (tuning, frets) =>
  frets.map((f, i) => (f === -1 ? null : (notePitchClass(tuning[i]) + f) % 12)).filter(x => x != null);

// PROVE THE CHECK BEFORE TRUSTING A CLEAN RESULT. "0 problems" is what a broken
// audit says too, so before it looks at the real libraries it is shown shapes
// that are definitely wrong and must fail, and one that is definitely right and
// must pass. This caught nothing; it is here so a later edit cannot quietly
// turn the whole script into a no-op.
{
  const t = ['G', 'C', 'E', 'A'];
  const probe = (name, frets) => {
    const [, root, suffix] = /^([A-G][b#]?)(.*)$/.exec(name);
    const r = notePitchClass(root);
    const pcs = [...new Set(soundedPCs(t, frets))];
    const ok = new Set(QUALITIES[suffix].map(i => (r + i) % 12));
    return {
      foreign: pcs.some(p => !ok.has(p)),
      lacking: (DEFINING[suffix] || []).some(i => !pcs.includes((r + i) % 12)),
    };
  };
  // [name, frets, expected foreign?, expected lacking?]
  const cases = [
    ['C',    [0, 0, 0, 3], false, false],   // the real C
    ['C',    [0, 0, 0, 4], true,  false],   // one fret off — sounds a C#, a wrong note
    ['E7',   [1, 2, 0, 2], false, false],   // G# D E B
    // THE TWO TESTS CATCH DIFFERENT THINGS, and this is the case that shows it.
    // E7 is a SUBSET of E7#9, so a shape sounding plain E7 has no foreign note
    // to find — nothing in it is wrong, the #9 is simply absent. Only the
    // defining-note test sees that, which is why "no wrong notes" on its own is
    // not a clean bill of health.
    ['E7#9', [1, 2, 0, 2], false, true],
    ['E7#9', [1, 2, 3, 2], false, false],   // G# D G B — the real thing
  ];
  for (const [name, frets, wantForeign, wantLacking] of cases) {
    const got = probe(name, frets);
    if (got.foreign !== wantForeign || got.lacking !== wantLacking) {
      console.log(`SELF-CHECK FAILED: ${name} [${frets.join(' ')}] -> foreign=${got.foreign} lacking=${got.lacking}, expected ${wantForeign}/${wantLacking}`);
      process.exit(2);
    }
  }
}

let errors = 0, missing = 0, checked = 0, unknown = new Set();
const report = [];

for (const [libId, chords] of [['ukulele_gcea', UKULELE_CHORDS], ['baritone_dgbe', BARITONE_CHORDS], ['guitar', GUITAR_CHORDS]]) {
  const tuning = CHORD_LIBRARIES[libId].tuning;
  for (const c of chords) {
    const parts = split(c.name);
    if (!parts) { unknown.add(c.name); continue; }
    const allowed = QUALITIES[parts.suffix];
    if (!allowed) { unknown.add(parts.suffix); continue; }
    const root = notePitchClass(parts.root);
    if (root == null || !Array.isArray(c.frets) || c.frets.length !== tuning.length) { unknown.add(c.name); continue; }
    checked++;

    const pcs = [...new Set(soundedPCs(tuning, c.frets))];
    const ok = new Set(allowed.map(i => (root + i) % 12));
    const foreign = pcs.filter(p => !ok.has(p));

    if (foreign.length) {
      errors++;
      // Would another root make this shape correct? A shape that is right a
      // semitone away slipped a fret; one that is right nowhere is its own bug.
      const fits = [];
      for (let t = 1; t < 12; t++) {
        const alt = (root + t) % 12;
        const altOk = new Set(allowed.map(i => (alt + i) % 12));
        if (pcs.every(p => altOk.has(p))) fits.push(`${NOTE[alt]}${parts.suffix}`);
      }
      report.push(`  ${libId.padEnd(14)} ${c.name.padEnd(7)} [${c.frets.join(' ')}]  sounds ${pcs.map(p => NOTE[p]).join(' ')}`
        + `\n  ${' '.repeat(14)} ${' '.repeat(7)} ${' '.repeat(c.frets.join(' ').length + 3)}foreign: ${foreign.map(p => NOTE[p]).join(' ')}`
        + (fits.length ? `  — but it IS ${fits.join(' / ')}` : '  — matches no root'));
    } else {
      const need = (DEFINING[parts.suffix] || []).filter(i => !pcs.includes((root + i) % 12));
      if (need.length) { missing++; report.push(`  (note) ${libId.padEnd(14)} ${c.name.padEnd(7)} [${c.frets.join(' ')}] has no ${need.map(i => NOTE[(root + i) % 12]).join('/')} — the chord's own ${parts.suffix}`); }
    }
  }
}

console.log(report.join('\n'));
console.log(`\n${checked} shapes checked · ${errors} with notes that do not belong · ${missing} missing a defining note`);
if (unknown.size) console.log(`not checked (unknown quality): ${[...unknown].join(' ')}`);
process.exit(errors ? 1 : 0);   // a missing note is a finding, not a failure
