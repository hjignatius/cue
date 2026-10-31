import { useEffect, useRef, useState } from 'react';
import LibraryView from './views/LibraryView.jsx';
import EditorView from './views/EditorView.jsx';
import PresentationView from './views/PresentationView.jsx';
import UpdateButton from './components/UpdateButton.jsx';
import SongbookDialog from './components/SongbookDialog.jsx';
import SheetChartDialog from './components/SheetChartDialog.jsx';
import PagePicker from './components/PagePicker.jsx';
import { loadSongs, loadSets, saveSong, saveSet, deleteSong, removeSongFromAllSets, clearDraft, clearLibrary, savePdfBlob, restorePdfBackup } from './utils/storage.js';
import { normalizeTitle } from './utils/contentHash.js';
import { parseCho, mergeCustomChords, replaceCustomChords, restoreChordLibraries } from './utils/fileIO.js';
import { CHORD_LIBRARIES } from './data/chordLibraries.js';
import { usePrefs } from './context/PrefsContext.jsx';
import { useSwUpdate, applyUpdate, dismissUpdate } from './swUpdate.js';
import './index.css';

// Case/punctuation-insensitive title comparison for conflict detection
export default function App() {
  const { theme } = usePrefs();
  const dark = theme === 'dark';

  // Service-worker update state + a handle the editor fills with { isDirty, save }
  // so the Update button can confirm/save unsaved work at tap time (cleared when
  // the editor unmounts, so it reads falsy anywhere else).
  const { updateAvailable, dismissed } = useSwUpdate();
  const editorApiRef = useRef(null);

  const [view, setView]             = useState('library');
  const [songs, setSongs]           = useState([]);
  const [sets, setSets]             = useState([]);
  const [activeSong, setActiveSong]           = useState(null);
  const [presenting, setPresenting]           = useState(null);
  const [returnToPresenting, setReturnToPresenting] = useState(null);
  const [presentEntryView, setPresentEntryView] = useState(null);
  const [setlistContext, setSetlistContext]     = useState(null); // { songs, idx } when editing from setlist
  const [libraryContext, setLibraryContext]     = useState(null); // { songs, idx } when editing from library list
  const [editorKey, setEditorKey]             = useState(0);
  // Incremented whenever the editor becomes visible after a presentation session,
  // so EditorView re-checks annotation status even when it stayed mounted.
  const [editorAnnotStamp, setEditorAnnotStamp] = useState(0);
  const [loading, setLoading]                 = useState(true);
  const [conflictDialog, setConflictDialog]   = useState(null);
  // conflictDialog: { title: string, resolve: (choice: 'overwrite'|'duplicate'|'cancel') => void }
  const [backupDialog, setBackupDialog]       = useState(null);
  // backupDialog: { resolve: (choice: 'replace'|'merge'|'cancel') => void }
  const [setsImportDialog, setSetsImportDialog] = useState(null);
  // setsImportDialog: { resolve: (choice: 'allow'|'skip'|'cancel') => void }
  const [songbook, setSongbook] = useState(null);
  // A one-song PDF that reads as a chart: { fileName, chart, resolve } while
  // you choose between text and the page (askSheetChart).
  const [sheetOffer, setSheetOffer] = useState(null);
  // songbook: { fileName, reading: {done,total,saving?}, songs: [...]|null, resolve, abort }

  async function refresh() {
    const [s, sets_] = await Promise.all([loadSongs(), loadSets()]);
    setSongs(s);
    setSets(sets_);
  }

  useEffect(() => {
    refresh().then(() => setLoading(false));
  }, []);

  // Returns a Promise that resolves when the user picks Overwrite / Duplicate / Cancel.
  // Only used for single-song imports — set/backup imports skip this.
  function askConflict(title) {
    return new Promise(resolve => setConflictDialog({ title, resolve }));
  }

  // A PDF imported into the Library may be a whole songbook. Read its text and
  // write the BOOK REPORT (bookReport.js): what it is, how the songs were found,
  // what was tidied, and whether it can be split at all. Resolves to 'done'
  // when songs were created ({ show } says where to take you, if you asked),
  // 'page' to import the PDF as one page song exactly as before, 'cancel' to
  // skip the file.
  //
  // A short PDF that is one chart — or a few pages Cue can't split — never sees
  // the dialog and goes straight in as a page song, as it always has. A book
  // does see it, even one that can't be split: being told why beats a silent
  // one-PDF import of 200 pages. `read` is the book's pages when a batch import
  // has already read them.
  async function askSongbook(file, read = null) {
    const abort = new AbortController();
    let report, pages;
    try {
      const [{ extractSongbookPages }, { bookReport, isBook }] = await Promise.all([
        import('./utils/pdfjs.js'), import('./utils/bookReport.js'),
      ]);
      // Progress at most a few times a second. Every update re-renders the
      // whole app, and once a page for Jim's 5,155 kept it too busy to answer.
      let shown = 0;
      let marks;
      ({ pages, marks } = read || await extractSongbookPages(file, {
        signal: abort.signal,
        onPage: (done, total) => {
          if (total <= 12 || (done < total && performance.now() - shown < 150)) return;
          shown = performance.now();
          setSongbook({ fileName: file.name, reading: { done, total }, abort: () => abort.abort() });
        },
      }));
      report = bookReport(pages, marks);
      if (!isBook(report)) { setSongbook(null); return 'page'; }
    } catch (e) {
      setSongbook(null);
      return e?.code === 'aborted' ? 'cancel' : 'page';
    }

    const have = new Set((await loadSongs()).map(s => normalizeTitle(s.metadata?.title)));
    const marked = report.songs.map(s => ({ ...s, inLibrary: have.has(normalizeTitle(s.title)) }));
    const shown = { ...report, songs: marked };
    let choice;
    for (;;) {
      choice = await new Promise(resolve => setSongbook({ fileName: file.name, report: shown, songs: marked, resolve, book: true }));
      if (choice !== 'pick') break;
      // Picked by hand, page by page. "Back" returns to the report as it was.
      // A PDF short enough to be sheets is read again with any chords drawn
      // above the lyrics put into them, so those pages say Chart too.
      const [{ pickerStart, sheetPickerStart }, { extractSheetPages, MAX_UNPACK_PAGES }] = await Promise.all([
        import('./utils/bookReport.js'), import('./utils/pdfjs.js'),
      ]);
      let pickPages = pages;
      if (pages.length <= MAX_UNPACK_PAGES) {
        try { pickPages = await extractSheetPages(file); } catch { /* as the book reader read them */ }
      }
      const start = sheetPickerStart(pickPages, file.name) || pickerStart(report, pickPages);
      const picked = await new Promise(resolve => setSongbook({ fileName: file.name, picker: { file, start }, resolve }));
      if (picked === 'back') continue;
      setSongbook(null);
      if (picked === 'cancel') return 'cancel';
      return saveCutSongs(file, picked, pickPages);
    }
    setSongbook(null);
    if (choice === 'page' || choice === 'cancel') return choice;

    return saveImported(file.name, marked, choice, (s, title) => {
      const metadata = { title };
      if (s.artist) metadata.artist = s.artist;
      if (s.key) metadata.key = s.key;
      if (s.youtubeUrl) metadata.youtubeUrl = s.youtubeUrl;
      return saveSong({ id: null, metadata, text: s.text, chordStyle: 'brackets', previewMode: 'brackets', source: { book: file.name, page: s.firstPage } });
    });
  }

  // The page picker's songs. One whose pages Cue can read comes in as a chart,
  // read again from just those pages (pickedCharts) — the picker has settled
  // where it starts and ends — unless you asked for the pages. Every other one
  // has its pages cut out of the book as a PDF of its own (pdfCut.js). Either
  // way the song remembers where it came from.
  async function saveCutSongs(file, { songs: cut, setName }, pages) {
    setSongbook({ fileName: file.name, reading: { done: 0, total: cut.length, saving: true } });
    const [{ openBook }, { pickedCharts }] = await Promise.all([import('./utils/pdfCut.js'), import('./utils/bookReport.js')]);
    const charts = pickedCharts(pages, cut);
    const book = cut.some((s, i) => !charts[i]) ? await openBook(file) : null;
    return saveImported(file.name, cut, { picked: cut.map((_, i) => i), setName, titles: {} }, async (s, title) => {
      const metadata = { title };
      if (s.artist) metadata.artist = s.artist;
      if (s.key) metadata.key = s.key;
      const chart = charts[cut.indexOf(s)];
      if (chart) {
        if (!metadata.artist && chart.artist) metadata.artist = chart.artist;
        if (chart.youtubeUrl) metadata.youtubeUrl = chart.youtubeUrl;
        return saveSong({ id: null, metadata, text: chart.text, chordStyle: 'brackets', previewMode: 'brackets', source: { book: file.name, page: s.firstPage } });
      }
      const bytes = await book.cut(s.pages);
      const name = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || `Page ${s.firstPage}`}.pdf`;
      return savePdfSong(new File([bytes], name, { type: 'application/pdf' }), metadata, { book: file.name, page: s.firstPage });
    });
  }

  // Save what the review list picked, saying how far it has got for a big book,
  // then say what happened — in the dialog, with a way to go and see them.
  async function saveImported(fileName, listed, choice, saveOne, batch = false) {
    const ids = [];
    let shown = 0;
    for (const i of choice.picked) {
      if (choice.picked.length > 50 && performance.now() - shown > 150) {
        shown = performance.now();
        setSongbook({ fileName, batch, reading: { done: ids.length, total: choice.picked.length, saving: true } });
      }
      ids.push(await saveOne(listed[i], choice.titles?.[i] || listed[i].title));
    }
    const setId = choice.setName && ids.length ? (await saveSet({ id: null, name: choice.setName, songIds: ids })).id : null;
    const next = await new Promise(resolve => setSongbook({
      fileName,
      batch,
      outcome: { added: ids.length, setName: setId ? choice.setName : null, leftOut: listed.length - ids.length },
      resolve,
    }));
    setSongbook(null);
    return { done: true, show: next === 'show' ? { setId } : null };
  }

  // Several PDFs picked at once. Each one that is a single song — a club's
  // sheets, kept one file a song — goes into ONE report and one list, read off
  // its first page; each one that is a book gets its own report after.
  async function importPdfBatch(files) {
    const abort = new AbortController();
    const label = `${files.length} PDFs`;
    const sheets = [], books = [];
    try {
      const [{ extractSongbookPages }, { sheetInfo }] = await Promise.all([import('./utils/pdfjs.js'), import('./utils/bookReport.js')]);
      const [{ extractSheetPages }, { sheetChart }] = await Promise.all([import('./utils/pdfjs.js'), import('./utils/bookReport.js')]);
      for (const [i, file] of files.entries()) {
        setSongbook({ fileName: label, batch: true, reading: { done: i, total: files.length }, abort: () => abort.abort() });
        const read = await extractSongbookPages(file, { signal: abort.signal });
        const info = sheetInfo(read.pages, read.marks, file.name);
        if (!info) { books.push({ file, read }); continue; }
        // Read again for a chart: with chords drawn above the lyrics put into
        // them, which the book reader doesn't do. The row then shows the chart.
        let chart = null;
        try { chart = sheetChart(await extractSheetPages(file), file.name); } catch { /* a page, then */ }
        sheets.push(chart ? { ...info, artist: info.artist || chart.artist, text: chart.text, chart, file } : { ...info, file });
      }
    } catch (e) {
      setSongbook(null);
      if (e?.code === 'aborted') return null;
      throw e;
    }
    setSongbook(null);

    let show = null;
    if (sheets.length === 1) await importSheet(sheets[0].file);
    else if (sheets.length > 1) {
      const { sheetsReport } = await import('./utils/bookReport.js');
      const have = new Set((await loadSongs()).map(s => normalizeTitle(s.metadata?.title)));
      const marked = sheets.map(s => ({ ...s, inLibrary: have.has(normalizeTitle(s.title)) }));
      const report = { ...sheetsReport(marked), songs: marked };
      const choice = await new Promise(resolve => setSongbook({ fileName: label, batch: true, report, songs: marked, resolve }));
      setSongbook(null);
      if (choice !== 'cancel') {
        const r = await saveImported(label, marked, choice, (s, title) => {
          const metadata = { title };
          if (s.artist) metadata.artist = s.artist;
          if (s.key) metadata.key = s.key;
          if (s.chart && choice.asCharts !== false) {
            if (s.chart.youtubeUrl) metadata.youtubeUrl = s.chart.youtubeUrl;
            return saveSong({ id: null, metadata, text: s.chart.text, chordStyle: 'brackets', previewMode: 'brackets' });
          }
          return savePdfSong(s.file, metadata);
        }, true);
        show = r.show;
      }
    }
    for (const { file, read } of books) {
      const r = await askSongbook(file, read);
      if (r === 'page') await savePdfSong(file);
      else if (r?.show) show = r.show;
    }
    return { show };
  }

  // A PDF that is one song, not a book. When every page of it reads as a chart
  // — chords in the lyrics, or drawn above them as chord websites print them —
  // ask whether it comes in as text or as the page, as the editor's Load PDF
  // does. Returns { metadata, text } to save as text, { metadata, pdf } to keep
  // as the PDF, 'page' when there was nothing to ask, or 'cancel'. A song
  // printed more than once — Doctor Uke's, with chord diagrams and then chord
  // names (sheetChart) — goes to the page picker instead, its copies split, to
  // choose between: { pick: pages }.
  async function askSheetChart(file) {
    let chart = null, pages = null;
    try {
      const [{ extractSheetPages }, { sheetChart }] = await Promise.all([import('./utils/pdfjs.js'), import('./utils/bookReport.js')]);
      pages = await extractSheetPages(file);
      chart = sheetChart(pages, file.name);
    } catch { /* an unreadable text layer — it is a page, then */ }
    if (!chart) return 'page';
    if (chart.copies) return { pick: pages };
    const choice = await new Promise(resolve => setSheetOffer({ fileName: file.name, chart, resolve }));
    setSheetOffer(null);
    if (choice === 'cancel') return choice;
    const metadata = { title: chart.title };
    if (chart.artist) metadata.artist = chart.artist;
    if (chart.key) metadata.key = chart.key;
    if (chart.youtubeUrl) metadata.youtubeUrl = chart.youtubeUrl;
    // Kept as the PDF, it still has the title read off the page.
    if (choice !== 'text') return { metadata, pdf: true };
    return { metadata, text: chart.text };
  }

  // One PDF that is one song: as text when it reads as a chart and you say so
  // (askSheetChart), otherwise as the page; printed more than once, the copies
  // you pick in the page picker. Returns the song saved as text, to open,
  // { show } when the picker's "Show them" was pressed, or null.
  async function importSheet(file) {
    const sheet = await askSheetChart(file);
    if (sheet === 'cancel') return null;
    if (sheet === 'page') { await savePdfSong(file); return null; }
    if (sheet.pick) {
      const { sheetPickerStart } = await import('./utils/bookReport.js');
      const start = sheetPickerStart(sheet.pick, file.name);
      const picked = await new Promise(resolve => setSongbook({ fileName: file.name, picker: { file, start, noBack: true }, resolve }));
      setSongbook(null);
      if (picked === 'cancel' || picked === 'back') return null;
      const r = await saveCutSongs(file, picked, sheet.pick);
      return r?.show ? { show: r.show } : null;
    }
    if (sheet.pdf) { await savePdfSong(file, sheet.metadata); return null; }
    const existing = songs.find(s => normalizeTitle(s.metadata?.title) === normalizeTitle(sheet.metadata.title));
    let importId = null;
    if (existing) {
      const choice = await askConflict(sheet.metadata.title);
      if (choice === 'cancel') return null;
      if (choice === 'overwrite') importId = existing.id;
    }
    const id = await saveSong({ id: importId, ...sheet, chordStyle: 'brackets', previewMode: 'brackets' });
    return { id, ...sheet };
  }

  // A PDF as one page song, as Cue has always imported a PDF: the bytes stored
  // locally, titled with the file name unless the caller read a better one.
  async function savePdfSong(file, metadata = { title: file.name.replace(/\.pdf$/i, '') || 'Lead Sheet' }, source = undefined) {
    const id = await saveSong({
      id: null,
      metadata,
      text: '',
      type: 'pdf',
      pedalActive: true,
      pdf: { filename: file.name, importedAt: new Date().toISOString() },
      source,
    });
    await savePdfBlob(id, file);
    return id;
  }

  function askBackupMode() {
    return new Promise(resolve => setBackupDialog({ resolve }));
  }

  // Shared duplicate-handling prompt for any bulk import. `title` names what is
  // being imported (sets vs. songs); the question itself is the same either way.
  function askSetsImportMode(title = 'Import sets') {
    return new Promise(resolve => setSetsImportDialog({ resolve, title }));
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    // No accept filter — iOS doesn't recognise .cho/.chopro MIME types and
    // grays them out even when listed. Removing the filter lets the Files app
    // show all files; the import handler validates content after loading.
    //
    // The input MUST be attached to the DOM before .click(): a detached input
    // can be garbage-collected before its change event fires on iOS Safari, so
    // the import silently no-ops the first time and only "takes" on a retry.
    input.style.display = 'none';
    document.body.appendChild(input);
    input.oncancel = () => input.remove();
    input.onchange = async () => {
      input.remove();
      const files = Array.from(input.files || []);
      if (!files.length) return;

      let lastImportedSong = null;

      // The song fields a BUNDLE (.json song/set file) carries. Deliberately not
      // a blind spread: id, createdAt/updatedAt and copiedFrom are re-derived
      // here, because someone else's file must not backdate a song in your
      // library or forge a link to a shared original. Everything that describes
      // the song itself does travel — including `type`/`pdf`, whose absence used
      // to turn an imported PDF song into an empty text song.
      const bundleSongFields = (s) => ({
        metadata: s.metadata, text: s.text,
        chordStyle: s.chordStyle, previewMode: s.previewMode, diagramScale: s.diagramScale,
        chordPrefs: s.chordPrefs, displayKey: s.displayKey,
        type: s.type, pdf: s.pdf, pedalActive: s.pedalActive,
        fullPage: s.fullPage, embed: s.embed, condensed: s.condensed,
      });

      // Restore a bundle's embedded PDF bytes (version 2+ song/set .json files
      // carry them as base64 under `pdfs`, keyed by the id INSIDE the file).
      // `idMap` maps that id to the id the song was actually saved as here, and
      // only holds songs this import created or deliberately overwrote — a song
      // skipped as a duplicate must keep the bytes it already has.
      const restoreBundlePdfs = async (pdfs, idMap) => {
        if (!pdfs) return;
        for (const [oldId, b64] of Object.entries(pdfs)) {
          const target = idMap[oldId];
          if (target) await restorePdfBackup(target, b64);
        }
      };

      // Where to take you afterwards, when a songbook's "Show them" was pressed.
      let showAfter = null;
      const isPdf = (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      const pdfFiles = files.filter(isPdf);
      if (pdfFiles.length > 1) showAfter = (await importPdfBatch(pdfFiles))?.show || null;

      for (const file of files) {
        // PDF lead sheet → a 'pdf' song with the raw bytes stored locally (Stage
        // 1a: local-only, nothing uploads it). Branch BEFORE reading as text.
        if (isPdf(file)) {
          if (pdfFiles.length > 1) continue;      // the batch above took them
          const book = await askSongbook(file);
          if (book?.show) showAfter = book.show;
          if (book !== 'page') continue;
          const sheet = await importSheet(file);
          if (sheet?.show) showAfter = sheet.show;
          else if (sheet) lastImportedSong = sheet;
          continue;
        }

        const content = await file.text();

        if (file.name.toLowerCase().endsWith('.json')) {
          let data;
          try { data = JSON.parse(content); } catch { alert(`Invalid JSON: ${file.name}`); continue; }

          if (data.type === 'cue-setlist' && data.setlist) data = { ...data, type: 'cue-set', set: data.setlist };

          if (data.type === 'cue-song' && data.song) {
            const incomingTitle = data.song.metadata?.title;
            const existing = songs.find(s => normalizeTitle(s.metadata?.title) === normalizeTitle(incomingTitle));
            let importId = null;
            if (existing) {
              const choice = await askConflict(incomingTitle || 'Untitled');
              if (choice === 'cancel') continue;
              if (choice === 'overwrite') importId = existing.id;
            }
            const id = await saveSong({ ...bundleSongFields(data.song), id: importId });
            await restoreBundlePdfs(data.pdfs, { [data.song.id]: id });
            lastImportedSong = { ...data.song, id };

          } else if (data.type === 'cue-set' && data.set && data.songs) {
            // THE ONE IMPORT PATH WITH NO DUPLICATE HANDLING AT ALL. It made a
            // second copy of every song already in the library, without asking and
            // without saying so afterwards — import a set of songs you already
            // have and you silently doubled them.
            //
            // The old comment here ("remap IDs — skip per-song conflict prompts")
            // was right that a per-SONG prompt is wrong for a set, which can hold
            // dozens. The answer is the batch prompt the multi-set and songs-only
            // bundles already use, not no prompt.
            const mode = await askSetsImportMode('Import set');
            if (mode === 'cancel') continue;
            const existingByTitle = new Map(songs.map(s => [normalizeTitle(s.metadata?.title), s]));
            const idMap  = {};
            const pdfMap = {};   // created songs only — a reused song keeps its own PDF
            let added = 0, reused = 0;
            for (const s of data.songs) {
              const existing = existingByTitle.get(normalizeTitle(s.metadata?.title));
              if (mode === 'skip' && existing) {
                // The SET points at your copy, so skipping leaves no holes in it.
                idMap[s.id] = existing.id;
                reused++;
              } else {
                const newId = await saveSong({ ...bundleSongFields(s), id: null });
                idMap[s.id] = newId;
                pdfMap[s.id] = newId;
                added++;
              }
            }
            await restoreBundlePdfs(data.pdfs, pdfMap);
            await saveSet({
              id: null,
              name: data.set.name,
              songIds: data.set.songIds.map(id => idMap[id]).filter(Boolean),
              sortMode: data.set.sortMode || 'custom',
            });
            // Tagged block when the file has one (every instrument's shapes and
            // hidden built-ins); the flat ukulele-only array otherwise, which is
            // what every file written before this carries.
            if (!restoreChordLibraries(data) && Array.isArray(data.customChords) && data.customChords.length > 0) {
              mergeCustomChords(data.customChords);
            }
            alert(`Set imported: “${data.set.name}”.\n${added} song${added === 1 ? '' : 's'} added${reused ? `, ${reused} already in your library and reused` : ''}`);

          } else if (data.type === 'cue-songs' && Array.isArray(data.songs)) {
            // Songs-only bundle, written by the Library panel's Export button.
            // Same duplicate prompt as a multi-set import — a bundle can hold
            // dozens of songs, so one decision covers the batch rather than
            // prompting per song.
            const mode = await askSetsImportMode('Import songs');
            if (mode === 'cancel') continue;
            const existingByTitle = new Map(songs.map(s => [normalizeTitle(s.metadata?.title), s]));
            let added = 0, skipped = 0;
            const idMap = {};
            for (const s of data.songs) {
              if (mode === 'skip' && existingByTitle.has(normalizeTitle(s.metadata?.title))) { skipped++; continue; }
              idMap[s.id] = await saveSong({ ...bundleSongFields(s), id: null });
              added++;
            }
            await restoreBundlePdfs(data.pdfs, idMap);
            // Tagged block when the file has one (every instrument's shapes and
            // hidden built-ins); the flat ukulele-only array otherwise, which is
            // what every file written before this carries.
            if (!restoreChordLibraries(data) && Array.isArray(data.customChords) && data.customChords.length > 0) {
              mergeCustomChords(data.customChords);
            }
            alert(`Songs imported.\n${added} added${skipped ? `, ${skipped} skipped (already in library)` : ''}`);

          } else if (data.type === 'cue-sets' && data.sets && data.songs) {
            const mode = await askSetsImportMode();
            if (mode === 'cancel') continue;
            // Build a lookup of existing songs by normalized title for duplicate detection
            const existingByTitle = new Map(songs.map(s => [normalizeTitle(s.metadata?.title), s]));
            const idMap = {};
            const pdfMap = {}; // only songs this import created — a skipped duplicate keeps its own PDF
            let added = 0, reused = 0;
            for (const s of data.songs) {
              const existing = existingByTitle.get(normalizeTitle(s.metadata?.title));
              if (mode === 'skip' && existing) {
                idMap[s.id] = existing.id;
                reused++;
              } else {
                const newId = await saveSong({ ...bundleSongFields(s), id: null });
                idMap[s.id] = newId;
                pdfMap[s.id] = newId;
                added++;
              }
            }
            await restoreBundlePdfs(data.pdfs, pdfMap);
            for (const set of data.sets) {
              await saveSet({
                id: null,
                name: set.name,
                songIds: set.songIds.map(id => idMap[id]).filter(Boolean),
                sortMode: set.sortMode || 'custom',
              });
            }
            // Tagged block when the file has one (every instrument's shapes and
            // hidden built-ins); the flat ukulele-only array otherwise, which is
            // what every file written before this carries.
            if (!restoreChordLibraries(data) && Array.isArray(data.customChords) && data.customChords.length > 0) {
              mergeCustomChords(data.customChords);
            }
            // This path asked what to do and then never said what it did.
            alert(`Sets imported.\n${data.sets.length} set${data.sets.length === 1 ? '' : 's'}, ${added} song${added === 1 ? '' : 's'} added${reused ? `, ${reused} already in your library and reused` : ''}`);

          } else if (data.type === 'cue-backup' && data.songs && data.sets) {
            const mode = await askBackupMode();
            if (mode === 'cancel') continue;

            if (mode === 'replace') {
              await clearLibrary();
              // Preserve original UUIDs and timestamps from the backup.
              // Build an idMap for the rare case of old files where a song has no id.
              const idMap = {};
              for (const s of data.songs) {
                // Spread the whole song so type / pdf / fullPage / pedalActive
                // survive the round-trip (a subset copy silently degraded PDFs).
                const savedId = await saveSong({ ...s, id: s.id || null });
                if (s.id) idMap[s.id] = savedId;
              }
              // Restore PDF bytes (base64 in the backup) under the saved ids.
              if (data.pdfs) for (const [oldId, b64] of Object.entries(data.pdfs)) await restorePdfBackup(idMap[oldId] ?? oldId, b64);
              for (const set of data.sets) {
                const resolvedSongIds = set.songIds.map(id => idMap[id] ?? id).filter(Boolean);
                await saveSet({ id: set.id || null, name: set.name, songIds: resolvedSongIds, sortMode: set.sortMode || 'custom', createdAt: set.createdAt, updatedAt: set.updatedAt, preserveTimestamps: true });
              }
            } else {
              // Merge: keep whichever version of each song/set has the newer updatedAt.
              const [existingSongs, existingSets] = await Promise.all([loadSongs(), loadSets()]);
              const songById = new Map(existingSongs.map(s => [s.id, s]));
              const setById  = new Map(existingSets.map(s => [s.id, s]));

              let songsAdded = 0, songsUpdated = 0, songsSkipped = 0;
              const idMap = {};

              for (const s of data.songs) {
                if (!s.id) {
                  // Old file without UUID — always add as new
                  const newId = await saveSong({ ...s, id: null });
                  idMap[s.id] = newId;
                  songsAdded++;
                  continue;
                }
                const existing = songById.get(s.id);
                if (!existing) {
                  await saveSong({ ...s });
                  idMap[s.id] = s.id;
                  songsAdded++;
                } else {
                  const existingMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : (existing.savedAt || 0);
                  const incomingMs = s.updatedAt       ? new Date(s.updatedAt).getTime()        : (s.savedAt || 0);
                  if (incomingMs > existingMs) {
                    await saveSong({ ...s });
                    songsUpdated++;
                  } else {
                    songsSkipped++;
                  }
                  idMap[s.id] = s.id;
                }
              }
              // Restore PDF bytes for the songs that came in (base64 in the backup).
              if (data.pdfs) for (const [oldId, b64] of Object.entries(data.pdfs)) await restorePdfBackup(idMap[oldId] ?? oldId, b64);

              let setsAdded = 0, setsUpdated = 0, setsSkipped = 0;

              for (const set of data.sets) {
                const resolvedSongIds = set.songIds.map(id => idMap[id] ?? id).filter(Boolean);
                if (!set.id) {
                  await saveSet({ id: null, name: set.name, songIds: resolvedSongIds, sortMode: set.sortMode || 'custom', createdAt: set.createdAt, updatedAt: set.updatedAt, preserveTimestamps: true });
                  setsAdded++;
                  continue;
                }
                const existing = setById.get(set.id);
                if (!existing) {
                  await saveSet({ id: set.id, name: set.name, songIds: resolvedSongIds, sortMode: set.sortMode || 'custom', createdAt: set.createdAt, updatedAt: set.updatedAt, preserveTimestamps: true });
                  setsAdded++;
                } else {
                  const existingMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : (existing.savedAt || 0);
                  const incomingMs = set.updatedAt      ? new Date(set.updatedAt).getTime()       : (set.savedAt || 0);
                  if (incomingMs > existingMs) {
                    await saveSet({ id: set.id, name: set.name, songIds: resolvedSongIds, sortMode: set.sortMode || 'custom', createdAt: set.createdAt, updatedAt: set.updatedAt, preserveTimestamps: true });
                    setsUpdated++;
                  } else {
                    setsSkipped++;
                  }
                }
              }

              const parts = [];
              if (data.songs.length)  parts.push(`Songs: ${songsAdded} added, ${songsUpdated} updated, ${songsSkipped} unchanged`);
              if (data.sets.length)   parts.push(`Sets: ${setsAdded} added, ${setsUpdated} updated, ${setsSkipped} unchanged`);
              alert(`Backup merged.\n${parts.join('\n')}`);
            }

            const chordsRestored = restoreChordLibraries(data, mode === 'replace' ? 'replace' : 'merge');
            if (!chordsRestored && Array.isArray(data.customChords) && data.customChords.length > 0) {
              if (mode === 'replace') replaceCustomChords(data.customChords);
              else mergeCustomChords(data.customChords);
            }
            // Say so when shapes arrived for an instrument other than ukulele.
            // Those used to travel nowhere at all, so their arrival is the one
            // part of this a restore has never been able to report. Ukulele stays
            // silent, as it always was.
            if (chordsRestored) {
              const note = Object.entries(chordsRestored.customs)
                .filter(([inst, n]) => inst !== 'ukulele_gcea' && n > 0)
                .map(([inst, n]) => `${CHORD_LIBRARIES[inst]?.name || inst}: ${n} chord shape${n === 1 ? '' : 's'}`);
              if (note.length) alert(`Chord shapes restored.\n${note.join('\n')}`);
            }

          } else {
            alert(`Unrecognised Cue file: ${file.name}`);
          }

        } else if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
          alert(`"${file.name}" is an HTML file. Cue no longer imports sets from HTML. Import songs as .cho / .txt or a Cue .json bundle instead.`);
          continue;

        } else {
          // ChordPro text file (.cho, .chopro, .txt, etc.)
          const { metadata, text } = parseCho(content);
          const existing = songs.find(s => normalizeTitle(s.metadata?.title) === normalizeTitle(metadata?.title));
          let importId = null;
          if (existing) {
            const choice = await askConflict(metadata?.title || 'Untitled');
            if (choice === 'cancel') continue;
            if (choice === 'overwrite') importId = existing.id;
          }
          const id = await saveSong({ id: importId, metadata, text });
          lastImportedSong = { id, metadata, text };
        }
      }

      await refresh();

      // "Show them": the Library opens the new set, or lists newest first.
      if (showAfter) window.dispatchEvent(new CustomEvent('cue:show-imported', { detail: showAfter }));

      if (files.length === 1 && lastImportedSong) {
        setActiveSong(lastImportedSong);
        setView('editor');
      }
    };
    input.click();
  }

  function handleEditFromSetlist(song, idx, allSongs) {
    setSetlistContext({ songs: allSongs, idx });
    setLibraryContext(null);
    setEditorKey(k => k + 1);
    setActiveSong(song);
    setView('editor');
  }

  function handleSetlistNavigate(newIdx) {
    if (!setlistContext) return;
    const newSong = setlistContext.songs[newIdx];
    if (!newSong) return;
    setSetlistContext(c => ({ ...c, idx: newIdx }));
    // If editing mid-performance, keep "Return to Performance" on the song now
    // being edited (no-op for a plain setlist edit, where there's nothing to return to).
    setReturnToPresenting(r => (r ? { ...r, startIndex: newIdx } : r));
    setEditorKey(k => k + 1);
    setActiveSong(newSong);
    sessionStorage.setItem('cue:setlist_selected_id', newSong.id);
  }

  function handleOpenFromLibrary(song, idx, sortedSongs) {
    setLibraryContext({ songs: sortedSongs, idx });
    setSetlistContext(null);
    setEditorKey(k => k + 1);
    setActiveSong(song);
    sessionStorage.removeItem('cue:lib_highlighted_id');
    setView('editor');
  }

  function handleLibraryNavigate(newIdx) {
    if (!libraryContext) return;
    const newSong = libraryContext.songs[newIdx];
    if (!newSong) return;
    setLibraryContext(c => ({ ...c, idx: newIdx }));
    setEditorKey(k => k + 1);
    setActiveSong(newSong);
  }

  function handleEditFromPresentation(currentSong, currentIndex) {
    setReturnToPresenting({ songs: presenting.songs, startIndex: currentIndex });
    // Give the editor the presented set so its Prev/Next buttons navigate it —
    // lets you edit the other songs in the set without leaving the editor.
    setSetlistContext({ songs: presenting.songs, idx: currentIndex });
    setLibraryContext(null);
    setPresenting(null);
    // Remount the editor, exactly as every other route into it does. EditorView
    // reads `song` only in its useState initialisers, so a still-mounted editor
    // keeps whatever song it first opened with: Present -> Edit -> back -> skip
    // ahead in the set -> Edit landed you on the earlier song, silently, with
    // that song's text ready to be saved over.
    setEditorKey(k => k + 1);
    setActiveSong(currentSong);
    setEditorAnnotStamp(s => s + 1); // re-check annotations for the newly opened song
    setView('editor');
  }

  // Present mode's Save-speed control bakes the chosen scroll pace into the
  // song's stored duration. Update the in-memory presented copy immediately (so
  // the new base rate takes effect without a jump), then persist by merging into
  // the stored record — loading the full record first so no other field is lost,
  // since saveSong replaces the whole entry.
  async function handleSavePresentDuration(songId, duration) {
    setPresenting(p => p && {
      ...p,
      songs: p.songs.map(s =>
        s.id === songId ? { ...s, metadata: { ...s.metadata, duration } } : s
      ),
    });
    const stored = (await loadSongs()).find(s => s.id === songId);
    if (stored) {
      await saveSong({ ...stored, metadata: { ...stored.metadata, duration } });
    }
  }

  // Persist a live per-song Full Page change from Present's Tools, and reflect it
  // in the presenting set so the current view switches scroll/page immediately.
  async function handleSetFullPage(songId, fullPage) {
    setPresenting(p => p && {
      ...p,
      songs: p.songs.map(s => (s.id === songId ? { ...s, fullPage } : s)),
    });
    const stored = (await loadSongs()).find(s => s.id === songId);
    if (stored) await saveSong({ ...stored, fullPage });
  }

  function handleReturnToPresentation(updatedSong) {
    if (!returnToPresenting) return;
    const updatedSongs = returnToPresenting.songs.map(s =>
      s.id === updatedSong.id ? updatedSong : s
    );
    setPresenting({ songs: updatedSongs, startIndex: returnToPresenting.startIndex });
    setReturnToPresenting(null);
  }

  async function handleDeleteSong(id) {
    await deleteSong(id);
    await removeSongFromAllSets(id);
    refresh();
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-950">
        <p className="text-sm text-gray-500">Loading your library…</p>
      </div>
    );
  }

  return (
    <>
      {view === 'library' && (
        <LibraryView
          songs={songs}
          sets={sets}
          onNewSong={() => { setActiveSong(null); setSetlistContext(null); setLibraryContext(null); setView('editor'); }}
          onOpenSong={song => { setActiveSong(song); setSetlistContext(null); setLibraryContext(null); setView('editor'); }}
          onOpenSongFromList={handleOpenFromLibrary}
          onImport={handleImport}
          onRefresh={refresh}
          onDeleteSong={handleDeleteSong}
          onPresent={(presentSongs, idx = 0) => { if (presentSongs?.length) { setPresentEntryView('library'); setPresenting({ songs: presentSongs, startIndex: idx }); } }}
          onEditSong={handleEditFromSetlist}
          presenting={!!presenting}
        />
      )}
      {view === 'editor' && (
        <EditorView
          key={editorKey}
          song={activeSong}
          editorApi={editorApiRef}
          annotationStamp={editorAnnotStamp}
          onBack={() => { refresh(); setReturnToPresenting(null); setSetlistContext(null); setLibraryContext(null); setView('library'); }}
          onSaved={savedSong => {
            clearDraft();
            const id = savedSong?.id ?? savedSong;
            setActiveSong(s => ({ ...s, id }));
            refresh();
            if (savedSong && typeof savedSong === 'object') {
              setSetlistContext(c => c ? { ...c, songs: c.songs.map(s => s.id === id ? savedSong : s) } : c);
              setLibraryContext(c => c ? { ...c, songs: c.songs.map(s => s.id === id ? savedSong : s) } : c);
            }
          }}
          onPresent={(presentSongs, idx = 0) => { if (presentSongs?.length) { setPresentEntryView('editor'); setPresenting({ songs: presentSongs, startIndex: idx }); } }}
          onReturn={returnToPresenting ? handleReturnToPresentation : undefined}
          setlistSongs={setlistContext?.songs ?? libraryContext?.songs}
          setlistIdx={setlistContext?.idx ?? libraryContext?.idx}
          onSetlistNavigate={setlistContext ? handleSetlistNavigate : libraryContext ? handleLibraryNavigate : undefined}
        />
      )}
      {presenting && (
        <PresentationView
          songs={presenting.songs}
          startIndex={presenting.startIndex}
          onExit={() => {
            setPresenting(null);
            setReturnToPresenting(null);
            const dest = presentEntryView || 'library';
            setPresentEntryView(null);
            if (dest === 'library') refresh();
            if (dest === 'editor') setEditorAnnotStamp(s => s + 1);
            setView(dest);
          }}
          onEdit={handleEditFromPresentation}
          onSaveDuration={handleSavePresentDuration}
          onSetFullPage={handleSetFullPage}
          onNavigate={song => sessionStorage.setItem('cue:setlist_selected_id', song.id)}
        />
      )}

      {/* Floating "Update Cue" — only when a new worker is waiting and we're not
          presenting, so it never appears over the performance surface. */}
      {updateAvailable && !dismissed && !presenting && (
        <UpdateButton
          onApply={applyUpdate}
          onDismiss={dismissUpdate}
          getDirty={() => !!editorApiRef.current?.isDirty}
          onSave={() => editorApiRef.current?.save?.()}
        />
      )}

      {/* Backup restore dialog */}
      {backupDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <div className="flex flex-col gap-1">
              <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Restore backup</h2>
              <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>How would you like to import this backup?</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { backupDialog.resolve('replace'); setBackupDialog(null); }}
                className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                Replace library
              </button>
              <p className={`text-xs text-center -mt-1 mb-1 ${dark ? 'text-gray-600' : 'text-gray-400'}`}>Clears all current songs &amp; sets, then loads the backup</p>
              <button
                onClick={() => { backupDialog.resolve('merge'); setBackupDialog(null); }}
                className={`w-full py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                Merge into library
              </button>
              <p className={`text-xs text-center -mt-1 mb-1 ${dark ? 'text-gray-600' : 'text-gray-400'}`}>Adds backup songs &amp; sets alongside what you already have</p>
              <button
                onClick={() => { backupDialog.resolve('cancel'); setBackupDialog(null); }}
                className={`text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-set import dialog */}
      {setsImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <div className="flex flex-col gap-1">
              <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{setsImportDialog.title ?? 'Import sets'}</h2>
              <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>What should happen if a song in this file already exists in your library?</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setsImportDialog.resolve('skip'); setSetsImportDialog(null); }}
                className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                Skip duplicates
              </button>
              <p className={`text-xs text-center -mt-1 mb-1 ${dark ? 'text-gray-600' : 'text-gray-400'}`}>Songs already in your library are reused; no duplicates created</p>
              <button
                onClick={() => { setsImportDialog.resolve('allow'); setSetsImportDialog(null); }}
                className={`w-full py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                Allow duplicates
              </button>
              <p className={`text-xs text-center -mt-1 mb-1 ${dark ? 'text-gray-600' : 'text-gray-400'}`}>All songs imported as new entries alongside existing ones</p>
              <button
                onClick={() => { setsImportDialog.resolve('cancel'); setSetsImportDialog(null); }}
                className={`text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import conflict dialog */}
      {songbook?.picker && (
        <PagePicker
          dark={dark}
          fileName={songbook.fileName}
          file={songbook.picker.file}
          start={songbook.picker.start}
          onAccept={(songs, setName) => songbook.resolve({ songs, setName })}
          onBack={songbook.picker.noBack ? null : () => songbook.resolve('back')}
          onCancel={() => songbook.resolve('cancel')}
        />
      )}
      {sheetOffer && (
        <SheetChartDialog
          dark={dark}
          fileName={sheetOffer.fileName}
          chart={sheetOffer.chart}
          onText={() => sheetOffer.resolve('text')}
          onPage={() => sheetOffer.resolve('page')}
          onCancel={() => sheetOffer.resolve('cancel')}
        />
      )}
      {songbook && !songbook.picker && (
        <SongbookDialog
          key={`${songbook.fileName}:${songbook.outcome ? 'done' : songbook.report ? 'report' : 'reading'}`}
          dark={dark}
          batch={!!songbook.batch}
          fileName={songbook.fileName}
          reading={songbook.reading}
          report={songbook.report}
          songs={songbook.songs}
          outcome={songbook.outcome}
          onImport={(picked, setName, titles, asCharts) => songbook.resolve({ picked, setName, titles, asCharts })}
          onKeepAsPage={songbook.book ? () => songbook.resolve('page') : null}
          onPick={songbook.book ? () => songbook.resolve('pick') : null}
          onCancel={songbook.resolve ? () => songbook.resolve('cancel') : songbook.abort}
          onShow={() => songbook.resolve('show')}
          onDone={() => songbook.resolve('done')}
        />
      )}
      {conflictDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <div className="flex flex-col gap-1">
              <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Song already exists</h2>
              <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>"{conflictDialog.title}"</span> is already in your library.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { conflictDialog.resolve('overwrite'); setConflictDialog(null); }}
                className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                Overwrite existing
              </button>
              <button
                onClick={() => { conflictDialog.resolve('duplicate'); setConflictDialog(null); }}
                className={`w-full py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                Import as duplicate
              </button>
              <button
                onClick={() => { conflictDialog.resolve('cancel'); setConflictDialog(null); }}
                className={`text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Skip this file
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
