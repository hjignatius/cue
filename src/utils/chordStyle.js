import { parseChordPro } from './chordPro.js';
import { isChordLine, convertVisualToChordPro } from './visualImport.js';

// Detect whether text uses bracketed inline chords or over-lyrics format.
// Returns 'brackets' | 'over' | null
export function detectChordStyle(text) {
  if (!text?.trim()) return null;
  // Bracketed inline chords — [G], [Am], [F#m7], etc.
  if (/\[[A-G][b#]?[^\]\n]{0,8}\]/.test(text)) return 'brackets';
  // Over-lyrics — a chord-token-only line directly above a lyric line
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (isChordLine(lines[i]) && lines[i + 1].trim() && !isChordLine(lines[i + 1])) {
      return 'over';
    }
  }
  return null;
}

// Convert ChordPro inline-bracket text to over-lyrics (chord line above lyric line).
export function convertToOver(text) {
  const lines = parseChordPro(text);
  const out = [];

  for (const line of lines) {
    if (line.type === 'chords') {
      // Detect whether there is any real lyric content (not just inter-chord spaces).
      const hasLyric = line.segments.some(s => s.text && s.text.trim() !== '');
      if (!hasLyric) {
        // Chord-only line (e.g. [>]  [G]  [G6] …). KEEPING THE COLUMNS IS THE
        // WHOLE POINT: on an intro or a turnaround there are no words, so the
        // spacing IS the notation — it says where in the bar each chord falls.
        //
        // Placed at the column, exactly as the with-lyrics branch below does it,
        // rather than by appending each chord's name and then the text after it.
        // Appending was an asymmetry with the way back: converting TO brackets
        // records a chord's column, while appending re-spent that column on the
        // NAME and then added the gap again. So every switch between the two
        // formats widened the line by the width of each chord name, for ever:
        //
        //   [Am6] [D6]  ->  [Am6]    [D6]  ->  [Am6]       [D6]  ->  …
        //
        // Reading the column instead makes the two directions agree, so a line
        // authored in over-lyrics round-trips unchanged and one authored in
        // brackets settles after a single pass.
        let s = '';
        let col = 0;   // column in the (wordless) lyric this line sits over
        for (const seg of line.segments) {
          if (seg.chord != null) {
            while (s.length < col) s += ' ';
            if (s.length > 0 && !s.endsWith(' ')) s += ' ';   // names must not fuse
            s += seg.chord;
          }
          if (seg.text) col += seg.text.length;
        }
        s = s.trimEnd();
        if (s.trim()) out.push(s);
      } else {
        let chordLine = '';
        let lyricLine = '';
        for (const seg of line.segments) {
          if (seg.chord !== null) {
            while (chordLine.length < lyricLine.length) chordLine += ' ';
            // ALWAYS leave a space, not only when two chords share a column.
            //
            // A chord NAME is usually wider than the syllable it sits over, so by
            // the time the next chord's column comes round the chord line has
            // already passed it and the padding loop above has nothing to do.
            // Without this the two names fuse: "[Am6]   [D6]  [D7]" at the end of
            // a line came out as "Am6D6D7", which is unreadable and uneditable in
            // the Text pane — and not even positionally safe, since reading
            // "Am7B" back splits it at the name boundary and lands the second
            // chord on whatever character that offset happens to be.
            //
            // The cost is that a chord whose column has been overrun sits one or
            // more columns right of where it belongs. That is the format's own
            // limit: two chords closer together than the first one's name cannot
            // both be drawn at their true columns AND be told apart. Readable and
            // slightly late beats exact and illegible.
            if (chordLine.length > 0 && !chordLine.endsWith(' ')) chordLine += ' ';
            chordLine += seg.chord;
          }
          if (seg.text) lyricLine += seg.text;
        }
        if (chordLine.trim()) out.push(chordLine.trimEnd());
        out.push(lyricLine.trimEnd());
      }
    } else if (line.type === 'lyrics') {
      out.push(line.segments?.[0]?.text?.trimEnd() ?? '');
    } else if (line.type === 'comment') {
      out.push(`# ${line.text}`);
    } else if (line.type === 'empty') {
      out.push('');
    }
    // directives are in metadata, omit from display text
  }

  return out.join('\n');
}

// Convert over-lyrics text to ChordPro inline-bracket format.
export function convertToBrackets(text) {
  return convertVisualToChordPro(text).converted;
}

// The same conversion, plus the offset map that takes a position in the
// CONVERTED text back to the character it came from in `text`. Null when the
// text cannot be mapped (CR line endings) — callers must not guess.
export function bracketSourceMap(text) {
  return convertVisualToChordPro(text || '').map;
}
