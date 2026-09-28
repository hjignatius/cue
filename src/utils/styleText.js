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
// ---- The ops -----------------------------------------------------------------
//
// Each op takes the selected text and returns { styled, edits }: its replacement,
// plus the chord-line edits to mirror — [relCol, delta] pairs measured from the
// selection start, where delta is columns to insert(+) or remove(-). Applying the
// same shifts to the chord line above is what keeps chords over their words.
//
// THEY NORMALISE RATHER THAN PATTERN-MATCH, and that is the whole design. The
// first version asked whether the selection WAS exactly a `{c=...}...{/c}` span,
// or did start and end with `**`. Anything else fell through and got wrapped
// again, so colouring a row that already held a coloured word nested one span
// inside another:
//
//   {c=#16a34a}Hello {c=#dc2626}darkness{/c} my{/c} old friend
//
// and the eraser then peeled one layer per press — Howard's "it started at the
// back of the selection and erased a word at a time" — or, when the selection was
// not a whole span, matched nothing and did nothing at all. Intermittent by
// construction: whether it worked depended on which markers your selection
// happened to line up with.
//
// So every op now STRIPS its own markup across the whole selection first, and
// then decides once whether to re-wrap. Two consequences worth knowing: the
// result can never nest, and one press always finishes the job.

const COLOR_OPEN = /^\{c=([^}]*)\}/;

// Walk a selection, removing `kind`'s markers and leaving the other kinds alone.
// Returns the stripped text, the chord-line edits for what was removed, whether
// EVERY visible character was already inside this style (which is what makes a
// press a toggle-off), and the colours that were found.
function scanMarkers(sel, kind) {
  let out = '', i = 0, depth = 0, gap = false, seen = false;
  const edits = [], hexes = new Set();
  while (i < sel.length) {
    // Bold before italic: `**` is one bold marker, never two italic ones.
    if (sel.startsWith('**', i)) {
      if (kind === 'bold') { edits.push([i, -2]); depth = depth ? 0 : 1; }
      else out += '**';
      i += 2; continue;
    }
    if (sel[i] === '*') {
      if (kind === 'italic') { edits.push([i, -1]); depth = depth ? 0 : 1; }
      else out += '*';
      i += 1; continue;
    }
    if (sel[i] === '{') {
      const m = COLOR_OPEN.exec(sel.slice(i));
      if (m) {
        if (kind === 'color') { edits.push([i, -m[0].length]); depth++; hexes.add(m[1].trim()); }
        else out += m[0];
        i += m[0].length; continue;
      }
      if (sel.startsWith('{/c}', i)) {
        if (kind === 'color') { edits.push([i, -4]); depth = Math.max(0, depth - 1); }
        else out += '{/c}';
        i += 4; continue;
      }
    }
    if (sel[i].trim()) { seen = true; if (!depth) gap = true; }
    out += sel[i];
    i += 1;
  }
  return { stripped: out, edits, fully: seen && !gap, hexes };
}

// Strip, then wrap once — or, when the whole selection already carried the style,
// strip and stop. That is the toggle.
function toggle(sel, kind, open, close) {
  const { stripped, edits, fully } = scanMarkers(sel, kind);
  if (fully) return { styled: stripped, edits };
  return {
    styled: open + stripped + close,
    edits: [...edits, [0, open.length], [sel.length, close.length]],
  };
}

function opBold(sel)   { return toggle(sel, 'bold', '**', '**'); }
function opItalic(sel) { return toggle(sel, 'italic', '*', '*'); }

// Colour is a toggle only against ITSELF: the same colour again clears it, a
// different colour replaces it. Replacing has to strip first too, or the old
// span survives inside the new one.
function opColor(sel, hex) {
  const { stripped, edits, fully, hexes } = scanMarkers(sel, 'color');
  const sameThroughout = fully && hexes.size === 1 && [...hexes][0] === hex;
  if (sameThroughout) return { styled: stripped, edits };
  const open = `{c=${hex}}`;
  return { styled: open + stripped + '{/c}', edits: [...edits, [0, open.length], [sel.length, 4]] };
}

// The eraser. Removes every colour marker in the selection, however many spans
// it spreads across and however they are nested, in one press.
function opClear(sel) {
  const { stripped, edits } = scanMarkers(sel, 'color');
  return { styled: stripped, edits };
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

// Grow a selection outward over markup that ALREADY wraps it.
//
// Every op toggles by inspecting its own delimiters — opBold asks whether the
// selection starts and ends with `**`, opClear whether it is a whole
// `{c=...}...{/c}` span. That works from the Text pane, where the markers are
// visible characters you can drag across. It cannot work from the Preview, which
// renders the WORD and not the markup around it, so the range handed back covers
// "Hello" while the markers sit just outside it.
//
// The result was an eraser that worked only when the selection happened to
// include the markers — "intermittent for both the text and preview sides" — and
// a bold button that, pressed twice on the same word, produced `****Hello****`
// instead of toggling off.
//
// So before an op looks at its delimiters, hand it the delimiters. Only markup
// DIRECTLY abutting the selection on both sides counts, so this never reaches
// past what the selection is actually inside.
const COLOR_OPEN_AT_END = /\{c=[^}]*\}$/;
function growToWrappers(line, a, b, op) {
  const before = line.slice(0, a), after = line.slice(b);
  if (op === 'bold') {
    if (before.endsWith('**') && after.startsWith('**')) return [a - 2, b + 2];
  } else if (op === 'italic') {
    // A single `*`, not one half of a `**`: bold wrapping must not be mistaken
    // for italic wrapping, or toggling italic would eat one asterisk of each pair
    // and leave the line malformed.
    if (before.endsWith('*') && !before.endsWith('**') && after.startsWith('*') && !after.startsWith('**'))
      return [a - 1, b + 1];
  } else if (op === 'color' || op === 'clear') {
    const m = COLOR_OPEN_AT_END.exec(before);
    if (m && after.startsWith('{/c}')) return [a - m[0].length, b + 4];
  }
  return [a, b];
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
    let a = Math.max(start, ls) - ls;
    let b = Math.min(end, le) - ls;
    if (b <= a) continue;                                    // nothing on this line
    if (over && isChordLine(lines[i])) continue;             // never style a chord line
    [a, b] = growToWrappers(lines[i], a, b, op);
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
