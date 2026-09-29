// What survives the filter between the model and a chord diagram.
//
// The model is asked for playable, distinct voicings; this checks what happens
// when it doesn't oblige. Every case below is a real way a model answer goes
// wrong, and each one must be dropped silently rather than drawn as a diagram
// somebody then tries to play.
//
// Run: node scripts/voicingsCheck.mjs
import { sanitizeVoicings, latestThought } from '../src/lib/ai.js';
import { notePitchClass } from '../src/utils/notes.js';

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};
const frets = (r) => r.map(x => x.frets);
const run = (arr, opts = {}) => sanitizeVoicings(arr, { name: 'Am', strings: 4, ...opts });

check('a clean answer passes through',
  frets(run([{ frets: [2, 0, 0, 0], label: 'open' }, { frets: [2, 4, 5, 3], label: 'barre at 3rd' }])),
  [[2, 0, 0, 0], [2, 4, 5, 3]]);

check('label is kept and trimmed',
  run([{ frets: [2, 0, 0, 0], label: '  open position  ' }])[0].label,
  'open position');

check('a missing label is empty, not undefined',
  run([{ frets: [2, 0, 0, 0] }])[0].label, '');

check('wrong string count is dropped',
  frets(run([{ frets: [2, 0, 0] }, { frets: [0, 0, 0, 0, 0, 0] }, { frets: [2, 0, 0, 0] }])),
  [[2, 0, 0, 0]]);

check('non-integer and out-of-range frets are dropped',
  frets(run([{ frets: [2, 0, 'x', 0] }, { frets: [2, 0, -2, 0] }, { frets: [2, 0, 99, 0] }, { frets: [2, 0, 0, 0] }])),
  [[2, 0, 0, 0]]);

check('an all-muted shape is not a voicing',
  frets(run([{ frets: [-1, -1, -1, -1] }])), []);

check('a stretch wider than four frets is dropped',
  frets(run([{ frets: [1, 3, 5, 7] }, { frets: [5, 5, 7, 8] }])),
  [[5, 5, 7, 8]]);

check('open and muted strings do not count toward the stretch',
  frets(run([{ frets: [0, 5, -1, 7] }])), [[0, 5, -1, 7]]);

check('a shape already in the library is dropped',
  frets(run([{ frets: [2, 0, 0, 0] }, { frets: [2, 4, 5, 3] }], { known: [[2, 0, 0, 0]] })),
  [[2, 4, 5, 3]]);

check('the same shape twice is listed once',
  frets(run([{ frets: [2, 4, 5, 3] }, { frets: [2, 4, 5, 3] }])),
  [[2, 4, 5, 3]]);

check('no more than four come back',
  run([{ frets: [2, 0, 0, 0] }, { frets: [2, 4, 5, 3] }, { frets: [7, 8, 9, 7] }, { frets: [5, 4, 3, 3] }, { frets: [9, 12, 12, 12] }]).length,
  4);

check('garbage in, empty out', run(null), []);
check('an object instead of an array', run({ frets: [2, 0, 0, 0] }), []);
check('rows that are not objects', frets(run(['Am', null, 7, { frets: [2, 0, 0, 0] }])), [[2, 0, 0, 0]]);

check('the name comes from the caller, never the model',
  run([{ frets: [2, 0, 0, 0], name: 'Bbmaj7' }])[0].name, 'Am');

// ---- Does the shape sound what the answer says it sounds? -------------------
//
// A model can name a chord's notes correctly and still hand back frets that do
// not produce them — and the frets are what gets drawn and played. The tuning
// plus the fret numbers is arithmetic, so the claim can be tested without this
// file knowing what any chord symbol means.
//
// The case that prompted it: Howard asked for E7#9 on a GCEA ukulele. The #9 of
// E is F##, which sounds as G — so the chord wants E G# B D G. The shape 1-2-0-2
// sounds G# D E B, which is a perfectly good E7 and contains no #9 at all.
const GCEA = ['G', 'C', 'E', 'A'];
const uke = (arr) => sanitizeVoicings(arr, { name: 'E7#9', strings: 4, tuning: GCEA });

// 'x' is the other way of writing a double sharp, so Fx is F## is G — while Gx
// is A. (I got that backwards writing this check, and the check caught it.)
check('pitch classes, with every accidental spelling',
  ['C', 'B#', 'Dbb', 'G#', 'Ab', 'F##', 'Fx', 'Gx', 'G', 'B♭', 'A♯'].map(notePitchClass),
  [0, 0, 0, 8, 8, 7, 7, 9, 7, 10, 10]);

check('not a note name', [notePitchClass('H'), notePitchClass(''), notePitchClass('G#m')], [null, null, null]);

check('frets matching their notes are kept',
  frets(uke([{ frets: [1, 2, 3, 2], notes: ['G#', 'D', 'G', 'B'] }])),
  [[1, 2, 3, 2]]);

check('the same notes spelled differently still match',
  frets(uke([{ frets: [1, 2, 3, 2], notes: ['Ab', 'D', 'F##', 'B'] }])),
  [[1, 2, 3, 2]]);

check('frets that do not sound the claimed notes are dropped',
  frets(uke([{ frets: [1, 2, 0, 2], notes: ['G#', 'D', 'G', 'B'] }])),   // claims the #9; sounds E
  []);

check('muted strings are skipped on both sides',
  frets(uke([{ frets: [-1, 2, 3, 2], notes: ['D', 'G', 'B'] }])),
  [[-1, 2, 3, 2]]);

check('a claim with the wrong number of notes is dropped',
  frets(uke([{ frets: [1, 2, 3, 2], notes: ['G#', 'D', 'G'] }])),
  []);

check('no claim means nothing to contradict',
  frets(uke([{ frets: [1, 2, 3, 2] }])),
  [[1, 2, 3, 2]]);

check('without a tuning the check is skipped entirely',
  frets(sanitizeVoicings([{ frets: [1, 2, 0, 2], notes: ['G#', 'D', 'G', 'B'] }], { name: 'E7#9', strings: 4 })),
  [[1, 2, 0, 2]]);

// ---- The caption under the bar ----------------------------------------------
//
// The model's summary arrives as a growing paragraph. Showing all of it under a
// progress bar would be a wall of text reflowing on every token, so the caption
// is the most recent complete sentence — what it is doing NOW.
check('the newest sentence wins',
  latestThought('E7#9 needs five notes. Four strings will not hold them all. Dropping the root.'),
  'Dropping the root.');
check('a single unfinished sentence still shows',
  latestThought('Working out where the #9 falls'), 'Working out where the #9 falls');
check('newlines and runs of spaces collapse',
  latestThought('Checking\n\n  the   fifth fret'), 'Checking the fifth fret');
check('nothing yet is empty, not undefined', [latestThought(''), latestThought(null)], ['', '']);
// The contract is a CEILING, not an exact width — asserting the exact number
// got this wrong when the code was right, for the fifth time this week.
check('a very long sentence is capped',
  latestThought('x'.repeat(200)).length <= 110, true);
check('and says it was cut',
  latestThought('y'.repeat(200)).endsWith('…'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
