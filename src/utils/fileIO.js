import { zipSync } from 'fflate';
import { saveFilePicker } from './filePicker.js';
import { loadSongs, loadSets, collectPdfBackups, SCHEMA_VERSION } from './storage.js';
import { convertToBrackets, detectChordStyle } from './chordStyle.js';
import { stripStyling } from './chordPro.js';
import { normalizeTimeSig } from './timeSig.js';
import { detectChords } from './chordDetect.js';
// ANNOTATION SAFETY: all export functions below read exclusively from loadSongs()
// and loadSets() (the 'songs'/'sets' IndexedDB stores). Ink annotations live in
// a separate 'annotations' store and are intentionally never read here, so they
// can never appear in .cho, .json, .zip, or backup exports.

// ---- Custom chord library (per-instrument, localStorage) --------------------
//
// The .cho/.json/backup transfer format carries a flat, untagged customs array
// (historically all ukulele). Per the PR2 decision, this channel is PINNED to
// ukulele on both export and import: legacy backups always round-trip correctly,
// and non-ukulele customs wait for an instrument-tagged format (deferred, 6ii).
// So these default to the ukulele scope; only customChordsForSong takes the
// active instrument (the publish embed, point 7).

import {
  loadCustomChords as loadScopedCustom,
  saveCustomChords as saveScopedCustom,
  mutateCustomChords,
  loadHiddenChords as loadScopedHidden,
  saveHiddenChords as saveScopedHidden,
  mutateHiddenChords,
} from './chordStorage.js';
import { DEFAULT_INSTRUMENT, CHORD_LIBRARIES } from '../data/chordLibraries.js';

export function loadCustomChords(instrument = DEFAULT_INSTRUMENT) {
  return loadScopedCustom(instrument);
}

export function mergeCustomChords(incoming = [], instrument = DEFAULT_INSTRUMENT) {
  let added = 0;
  mutateCustomChords(instrument, existing => {
    const next = [...existing];
    for (const chord of incoming) {
      if (!Array.isArray(chord.frets)) continue;
      const isDupe = next.some(c => c.name === chord.name && c.frets.join(',') === chord.frets.join(','));
      if (!isDupe) { next.push(chord); added++; }
    }
    return next;
  });
  return added;
}

export function replaceCustomChords(chords = [], instrument = DEFAULT_INSTRUMENT) {
  saveScopedCustom(instrument, chords);
}

// The custom chord shapes a song might display — those whose name matches a chord
// in the song. Embedded in a song's published content so another device can
// render them after pulling, since the custom-chord library is otherwise
// device-local (localStorage) and never travels through publish/pull.
//
// KNOWN LIMITATION (multi-instrument): these embed the ACTIVE instrument's custom
// shapes, but the published payload is NOT tagged with which instrument they are.
// A puller on a different instrument would see wrong-tuning fingerings. Deferred
// (finding 6ii): tag embedded customs by instrument and match the puller's active
// one. PR2 embeds the active instrument's customs so newly added shapes travel.
export function customChordsForSong(song, instrument = DEFAULT_INSTRUMENT) {
  const names = new Set(detectChords(convertToBrackets(song?.text || '')));
  return loadScopedCustom(instrument).filter(c => names.has(c.name));
}

// ---- Tagged chord libraries (all instruments) -------------------------------
//
// The flat array above is ukulele-only in both directions, which was fine while
// ukulele was the only library anyone had. It is not fine now that Settings
// offers Baritone and Guitar: a shape added on guitar lived on one device and
// appeared in no backup, with nothing on screen to say so — the same silent loss
// as a chord erased by a stale panel write, but structural. And hidden built-ins
// travelled nowhere at all, on any instrument, so a restore quietly brought back
// every built-in shape you had deleted.
//
// Exports therefore carry a TAGGED block as well, keyed by instrument id. The
// flat `customChords` array stays byte-for-byte as it was, so a new file still
// restores into an older Cue, and a restore that finds no tagged block falls
// through to the old ukulele-pinned path unchanged. That is what keeps every
// backup already on his disk working.

