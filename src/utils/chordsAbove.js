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
const chordsOf = (row) => extractChords(textOf(row)).filter(c => /[\p{L}\p{N}]/u.test(c.chord));

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
const isChordRow = (row) => isChordLine(textOf(row)) && !isTab(row) && !roundOnly(textOf(row));

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
    const next = lines[i + 1];
    const lyric = rows[i + 1];
    const height = Math.max(lines[i].height || 0, next?.height || 0, 1);
    const text = lyric && /\p{L}/u.test(textOf(lyric)) && !chordRow[i + 1] && !isTab(lyric) && !sectionLabelOf(next.text) && !next.text.includes('[')
      && next.gapBefore <= PAIR_GAP * height && (lines[i].height || 0) <= HEADING * (next.height || 0)
      && merge(rows[i], lyric, height);
    if (text) {
      const { runs: __, ...under } = next;
      pairs.push(out.length);
      out.push({ ...under, text, gapBefore: line.gapBefore });
      merged++;
      i++;
    } else {
      out.push({ ...line, text: chordsOf(rows[i]).map(c => `[${c.chord}]`).join(' ') });
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
