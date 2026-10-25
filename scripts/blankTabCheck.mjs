// Blank tab from the editor's Ω menu.
//
// The block has to be real tab to Cue the moment it lands — every line passes
// isTabLine, none is read as chords — and stay that way once frets are typed
// into it. It must go in on lines of its own, so a lyric is never split around
// it, and leave the caret on the top string's first dash.
//
// Run: node scripts/blankTabCheck.mjs
import { blankTab, tabStringNames, insertBlock, BLANK_TAB_DASHES } from '../src/utils/blankTab.js';
import { isTabLine, isChordLine } from '../src/utils/visualImport.js';
import { convertToBrackets } from '../src/utils/chordStyle.js';
import { detectChords } from '../src/utils/chordDetect.js';
import { CHORD_LIBRARIES } from '../src/data/chordLibraries.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

const D = '-'.repeat(BLANK_TAB_DASHES);

// ---- 1. strings, highest on top, for each instrument -------------------------
check('ukulele GCEA', blankTab(CHORD_LIBRARIES.ukulele_gcea.tuning), `A|${D}|\nE|${D}|\nC|${D}|\nG|${D}|`);
check('baritone DGBE', tabStringNames(CHORD_LIBRARIES.baritone_dgbe.tuning), ['E', 'B', 'G', 'D']);
check('guitar: the high E is "e"', tabStringNames(CHORD_LIBRARIES.guitar.tuning), ['e', 'B', 'G', 'D', 'A', 'E']);
check('no instrument falls back to GCEA', tabStringNames(CHORD_LIBRARIES.none.tuning), ['A', 'E', 'C', 'G']);
check('names padded so the bars line up', blankTab(['D#', 'G']).split('\n').map(l => l.indexOf('|')), [2, 2]);

// ---- 2. it is tab to Cue, before and after frets go in -----------------------
for (const id of ['ukulele_gcea', 'baritone_dgbe', 'guitar']) {
  const lines = blankTab(CHORD_LIBRARIES[id].tuning).split('\n');
  check(`${id}: every line is tab`, lines.every(isTabLine), true);
  check(`${id}: no line is a chord line`, lines.some(isChordLine), false);
}
const filled = [
  'A|----2-----10----|',
  'E|----3------7----|',
  'C|----2------7----|',
  'G|----0------7----|',
].join('\n');
check('filled in: still tab', filled.split('\n').every(isTabLine), true);
const song = `G         C\nSome words here\n${filled}\nMore words`;
check('in a song: the tab is left as text', convertToBrackets(song).includes(filled), true);
check('in a song: only the real chords are found', detectChords(convertToBrackets(song)), ['G', 'C']);

// ---- 3. inserting on lines of its own -----------------------------------------
const TAB = blankTab(['G', 'C', 'E', 'A']);
const caretAt = TAB.indexOf('|') + 1;
check('into an empty song', insertBlock('', 0, 0, TAB), { text: TAB, caret: caretAt });
check('at the start of a line', insertBlock('one\ntwo', 4, 4, TAB), { text: `one\n${TAB}\ntwo`, caret: 4 + caretAt });
check('at the end of a line', insertBlock('one\ntwo', 3, 3, TAB), { text: `one\n${TAB}\ntwo`, caret: 4 + caretAt });
check('mid-line splits the line around it', insertBlock('one two', 3, 3, TAB), { text: `one\n${TAB}\n two`, caret: 4 + caretAt });
check('at the very end', insertBlock('one', 3, 3, TAB), { text: `one\n${TAB}`, caret: 4 + caretAt });
check('replaces a selection', insertBlock('one\nXX\ntwo', 4, 6, TAB), { text: `one\n${TAB}\ntwo`, caret: 4 + caretAt });
const r = insertBlock('one\ntwo', 4, 4, TAB);
check('caret sits on the top string\'s first dash', r.text[r.caret], '-');
check('and the character before it is the bar', r.text[r.caret - 1], '|');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
