import { openDB } from 'idb';

const DB_NAME    = 'cue-db';
const DB_VERSION = 3;
export const SCHEMA_VERSION = 3;

// Singleton — opened once, reused everywhere
let _db = null;

// Exported so that annotation utilities (annotations.js) can share the same
// connection rather than opening a competing one at a different version.
export async function getDB() {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('songs')) {
          database.createObjectStore('songs', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('sets')) {
          database.createObjectStore('sets', { keyPath: 'id' });
        }
        // v2: local-only ink annotations, keyed by song ID.
        // NEVER included in export/backup/publish paths — see annotations.js.
        if (!database.objectStoreNames.contains('annotations')) {
          database.createObjectStore('annotations', { keyPath: 'songId' });
        }
        // v3: raw PDF blobs for pdf-type songs, keyed by song ID. Local-only in
        // Stage 1a — nothing uploads these (see syncPdfBlob in pdfSync.js).
        if (!database.objectStoreNames.contains('pdfs')) {
          database.createObjectStore('pdfs', { keyPath: 'songId' });
        }
      },
    });
    await migrateFromLocalStorage(_db);
    await runMigrations(_db);
  }
  return _db;
}

// One-time migration: copy localStorage songs and sets into IndexedDB.
// The old localStorage keys are left in place but never read again.
async function migrateFromLocalStorage(database) {
  if (localStorage.getItem('cue:idb_migrated')) return;

  try {
    const songsJson = localStorage.getItem('cue:songs');
    if (songsJson) {
      const songs = JSON.parse(songsJson);
      const tx = database.transaction('songs', 'readwrite');
      await Promise.all(songs.map(s => tx.store.put(s)));
      await tx.done;
    }

    const setsJson = localStorage.getItem('cue:setlists');
    if (setsJson) {
      const sets = JSON.parse(setsJson);
      const tx = database.transaction('sets', 'readwrite');
      await Promise.all(sets.map(s => tx.store.put(s)));
      await tx.done;
    }
  } catch (err) {
    console.error('Cue: localStorage migration failed', err);
  }

  localStorage.setItem('cue:idb_migrated', '1');
}

// A2 seed: existing songs (and new text songs) take their pedalActive from the
// user's prior GLOBAL pedal preference (cue_prefs.pedalPaging, default OFF), so
// nobody's behavior changes when the per-song control replaces the global one.
export function seedPedalActive() {
  try {
    const prefs = JSON.parse(localStorage.getItem('cue_prefs') || '{}');
    return prefs.pedalPaging === true;
  } catch {
    return false;
  }
}

// Schema migrations — guarded by cue:schema_version in localStorage.
// Each version block is idempotent: safe to re-run if the version flag is lost.
async function runMigrations(database) {
  const v = parseInt(localStorage.getItem('cue:schema_version') || '0', 10);
  if (v >= SCHEMA_VERSION) return;

  if (v < 2) {
    // v2: add createdAt / updatedAt ISO strings to every record that lacks them.
    const now = new Date().toISOString();

    const songs = await database.getAll('songs');
    if (songs.length) {
      const tx = database.transaction('songs', 'readwrite');
      for (const song of songs) {
        if (!song.createdAt) {
          const t = song.savedAt ? new Date(song.savedAt).toISOString() : now;
          tx.store.put({ ...song, createdAt: t, updatedAt: t });
        }
      }
      await tx.done;
    }

    const sets = await database.getAll('sets');
    if (sets.length) {
      const tx = database.transaction('sets', 'readwrite');
      for (const set of sets) {
        if (!set.createdAt) {
          const t = set.savedAt ? new Date(set.savedAt).toISOString() : now;
          tx.store.put({ ...set, createdAt: t, updatedAt: t });
        }
      }
      await tx.done;
    }
  }

  if (v < 3) {
    // v3: introduce the song `type` discriminator and per-song `pedalActive`.
    // ADDITIVE and IDEMPOTENT — only fills a field that is missing, never
    // overwrites one already set, so a re-run (or a lost version flag) is safe.
    // Existing songs are all 'text'; pedalActive is seeded from the prior global
    // pref so behavior is preserved. Nothing here deletes or rewrites data.
    const seed = seedPedalActive();
    const songs = await database.getAll('songs');
    if (songs.length) {
      const tx = database.transaction('songs', 'readwrite');
      for (const song of songs) {
        const patch = {};
        if (song.type === undefined)        patch.type = 'text';
        if (song.pedalActive === undefined) patch.pedalActive = seed;
        if (Object.keys(patch).length) tx.store.put({ ...song, ...patch });
      }
      await tx.done;
    }
  }

  localStorage.setItem('cue:schema_version', String(SCHEMA_VERSION));
}

