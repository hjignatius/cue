import { openDB } from 'idb';

const DB_NAME    = 'cue-picker';
const STORE      = 'state';
const HANDLE_KEY = 'lastFileHandle';
const DIR_KEY    = 'exportDirHandle';

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE); },
  });
}

async function getLastHandle() {
  try { return await (await getDb()).get(STORE, HANDLE_KEY); } catch { return null; }
}

async function setLastHandle(handle) {
  try { await (await getDb()).put(STORE, handle, HANDLE_KEY); } catch { /* ignore */ }
}

// ---- Saved export folder ----------------------------------------------------
//
// Chromium only (File System Access API). When set, every export/backup writes
// straight into this folder with no save dialog. Browsers never expose a real
// path, so what's persisted is a permission-scoped FileSystemDirectoryHandle —
// we can show its .name but not a full path. Safari/Firefox/iOS ignore all of
// this and keep their existing behaviour.

export function supportsExportFolder() {
  return typeof window !== 'undefined' && !!window.showDirectoryPicker && !isIOS;
}

async function getDirHandle() {
  try { return await (await getDb()).get(STORE, DIR_KEY); } catch { return null; }
}

// Chrome may drop the grant between sessions; re-request (one click) when needed.
async function ensurePermission(handle, mode = 'readwrite') {
  if (!handle?.queryPermission) return false;
  try {
    if (await handle.queryPermission({ mode }) === 'granted') return true;
    return (await handle.requestPermission({ mode })) === 'granted';
  } catch { return false; }
}

// Prompt for a destination folder and remember it. Returns its name, or null if
// unsupported/cancelled.
export async function chooseExportFolder() {
  if (!supportsExportFolder()) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'cue-exports' });
    if (!await ensurePermission(handle)) return null;
    await (await getDb()).put(STORE, handle, DIR_KEY);
    return handle.name;
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

// Name of the saved folder (not a path — browsers don't expose one), or null.
export async function getExportFolderName() {
  const h = await getDirHandle();
  return h?.name ?? null;
}

// Revert to asking for a location on every export.
export async function clearExportFolder() {
  try { await (await getDb()).delete(STORE, DIR_KEY); } catch { /* ignore */ }
}

// Pick a free filename in `dir`, matching how browsers avoid clobbering an
// existing download: "Set.pdf" → "Set (1).pdf".
async function uniqueName(dir, filename) {
  const dot  = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext  = dot > 0 ? filename.slice(dot) : '';
  let name = filename;
  for (let n = 1; n < 100; n++) {
    let exists = true;
    try { await dir.getFileHandle(name); } catch { exists = false; }
    if (!exists) return name;
    name = `${base} (${n})${ext}`;
  }
  return name;
}

const TYPE_MAP = {
  pdf:  [{ description: 'PDF Document',  accept: { 'application/pdf':   ['.pdf']  } }],
  csv:  [{ description: 'CSV File',      accept: { 'text/csv':          ['.csv']  } }],
  json: [{ description: 'JSON File',     accept: { 'application/json':  ['.json'] } }],
  cho:  [{ description: 'ChordPro File', accept: { 'text/plain':        ['.cho']  } }],
  zip:  [{ description: 'ZIP Archive',   accept: { 'application/zip':   ['.zip']  } }],
  txt:  [{ description: 'Text File',     accept: { 'text/plain':        ['.txt']  } }],
};

// iPadOS reports itself as MacIntel with touch points — detect it explicitly.
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function fallbackDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export async function saveFilePicker(blob, filename) {
  const ext = filename.split('.').pop().toLowerCase();

  // 0. A saved export folder (Chromium, set in Settings) — write straight in,
  //    no dialog. Falls through to the dialog if the folder was removed or the
  //    permission was revoked, so a stale handle can never block an export.
  if (!isIOS && window.showDirectoryPicker) {
    const dir = await getDirHandle();
    if (dir && await ensurePermission(dir)) {
      try {
        const fileHandle = await dir.getFileHandle(await uniqueName(dir, filename), { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch { /* fall through to the save dialog */ }
    }
  }

  // 1. Chrome / Edge desktop — native save dialog with remembered last folder
  if (window.showSaveFilePicker && !isIOS) {
    const lastHandle = await getLastHandle();
    const opts = {
      suggestedName: filename,
      types: TYPE_MAP[ext] || [{ description: 'File', accept: { 'application/octet-stream': [`.${ext}`] } }],
    };
    if (lastHandle) {
      try { opts.startIn = lastHandle; } catch { /* stale handle */ }
    }
    try {
      const fileHandle = await window.showSaveFilePicker(opts);
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      await setLastHandle(fileHandle);
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    }
    return;
  }

  // 2. iOS / iPadOS — Web Share API opens the native Share Sheet which includes
  //    "Save to Files" with full folder selection.
  if (isIOS) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        // Share ONLY the file — no `title`/`text`. iOS/iPadOS "Save to Files"
        // otherwise writes the title string out as a separate `text.txt`
        // alongside the real file. The saved name comes from the File anyway.
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
        // Share failed — fall through to direct download
      }
    }
    fallbackDownload(blob, filename);
    return;
  }

  // 3. Mac Safari, Firefox, everything else — download to Downloads folder.
  //    Mac Safari users can set Safari › Settings › General ›
  //    "File download location" to "Ask for each download" to choose per-file.
  fallbackDownload(blob, filename);
}
