// Stable signature + hash of a song's copyable content. A baseline hash is saved
// at copy time (in copiedFrom.baseline); comparing it against the incoming share
// version and the local copy tells "up to date" from a publisher change vs a
// local edit — so Update never silently clobbers your own edits, and the library
// can flag a copied song you've since edited (amber "from a share" dot).
//
// Shared between SharedSetView (which writes the baseline) and LibraryView (which
// reads it) so both compute an identical hash — they MUST agree byte-for-byte.
export function contentSig(song) {
  const m = song?.metadata || {};
  return JSON.stringify({
    t: song?.text || '',
    md: { title: m.title || '', artist: m.artist || '', key: m.key || '', tempo: m.tempo || '', duration: m.duration || '', timeSig: m.timeSig || '', youtubeUrl: m.youtubeUrl || '' },
    cs: song?.chordStyle || '', pm: song?.previewMode || '',
    fp: !!song?.fullPage, em: !!song?.embed, type: song?.type || 'text',
  });
}

export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function contentHash(song) { return hashStr(contentSig(song)); }

// WHICH fields differ between two versions of a song, in words.
//
// A hash can only say "not the same", and that is the whole of what an amber row
// has ever been able to tell anyone. When a shared song goes amber for no reason
// its owner can see, the useful question is not whether it changed but WHAT
// changed — and that is answerable, because the signature is a fixed set of
// named fields rather than an opaque blob.
//
// Reads the same fields contentSig hashes, in the same order, from the same
// place. If a field is added there and not here, this says less than it could;
// it can never say something untrue.
const SIG_FIELDS = [
  ['the words and chords', (s) => s?.text || ''],
  ['the title',            (s) => s?.metadata?.title || ''],
  ['the artist',           (s) => s?.metadata?.artist || ''],
  ['the key',              (s) => s?.metadata?.key || ''],
  ['the tempo',            (s) => s?.metadata?.tempo || ''],
  ['the duration',         (s) => s?.metadata?.duration || ''],
  ['the time signature',   (s) => s?.metadata?.timeSig || ''],
  ['the YouTube link',     (s) => s?.metadata?.youtubeUrl || ''],
  ['the chord format',     (s) => s?.chordStyle || ''],
  ['the preview format',   (s) => s?.previewMode || ''],
  ['the full-page setting',(s) => String(!!s?.fullPage)],
  ['the chord diagrams',   (s) => String(!!s?.embed)],
  ['the song type',        (s) => s?.type || 'text'],
];

export function contentDiffFields(a, b) {
  return SIG_FIELDS.filter(([, read]) => read(a) !== read(b)).map(([label]) => label);
}

// True when a copied-from-share song has been edited since it was copied, i.e.
// its current content no longer matches the baseline captured at copy time.
// Legacy copies without a baseline can't be judged, so they read as unedited.
export function isEditedCopy(song) {
  const base = song?.copiedFrom?.baseline;
  return base != null && contentHash(song) !== base;
}

// ---------------------------------------------------------------------------
// Song identity by NAME, and finding duplicates without asking a model.
// ---------------------------------------------------------------------------

// One definition. There were two: App.jsx stripped punctuation and collapsed
// whitespace, SharedSetView only lowercased and trimmed — so "Yesterday!" and
// "Yesterday" counted as the same song when importing and as different songs on
// the shared-set screen. The stronger one wins; it is the one that matches how
// people actually retype a title.
export function normalizeTitle(str) {
  return (str || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Duplicates that are CERTAIN, found locally, instantly, for nothing.
//
// WHY THIS EXISTS: Find duplicates handed the whole library to Claude and asked
// it to spot repeats. That is the right tool for "(Live)", a typo or an alternate
// spelling — and the wrong tool for two rows that are character-for-character
// identical, which is a comparison, not a judgement. Asked to do both at once
// over hundreds of songs it missed the easy half: Howard imported a set, doubled
// a dozen songs, and the scan reported nothing.
//
// So the obvious cases are settled here and the model is asked only about what is
// left. Faster, free, complete — and it works with no API key at all.
//
// Returns { groups, claimed } where `claimed` is the ids already accounted for,
// so the caller can hand the model a shorter list.
export function duplicateGroups(songs = []) {
  const groups  = [];
  const claimed = new Set();

  const collect = (keyOf, reason) => {
    const buckets = new Map();
    for (const s of songs) {
      if (claimed.has(s.id)) continue;
      const k = keyOf(s);
      if (k == null) continue;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(s);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      groups.push({ reason, songs: list, certain: true });
      for (const s of list) claimed.add(s.id);
    }
  };

  // Identical content: same words, chords, key, tempo, everything in the
  // signature. The same song by any measure anyone would accept.
  collect(contentHash, 'Identical — same words, chords and details');

  // Same title AND artist, but the content has since diverged. Still the same
  // song saved twice, one of them edited. Title alone is deliberately NOT enough:
  // two different songs can share a name, and that judgement is the model's job.
  collect(
    (s) => {
      const t = normalizeTitle(s.metadata?.title);
      return t ? `${t}\u0000${normalizeTitle(s.metadata?.artist)}` : null;
    },
    'Same title and artist',
  );

  return { groups, claimed };
}

/**
 * Find a library song by title and artist, the way a person would.
 *
 * Titles are matched through normalizeTitle, so punctuation and case do not
 * decide it. ARTISTS ONLY DISQUALIFY: when both sides name one and they differ,
 * it is not the same song — but a suggestion with no artist, or a library song
 * filed without one, still matches on the title alone, because a missing artist
 * is a gap in the record rather than a statement that it is somebody else's.
 *
 * Returns the song, or null. First match wins; a library with the same song
 * twice is a duplicates problem, not this function's.
 */
export function matchLibrarySong(songs = [], title, artist) {
  const t = normalizeTitle(title);
  if (!t) return null;
  const a = normalizeTitle(artist);
  return songs.find((s) => {
    if (normalizeTitle(s.metadata?.title) !== t) return false;
    const sa = normalizeTitle(s.metadata?.artist);
    return !a || !sa || a === sa;
  }) || null;
}
