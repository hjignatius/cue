// Converts over-under (chords-above-lyrics) plain text to ChordPro inline format.
//
// Input (fixed-width monospace):
//   G           D          Em         C
//   Amazing grace, how sweet the sound
//
// Output (ChordPro):
//   [G]Amazing grace, [D]how sweet the [Em]sound the [C]sound

// Chord-name token pattern — liberal so it matches common shorthand.
// Quality order matters: maj/min must be tried before m so "maj7" doesn't
// partially match as "m" + unparsed "aj7". m(?:maj|M)? handles minor-major
// seventh chords like Gmmaj7 and GmMaj7. The (\([^)]+\))? group handles
// parenthesised alterations such as C7(b9) and Dm(add9). Alterations allow one
// or two accidentals (b{1,2}/#{1,2}) so double-flat/sharp chords like Gmbb5 and
// C##5 parse — the root stays single-accidental to avoid matching words (e.g.
// "ebb" is not an E-double-flat chord).
const CHORD_TOKEN = /^[A-G][b#]?(maj|min|m(?:maj|M)?|M|dim|aug|sus|add|no|omit)?[0-9]*(sus[24]?|add[0-9]+|b{1,2}[0-9]+|#{1,2}[0-9]+)?(\([^)]+\))?(\/[A-G][b#]?)?$/;

// A strumming/rhythm marker token has NO alphanumeric characters —
// covers Unicode arrows (↑↓), dashes, slashes, and other rhythm glyphs.
function isStrumToken(t) {
  return t.length > 0 && !/[a-zA-Z0-9]/.test(t);
}

// Performance / no-chord annotation tokens allowed on a chord line alongside
// real chord names. Only unambiguous musical markings — common English words
// like "stop", "break", "verse" are intentionally excluded to avoid treating
// lyric lines as chord lines.
const ANNOTATION_TOKEN = /^\(?(n\.?c\.?|no\s*chord|pause|stop|hold|tacet|vamp|sim\.?|cont\.?|[1-9]\d*\s*[xX]|[xX]\s*[1-9]\d*|[xX])\)?\.?$/i;

// Chord-name prefix — matches the chord portion at the very start of a token.
// Must mirror CHORD_TOKEN's quality ordering and include the parenthesised-
// alteration group so splitCompound treats C7(b9) as one token, not two.
const CHORD_PREFIX = /^[A-G][b#]?(?:maj|min|m(?:maj|M)?|M|dim|aug|sus|add|no|omit)?[0-9]*(?:sus[24]?|add[0-9]+|b{1,2}[0-9]+|#{1,2}[0-9]+)?(?:\([^)]+\))?(?:\/[A-G][b#]?)?/;

// Split a compound token into its constituent chord and non-chord parts.
// Handles "G↓", "G(4x)", "Gm7-Gm7/F", "↓G", etc.
// Works iteratively so tokens with multiple chords (e.g. "Gm7-Gm7/F") split fully.
function splitCompound(t) {
  const parts = [];
  let rem = t;
  while (rem.length > 0) {
    const cm = rem.match(CHORD_PREFIX);
    if (cm && cm[0].length > 0) {
      parts.push(cm[0]);
      rem = rem.slice(cm[0].length);
      continue;
    }
    // Non-chord sequence before next chord letter
    const sm = rem.match(/^[^A-G]+(?=[A-G])/);
    if (sm) {
      parts.push(sm[0]);
      rem = rem.slice(sm[0].length);
      continue;
    }
    // Trailing non-chord content with no upcoming chord
    parts.push(rem);
    break;
  }
  return parts.length ? parts : [t];
}

export function isChordLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s+/);
  // Every token must be a chord, strum marker, annotation, or bare asterisk —
  // AND at least one real chord name must be present. This prevents standalone
  // annotation words (pause, stop, NC alone) from being treated as chord lines.
  let hasChord = false;
  const allValid = tokens.every(t => {
    const clean = t.replace(/\*/g, '');
    if (clean === '') return true;
    // Square brackets mean the line is already in ChordPro inline format — not a bare chord line.
    if (clean.includes('[') || clean.includes(']')) return false;
    if (CHORD_TOKEN.test(clean)) { hasChord = true; return true; }
    if (isStrumToken(clean)) return true;
    if (ANNOTATION_TOKEN.test(clean)) return true;
    // Handle compound tokens like "G↓", "G(4x)", "G(hold)" — split and re-validate each part
    const parts = splitCompound(clean);
    if (parts.length > 1) {
      let partHasChord = false;
      const partsOk = parts.every(p => {
        if (CHORD_TOKEN.test(p)) { partHasChord = true; return true; }
        if (isStrumToken(p)) return true;
        if (ANNOTATION_TOKEN.test(p)) return true;
        return false;
      });
      if (partsOk && partHasChord) { hasChord = true; return true; }
    }
    return false;
  });
  return allValid && hasChord;
}

