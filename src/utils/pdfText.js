// Rebuilding lines of text from a PDF's text layer.
//
// pdf.js hands back positioned runs, not lines: each item carries its string and
// a transform whose last two numbers are its x and y on the page. Two things
// have to be put back.
//
// READING ORDER IS NOT STREAM ORDER. In a real songbook PDF the page header
// ("Date Created…", "Go To Contents") arrives at the END of the item stream
// while sitting at the TOP of the page. So rows are grouped by y and sorted down
// the page, never taken in the order they were emitted.
//
// BLANK LINES ARE NOT IN THE FILE. A PDF records where each line sits, not that
// a verse ended. They have to come from the vertical gaps — and they matter,
// because Cue's block logic (section labels, Condense) is blank-line separated.
// Measured on real charts the signal is clean: ~16pt between lines of a verse,
// ~31pt between verses.

// Rows within this many points of each other are the same line. Generous enough
// for a superscript or a font switch mid-line, tight enough not to weld two
// lines of a verse together.
const ROW_TOLERANCE = 2;

// A gap this many times the usual line spacing means a blank line was there.
// 1.5 sits in the middle of the two populations (~16 and ~31) rather than near
// either, so neither a loose line nor a tight verse break lands on the wrong
// side.
const BLANK_GAP_RATIO = 1.5;

// Items in: pdf.js text items ({ str, transform, width, height }). Lines out, in
// reading order, each with the geometry a later pass needs to judge it:
//   { text, x, y, height, gapBefore }
export function linesFromItems(items = []) {
  const rows = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || it.str === '') continue;
    const x = it.transform?.[4] ?? 0;
    const y = it.transform?.[5] ?? 0;
    const row = rows.find(r => Math.abs(r.y - y) <= ROW_TOLERANCE);
    if (row) row.items.push({ ...it, x, y });
    else rows.push({ y, items: [{ ...it, x, y }] });
  }

  rows.sort((a, b) => b.y - a.y);          // down the page

  const lines = [];
  let prevY = null;
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    // A hyperlink's text is often painted several times over itself, which
    // concatenates as "Go To ContentsGo To ContentsGo To Contents". Same string
    // at the same place is one piece of text, not three.
    const seen = [];
    let text = '';
    for (const it of row.items) {
      if (seen.some(s => s.str === it.str && Math.abs(s.x - it.x) < 1)) continue;
      seen.push(it);
      text += it.str;
    }
    // Trimmed at both ends. A run of spaces at the start of a row is the PDF
    // positioning the text, not indentation someone typed — and Cue's bracket
    // format carries no meaning in leading whitespace. (It would in a
    // chords-ABOVE-lyrics chart, which this path does not claim to handle.)
    text = text.trim();
    if (!text.trim()) continue;
    lines.push({
      text,
      x: Math.min(...row.items.map(i => i.x)),
      y: row.y,
      height: Math.max(...row.items.map(i => i.height || 0)),
      gapBefore: prevY === null ? 0 : Math.round((prevY - row.y) * 10) / 10,
    });
    prevY = row.y;
  }
  return lines;
}

// The usual distance between consecutive lines, used as the yardstick for what
// counts as a gap. The median ignores the handful of large jumps (verse breaks,
// the drop to a footer) that an average would be dragged by.
export function medianGap(lines = []) {
  const gaps = lines.map(l => l.gapBefore).filter(g => g > 0).sort((a, b) => a - b);
  if (!gaps.length) return 0;
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

// True where a blank line belongs ABOVE this line.
export function isBlockBreak(line, median, ratio = BLANK_GAP_RATIO) {
  return median > 0 && line.gapBefore > median * ratio;
}

// Lines back to text, with the blank lines the PDF never stored put back.
// `keep` decides which lines survive; a dropped line cannot leave a gap behind,
// so the break is carried to the next line that stays.
export function textFromLines(lines = [], keep = () => true) {
  const median = medianGap(lines);
  const out = [];
  let pendingBreak = false;
  for (const line of lines) {
    const breakHere = isBlockBreak(line, median) || pendingBreak;
    if (!keep(line)) { pendingBreak = breakHere; continue; }
    if (breakHere && out.length) out.push('');
    pendingBreak = false;
    out.push(line.text);
  }
  return out.join('\n');
}