// ---- Songs ------------------------------------------------------------------

export async function loadSongs() {
  return (await getDB()).getAll('songs');
}

export async function loadSong(id) {
  return (await getDB()).get('songs', id);
}

// createdAt / updatedAt may be passed explicitly when importing backup data so
// that original edit times are preserved rather than reset to import time.
// The KNOWN fields saveSong manages explicitly. Any OTHER field already present
// on the stored row is carried forward untouched (forward-compat: a future
// bundle may persist fields this one doesn't know — never strip them). Note this
// preserves only fields already in STORED data, it does not blanket-accept
// arbitrary caller input, which is why the whitelist shape is kept.
const KNOWN_SONG_FIELDS = new Set([
  'id', 'metadata', 'text', 'createdAt', 'updatedAt',
  'chordStyle', 'previewMode', 'diagramScale', 'chordPrefs', 'displayKey',
  'copiedFrom', 'type', 'pedalActive', 'pdf',
]);

export async function saveSong({ id, metadata, text, chordStyle, previewMode, diagramScale, chordPrefs, displayKey, createdAt: givenCreatedAt, updatedAt: givenUpdatedAt, copiedFrom, type, pedalActive, pdf }) {
  const d = await getDB();
  const songId = id || crypto.randomUUID();
  const now = new Date().toISOString();
  const existing = id ? await d.get('songs', id) : null;

  // Carry forward any persisted fields this version doesn't recognize.
  const preserved = {};
  if (existing) for (const k in existing) if (!KNOWN_SONG_FIELDS.has(k)) preserved[k] = existing[k];

  const entry = {
    ...preserved,
    id: songId,
    metadata,
    text,
    createdAt: existing?.createdAt ?? givenCreatedAt ?? now,
    updatedAt: givenUpdatedAt ?? now,
  };
  if (chordStyle   !== undefined) entry.chordStyle   = chordStyle;
  if (previewMode  !== undefined) entry.previewMode  = previewMode;
  if (diagramScale !== undefined) entry.diagramScale = diagramScale;
  if (chordPrefs   !== undefined) entry.chordPrefs   = chordPrefs;
  if (displayKey   !== undefined) entry.displayKey   = displayKey;
  if (copiedFrom   !== undefined) entry.copiedFrom   = copiedFrom;
  // type / pedalActive are always present on a saved song: take the caller's
  // value, else keep the existing one, else default (a new song seeds
  // pedalActive from the prior global pref; type defaults to 'text').
  entry.type        = type        ?? existing?.type        ?? 'text';
  entry.pedalActive = pedalActive ?? existing?.pedalActive ?? seedPedalActive();
  // pdf reference (storage-ref placeholder) — set it, keep it, or leave it off.
  if (pdf !== undefined)          entry.pdf = pdf;
  else if (existing?.pdf != null) entry.pdf = existing.pdf;

  await d.put('songs', entry);
  return songId;
}

export async function deleteSong(id) {
  const d = await getDB();
  const tx = d.transaction(['songs', 'pdfs'], 'readwrite');
  tx.objectStore('songs').delete(id);
  tx.objectStore('pdfs').delete(id); // no-op if the song has no stored PDF
  await tx.done;
}

// ---- PDF blobs (local-only; keyed by songId) --------------------------------
// Raw PDF bytes for pdf-type songs. Stage 1a keeps these PURELY LOCAL — nothing
// uploads or fetches them (see pdfSync.js). A missing blob is a normal state the
// renderer must handle softly, never a crash.
export async function savePdfBlob(songId, blob) {
  return (await getDB()).put('pdfs', { songId, blob });
}
export async function loadPdfBlob(songId) {
  const rec = await (await getDB()).get('pdfs', songId);
  return rec?.blob ?? null;
}
export async function hasPdfBlob(songId) {
  return !!(await (await getDB()).get('pdfs', songId));
}
export async function deletePdfBlob(songId) {
  return (await getDB()).delete('pdfs', songId);
}

