// Taking non-chart lines OUT of a pasted song, once their contents have been
// lifted into the song's own fields.
//
// A pasted chart usually arrives with a header — the title, the artist, a link,
// a line of site furniture. Reading those into the proper fields is only half
// the job: left in the text they are sung, printed and presented as though they
// were lyrics.
//
// THE ASYMMETRY THAT SHAPES THIS: a wrong field costs one tap to undo. A deleted
// lyric line is gone. So the model proposes lines by their exact text, Cue finds
// them itself, and anything it cannot find — or that looks like part of the
// chart — is refused and reported rather than guessed at. The model never gets
// to say "delete line 7".

import { isChordLine } from './visualImport.js';

const BRACKET_CHORD = /\[[^\]]+\]/;

// Why a proposed line was refused, for the dialog to show.
export const REFUSED = {
  notFound: 'not found in the chart',
  chords:   'looks like part of the chart',
  blank:    'blank',
};

// Work out which proposed lines can be removed.
//
// Returns { remove: [{ index, line }], refused: [{ line, why }] }, in the order
// the lines appear in the song. Matching is on the trimmed text, because a model
// asked to echo a line back rarely reproduces its leading spaces; each proposal
// consumes at most one line, so a header repeated later in the song keeps its
// other copies.
export function planLineRemoval(text, proposed = []) {
  const lines = String(text ?? '').split('\n');
  const taken = new Set();
  const remove = [];
  const refused = [];

  for (const raw of proposed) {
    const want = String(raw ?? '').trim();
    if (!want) { refused.push({ line: String(raw ?? ''), why: REFUSED.blank }); continue; }

    const idx = lines.findIndex((l, i) => !taken.has(i) && l.trim() === want);
    if (idx === -1) { refused.push({ line: want, why: REFUSED.notFound }); continue; }

    // The guard that matters: never take out something musical, whatever the
    // model thought. A header is prose; a chart line has chords in it.
    if (isChordLine(lines[idx]) || BRACKET_CHORD.test(lines[idx])) {
      refused.push({ line: want, why: REFUSED.chords });
      continue;
    }

    taken.add(idx);
    remove.push({ index: idx, line: lines[idx] });
  }

  remove.sort((a, b) => a.index - b.index);
  return { remove, refused };
}

// Remove the given line indices, and strip any blank lines the header left at
// the top of the song.
//
// That is ALL it does. An earlier version also collapsed runs of blank lines,
// which is a tidy-up nobody asked for: blank lines separate sections, this tool
// was invoked to lift a header, and quietly reformatting the rest of a chart
// while doing it is how a small fix earns a reputation. Removing nothing
// returns the text untouched, byte for byte.
export function applyLineRemoval(text, indices = []) {
  const drop = new Set(indices);
  if (drop.size === 0) return text;
  const kept = String(text ?? '').split('\n').filter((_, i) => !drop.has(i));
  while (kept.length && kept[0].trim() === '') kept.shift();
  return kept.join('\n');
}