function extractChords(chordLine) {
  const chords = [];
  for (const m of chordLine.matchAll(/\S+/g)) {
    const clean = m[0].replace(/\*/g, '');
    if (!clean) continue; // bare * — skip
    const parts = splitCompound(clean);
    if (parts.length === 1) {
      chords.push({ chord: parts[0], pos: m.index });
    } else {
      const chordParts = parts.filter(p => CHORD_TOKEN.test(p));
      if (chordParts.length === 1 && parts.every(p => CHORD_TOKEN.test(p) || isStrumToken(p))) {
        // Single chord with strum decoration(s) (e.g. D↓): store the full token
        // as the chord name so the decoration appears in the chord row. Diagram
        // lookup strips the decoration via STRUM_SUFFIX in chordDetect.js.
        chords.push({ chord: clean, pos: m.index });
      } else {
        // Multiple chords in one token (e.g. Gm7-Gm7/F, G↓D↓C↓D↓): emit each
        // chord at its column offset. Non-ASCII strum indicators (↓↑ etc.) that
        // immediately follow a chord are merged into its name so they survive
        // into the ChordPro bracket and diagram lookup can strip them via STRUM_SUFFIX.
        // ASCII separators like "-" are excluded so "Gm7-Gm7/F" still splits cleanly.
        let offset = 0;
        let pi = 0;
        while (pi < parts.length) {
          const p = parts[pi];
          if (CHORD_TOKEN.test(p)) {
            let name = p;
            let decorLen = 0;
            while (pi + 1 < parts.length && /^[^\x00-\x7F]+$/.test(parts[pi + 1])) {
              name += parts[pi + 1];
              decorLen += parts[pi + 1].length;
              pi++;
            }
            chords.push({ chord: name, pos: m.index + offset });
            offset += p.length + decorLen;
          } else {
            offset += p.length;
          }
          pi++;
        }
      }
    }
  }
  return chords;
}

function mergeIntoLyricLine(chordLine, lyricLine) {
  const chords = extractChords(chordLine);
  if (chords.length === 0) return lyricLine;

  // Work right-to-left so earlier insertions don't shift later positions.
  let lyric = lyricLine;
  for (let i = chords.length - 1; i >= 0; i--) {
    const { chord, pos } = chords[i];
    // Pad lyric with spaces if the chord sits past the end of the lyric line.
    while (lyric.length < pos) lyric += ' ';
    lyric = lyric.slice(0, pos) + `[${chord}]` + lyric.slice(pos);
  }
  return lyric.trimEnd();
}

// Convert a bare over-lyrics chord line to a bracket-only ChordPro line.
// e.g. "B  F#  G#m7  D#m/F#" → "[B] [F#] [G#m7] [D#m/F#]"
function chordLineToBrackets(line) {
  const chords = extractChords(line);
  if (chords.length === 0) return line;
  return chords.map(c => `[${c.chord}]`).join(' ');
}

// Returns { converted: string, wasConverted: boolean }
export function convertVisualToChordPro(raw) {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out = [];
  let changed = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    if (isChordLine(line) && next !== undefined && !isChordLine(next)) {
      // Chord line immediately before a lyric — merge chord positions into lyric.
      out.push(mergeIntoLyricLine(line, next));
      changed = true;
      i += 2;
    } else if (isChordLine(line)) {
      // Chord-only line NOT immediately before a lyric (followed by another chord
      // line, or at end of song). Emit as a bracket-only ChordPro line so
      // parseChordPro doesn't misclassify it as lyrics.
      out.push(chordLineToBrackets(line));
      changed = true;
      i++;
    } else {
      out.push(line);
      i++;
    }
  }

  return { converted: out.join('\n'), wasConverted: changed };
}
