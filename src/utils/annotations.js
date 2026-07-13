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

// ---------------------------------------------------------------------------
// Write queue — one promise chain per song.
//
// Ordering: every enqueue() call chains onto the existing tail promise so
// writes execute strictly in call order; a slow earlier write can never
// overwrite a faster later one.
//
// Coalescing: if a write is queued but has not yet started, subsequent
// enqueue() calls for the same song only update the payload slot — they do
// not add another link to the chain. The single queued write reads the
// latest payload when it actually runs, so rapid undo / stroke / clear
// sequences collapse to one idb operation instead of stacking N.
//
// Deletes route through the same queue (DELETE sentinel) so a delete that
// races an in-flight save always wins if it was enqueued later.
// ---------------------------------------------------------------------------

const writeQueues   = new Map(); // songId → tail of promise chain
const pendingPayload = new Map(); // songId → strokes[] | DELETE (latest staged)
const hasPending    = new Map(); // songId → bool (write queued, not yet started)

const DELETE = Symbol('delete');

function enqueue(songId, payload) {
  // Always update the payload slot so the next write picks up the latest.
  pendingPayload.set(songId, payload);

  if (hasPending.get(songId)) {
    // A write is already waiting in the chain. It will read the updated
    // payload when it runs — no need to add another chain link.
    return;
  }

  hasPending.set(songId, true);
  const chain = writeQueues.get(songId) ?? Promise.resolve();

  writeQueues.set(songId, chain.then(async () => {
    // Transition: pending → running. New enqueues after this point will
    // chain a fresh write rather than coalescing into this one.
    hasPending.set(songId, false);

    const p = pendingPayload.get(songId);
    pendingPayload.delete(songId);
    if (p === undefined) return;

    try {
      const db = await getDB();
      if (p === DELETE) {
        await db.delete('annotations', songId);
      } else {
        await db.put('annotations', {
          songId,
          strokes:       p,
          schemeVersion: 2, // v2 = line-anchored points; v1 records lack lineIndex
          updatedAt:     new Date().toISOString(),
        });
      }
    } catch (err) {
      // Swallow so one failed write does not wedge the queue for this song.
      console.error('[annotations] write error:', err);
    }
  }));
}

// Returns the tail promise of the write queue for a song. Resolves once all
// writes enqueued up to this point have completed (or errored). Call on
// unmount / visibilitychange so fast exits do not drop the last mutation.
export function flushAnnotationQueue(songId) {
  return writeQueues.get(songId) ?? Promise.resolve();
}

// Load the annotation record for a song. Returns null if none exists.
export async function loadAnnotation(songId) {
  if (!songId) return null;
  return (await getDB()).get('annotations', songId);
}

// Enqueue a full strokes-array write for a song. Synchronous — the actual
// idb operation runs in the background queue. The stored record carries
// schemeVersion: 2 (line-anchored points).
// strokes: Array<{ id, color, width, tool, captureWidth,
//                  points: [{ nx, y, lineIndex, lineOffset }] }>
export function saveAnnotation(songId, strokes) {
  if (!songId) return;
  enqueue(songId, strokes);
}

// Enqueue a delete for a song through the same queue as saveAnnotation so
// ordering is guaranteed regardless of which call site triggers the delete.
export function deleteAnnotation(songId) {
  if (!songId) return;
  enqueue(songId, DELETE);
}

// Return a Set of song IDs that have at least one stored stroke.
// Used by LibraryView to show the pencil badge.
export async function loadAnnotatedSongIds() {
  const all = await (await getDB()).getAll('annotations');
  return new Set(all.filter(a => a.strokes?.length > 0).map(a => a.songId));
}
