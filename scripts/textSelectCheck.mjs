// The Select strip's selections: a line, a section, growing a line at a time,
// and what Cut takes. The buttons are only as good as these.
//
// Run: node scripts/textSelectCheck.mjs

import { selectLine, selectSection, growUp, growDown, cutRange } from '../src/utils/textSelect.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`);
}

const song = 'C  G\nFirst line\nAm F\nSecond line\n\nChorus one\nChorus two\n\n\nLast';
const at = (s) => song.indexOf(s);
const words = ([a, b]) => song.slice(a, b);

check('line, from its middle', words(selectLine(song, at('First') + 3)), 'First line');
check('line, the first', words(selectLine(song, 0)), 'C  G');
check('line, the last', words(selectLine(song, song.length)), 'Last');
check('line, at a line start', words(selectLine(song, at('Am F'))), 'Am F');
check('line, the end of one is that line', words(selectLine(song, at('First') + 10)), 'First line');
check('line, a blank one is empty', words(selectLine(song, at('Chorus one') - 1)), '');

check('section from inside', words(selectSection(song, at('Second'))), 'C  G\nFirst line\nAm F\nSecond line');
check('section, the last one', words(selectSection(song, song.length)), 'Last');
check('section from a blank line takes the one below', words(selectSection(song, at('Chorus one') - 1)), 'Chorus one\nChorus two');
check('section across two blank lines', words(selectSection(song, at('Last') - 2)), 'Last');
check('section from a trailing blank line takes the one above', selectSection('Verse\n\n', 7), [0, 5]);
check('section, nothing but blank lines', selectSection('\n\n', 1), [1, 1]);
check('section, an empty song', selectSection('', 0), [0, 0]);

const first = selectLine(song, at('First'));
check('down one line', words(growDown(song, ...first)), 'First line\nAm F');
check('up one line', words(growUp(song, ...first)), 'C  G\nFirst line');
check('down twice', words(growDown(song, ...growDown(song, ...first))), 'First line\nAm F\nSecond line');
check('a caret becomes its line, first', words(growDown(song, at('First') + 2, at('First') + 2)), 'First line');
check('part of a line becomes all of it', words(growUp(song, at('First') + 1, at('First') + 3)), 'First line');
check('a selection ending in a line break tidies to the line', words(growDown(song, first[0], first[1] + 1)), 'First line');
check('down across a blank line', words(growDown(song, ...selectLine(song, at('Second')))), 'Second line\n');
check('up from the top stays put', growUp(song, 0, 4), [0, 4]);
check('down from the bottom stays put', growDown(song, at('Last'), song.length), [at('Last'), song.length]);
check('a caret on a blank line grows off it', words(growDown(song, at('Chorus one') - 1, at('Chorus one') - 1)), '\nChorus one');

check('cut whole lines takes the break after', cutRange('a\nb\nc', 2, 3), [2, 4]);
check('cut the last line takes the break before', cutRange('a\nb', 2, 3), [1, 3]);
check('cut the only line', cutRange('a', 0, 1), [0, 1]);
check('cut part of a line takes just that', cutRange('abc\nd', 1, 2), [1, 2]);
check('cut nothing', cutRange('abc', 1, 1), [1, 1]);

console.log(`textSelect: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
