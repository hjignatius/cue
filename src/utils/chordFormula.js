// Which notes a chord name allows, and whether a shape sounds that chord.
//
// Not a guess and not a model: the tuning plus the fret numbers gives the notes,
// and a chord symbol gives the notes it may contain. Shared by the chord audit
// (scripts/chordAudit.mjs) and the AI chord tools (src/lib/ai.js), so the shapes
// Cue ships and the shapes a model hands back are held to the same rule.
//
// Why the AI half exists: with no dim7 in the library, a Gbdim7 went to the
// model, which drew an F (Howard, 2026-11-13). A shape with a note that is not
// in the chord is now refused rather than drawn.
import { notePitchClass } from './notes.js';

// Semitones above the root that each quality may use. The 5th is included
// wherever it belongs even when players drop it: this is the set of notes a
// shape MAY contain, not the set it must.
export const QUALITIES = {
  '':       [0, 4, 7],
  'm':      [0, 3, 7],
  '5':      [0, 7],
  '6':      [0, 4, 7, 9],
  'm6':     [0, 3, 7, 9],
  '6/9':    [0, 2, 4, 7, 9],
  '7':      [0, 4, 7, 10],
  'maj7':   [0, 4, 7, 11],
  'm7':     [0, 3, 7, 10],
  'mmaj7':  [0, 3, 7, 11],
  'm7b5':   [0, 3, 6, 10],
  // Libraries commonly file the four-note dim7 shape under "dim"; allow both.
  'dim':    [0, 3, 6, 9],
  'dim7':   [0, 3, 6, 9],
  'aug':    [0, 4, 8],
  'sus2':   [0, 2, 7],
  'sus4':   [0, 5, 7],
  '7sus2':  [0, 2, 7, 10],
  '7sus4':  [0, 5, 7, 10],
  '9':      [0, 2, 4, 7, 10],
  'm9':     [0, 2, 3, 7, 10],
  'maj9':   [0, 2, 4, 7, 11],
  'add9':   [0, 2, 4, 7],
  'madd9':  [0, 2, 3, 7],
  '11':     [0, 2, 4, 5, 7, 10],
  'm11':    [0, 2, 3, 5, 7, 10],
  '13':     [0, 2, 4, 7, 9, 10],
  '7b5':    [0, 4, 6, 10],
  '7#5':    [0, 4, 8, 10],
  '7b9':    [0, 1, 4, 7, 10],
  '7#9':    [0, 3, 4, 7, 10],   // the #9 sounds as the minor 3rd
};

// The notes that MAKE the chord what it is. The audit reports one that is
// absent; a model's shape without one is refused (a "Gm7" drawn as plain Gm has
// no wrong note, it just isn't the chord asked for).
export const DEFINING = {
  '': [4], 'm': [3],
  '6': [9], 'm6': [9], '6/9': [2, 9], '7': [10], 'maj7': [11], 'm7': [10], 'mmaj7': [3, 11],
  'm7b5': [6, 10], 'dim': [3, 6], 'dim7': [3, 6, 9],
  'aug': [8], '7#5': [8, 10], '7b5': [6, 10], '7b9': [1, 10], '7#9': [3, 4, 10], '9': [2, 10],
  'm9': [2, 3, 10], 'maj9': [2, 11], 'add9': [2], 'madd9': [2, 3], '11': [5, 10], 'm11': [3, 5, 10],
  '13': [9, 10], 'sus2': [2], 'sus4': [5], '7sus2': [2, 10], '7sus4': [5, 10],
};

// Families whose shapes must sound their own root. A 7b9 or a 9 is voiced
// rootless on four strings on purpose; a dim or dim7 never needs to be, and a
// dim shape without its root is a different diminished chord — four of Cue's
// shipped ones were (2026-11-13).
export const ROOT_REQUIRED = new Set(['dim', 'dim7']);

// Other spellings of the same qualities, as charts and models write them.
const ALIAS = {
  'min': 'm', 'mi': 'm', '-': 'm', 'maj': '', 'M': '',
  'M7': 'maj7', 'Maj7': 'maj7', 'ma7': 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7',
  'min7': 'm7', 'mi7': 'm7', '-7': 'm7',
  'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', 'min7b5': 'm7b5',
  '°': 'dim', 'o': 'dim', '°7': 'dim7', 'o7': 'dim7',
  '+': 'aug', 'aug7': '7#5', '+7': '7#5', '7+': '7#5', '7+5': '7#5', '7aug': '7#5',
  'sus': 'sus4', '7sus': '7sus4', '69': '6/9',
  'mM7': 'mmaj7', 'm(maj7)': 'mmaj7', 'mmaj7': 'mmaj7', 'minmaj7': 'mmaj7',
  'M9': 'maj9', 'Maj9': 'maj9', 'min9': 'm9', '2': 'add9', 'add2': 'add9',
  '7-5': '7b5', '7-9': '7b9', '7+9': '7#9',
};

// { root, suffix, bass } with suffix in QUALITIES, or null for a name this
// can't read. A slash bass is a NOTE the shape may also contain.
export function parseChord(name) {
  const m = /^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/.exec(String(name || '').trim());
  if (!m) return null;
  const raw = m[2];
  const suffix = raw in QUALITIES ? raw : ALIAS[raw];
  if (suffix === undefined || !(suffix in QUALITIES)) return null;
  const root = notePitchClass(m[1]);
  if (root == null) return null;
  const bass = m[3] ? notePitchClass(m[3]) : null;
  return { root, suffix, bass };
}

// The distinct pitch classes a shape sounds. frets: 0 open, -1 muted.
export function soundedPitchClasses(tuning, frets) {
  return [...new Set(frets
    .map((f, i) => (f == null || f < 0 ? null : (notePitchClass(tuning[i]) + f) % 12))
    .filter((x) => x != null))];
}

// How a shape measures against its name:
//   { known: false }                     — a quality this can't read
//   { known: true, foreign, lacking, rootless }
// foreign: pitch classes not in the chord; lacking: defining intervals absent;
// rootless: the root is not sounded.
export function judgeShape(name, frets, tuning) {
  const c = parseChord(name);
  if (!c || !Array.isArray(frets) || !Array.isArray(tuning) || frets.length !== tuning.length) return { known: false };
  const pcs = soundedPitchClasses(tuning, frets);
  const ok = new Set(QUALITIES[c.suffix].map((i) => (c.root + i) % 12));
  if (c.bass != null) ok.add(c.bass);
  return {
    known: true,
    suffix: c.suffix,
    pcs,
    foreign: pcs.filter((p) => !ok.has(p)),
    lacking: (DEFINING[c.suffix] || []).filter((i) => !pcs.includes((c.root + i) % 12)),
    rootless: !pcs.includes(c.root),
  };
}

// May a model's shape be drawn for this name? True when every note belongs,
// the defining notes are there, and a family that needs its root has it. A
// name this can't read is let through (null) — there is nothing to hold it to.
//
// allowLacking: for Other ways to play it, where a simpler shape is allowed
// when its label says what was dropped ("E7 shape, #9 dropped"). A wrong note
// is still refused there; a missing one is not.
export function shapeFitsChord(name, frets, tuning, { allowLacking = false } = {}) {
  const j = judgeShape(name, frets, tuning);
  if (!j.known) return null;
  if (j.pcs.length < 2) return false;
  if (j.foreign.length) return false;
  if (j.lacking.length && !allowLacking) return false;
  if (ROOT_REQUIRED.has(j.suffix) && j.rootless) return false;
  return true;
}
