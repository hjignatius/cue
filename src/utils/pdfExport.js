import { pdf } from '@react-pdf/renderer';
import { parseChordPro, expandSections } from './chordPro.js';
import { semitonesBetween, transposeChord, useFlatsForKey } from './transpose.js';
import { convertToBrackets } from './chordStyle.js';
import { detectChords } from './chordDetect.js';
import { lookupChordDiagrams, resolveChordShape } from './chordLookup.js';
import { getActiveLibrary, DEFAULT_INSTRUMENT } from '../data/chordLibraries.js';
import { SongDocument, SetDocument } from './SongDocument.jsx';
import { saveFilePicker } from './filePicker.js';
import { sanitizeForPdf } from './pdfFonts.js';

function sanitize(name) {
  return (name || 'song').replace(/[/\\:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 100) || 'song';
}

// Swap the couple of palette glyphs DejaVu lacks (⤴ ⤵) for supported arrows in
// every string the PDF prints — the song body and the shown metadata fields.
function metaForPdf(metadata) {
  const m = metadata || {};
  return { ...m, title: sanitizeForPdf(m.title), artist: sanitizeForPdf(m.artist), key: sanitizeForPdf(m.key) };
}

export async function exportToPdf(song, { displayKey, includeChords = false, chordColor, accidentals, instrument = DEFAULT_INSTRUMENT } = {}) {
  const { metadata, text } = song;
  const semitones  = semitonesBetween(metadata?.key, displayKey);
  const useFlats   = useFlatsForKey(accidentals, displayKey);
  const parsedLines = expandSections(parseChordPro(convertToBrackets(sanitizeForPdf(text || ''))));
  const lib = getActiveLibrary(instrument);

  let chordDiagrams = null;
  // Under 'none' there are no diagrams — omit the chord reference page entirely.
  if (includeChords && instrument !== 'none') {
    const names = detectChords(convertToBrackets(text || '')).map(n => semitones ? transposeChord(n, semitones, useFlats) : n);
    chordDiagrams = lookupChordDiagrams(names, song.chordPrefs || {}, instrument);
  }

  const blob = await pdf(SongDocument({ metadata: metaForPdf(metadata), parsedLines, semitones, useFlats, chordDiagrams, chordColor, tuning: lib.tuning, instrumentName: lib.name })).toBlob();
  await saveFilePicker(blob, `${sanitize(metadata?.title)}.pdf`);
}

// Shape one or more sets' songs for the SetDocument renderer: resolve ids to
// song objects and apply each song's saved View-Key transpose + accidental
// spelling (the same render lens as Preview/Present). 0 semitones (no displayKey,
// or equal to the real key) prints in the written key. Order follows the given
// sets, then each set's own song order.
function songsForPdf(sets, allSongs, accidentals) {
  const byId = new Map(allSongs.map(s => [s.id, s]));
  const out = [];
  for (const set of sets) {
    for (const id of set.songIds || []) {
      const song = byId.get(id);
      if (!song) continue;
      out.push({
        metadata:    metaForPdf(song.metadata),
        parsedLines: expandSections(parseChordPro(convertToBrackets(sanitizeForPdf(song.text || '')))),
        text:        song.text || '',
        semitones:   semitonesBetween(song.metadata?.key, song.displayKey),
        useFlats:    useFlatsForKey(accidentals, song.displayKey),
        chordPrefs:  song.chordPrefs || {},
      });
    }
  }
  return out;
}

// Unique chord diagrams across the shaped songs, matching each song's transposed,
// re-spelled body (so the Chord Reference page agrees with the printed chords) and
// honoring each song's selected voicing. Deduped by displayed name — first
// occurrence (with its song's chosen shape) wins.
function chordDiagramsFor(songs, instrument = DEFAULT_INSTRUMENT) {
  const seen = new Set();
  const out = [];
  for (const song of songs) {
    for (const name of detectChords(convertToBrackets(song.text))) {
      const displayed = song.semitones ? transposeChord(name, song.semitones, song.useFlats) : name;
      if (seen.has(displayed)) continue;
      seen.add(displayed);
      const shape = resolveChordShape(displayed, song.chordPrefs || {}, instrument);
      if (shape) out.push(shape);
    }
  }
  return out;
}

export async function exportSetToPdf(set, allSongs, { includeChords = false, chordColor, accidentals, instrument = DEFAULT_INSTRUMENT } = {}) {
  const songs = songsForPdf([set], allSongs, accidentals);
  const lib = getActiveLibrary(instrument);
  const chordDiagrams = (includeChords && instrument !== 'none') ? chordDiagramsFor(songs, instrument) : null;
  const blob = await pdf(SetDocument({ songs, chordDiagrams, chordColor, tuning: lib.tuning, instrumentName: lib.name })).toBlob();
  await saveFilePicker(blob, `${sanitize(set.name)}.pdf`);
}

// Several sets as one combined PDF — every selected set's songs as consecutive
// pages (in selection order), sharing a single Chord Reference page when asked.
export async function exportSetsToPdf(sets, allSongs, { includeChords = false, chordColor, accidentals, instrument = DEFAULT_INSTRUMENT } = {}) {
  const songs = songsForPdf(sets, allSongs, accidentals);
  const lib = getActiveLibrary(instrument);
  const chordDiagrams = (includeChords && instrument !== 'none') ? chordDiagramsFor(songs, instrument) : null;
  const blob = await pdf(SetDocument({ songs, chordDiagrams, chordColor, tuning: lib.tuning, instrumentName: lib.name })).toBlob();
  const date = new Date().toISOString().slice(0, 10);
  await saveFilePicker(blob, `cue-sets-${date}.pdf`);
}
