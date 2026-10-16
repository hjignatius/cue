// One gate on a song's metadata, applied wherever a song is written.
//
// WHY: a song in Howard's library had its DURATION sitting in the time-signature
// field — "2:24" where "4/4" belongs. Nothing in Cue can put it there today: the
// .cho import normalizes, the AI's answer is validated, and the form is a picker
// you cannot type into. But nothing CAUGHT it either. A .json bundle carries
// metadata through verbatim, so once a bad value exists it survives every
// export and import; and the picker deliberately offers back any stored value it
// doesn't recognise, so that it never rewrites someone's 7/4 — which meant
// "2:24" was presented as a legitimate choice.
//
// THE RULE: only clear a value that is PRESENT and provably not what the field
// is for. Never fill in a default, never touch an empty field, and never guess.
// A field left empty is "not set", which is true and harmless; a field holding
// 4/4 nobody chose is a claim, and would also change the song's content hash and
// make every song in a shared set look edited.

import { timeSigOrEmpty } from './timeSig.js';
import { MAX_CAPO } from './transpose.js';

// M:SS or MM:SS. Seconds are 00-59 — "4:75" is not a length.
export const DURATION_RE = /^\d{1,2}:[0-5]\d$/;

// A watch link, in the forms a real search result gives back.
export const YOUTUBE_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)/i;

// Whole beats per minute. Three digits covers the range a song is played at;
// anything else here is a typo or another field's value.
export const TEMPO_RE = /^\d{1,3}$/;

// Fields with an unambiguous machine-checkable shape. Title, artist and key are
// deliberately absent: there is no rule that distinguishes an odd-but-real value
// from a wrong one, and discarding a title because it looked unusual would be a
// worse bug than the one this fixes.
const GUARDS = {
  timeSig:    (v) => timeSigOrEmpty(v),            // returns '' when it isn't a signature
  duration:   (v) => (DURATION_RE.test(v) ? v : ''),
  tempo:      (v) => (TEMPO_RE.test(v)    ? v : ''),
  youtubeUrl: (v) => (YOUTUBE_RE.test(v)  ? v : ''),
  // A fret number. 0 and '' both mean no capo; anything else that is not a whole
  // fret on the neck is someone else's value in the wrong field.
  capo:       (v) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n > 0 && n <= MAX_CAPO ? String(n) : '';
  },
};

// Returns the metadata to store. The SAME object is returned when nothing is
// wrong, so a save that changes nothing stays a save that changes nothing.
export function sanitizeMetadata(md) {
  if (!md || typeof md !== 'object') return md;
  let out = null;
  for (const [field, guard] of Object.entries(GUARDS)) {
    const raw = md[field];
    if (raw == null || raw === '') continue;        // not set — leave it alone
    const value = String(raw).trim();
    const kept = guard(value);
    // Compared against the RAW value, not the trimmed one, so a field stored as
    // a number or with stray whitespace is tidied to the string form the rest of
    // the app expects — the same hand-edited-JSON route the bad value came in by.
    if (kept === raw) continue;                     // already fine
    out = out || { ...md };
    out[field] = kept;
  }
  return out || md;
}

// What sanitizeMetadata WOULD clear, without changing anything — for reporting
// over a library rather than fixing one song at a time.
export function metadataProblems(md) {
  const before = md || {};
  const after = sanitizeMetadata(before);
  if (after === before) return [];
  return Object.keys(GUARDS)
    .filter(f => (before[f] ?? '') !== (after[f] ?? ''))
    .map(f => ({ field: f, value: String(before[f]) }));
}