// 'none' is excluded: it is "diagrams off", not an instrument with a library.
export const TRANSFER_INSTRUMENTS = Object.keys(CHORD_LIBRARIES).filter(id => id !== 'none');

// Snapshot of every instrument's library, for an export. Empty scopes are left
// out rather than written as empty objects, so a ukulele-only device's backup
// does not grow keys describing instruments it has never used.
export function chordLibrarySnapshot() {
  const customs = {};
  const hidden  = {};
  for (const inst of TRANSFER_INSTRUMENTS) {
    const c = loadScopedCustom(inst);
    if (Array.isArray(c) && c.length) customs[inst] = c;
    const h = loadScopedHidden(inst);
    if (Array.isArray(h) && h.length) hidden[inst] = h;
  }
  return {
    ...(Object.keys(customs).length ? { customChordsByInstrument: customs } : {}),
    ...(Object.keys(hidden).length  ? { hiddenChordsByInstrument: hidden }  : {}),
  };
}

// Merge the shapes a pulled song or set carried, each into the scope it was
// published FOR rather than into the puller's default. A guitar publisher's
// fingerings used to land in the puller's ukulele library and render as wrong
// shapes for the wrong instrument; now they land in the guitar scope, where a
// ukulele player simply does not see them — which is the right answer.
//
// Content published before this carries no tag and is treated as ukulele, exactly
// as it was. Returns the number of shapes actually added.
export function mergeTaggedSongCustoms(songs = []) {
  const byInstrument = new Map();
  for (const s of songs) {
    const chords = s?.customChords;
    if (!Array.isArray(chords) || !chords.length) continue;
    const tag  = s.customChordsInstrument;
    const inst = typeof tag === 'string' && TRANSFER_INSTRUMENTS.includes(tag) ? tag : DEFAULT_INSTRUMENT;
    if (!byInstrument.has(inst)) byInstrument.set(inst, []);
    byInstrument.get(inst).push(...chords);
  }
  let added = 0;
  for (const [inst, chords] of byInstrument) added += mergeCustomChords(chords, inst);
  return added;
}

function plainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

// True when a bundle carries the tagged block, i.e. when the caller should use
// restoreChordLibraries instead of the flat `customChords` array.
export function hasTaggedChordLibraries(data) {
  return plainObject(data?.customChordsByInstrument) || plainObject(data?.hiddenChordsByInstrument);
}

// Restore side. `mode` is 'merge' or 'replace', matching the backup dialog.
// Returns { customs: {inst: addedCount}, hidden: {inst: addedCount} } or null
// when there is no tagged block to read.
//
// Only scopes PRESENT in the file are touched, including under 'replace'. An
// instrument missing from the block means the exporting device had nothing for
// it, which is not the same statement as "delete what you have" — and a restore
// is the wrong place to guess at the difference.
export function restoreChordLibraries(data, mode = 'merge') {
  if (!hasTaggedChordLibraries(data)) return null;
  const customs = data.customChordsByInstrument;
  const hidden  = data.hiddenChordsByInstrument;
  const result  = { customs: {}, hidden: {} };

  for (const inst of TRANSFER_INSTRUMENTS) {
    const inCustoms = plainObject(customs) && Array.isArray(customs[inst]) ? customs[inst] : null;
    if (inCustoms) {
      const valid = inCustoms.filter(c => c && typeof c.name === 'string' && Array.isArray(c.frets));
      if (mode === 'replace') {
        replaceCustomChords(valid, inst);
        result.customs[inst] = valid.length;
      } else {
        result.customs[inst] = mergeCustomChords(valid, inst);
      }
    }

    const inHidden = plainObject(hidden) && Array.isArray(hidden[inst])
      ? hidden[inst].filter(k => typeof k === 'string')
      : null;
    if (inHidden) {
      if (mode === 'replace') {
        const next = [...new Set(inHidden)];
        saveScopedHidden(inst, next);
        result.hidden[inst] = next.length;
      } else {
        const before = loadScopedHidden(inst).length;
        const after  = mutateHiddenChords(inst, cur => [...new Set([...cur, ...inHidden])]).length;
        result.hidden[inst] = after - before;
      }
    }
  }
  return result;
}

