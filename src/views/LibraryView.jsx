import { useEffect, useRef, useState } from 'react';
import { Search, XCircle, Plus, Upload, Trash2, ChevronRight, Music, Download, GripVertical, CheckSquare, Pencil, Copy, UploadCloud, Link2, CloudOff, ExternalLink, Settings } from 'lucide-react';
import { saveSong, saveSet, deleteSet } from '../utils/storage.js';
import { loadAnnotatedSongIds } from '../utils/annotations.js';
import { exportCho, exportSongJson, exportSongsZip, exportSongsJson, exportSetsJson, exportSetJson, exportSetText, exportBackup } from '../utils/fileIO.js';
import { exportSetToPdf } from '../utils/pdfExport.js';
import { openManualPDF } from '../utils/manualExport.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { parseHtmlSet, matchSong } from '../utils/importHtmlSet.js';
import OnboardingTour from '../components/OnboardingTour.jsx';
import PublishSetDialog from '../components/PublishSetDialog.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import ShareSetDialog from '../components/ShareSetDialog.jsx';
import { unpublishSet } from '../lib/cloud.js';

const PUBLISHED_SETS_KEY = 'cue:published_sets';
function loadPublishedSets() {
  try { return JSON.parse(localStorage.getItem(PUBLISHED_SETS_KEY) || '{}'); } catch { return {}; }
}

const SHARED_WITH_ME_KEY = 'cue:shared_with_me';
function loadSharedWithMe() {
  try { return JSON.parse(localStorage.getItem(SHARED_WITH_ME_KEY) || '[]'); } catch { return []; }
}

function parseDuration(dur) {
  if (!dur) return 0;
  const s = String(dur);
  if (s.includes(':')) {
    const [m, sec] = s.split(':').map(Number);
    return (m || 0) * 60 + (sec || 0);
  }
  return Number(s) || 0;
}

