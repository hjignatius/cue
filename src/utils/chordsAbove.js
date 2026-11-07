// Charts with the chords on a line of their own above the lyrics, read out of a
// PDF and put into the lyrics as [brackets].
//
// In a text file a chord sits over its letter by column. A PDF has no columns —
// proportional type, every run drawn where it is placed — but it does keep x:
// where each chord and each run of lyric starts on the page. So each chord goes
// on the lyric letter under it, with a run's width spread evenly over its
// letters (close enough: the error is a fraction of a letter), and then back to
// the start of its word. Website charts are typeset by eye, and a chord drawn a
// letter or two into its word means the word: "Alley-[D]Oop", never
// "Alley-O[D]op". A hyphen starts a word.
//
// Lines in are linesFromItems' lines with their `runs` (pdfText.js); lines out
// are the same without them.

import { isChordLine, extractChords, sectionLabelOf } from './visualImport.js';
import { linesFromItems } from './pdfText.js';

// A lyric no further than this below a row of chords, in heights of the text,
// is the line those chords are over. A verse break is further.
const PAIR_GAP = 2.2;
// A gap between two runs wider than this, in heights, is a space the PDF drew
// as a gap rather than typed.
const SPACE_GAP = 0.2;
// A chord starting up to this far before a letter, in heights, is over it.
// Chords sit a hair left of their letter as often as on it.
const LEAD = 0.15;
// Chords are set no bigger than the words, give or take bold. A lone "A" set
// larger over "All I Want for Christmas" heads an index.
const HEADING = 1.25;
// A chart has a row of chords over more than one line. One pair on a page is
// more likely an accident of the layout than a chart.
const MIN_PAIRS = 2;

