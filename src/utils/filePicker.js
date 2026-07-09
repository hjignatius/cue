import { openDB } from 'idb';

const DB_NAME    = 'cue-picker';
const STORE      = 'state';
const HANDLE_KEY = 'lastFileHandle';

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
        await navigator.share({ files: [file], title: filename });
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
