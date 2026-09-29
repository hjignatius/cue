// Work out chord shapes instead of asking for them.
//
// The ukulele library is missing whole families that baritone and guitar have —
// a chart writing E7-9 found no shape at all, which is what sent Howard to the
// AI tool for a chord that should simply have been in the library.
//
// These are DERIVED, not recalled: every shape on the neck is enumerated, the
// ones whose notes are wrong are discarded, and what is left is ranked by how
// hard it is to fret. That makes them right by construction on the notes — and
// says nothing about whether they feel good under the hand, which is why they go
// past a player before they ship.
//
// Run: node scripts/generateChords.mjs [suffix ...]
import { notePitchClass, shapeNotes } from '../src/utils/notes.js';
import { UKULELE_CHORDS } from '../src/data/ukuleleChords.js';

const TUNING = ['G', 'C', 'E', 'A'];
// Weights chosen by CALIBRATION, not by taste: swept against the 170 shipped
// ukulele shapes these families could be checked against, and this is the
// setting where the top pick agreed most often. Position is worth more than
// fingers, which is the opposite of the first guess and is what a ukulele
// actually rewards. Re-run `--calibrate` after changing them.
const W = { f: +(process.env.WF || 40), s: +(process.env.WS || 25), h: +(process.env.WH || 30) };
const MAX_FRET = 9;

// Intervals above the root. `need` are the notes without which the chord is not
// itself; the 5th is droppable, the thing in the name is not.
//
// WHETHER THE ROOT IS REQUIRED is a judgement per family, not a rule. A 7b9 has
// five notes and four strings, and every source that voices it on a ukulele —
// including the baritone shapes already shipped here — drops the root: the 3rd,
// the b7 and the b9 are what make the sound. The others fit without dropping it,
// and a library shape that does not contain its own root is confusing to look up
// when you are learning the chord.
const SPEC = {
  '7b9': { notes: [0, 1, 4, 7, 10], need: [1, 4, 10],    type: 'dom7' },
  '7#5': { notes: [0, 4, 8, 10],    need: [0, 4, 8, 10], type: 'dom7' },
  'm6':  { notes: [0, 3, 7, 9],     need: [0, 3, 9],     type: '6th'  },
  'add9':{ notes: [0, 2, 4, 7],     need: [0, 2, 4],     type: 'major'},
};

// The roots the library already uses, in its own order and spelling.
const ROOTS = UKULELE_CHORDS.filter(c => c.type === 'major').map(c => c.name);

const open = TUNING.map(notePitchClass);

// How hard is this to hold, and is it worth holding?
//
// Fewer fingers first — a barre is one finger, not three — then a short stretch,
// then NEAR THE NUT, which is weighted heavily on purpose. A first attempt
// weighted position lightly and picked an 8th-fret two-finger shape for D7b9
// over a 2nd-fret one, because it counted only the hand and not where the hand
// has to go. On a ukulele that is the wrong trade almost every time.
//
// Thin voicings are penalised too. The same two notes barred high up can satisfy
// every rule above and still not sound like the chord: four different notes beat
// three, and three beat two.
function cost(frets, pcs) {
  const stopped = frets.filter(f => f > 0);
  const distinct = new Set(pcs).size;
  const thin = (4 - distinct) * 60;
  if (!stopped.length) return { fingers: 0, span: 0, high: 0, distinct, score: thin };
  const low = Math.min(...stopped), high = Math.max(...stopped);
  const atLow = stopped.filter(f => f === low).length;
  const fingers = stopped.length - (atLow > 1 ? atLow - 1 : 0);   // one finger bars the lowest fret
  const span = high - low;
  return { fingers, span, high, distinct, score: fingers * W.f + span * W.s + high * W.h + thin };
}

