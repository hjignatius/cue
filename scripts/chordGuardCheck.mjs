// The check that stops an AI rewrite from losing a chord.
//
// Clean up formatting, on Howard's Frosty the Snowman, now and then dropped the
// [C] that opens the first line while clearing the empty "{c: }" lines around
// it. The fix has two halves, and both are tested here: the empty directives
// are taken out before the model sees the chart, and a reply whose chords are
// not the chart's chords is refused, with the chord and its words named.
//
// Run: node scripts/chordGuardCheck.mjs
import { chordSequence, chordChange, stripEmptyDirectives } from '../src/utils/chordGuard.js';
import { convertToOver } from '../src/utils/chordStyle.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

// As it stood in the editor when Clean up was pressed.
const FROSTY = [
  '{c: }   ',
  '[C] Frosty the Snowman was a [F] jolly, [G7] happy [C] soul,  ',
  'With a [F] corncob pipe and a [C] button nose  ',
  'And two [G7] eyes made out of [C] coal.  ',
  '{c: }   ',
  '',
  'There [F] must have been some [Em] magic in that  ',
  '[Dm] Old silk [G7] hat they [C] found,  ',
  '{c: }',
  '',
  'He [Am] heard them [D7] holler [G] " Stop!"',
].join('\n');

// What came back on a bad run: tidied, and the opening [C] gone.
const BAD = [
  'Frosty the Snowman was a [F] jolly, [G7] happy [C] soul,',
  'With a [F] corncob pipe and a [C] button nose',
  'And two [G7] eyes made out of [C] coal.',
  '',
  'There [F] must have been some [Em] magic in that',
  '[Dm] Old silk [G7] hat they [C] found,',
  '',
  'He [Am] heard them [D7] holler [G] " Stop!"',
].join('\n');
const GOOD = BAD.replace(/^Frosty/, '[C] Frosty');

// ---- 1. the chords, in order -------------------------------------------------
check('Frosty: every chord, in order', chordSequence(FROSTY),
  ['C', 'F', 'G7', 'C', 'F', 'C', 'G7', 'C', 'F', 'Em', 'Dm', 'G7', 'C', 'Am', 'D7', 'G']);
check('over-lyrics reads the same chords', chordSequence(convertToOver(FROSTY)), chordSequence(FROSTY));

// ---- 2. a good reply passes, a bad one is caught ------------------------------
check('good reply: no change', chordChange(FROSTY, GOOD), null);
check('reformatted to over-lyrics: no change', chordChange(FROSTY, convertToOver(GOOD)), null);
check('the lost opening [C] is named as dropped, with its words',
  chordChange(FROSTY, BAD), { was: 'C', now: null, words: 'Frosty the Snowman was' });
check('a chord dropped mid-song',
  chordChange(FROSTY, GOOD.replace('[Em] magic', 'magic')), { was: 'Em', now: null, words: 'magic in that' });
check('a chord respelled',
  chordChange(FROSTY, GOOD.replace('[G7] eyes', '[G] eyes')), { was: 'G7', now: 'G', words: 'eyes made out of' });
check('a chord added',
  chordChange(FROSTY, GOOD.replace('Old silk', 'Old [C]silk')), { was: null, now: 'C', words: 'silk' });
check('a chord on no words', chordChange('[G] [C]', '[G]'), { was: 'C', now: null, words: '' });
check('website clutter removed: no change',
  chordChange(`Tabs by somebody\n★★★★☆ 1,204 views\n${GOOD}`, GOOD), null);
check('section labels added: no change',
  chordChange(GOOD, `# Verse 1\n${GOOD.replace('\n\nThere', '\n\n# Bridge\nThere')}`), null);

// ---- 3. empty directives come out before the model sees the chart -------------
const stripped = stripEmptyDirectives(FROSTY);
check('no "{c: }" left', /\{c:/.test(stripped), false);
check('and nothing else touched', stripped.split('\n').length, FROSTY.split('\n').length - 3);
check('chords all still there', chordSequence(stripped), chordSequence(FROSTY));
check('the opening [C] line is intact', stripped.split('\n')[0], FROSTY.split('\n')[1]);
check('long and Windows forms', stripEmptyDirectives('{comment:}\r\n[G]a\r\n  {soc:  }  '), '[G]a\r');
check('a directive with a value stays', stripEmptyDirectives('{c: Chorus}\n[G]a'), '{c: Chorus}\n[G]a');
check('colour styling is not a directive', stripEmptyDirectives('{c=#e11d48}Chorus{/c}'), '{c=#e11d48}Chorus{/c}');
check('nothing to strip: the very same text', stripEmptyDirectives('[G]a\n\n[C]b'), '[G]a\n\n[C]b');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
