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

// Two columns side by side come out as one line wherever their rows line up.
// Where a gap this many times the smaller text's height opens up between two runs, the
// line also keeps its pieces, so the book reader can take a title from the left
// column without the right column's lyric on the end of it.
const COLUMN_GAP = 2;

// Items in: pdf.js text items ({ str, transform, width, height, fontName }).
// Lines out, in reading order, each with the geometry a later pass needs to
// judge it:
//   { text, x, y, height, gapBefore, font, pieces?, runs? }
// `font` is the font of the line's first run. `pieces` is there only when the
// line spans a column gap: [{ text, x, height, font }], left to right. `runs`
// only when asked for: every run as [{ str, x, width, height }], which is what
// it takes to put a chord above the lyrics on the letter under it
// (chordsAbove.js). Not kept by default: a 5,000-page book doesn't need them.
export function linesFromItems(items = [], { runs = false } = {}) {
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
    const pieces = [];
    for (const it of row.items) {
      if (seen.some(s => s.str === it.str && Math.abs(s.x - it.x) < 1)) continue;
      const prev = seen.at(-1);
      const gap = prev && typeof prev.width === 'number' ? it.x - (prev.x + prev.width) : 0;
      seen.push(it);
      text += it.str;
      if (!pieces.length || gap > COLUMN_GAP * Math.max(Math.min(prev.height || 0, it.height || 0), 1)) {
        pieces.push({ text: it.str, x: it.x, height: it.height || 0, font: it.fontName });
      } else {
        const last = pieces.at(-1);
        last.text += it.str;
        last.height = Math.max(last.height, it.height || 0);
      }
    }
    // Trimmed at both ends. A run of spaces at the start of a row is the PDF
    // positioning the text, not indentation someone typed — and Cue's bracket
    // format carries no meaning in leading whitespace. (A chords-ABOVE-lyrics
    // chart is read from the runs' x instead — chordsAbove.js.)
    text = text.trim();
    if (!text.trim()) continue;
    lines.push({
      text,
      x: Math.min(...row.items.map(i => i.x)),
      y: row.y,
      height: Math.max(...row.items.map(i => i.height || 0)),
      gapBefore: prevY === null ? 0 : Math.round((prevY - row.y) * 10) / 10,
      font: pieces[0].font,
      ...(pieces.filter(pc => pc.text.trim()).length > 1
        ? { pieces: pieces.filter(pc => pc.text.trim()).map(pc => ({ ...pc, text: pc.text.trim() })) } : {}),
      ...(runs ? { runs: seen.map(it => ({ str: it.str, x: it.x, width: it.width, height: it.height || 0 })) } : {}),
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
