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

export async function exportSetToPdf(set, allSongs, { includeChords = false, chordColor, accidentals } = {}) {
  const songs = set.songIds
    .map(id => allSongs.find(s => s.id === id))
    .filter(Boolean)
    .map(song => ({
      metadata:    song.metadata,
      parsedLines: expandSections(parseChordPro(convertToBrackets(song.text || ''))),
      text:        song.text || '',
      // Same render-time lens as Preview/Present: transpose to the saved
      // displayKey when set. 0 (no displayKey, or equal to the real key)
      // prints in the written key.
      semitones:   semitonesBetween(song.metadata?.key, song.displayKey),
      // Accidental spelling for this song's transposed chords (auto → View Key).
      useFlats:    useFlatsForKey(accidentals, song.displayKey),
    }));

  let chordDiagrams = null;
  if (includeChords) {
    const seen = new Set();
    const allNames = [];
    for (const song of songs) {
      for (const name of detectChords(convertToBrackets(song.text))) {
        // Reference diagrams must match the transposed, re-spelled song bodies.
        const displayed = song.semitones ? transposeChord(name, song.semitones, song.useFlats) : name;
        if (!seen.has(displayed)) { seen.add(displayed); allNames.push(displayed); }
      }
    }
    chordDiagrams = lookupChordDiagrams(allNames);
  }

  const blob = await pdf(SetDocument({ songs, chordDiagrams, chordColor })).toBlob();
  await saveFilePicker(blob, `${sanitize(set.name)}.pdf`);
}
