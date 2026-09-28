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
// The degree part is (?:[0-9]+[-+][0-9]+|[0-9]*): a plain degree, OR a degree
// with a jazz dash/plus alteration like "7-5"/"7+5". Requiring a digit before
// the dash keeps "A-7" (dash-minor), "F-150", "B-52" from matching as chords.
// aug/dim and the +/° symbols are also accepted AFTER the degree (A7aug, A7+)
// and as a bare quality (A°, A°7) — otherwise one such token turns its whole
// line to plain text, since chord-line detection needs every token to parse.
const CHORD_TOKEN = /^[A-G][b#]?(maj|min|m(?:maj|M)?|M|dim|aug|sus|add|no|omit|°)?(?:[0-9]+[-+][0-9]+|[0-9]*)(sus[24]?|add[0-9]+|aug|dim|\+|b{1,2}[0-9]+|#{1,2}[0-9]+)?(\([^)]+\))?(\/[A-G][b#]?)?$/;

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
const CHORD_PREFIX = /^[A-G][b#]?(?:maj|min|m(?:maj|M)?|M|dim|aug|sus|add|no|omit|°)?(?:[0-9]+[-+][0-9]+|[0-9]*)(?:sus[24]?|add[0-9]+|aug|dim|\+|b{1,2}[0-9]+|#{1,2}[0-9]+)?(?:\([^)]+\))?(?:\/[A-G][b#]?)?/;

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
    // A whole no-chord / performance marker (N.C., NC, (nc), pause, tacet, x4…)
    // is kept verbatim — never split into letters. Otherwise "N.C." would lose
    // its "N." and survive as a bogus [C] chord.
    if (ANNOTATION_TOKEN.test(clean)) { chords.push({ chord: clean, pos: m.index }); continue; }
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
//
// KEEPING THE COLUMNS IS THE WHOLE POINT. This used to join the chords with a
// single space — "Fm7     Bb7" came out "[Fm7] [Bb7]" — which throws away the one
// thing a chord-only line carries. On an intro or a turnaround there are no words,
// so the spacing IS the notation: it says where in the bar each chord falls. Four
// evenly-spaced lines came back with their gaps collapsed at random.
//
// Merging into an empty lyric does exactly the right thing already: it pads to
// each chord's original column. One implementation, and a bare chord line now
// converts identically whether it is followed by another chord line, a blank, or
// nothing at all.
function chordLineToBrackets(line) {
  const chords = extractChords(line);
  if (chords.length === 0) return line;
  return mergeIntoLyricLine(line, '');
}

// Returns { converted: string, wasConverted: boolean }
export function convertVisualToChordPro(raw) {
  const norm = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = norm.split('\n');
  const out = [];
  // SOURCE OFFSET PER OUTPUT CHARACTER, so a caller holding a position in the
  // CONVERTED text can find the character it came from in the original.
  //
  // WHY THIS EXISTS: the editor's Preview renders from the converted text and
  // labels each lyric run with its offset there. In brackets that offset is also
  // the offset in the real song, because converting a bracketed song changes
  // nothing — which is the only reason styling from the Preview ever worked. In
  // over-lyrics the two strings are different lengths and different shapes: the
  // chord lines are gone and [C] markers have appeared. Every offset after the
  // first chord line pointed at an earlier character than the user picked, so
  // selecting a word coloured something above and to the left of it.
  //
  // Null when the input had CR line endings: the normalisation above changes
  // lengths, so the map would describe a string the caller does not hold. Every
  // caller must treat null as "cannot map" rather than guessing.
  const mappable = norm === raw;
  const map = [];
  const lineStart = [];
  { let idx = 0; for (const ln of lines) { lineStart.push(idx); idx += ln.length + 1; } }
  // Record one emitted line's worth of source offsets. Three shapes, and each
  // needed its own rule before the map came out monotonic — which it must be,
  // or a selection's start can map after its end.
  //
  //   passthrough  the line is copied verbatim, brackets and all, so the mapping
  //                is the identity. A '[' here is a source character, not a
  //                marker this conversion invented.
  //   merged       chord line + lyric line become one. The lyric characters map
  //                to themselves; an inserted [Chord] marker maps to the lyric
  //                character it sits in FRONT of, so selecting across a chord
  //                boundary still lands on the right letters.
  //   chord-only   no lyrics to point at. Walks the source chord line so the
  //                positions still climb, and nothing selects it anyway.
  let lastEnd = -1;   // source offset of the newline that ended the last emitted line
  const note = (emitted, kind, at, srcLen) => {
    if (!mappable) return;
    if (map.length) map.push(lastEnd);
    let k = 0;
    for (const ch of emitted) {
      if (kind === 'merged') {
        if (ch === '[') { inMarker = true; map.push(at + k); continue; }
        if (inMarker) { if (ch === ']') inMarker = false; map.push(at + k); continue; }
        map.push(at + k); k++;
      } else if (kind === 'chord-only') {
        map.push(at + Math.min(k, srcLen)); k++;
      } else {
        map.push(at + k); k++;
      }
    }
    lastEnd = at + srcLen;
  };
  let inMarker = false;
  let changed = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    // `next.trim()` matters: a BLANK line is not a lyric. Without that test a
    // chord line followed by an empty line was merged into it and the blank was
    // swallowed, silently closing up the gap between two sections. It also made
    // the last chord line of a song behave differently from every other one,
    // because a trailing newline leaves an empty final line — which is how Howard
    // ended up with four identical lines rendering with three different gaps.
    if (isChordLine(line) && next !== undefined && next.trim() !== '' && !isChordLine(next)) {
      // Chord line immediately before a lyric — merge chord positions into lyric.
      const merged = mergeIntoLyricLine(line, next);
      out.push(merged);
      note(merged, 'merged', lineStart[i + 1], lines[i + 1].length);
      changed = true;
      i += 2;
    } else if (isChordLine(line)) {
      // Chord-only line NOT immediately before a lyric (followed by another chord
      // line, or at end of song). Emit as a bracket-only ChordPro line so
      // parseChordPro doesn't misclassify it as lyrics.
      const only = chordLineToBrackets(line);
      out.push(only);
      note(only, 'chord-only', lineStart[i], line.length);
      changed = true;
      i++;
    } else {
      out.push(line);
      note(line, 'passthrough', lineStart[i], line.length);
      i++;
    }
  }

  return { converted: out.join('\n'), wasConverted: changed, map: mappable ? map : null };
}
