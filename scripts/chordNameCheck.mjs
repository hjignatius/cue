// What counts as part of a chord's NAME, and what is decoration.
//
// Musicians write "F////" to say how many beats a chord gets. STRUM_SUFFIX
// already strips trailing decoration, but it deliberately keeps "/" — it has to,
// or F/A would lose its bass and every slash chord with it. So "F////" survived
// as a chord name: the panel labelled a tile with it, the slash-chord fallback
// reported dropping a "///" bass, and Add missing chord shapes sent it to the
// model as an undefined chord.
//
// The rule that separates them is that no real chord ENDS in a slash — a slash
// chord always names a bass after it.
//
// Run: node scripts/chordNameCheck.mjs
import { normalizeChordName, detectChords } from '../src/utils/chordDetect.js';
import { shapesForName } from '../src/utils/chordLookup.js';
import { convertToBrackets } from '../src/utils/chordStyle.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

// ---- Beat slashes are decoration
check('four beats', normalizeChordName('F////'), 'F');
check('two beats', normalizeChordName('F//'), 'F');
check('one beat', normalizeChordName('F/'), 'F');

// ---- A slash CHORD keeps its bass, which is the whole reason "/" survives STRUM_SUFFIX
check('a slash chord is untouched', normalizeChordName('F/A'), 'F/A');
check('and keeps an accidental bass', normalizeChordName('C/G#'), 'C/G#');
check('a slash chord with beats after it keeps the bass', normalizeChordName('C/G/'), 'C/G');

// ---- It composes with the other spellings rather than fighting them
check('beats plus an alteration', normalizeChordName('C7-5///'), 'C7b5');
check('beats plus parens', normalizeChordName('Am7(b5)//'), 'Am7b5');
check('nothing to do', normalizeChordName('F'), 'F');
check('empty in, empty out', normalizeChordName(''), '');

// ---- The library finds the chord, which is the point
const shape = (n) => {
  const s = shapesForName(normalizeChordName(n), 'ukulele_gcea', [], new Set());
  return s.length ? s[0].frets.join('-') : null;
};
check('F//// resolves to F in the library', shape('F////'), shape('F'));
check('and is not reported as an undefined chord', shape('F////') !== null, true);

// ---- The bass marker must be a NOTE, however the name arrived
{
  const s = shapesForName('F////', 'ukulele_gcea', [], new Set());
  check('an unnormalised F//// claims no bass', (s[0] || {}).droppedBass, undefined);
  const real = shapesForName('F/A', 'ukulele_gcea', [], new Set());
  check('while a real slash chord still reports its bass', (real[0] || {}).droppedBass, 'A');
}

// ---- All three places a musician writes it
const chords = (t) => detectChords(convertToBrackets(t)).map(normalizeChordName);
check('on a line of its own', chords('F////  C////  G////'), ['F', 'C', 'G']);
check('over lyrics', chords('F////            C////\nAmazing grace how sweet'), ['F', 'C']);
check('inline', chords('[F////]Amazing [C////]grace'), ['F', 'C']);
check('backslash beats, which STRUM_SUFFIX already handled', chords('F\\\\  C\\\\'), ['F', 'C']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
