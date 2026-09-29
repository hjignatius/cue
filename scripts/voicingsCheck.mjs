// What survives the filter between the model and a chord diagram.
//
// The model is asked for playable, distinct voicings; this checks what happens
// when it doesn't oblige. Every case below is a real way a model answer goes
// wrong, and each one must be dropped silently rather than drawn as a diagram
// somebody then tries to play.
//
// Run: node scripts/voicingsCheck.mjs
import { sanitizeVoicings } from '../src/lib/ai.js';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
