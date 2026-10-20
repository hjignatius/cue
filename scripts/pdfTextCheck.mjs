// Rebuilding lines of text from a PDF's text layer.
//
// The two things a PDF does not tell you, both measured on real songbook files:
//   - reading order. A page header can arrive LAST in the item stream while
//     sitting at the TOP of the page, so rows are sorted by y, never taken in
//     the order they were emitted.
//   - blank lines. They exist only as vertical gaps, and Cue's block logic
//     (section labels, Condense) is blank-line separated, so they have to be
//     put back or a whole song arrives as one undifferentiated verse.
//
// Run: node scripts/pdfTextCheck.mjs

import { linesFromItems, medianGap, isBlockBreak, textFromLines } from '../src/utils/pdfText.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// A pdf.js text item: the string, and a transform whose last two values are x,y.
const item = (str, x, y, height = 11) => ({ str, transform: [1, 0, 0, 1, x, y], width: str.length * 5, height });
const texts = (lines) => lines.map(l => l.text);

// ---- 1. rows, and the order they come back in ------------------------------
check('runs on one row join into one line',
  texts(linesFromItems([item('world', 40, 700), item('hello ', 10, 700)])), ['hello world']);
check('rows read DOWN the page, whatever order they arrived in',
  texts(linesFromItems([item('last', 10, 100), item('first', 10, 700), item('middle', 10, 400)])),
  ['first', 'middle', 'last']);
// The real case this comes from: the header is emitted after the body.
check('a header emitted last still reads first',
  texts(linesFromItems([item('[G] lyric', 58, 644), item('Date Created', 41, 780)])),
  ['Date Created', '[G] lyric']);
check('a half-point of drift is the same row',
  texts(linesFromItems([item('a', 10, 700), item('b', 20, 701.4)])), ['ab']);
check('blank and whitespace-only runs are dropped',
  texts(linesFromItems([item('', 10, 700), item('   ', 20, 700), item('x', 30, 700)])), ['x']);
check('nothing at all', linesFromItems([]), []);
check('junk is survivable', texts(linesFromItems([null, undefined, { str: 5 }, item('ok', 1, 1)])), ['ok']);

// A hyperlink is often painted several times over itself. Same string at the
// same place is one piece of text, not three.
check('text painted over itself is not repeated',
  texts(linesFromItems([item('Go To Contents', 492, 780), item('Go To Contents', 492, 780), item('Go To Contents', 492, 780)])),
  ['Go To Contents']);
check('...but the same word twice on a line is kept',
  texts(linesFromItems([item('la ', 10, 700), item('la', 40, 700)])), ['la la']);

// ---- 2. the geometry a later pass judges by --------------------------------
const three = linesFromItems([item('one', 10, 700, 20), item('two', 10, 684), item('three', 10, 653)]);
check('the first line has no gap before it', three[0].gapBefore, 0);
check('gaps are the distance from the line above', [three[1].gapBefore, three[2].gapBefore], [16, 31]);
check('font height comes through (the title is the big one)', three[0].height, 20);
check('x comes through', three[0].x, 10);

// ---- 3. blank lines, from the gaps -----------------------------------------
// Measured on real charts: ~16pt between lines of a verse, ~31pt between verses.
const verses = linesFromItems([
  item('[G] line one', 58, 700), item('[Am] line two', 58, 684),
  item('[C] line three', 58, 653), item('[D] line four', 58, 637),
]);
check('the usual spacing is the yardstick', medianGap(verses), 16);
check('a verse break is a gap', isBlockBreak(verses[2], medianGap(verses)), true);
check('a line of the same verse is not', isBlockBreak(verses[1], medianGap(verses)), false);
check('the blank line lands between the verses',
  textFromLines(verses), '[G] line one\n[Am] line two\n\n[C] line three\n[D] line four');
check('no gaps at all means no blank lines', medianGap([{ gapBefore: 0 }]), 0);

// ---- 4. dropping the furniture ---------------------------------------------
// A dropped line must not leave its gap behind: the break belongs to the next
// line that survives, or the song starts with a stray blank.
const withHeader = linesFromItems([
  item('Go To Contents', 41, 780), item('[G] verse one', 58, 700),
  item('[Am] verse two', 58, 684), item('Page 797 of 5155', 474, 653),
]);
const keep = (l) => !/Go To Contents|Page \d+ of/.test(l.text);
check('furniture goes, and takes its gap with it',
  textFromLines(withHeader, keep), '[G] verse one\n[Am] verse two');
check('every surviving line is byte-identical to the PDF',
  textFromLines(withHeader, keep).split('\n').filter(Boolean).every(t => withHeader.some(l => l.text === t)), true);

// A break carried across a dropped line still lands.
// Enough body lines that the median is the VERSE spacing, as on a real page —
// with only two gaps the median sits between them and nothing reads as a break.
const across = linesFromItems([
  item('[G] one', 58, 700), item('[G] two', 58, 684), item('[G] three', 58, 668),
  item('DROP ME', 58, 637), item('[C] after', 58, 621),
]);
check('a break carried over a dropped line still lands',
  textFromLines(across, l => l.text !== 'DROP ME'),
  '[G] one\n[G] two\n[G] three\n\n[C] after');
check('a leading break never opens the text with a blank line',
  textFromLines(across, l => l.text === '[C] after'), '[C] after');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
