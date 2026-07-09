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
        // Chord-only line (e.g. [>]  [G]  [G6] …): reconstruct by joining each
        // chord name with the spacing that originally separated the brackets.
        // This preserves spacing so the round-trip doesn't merge chord names.
        const chordOnlyLine = line.segments
          .map(s => (s.chord != null ? s.chord : '') + (s.text ?? ''))
          .join('')
          .trimEnd();
        if (chordOnlyLine.trim()) out.push(chordOnlyLine);
      } else {
        let chordLine = '';
        let lyricLine = '';
        for (const seg of line.segments) {
          if (seg.chord !== null) {
            while (chordLine.length < lyricLine.length) chordLine += ' ';
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