// ---- Sets -------------------------------------------------------------------

export async function loadSets() {
  return (await getDB()).getAll('sets');
}

// Any save counts as a modification and bumps updatedAt to now, so editing a
// set's contents (add/remove/reorder songs, rename) re-floats it under the
// "Newest" sort. Edit callers commonly spread `{ ...set }`, which carries the
// stale updatedAt; that value is ignored unless preserveTimestamps is set.
// Backup/restore passes preserveTimestamps: true to keep original edit times.
export async function saveSet({ id, name, songIds, sortMode = 'custom', createdAt: givenCreatedAt, updatedAt: givenUpdatedAt, preserveTimestamps = false }) {
  const d   = await getDB();
  const sid = id || crypto.randomUUID();
  const now = new Date().toISOString();
  const existing = id ? await d.get('sets', id) : null;
  const entry = {
    id:      sid,
    name:    name?.trim() || 'Untitled Set',
    songIds: songIds || [],
    sortMode,
    createdAt: existing?.createdAt ?? givenCreatedAt ?? now,
    updatedAt: preserveTimestamps && givenUpdatedAt ? givenUpdatedAt : now,
  };
  await d.put('sets', entry);
  return entry;
}

export async function deleteSet(id) {
  return (await getDB()).delete('sets', id);
}

// Newest local modification time across a set and its member songs, as an ISO
// string ('' when unknown). ISO strings sort chronologically, so a plain sort
// finds the newest. Shared by the publish "stale" dot and the pull staleness
// guard so both judge freshness the same way.
export function newestLocalAt(set, setSongs = []) {
  return [set?.updatedAt, ...setSongs.map(s => s?.updatedAt)]
    .filter(Boolean)
    .sort()
    .at(-1) ?? '';
}

export async function clearLibrary() {
  const d = await getDB();
  const tx = d.transaction(['songs', 'sets'], 'readwrite');
  await Promise.all([tx.objectStore('songs').clear(), tx.objectStore('sets').clear()]);
  await tx.done;
}

// Re-id a locally stored song: rewrite it under a new id, remap every set that
// references the old id, move its annotation record, and delete the old row.
// Copied/imported songs can carry an id that belongs to another user's cloud
// row; publishing then upsert-collides into an UPDATE the songs RLS policy
// rejects. Re-id'ing to a fresh (locally owned) id fixes that. All fields are
// preserved verbatim (including copiedFrom provenance); timestamps are untouched
// so this mechanical fix doesn't re-float the set under "Newest".
export async function reidSong(oldId, newId) {
  const d = await getDB();
  const song = await d.get('songs', oldId);
  if (!song) return;
  const tx    = d.transaction(['songs', 'sets', 'annotations', 'pdfs'], 'readwrite');
  const songs = tx.objectStore('songs');
  const sets  = tx.objectStore('sets');
  const anns  = tx.objectStore('annotations');
  const pdfs  = tx.objectStore('pdfs');
  songs.put({ ...song, id: newId });
  songs.delete(oldId);
  for (const s of await sets.getAll()) {
    if (s.songIds?.includes(oldId)) {
      sets.put({ ...s, songIds: s.songIds.map(id => (id === oldId ? newId : id)) });
    }
  }
  const ann = await anns.get(oldId);
  if (ann) { anns.put({ ...ann, songId: newId }); anns.delete(oldId); }
  const pdf = await pdfs.get(oldId);
  if (pdf) { pdfs.put({ ...pdf, songId: newId }); pdfs.delete(oldId); }
  await tx.done;
}

export async function removeSongFromAllSets(songId) {
  const d    = await getDB();
  const sets = await d.getAll('sets');
  const now  = new Date().toISOString();
  await Promise.all(
    sets
      .filter(s => s.songIds.includes(songId))
      .map(s => d.put('sets', { ...s, songIds: s.songIds.filter(id => id !== songId), updatedAt: now }))
  );
}

// ---- Draft (stays in localStorage — tiny, written on every keystroke) -------

const DRAFT_KEY = 'cue:draft';

export function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}

export function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
