// How wide a song actually is, in lyric-character widths.
//
// Present used to give every song the same LYRIC_TARGET_CHARS-wide column. That
// is a guess applied to material that varies enormously: a 45-character song got
// a column two thirds empty, and paid for the empty part twice over —
//
//   * the column is real layout width, so it ran off the screen (and under the
//     chord panel) at font sizes the song itself did not need,
//   * and Present's fit-to-panel scaling shrank the type to make that mostly
//     empty column fit beside the chord panel.
//
// So a narrow song was capped at a smaller font than it had any need to be. This
// measures what the song actually requires instead.
//
// WHY IT CAN BE COMPUTED RATHER THAN MEASURED: the lyric column is monospace and
// every size in it is a multiple of fontPx — the chord row is 0.85 em, the title
// 1.4 em. So a line's width in character-widths is a property of the SONG, not of
// the current font size, and one number serves every size.
//
// THE RULE THIS FILE LIVES BY: it must model SongBody exactly. It parses through
// the same pipeline (convertToBrackets -> transposeText -> parseChordPro ->
// expandSections -> attachSectionLabels -> styleSegments) so it cannot drift on
// what the text IS, and the per-line arithmetic below mirrors each branch of that
// renderer. If a branch there changes, change it here too: a measurer that
// disagrees with the renderer is worse than no measurer, because it produces a
// column that is confidently the wrong size.

import { parseChordPro, attachSectionLabels, expandSections, styleSegments } from './chordPro.js';
import { transposeText } from './transpose.js';
import { convertToBrackets } from './chordStyle.js';

// Section labels (VERSE, CHORUS…) are the one thing here that is not monospace:
// bold uppercase sans at tracking-widest. Measured against one monospace advance
// across the labels Cue emits, that ratio runs 1.17 (BRIDGE) to 1.34 (CHORUS).
// The upper bound is used deliberately — overshooting costs a little empty space,
// undershooting wraps a label. Verified against the renderer: a single word lands
// within a pixel, and a label with a space in it ("Instrumental Break") overshoots
// by ~13%, because a sans space is narrower than the average glyph. That only
// costs anything on a song whose widest element is a multi-word label.
const LABEL_CHAR_RATIO = 1.35;
// The chord row's font, relative to the lyric font (SongBody: fontPx * 0.85).
const CHORD_SCALE = 0.85;
// The title's font, relative to the lyric font (fontSize: fontPx * 1.4).
const TITLE_SCALE = 1.4;

// Rendered length of a segment's styled runs. NOT seg.text.length: that still
// holds the **bold** and {c=#hex} markup, which styleSegments has already turned
// into runs and which never reaches the screen as characters.
const runsLen = (runs) => (runs || []).reduce((n, r) => n + (r.text ? r.text.length : 0), 0);

/**
 * Width of the widest line in the song body, in lyric-character widths.
 * Returns null when the song's width is not a text measurement at all.
 */
export function songBodyWidthChars(text, {
  semitones = 0, useFlats = false, displayMode = 'over',
  condensed = false, embed = false, instrument = 'none', chordLabelScale = 0,
} = {}) {
  if (!text || !text.trim()) return null;
  // Imbed draws chord DIAGRAMS in place of chord names. Their width comes from
  // ChordDiagram's own geometry and the diagram scale, not from character counts,
  // so this measurer has nothing useful to say — better to admit that and let the
  // caller fall back than to return a number that is wrong.
  if (embed && displayMode === 'over' && instrument !== 'none') return null;

  const parsed = parseChordPro(transposeText(convertToBrackets(text), semitones, useFlats));
  // Condensed songs render verbatim — skip section-reference expansion, exactly
  // as SongBody does, or a condensed song measures as its expanded self.
  const lines = attachSectionLabels(condensed ? parsed : expandSections(parsed));
  // The chord row also carries the user's chordLabelScale, so a +20% chord label
  // can be what makes a line the widest one.
  const chordEm = CHORD_SCALE * (1 + chordLabelScale / 100);

  let max = 0;
  for (const line of lines) {
    if (line.label) max = Math.max(max, line.label.length * LABEL_CHAR_RATIO);
    if (line.type === 'directive' || line.type === 'empty') continue;

    const segs = styleSegments(line.segments);
    let w = 0;

    if (line.type === 'chords' && displayMode === 'brackets') {
      // One inline flow at the lyric size: [CHORD] then the lyric it precedes.
      // Bold does not change a monospace advance, so the brackets are +2.
      for (const s of segs) w += (s.chord ? s.chord.length + 2 : 0) + runsLen(s.styledRuns);
    } else if (line.type === 'chords') {
      // Over-lyrics: a column per chord, the chord sitting ABOVE its text, so the
      // column is whichever of the two is wider — this is why a long chord over a
      // short syllable ([F#m7b5] over "I") widens a line far more than the lyrics
      // suggest. Both rows render a trailing space, and an empty one renders a
      // single space rather than nothing.
      for (const s of segs) {
        const chordW = (s.chord ? s.chord.length + 1 : 1) * chordEm;
        const textW  = s.text ? runsLen(s.styledRuns) : 1;
        w += Math.max(chordW, textW);
      }
    } else {
      // A lyric line with no chords. SongBody renders only the FIRST segment
      // here, so measuring the rest would overstate it.
      w = runsLen(segs[0]?.styledRuns);
    }

    max = Math.max(max, w);
  }
  return max > 0 ? max : null;
}

/**
 * Width the title/artist block needs, in lyric-character widths.
 *
 * This is not cosmetic. The block sits ABOVE the lyrics in the flow, and ink is
 * stored against an absolute y — so if narrowing the column makes a title wrap to
 * a second line, every lyric below it moves down and every annotation on the song
 * is left behind. Folding the header into the width is what stops a narrow column
 * from silently breaking someone's markings.
 *
 * `keyBpmReserveChars` is the gutter held clear for the absolutely-positioned
 * Key/BPM block, which pads the title but contributes no width of its own.
 */
export function songHeaderWidthChars({ title, artist, keyBpmReserveChars = 0 }) {
  const t = (title || '').trim();
  const a = (artist || '').trim();
  if (!t && !a) return 0;
  return Math.max(t.length * TITLE_SCALE, a.length) + keyBpmReserveChars;
}
