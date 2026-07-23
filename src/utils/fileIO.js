import { zipSync } from 'fflate';
import { saveFilePicker } from './filePicker.js';
import { loadSongs, loadSets, SCHEMA_VERSION } from './storage.js';
import { convertToBrackets, detectChordStyle } from './chordStyle.js';
import { stripStyling } from './chordPro.js';
import { detectChords } from './chordDetect.js';
// ANNOTATION SAFETY: all export functions below read exclusively from loadSongs()
// and loadSets() (the 'songs'/'sets' IndexedDB stores). Ink annotations live in
// a separate 'annotations' store and are intentionally never read here, so they
// can never appear in .cho, .json, .zip, or backup exports.

// ---- Custom chord library (localStorage) ------------------------------------

const CUSTOM_CHORDS_KEY = 'cue_custom_chords';

export function loadCustomChords() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_CHORDS_KEY) || '[]'); } catch { return []; }
}

export function mergeCustomChords(incoming = []) {
  const existing = loadCustomChords();
  let added = 0;
  for (const chord of incoming) {
    if (!Array.isArray(chord.frets)) continue;
    const isDupe = existing.some(c => c.name === chord.name && c.frets.join(',') === chord.frets.join(','));
    if (!isDupe) { existing.push(chord); added++; }
  }
  localStorage.setItem(CUSTOM_CHORDS_KEY, JSON.stringify(existing));
  return added;
}

export function replaceCustomChords(chords = []) {
  localStorage.setItem(CUSTOM_CHORDS_KEY, JSON.stringify(chords));
}

// The custom chord shapes a song might display — those whose name matches a chord
// in the song. Embedded in a song's published content so another device can
// render them after pulling, since the custom-chord library is otherwise
// device-local (localStorage) and never travels through publish/pull.
export function customChordsForSong(song) {
  const names = new Set(detectChords(convertToBrackets(song?.text || '')));
  return loadCustomChords().filter(c => names.has(c.name));
}

// -----------------------------------------------------------------------------

function sanitizeFilename(name) {
  return ((name || 'Untitled').replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)) || 'Untitled';
}

async function download(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  await saveFilePicker(blob, filename);
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
      else if (key === 'timesig' || key === 'time') metadata.timeSig  = value;
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
  const payload = JSON.stringify({ type: 'cue-sets', version: 1, sets, songs, customChords }, null, 2);
  download(`cue-sets-${date}.json`, payload, 'application/json');
}

// Export a selection of songs as a JSON bundle.
export async function exportSongsJson(selectedSongs) {
  const fresh = await loadSongs();
  const songMap = new Map(fresh.map(s => [s.id, s]));
  const songs = selectedSongs.map(s => songMap.get(s.id) || s);
  const date = new Date().toISOString().slice(0, 10);
  const payload = JSON.stringify({ type: 'cue-songs', version: 1, songs }, null, 2);
  download(`cue-export-${date}.json`, payload, 'application/json');
}

export async function importCho() {
  const { content } = await readFile('.cho,.chopro,.txt');
  return parseCho(content);
}

// ---- JSON bundles -----------------------------------------------------------

export async function exportSongJson(song) {
  const payload = JSON.stringify({ type: 'cue-song', version: 1, song }, null, 2);
  download(`${sanitizeFilename(song.metadata.title)}.json`, payload, 'application/json');
}

// Exports a set + every song it references as a single portable bundle.
export async function exportSetJson(set, allSongs) {
  const fresh = await loadSongs();
  const songMap = new Map(fresh.map(s => [s.id, s]));
  const songs = set.songIds.map(id => songMap.get(id) || allSongs.find(s => s.id === id)).filter(Boolean);
  const customChords = loadCustomChords();
  const payload = JSON.stringify({ type: 'cue-set', version: 1, set, songs, customChords }, null, 2);
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

// Full library backup — all songs + all sets + custom chords in one file.
export async function exportBackup() {
  const [songs, sets] = await Promise.all([loadSongs(), loadSets()]);
  const date = new Date().toISOString().slice(0, 10);
  const customChords = loadCustomChords();
  const payload = JSON.stringify({ type: 'cue-backup', version: 2, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), songs, sets, customChords }, null, 2);
  download(`cue-backup-${date}.json`, payload, 'application/json');
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
