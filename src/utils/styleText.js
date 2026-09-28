// Lyric styling: the raw-text surgery behind the Bold / Italic / colour buttons.
//
// LIFTED OUT OF EditorView so it can be run without a browser. This is the part
// that has to be exactly right in Over-Lyrics mode — a chord's column IS which
// syllable it is sung on — and "exactly right" is a claim that needs a test, not
// a read-through. See scripts/styleRoundTrip.mjs.

import { isChordLine } from './visualImport.js';

// Styling ops for the toolbar. Each toggles by checking the selection's own
// delimiters and returns { styled, ds, de }: the replacement text, plus the
// characters added(+)/removed(-) at the selection's START (ds) and END (de).
// ds/de let over-mode keep the chord line above aligned. Good enough for the
// common single-style case; combined styles may need a second tap.
const COLOR_SPAN = /^\{c=([^}]+)\}([\s\S]*)\{\/c\}$/;
// Each op returns { styled, edits }: the replacement for the selection, plus the
// chord-line edits to mirror — [relCol, delta] pairs where relCol is measured
// from the selection start and delta is spaces to insert(+)/remove(-). Applying
// the SAME shifts to the chord line above keeps chords over their words in the
// raw over-lyrics text (apply and clear are exact inverses).
function opBold(sel) {
  if (sel.startsWith('**') && sel.endsWith('**') && sel.length >= 4)
    return { styled: sel.slice(2, -2), edits: [[0, -2], [sel.length - 2, -2]] };
  return { styled: `**${sel}**`, edits: [[0, 2], [sel.length, 2]] };
}
function opItalic(sel) {
  if (sel.startsWith('*') && sel.endsWith('*') && !sel.startsWith('**') && !sel.endsWith('**') && sel.length >= 2)
    return { styled: sel.slice(1, -1), edits: [[0, -1], [sel.length - 1, -1]] };
  return { styled: `*${sel}*`, edits: [[0, 1], [sel.length, 1]] };
}
function opColor(sel, hex) {
  const m = COLOR_SPAN.exec(sel);
  if (m) {
    const oldPre = m[0].length - m[2].length - 4; // length of `{c=OLD}`
    if (m[1].trim() === hex) return { styled: m[2], edits: [[0, -oldPre], [sel.length - 4, -4]] }; // same → clear
    const newPre = `{c=${hex}}`.length;
    return { styled: `{c=${hex}}${m[2]}{/c}`, edits: newPre === oldPre ? [] : [[0, newPre - oldPre]] }; // recolor
  }
  return { styled: `{c=${hex}}${sel}{/c}`, edits: [[0, `{c=${hex}}`.length], [sel.length, 4]] };
}
function opClear(sel) {
  const m = COLOR_SPAN.exec(sel);
  if (!m) return { styled: sel, edits: [] };
  const oldPre = m[0].length - m[2].length - 4;
  return { styled: m[2], edits: [[0, -oldPre], [sel.length - 4, -4]] };
}

// A chord name is ONE thing. If an insertion column lands strictly inside a
// chord token, pushing spaces in there does not move the chord — it breaks it,
// turning "Am" into "A  m" and "Bb7" into "Bb 7". The song then names a chord
// that was never in it, which is worse than a chord over the wrong syllable
// because there is nothing on screen that looks like a mistake.
//
// Snap to the END of the token instead, and the chord stays put. That is the
// right end: a chord whose token STARTS before the insertion is anchored to a
// word that starts before the insertion too, so the text under it has not moved
// and neither should it. A chord starting exactly AT the column is over text
// that did move, and falls through to the normal path, shifting with it.
function snapOutOfToken(s, col) {
  if (col <= 0 || col >= s.length) return col;
  if (s[col] === ' ' || s[col - 1] === ' ') return col;   // already on a boundary
  let end = col;
  while (end < s.length && s[end] !== ' ') end++;
  return end;
}

// Insert(+)/remove(-) `delta` space columns at `col`. Removal only eats spaces,
// never chord characters.
function editChordCol(s, col, delta) {
  if (delta > 0) {
    const p = s.length < col ? s.padEnd(col, ' ') : s;
    const at = snapOutOfToken(p, col);
    return p.slice(0, at) + ' '.repeat(delta) + p.slice(at);
  }
  if (delta < 0) {
    let n = -delta, out = '';
    for (let i = 0; i < s.length; i++) {
      if (i >= col && n > 0 && s[i] === ' ') { n--; continue; }
      out += s[i];
    }
    return out;
  }
  return s;
}
// Apply the chord-line edits (in original columns, offset by the selection start
// `a`) right-to-left so earlier columns stay valid as later ones shift.
function repadChordLine(chordLine, a, edits) {
  let s = chordLine;
  for (const [relCol, delta] of [...edits].sort((x, y) => y[0] - x[0])) {
    s = editChordCol(s, a + relCol, delta);
  }
  return s.replace(/[ \t]+$/, '');
}

// Apply a styling op to the source range [start,end], LINE BY LINE, on `text`.
// The parser is per-line, so markup must be balanced within each line — wrapping a
// whole multi-line block as one span would leave `{c=}` open on the first line and
// `{/c}` orphaned on the last, so each touched line's selected portion is styled
// independently. In Over-Lyrics mode (`over`), chord lines are skipped and each
// styled line's chord line above is re-padded by the same column shifts so chords
// stay over their words. Returns { text, selA, selB } (the rebuilt text and the
// new source range covering the styled span), or null if nothing changed.
export function styleRange(text, op, hex, start, end, over) {
  const lines = text.split('\n');
  const lineStart = [];
  { let idx = 0; for (const ln of lines) { lineStart.push(idx); idx += ln.length + 1; } }

  let firstLine = -1, firstA = 0, lastLine = -1, lastEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const ls = lineStart[i], le = ls + lines[i].length;
    if (le <= start || ls >= end) continue;                 // line outside selection
    const a = Math.max(start, ls) - ls;
    const b = Math.min(end, le) - ls;
    if (b <= a) continue;                                    // nothing on this line
    if (over && isChordLine(lines[i])) continue;             // never style a chord line
    const seg = lines[i].slice(a, b);
    if (op !== 'clear' && !seg.trim()) continue;             // skip whitespace-only bits
    const { styled, edits } = op === 'bold'   ? opBold(seg)
                            : op === 'italic' ? opItalic(seg)
                            : op === 'color'  ? opColor(seg, hex)
                            : op === 'clear'  ? opClear(seg)
                            :                    { styled: seg, edits: [] };
    lines[i] = lines[i].slice(0, a) + styled + lines[i].slice(b);
    if (over && edits.length && i > 0 && isChordLine(lines[i - 1])) {
      lines[i - 1] = repadChordLine(lines[i - 1], a, edits);
    }
    if (firstLine === -1) { firstLine = i; firstA = a; }
    lastLine = i; lastEnd = a + styled.length;
  }
  if (firstLine === -1) return null;                         // nothing was styled

  const out = lines.join('\n');
  const newStart = []; { let idx = 0; for (const ln of lines) { newStart.push(idx); idx += ln.length + 1; } }
  return { text: out, selA: newStart[firstLine] + firstA, selB: newStart[lastLine] + lastEnd };
}