function shapesFor(rootName, suffix) {
  const spec = SPEC[suffix];
  const root = notePitchClass(rootName);
  const allowed = new Set(spec.notes.map(i => (root + i) % 12));
  const need = spec.need.map(i => (root + i) % 12);
  const out = [];
  // Every string sounds: ukulele chords are strummed across all four, and no
  // shipped ukulele shape mutes a string.
  for (let a = 0; a <= MAX_FRET; a++)
    for (let b = 0; b <= MAX_FRET; b++)
      for (let c = 0; c <= MAX_FRET; c++)
        for (let d = 0; d <= MAX_FRET; d++) {
          const frets = [a, b, c, d];
          const pcs = frets.map((f, i) => (open[i] + f) % 12);
          if (pcs.some(p => !allowed.has(p))) continue;
          if (need.some(p => !pcs.includes(p))) continue;
          const k = cost(frets, pcs);
          if (k.fingers > 4 || k.span > 4) continue;
          // A tiny nudge toward the root in the bass, which is what makes a
          // shape sound like the chord it is named after rather than its cousin.
          const bass = pcs[0] === root ? -25 : 0;
          out.push({ frets, ...k, score: k.score + bass });
        }
  out.sort((x, y) => x.score - y.score || x.high - y.high);
  return out;
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SPEC);
const rows = [];
for (const suffix of wanted) {
  if (!SPEC[suffix]) { console.log(`unknown suffix ${suffix}`); continue; }
  for (const r of ROOTS) {
    const best = shapesFor(r, suffix)[0];
    if (!best) { console.log(`  NO SHAPE  ${r}${suffix}`); continue; }
    rows.push({ name: `${r}${suffix}`, type: SPEC[suffix].type, frets: best.frets, best });
  }
}

console.log('// generated — every one of these still needs a hand on it');
for (const r of rows) {
  const notes = shapeNotes(r.frets, TUNING).join(' ');
  console.log(`  { name: '${r.name}',${' '.repeat(Math.max(0, 6 - r.name.length))} type: '${r.type}',${' '.repeat(Math.max(0, 7 - r.type.length))} frets: [${r.frets.join(', ')}] },`
    + `  // ${notes}${r.best.fingers <= 2 ? '' : `  (${r.best.fingers} fingers)`}`);
}
console.log(`\n${rows.length} shapes`);

// ---- Calibration ------------------------------------------------------------
//
// Does the ranking agree with shapes that are already known good? The library
// ships 221 ukulele chords that players have used for years; generating the
// families it ALREADY has and comparing the top pick against the shipped one is
// the only honest way to find out whether this script's taste can be trusted for
// the families it does not have.
//
// Run: node scripts/generateChords.mjs --calibrate
if (process.argv.includes('--calibrate')) {
  const KNOWN = {
    '':     { notes: [0, 4, 7],      need: [0, 4] },
    'm':    { notes: [0, 3, 7],      need: [0, 3] },
    '7':    { notes: [0, 4, 7, 10],  need: [4, 10] },
    'm7':   { notes: [0, 3, 7, 10],  need: [3, 10] },
    'maj7': { notes: [0, 4, 7, 11],  need: [4, 11] },
    '6':    { notes: [0, 4, 7, 9],   need: [4, 9] },
    'm7b5': { notes: [0, 3, 6, 10],  need: [3, 6, 10] },
    'sus4': { notes: [0, 5, 7],      need: [0, 5] },
    'sus2': { notes: [0, 2, 7],      need: [0, 2] },
    'aug':  { notes: [0, 4, 8],      need: [0, 4, 8] },
  };
  let same = 0, close = 0, off = 0;
  const misses = [];
  for (const [suffix, spec] of Object.entries(KNOWN)) {
    SPEC[suffix] = { ...spec, type: 'x' };
    for (const c of UKULELE_CHORDS) {
      const want = c.name.replace(/^[A-G][b#]?/, '');
      if (want !== suffix) continue;
      const root = c.name.slice(0, c.name.length - suffix.length);
      const ranked = shapesFor(root, suffix);
      const mine = ranked[0];
      if (!mine) { off++; misses.push(`${c.name}: nothing generated`); continue; }
      const key = (f) => f.join(',');
      if (key(mine.frets) === key(c.frets)) same++;
      else if (ranked.slice(0, 5).some(r => key(r.frets) === key(c.frets))) close++;
      else { off++; misses.push(`${c.name.padEnd(6)} shipped [${c.frets.join(' ')}]  top pick [${mine.frets.join(' ')}]`); }
    }
  }
  const total = same + close + off;
  console.log(`\ncalibration against ${total} shipped ukulele shapes`);
  console.log(`  ${same} exact match · ${close} in the top 5 · ${off} not in the top 5`);
  if (misses.length) console.log('\n' + misses.slice(0, 20).join('\n'));
}