function formatDuration(totalSec) {
  if (!totalSec) return null;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- Song row ---------------------------------------------------------------

function SongRow({ song, onOpen, onDuplicate, selected, onToggleSelect, highlighted, hasAnnotation }) {
  const { title, artist, key, tempo } = song.metadata || {};

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 cursor-pointer group transition-colors ${
        selected    ? 'bg-indigo-100 dark:bg-indigo-950/60'
        : highlighted ? 'bg-indigo-50 dark:bg-indigo-950/40'
        : 'hover:bg-gray-100 dark:hover:bg-gray-900'
      }`}
      onClick={() => onToggleSelect(song.id)}
      onDoubleClick={onOpen}
    >
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${selected ? 'text-indigo-700 dark:text-indigo-300' : highlighted ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>{title || 'Untitled'}</p>
        {artist && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{artist}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Pencil dot: this song has local ink annotations from Present mode */}
        {hasAnnotation && (
          <span
            title="This song has ink annotations (visible in the editor)"
            className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0"
          >
            <Pencil size={9} className="text-white" strokeWidth={2.5} />
          </span>
        )}
        {key   && <span className="text-xs text-indigo-500 dark:text-indigo-400 font-mono shrink-0">{key}</span>}
        {tempo && <span className="text-xs text-gray-400 dark:text-gray-600">{tempo}</span>}
        <button
          onClick={e => { e.stopPropagation(); onDuplicate(song); }}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-300 dark:text-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-all shrink-0"
          title="Duplicate song"
        >
          <Copy size={13} />
        </button>
      </div>
    </div>
  );
}

// ---- Sets column (middle) ---------------------------------------------------

function SetsColumn({ sets, songs, activeSetId, onSelectSet, onRefresh, border }) {
  const { theme } = usePrefs();
  const { user }  = useAuth();
  const dark = theme === 'dark';
  const [listSort, setListSort] = useState(() => sessionStorage.getItem('cue:set_sort') || 'newest');
  const [setSearch, setSetSearch] = useState(() => sessionStorage.getItem('cue:set_search') || '');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState('');
  const [summary, setSummary]   = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSets, setSelectedSets] = useState(new Set());
  const [editingSetId, setEditingSetId]     = useState(null);
  const [editingSetName, setEditingSetName] = useState('');

  // Publish/share state
  const [publishedSets, setPublishedSets] = useState(loadPublishedSets);
  const [publishDialog, setPublishDialog] = useState(null); // { set, songs }
  const [shareDialogSet, setShareDialogSet] = useState(null);

  // Shared-with-me bookmarks (viewer-side, localStorage only)
  const [savedShares, setSavedShares] = useState(loadSharedWithMe);

  function handlePublishClick(set) {
    const setSongs = set.songIds.map(id => songs.find(s => s.id === id)).filter(Boolean);
    setPublishDialog({ set, songs: setSongs });
  }

  function handlePublishSuccess(setId, isoString) {
    const updated = { ...publishedSets, [setId]: isoString };
    setPublishedSets(updated);
    localStorage.setItem(PUBLISHED_SETS_KEY, JSON.stringify(updated));
  }

  // Unpublish dialog state: null | { set, phase: 'confirm'|'running'|'success'|'error', error: string }
  const [unpublishDialog, setUnpublishDialog] = useState(null);

  function handleUnpublishClick(set) {
    setUnpublishDialog({ set, phase: 'confirm', error: '' });
  }

  async function runUnpublish() {
    const { set } = unpublishDialog;
    setUnpublishDialog(d => ({ ...d, phase: 'running', error: '' }));
    try {
      await unpublishSet(set.id, user.id);
      const updated = { ...publishedSets };
      delete updated[set.id];
      setPublishedSets(updated);
      localStorage.setItem(PUBLISHED_SETS_KEY, JSON.stringify(updated));
      setUnpublishDialog(d => ({ ...d, phase: 'success' }));
    } catch (err) {
      setUnpublishDialog(d => ({ ...d, phase: 'error', error: err.message || 'Unpublish failed. Please try again.' }));
    }
  }

  function startRename(set, e) {
    e.stopPropagation();
    setEditingSetId(set.id);
    setEditingSetName(set.name);
  }

  async function commitRename(set) {
    const trimmed = editingSetName.trim();
    setEditingSetId(null);
    if (trimmed && trimmed !== set.name) {
      await saveSet({ ...set, name: trimmed });
      onRefresh();
    }
  }

  function cancelRename() { setEditingSetId(null); }

  // summary: { setName, matched: number, skipped: [{title, artist}] }

  useEffect(() => { sessionStorage.setItem('cue:set_search', setSearch); }, [setSearch]);
  useEffect(() => { sessionStorage.setItem('cue:set_sort', listSort); }, [listSort]);

  const sorted = [...sets].sort((a, b) => {
    if (listSort === 'alpha')  return a.name.localeCompare(b.name);
    if (listSort === 'oldest') return a.savedAt - b.savedAt;
    return b.savedAt - a.savedAt;
  });

  const filtered = setSearch.trim()
    ? sorted.filter(s => s.name.toLowerCase().includes(setSearch.toLowerCase()))
    : sorted;

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    await saveSet({ id: null, name: newName.trim(), songIds: [], sortMode: 'custom' });
    onRefresh();
    setNewName('');
    setCreating(false);
  }

  async function handleDelete(id) {
    if (confirm('Delete this set? Songs stay in your library.')) {
      await deleteSet(id);
      onRefresh();
    }
  }

  async function handleDeleteSelected() {
    const count = selectedSets.size;
    if (!count) return;
    if (!confirm(`Delete ${count} ${count === 1 ? 'set' : 'sets'}? Songs stay in your library.`)) return;
    for (const id of selectedSets) await deleteSet(id);
    onRefresh();
    setSelectedSets(new Set());
    setSelectMode(false);
  }

  function handleImportSet() {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.html,.htm';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const result = parseHtmlSet(await file.text(), file.name);
      if (result.error) { alert(result.error); return; }

      // Unique set name — append (2), (3) … if name already taken
      let setName = result.setName;
      const taken = new Set(sets.map(s => s.name));
      if (taken.has(setName)) {
        let n = 2;
        while (taken.has(`${setName} (${n})`)) n++;
        setName = `${setName} (${n})`;
      }

      // Match each row against the library
      const matchedIds = [];
      const skipped    = [];
      for (const row of result.songs) {
        const found = matchSong(row, songs);
        if (found) matchedIds.push(found.id);
        else skipped.push(row);
      }

      await saveSet({ id: null, name: setName, songIds: matchedIds, sortMode: 'custom' });
      onRefresh();
      setSummary({ setName, matched: matchedIds.length, skipped });
    };
    input.click();
  }

  return (
    <div className="flex flex-col h-full">
      <div className={`px-3 py-2 border-b ${border} flex items-center justify-between shrink-0`}>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sets</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleImportSet}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title="Import set from HTML file"
          >
            <Download size={16} />
          </button>
          {!selectMode ? (
            <button onClick={() => { setSelectMode(true); setSelectedSets(new Set()); }} className={`flex items-center gap-1 h-9 px-3 text-xs rounded-lg transition-colors border ${dark ? 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400'}`}>
              <CheckSquare size={12} /> Select
            </button>
          ) : (
            <button onClick={() => { setSelectMode(false); setSelectedSets(new Set()); }} className={`h-9 px-3 text-xs rounded-lg transition-colors border ${dark ? 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400'}`}>
              Done
            </button>
          )}
          <button
            onClick={() => setCreating(v => !v)}
            className="flex items-center gap-1 h-9 px-3 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            <Plus size={12} /> New Set
          </button>
        </div>
      </div>
      <div className={`px-3 py-3 border-b ${border} flex gap-2 shrink-0`}>
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            value={setSearch}
            onChange={e => setSetSearch(e.target.value)}
            placeholder="Search sets…"
            className={`w-full border rounded-lg pl-9 pr-10 py-1.5 text-sm focus:outline-none focus:border-indigo-500 ${dark ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
          />
          {setSearch && (
            <button
              onClick={() => setSetSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              title="Clear search"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
        <select
          value={listSort}
          onChange={e => setListSort(e.target.value)}
          className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer ${dark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
        >
          <option value="alpha">A–Z</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      {/* Count row: action buttons left (select mode only), count right */}
      <div className={`px-3 border-b ${border} flex items-center gap-2 shrink-0 min-h-[44px]`}>
        <div className={selectMode ? 'flex items-center gap-2 shrink-0' : 'flex-1'}>
          {selectMode ? (
            <>
              <button
                onClick={selectedSets.size > 0 ? () => exportSetsJson([...selectedSets].map(id => sets.find(s => s.id === id)).filter(Boolean), songs) : undefined}
                disabled={selectedSets.size === 0}
                className={`flex items-center gap-1.5 text-sm px-4 h-11 pointer-fine:h-9 rounded-lg font-medium transition-colors border whitespace-nowrap ${
                  selectedSets.size > 0
                    ? 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-500 dark:hover:border-gray-400'
                    : 'border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-700 cursor-not-allowed'
                }`}
              >
                <Upload size={14} /> Export
              </button>
              <button
                onClick={selectedSets.size > 0 ? handleDeleteSelected : undefined}
                disabled={selectedSets.size === 0}
                title={selectedSets.size > 0 ? `Delete ${selectedSets.size} ${selectedSets.size === 1 ? 'set' : 'sets'}` : 'Delete'}
                className={`flex items-center justify-center px-4 h-11 pointer-fine:h-9 rounded-lg transition-colors ${
                  selectedSets.size > 0
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-600">
              {filtered.length} {filtered.length === 1 ? 'set' : 'sets'}
              {setSearch.trim() && ` matching "${setSearch.trim()}"`}
            </p>
          )}
        </div>
        {selectMode && <div className="flex-1" />}
        {selectMode && (
          <p className="text-xs text-gray-400 dark:text-gray-600 shrink-0">
            {filtered.length} {filtered.length === 1 ? 'set' : 'sets'}
            {setSearch.trim() && ` matching "${setSearch.trim()}"`}
          </p>
        )}
      </div>

      {/* Selection controls row: only visible in select mode */}
      {selectMode && (
        <div className={`px-3 border-b ${border} ${dark ? 'bg-gray-900/80' : 'bg-gray-100/80'} flex items-center gap-3 shrink-0 min-h-[44px]`}>
          <button
            onClick={() => setSelectedSets(selectedSets.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(s => s.id)))}
            className="h-11 px-4 pointer-fine:h-9 text-sm text-indigo-500 hover:text-indigo-400 transition-colors shrink-0 rounded-lg whitespace-nowrap"
          >
            {selectedSets.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
          </button>
          {selectedSets.size > 0 && (
            <>
              <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums shrink-0 min-w-[6rem]">
                {selectedSets.size} selected
              </span>
              <span className="text-gray-400 dark:text-gray-600 shrink-0">·</span>
              <button onClick={() => setSelectedSets(new Set())} className="h-11 px-3 pointer-fine:h-9 text-sm text-indigo-500 hover:text-indigo-400 transition-colors rounded-lg shrink-0 whitespace-nowrap">
                ✕ Clear
              </button>
            </>
          )}
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className={`px-3 py-2 border-b ${border} shrink-0`}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Set name"
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-indigo-500 mb-2"
          />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="flex-1 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {sets.length === 0 && !creating && (
          <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-600 text-center">No sets yet. Use "+ New Set" to create one.</p>
        )}
        {sets.length > 0 && filtered.length === 0 && (
          <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-600 text-center">No sets match your search.</p>
        )}
        {filtered.map(set => {
          const count = set.songIds.filter(id => songs.find(s => s.id === id)).length;
          const isActive = set.id === activeSetId;
          const isSelected = selectedSets.has(set.id);
          return (
            <div
              key={set.id}
              className={`flex items-center gap-2 px-3 py-3 border-b ${border} group transition-colors cursor-pointer ${
                selectMode && isSelected ? 'bg-indigo-100 dark:bg-indigo-950/60' : isActive ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-gray-100 dark:hover:bg-gray-900'
              }`}
              onClick={() => {
                if (editingSetId === set.id) return;
                if (selectMode) {
                  setSelectedSets(prev => {
                    const next = new Set(prev);
                    if (next.has(set.id)) next.delete(set.id); else next.add(set.id);
                    return next;
                  });
                } else {
                  onSelectSet(set.id);
                }
              }}
            >
              {(() => {
                const lastPub = publishedSets[set.id] ?? null;
                const isPublished = !!lastPub;
                const setSongs = set.songIds.map(id => songs.find(s => s.id === id)).filter(Boolean);
                const newestLocalAt = [set.updatedAt, ...setSongs.map(s => s.updatedAt)].filter(Boolean).sort().at(-1) ?? '';
                const isStale = isPublished && newestLocalAt > lastPub;
                return (
                  <>
                    <div className="flex-1 min-w-0">
                      {editingSetId === set.id ? (
                        <input
                          autoFocus
                          value={editingSetName}
                          onChange={e => setEditingSetName(e.target.value)}
                          onBlur={() => commitRename(set)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRename(set); }
                            if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-full bg-transparent border-b border-indigo-500 outline-none text-sm font-medium text-gray-900 dark:text-white py-0.5"
                        />
                      ) : (
                        <div className="flex items-center gap-1 group/name">
                          <p className={`font-medium truncate ${isActive && !selectMode ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>{set.name}</p>
                          {!selectMode && (
                            <button
                              onClick={e => startRename(set, e)}
                              title="Rename set"
                              className="opacity-0 group-hover/name:opacity-100 pointer-coarse:opacity-100 h-8 w-8 flex items-center justify-center rounded text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-opacity shrink-0"
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-600">{count} {count === 1 ? 'song' : 'songs'}</p>
                    </div>
                    {/* Cloud controls — signed-in users only */}
                    {user && !selectMode && editingSetId !== set.id && (
                      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        {/* Stale indicator — always visible when cloud copy is outdated */}
                        {isStale && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-0.5 shrink-0"
                            title="Local changes not yet published — republish to sync"
                          />
                        )}
                        {/* Publish / Republish button */}
                        <button
                          onClick={() => handlePublishClick(set)}
                          title={isPublished ? 'Republish' : 'Publish to cloud'}
                          className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                        >
                          <UploadCloud size={13} />
                        </button>
                        {/* Share / Unpublish — only after at least one publish */}
                        {isPublished && (
                          <>
                            <button
                              onClick={() => setShareDialogSet(set)}
                              title="Share link"
                              className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                            >
                              <Link2 size={13} />
                            </button>
                            <button
                              onClick={() => handleUnpublishClick(set)}
                              title="Remove from cloud"
                              className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            >
                              <CloudOff size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {!selectMode && editingSetId !== set.id && (
                      <ChevronRight size={14} className={`shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-gray-300 dark:text-gray-700 group-hover:text-gray-500'}`} />
                    )}
                  </>
                );
              })()}
            </div>
          );
        })}

        {/* Shared with me — only shown when the viewer has saved share bookmarks */}
        {savedShares.length > 0 && (
          <div className={`border-t-2 ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <div className={`flex items-center gap-2 px-3 pt-3 pb-1.5`}>
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Shared with me</span>
              <span className="text-xs text-gray-300 dark:text-gray-700">{savedShares.length}</span>
            </div>
            {savedShares.map(share => (
              <div
                key={share.token}
                className={`flex items-center gap-2 px-3 py-3 border-b ${border} group transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/20`}
              >
                <div className="flex-1 min-w-0">
                  <a
                    href={`/shared/${share.token}`}
                    className={`font-medium truncate block text-sm transition-colors ${dark ? 'text-gray-300 hover:text-indigo-400' : 'text-gray-700 hover:text-indigo-600'}`}
                  >
                    {share.setName || 'Shared set'}
                  </a>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">Shared link</p>
                </div>
                <ExternalLink size={12} className={`shrink-0 ${dark ? 'text-gray-700' : 'text-gray-300'} group-hover:opacity-60 transition-opacity`} />
                <button
                  onClick={() => {
                    const updated = savedShares.filter(s => s.token !== share.token);
                    setSavedShares(updated);
                    localStorage.setItem(SHARED_WITH_ME_KEY, JSON.stringify(updated));
                  }}
                  className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-all"
                  title="Remove from Shared with me"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Publish dialog */}
      {publishDialog && (
        <PublishSetDialog
          set={publishDialog.set}
          songs={publishDialog.songs}
          userId={user?.id}
          onSuccess={isoString => handlePublishSuccess(publishDialog.set.id, isoString)}
          onClose={() => setPublishDialog(null)}
        />
      )}

      {/* Share dialog */}
      {shareDialogSet && (
        <ShareSetDialog
          set={shareDialogSet}
          onClose={() => setShareDialogSet(null)}
        />
      )}

      {/* Unpublish dialog */}
      {unpublishDialog && (() => {
        const { set, phase, error } = unpublishDialog;
        const h2  = `text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`;
        const sub = `text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`;
        const em  = `font-medium ${dark ? 'text-gray-200' : 'text-gray-800'}`;
        const btnRed    = `w-full py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors`;
        const btnIndigo = `w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors`;
        const btnGhost  = `text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`;
        const panel = `w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={phase !== 'running' ? () => setUnpublishDialog(null) : undefined}
          >
            <div className={panel} onClick={e => e.stopPropagation()}>
              {phase === 'confirm' && (
                <>
                  <div className="flex flex-col gap-1">
                    <h2 className={h2}>Remove from cloud?</h2>
                    <p className={sub}>
                      <span className={em}>"{set.name}"</span> will be deleted from the cloud and all its share links will stop working.
                      Your local copy is not affected.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={runUnpublish} className={btnRed}>Remove from cloud</button>
                    <button onClick={() => setUnpublishDialog(null)} className={btnGhost}>Cancel</button>
                  </div>
                </>
              )}
              {phase === 'running' && (
                <div className="text-center py-2">
                  <p className={sub}>Removing from cloud…</p>
                </div>
              )}
              {phase === 'success' && (
                <>
                  <div className="flex flex-col gap-1">
                    <h2 className={h2}>Removed</h2>
                    <p className={sub}>
                      <span className={em}>"{set.name}"</span> has been removed from the cloud. All share links are now inactive.
                    </p>
                  </div>
                  <button onClick={() => setUnpublishDialog(null)} className={btnIndigo}>Done</button>
                </>
              )}
              {phase === 'error' && (
                <>
                  <div className="flex flex-col gap-1">
                    <h2 className={h2}>Failed</h2>
                    <p className="text-xs text-red-500">{error}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={runUnpublish} className={btnRed}>Retry</button>
                    <button onClick={() => setUnpublishDialog(null)} className={btnGhost}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Import summary modal */}
      {summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`w-96 max-h-[80vh] rounded-2xl shadow-2xl flex flex-col ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <div className="px-6 pt-6 pb-4 shrink-0">
              <h2 className={`text-base font-semibold mb-1.5 ${dark ? 'text-white' : 'text-gray-900'}`}>Set imported</h2>
              <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                Created <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>"{summary.setName}"</span> with{' '}
                <span className="font-medium text-indigo-500">{summary.matched} {summary.matched === 1 ? 'song' : 'songs'}</span>.
                {summary.skipped.length > 0 && (
                  <> {summary.skipped.length} {summary.skipped.length === 1 ? 'song was' : 'songs were'} not found in your library.</>
                )}
              </p>
            </div>

            {summary.skipped.length > 0 && (
              <div className={`mx-4 mb-2 rounded-lg border flex flex-col min-h-0 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide shrink-0 rounded-t-lg ${dark ? 'bg-gray-800 text-gray-500' : 'bg-gray-50 text-gray-400'}`}>
                  Not found in library
                </div>
                <div className="overflow-y-auto">
                  {summary.skipped.map((s, i) => (
                    <div key={i} className={`px-3 py-2 ${i < summary.skipped.length - 1 ? `border-b ${dark ? 'border-gray-800' : 'border-gray-100'}` : ''}`}>
                      <p className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{s.title}</p>
                      {s.artist && <p className={`text-xs ${dark ? 'text-gray-600' : 'text-gray-400'}`}>{s.artist}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={`px-4 py-4 shrink-0 border-t ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
              <button
                onClick={() => setSummary(null)}
                className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Setlist column (right) -------------------------------------------------

function SetlistColumn({ set, songs, onUpdateSet, onDeleteSet, onPresent, onEdit, border }) {
  const { chordColor } = usePrefs();
  const [exportOpen, setExportOpen] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const dragSrcIdx = useRef(null);
  const [selectedSongId, setSelectedSongId] = useState(() => sessionStorage.getItem('cue:setlist_selected_id') || null);
  const [bufferSec, setBufferSec] = useState(() => {
    const stored = localStorage.getItem('cue:setlist_buffer_sec');
    return stored !== null ? parseInt(stored, 10) : 0;
  });

  function adjustBuffer(delta) {
    setBufferSec(prev => {
      const next = Math.max(0, prev + delta);
      localStorage.setItem('cue:setlist_buffer_sec', next);
      return next;
    });
  }

  function selectSong(songId) {
    const newId = selectedSongId === songId ? null : songId;
    setSelectedSongId(newId);
    if (newId) sessionStorage.setItem('cue:setlist_selected_id', newId);
    else sessionStorage.removeItem('cue:setlist_selected_id');
  }

  if (!set) {
    return (
      <div className="flex flex-col h-full">
        <div className={`px-4 py-2 border-b ${border}`}>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Setlist</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-400 dark:text-gray-600 text-center px-4">Select a set to view its songs</p>
        </div>
      </div>
    );
  }

  const sortMode = set.sortMode || 'custom';
  const setSongs = set.songIds.map(id => songs.find(s => s.id === id)).filter(Boolean);
  const displaySongs = sortMode === 'alpha'
    ? [...setSongs].sort((a, b) => (a.metadata?.title || '').localeCompare(b.metadata?.title || ''))
    : setSongs;

  function applySort(mode) {
    if (mode === 'alpha') {
      const reordered = [...setSongs].sort((a, b) => (a.metadata?.title || '').localeCompare(b.metadata?.title || ''));
      onUpdateSet({ ...set, songIds: reordered.map(s => s.id), sortMode: 'alpha' });
    } else {
      onUpdateSet({ ...set, sortMode: 'custom' });
    }
  }

  function handleRemove(songId) {
    onUpdateSet({ ...set, songIds: set.songIds.filter(id => id !== songId) });
  }

  function handleDragStart(e, idx) {
    dragSrcIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }

  function handleDrop(e, idx) {
    e.preventDefault();
    const from = dragSrcIdx.current;
    setDragOverIdx(null);
    dragSrcIdx.current = null;
    if (from === null || from === idx) return;
    const reordered = [...displaySongs];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(idx, 0, moved);
    onUpdateSet({ ...set, songIds: reordered.map(s => s.id), sortMode: 'custom' });
  }

  function handleDeleteSet() {
    if (!confirm(`Delete "${set.name}"? This will not delete any songs from your library.`)) return;
    onDeleteSet(set.id);
  }

  const selectedSong = selectedSongId ? displaySongs.find(s => s.id === selectedSongId) ?? null : null;
  const selectedIdx  = selectedSong ? displaySongs.indexOf(selectedSong) : -1;
  const canAct       = selectedSong !== null;

  const totalSec      = displaySongs.reduce((sum, s) => sum + parseDuration(s.metadata?.duration), 0);
  const hasDurations  = displaySongs.some(s => parseDuration(s.metadata?.duration) > 0);
  const gapCount      = Math.max(0, displaySongs.length - 1);
  const estimatedSec  = totalSec + gapCount * bufferSec;
  const bufferLabel   = bufferSec === 0 ? '0s' : bufferSec < 60 ? `${bufferSec}s` : `${Math.floor(bufferSec / 60)}:${String(bufferSec % 60).padStart(2, '0')}`;

  return (
    <div className="flex flex-col h-full">
      <div className={`px-3 py-2 border-b ${border} shrink-0`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Setlist</span>
        </div>
        <p className="font-semibold text-gray-900 dark:text-white truncate mb-1.5">{set.name}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-0.5 bg-gray-200 dark:bg-gray-800 rounded p-0.5 text-xs">
            <button onClick={() => applySort('custom')} className={`h-8 px-3 rounded transition-colors ${sortMode === 'custom' ? 'bg-gray-500 dark:bg-gray-600 text-white' : 'text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'}`}>Custom</button>
            <button onClick={() => applySort('alpha')}  className={`h-8 px-3 rounded transition-colors ${sortMode === 'alpha'  ? 'bg-gray-500 dark:bg-gray-600 text-white' : 'text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'}`}>A–Z</button>
          </div>
          {displaySongs.length > 0 && (
            <button
              onClick={() => canAct && onPresent(displaySongs, selectedIdx)}
              disabled={!canAct}
              className={`text-xs h-9 px-3 rounded-lg transition-colors ${canAct ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}
              title={canAct ? 'Present from selected song' : 'Select a song first'}
            >▶ Present</button>
          )}
          {displaySongs.length > 0 && (
            <button
              onClick={() => canAct && selectedSong && onEdit?.(selectedSong, selectedIdx, displaySongs)}
              disabled={!canAct}
              className={`flex items-center gap-1 text-xs h-9 px-3 rounded-lg transition-colors ${canAct ? 'border border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-600 dark:hover:border-gray-400' : 'border border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-700 cursor-not-allowed'}`}
              title={canAct ? 'Edit selected song' : 'Select a song first'}
            ><Pencil size={11} /> Edit</button>
          )}
          {displaySongs.length > 0 && (
            <div className="relative ml-auto">
              <button onClick={() => setExportOpen(v => !v)} className="flex items-center gap-1 h-9 px-1 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"><Upload size={12} /> Export ▾</button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 top-6 z-20 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
                    <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { exportSetToPdf(set, songs, { chordColor }); setExportOpen(false); }}>PDF</button>
                    <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { exportSetToPdf(set, songs, { includeChords: true, chordColor }); setExportOpen(false); }}>PDF + Chord Charts</button>
                    <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { exportSetJson(set, songs); setExportOpen(false); }}>JSON bundle</button>
                    <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { exportSetText(set, songs); setExportOpen(false); }}>Setlist</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className={`px-3 py-1.5 border-b ${border} flex items-center gap-2 shrink-0`}>
        <p className="text-xs text-gray-400 dark:text-gray-600 flex-1">
          {displaySongs.length} {displaySongs.length === 1 ? 'song' : 'songs'}
          {hasDurations && estimatedSec > 0 && ` · ${formatDuration(estimatedSec)}`}
        </p>
        {hasDurations && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 dark:text-gray-600">Gap</span>
            <button
              onClick={() => adjustBuffer(-15)}
              disabled={bufferSec === 0}
              className="w-11 h-11 pointer-fine:w-9 pointer-fine:h-9 flex items-center justify-center rounded-lg text-sm font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
            >−</button>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-7 text-center tabular-nums">{bufferLabel}</span>
            <button
              onClick={() => adjustBuffer(15)}
              className="w-11 h-11 pointer-fine:w-9 pointer-fine:h-9 flex items-center justify-center rounded-lg text-sm font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            >+</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {displaySongs.length === 0 && (
          <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-600 text-center">No songs yet — select songs in the Library and use "Add to Set".</p>
        )}
        {displaySongs.map((song, idx) => (
          <div
            key={song.id}
            draggable={sortMode === 'custom'}
            onDragStart={e => handleDragStart(e, idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={e => handleDrop(e, idx)}
            onDragEnd={() => { setDragOverIdx(null); dragSrcIdx.current = null; }}
            onClick={() => selectSong(song.id)}
            onDoubleClick={() => onPresent?.(displaySongs, idx)}
            className={`flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 group transition-colors cursor-pointer ${
              song.id === selectedSongId ? 'bg-indigo-50 dark:bg-indigo-950/40' : dragOverIdx === idx ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-900'
            }`}
          >
            {sortMode === 'custom' && (
              <GripVertical size={14} className="text-gray-300 dark:text-gray-700 group-hover:text-gray-400 dark:group-hover:text-gray-500 cursor-grab shrink-0" />
            )}
            <span className="text-xs text-gray-400 dark:text-gray-600 w-5 shrink-0">{idx + 1}.</span>
            <span className={`flex-1 truncate ${song.id === selectedSongId ? 'text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-900 dark:text-white'}`}>{song.metadata?.title || 'Untitled'}</span>
            {song.metadata?.key && <span className="text-xs text-indigo-500 dark:text-indigo-400 font-mono shrink-0">{song.metadata.key}</span>}
            <button
              onClick={e => { e.stopPropagation(); handleRemove(song.id); }}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-400 hover:text-red-500 transition-colors shrink-0"
              title="Remove from set"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}

// ---- Library view -----------------------------------------------------------

export default function LibraryView({ songs, sets, onNewSong, onOpenSong, onOpenSongFromList, onImport, onRefresh, onDeleteSong, onPresent, onEditSong }) {
  const { theme, updatePref } = usePrefs();
  const dark = theme === 'dark';

  const [showTour, setShowTour] = useState(() => !localStorage.getItem('cue:onboarding_done'));
  function finishTour() { localStorage.setItem('cue:onboarding_done', '1'); setShowTour(false); }

  // Track which songs have local ink annotations (for pencil badge in song rows).
  // Reloaded on mount and whenever the document regains focus (e.g. after a Present session).
  const [annotatedSongIds, setAnnotatedSongIds] = useState(() => new Set());
  useEffect(() => {
    function reload() { loadAnnotatedSongIds().then(ids => setAnnotatedSongIds(ids)); }
    reload();
    document.addEventListener('visibilitychange', reload);
    window.addEventListener('focus', reload);
    return () => {
      document.removeEventListener('visibilitychange', reload);
      window.removeEventListener('focus', reload);
    };
  }, []);

  const [highlightedSongId, setHighlightedSongId] = useState(() => sessionStorage.getItem('cue:lib_highlighted_id') || null);

  const [search, setSearch]             = useState(() => sessionStorage.getItem('cue:lib_search') || '');
  const [sortBy, setSortBy]             = useState(() => sessionStorage.getItem('cue:lib_sort') || 'title');
  const [artistFilter, setArtistFilter] = useState(() => sessionStorage.getItem('cue:lib_artist_filter') || null);
  const [keyFilter, setKeyFilter]       = useState(() => sessionStorage.getItem('cue:lib_key_filter') || null);

  const [selectMode, setSelectMode]   = useState(false);
  const [selected, setSelected]       = useState(new Set());
  const [exportDropOpen, setExportDropOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSetId, setActiveSetId] = useState(() => sessionStorage.getItem('cue:active_set_id') || null);

  useEffect(() => { sessionStorage.setItem('cue:lib_search', search); }, [search]);
  useEffect(() => { sessionStorage.setItem('cue:lib_sort', sortBy); }, [sortBy]);
  useEffect(() => {
    if (keyFilter) sessionStorage.setItem('cue:lib_key_filter', keyFilter);
    else sessionStorage.removeItem('cue:lib_key_filter');
  }, [keyFilter]);
  useEffect(() => {
    if (artistFilter) sessionStorage.setItem('cue:lib_artist_filter', artistFilter);
    else sessionStorage.removeItem('cue:lib_artist_filter');
  }, [artistFilter]);
  useEffect(() => {
    if (activeSetId) sessionStorage.setItem('cue:active_set_id', activeSetId);
    else sessionStorage.removeItem('cue:active_set_id');
  }, [activeSetId]);

  const activeSet = sets.find(s => s.id === activeSetId) || null;

  const filtered = songs.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.metadata?.title?.toLowerCase().includes(q) ||
      s.metadata?.artist?.toLowerCase().includes(q) ||
      s.metadata?.key?.toLowerCase().includes(q)
    );
  });

  const artistFiltered = artistFilter !== null ? filtered.filter(s => (s.metadata?.artist || '') === artistFilter) : filtered;
  const keyFiltered    = keyFilter ? artistFiltered.filter(s => (s.metadata?.key || '') === keyFilter) : artistFiltered;

  const sorted = [...keyFiltered].sort((a, b) => {
    if (sortBy === 'title')  return (a.metadata?.title  || '').localeCompare(b.metadata?.title  || '');
    if (sortBy === 'newest') return b.savedAt - a.savedAt;
    if (sortBy === 'oldest') return a.savedAt - b.savedAt;
    if (sortBy === 'artist') return (a.metadata?.artist || '').localeCompare(b.metadata?.artist || '');
    if (sortBy === 'key')    return (a.metadata?.key    || '').localeCompare(b.metadata?.key    || '');
    return 0;
  });

  const uniqueKeys = [...new Set(songs.map(s => s.metadata?.key).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const artists = sortBy === 'artist'
    ? [...new Map(songs.filter(s => s.metadata?.artist).map(s => [s.metadata.artist, s])).keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ name, count: songs.filter(s => s.metadata?.artist === name).length }))
    : null;

  function handleDelete(id) {
    if (!confirm('Delete this song? It will also be removed from any sets it appears in.')) return;
    onDeleteSong(id);
  }

  async function handleDuplicate(song) {
    await saveSong({
      id: null,
      metadata: { ...song.metadata, title: (song.metadata?.title || 'Untitled') + ' (Copy)' },
      text: song.text,
      chordStyle: song.chordStyle,
      diagramScale: song.diagramScale,
      chordPrefs: song.chordPrefs,
      displayKey: song.displayKey,
    });
    onRefresh();
  }

  function toggleSelectMode() { setSelectMode(v => !v); setSelected(new Set()); }
  function toggleSelect(id) {
    if (selectMode) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      setSelected(prev => prev.has(id) && prev.size === 1 ? new Set() : new Set([id]));
    }
  }
  function selectAll()   { setSelected(new Set(sorted.map(s => s.id))); }
  function deselectAll() { setSelected(new Set()); }

  async function handleAddSelectedToSet() {
    const set = sets.find(s => s.id === activeSetId);
    if (!set) return;
    const newIds = [...selected].filter(id => !set.songIds.includes(id));
    if (!newIds.length) return;
    await saveSet({ ...set, songIds: [...set.songIds, ...newIds] });
    onRefresh();
    setSelected(new Set());
    setSelectMode(false);
  }

  function handleExportSelected() {
    const selectedSongs = sorted.filter(s => selected.has(s.id));
    if (selectedSongs.length === 0) return;
    if (selectedSongs.length === 1) {
      exportCho(selectedSongs[0]);
    } else {
      exportSongsZip(selectedSongs);
    }
    setExportDropOpen(false);
  }

  function handleExportSelectedJson() {
    const selectedSongs = sorted.filter(s => selected.has(s.id));
    if (selectedSongs.length === 0) return;
    if (selectedSongs.length === 1) {
      exportSongJson(selectedSongs[0]);
    } else {
      exportSongsJson(selectedSongs);
    }
    setExportDropOpen(false);
  }

  function handleDeleteSelected() {
    const count = selected.size;
    if (!count) return;
    if (!confirm(`Delete ${count} ${count === 1 ? 'song' : 'songs'}? They will be removed from your library and any sets they appear in.`)) return;
    for (const id of selected) onDeleteSong(id);
    setSelected(new Set());
    setSelectMode(false);
  }

  async function handleUpdateSet(updated) { await saveSet(updated); onRefresh(); }
  async function handleDeleteSet(id) {
    await deleteSet(id);
    if (activeSetId === id) setActiveSetId(null);
    onRefresh();
  }

  function handleSelectSet(id) {
    setActiveSetId(id === activeSetId ? null : id);
  }

  const allVisibleSelected = sorted.length > 0 && sorted.every(s => selected.has(s.id));

  const border    = 'border-gray-200 dark:border-gray-800';
  const btnBorder = `border ${dark ? 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400'}`;

  return (
    <div className={`h-dvh flex flex-col ${dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <header className={`px-6 py-4 border-b ${border} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-3">
          <Music size={20} className="text-indigo-400" />
          <h1 className="text-xl font-bold tracking-tight">Cue</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openManualPDF}
            className={`w-11 h-11 pointer-fine:w-9 pointer-fine:h-9 flex items-center justify-center rounded-lg transition-colors text-sm font-bold ${btnBorder}`}
            title="Open user manual"
          >
            ?
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className={`w-11 h-11 pointer-fine:w-9 pointer-fine:h-9 flex items-center justify-center rounded-lg transition-colors ${btnBorder}`}
            title="Settings"
          >
            <Settings size={16} />
          </button>
          <button data-onboard="import-btn" onClick={onImport} className={`flex items-center gap-1.5 h-11 px-4 pointer-fine:h-9 pointer-fine:px-3 text-sm rounded-lg transition-colors ${btnBorder}`}>
            <Download size={14} /> Import
          </button>
          <button onClick={() => exportBackup()} className={`flex items-center gap-1.5 h-11 px-4 pointer-fine:h-9 pointer-fine:px-3 text-sm rounded-lg transition-colors ${btnBorder}`}>
            Backup
          </button>
        </div>
      </header>

      {/* Body — three columns */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Column 1: Library */}
        <div data-onboard="songs-panel" className={`flex-1 min-w-0 min-h-0 flex flex-col border-r ${border} overflow-hidden`}>
          <div className={`px-4 py-2 border-b ${border} flex items-center justify-between`}>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Library</span>
            <div className="flex items-center gap-2">
              {selectMode
                ? <button onClick={toggleSelectMode} className={`h-9 px-3 text-xs rounded-lg transition-colors ${btnBorder}`}>Done</button>
                : <button onClick={toggleSelectMode} className={`flex items-center gap-1 h-9 px-3 text-xs rounded-lg transition-colors ${btnBorder}`}><CheckSquare size={12} /> Select</button>
              }
              <button data-onboard="new-song-btn" onClick={onNewSong} className="flex items-center gap-1 h-9 px-3 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
                <Plus size={12} /> New Song
              </button>
            </div>
          </div>

          <div className={`px-4 py-3 border-b ${border} flex gap-2`}>
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setArtistFilter(null); }}
                placeholder="Search songs, artists, keys…"
                className={`w-full border rounded-lg pl-9 pr-10 py-1.5 text-sm focus:outline-none focus:border-indigo-500 ${dark ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); setArtistFilter(null); }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Clear search"
                >
                  <XCircle size={18} />
                </button>
              )}
            </div>
            <select
              value={keyFilter || ''}
              onChange={e => setKeyFilter(e.target.value || null)}
              className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer ${keyFilter ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : ''} ${dark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            >
              <option value="">Key</option>
              {uniqueKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setArtistFilter(null); }}
              className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer ${dark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            >
              <option value="title">A–Z</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="artist">By Artist</option>
              <option value="key">By Key</option>
            </select>
          </div>

          {/* Count row: action buttons left (select mode only), count right */}
          <div className={`px-4 border-b ${border} flex items-center gap-2 min-h-[44px]`}>
            <div className={selectMode ? 'flex items-center gap-2 shrink-0' : artistFilter !== null && sortBy === 'artist' ? 'flex items-center gap-2' : 'flex-1'}>
              {selectMode ? (
                <>
                  <div className="relative">
                    <button
                      onClick={() => selected.size > 0 && setExportDropOpen(v => !v)}
                      disabled={selected.size === 0}
                      className={`flex items-center gap-1.5 text-sm px-4 h-11 pointer-fine:h-9 rounded-lg font-medium transition-colors border whitespace-nowrap ${
                        selected.size > 0
                          ? 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-500 dark:hover:border-gray-400'
                          : 'border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-700 cursor-not-allowed'
                      }`}
                    >
                      <Upload size={14} /> Export ▾
                    </button>
                    {exportDropOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setExportDropOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 z-20 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
                          <button className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white" onClick={handleExportSelected}>
                            {selected.size === 1 ? 'ChordPro (.cho)' : 'ZIP (.cho files)'}
                          </button>
                          <button className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white" onClick={handleExportSelectedJson}>
                            JSON
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={selected.size > 0 && activeSetId ? handleAddSelectedToSet : undefined}
                    disabled={!(selected.size > 0 && activeSetId)}
                    title={selected.size === 0 ? undefined : !activeSetId ? 'Select a set in the Sets panel first' : `Add to "${activeSet?.name}"`}
                    className={`flex items-center gap-1.5 text-sm px-4 h-11 pointer-fine:h-9 rounded-lg font-medium transition-colors whitespace-nowrap ${
                      selected.size > 0 && activeSetId
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    Add to Set
                  </button>
                  <button
                    onClick={selected.size > 0 ? handleDeleteSelected : undefined}
                    disabled={selected.size === 0}
                    title={selected.size > 0 ? `Delete ${selected.size} ${selected.size === 1 ? 'song' : 'songs'}` : undefined}
                    className={`flex items-center justify-center px-4 h-11 pointer-fine:h-9 rounded-lg transition-colors ${
                      selected.size > 0
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              ) : artistFilter !== null && sortBy === 'artist' ? (
                <>
                  <button onClick={() => setArtistFilter(null)} className="text-xs text-indigo-500 hover:text-indigo-400">← All artists</button>
                  <span className="text-xs text-gray-400 dark:text-gray-600">/ {artistFilter || 'No artist'}</span>
                </>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-600">
                  {sorted.length} {sorted.length === 1 ? 'song' : 'songs'}
                  {search && ` matching "${search}"`}
                  {keyFilter && ` in ${keyFilter}`}
                </p>
              )}
            </div>
            {selectMode && <div className="flex-1" />}
            {selectMode && (
              <p className="text-xs text-gray-400 dark:text-gray-600 shrink-0">
                {sorted.length} {sorted.length === 1 ? 'song' : 'songs'}
                {search && ` matching "${search}"`}
                {keyFilter && ` in ${keyFilter}`}
              </p>
            )}
            {keyFilter && (
              <button onClick={() => setKeyFilter(null)} className="text-xs text-indigo-500 hover:text-indigo-400 shrink-0">Clear key</button>
            )}
          </div>

          {/* Selection controls row: only visible in select mode */}
          {selectMode && (
            <div className={`px-4 border-b ${border} ${dark ? 'bg-gray-900/80' : 'bg-gray-100/80'} flex items-center gap-3 shrink-0 min-h-[44px]`}>
              <button
                onClick={allVisibleSelected ? deselectAll : selectAll}
                className="h-11 px-4 pointer-fine:h-9 text-sm text-indigo-500 hover:text-indigo-400 transition-colors shrink-0 rounded-lg whitespace-nowrap"
              >
                {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </button>
              {selected.size > 0 && (
                <>
                  <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums shrink-0 min-w-[6rem]">
                    {selected.size} selected
                  </span>
                  <span className="text-gray-400 dark:text-gray-600 shrink-0">·</span>
                  <button onClick={deselectAll} className="h-11 px-3 pointer-fine:h-9 text-sm text-indigo-500 hover:text-indigo-400 transition-colors rounded-lg shrink-0 whitespace-nowrap">
                    ✕ Clear
                  </button>
                </>
              )}
            </div>
          )}

          {sortBy === 'artist' && artistFilter === null && !search && artists && (
            <div className="flex-1 overflow-y-auto">
              {songs.filter(s => !s.metadata?.artist).length > 0 && (
                <button onClick={() => setArtistFilter('')} className={`w-full flex items-center justify-between px-4 py-3 border-b ${border} hover:bg-gray-100 dark:hover:bg-gray-900 text-left`}>
                  <span className="text-sm text-gray-400 italic">No artist</span>
                  <span className="text-xs text-gray-400 dark:text-gray-600">{songs.filter(s => !s.metadata?.artist).length}</span>
                </button>
              )}
              {artists.map(a => (
                <button key={a.name} onClick={() => setArtistFilter(a.name)} className={`w-full flex items-center justify-between px-4 py-3 border-b ${border} hover:bg-gray-100 dark:hover:bg-gray-900 text-left group`}>
                  <span className="text-sm text-gray-900 dark:text-white">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-600">{a.count} {a.count === 1 ? 'song' : 'songs'}</span>
                    <ChevronRight size={13} className="text-gray-300 dark:text-gray-700 group-hover:text-gray-500" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {(sortBy !== 'artist' || artistFilter !== null || search) && (
            <div className="flex-1 overflow-y-auto">
              {songs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                  <Music size={32} className="text-gray-300 dark:text-gray-700" />
                  <p className="text-gray-400 dark:text-gray-500 text-sm">No songs yet.<br />Create a new song or import a .cho file.</p>
                </div>
              )}
              {songs.length > 0 && sorted.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-600 text-center">No songs match your search.</p>
              )}
              {sorted.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  onOpen={() => {
                    setSelected(new Set());
                    setHighlightedSongId(null);
                    sessionStorage.removeItem('cue:lib_highlighted_id');
                    if (onOpenSongFromList) onOpenSongFromList(song, idx, sorted);
                    else onOpenSong(song);
                  }}
                  onDuplicate={handleDuplicate}
                  selected={selected.has(song.id)}
                  onToggleSelect={toggleSelect}
                  highlighted={!selected.has(song.id) && song.id === highlightedSongId}
                  hasAnnotation={annotatedSongIds.has(song.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Column 2: Sets */}
        <div data-onboard="sets-panel" className={`flex-1 min-w-0 min-h-0 flex flex-col border-r ${border} overflow-hidden`}>
          <SetsColumn
            sets={sets}
            songs={songs}
            activeSetId={activeSetId}
            onSelectSet={handleSelectSet}
            onRefresh={onRefresh}
            border={border}
          />
        </div>

        {/* Column 3: Setlist */}
        <div data-onboard="setlist-panel" className={`flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden`}>
          <SetlistColumn
            key={activeSetId}
            set={activeSet}
            songs={songs}
            onUpdateSet={handleUpdateSet}
            onDeleteSet={handleDeleteSet}
            onPresent={(presentSongs, idx = 0) => onPresent(presentSongs, idx)}
            onEdit={(song, idx, allSongs) => onEditSong?.(song, idx, allSongs)}
            border={border}
          />
        </div>

      </div>

      {showTour && <OnboardingTour onDone={finishTour} />}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
