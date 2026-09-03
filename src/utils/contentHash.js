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
