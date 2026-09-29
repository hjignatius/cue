// Lyric styling: the raw-text surgery behind the Bold / Italic / colour buttons.
//
// LIFTED OUT OF EditorView so it can be run without a browser. This is the part
// that has to be exactly right in Over-Lyrics mode — a chord's column IS which
// syllable it is sung on — and "exactly right" is a claim that needs a test, not
// a read-through. See scripts/styleRoundTrip.mjs.
//
// ---------------------------------------------------------------------------
// IT WORKS ON STYLE, NOT ON MARKERS, and that is the second design. The first
// one patched the markup in place: each op asked whether the selection started
// and ended with its own delimiters, and inserted or removed a pair. Three
// separate bugs came out of that, all the same bug wearing different clothes:
//
//   * colouring a row that already held a coloured word NESTED one span inside
//     another, so the eraser peeled a word at a time from the back;
//   * clearing a multi-line selection removed the markers it could see and left
//     the outermost pair stranded — an open with no close, which colours the
//     rest of its line and nothing after it;
//   * recolouring part of an existing span split it into markup that did not
//     balance.
//
// Patching markers cannot be made safe, because the markers are not the state —
// they are one encoding of it, and a selection almost never lines up with them.
// So each touched line is now decoded into per-character style, the op is applied
// to the CHARACTERS the selection covers, and the line is written out again. The
// result is balanced and unnested by construction: there is no code path that can
// emit an open without its close.
//
// The chord line above is then RE-ANCHORED rather than re-padded: each chord is
// placed over the same character it was over before. That replaces arithmetic
// about how many bytes were inserted where, which had its own failure (an
// insertion landing inside a chord name split it — "Am" became "A  m").

import { isChordLine } from './visualImport.js';

const COLOR_OPEN = /^\{c=([^}]*)\}/;

// ---- Decode / encode --------------------------------------------------------

// One line -> one cell per VISIBLE character, carrying the style in force there
// and the column it came from. Markers themselves produce no cells: they are the
// encoding, not the content.
function decorate(line) {
  const cells = [];
  let bold = false, italic = false;
  const colors = [];
  let i = 0;
  while (i < line.length) {
    // `**` is one bold marker, never two italic ones.
    if (line.startsWith('**', i)) { bold = !bold; i += 2; continue; }
    if (line[i] === '*') { italic = !italic; i += 1; continue; }
    if (line[i] === '{') {
      const m = COLOR_OPEN.exec(line.slice(i));
      if (m) { colors.push(m[1].trim()); i += m[0].length; continue; }
      if (line.startsWith('{/c}', i)) { colors.pop(); i += 4; continue; }
    }
    cells.push({ ch: line[i], col: i, bold, italic, color: colors.length ? colors[colors.length - 1] : null });
    i += 1;
  }
  return cells;
}

// Cells -> a line, emitting each marker exactly once where the style changes.
// Also returns where every original column ended up, which is what re-anchors
// the chord line.
function emit(cells) {
  let out = '', bold = false, italic = false, color = null;
  const moved = [];
  for (const c of cells) {
    if (italic && !c.italic) { out += '*'; italic = false; }
    if (bold && !c.bold) { out += '**'; bold = false; }
    if (color && c.color !== color) { out += '{/c}'; color = null; }
    if (!color && c.color) { out += `{c=${c.color}}`; color = c.color; }
    if (!bold && c.bold) { out += '**'; bold = true; }
    if (!italic && c.italic) { out += '*'; italic = true; }
    moved.push([c.col, out.length]);
    out += c.ch;
  }
  if (italic) out += '*';
  if (bold) out += '**';
  if (color) out += '{/c}';
  return { text: out, moved };
}

// ---- The ops, in style space ------------------------------------------------
//
// Each is a toggle over the SELECTED CELLS: already styled throughout means the
// press turns it off, anything else means turn it on. Colour toggles only against
// itself — the same colour clears, a different colour replaces.
function applyOp(sel, op, hex) {
  // THE ERASER TAKES EVERYTHING OFF. It used to remove only colour, which is
  // what it was built to do and is not what an eraser means: Howard bolded a
  // word, pressed it, and nothing happened. There is no signal in the icon that
  // says "colour only", and bold and italic have their own buttons to toggle
  // with — so one control that puts a selection back to plain text is both what
  // the picture promises and the more useful of the two.
  if (op === 'clear') { sel.forEach(c => { c.color = null; c.bold = false; c.italic = false; }); return; }
  if (op === 'color') {
    const off = sel.every(c => c.color === hex);
    sel.forEach(c => { c.color = off ? null : hex; });
    return;
  }
  const key = op === 'bold' ? 'bold' : 'italic';
  const off = sel.every(c => c[key]);
  sel.forEach(c => { c[key] = !off; });
}

