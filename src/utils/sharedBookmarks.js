// The viewer-side "Shared with me" bookmarks: a set someone sent you, kept by
// its share token so the link can be rebuilt against whatever origin you are on.
//
//   { token, setName, savedAt, lastLoadedAt }[]
//
// This module exists because the key and its reader were written out twice — in
// SharedSetView and again in LibraryView — which is the shape of every drift bug
// in this app so far: two copies of one rule, one of them updated. The row's
// NAME is exactly what drifted here (see syncBookmark).

export const SHARED_WITH_ME_KEY = 'cue:shared_with_me';

export function loadSavedShares() {
  try {
    const raw = JSON.parse(localStorage.getItem(SHARED_WITH_ME_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function persistSavedShares(arr) {
  try { localStorage.setItem(SHARED_WITH_ME_KEY, JSON.stringify(arr)); } catch { /* storage unavailable */ }
}

// Bring one bookmark up to date from a freshly loaded share. Returns a NEW array
// when something changed, or null when there is nothing to write.
//
// A publisher can rename a set and republish to the same link. The bookmark
// stored the name captured the day it was saved and never looked again, so
// opening the link showed "Name 2" while the list that sent you there still said
// "Name 1" — and no amount of reopening fixed it.
//
// `cachedAt` means the view is showing cached content rather than something just
// fetched. lastLoadedAt must not move then, or a bookmark claims to be fresher
// than it is. The name still syncs: it should match the set you are looking at,
// cached or not.
export function syncBookmark(shares, token, { liveName = '', cachedAt = null, now = new Date().toISOString() } = {}) {
  const idx = shares.findIndex(s => s.token === token);
  if (idx === -1) return null;

  const row     = shares[idx];
  const renamed = !!liveName && liveName !== row.setName;
  if (!renamed && cachedAt) return null;

  const next = [...shares];
  next[idx] = {
    ...row,
    ...(renamed  ? { setName: liveName } : {}),
    ...(cachedAt ? {} : { lastLoadedAt: now }),
  };
  return next;
}
