import { pdf } from '@react-pdf/renderer';
import { parseChordPro, expandSections } from './chordPro.js';
import { semitonesBetween } from './transpose.js';
import { convertToBrackets } from './chordStyle.js';
import { detectChords } from './chordDetect.js';
import { lookupChordDiagrams } from './chordLookup.js';
import { SongDocument, SetDocument } from './SongDocument.jsx';
import { saveFilePicker } from './filePicker.js';

function sanitize(name) {
  return (name || 'song').replace(/[/\\:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 100) || 'song';
}

export async function exportToPdf(song, { displayKey, includeChords = false, chordColor } = {}) {
  const { metadata, text } = song;
  const semitones  = semitonesBetween(metadata?.key, displayKey);
  const parsedLines = expandSections(parseChordPro(convertToBrackets(text || '')));

  let chordDiagrams = null;
  if (includeChords) {
    const names = detectChords(convertToBrackets(text || ''));
    chordDiagrams = lookupChordDiagrams(names);
  }

  const blob = await pdf(SongDocument({ metadata, parsedLines, semitones, chordDiagrams, chordColor })).toBlob();
  await saveFilePicker(blob, `${sanitize(metadata?.title)}.pdf`);
}

export async function exportSetToPdf(set, allSongs, { includeChords = false, chordColor } = {}) {
  const songs = set.songIds
    .map(id => allSongs.find(s => s.id === id))
    .filter(Boolean)
    .map(song => ({
      metadata:    song.metadata,
      parsedLines: expandSections(parseChordPro(convertToBrackets(song.text || ''))),
      text:        song.text || '',
    }));

  let chordDiagrams = null;
  if (includeChords) {
    const seen = new Set();
    const allNames = [];
    for (const song of songs) {
      for (const name of detectChords(convertToBrackets(song.text))) {
        if (!seen.has(name)) { seen.add(name); allNames.push(name); }
      }
    }
    chordDiagrams = lookupChordDiagrams(allNames);
  }

  const blob = await pdf(SetDocument({ songs, chordDiagrams, chordColor })).toBlob();
  await saveFilePicker(blob, `${sanitize(set.name)}.pdf`);
}
