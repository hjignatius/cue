// A chord must never be inserted INSIDE a styling marker.
//
// Markers — {c=#2563eb}, {/c}, {b}, {/b} — occupy columns in the text but render
// as nothing, so a chord aligned to the visible words can land in the middle of
// one. Split, a marker stops being a marker: its characters print, and the style
// it was closing stays open to the end of the line.
//
// Howard hit this on a coloured chorus: the last chord of each line fell inside
// the closing marker, so "{/c}" showed in the Preview and the colour never
// closed. Converting over-lyrics to brackets now snaps past a marker rather than
// through it.
//
// Run: node scripts/markerChordCheck.mjs

import { convertToBrackets } from '../src/utils/chordStyle.js';
import { parseChordPro, styleSegments } from '../src/utils/chordPro.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// Does any marker character survive into something the Preview would print?
function printsMarkers(over) {
  for (const line of parseChordPro(convertToBrackets(over))) {
    for (const seg of styleSegments(line.segments || [])) {
      for (const run of seg.styledRuns || []) {
        if (/[{}]/.test(run.text)) return true;
      }
    }
  }
  return false;
}
// Every marker still whole in the converted text?
const intact = (over) => !/\{[^{}]*\[[^\]]*\][^{}]*\}/.test(convertToBrackets(over));

// ---- 1. the shape that broke -----------------------------------------------
// A chord column landing inside the CLOSING marker at the end of the line.
const closing = [
  '                    G    D      C      C',
  '{c=#2563eb}aaaaaaa  bbb-ccccc  ddddddd{/c}',
].join('\n');
check('nothing of the marker prints', printsMarkers(closing), false);
check('the marker survives whole', intact(closing), true);
check('every chord is still there', (convertToBrackets(closing).match(/\[[^\]]+\]/g) || []).length, 4);

// ---- 2. the opening marker, same hazard -----------------------------------
// A chord at a low column falls inside "{c=#2563eb}" itself.
const opening = ['   G', '{c=#2563eb}aaaa bbbb'].join('\n');
check('nothing prints', printsMarkers(opening), false);
check('the opening marker survives', intact(opening), true);
// It lands at the first syllable, which is where the words start.
check('the chord goes just past it', convertToBrackets(opening), '{c=#2563eb}[G]aaaa bbbb');

// ---- 3. bold is the other splittable marker -------------------------------
// The vocabulary is **bold**, *italic* and {c=…}…{/c}. A single '*' is one
// character wide so nothing can land inside it; '**' can be split in half.
// Column 1 is BETWEEN the two asterisks — the only place a chord can split them.
const inBold = [' G', '**aaaa bbbb**'].join('\n');
check('** is not split', /\*\[[^\]]*\]\*/.test(convertToBrackets(inBold)), false);
check('the chord snaps past it, to the first syllable', convertToBrackets(inBold), '**[G]aaaa bbbb**');
// And a chord aimed INTO the words is left exactly where it was aimed.
const inWords = ['    G', '**aaaa bbbb**'].join('\n');
check('a chord inside the words does not move', convertToBrackets(inWords), '**aa[G]aa bbbb**');

for (const [open, close] of [['{c=#ff0000}', '{/c}'], ['{c=#2563eb}', '{/c}']]) {
  const over = ['              G   C', `${open}aaaa bbbb cccc${close}`].join('\n');
  check(`whole: ${open}…${close}`, intact(over), true);
  check(`silent: ${open}…${close}`, printsMarkers(over), false);
}

// ---- 4. chords clear of any marker are untouched --------------------------
// The fix must not move a chord that was never in trouble.
const clear = ['G       C', 'aaaa    bbbb'].join('\n');
check('an unstyled line is unchanged', convertToBrackets(clear), '[G]aaaa    [C]bbbb');
const styledClear = ['           G      C', '{c=#2563eb}aaaa   bbbb{/c}'].join('\n');
check('a styled line keeps its chord columns', convertToBrackets(styledClear), '{c=#2563eb}[G]aaaa   [C]bbbb{/c}');

// ---- 5. several markers on one line ---------------------------------------
const many = ['              G        C', '**aaaa** bbb {c=#ff0000}cccc{/c}'].join('\n');
check('all of them survive', intact(many), true);
check('none of them print', printsMarkers(many), false);

// ---- 6. a brace that is not a marker is not treated as one ----------------
// A lone brace in a lyric has no closing partner, so there is no span to snap
// out of and the chord lands where it was aimed.
const lone = ['     G', 'aa { bb cc'].join('\n');
check('a lone brace does not swallow a chord', convertToBrackets(lone), 'aa { [G]bb cc');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