// -----------------------------------------------------------------------------

function sanitizeFilename(name) {
  return ((name || 'Untitled').replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)) || 'Untitled';
}

async function download(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  return saveFilePicker(blob, filename); // { ok, method, location? } — for caller feedback
}

function readFile(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    // Attach before .click() — a detached input can be GC'd before its change
    // event fires on iOS Safari, silently dropping the first import attempt.
    input.style.display = 'none';
    document.body.appendChild(input);
    input.oncancel = () => { input.remove(); reject(new Error('No file selected')); };
    input.onchange = () => {
      input.remove();
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = e => resolve({ name: file.name, content: e.target.result });
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}

// ---- ChordPro (.cho / .chopro) ----------------------------------------------

export function parseCho(content) {
  // Normalize line endings (OnSong and other apps export \r\n)
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const metadata = { title: '', artist: '', key: '', tempo: '', duration: '' };
  const bodyLines = [];

  for (const line of lines) {
    const m = line.match(/^\{(\w+):\s*(.*?)\s*\}$/);
    if (m) {
      const [, key, value] = m;
      if      (key === 'title')                    metadata.title  = value;
      else if (key === 'artist' || key === 'subtitle') metadata.artist = value;
      else if (key === 'key')                      metadata.key    = value;
      else if (key === 'tempo'  || key === 'bpm')  metadata.tempo  = value;
      else if (key === 'duration')                 metadata.duration = value;
      else if (key === 'timesig' || key === 'time') metadata.timeSig  = normalizeTimeSig(value);
      else bodyLines.push(line); // unknown directives stay in body
    } else {
      bodyLines.push(line);
    }
  }

  return { metadata, text: bodyLines.join('\n').trim() };
}

function songToCho({ metadata, text, chordStyle }) {
  // ChordPro is inline-bracket notation by definition. A song stored in
  // over-lyrics style must be converted, or the .cho comes out in over-lyrics
  // layout — which no ChordPro reader (including Cue's own import) parses as
  // chords. Fall back to detecting the style for songs saved without one.
  const style = chordStyle || detectChordStyle(text);
  // Strip Cue's inline lyric-styling markup — a .cho is meant for other ChordPro
  // readers, which would render {c=#hex}/**/* as literal characters. Styling is
  // preserved in Cue's own JSON/backup exports, which re-import into Cue.
  const body = stripStyling(style === 'over' ? convertToBrackets(text) : text);
  const directives = [
    metadata.title    && `{title: ${metadata.title}}`,
    metadata.artist   && `{artist: ${metadata.artist}}`,
    metadata.key      && `{key: ${metadata.key}}`,
    metadata.tempo    && `{tempo: ${metadata.tempo}}`,
    metadata.duration && `{duration: ${metadata.duration}}`,
    metadata.timeSig && metadata.timeSig !== '4/4' && `{timesig: ${metadata.timeSig}}`,
  ].filter(Boolean).join('\n');
  return directives ? `${directives}\n\n${body}` : body;
}

export async function exportCho(song) {
  download(`${sanitizeFilename(song.metadata.title)}.cho`, songToCho(song), 'text/plain');
}

// Export a selection of songs as a ZIP of individual .cho files.
export async function exportSongsZip(songs) {
  const enc = new TextEncoder();
  const files = {};
  const usedNames = new Set();
  for (const song of songs) {
    let base = sanitizeFilename(song.metadata?.title);
    let name = `${base}.cho`;
    let n = 1;
    while (usedNames.has(name)) { name = `${base} (${++n}).cho`; }
    usedNames.add(name);
    files[name] = enc.encode(songToCho(song));
  }
  const zipped = zipSync(files, { level: 0 });
  const date = new Date().toISOString().slice(0, 10);
  await saveFilePicker(new Blob([zipped], { type: 'application/zip' }), `cue-export-${date}.zip`);
}

// Export multiple sets (with all their referenced songs) as a single JSON bundle.
export async function exportSetsJson(sets, allSongs) {
  const fresh = await loadSongs();
  const songMap = new Map(fresh.map(s => [s.id, s]));
  const songs = [];
  const seen  = new Set();
  for (const set of sets) {
    for (const id of set.songIds) {
      if (!seen.has(id)) {
        const song = songMap.get(id) || allSongs.find(s => s.id === id);
        if (song) { songs.push(song); seen.add(id); }
      }
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  const customChords = loadCustomChords();
  const pdfs = await collectPdfBackups(songs);
  const payload = JSON.stringify({ type: 'cue-sets', version: 2, sets, songs, customChords, ...chordLibrarySnapshot(), pdfs }, null, 2);
  download(`cue-sets-${date}.json`, payload, 'application/json');
}

// Export a selection of songs as a JSON bundle.
export async function exportSongsJson(selectedSongs) {
  const fresh = await loadSongs();
  const songMap = new Map(fresh.map(s => [s.id, s]));
  const songs = selectedSongs.map(s => songMap.get(s.id) || s);
  const date = new Date().toISOString().slice(0, 10);
  const pdfs = await collectPdfBackups(songs);
  const payload = JSON.stringify({ type: 'cue-songs', version: 2, songs, pdfs }, null, 2);
  download(`cue-export-${date}.json`, payload, 'application/json');
}

export async function importCho() {
  const { content } = await readFile('.cho,.chopro,.txt');
  return parseCho(content);
}

// ---- Share (Web Share Level 2, download fallback) ---------------------------

// True when the OS share sheet can take a .json FILE (iOS Safari, Android
// Chrome, some desktop). Where false (Firefox, most desktop), callers fall back
// to a download. Used to show/hide the "Share…" export option.
export function canShareFiles() {
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [probe] });
  } catch { return false; }
}

