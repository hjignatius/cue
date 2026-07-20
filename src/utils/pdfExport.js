import { pdf } from '@react-pdf/renderer';
import { parseChordPro, expandSections } from './chordPro.js';
import { semitonesBetween, transposeChord, useFlatsForKey } from './transpose.js';
import { convertToBrackets } from './chordStyle.js';
import { detectChords } from './chordDetect.js';
import { lookupChordDiagrams } from './chordLookup.js';
import { SongDocument, SetDocument } from './SongDocument.jsx';
import { saveFilePicker } from './filePicker.js';

function sanitize(name) {
  return (name || 'song').replace(/[/\\:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 100) || 'song';
}

export async function exportToPdf(song, { displayKey, includeChords = false, chordColor, accidentals } = {}) {
  const { metadata, text } = song;
  const semitones  = semitonesBetween(metadata?.key, displayKey);
  const useFlats   = useFlatsForKey(accidentals, displayKey);
  const parsedLines = expandSections(parseChordPro(convertToBrackets(text || '')));

  let chordDiagrams = null;
  if (includeChords) {
    const names = detectChords(convertToBrackets(text || '')).map(n => semitones ? transposeChord(n, semitones, useFlats) : n);
    chordDiagrams = lookupChordDiagrams(names);
  }

  const blob = await pdf(SongDocument({ metadata, parsedLines, semitones, useFlats, chordDiagrams, chordColor })).toBlob();
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
        metadata:    song.metadata,
        parsedLines: expandSections(parseChordPro(convertToBrackets(song.text || ''))),
        text:        song.text || '',
        semitones:   semitonesBetween(song.metadata?.key, song.displayKey),
        useFlats:    useFlatsForKey(accidentals, song.displayKey),
      });
    }
  }
  return out;
}

// Unique chord diagrams across the shaped songs, matching each song's transposed,
// re-spelled body (so the Chord Reference page agrees with the printed chords).
function chordDiagramsFor(songs) {
  const seen = new Set();
  const names = [];
  for (const song of songs) {
    for (const name of detectChords(convertToBrackets(song.text))) {
      const displayed = song.semitones ? transposeChord(name, song.semitones, song.useFlats) : name;
      if (!seen.has(displayed)) { seen.add(displayed); names.push(displayed); }
    }
  }
  return lookupChordDiagrams(names);
}

export async function exportSetToPdf(set, allSongs, { includeChords = false, chordColor, accidentals } = {}) {
  const songs = songsForPdf([set], allSongs, accidentals);
  const chordDiagrams = includeChords ? chordDiagramsFor(songs) : null;
  const blob = await pdf(SetDocument({ songs, chordDiagrams, chordColor })).toBlob();
  await saveFilePicker(blob, `${sanitize(set.name)}.pdf`);
}

// Several sets as one combined PDF — every selected set's songs as consecutive
// pages (in selection order), sharing a single Chord Reference page when asked.
export async function exportSetsToPdf(sets, allSongs, { includeChords = false, chordColor, accidentals } = {}) {
  const songs = songsForPdf(sets, allSongs, accidentals);
  const chordDiagrams = includeChords ? chordDiagramsFor(songs) : null;
  const blob = await pdf(SetDocument({ songs, chordDiagrams, chordColor })).toBlob();
  const date = new Date().toISOString().slice(0, 10);
  await saveFilePicker(blob, `cue-sets-${date}.pdf`);
}