const WORD = /[\p{L}\p{N}'’]/u;
// A lyric with a chord in it already: "[G]Over the river".
const BRACKETED = /\[[^\]\s]+\][^[]*\p{L}{3}/u;

// A line's letters, each with the x it is drawn at, ends trimmed.
function letters(line) {
  const out = [];
  let end = null;
  for (const r of line.runs) {
    const chars = [...r.str];
    if (end !== null && r.x - end > SPACE_GAP * Math.max(r.height, 1) && out.length && out.at(-1).ch !== ' ') out.push({ ch: ' ', x: end });
    const w = typeof r.width === 'number' && r.width > 0 ? r.width / chars.length : Math.max(r.height, 1) / 2;
    chars.forEach((ch, k) => out.push({ ch, x: r.x + k * w }));
    end = r.x + w * chars.length;
  }
  while (out.length && /\s/.test(out[0].ch)) out.shift();
  while (out.length && /\s/.test(out.at(-1).ch)) out.pop();
  return out;
}

const textOf = (row) => row.map(l => l.ch).join('');

// The chords in a row. A beat dot, a bar line or a strum mark between them
// ("C . E7 . |") counts out the bar on the sheet; in a lyric it would just be
// punctuation in the words.
// So does an x for a muted strum ("D\\ x x D"), which is no chord.
const chordsOf = (row) => extractChords(textOf(row)).filter(c => /[\p{L}\p{N}]/u.test(c.chord) && !/^x$/i.test(c.chord));

// A line of tab is dashes and fret numbers. It is neither a row of chords —
// "A---8---7" passes isChordLine as an A with a strum after it — nor a lyric to
// put chords in. A lyric held out ("heart-------------") has dashes too, but a
// good share of letters.
const isTab = (row) => {
  const marks = textOf(row).replace(/\s/g, '');
  return (marks.match(/-/g) || []).length * 2 >= marks.length && (marks.match(/\p{L}/gu) || []).length * 4 < marks.length;
};
// A row of chords in round brackets, "(C)(G)(F)(C)", belongs to a book that
// puts its chords in the lyrics that way (roundBracketChords, songbook.js).
// Several chords in one pair of brackets are a group played over again:
// "Em Bm Em Bm (D Dsus D) X2"; one in a row of plain ones is held or
// optional: "Em Bm A7sus (D)".
const roundOnly = (text) => /\([A-G][^\s()]*\)/.test(text) && !/(?:^|\s)[A-G]/.test(text.replace(/\([^()]*\)/g, ' '));
const isChordRow = (row) => isChordLine(textOf(row)) && !isTab(row) && !roundOnly(textOf(row)) && chordsOf(row).length > 0;
// The fingering under a row of chords, between it and the lyric: 4th Peg prints
// "C Dm7 G7" over "0003 2213 0212", and a lone "3" for a shape up the neck. Only
// ever looked for straight after a row of chords, where it can't be a page number.
const isFretRow = (row) => /^[\dxX\s]+$/.test(textOf(row));

// The chords of `row` put into `lyric`, both as letters; null when none of
// them is over it.
function merge(row, lyric, height) {
  const at = new Map();
  const after = [];
  for (const { chord, pos } of chordsOf(row)) {
    const x = row[pos].x;
    const drawn = lyric.findIndex(l => l.x > x - LEAD * height);
    if (drawn < 0) { after.push(`[${chord}]`); continue; }
    let i = drawn;
    // Over the space before a word is over the word: "lighthouse [C#dim7]keeper".
    if (/\s/.test(lyric[i].ch) && lyric[i + 1] && WORD.test(lyric[i + 1].ch)) i++;
    while (i > 0 && WORD.test(lyric[i - 1].ch) && WORD.test(lyric[i].ch)) i--;
    // Two chords on one word: the first takes its start, the second stays
    // where it is drawn.
    if (at.has(i) && i !== drawn) i = drawn;
    at.set(i, (at.get(i) || '') + `[${chord}]`);
  }
  // Chords that all sit past the end of the line are not over it.
  if (!at.size) return null;
  let text = '';
  lyric.forEach((l, k) => { text += (at.get(k) || '') + l.ch; });
  if (after.length) text += ` ${after.join(' ')}`;
  return text.trim();
}

/**
 * A page's lines with every row of chords put into the lyric under it.
 * A row of chords with no lyric under it (an intro, a turnaround) becomes a
 * line of bracketed chords. A page with no chords above any lyric is left as it
 * was — a lone "A" heading an index is not a chord there.
 *
 * Returns { lines, merged }: `merged` is how many rows of chords found a lyric.
 */
export function chordsAbove(lines = []) {
  const rows = lines.map(l => (l.runs ? letters(l) : null));
  const chordRow = rows.map(r => (r ? isChordRow(r) : false));
  const out = [];
  const pairs = [];
  let merged = 0;
  for (let i = 0; i < lines.length; i++) {
    const { runs: _, ...line } = lines[i];
    if (!chordRow[i]) {
      // Words the PDF set apart without a space between them ("soul" "I fell")
      // get one, as the lyrics under the chords do.
      const spaced = rows[i] && textOf(rows[i]);
      out.push(spaced && spaced.replace(/\s/g, '') === line.text.replace(/\s/g, '') ? { ...line, text: spaced } : line);
      continue;
    }
    let under = i + 1;
    while (rows[under] && isFretRow(rows[under])) under++;
    const next = lines[under];
    const lyric = rows[under];
    const height = Math.max(lines[i].height || 0, next?.height || 0, 1);
    const text = lyric && /\p{L}/u.test(textOf(lyric)) && !chordRow[under] && !isTab(lyric) && !sectionLabelOf(next.text) && !next.text.includes('[')
      && next.gapBefore <= PAIR_GAP * height && (lines[i].height || 0) <= HEADING * (next.height || 0)
      && merge(rows[i], lyric, height);
    if (text) {
      const { runs: __, ...below } = next;
      pairs.push(out.length);
      out.push({ ...below, text, gapBefore: line.gapBefore });
      merged++;
      i = under;
    } else {
      out.push({ ...line, text: chordsOf(rows[i]).map(c => `[${c.chord}]`).join(' ') });
      i = under - 1;
    }
  }
  // A chart already in brackets keeps its own: a stray row of chords over one
  // of its lines is not a reason to rewrite the page.
  const bracketed = lines.filter(l => BRACKETED.test(l.text)).length;
  if (merged < MIN_PAIRS || bracketed > merged) return { lines: lines.map(({ runs: _, ...l }) => l), merged: 0 };
  return { lines: verseBreaks(out, pairs), merged };
}

// A sheet that leaves room between every pair of lines marks a verse with a
// line's height more: Doctor Uke's go 28pt a pair, 41 between verses. Measured
// against the gap between lines, as a page of lyrics is (pdfText.js), that is
// under the half again a blank line needs. So against the pairs: a gap a good
// part of a line wider than theirs is a verse, and is made wide enough to
// read as one.
const VERSE_EXTRA = 0.75;
function verseBreaks(lines, pairs) {
  const gaps = pairs.map(i => lines[i].gapBefore).filter(g => g > 0 && Number.isFinite(g)).sort((a, b) => a - b);
  if (!gaps.length) return lines;
  const usual = gaps[Math.floor(gaps.length / 2)];
  const heights = pairs.map(i => lines[i].height || 0).sort((a, b) => a - b);
  const extra = VERSE_EXTRA * heights[Math.floor(heights.length / 2)];
  return lines.map(l => (Number.isFinite(l.gapBefore) && l.gapBefore > usual + extra && l.gapBefore < usual * 2
    ? { ...l, gapBefore: usual * 2 } : l));
}

// TWO COLUMNS. A club's page often sets a song in two columns, and the columns'
// lines don't sit level: read straight across, a line of the left column falls
// between two of the right's, and a chord lands on the wrong song's lyric. So a
// page with a clear gap down its middle is read a column at a time.
//
// The gap is looked for in the middle part of the page, and no more than a few
// rows may cross it: a title set across both columns is one.
const GUTTER_FROM = 0.3, GUTTER_TO = 0.7;
const GUTTER_MIN = 6;       // points wide
const GUTTER_ACROSS = 3;    // rows that may cross it
const COLUMN_MIN = 0.2;     // the least of the page's letters on either side
const COLUMN_ROWS = 4;      // and of rows

const upright = (it) => !it.transform?.[1];
const startOf = (it) => it.transform?.[4] ?? 0;
const endOf = (it) => startOf(it) + (it.width || 0);

// Where a page's columns divide, or null when it has one column.
function gutterOf(items) {
  const text = items.filter(it => it.str?.trim() && it.width > 0);
  if (text.length < COLUMN_ROWS * 2) return null;
  const left = Math.min(...text.map(startOf));
  const right = Math.max(...text.map(endOf));
  const from = left + (right - left) * GUTTER_FROM;
  const to = left + (right - left) * GUTTER_TO;
  // The rows drawn across each point of the middle, a point at a time.
  const across = [];
  for (let x = Math.ceil(from); x <= to; x++) {
    across.push({ x, rows: new Set(text.filter(it => startOf(it) < x && endOf(it) > x).map(it => Math.round(it.transform[5]))).size });
  }
  let best = null, run = null;
  for (const c of across) {
    if (c.rows > GUTTER_ACROSS) { run = null; continue; }
    run = run ? { ...run, to: c.x } : { from: c.x, to: c.x };
    if (!best || run.to - run.from > best.to - best.from) best = run;
  }
  if (!best || best.to - best.from < GUTTER_MIN) return null;
  const mid = (best.from + best.to) / 2;
  const sides = [text.filter(it => startOf(it) < mid), text.filter(it => startOf(it) >= mid)];
  const total = text.reduce((n, it) => n + it.str.length, 0);
  const worth = (side) => side.reduce((n, it) => n + it.str.length, 0) >= total * COLUMN_MIN
    && new Set(side.map(it => Math.round(it.transform[5]))).size >= COLUMN_ROWS;
  return sides.every(worth) ? mid : null;
}

// Lines packed tighter than the type is tall aren't lines of one column. They
// are something that can't be read across, like Campfire's pages, where words
// of different lines are drawn at their own heights. A column with this share
// of them is left as it is, and the song comes in as printed.
const TIGHT = 0.75;
const TIGHT_MAX = 0.45;
function scrambled(lines) {
  const rows = lines.slice(1).filter(l => l.gapBefore > 0 && Number.isFinite(l.gapBefore));
  return rows.length > 0 && rows.filter(l => l.gapBefore < TIGHT * (l.height || 1)).length >= rows.length * TIGHT_MAX;
}

function readColumn(items) {
  const lines = linesFromItems(items, { runs: true });
  return scrambled(lines) ? { lines: lines.map(({ runs: _, ...l }) => l), merged: 0 } : chordsAbove(lines);
}

// A page of a PDF, from its text items, with its chords in its lyrics: as
// chordsAbove, a column at a time when it has two. Upright text only: a label
// running up the margin would come between a row of chords and its lyric, and a
// page turned on its side reads as a letter a line. Lines from a second column
// follow the first with a gap that reads as a break. Returns { lines, merged }.
export function chordsAbovePage(items = []) {
  const flat = items.filter(upright);
  const gutter = gutterOf(flat);
  if (gutter === null) return readColumn(flat);
  const [one, two] = [flat.filter(it => startOf(it) < gutter), flat.filter(it => startOf(it) >= gutter)].map(readColumn);
  return { lines: [...one.lines, ...two.lines.map((l, i) => (i ? l : { ...l, gapBefore: Infinity }))], merged: one.merged + two.merged };
}
