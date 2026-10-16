// Removing the header a pasted song arrives with.
//
// The rule these pin: the model proposes lines by their TEXT, Cue finds them
// itself, and anything it cannot find — or that looks like part of the chart —
// is refused rather than guessed at. A wrong field costs a tap; a deleted lyric
// line is gone.
//
// Run: node scripts/liftLinesCheck.mjs

import { planLineRemoval, applyLineRemoval, REFUSED } from '../src/utils/liftLines.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

const PASTED = [
  "Octopus's Garden",
  'The Beatles',
  'https://www.youtube.com/watch?v=De1LCQvbqV4',
  '',
  'C                Am',
  " I'd like to be…  under the sea",
  '',
  '      F                      G',
  "In an octopus' garden in the shade",
].join('\n');

// ---- 1. the ordinary case --------------------------------------------------
let plan = planLineRemoval(PASTED, ["Octopus's Garden", 'The Beatles', 'https://www.youtube.com/watch?v=De1LCQvbqV4']);
check('all three header lines are found', plan.remove.map(r => r.index), [0, 1, 2]);
check('nothing is refused', plan.refused, []);
check('the chart is what is left', applyLineRemoval(PASTED, plan.remove.map(r => r.index)),
  ['C                Am', " I'd like to be…  under the sea", '', '      F                      G', "In an octopus' garden in the shade"].join('\n'));

// ---- 2. the guard: musical lines are never removed -------------------------
plan = planLineRemoval(PASTED, ['C                Am', '      F                      G']);
check('a chord line is refused', plan.remove, []);
check('...and says why', plan.refused.map(r => r.why), [REFUSED.chords, REFUSED.chords]);

const INLINE = "It's [D] easy [Am6]\nTabs by someone";
plan = planLineRemoval(INLINE, ["It's [D] easy [Am6]", 'Tabs by someone']);
check('a bracketed chart line is refused', plan.remove.map(r => r.line), ['Tabs by someone']);
check('...for the right reason', plan.refused.map(r => r.why), [REFUSED.chords]);

// ---- 3. a line the model invented is refused, not guessed at ---------------
plan = planLineRemoval(PASTED, ['The Beatles', 'Produced by George Martin']);
check('only the real line is taken', plan.remove.map(r => r.line), ['The Beatles']);
check('the invented one is reported', plan.refused, [{ line: 'Produced by George Martin', why: REFUSED.notFound }]);

// Leading whitespace in the song is not something a model echoes back reliably.
plan = planLineRemoval('   The Beatles\nC  Am\nwords', ['The Beatles']);
check('matching ignores indentation', plan.remove.map(r => r.index), [0]);

// ---- 4. a repeated line consumes one copy per proposal ---------------------
const TWICE = 'Chorus\nC  Am\nwords\nChorus\nC  Am\nwords';
plan = planLineRemoval(TWICE, ['Chorus']);
check('one proposal removes one copy', plan.remove.map(r => r.index), [0]);
plan = planLineRemoval(TWICE, ['Chorus', 'Chorus']);
check('two proposals remove both', plan.remove.map(r => r.index), [0, 3]);

// ---- 5. results come back in song order, not proposal order ---------------
plan = planLineRemoval(PASTED, ['https://www.youtube.com/watch?v=De1LCQvbqV4', "Octopus's Garden"]);
check('ordered by where they sit', plan.remove.map(r => r.index), [0, 2]);

// ---- 6. junk proposals ----------------------------------------------------
check('an empty proposal list removes nothing', planLineRemoval(PASTED, []).remove, []);
check('a missing proposal list is fine', planLineRemoval(PASTED).remove, []);
check('a blank string is refused', planLineRemoval(PASTED, ['   ']).refused, [{ line: '   ', why: REFUSED.blank }]);
check('null entries are refused', planLineRemoval(PASTED, [null]).refused, [{ line: '', why: REFUSED.blank }]);
check('no text at all', planLineRemoval('', ['x']).refused.map(r => r.why), [REFUSED.notFound]);

// ---- 7. what the removal leaves behind ------------------------------------
check('removing nothing returns the text unchanged', applyLineRemoval(PASTED, []), PASTED);
check('leading blanks are stripped', applyLineRemoval('title\n\n\nC  Am\nwords', [0]), 'C  Am\nwords');
// Blank lines inside the song are NOT tidied — they separate sections, and this
// tool was invoked to lift a header, not to reformat a chart.
check('blank runs inside the song are left alone', applyLineRemoval('C  Am\nwords\n\n\n\nF  G\nmore', [0]), 'words\n\n\n\nF  G\nmore');
check('a single blank between verses survives', applyLineRemoval('title\nC  Am\nwords\n\nF  G\nmore', [0]), 'C  Am\nwords\n\nF  G\nmore');
check('trailing whitespace is left alone', applyLineRemoval('C  Am\nwords\n\n', []), 'C  Am\nwords\n\n');

// ---- 8. end to end, as the tool will run it -------------------------------
plan = planLineRemoval(PASTED, ["Octopus's Garden", 'The Beatles', 'https://www.youtube.com/watch?v=De1LCQvbqV4', 'C                Am']);
check('three taken, one refused', [plan.remove.length, plan.refused.length], [3, 1]);
const after = applyLineRemoval(PASTED, plan.remove.map(r => r.index));
check('the chart survives intact', after.split('\n').filter(l => l.trim()).length, 4);
check('and running it again changes nothing', planLineRemoval(after, ["Octopus's Garden"]).remove, []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