// ---- Re-anchoring the chord line --------------------------------------------

// Where did the character at column `col` go? Columns that vanished (a marker's
// own columns) fall back to the nearest surviving character before them, keeping
// their offset — so a chord parked past the end of the words still lands sensibly.
function newColumn(col, moved) {
  let lo = 0, hi = moved.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (moved[mid][0] <= col) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (best < 0) return col;
  const [from, to] = moved[best];
  return to + (col - from);
}

// Rebuild the chord line so every chord sits over the same character it sat over
// before. Whole tokens are placed, never split — which is what a chord name
// requires: "Bb7" broken into "Bb 7" names a chord that was never in the song,
// and nothing on screen looks wrong.
function reanchorChordLine(chordLine, moved) {
  let out = '';
  for (const t of chordLine.matchAll(/\S+/g)) {
    const target = newColumn(t.index, moved);
    // A chord may never be pushed left into its neighbour; one space is the
    // minimum gap that still reads as two chords. The `out.length` guard is what
    // keeps the FIRST chord honest: an empty line is not a neighbour, so a chord
    // anchored at column 0 belongs at column 0, not one space in.
    out = out.length && out.length >= target ? out + ' ' : out.padEnd(target, ' ');
    out += t[0];
  }
  return out.replace(/[ \t]+$/, '');
}

// ---- The entry point ---------------------------------------------------------

/**
 * Apply a styling op to the source range [start,end), LINE BY LINE, on `text`.
 *
 * Line by line because the parser is per-line: markup must balance within each
 * line, or an open with no close bleeds into the rest of that line and stops
 * dead at the next. In Over-Lyrics mode (`over`) chord lines are never styled,
 * and each styled line's chord line above is re-anchored so the chords stay over
 * their words.
 *
 * Returns { text, selA, selB } — the rebuilt text and the source range now
 * covering the styled span — or null if no line was touched.
 */
export function styleRange(text, op, hex, start, end, over) {
  const lines = text.split('\n');
  const lineStart = [];
  { let idx = 0; for (const ln of lines) { lineStart.push(idx); idx += ln.length + 1; } }

  let firstLine = -1, firstA = 0, lastLine = -1, lastEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const ls = lineStart[i], le = ls + lines[i].length;
    if (le <= start || ls >= end) continue;                  // line outside selection
    const a = Math.max(start, ls) - ls;
    const b = Math.min(end, le) - ls;
    if (b <= a) continue;                                    // nothing on this line
    if (over && isChordLine(lines[i])) continue;             // never style a chord line

    const cells = decorate(lines[i]);
    const sel = cells.filter(c => c.col >= a && c.col < b);
    if (!sel.length) continue;
    // Whitespace-only stretches carry no style anyone can see, and styling them
    // would bracket a run of spaces. Clearing is the exception: removing colour
    // from a selection that happens to include trailing spaces is still a
    // removal, and refusing it is how a stray marker survives a clear.
    if (op !== 'clear' && !sel.some(c => c.ch.trim())) continue;

    applyOp(sel, op, hex);
    const { text: rebuilt, moved } = emit(cells);
    if (rebuilt === lines[i]) continue;                      // nothing actually changed
    lines[i] = rebuilt;
    if (over && i > 0 && isChordLine(lines[i - 1])) {
      lines[i - 1] = reanchorChordLine(lines[i - 1], moved);
    }

    // The styled span in the REBUILT line, for restoring the caret selection.
    const firstSel = newColumn(sel[0].col, moved);
    const lastSel = newColumn(sel[sel.length - 1].col, moved) + 1;
    if (firstLine === -1) { firstLine = i; firstA = firstSel; }
    lastLine = i; lastEnd = lastSel;
  }
  if (firstLine === -1) return null;                         // nothing was styled

  const out = lines.join('\n');
  const newStart = []; { let idx = 0; for (const ln of lines) { newStart.push(idx); idx += ln.length + 1; } }
  return { text: out, selA: newStart[firstLine] + firstA, selB: newStart[lastLine] + lastEnd };
}
