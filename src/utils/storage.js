import { openDB } from 'idb';

const DB_NAME    = 'cue-db';
const DB_VERSION = 1;

// Singleton — opened once, reused everywhere
let _db = null;

async function getDB() {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('songs')) {
          database.createObjectStore('songs', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('sets')) {
          database.createObjectStore('sets', { keyPath: 'id' });
        }
      },
    });
    await migrateFromLocalStorage(_db);
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

// ---- Songs ------------------------------------------------------------------

export async function loadSongs() {
  return (await getDB()).getAll('songs');
}

export async function loadSong(id) {
  return (await getDB()).get('songs', id);
}

export async function saveSong({ id, metadata, text, chordStyle, previewMode, diagramScale, chordPrefs, displayKey }) {
  const d = await getDB();
  const songId = id || crypto.randomUUID();
  const entry  = { id: songId, metadata, text, savedAt: Date.now() };
  if (chordStyle   !== undefined) entry.chordStyle   = chordStyle;
  if (previewMode  !== undefined) entry.previewMode  = previewMode;
  if (diagramScale !== undefined) entry.diagramScale = diagramScale;
  if (chordPrefs   !== undefined) entry.chordPrefs   = chordPrefs;
  if (displayKey   !== undefined) entry.displayKey   = displayKey;
  await d.put('songs', entry);
  return songId;
}

export async function deleteSong(id) {
  return (await getDB()).delete('songs', id);
}

// ---- Sets -------------------------------------------------------------------

export async function loadSets() {
  return (await getDB()).getAll('sets');
}

export async function saveSet({ id, name, songIds, sortMode = 'custom' }) {
  const d   = await getDB();
  const sid = id || crypto.randomUUID();
  const entry = {
    id:      sid,
    name:    name?.trim() || 'Untitled Set',
    songIds: songIds || [],
    sortMode,
    savedAt: Date.now(),
  };
  await d.put('sets', entry);
  return entry;
}

export async function deleteSet(id) {
  return (await getDB()).delete('sets', id);
}

export async function clearLibrary() {
  const d = await getDB();
  const tx = d.transaction(['songs', 'sets'], 'readwrite');
  await Promise.all([tx.objectStore('songs').clear(), tx.objectStore('sets').clear()]);
  await tx.done;
}

export async function removeSongFromAllSets(songId) {
  const d    = await getDB();
  const sets = await d.getAll('sets');
  await Promise.all(
    sets
      .filter(s => s.songIds.includes(songId))
      .map(s => d.put('sets', { ...s, songIds: s.songIds.filter(id => id !== songId) }))
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
