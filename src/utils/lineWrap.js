// Where an over-lyrics line may break when it's too wide for the column.
//
// THE BUG THIS EXISTS FOR: a line is split into segments at every CHORD, and the
// renderers laid those segments out in a wrapping flex row. So the browser was
// free to break wherever a chord sat — and chord charts put chords inside words
// constantly:
//
//     It was a won[G]derful night
//
// segments as "It was a won" / "derful night" — break between them and the stage
// screen reads "It was a won / derful night". Chord positions are not word
// boundaries.
//
// The fix has two levels, because a run that must stay together can contain more
// than one chord ("won" + [G]"derful"), and each chord needs its own column to
// sit above:
//
//   unit    — a group that must NOT break (rendered as a non-wrapping row)
//   column  — one chord + the text beneath it (exactly what renderers drew before)
//
// Nothing here changes WHICH text a chord sits above, so alignment is untouched;
// it only decides where a break is legal. Used by Present, the Preview pane and
// the PDF export so all three break identically.

const isSpace = (c) => /\s/.test(c);

// Split one segment's styled runs into columns at word boundaries — that is,
// wherever whitespace is followed by non-whitespace. Trailing spaces stay with
// the word they follow, so a wrapped line never starts with a space.
function splitRunsAtWords(runs) {
  const columns = [];
  let cur = [];
  let prevChar = '';

  for (const run of runs) {
    const t = run.text || '';
    if (!t) continue;
    let start = 0;
    for (let i = 0; i < t.length; i++) {
      const breakHere = i === 0
        ? (prevChar && isSpace(prevChar) && !isSpace(t[0]))
        : (isSpace(t[i - 1]) && !isSpace(t[i]));
      if (!breakHere) continue;
      if (i > start) cur.push({ ...run, text: t.slice(start, i), src: run.src + start });
      if (cur.length) { columns.push(cur); cur = []; }
      start = i;
    }
    cur.push({ ...run, text: t.slice(start), src: run.src + start });
    prevChar = t[t.length - 1];
  }
  if (cur.length) columns.push(cur);
  return columns;
}

// styled segments -> units of columns.
//
// Pass the output of styleSegments(); the columns it returns carry the same
// { chord, text, styledRuns } shape the renderers already expect, so only the
// extra nesting level is new.
export function wrapUnits(segs) {
  // 1. Break each segment into columns at its own word boundaries, so a long
  //    stretch with no chords in it can still wrap. The chord belongs to the
  //    first column — that's the text it was drawn above.
  const columns = [];
  for (const seg of segs || []) {
    const runs = seg.styledRuns || [];
    const pieces = runs.length ? splitRunsAtWords(runs) : [[]];
    pieces.forEach((pieceRuns, i) => {
      columns.push({
        ...seg,
        chord: i === 0 ? seg.chord : null,
        text: pieceRuns.map(r => r.text).join(''),
        styledRuns: pieceRuns,
      });
    });
  }

  // 2. Weld columns together across segment boundaries unless the previous one
  //    ended in whitespace. This is the step that keeps "won" + [G]"derful"
  //    on one line, and it is the whole point of the exercise.
  const units = [];
  for (const col of columns) {
    const prev = units[units.length - 1];
    const prevText = prev ? prev[prev.length - 1].text : '';
    const canBreak = !prev || (prevText && isSpace(prevText[prevText.length - 1]));
    if (canBreak) units.push([col]);
    else prev.push(col);
  }
  return units;
}