// Hand a JSON payload to the OS share sheet as a file so the user can pick Mail
// (attachment + subject pre-filled from `title`, a note from `text`) or any other
// target. Falls back to a normal download. Returns 'shared' | 'cancelled' | 'downloaded'.
async function shareJsonFile(payload, filename, { title, text } = {}) {
  const file = new File([payload], filename, { type: 'application/json' });
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'; // user dismissed the sheet
      // any other share failure → fall through to a download
    }
  }
  await download(filename, payload, 'application/json');
  return 'downloaded';
}

// Share the selected song(s) as a .json (single-song bundle when one is picked).
export async function shareSongsJson(selectedSongs) {
  const fresh = await loadSongs();
  const songMap = new Map(fresh.map(s => [s.id, s]));
  const songs = selectedSongs.map(s => songMap.get(s.id) || s);
  const one = songs.length === 1 ? songs[0] : null;
  const date = new Date().toISOString().slice(0, 10);
  const pdfs = await collectPdfBackups(songs);
  const payload = one
    ? JSON.stringify({ type: 'cue-song', version: 2, song: one, pdfs }, null, 2)
    : JSON.stringify({ type: 'cue-songs', version: 2, songs, pdfs }, null, 2);
  const filename = one ? `${sanitizeFilename(one.metadata?.title)}.json` : `cue-songs-${date}.json`;
  const title = one ? `Cue song: ${one.metadata?.title || 'Untitled'}` : `Cue songs (${songs.length})`;
  const text  = `${one ? `"${one.metadata?.title || 'Untitled'}"` : `${songs.length} songs`} from Cue. Open in Cue: Import → pick this .json file.`;
  return shareJsonFile(payload, filename, { title, text });
}

