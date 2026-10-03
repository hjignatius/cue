// Separate libraries on one device — a TESTING tool, not a product feature.
//
// Howard works on real sets and also wants a clean slate to test against. He has
// been faking it by loading a backup .json, working, and saving it back out:
// a sandbox with extra steps and a live risk of overwriting the wrong file.
//
// SEPARATE DATABASES, NOT A libraryId ON EVERY RECORD. Every IndexedDB access in
// Cue goes through one getDB() with one DB_NAME, so making the NAME vary scopes
// every existing read and write for free. Tagging records instead would mean
// auditing every query, where one missed filter leaks a song between libraries
// and nothing tells you which query you missed.
//
// MAIN MAPS TO THE ORIGINAL NAME. The default library is 'cue-db' exactly as it
// always was — so this ships inert, and a device that never touches the feature
// cannot tell it exists.

const ACTIVE_KEY = 'cue:active_library';
const LIST_KEY   = 'cue:libraries';
export const MAIN_LIBRARY = 'Main';

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
  catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

/** Every library on this device, Main first. */
export function listLibraries() {
  const extra = read(LIST_KEY, []).filter((n) => typeof n === 'string' && n && n !== MAIN_LIBRARY);
  return [MAIN_LIBRARY, ...extra];
}

/** The library in use. Falls back to Main if the stored one has been deleted. */
export function activeLibrary() {
  const name = read(ACTIVE_KEY, MAIN_LIBRARY);
  return listLibraries().includes(name) ? name : MAIN_LIBRARY;
}

export const isMainLibrary = () => activeLibrary() === MAIN_LIBRARY;

/**
 * The IndexedDB name for a library. Main keeps the original so existing data is
 * exactly where it was; anything else gets its own database entirely.
 */
export function dbNameFor(name = activeLibrary()) {
  return name === MAIN_LIBRARY ? 'cue-db' : `cue-db:${name}`;
}

/**
 * Suffix for the localStorage keys that belong to ONE library.
 *
 * Which keys those are is a judgement, not a mechanism. Publish marks, bookmarks,
 * per-share choices and the editor draft are about the songs in front of you.
 * Theme, font sizes, instrument and the API key are about the device. Custom
 * chord shapes stay global on purpose — your fingerings are yours whichever
 * songs you are working on.
 *
 * Getting this wrong is how a test library shows publish marks for sets it does
 * not contain, which is the stale-mark trap Howard has already been caught by.
 */
export function libSuffix(name = activeLibrary()) {
  return name === MAIN_LIBRARY ? '' : `::${name}`;
}
export const scopedKey = (key) => `${key}${libSuffix()}`;

/** Create a library. Returns the name actually used, or null if it exists. */
export function createLibrary(rawName) {
  const name = (rawName || '').trim();
  if (!name || name === MAIN_LIBRARY) return null;
  const list = listLibraries();
  if (list.includes(name)) return null;
  write(LIST_KEY, [...list.filter((n) => n !== MAIN_LIBRARY), name]);
  return name;
}

/**
 * Forget a library and throw its database away. Main cannot be deleted — it is
 * the real work, and a testing tool must not be able to take it.
 */
export async function deleteLibrary(name) {
  if (!name || name === MAIN_LIBRARY) return false;
  write(LIST_KEY, listLibraries().filter((n) => n !== MAIN_LIBRARY && n !== name));
  if (activeLibrary() === name) write(ACTIVE_KEY, MAIN_LIBRARY);
  // Its scoped localStorage goes with it, or a library of the same name created
  // later would inherit the old one's bookmarks and publish marks.
  const suffix = libSuffix(name);
  try {
    for (const k of Object.keys(localStorage)) if (k.endsWith(suffix)) localStorage.removeItem(k);
  } catch { /* private mode */ }
  try { indexedDB.deleteDatabase(dbNameFor(name)); } catch { /* best effort */ }
  return true;
}

/**
 * Switch libraries, by reloading.
 *
 * The database handle is a module singleton and every view holds songs in React
 * state, so swapping underneath them would mean auditing every piece of state in
 * the app for staleness. A reload is one line and cannot be half-right — and
 * this is a testing tool, where being certain matters more than being smooth.
 */
export function switchLibrary(name) {
  if (!listLibraries().includes(name)) return;
  write(ACTIVE_KEY, name);
  window.location.reload();
}
