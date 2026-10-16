// The capo.
//
// A capo changes what you FINGER, not what you sound. A song in D with a capo
// on 2 is fingered in C and still sounds in D — so the song's key stays D, and
// only the chords DRAWN come down, one semitone per fret.
//
// That is the whole difference from Transpose, which changes what you sound.
// These two must never be confused, because confusing them puts a chart on
// stage in a key the band is not playing in.
//
// Run: node scripts/capoCheck.mjs

import { capoFrets, displaySemitones, MAX_CAPO, transposeChord, semitonesBetween } from '../src/utils/transpose.js';
import { sanitizeMetadata } from '../src/utils/songMetadata.js';
import { contentHash } from '../src/utils/contentHash.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- 1. Howard's example ---------------------------------------------------
// "a song in the key of D would be C if the capo was added to the second fret"
const d2 = { key: 'D', capo: '2' };
check('D with a capo on 2 is fingered in C', transposeChord('D', displaySemitones(d2, ''), false), 'C');
check('...and every other chord comes down with it',
  ['D', 'G', 'A', 'Bm'].map(c => transposeChord(c, displaySemitones(d2, ''), false)),
  ['C', 'F', 'G', 'Am']);
check('the shift is one semitone per fret', displaySemitones(d2, ''), -2);
// The song is still in D. Nothing about the capo touches the key.
check('the key itself is untouched', d2.key, 'D');

// ---- 2. every fret ---------------------------------------------------------
for (let fret = 1; fret <= MAX_CAPO; fret++) {
  check(`capo ${fret} shifts by -${fret}`, displaySemitones({ key: 'C', capo: String(fret) }, ''), -fret);
}
check('no capo shifts nothing', displaySemitones({ key: 'C' }, ''), 0);
check('capo 0 is no capo', capoFrets({ capo: 0 }), 0);
check('a capo past the neck is no capo', capoFrets({ capo: 13 }), 0);
check('a negative capo is no capo', capoFrets({ capo: -2 }), 0);
check('nonsense is no capo', [capoFrets({ capo: 'yes' }), capoFrets({}), capoFrets(null)], [0, 0, 0]);
check('a number is as good as a string', capoFrets({ capo: 3 }), 3);

// ---- 3. stacking with Transpose -------------------------------------------
// Transpose changes what you SOUND; the capo changes what you FINGER. Both move
// the drawn chords, so they add — and the order does not matter.
const dToE = { key: 'D', capo: '2' };
check('View Key E, capo 2: play D shapes', transposeChord('D', displaySemitones(dToE, 'E'), false), 'D');
check('the two shifts add', displaySemitones(dToE, 'E'), semitonesBetween('D', 'E') - 2);
check('View Key alone is unaffected by a capo of none', displaySemitones({ key: 'D' }, 'E'), 2);
// A capo big enough to cross an octave still lands on a real chord.
check('capo 12 is an octave down, same letter', transposeChord('G', displaySemitones({ key: 'G', capo: '12' }, ''), false), 'G');

// ---- 4. the metadata gate --------------------------------------------------
check('a real fret survives', sanitizeMetadata({ capo: '3' }).capo, '3');
check('a number is normalised to a string', sanitizeMetadata({ capo: 3 }).capo, '3');
check('fret 13 is cleared', sanitizeMetadata({ capo: '13' }).capo, '');
check('a duration in the capo field is cleared', sanitizeMetadata({ capo: '2:24' }).capo, '');
check('prose is cleared', sanitizeMetadata({ capo: 'second fret' }).capo, '');
check('no capo is left alone', sanitizeMetadata({ capo: '' }), { capo: '' });
check('a clean song is still returned unchanged', (() => {
  const m = { key: 'D', capo: '2' };
  return sanitizeMetadata(m) === m;
})(), true);

// ---- 5. it counts as a change ----------------------------------------------
// Otherwise a capo added on one device would never reach a shared set.
const plain = { metadata: { title: 'X', key: 'D' }, text: 'C  Am\nwords' };
const capoed = { ...plain, metadata: { ...plain.metadata, capo: '2' } };
check('adding a capo changes the content hash', contentHash(plain) === contentHash(capoed), false);
check('the same capo twice hashes the same', contentHash(capoed), contentHash({ ...capoed, metadata: { ...capoed.metadata } }));


// ---- 6. reading a capo off a pasted chart ---------------------------------
//
// From Howard's America The Beautiful paste, where the capo is prose on the end
// of a link line rather than a directive. No model is needed for this: the word
// "capo" followed by a number is not a judgement call.
const { readChartMetadata } = await import('../src/utils/readChart.js');

const AMERICA = [
  '{t:America The Beautiful}',
  '{artist:Various}',
  '{key: G}',
  '<a title="YouTube Video" href="https://www.youtube.com/watch?v=iFtM8iHC_UM" target="_blank">https://www.youtube.com/watch?v=iFtM8iHC_UM</a> Bb so capo 3',
  '{c:The Youtube is the original lyrics - this is the more modern one}',
].join('\n');

const read = readChartMetadata(AMERICA);
check('the capo is read out of the prose', read.fields.capo, '3');
check('and the rest still comes through', [read.fields.title, read.fields.artist, read.fields.key], ['America The Beautiful', 'Various', 'G']);
// The line carries a note worth keeping, so it is NOT offered for removal.
check('a line that is more than a link is kept', read.remove.some(l => l.includes('<a ')), false);

// Both spellings, and the shapes charts actually use.
for (const [line, want] of [
  ['{capo: 3}', '3'],
  ['Capo 2', '2'],
  ['capo: 5', '5'],
  ['Capo on 4', '4'],
  ['CAPO 7th fret', '7'],
  ['Bb so capo 3', '3'],
  ['play with capo 1', '1'],
]) check(`read: ${JSON.stringify(line)}`, readChartMetadata(line).fields.capo, want);

// The word has to be there, and the fret has to be on the neck.
for (const line of ['3', 'fret 3', 'capotasto', 'capo', 'capo 0', 'capo 13', 'Capo: none']) {
  check(`not a capo: ${JSON.stringify(line)}`, readChartMetadata(line).fields.capo, undefined);
}
// A directive wins over prose later in the song, and the first one wins.
check('the directive is taken first', readChartMetadata('{capo: 2}\ncapo 9').fields.capo, '2');
check('a {capo:} line is offered for removal', readChartMetadata('{capo: 2}').remove, ['{capo: 2}']);


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
