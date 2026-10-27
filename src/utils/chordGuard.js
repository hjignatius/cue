// Checks on what an AI rewrite hands back.
//
// Clean up formatting and Detect structure send the whole chart to the model and
// get the whole chart back. Both are told never to touch a chord, and almost
// always don't — but "almost" is a model's word. Howard's Frosty the Snowman
// lost the [C] that opens the first line, on some runs and not others: the
// model was clearing the empty "{c: }" lines and now and then took the [C]
// below one of them for more of the same.
//
// So the chords are counted on the way out and on the way back, and a reply
// that changed them is not applied. Chords only: Clean up is ALLOWED to drop
// lines (website clutter), so a word count would refuse the very thing it is
// for, while a chord has no business disappearing from either tool.
import { parseChordPro } from './chordPro.js';
import { convertToBrackets } from './chordStyle.js';

// Every chord in the chart, in order, whichever format it is written in, with
// the words it sits on — those are what tell you WHICH [C] went.
function chordsWithWords(text) {
  const out = [];
  for (const line of parseChordPro(convertToBrackets(String(text ?? '')))) {
    for (const seg of line.segments || []) {
      if (seg.chord) out.push({ chord: seg.chord, words: (seg.text || '').trim().split(/\s+/).slice(0, 4).join(' ') });
    }
  }
  return out;
}

export function chordSequence(text) {
  return chordsWithWords(text).map(c => c.chord);
}

// null when `after` has exactly the chords of `before`; otherwise the first
// place they part, as { was, now, words }: a dropped chord has no `now`, an
// added one no `was`. `words` is the lyric under that chord — empty when it sat
// on none.
//
// The counts decide which it is. Comparing position by position alone would
// call a dropped opening [C] "changed [C] to [F]", because everything after it
// has moved up one.
export function chordChange(before, after) {
  const a = chordsWithWords(before);
  const b = chordsWithWords(after);
  let i = 0;
  while (i < a.length && i < b.length && a[i].chord === b[i].chord) i++;
  if (i === a.length && i === b.length) return null;
  if (a.length > b.length) return { was: a[i].chord, now: null, words: a[i].words };
  if (b.length > a.length) return { was: null, now: b[i].chord, words: b[i].words };
  return { was: a[i].chord, now: b[i].chord, words: a[i].words };
}

// A ChordPro directive with nothing in it — "{c: }", "{comment:}" — shows
// nothing and means nothing. Taken out before the chart goes to the model, so
// the model is never asked to decide what is leftover next to a [C].
// "{c=#e11d48}" is Cue's colour styling, not a directive: it has no colon.
const EMPTY_DIRECTIVE = /^[ \t]*\{[a-zA-Z][\w-]*:[ \t]*\}[ \t]*$/;

export function stripEmptyDirectives(text) {
  const lines = String(text ?? '').split('\n');
  const kept = lines.filter(l => !EMPTY_DIRECTIVE.test(l.replace(/\r$/, '')));
  return kept.length === lines.length ? String(text ?? '') : kept.join('\n');
}