// Share the selected set(s) + their songs as a .json (single-set bundle for one).
export async function shareSetsJson(sets, allSongs) {
  const fresh = await loadSongs();
  const songMap = new Map(fresh.map(s => [s.id, s]));
  const songs = [];
  const seen  = new Set();
  for (const set of sets) {
    for (const id of set.songIds) {
      if (!seen.has(id)) {
        const song = songMap.get(id) || allSongs.find(s => s.id === id);
        if (song) { songs.push(song); seen.add(id); }
      }
    }
  }
  const customChords = loadCustomChords();
  const pdfs = await collectPdfBackups(songs);
  const one = sets.length === 1 ? sets[0] : null;
  const date = new Date().toISOString().slice(0, 10);
  const tagged = chordLibrarySnapshot();
  const payload = one
    ? JSON.stringify({ type: 'cue-set', version: 2, set: one, songs, customChords, ...tagged, pdfs }, null, 2)
    : JSON.stringify({ type: 'cue-sets', version: 2, sets, songs, customChords, ...tagged, pdfs }, null, 2);
  const filename = one ? `${sanitizeFilename(one.name)}.json` : `cue-sets-${date}.json`;
  const title = one ? `Cue set: ${one.name}` : `Cue sets (${sets.length})`;
  const text  = `${one ? `"${one.name}"` : `${sets.length} sets`} from Cue. Open in Cue: Import → pick this .json file.`;
  return shareJsonFile(payload, filename, { title, text });
}

// ---- JSON bundles -----------------------------------------------------------

export async function exportSongJson(song) {
  const pdfs = await collectPdfBackups([song]);
  const payload = JSON.stringify({ type: 'cue-song', version: 2, song, pdfs }, null, 2);
  download(`${sanitizeFilename(song.metadata.title)}.json`, payload, 'application/json');
}

// Exports a set + every song it references as a single portable bundle.
export async function exportSetJson(set, allSongs) {
  const fresh = await loadSongs();
  const songMap = new Map(fresh.map(s => [s.id, s]));
  const songs = set.songIds.map(id => songMap.get(id) || allSongs.find(s => s.id === id)).filter(Boolean);
  const customChords = loadCustomChords();
  const pdfs = await collectPdfBackups(songs);
  const payload = JSON.stringify({ type: 'cue-set', version: 2, set, songs, customChords, ...chordLibrarySnapshot(), pdfs }, null, 2);
  download(`${sanitizeFilename(set.name)}.json`, payload, 'application/json');
}

// Returns the parsed bundle — handles both old 'cue-setlist' and new 'cue-set' types.
export async function importJson() {
  const { content } = await readFile('.json');
  let data;
  try { data = JSON.parse(content); } catch { throw new Error('Invalid JSON file'); }
  if (!data.type || !data.version) throw new Error('Not a valid Cue file');
  // Normalise old bundle format
  if (data.type === 'cue-setlist' && data.setlist) {
    data = { ...data, type: 'cue-set', set: data.setlist };
  }
  return data;
}

// Full library backup — all songs + all sets + custom chords in one file. PDF
// songs' bytes ride along as base64 under `pdfs` (version 3) so a restore brings
// the lead sheets back; older v2 backups simply have no `pdfs`.
export async function exportBackup() {
  const [songs, sets] = await Promise.all([loadSongs(), loadSets()]);
  const date = new Date().toISOString().slice(0, 10);
  const customChords = loadCustomChords();
  const pdfs = await collectPdfBackups(songs); // { songId: base64 }
  const payload = JSON.stringify({ type: 'cue-backup', version: 3, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), songs, sets, customChords, ...chordLibrarySnapshot(), pdfs }, null, 2);
  return download(`cue-backup-${date}.json`, payload, 'application/json');
}

// Plain-text set export — numbered song list for sharing via message/print.
export async function exportSetText(set, allSongs) {
  function csvField(val) {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const rows = [
    'Title,Artist,Key',
    ...set.songIds.map(id => {
      const song = allSongs.find(s => s.id === id);
      return [
        csvField(song?.metadata?.title || 'Untitled'),
        csvField(song?.metadata?.artist || ''),
        csvField(song?.metadata?.key || ''),
      ].join(',');
    }),
  ];
  download(`${sanitizeFilename(set.name)}.csv`, rows.join('\n'), 'text/csv');
}
