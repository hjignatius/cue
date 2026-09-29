// What "easier" is allowed to mean.
//
// Every case here is one the engine got WRONG on an earlier run, kept so it
// cannot get it wrong again. They are all the same mistake in different clothes:
// a substitute that contains no forbidden note can still be a different chord.
//
// Run: node scripts/simplifyCheck.mjs
import { easierChords, shapeDifficulty, swapChords } from '../src/utils/simplify.js';

let pass = 0, fail = 0;
const opts = { custom: [], hidden: new Set() };
const optionsFor = (name) => {
  const row = easierChords([name], opts).find(r => r.name === name);
  return row ? row.options : [];
};
const check = (label, ok, detail) => {
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`); }
};
const offers = (name, sub) => optionsFor(name).some(o => o.name === sub);
const kindOf = (name, sub) => (optionsFor(name).find(o => o.name === sub) || {}).kind;

// ---- What it must offer: Howard's own substitutions from Still Got The Blues
for (const [from, to] of [['E', 'E7'], ['Em', 'Em7'], ['Esus4', 'E7sus4'], ['Fmaj7', 'F'], ['Dm7/G', 'G7']]) {
  check(`offers ${from} -> ${to}`, offers(from, to),
    `got: ${optionsFor(from).map(o => o.name).join(', ') || 'nothing'}`);
}

// ---- What it must never offer
const forbidden = [
  ['E7#9', 'Em7',   'drops the major 3rd — a dominant is not a minor chord'],
  ['Dm7',  'D',     'flips minor to major'],
  ['Cmaj7','C6',    'trades the major 7th for a 6th while adding a note'],
  ['E',    'Eaug',  'replaces the 5th with a #5'],
  ['Bm7b5','Bm7',   'loses the flat 5 that names the chord'],
  ['Am',   'C',     'a different chord entirely'],
];
for (const [from, to, why] of forbidden) {
  check(`never offers ${from} -> ${to} (${why})`, !offers(from, to));
}

// ---- Safe vs judgement is the honesty of the whole feature
check('Fmaj7 -> F is safe (loses the 7th, adds nothing)', kindOf('Fmaj7', 'F') === 'safe', String(kindOf('Fmaj7', 'F')));
check('E -> E7 is a judgement (adds the D)', kindOf('E', 'E7') === 'judgement', String(kindOf('E', 'E7')));
check('Dm7/G -> G7 is a judgement (re-reads the chord from its bass)', kindOf('Dm7/G', 'G7') === 'judgement', String(kindOf('Dm7/G', 'G7')));
check('Dm7/G -> Dm is safe (the bass is all that goes)', kindOf('Dm7/G', 'Dm') === 'safe', String(kindOf('Dm7/G', 'Dm')));

// ---- Every option must actually be easier, which is the entire point
{
  const rows = easierChords(['Dm7', 'Dm7/G', 'Cmaj7', 'Fmaj7', 'Bm7b5', 'E', 'Am', 'Am/B', 'Esus4', 'Em', 'D9', 'F9', 'E7#9', 'Bm7', 'Em7'], opts);
  const worse = rows.flatMap(r => r.options.filter(o => r.current && o.cost >= r.current.cost).map(o => `${r.name} -> ${o.name}`));
  check('no option is harder than what it replaces', worse.length === 0, worse.join(', '));
  check('the hardest chord is listed first', rows[0]?.name === 'Esus4', rows.map(r => r.name).join(' '));
}

// ---- Difficulty: an open shape costs nothing, a barre up the neck costs most
check('open shapes are free', shapeDifficulty([0, 0, 0, 0]) === 0);
check('a low shape beats the same shape higher up',
  shapeDifficulty([1, 2, 0, 2]) < shapeDifficulty([6, 7, 5, 7]));
check('an unreadable symbol gets no opinion', easierChords(['N.C.'], opts).length === 0);

// ---- Swapping the text -------------------------------------------------------
//
// A chord name is a whole token, and in over-lyrics its COLUMN is the syllable it
// is sung on — so a substitute of a different length must not drag the rest of
// the line onto the wrong words.
{
  const eq = (label, got, want) => check(label, got === want, `got  ${JSON.stringify(got)}\nwant ${JSON.stringify(want)}`);

  eq('E does not eat Em, E7#9 or the word Easy',
    swapChords('Easy  Am  Em  E  E7#9', [['E', 'E7']]),
    'Easy  Am  Em  E7  E7#9');

  eq('Am does not eat Am/B',
    swapChords('Am   Am/B', [['Am', 'Am7']]),
    'Am7  Am/B');

  // Asserted as a PROPERTY, not as a literal string. Typing the expected spaces
  // by hand got this wrong when the code was right — on a chord line the columns
  // are the contract, and the spaces between them are just what is left over.
  {
    const src = 'Am  Am/B  Am/C';
    const out = swapChords(src, [['Am', 'Am7'], ['Am/B', 'Am7'], ['Am/C', 'Am7']]);
    const cols = (t) => [...t.matchAll(/\\S+/g)].map(m => m.index);
    check('longest first, so Am/B is not left as Am7/B',
      [...out.matchAll(/\\S+/g)].every(m => m[0] === 'Am7'), out);
    check('and every chord stays in its column',
      cols(out).join(',') === cols(src).join(','), `${cols(src)} -> ${cols(out)}`);
  }

  eq('bracketed chords swap in place',
    swapChords('[Dm7]Used to be so [Dm7/G]easy', [['Dm7/G', 'G7']]),
    '[Dm7]Used to be so [G7]easy');

  // The one that matters: a longer name must not shift what follows it.
  const before = 'Bm7b5                E                   Am';
  const after  = swapChords(before, [['E', 'E7']]);
  check('a longer chord keeps the chords after it in their columns',
    after.indexOf('Am') === before.indexOf('Am'),
    `Am moved from ${before.indexOf('Am')} to ${after.indexOf('Am')}\n${after}`);

  eq('nothing picked, nothing changed', swapChords('Am Em', []), 'Am Em');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
