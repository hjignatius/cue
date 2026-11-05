// Selecting by the line and the section, for the Select strip (SelectStrip.jsx):
// a chart on a touch screen is mostly short lines close together, where Apple's
// drag handles are hard to place. All of it works on the text and a selection
// [start, end) and returns the selection to make, so it can be tested without a
// browser.
//
// A selection of whole lines stops at the end of its last line, before the line
// break: that is what looks right highlighted, and it pastes cleanly into a
// blank line.

export function lineStart(text, pos) {
  if (pos <= 0) return 0;
  return text.lastIndexOf('\n', pos - 1) + 1;
}

export function lineEnd(text, pos) {
  const i = text.indexOf('\n', pos);
  return i < 0 ? text.length : i;
}

const blankAt = (text, pos) => text.slice(lineStart(text, pos), lineEnd(text, pos)).trim() === '';

// The line the caret is on, or the first line of a selection.
export function selectLine(text, start) {
  return [lineStart(text, start), lineEnd(text, start)];
}

// The block between blank lines the caret is in. On a blank line, the block
// below it, or if the song ends there, the one above.
export function selectSection(text, start) {
  let pos = start;
  if (blankAt(text, pos)) {
    let next = lineEnd(text, pos);
    while (next < text.length && blankAt(text, next + 1)) next = lineEnd(text, next + 1);
    if (next < text.length) pos = next + 1;
    else {
      let prev = lineStart(text, pos);
      while (prev > 0 && blankAt(text, prev - 1)) prev = lineStart(text, prev - 1);
      if (prev === 0) return selectLine(text, start);   // nothing but blank lines
      pos = prev - 1;
    }
  }
  let from = lineStart(text, pos);
  while (from > 0 && !blankAt(text, from - 1)) from = lineStart(text, from - 1);
  let to = lineEnd(text, pos);
  while (to < text.length && !blankAt(text, to + 1)) to = lineEnd(text, to + 1);
  return [from, to];
}

// Out to whole lines first. A selection that is already whole lines takes in
// one more line in that direction.
function wholeLines(text, start, end) {
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  return [lineStart(text, start), lineEnd(text, last)];
}

export function growUp(text, start, end) {
  const [from, to] = wholeLines(text, start, end);
  if ((from !== start || to !== end) || from === 0) return [from, to];
  return [lineStart(text, from - 1), to];
}

export function growDown(text, start, end) {
  const [from, to] = wholeLines(text, start, end);
  if ((from !== start || to !== end) || to === text.length) return [from, to];
  return [from, lineEnd(text, to + 1)];
}

// What Cut takes. Whole lines take a line break with them, so no empty line is
// left where they were.
export function cutRange(text, start, end) {
  if (start === end || lineStart(text, start) !== start || lineEnd(text, end) !== end) return [start, end];
  if (end < text.length) return [start, end + 1];
  if (start > 0) return [start - 1, end];
  return [start, end];
}
