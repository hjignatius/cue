const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const ENHARMONIC = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};

function noteIndex(note) {
  const i = SHARPS.indexOf(note);
  if (i !== -1) return i;
  const j = FLATS.indexOf(note);
  return j;
}

function transposeNote(note, semitones, useFlats = false) {
  const scale = useFlats ? FLATS : SHARPS;
  const idx = noteIndex(note);
  if (idx === -1) return note;
  return scale[((idx + semitones) % 12 + 12) % 12];
}

/**
 * Transpose a full chord symbol by `semitones`.
 * Handles: G, Gm, G7, Gmaj7, G/B, Gsus4, etc.
 */
export function transposeChord(chord, semitones, useFlats = false) {
  if (!chord || semitones === 0) return chord;

  // Match root note (1-2 chars) + optional modifier + optional bass note
  const match = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return chord;

  let [, root, suffix] = match;
  const newRoot = transposeNote(root, semitones, useFlats);

  // Handle slash chords: G/B → transpose the bass too
  const slashMatch = suffix.match(/^(.*)\/([A-G][#b]?)(.*)$/);
  if (slashMatch) {
    const newBass = transposeNote(slashMatch[2], semitones, useFlats);
    return newRoot + slashMatch[1] + '/' + newBass + slashMatch[3];
  }

  return newRoot + suffix;
}

/**
 * Transpose all chords in a ChordPro text string.
 */
export function transposeText(text, semitones, useFlats = false) {
  if (semitones === 0) return text;
  return text.replace(/\[([^\]]+)\]/g, (_, chord) => {
    return '[' + transposeChord(chord, semitones, useFlats) + ']';
  });
}

export const NOTE_NAMES = SHARPS;

// Accidental spelling by key signature (only the five ambiguous pitch classes
// are ever affected; the seven naturals are never rewritten).
const FLAT_KEYS = new Set([
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm',
]);
const SHARP_KEYS = new Set([
  'G', 'D', 'A', 'E', 'B', 'F#', 'C#',
  'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m',
]);

/**
 * Decide whether transposed accidentals should be spelled as flats.
 * @param {'auto'|'flats'|'sharps'} mode  the Accidentals setting
 * @param {string} targetKey  the View Key being transposed to (used only in auto)
 *
 * Auto classifies by the target key's signature; a key written with an
 * accidental honours it (F# → sharps, Gb → flats); C major / A minor and any
 * unclassified key default to sharps.
 */
export function useFlatsForKey(mode, targetKey) {
  if (mode === 'flats')  return true;
  if (mode === 'sharps') return false;
  const k = (targetKey || '').trim();
  if (FLAT_KEYS.has(k))  return true;
  if (SHARP_KEYS.has(k)) return false;
  if (k.includes('b'))   return true;   // enharmonic keys not in the tables (e.g. Dbm)
  if (k.includes('#'))   return false;
  return false; // C major / A minor / unknown → sharps
}

// Full key list: major and minor, including common flat enharmonics.
export const KEY_NAMES = [
  'C', 'Cm',
  'C#', 'C#m', 'Db', 'Dbm',
  'D', 'Dm',
  'D#', 'D#m', 'Eb', 'Ebm',
  'E', 'Em',
  'F', 'Fm',
  'F#', 'F#m',
  'G', 'Gm',
  'G#', 'G#m', 'Ab', 'Abm',
  'A', 'Am',
  'A#', 'A#m', 'Bb', 'Bbm',
  'B', 'Bm',
];

// Semitone distance between two key names (strips minor suffix, checks sharps then flats).
export function semitonesBetween(from, to) {
  if (!from || !to || from === to) return 0;
  const fromRoot = from.replace(/m$/, '');
  const toRoot   = to.replace(/m$/, '');
  const fi = SHARPS.indexOf(fromRoot) !== -1 ? SHARPS.indexOf(fromRoot) : FLATS.indexOf(fromRoot);
  const ti = SHARPS.indexOf(toRoot)   !== -1 ? SHARPS.indexOf(toRoot)   : FLATS.indexOf(toRoot);
  if (fi === -1 || ti === -1) return 0;
  return ((ti - fi) + 12) % 12;
}
