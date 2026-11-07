// Charts with the chords above the lyrics, read out of a PDF (chordsAbove.js).
//
// The items here are built by hand in the shape pdf.js gives back, in a
// monospaced 12pt face 6pt a letter wide, so where a chord is drawn can be said
// in letters. What they copy is the Doctor Uke "Alley-Oop" sheet and the San
// Jose club's sheets: chords as text on their own row, each drawn over its word
// or a letter into it.
//
// Run: node scripts/chordsAboveCheck.mjs
import { chordsAbove, chordsAbovePage } from '../src/utils/chordsAbove.js';
import { linesFromItems, textFromLines } from '../src/utils/pdfText.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

const W = 6, LEFT = 72;
// One run of text, `at` letters in from the margin.
const run = (str, at, y, h = 12) => ({ str, transform: [1, 0, 0, 1, LEFT + at * W, y], width: str.length * W, height: h, fontName: 'f1' });
// A row of chords from "  D      A7" — each name drawn at its column, as its own run.
const chordRow = (spaced, y) => [...spaced.matchAll(/\S+/g)].map(m => run(m[0], m.index, y));
// Lines from rows of [items...], each row 14pt below the last unless it says.
function read(rows) {
  const items = [];
  let y = 700;
  for (const r of rows) {
    if (typeof r === 'number') { y -= r; continue; }
    items.push(...r.map(it => ({ ...it, transform: [1, 0, 0, 1, it.transform[4], y] })));
    y -= 14;
  }
  return chordsAbove(linesFromItems(items, { runs: true }));
}
const texts = (r) => r.lines.map(l => l.text);

// ---- 1. a chord goes on the word under it -------------------------------------
// Every case has a second pair under it: one pair alone is not read (MIN_PAIRS).
const MORE = [chordRow('G', 0), [run('Down the road', 0, 0)]];
const one = (rows) => texts(read([...rows, ...MORE])).slice(0, -1);
// And two, for a row that should NOT find its lyric.
const two = (rows) => texts(read([...rows, ...MORE, ...MORE])).slice(0, -2);
const alley = read([
  chordRow('          D', 0),
  [run("There's a man in the funny papers we all know", 0, 0)],
  ...MORE,
]);
check('a chord drawn a letter into its word goes on the word', texts(alley), ["There's a [D]man in the funny papers we all know", '[G]Down the road']);
check('the count of rows that found a lyric', alley.merged, 2);
check('runs are gone from the lines', alley.lines.some(l => l.runs), false);

check('a hyphen starts a word: Alley-[D]Oop',
  one([chordRow('        D', 0), [run('(Alley-Oop, oop, oop)', 0, 0)]]), ['(Alley-[D]Oop, oop, oop)']);

check('a chord over the space before a word is on the word',
  one([chordRow('                      C#dim7', 0), [run("you'll be a lighthouse keeper too", 0, 0)]]),
  ["you'll be a lighthouse [C#dim7]keeper too"]);

check('two chords on one word: the second stays where it is drawn',
  one([chordRow('            E7   A7', 0), [run('Look at that caveman go', 0, 0)]]),
  ['Look at that [E7]cave[A7]man go']);

check('a chord past the end of the words goes after them',
  one([chordRow('C          G', 0), [run('Feed the', 0, 0)]]), ['[C]Feed the [G]']);

check('chords drawn as one run with spaces between them',
  one([[run('C         G7', 0, 0)], [run('Ain\'t she sweet, see her', 0, 0)]]), ["[C]Ain't she [G7]sweet, see her"]);

check('a beat dot or bar line between the chords is not a chord',
  one([[run('C   .     G7  |', 0, 0)], [run('Ain\'t she sweet, see her', 0, 0)]]), ["[C]Ain't she [G7]sweet, see her"]);

// ---- 2. the rest of the page --------------------------------------------------
const page = read([
  [run('Alley Oop', 0, 0, 16)],
  chordRow('D            A7', 0),
  [run('He lives way back', 0, 0)],
  chordRow('G', 0),
  [run('A long long time ago', 0, 0)],
  chordRow('G', 0),
  [run('And far away', 0, 0)],
  30,
  chordRow('D   G', 0),
  50,
  chordRow('G', 0),
  [run('A long time ago', 0, 0)],
]);
check('a row of chords with no lyric close under it is a line of chords',
  texts(page), ['Alley Oop', '[D]He lives way [A7]back', '[G]A long long time ago', '[G]And far away', '[D] [G]', '[G]A long time ago']);
