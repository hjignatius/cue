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
