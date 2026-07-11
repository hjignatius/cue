// ANNOTATION STORAGE — local-only ink strokes keyed by song ID.
//
// Data lives exclusively in the 'annotations' IndexedDB store.
// It is intentionally absent from every export and publish path:
//   - saveSong / loadSong (storage.js) — only reads/writes the 'songs' store
//   - exportBackup / exportSetJson / exportSongsJson / exportCho (fileIO.js) — read from 'songs' only
//   - publishSet / getSharedSet (cloud.js) — serialises song objects from 'songs' store; no annotation key
//
// Do not add annotation data to song objects. Keep this store separate.

import { getDB } from './storage.js';

// Load the annotation record for a song. Returns null if none exists.
export async function loadAnnotation(songId) {
  if (!songId) return null;
  return (await getDB()).get('annotations', songId);
}

// Write (replace) the full strokes array for a song.
// strokes: Array<{ id, color, width, tool, captureWidth, points: [{nx, y}] }>
export async function saveAnnotation(songId, strokes) {
  if (!songId) return;
  return (await getDB()).put('annotations', {
    songId,
    strokes,
    updatedAt: new Date().toISOString(),
  });
}

// Delete the annotation record for a song.
export async function deleteAnnotation(songId) {
  if (!songId) return;
  return (await getDB()).delete('annotations', songId);
}

// Return a Set of song IDs that have at least one stored stroke.
// Used by LibraryView to show the pencil badge.
export async function loadAnnotatedSongIds() {
  const all = await (await getDB()).getAll('annotations');
  return new Set(all.filter(a => a.strokes?.length > 0).map(a => a.songId));
}