check('a pair keeps the gap above its chords, so verses stay apart',
  textFromLines(page.lines), 'Alley Oop\n[D]He lives way [A7]back\n[G]A long long time ago\n[G]And far away\n\n[D] [G]\n\n[G]A long time ago');

// Doctor Uke leaves room between every pair, and a line's height more between
// verses: 28pt a pair, 41 at a verse.
const roomy = read([
  chordRow('D', 0), [run('April come she will', 0, 0)], 14,
  chordRow('Em', 0), [run('When streams are ripe', 0, 0)], 27,
  chordRow('D', 0), [run('June, she will change', 0, 0)], 14,
  chordRow('Em', 0), [run('In restless walks', 0, 0)],
]);
check('a verse on a sheet with room between its pairs is still a verse',
  textFromLines(roomy.lines), '[D]April come she will\n[Em]When streams are ripe\n\n[D]June, she will change\n[Em]In restless walks');

check('words set apart with no space get one, on a page that is read',
  texts(read([chordRow('G', 0), [run('Heart and soul', 0, 0), run('I fell', 16, 0)], [run('Heart and soul', 0, 0), run('I fell', 16, 0)], ...MORE])),
  ['[G]Heart and soul I fell', 'Heart and soul I fell', '[G]Down the road']);

// ---- 3. pages that are not chords above lyrics stay as they are ---------------
const bracket = read([
  [run('[C]All I want for [F]Christmas', 0, 0)],
  [run('Is my [G7]two front [C]teeth', 0, 0)],
  chordRow('C   G', 0),
  [run('Gee if I could only have', 0, 0)],
]);
check('a chart already in brackets keeps its own', texts(bracket),
  ['[C]All I want for [F]Christmas', 'Is my [G7]two front [C]teeth', 'CG', 'Gee if I could only have']);
check('… and says it read nothing', bracket.merged, 0);

check('an index letter is not a chord',
  texts(read([[run('A', 0, 0, 16)], [run('All I Want for Christmas', 0, 0)], [run('B', 0, 0, 16)], [run('Blue Christmas', 0, 0)]])),
  ['A', 'All I Want for Christmas', 'B', 'Blue Christmas']);

check('one pair on a page is not a chart',
  texts(read([[run('A', 0, 0)], [run('All I Want for Christmas', 0, 0)]])), ['A', 'All I Want for Christmas']);

check('a line of tab is not a row of chords',
  two([[run('A---3---5---', 0, 0)], [run('Over the river', 0, 0)]]), ['A---3---5---', 'Over the river']);

check('nor a lyric to put chords in',
  two([chordRow('D7', 0), [run('A----------------------', 0, 0)]]), ['[D7]', 'A----------------------']);

check('a lyric held out with dashes is still a lyric',
  one([chordRow('              Dm', 0), [run('But tickle my heart------------- tickle', 0, 0)]]),
  ['But tickle my [Dm]heart------------- tickle']);

check('chords in round brackets belong to the lyrics, not above them',
  two([[run('(C)(G)(F)(C)', 0, 0)], [run('One day you will look', 0, 0)]]), ['(C)(G)(F)(C)', 'One day you will look']);

check('…but a group of chords in brackets to play again is a row of chords',
  one([chordRow('Em            Bm     (D Dsus D) X2', 0), [run('Resting in my arms', 0, 0)]]),
  ['[Em]Resting in my [Bm]arms [(D Dsus D)] [X2]']);

check('…as is a row with one chord in brackets among plain ones',
  one([chordRow('Em              Bm  (D)', 0), [run('A love once new has now', 0, 0)]]),
  ['[Em]A love once new [Bm]has [(D)]now']);

check('a section label under a row of chords is not its lyric',
  two([chordRow('C  G', 0), [run('[Chorus]', 0, 0)]]), ['[C] [G]', '[Chorus]']);

