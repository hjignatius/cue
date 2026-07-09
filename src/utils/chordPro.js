/**
 * ChordPro parser — converts ChordPro text into structured line objects.
 *
 * ChordPro format: [G]Amazing [D]grace, how [Em]sweet the [C]sound
 * Result: array of "segments" per line, each segment has { chord, text }
 */

export function parseChordPro(text) {
  const lines = text.split('\n');
  return lines.map(parseLine);
}

function parseLine(rawLine) {
  const line = rawLine.replace(/\r$/, ''); // handle \r\n line endings from Windows/OnSong files
  // Directive lines: {title: ...}, {artist: ...}, etc.
  const directiveMatch = line.match(/^\{(.+?):\s*(.+?)\}$/);
  if (directiveMatch) {
    return { type: 'directive', key: directiveMatch[1].trim(), value: directiveMatch[2].trim() };
  }

  // Comment lines
  if (line.startsWith('#')) {
    return { type: 'comment', text: line.slice(1).trim() };
  }

  // Empty lines = section break
  if (line.trim() === '') {
    return { type: 'empty' };
  }

  // Check if the line contains chords
  const chordPattern = /\[([^\]]+)\]/;
  if (!chordPattern.test(line)) {
    // Plain lyric line with no chords
    return { type: 'lyrics', segments: [{ chord: null, text: line }] };
  }

  // Parse inline chords
  const segments = [];
  let remaining = line;
  const regex = /\[([^\]]+)\]([^\[]*)/g;
  let lastIndex = 0;
  let firstMatch = true;

  // Handle any leading text before first chord
  const firstChordIndex = line.indexOf('[');
  if (firstChordIndex > 0) {
    segments.push({ chord: null, text: line.slice(0, firstChordIndex) });
  }

  let match;
  while ((match = regex.exec(line)) !== null) {
    segments.push({ chord: match[1], text: match[2] });
  }

  return { type: 'chords', segments };
}

export function hasChords(parsedLines) {
  return parsedLines.some(l => l.type === 'chords');
}

// Repeat markers like (4x), (x4), (2X), ( x 4 ) — performance annotations the
// renderers color in the accent purple. Numeric-only so ordinary lyric
// parentheses such as "(ooh)" are never matched.
const REPEAT_MARKER = /\(\s*(?:\d{1,3}\s*[xX]|[xX]\s*\d{1,3})\s*\)/g;

/**
 * Split a lyric string into styled runs so every renderer can color repeat
 * markers identically. Returns `[{ text, marker }]`; `marker:true` runs are
 * recognized repeat markers. The characters are unchanged (only split), so
 * chord-over-lyric alignment is preserved.
 */
export function splitAnnotations(text) {
  const str = text || '';
  const runs = [];
  let last = 0;
  let m;
  REPEAT_MARKER.lastIndex = 0;
  while ((m = REPEAT_MARKER.exec(str)) !== null) {
    if (m.index > last) runs.push({ text: str.slice(last, m.index), marker: false });
    runs.push({ text: m[0], marker: true });
    last = m.index + m[0].length;
  }
  if (last < str.length) runs.push({ text: str.slice(last), marker: false });
  if (runs.length === 0) runs.push({ text: str, marker: false });
  return runs;
}

/**
 * Attach each `comment` (section label) to the next non-empty content
 * line as a `label` property, and drop empty lines that directly follow
 * a label (they were only there for visual spacing, now unnecessary).
 * Lines that aren't section-starters get `label: null`.
 */
export function attachSectionLabels(parsedLines) {
  const result = [];
  let pending = null;

  for (const line of parsedLines) {
    if (line.type === 'comment') {
      pending = line.text;
      continue;
    }
    if (line.type === 'empty' && pending) {
      continue; // swallow spacer empties while holding a label
    }
    result.push({ ...line, label: pending });
    pending = null;
  }

  return result;
}

/**
 * Expand repeated section references.
 *
 * A section header (`# Chorus`) followed by body lines *defines* that section.
 * Typing the same header again later with no body of its own *references* it,
 * and gets expanded to the previously-defined body — so a chorus or verse can
 * be repeated without retyping it.
 *
 * Rules:
 *   - Matching is case-insensitive on the trimmed label (`# chorus` === `# Chorus`).
 *   - Only *backward* references expand: a section must be defined before it can
 *     be repeated. A bare header with no earlier definition is left untouched
 *     (it stays an ordinary empty section label).
 *   - The most recent definition of a label wins.
 *
 * Runs on parsed lines, before attachSectionLabels(), so every renderer
 * (preview, PDF, performance) shares the same behaviour.
 */
export function expandSections(parsedLines) {
  const defs = new Map(); // normalized label -> body content lines (no surrounding empties)
  const out = [];
  let i = 0;

  while (i < parsedLines.length) {
    const line = parsedLines[i];
    if (line.type !== 'comment') {
      out.push(line);
      i++;
      continue;
    }

    // Collect this section's body: every line up to the next section header.
    let j = i + 1;
    const body = [];
    while (j < parsedLines.length && parsedLines[j].type !== 'comment') {
      body.push(parsedLines[j]);
      j++;
    }

    const key = line.text.trim().toLowerCase();
    const hasContent = body.some(l => l.type !== 'empty');

    if (hasContent) {
      // Definition — remember its content, emit it exactly as written.
      defs.set(key, trimSurroundingEmpties(body));
      out.push(line, ...body);
    } else if (key && defs.has(key)) {
      // Reference — emit the header + stored body, then keep the writer's own
      // trailing blank lines so the spacing before the next section is intact.
      out.push(line, ...defs.get(key), ...body);
    } else {
      // Empty section with no prior definition — leave exactly as typed.
      out.push(line, ...body);
    }
    i = j;
  }

  return out;
}

function trimSurroundingEmpties(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].type === 'empty') start++;
  while (end > start && lines[end - 1].type === 'empty') end--;
  return lines.slice(start, end);
}
