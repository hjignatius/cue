import { useEffect, useState } from 'react';
import LibraryView from './views/LibraryView.jsx';
import EditorView from './views/EditorView.jsx';
import PresentationView from './views/PresentationView.jsx';
import { loadSongs, loadSets, saveSong, saveSet, deleteSong, removeSongFromAllSets, clearDraft, clearLibrary } from './utils/storage.js';
import { parseCho, mergeCustomChords, replaceCustomChords } from './utils/fileIO.js';
import { usePrefs } from './context/PrefsContext.jsx';
import './index.css';

// Case/punctuation-insensitive title comparison for conflict detection
function normalizeTitle(str) {
  return (str || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

export default function App() {
  const { theme } = usePrefs();
  const dark = theme === 'dark';

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

  function askBackupMode() {
    return new Promise(resolve => setBackupDialog({ resolve }));
  }

  function askSetsImportMode() {
    return new Promise(resolve => setSetsImportDialog({ resolve }));
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    // No accept filter — iOS doesn't recognise .cho/.chopro MIME types and
    // grays them out even when listed. Removing the filter lets the Files app
    // show all files; the import handler validates content after loading.
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;

      let lastImportedSong = null;

      for (const file of files) {
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
            const id = await saveSong({ id: importId, metadata: data.song.metadata, text: data.song.text });
            lastImportedSong = { ...data.song, id };

          } else if (data.type === 'cue-set' && data.set && data.songs) {
            // Set imports remap IDs — skip per-song conflict prompts
            const idMap = {};
            for (const s of data.songs) {
              const newId = await saveSong({ id: null, metadata: s.metadata, text: s.text, chordStyle: s.chordStyle, diagramScale: s.diagramScale, chordPrefs: s.chordPrefs, displayKey: s.displayKey });
              idMap[s.id] = newId;
            }
            await saveSet({
              id: null,
              name: data.set.name,
              songIds: data.set.songIds.map(id => idMap[id]).filter(Boolean),
              sortMode: data.set.sortMode || 'custom',
            });
            if (Array.isArray(data.customChords) && data.customChords.length > 0) {
              mergeCustomChords(data.customChords);
            }

          } else if (data.type === 'cue-sets' && data.sets && data.songs) {
            const mode = await askSetsImportMode();
            if (mode === 'cancel') continue;
            // Build a lookup of existing songs by normalized title for duplicate detection
            const existingByTitle = new Map(songs.map(s => [normalizeTitle(s.metadata?.title), s]));
            const idMap = {};
            for (const s of data.songs) {
              const existing = existingByTitle.get(normalizeTitle(s.metadata?.title));
              if (mode === 'skip' && existing) {
                idMap[s.id] = existing.id;
              } else {
                const newId = await saveSong({ id: null, metadata: s.metadata, text: s.text, chordStyle: s.chordStyle, diagramScale: s.diagramScale, chordPrefs: s.chordPrefs, displayKey: s.displayKey });
                idMap[s.id] = newId;
              }
            }
            for (const set of data.sets) {
              await saveSet({
                id: null,
                name: set.name,
                songIds: set.songIds.map(id => idMap[id]).filter(Boolean),
                sortMode: set.sortMode || 'custom',
              });
            }
            if (Array.isArray(data.customChords) && data.customChords.length > 0) {
              mergeCustomChords(data.customChords);
            }

          } else if (data.type === 'cue-backup' && data.songs && data.sets) {
            const mode = await askBackupMode();
            if (mode === 'cancel') continue;

            if (mode === 'replace') {
              await clearLibrary();
              // Preserve original UUIDs and timestamps from the backup.
              // Build an idMap for the rare case of old files where a song has no id.
              const idMap = {};
              for (const s of data.songs) {
                const savedId = await saveSong({ id: s.id || null, metadata: s.metadata, text: s.text, chordStyle: s.chordStyle, diagramScale: s.diagramScale, chordPrefs: s.chordPrefs, displayKey: s.displayKey, createdAt: s.createdAt, updatedAt: s.updatedAt });
                if (s.id) idMap[s.id] = savedId;
              }
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
                  const newId = await saveSong({ id: null, metadata: s.metadata, text: s.text, chordStyle: s.chordStyle, diagramScale: s.diagramScale, chordPrefs: s.chordPrefs, displayKey: s.displayKey, createdAt: s.createdAt, updatedAt: s.updatedAt });
                  idMap[s.id] = newId;
                  songsAdded++;
                  continue;
                }
                const existing = songById.get(s.id);
                if (!existing) {
                  await saveSong({ id: s.id, metadata: s.metadata, text: s.text, chordStyle: s.chordStyle, diagramScale: s.diagramScale, chordPrefs: s.chordPrefs, displayKey: s.displayKey, createdAt: s.createdAt, updatedAt: s.updatedAt });
                  idMap[s.id] = s.id;
                  songsAdded++;
                } else {
                  const existingMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : (existing.savedAt || 0);
                  const incomingMs = s.updatedAt       ? new Date(s.updatedAt).getTime()        : (s.savedAt || 0);
                  if (incomingMs > existingMs) {
                    await saveSong({ id: s.id, metadata: s.metadata, text: s.text, chordStyle: s.chordStyle, diagramScale: s.diagramScale, chordPrefs: s.chordPrefs, displayKey: s.displayKey, createdAt: s.createdAt, updatedAt: s.updatedAt });
                    songsUpdated++;
                  } else {
                    songsSkipped++;
                  }
                  idMap[s.id] = s.id;
                }
              }

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

            if (Array.isArray(data.customChords) && data.customChords.length > 0) {
              if (mode === 'replace') replaceCustomChords(data.customChords);
              else mergeCustomChords(data.customChords);
            }

          } else {
            alert(`Unrecognised Cue file: ${file.name}`);
          }

        } else if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
          alert(`"${file.name}" looks like an HTML set file. Use the Import button in the Sets panel (next to "+ New Set") to import it instead.`);
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
    setActiveSong(currentSong);
    setEditorAnnotStamp(s => s + 1); // EditorView may have stayed mounted — force annotation re-check
    setView('editor');
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
          onNavigate={song => sessionStorage.setItem('cue:setlist_selected_id', song.id)}
        />
      )}

      {/* Backup restore dialog */}
      {backupDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <div className="flex flex-col gap-1">
              <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Import sets</h2>
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
      {conflictDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