check('linesFromItems keeps no runs unless asked',
  linesFromItems([run('Hello there', 0, 700)]).some(l => l.runs), false);

// ---- 4. the fingering between the chords and the lyric -------------------------
const fretted = read([
  chordRow('C           Dm7', 0), [run('0003        2213', 0, 0, 11)], [run('Chestnuts roasting on an open fire', 0, 0)],
  chordRow('Fm          Bb9', 0), [run('3', 0, 0, 11)], [run('1013        1213', 0, 0, 11)], [run('And every mother\u2019s child', 0, 0)],
  chordRow('G7', 0), [run('0212', 0, 0, 11)],
]);
check('fret numbers under the chords are left out, and the lyric below them taken', texts(fretted),
  ['[C]Chestnuts [Dm7]roasting on an open fire', '[Fm]And every [Bb9]mother\u2019s child', '[G7]']);
check('a number on a line of its own after a lyric is left alone',
  texts(read([chordRow('C', 0), [run('Hello there you', 0, 0)], chordRow('G', 0), [run('Goodbye now', 0, 0)], [run('12', 0, 0)]])),
  ['[C]Hello there you', '[G]Goodbye now', '12']);

// ---- 5. a page as pdf.js gives it: columns, margins, scrambled text ------------
const pageItems = (rows) => {
  const items = [];
  for (const { at, y, r } of rows) items.push(...r.map(it => ({ ...it, transform: [1, 0, 0, 1, it.transform[4] + at * W, y] })));
  return items;
};
const pairs = (at, top, words) => words.flatMap((w, i) => [
  { at, y: top - i * 30, r: chordRow('C     G', 0) }, { at, y: top - i * 30 - 14, r: [run(w, 0, 0)] },
]);
const leftWords = ['Dashing through snow', 'Over the fields we', 'Bells on bobtails', 'What fun it is to'];
const rightWords = ['Jingle bells jingle', 'Oh what fun it is', 'A day or two ago', 'I thought I would'];
// The right column's rows sit 7pt below the left's, so across they interleave.
const twoCols = pageItems([...pairs(0, 700, leftWords), ...pairs(38, 693, rightWords)]);
const cols = chordsAbovePage(twoCols);
check('two columns are read a column at a time, their lines not interleaved',
  cols.lines.map(l => l.text.replace(/\[[^\]]*\]/g, '')), [...leftWords, ...rightWords]);
check('…every row of chords found its lyric', cols.merged, 8);
check('…and the second column starts with a break', cols.lines[4].gapBefore, Infinity);

const across = pageItems([{ at: 0, y: 740, r: [run('Jingle Bells, and a heading set right across the page', 0, 0)] },
  ...pairs(0, 700, leftWords), ...pairs(38, 693, rightWords)]);
check('a heading across both columns doesn\u2019t hide the gap', chordsAbovePage(across).merged, 8);

const wide = pageItems(pairs(0, 700, ['Dashing through the snow in a one horse open sleigh over the fields', 'Bells on bobtails ring making spirits bright what fun it is to ride', 'A day or two ago I thought I would take a ride and soon Miss Fanny', 'Oh what fun it is to ride in a one horse open sleigh hey jingle bells']));
check('one column is read as one', chordsAbovePage(wide).lines.some(l => l.gapBefore === Infinity), false);

const margin = { str: 'Ukulele Club of Santa Cruz', transform: [0, 1, -1, 0, 40, 500], width: 150, height: 10, fontName: 'f1' };
check('a label running up the margin stays out of it', chordsAbovePage([...pageItems(pairs(0, 700, leftWords)), margin]).lines.map(l => l.text).join(' ').includes('Santa Cruz'), false);

// Words of different lines drawn at their own heights, 5pt apart: Campfire.
const tumbled = pageItems(['C    G', 'the skin', 'G    C', 'in a stick', 'C    G', 'how sack', 'G    C', 'back peach', 'C    G', 'the a she'].map((t, i) => (
  { at: 0, y: 700 - i * 5, r: /^[A-G]\s/.test(t) ? chordRow(t, 0) : [run(t, 0, 0)] })));
check('lines packed tighter than their type aren\u2019t read', chordsAbovePage(tumbled).merged, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
