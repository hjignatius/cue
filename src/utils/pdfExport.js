import { pdf } from '@react-pdf/renderer';
import { parseChordPro, expandSections } from './chordPro.js';
import { semitonesBetween, transposeChord, flatsForKey, displaySemitones, capoFrets } from './transpose.js';
import { convertToBrackets } from './chordStyle.js';
import { detectChords } from './chordDetect.js';
import { lookupChordDiagrams, resolveChordShape } from './chordLookup.js';
import { getActiveLibrary, DEFAULT_INSTRUMENT } from '../data/chordLibraries.js';
import { SongDocument, SetDocument } from './SongDocument.jsx';
import { saveFilePicker } from './filePicker.js';
import { sanitizeForPdf } from './pdfFonts.js';
import { loadPdfBlob } from './storage.js';
import { openForSlot, fillSlots } from './pdfSlots.js';

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
  // A song kept as PDF pages exports as those pages (and its chords, if asked).
  if (song.type === 'pdf') {
    const blob = await renderSongs(await shapeSongs([song], accidentals), { includeChords, instrument });
    await saveFilePicker(blob, `${sanitize(song.metadata?.title)}.pdf`);
    return;
  }
  const { metadata, text } = song;
  const semitones  = displaySemitones(metadata, displayKey);
  const useFlats   = flatsForKey(accidentals, displayKey);
  const parsedP    = parseChordPro(convertToBrackets(sanitizeForPdf(text || '')));
  // Condensed songs print verbatim — skip section-reference expansion.
  const parsedLines = song.condensed === true ? parsedP : expandSections(parsedP);
  const lib = getActiveLibrary(instrument);

  let chordDiagrams = null;
  // Under 'none' there are no diagrams — omit the chord reference page entirely.
  if (includeChords && instrument !== 'none') {
    const names = detectChords(convertToBrackets(text || '')).map(n => semitones ? transposeChord(n, semitones, useFlats) : n);
    chordDiagrams = lookupChordDiagrams(names, song.chordPrefs || {}, instrument);
  }

  // Imbed — over-lyrics "chords as diagrams" inline in the PDF, per the song flag.
  const embed = song.embed === true && instrument !== 'none';
  const shapeFor = embed ? (name) => resolveChordShape(name, song.chordPrefs || {}, instrument) : null;
  // PDFs are black & white — chord text and diagrams both print black on paper.
  const blob = await pdf(SongDocument({ metadata: metaForPdf(metadata), parsedLines, semitones, capo: capoFrets(metadata), useFlats, chordDiagrams, chordColor: '#000000', tuning: lib.tuning, instrumentName: lib.name, embed, shapeFor })).toBlob();
  await saveFilePicker(blob, `${sanitize(metadata?.title)}.pdf`);
}

// Shape one or more sets' songs for the SetDocument renderer: resolve ids to
// song objects and apply each song's saved View-Key transpose + accidental
// spelling (the same render lens as Preview/Present). 0 semitones (no displayKey,
// or equal to the real key) prints in the written key. Order follows the given
// sets, then each set's own song order.
async function songsForPdf(sets, allSongs, accidentals) {
  const byId = new Map(allSongs.map(s => [s.id, s]));
  return shapeSongs(sets.flatMap(set => (set.songIds || []).map(id => byId.get(id)).filter(Boolean)), accidentals);
}

// A song kept as PDF pages prints as those pages: it gets a slot, and `docs`
// holds its opened PDF. It is never transposed — Cue can't move chords drawn on
// a page, and doesn't in Preview or Present either — so its chords (the ones
// typed to match the sheet, for the Chord Reference page) stay as written. One
// whose PDF isn't on this device prints from its words, saying so.
async function shapeSongs(list, accidentals) {
  const out = [];
  const docs = [];
  for (const song of list) {
    const isPage = song.type === 'pdf';
    const doc = isPage ? await openForSlot(await loadPdfBlob(song.id)) : null;
    if (doc) docs.push(doc);
    out.push({
      metadata:    metaForPdf(song.metadata),
      parsedLines: (() => { const p = parseChordPro(convertToBrackets(sanitizeForPdf(song.text || ''))); return song.condensed === true ? p : expandSections(p); })(),
      text:        song.text || '',
      semitones:   isPage ? 0 : displaySemitones(song.metadata, song.displayKey),
      capo:        capoFrets(song.metadata),
      useFlats:    flatsForKey(accidentals, song.displayKey),
      chordPrefs:  song.chordPrefs || {},
      slot:        doc ? docs.length - 1 : null,
      note:        isPage && !doc ? 'The PDF for this song isn’t on this device, so only its words are here.' : null,
    });
  }
  out.docs = docs;
  return out;
}

// The finished PDF for shaped songs: Cue's own pages, each page song's slot
// filled with its own pages, and the Chord Reference page last when asked.
async function renderSongs(songs, { includeChords = false, instrument = DEFAULT_INSTRUMENT } = {}) {
  const lib = getActiveLibrary(instrument);
  const chordDiagrams = (includeChords && instrument !== 'none') ? chordDiagramsFor(songs, instrument) : null;
  const blob = await pdf(SetDocument({ songs, chordDiagrams, chordColor: '#000000', tuning: lib.tuning, instrumentName: lib.name })).toBlob();
  if (!songs.docs.length) return blob;
  return new Blob([await fillSlots(await blob.arrayBuffer(), songs.docs)], { type: 'application/pdf' });
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
  const blob = await renderSongs(await songsForPdf([set], allSongs, accidentals), { includeChords, instrument });
  await saveFilePicker(blob, `${sanitize(set.name)}.pdf`);
}

// Several sets as one combined PDF — every selected set's songs as consecutive
// pages (in selection order), sharing a single Chord Reference page when asked.
export async function exportSetsToPdf(sets, allSongs, { includeChords = false, chordColor, accidentals, instrument = DEFAULT_INSTRUMENT } = {}) {
  const blob = await renderSongs(await songsForPdf(sets, allSongs, accidentals), { includeChords, instrument });
  const date = new Date().toISOString().slice(0, 10);
  await saveFilePicker(blob, `cue-sets-${date}.pdf`);
}
