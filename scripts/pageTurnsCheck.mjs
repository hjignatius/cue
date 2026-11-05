// Quarter turns for single pages of a PDF song.
//
// Each tap moves one page on a quarter, a fourth tap leaves it as if never
// turned, and stored junk reads as no turn. The song hash has to stay put for
// every song that has no page turns, or copies of them would all read as edited.
//
// Run: node scripts/pageTurnsCheck.mjs

import { pageTurn, nextPageTurns, cleanPageTurns, hasPageTurns } from '../src/utils/pageTurns.js';
import { contentSig, contentDiffFields } from '../src/utils/contentHash.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- 1. reading a page's turn ----------------------------------------------
check('a turned page', pageTurn({ 2: 90 }, 2), 90);
check('a page with no turn', pageTurn({ 2: 90 }, 1), 0);
check('a JSON string key finds its page', pageTurn(JSON.parse('{"2":270}'), 2), 270);
for (const none of [undefined, null, {}]) check(`no turns: ${JSON.stringify(none)}`, pageTurn(none, 1), 0);
for (const junk of [45, 360, -90, '90', null]) check(`junk turn: ${JSON.stringify(junk)}`, pageTurn({ 1: junk }, 1), 0);

// ---- 2. a tap ---------------------------------------------------------------
let t = {};
t = nextPageTurns(t, 3); check('one tap', t, { 3: 90 });
t = nextPageTurns(t, 3); check('two taps', t, { 3: 180 });
t = nextPageTurns(t, 3); check('three taps', t, { 3: 270 });
t = nextPageTurns(t, 3); check('four taps: as if never turned', t, {});
check('other pages stay put', nextPageTurns({ 1: 90 }, 2), { 1: 90, 2: 90 });
const before = { 1: 90 };
nextPageTurns(before, 1);
check('a tap makes a new object (React sees it)', before, { 1: 90 });
check('a tap from nothing stored', nextPageTurns(undefined, 1), { 1: 90 });

// ---- 3. tidying what's stored ----------------------------------------------
check('junk is dropped', cleanPageTurns({ 1: 90, 2: 45, x: 90, 0: 90, '-1': 90 }), { 1: 90 });
check('nothing stored', cleanPageTurns(undefined), {});
check('has turns', hasPageTurns({ 1: 90 }), true);
check('has none', hasPageTurns({}), false);
check('only junk is none', hasPageTurns({ 1: 45 }), false);

// ---- 4. the song hash ------------------------------------------------------
const song = { text: '', metadata: { title: 'T' }, type: 'pdf' };
check('no page turns: hash unchanged', contentSig({ ...song, pdfPageTurns: {} }), contentSig(song));
check('junk turns: hash unchanged', contentSig({ ...song, pdfPageTurns: { 1: 45 } }), contentSig(song));
check('a page turn changes it', contentSig({ ...song, pdfPageTurns: { 1: 90 } }) !== contentSig(song), true);
check('the order they were tapped in does not',
  contentSig({ ...song, pdfPageTurns: { 3: 90, 1: 90 } }), contentSig({ ...song, pdfPageTurns: { 1: 90, 3: 90 } }));
check('it reads as a change to the song',
  contentDiffFields(song, { ...song, pdfPageTurns: { 2: 90 } }), ['which way up the PDF is']);
check('no change when neither has any', contentDiffFields(song, { ...song, pdfPageTurns: {} }), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
