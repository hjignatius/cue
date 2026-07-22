import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, XCircle, Plus, Upload, Trash2, ChevronRight, Music, Download, GripVertical, CheckSquare, Pencil, Copy, UploadCloud, DownloadCloud, Link2, CloudOff, ExternalLink, Settings, Archive, Tv, RefreshCw } from 'lucide-react';
import { saveSong, saveSet, deleteSet, newestLocalAt, reidSong, loadSongs, loadSets } from '../utils/storage.js';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY_CHROME, ROUND_FILL_ACTIVE, ROUND_FILL_DANGER, ROUND_SIZE_ACTION, ROUND_SIZE_COMPACT } from '../components/RoundButton.jsx';
import { loadAnnotatedSongIds } from '../utils/annotations.js';
import { exportCho, exportSongJson, exportSongsZip, exportSongsJson, exportSetsJson, exportSetJson, exportSetText, exportBackup } from '../utils/fileIO.js';
import { exportSetToPdf, exportSetsToPdf, exportToPdf } from '../utils/pdfExport.js';
import { openManualPDF } from '../utils/manualExport.js';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { parseHtmlSet, matchSong } from '../utils/importHtmlSet.js';
import OnboardingTour from '../components/OnboardingTour.jsx';
import PublishSetDialog from '../components/PublishSetDialog.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import ShareSetDialog from '../components/ShareSetDialog.jsx';
import PullSetDialog from '../components/PullSetDialog.jsx';
import { unpublishSet, publishSet, ownedSongIds, cloudSetRollups } from '../lib/cloud.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';

// Compact pill in the round-button language, shared by the panel/toolbar
// sub-headers (Library, Sets, Setlist). Neutral grey fill (opaque slate on light
// chrome, translucent on dark), indigo when `active` — the same palette as the
// main app header, one tier smaller. `dataOnboard` wraps the pill in a span
// carrying the attribute, since the OnboardingTour spotlight targets it and
// RoundButton has no data-* passthrough.
function HeaderPill({ dark, icon: Icon, label, title, active = false, disabled = false, onActivate, dataOnboard }) {
  const fill = dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY_CHROME;
  const btn = (
    <RoundButton
      size={ROUND_SIZE_COMPACT} pill
      label={label} title={title ?? label}
      fill={fill} active={active} disabled={disabled}
      onActivate={onActivate}
    >
      {Icon && <Icon size={14} />}
      <span className="text-xs font-medium leading-none whitespace-nowrap">{label}</span>
    </RoundButton>
  );
  return dataOnboard ? <span data-onboard={dataOnboard} className="inline-flex">{btn}</span> : btn;
}

const PUBLISHED_SETS_KEY = 'cue:published_sets';
function loadPublishedSets() {
  try { return JSON.parse(localStorage.getItem(PUBLISHED_SETS_KEY) || '{}'); } catch { return {}; }
}

const SHARED_WITH_ME_KEY = 'cue:shared_with_me';
function loadSharedWithMe() {
  try { return JSON.parse(localStorage.getItem(SHARED_WITH_ME_KEY) || '[]'); } catch { return []; }
}

// Normalize text for search so smart quotes match straight ones. iOS keyboards
// insert a curly apostrophe (U+2019) for "Can't", while a Mac types a straight
// one (U+0027); titles are stored with whichever was typed, so a literal
// substring match misses across devices. Lowercase and fold curly single/double
// quotes to straight so both forms compare equal.
function normSearch(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[‘’‚ʼ′]/g, "'")  // ‘ ’ ‚ ʼ ′ → '
    .replace(/[“”„″]/g, '"');       // “ ” „ ″ → "
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
        {key   && <span className="text-base text-indigo-500 dark:text-indigo-400 font-mono shrink-0">{key}</span>}
        {tempo && <span className="text-xs text-gray-400 dark:text-gray-600">{tempo}</span>}
        <button
          onClick={e => { e.stopPropagation(); onDuplicate(song); }}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-300 dark:text-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-all shrink-0"
          title="Duplicate song"
        >
          <Copy size={19} />
        </button>
      </div>
    </div>
  );
}

// ---- Sets column (middle) ---------------------------------------------------

function SetsColumn({ sets, songs, activeSetId, onSelectSet, onRefresh, onSelectModeChange, presenting, border }) {
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
  const [setsExportOpen, setSetsExportOpen] = useState(false);
  const [editingSetId, setEditingSetId]     = useState(null);
  const [editingSetName, setEditingSetName] = useState('');

  // Report select-mode changes up so the parent can blank the Setlist column
  // (the active set's highlight is suppressed in select mode, so its setlist
  // should clear too rather than look like it's tied to the selection).
  useEffect(() => { onSelectModeChange?.(selectMode); }, [selectMode, onSelectModeChange]);

  // Publish/share state
  const [publishedSets, setPublishedSets] = useState(loadPublishedSets);
  const [publishDialog, setPublishDialog] = useState(null); // { set, songs }
  const [shareDialogSet, setShareDialogSet] = useState(null);

  // Shared-with-me bookmarks (viewer-side, localStorage only)
  const [savedShares, setSavedShares] = useState(loadSharedWithMe);

  // Cross-device publish-status sync. Publish state is otherwise cached only in
  // this device's localStorage, so a set published (or unpublished) on another
  // device signed into the same account would look wrong here — e.g. showing
  // "Publish" for a set that's already in the cloud. When signed in, reconcile
  // against the cloud, which is the source of truth (the user's own `sets`
  // table): it becomes authoritative for which sets are published and for the
  // stale-check baseline. localStorage stays the offline cache. Failures
  // (offline / transient) are ignored so the cache is never clobbered blindly.
  const reconcilePublished = useCallback(async () => {
    if (!user) return;
    try {
      const rollups = await cloudSetRollups(user.id); // Map<setId, iso>
      const next = {};
      for (const [id, iso] of rollups) next[id] = iso;
      setPublishedSets(prev => {
        if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
        localStorage.setItem(PUBLISHED_SETS_KEY, JSON.stringify(next));
        return next;
      });
    } catch {
      /* offline or transient — keep the localStorage cache as-is */
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check on mount AND whenever this device returns to the app (tab focus /
  // becoming visible). Without the latter, a set published on another device
  // while this one sits on the Library open would never flip to the orange
  // "pull to update" dot until a full reload. Not a live subscription — it
  // re-checks at the moments the user is actually looking. (Pull-to-refresh on
  // the list gives an explicit re-check even when already focused.)
  useEffect(() => {
    if (!user) return;
    reconcilePublished();
    const onFocus = () => reconcilePublished();
    const onVisible = () => { if (document.visibilityState === 'visible') reconcilePublished(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id, reconcilePublished]);

  // Pull-to-refresh: re-check cloud publish status + reload local library data.
  const doRefresh = useCallback(async () => {
    await reconcilePublished();
    onRefresh?.();
  }, [reconcilePublished, onRefresh]);
  const { ref: listRef, pull: ptrPull, refreshing: ptrRefreshing } = usePullToRefresh(doRefresh);

  function handlePublishClick(set) {
    const setSongs = set.songIds.map(id => songs.find(s => s.id === id)).filter(Boolean);
    setPublishDialog({ set, songs: setSongs });
  }

  // Publish with reactive remediation for cross-user song-id collisions.
  //
  // publishSet upserts songs with onConflict:'id'. Song ids are global but
  // ownership is per-user, so a song carrying another user's id (a copy made
  // before re-id'ing, an imported backup, or legacy cloud data) turns the upsert
  // into an UPDATE the songs RLS policy rejects: "new row violates row-level
  // security policy". We can't pre-detect it — the songs SELECT policy hides
  // other users' rows — so we react: on that error, re-id every song in the set
  // we don't already own (owner-confirmed query, which RLS does allow) to a fresh
  // UUID (remapping set references + annotations via reidSong), then retry once.
  // Songs we own are left alone so republishing keeps updating them in place.
  async function publishWithRemediation(set, setSongs, userId) {
    try {
      return await publishSet(set, setSongs, userId);
    } catch (err) {
      const isRls = err?.code === '42501' || /row-level security/i.test(err?.message || '');
      if (!isRls || !userId) throw err;
      const owned   = await ownedSongIds(setSongs.map(s => s.id), userId);
      const unowned = setSongs.filter(s => !owned.has(s.id));
      if (unowned.length === 0) throw err; // collision we can't explain — surface it
      for (const s of unowned) await reidSong(s.id, crypto.randomUUID());
      const freshSongs = await loadSongs();
      const freshSet   = (await loadSets()).find(s => s.id === set.id) ?? set;
      const retrySongs = freshSet.songIds.map(id => freshSongs.find(s => s.id === id)).filter(Boolean);
      const res = await publishSet(freshSet, retrySongs, userId);
      onRefresh();
      return res;
    }
  }

  function handlePublishSuccess(setId, isoString) {
    const updated = { ...publishedSets, [setId]: isoString };
    setPublishedSets(updated);
    localStorage.setItem(PUBLISHED_SETS_KEY, JSON.stringify(updated));
  }

  // Pull dialog state: null | { setId } — setId null means "show the picker".
  const [pullDialog, setPullDialog] = useState(null);

  // A pulled set is by definition in the cloud, so record it as published (and
  // in-sync as of the rollup we just wrote). Without this, a set pulled onto a
  // fresh device would show no cloud controls at all.
  function handlePullSuccess(setId, rollupIso) {
    handlePublishSuccess(setId, rollupIso);
    onRefresh();
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

  // Duplicate a set: a new set with the same song references (songs are shared,
  // not copied) under a unique "(n)" name. Local-only, so available to everyone.
  async function handleDuplicateSet(set) {
    const names = new Set(sets.map(s => s.name));
    let name = set.name, n = 2;
    while (names.has(name)) name = `${set.name} (${n++})`;
    await saveSet({ id: null, name, songIds: [...set.songIds], sortMode: set.sortMode || 'custom' });
    onRefresh();
  }

  // summary: { setName, matched: number, skipped: [{title, artist}] }

  useEffect(() => { sessionStorage.setItem('cue:set_search', setSearch); }, [setSearch]);
  useEffect(() => { sessionStorage.setItem('cue:set_sort', listSort); }, [listSort]);

  const sorted = [...sets].sort((a, b) => {
    if (listSort === 'alpha')  return a.name.localeCompare(b.name);
    if (listSort === 'oldest') return (a.updatedAt || '').localeCompare(b.updatedAt || '');
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  const filtered = setSearch.trim()
    ? sorted.filter(s => normSearch(s.name).includes(normSearch(setSearch)))
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

  // Export the selected set(s) in the chosen format. One set uses the single-set
  // functions; several combine (one PDF, one JSON bundle). 'setlist' is one set
  // only (a numbered performance list) and is disabled in the menu when >1.
  function runSetsExport(kind) {
    const chosen = [...selectedSets].map(id => sets.find(s => s.id === id)).filter(Boolean);
    if (chosen.length === 0) return;
    const single = chosen.length === 1;
    if (kind === 'pdf')        single ? exportSetToPdf(chosen[0], songs, { chordColor, accidentals })
                                      : exportSetsToPdf(chosen, songs, { chordColor, accidentals });
    else if (kind === 'pdf-charts') single ? exportSetToPdf(chosen[0], songs, { includeChords: true, chordColor, accidentals })
                                            : exportSetsToPdf(chosen, songs, { includeChords: true, chordColor, accidentals });
    else if (kind === 'json')  single ? exportSetJson(chosen[0], songs) : exportSetsJson(chosen, songs);
    else if (kind === 'setlist' && single) exportSetText(chosen[0], songs);
    setSetsExportOpen(false);
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
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sets</span>
          <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">{filtered.length} {filtered.length === 1 ? 'set' : 'sets'}</span>
        </div>
        <div className="flex items-center gap-1">
          {user && (
            <button
              onClick={() => setPullDialog({ setId: null })}
              disabled={presenting}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={presenting ? 'Not available while presenting' : 'Pull a set from the cloud'}
            >
              <DownloadCloud size={16} />
            </button>
          )}
          <button
            onClick={handleImportSet}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title="Import set from OnSong HTML"
          >
            <Download size={16} />
          </button>
          {!selectMode ? (
            <HeaderPill dark={dark} icon={CheckSquare} label="Select" onActivate={() => { setSelectMode(true); setSelectedSets(new Set()); }} />
          ) : (
            <HeaderPill dark={dark} label="Done" onActivate={() => { setSelectMode(false); setSelectedSets(new Set()); }} />
          )}
          <HeaderPill dark={dark} icon={Plus} label="New Set" active onActivate={() => setCreating(v => !v)} />
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

      {/* Action buttons — always present; grayed out until Select is clicked (and,
          as before, until at least one set is selected). */}
      <div className={`px-3 border-b ${border} flex items-center gap-2 shrink-0 min-h-[44px]`}>
        <div className="relative">
          <HeaderPill
            dark={dark} icon={Upload} label="Export"
            disabled={!selectMode || selectedSets.size === 0}
            onActivate={() => setSetsExportOpen(v => !v)}
          />
          {setsExportOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSetsExportOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
                <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => runSetsExport('pdf')}>PDF</button>
                <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => runSetsExport('pdf-charts')}>PDF + Chord Charts</button>
                <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => runSetsExport('json')}>.json</button>
                <button
                  disabled={selectedSets.size > 1}
                  title={selectedSets.size > 1 ? 'Setlist exports one set at a time' : undefined}
                  className={`w-full text-left px-3 py-2 text-xs ${selectedSets.size > 1 ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  onClick={() => runSetsExport('setlist')}
                >Setlist</button>
              </div>
            </>
          )}
        </div>
        <RoundButton
          size={ROUND_SIZE_COMPACT}
          label={selectMode && selectedSets.size > 0 ? `Delete ${selectedSets.size} ${selectedSets.size === 1 ? 'set' : 'sets'}` : 'Delete'}
          title={selectMode && selectedSets.size > 0 ? `Delete ${selectedSets.size} ${selectedSets.size === 1 ? 'set' : 'sets'}` : undefined}
          fill={selectMode && selectedSets.size > 0 ? ROUND_FILL_DANGER : (dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY_CHROME)}
          disabled={!selectMode || selectedSets.size === 0}
          onActivate={handleDeleteSelected}
        >
          <Trash2 size={20} />
        </RoundButton>
        {/* Select-all / count — in the same always-present row so entering Select
            mode never shifts the list down. */}
        <div className="flex-1" />
        {selectMode && (
          <>
            <button
              onClick={() => setSelectedSets(selectedSets.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(s => s.id)))}
              className="text-sm text-indigo-500 hover:text-indigo-400 transition-colors shrink-0 whitespace-nowrap"
            >
              {selectedSets.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
            </button>
            {selectedSets.size > 0 && (
              <button onClick={() => setSelectedSets(new Set())} className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0 whitespace-nowrap hover:text-indigo-500" title="Clear selection">
                {selectedSets.size} ✕
              </button>
            )}
          </>
        )}
      </div>

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

      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
        {/* Pull-to-refresh indicator — height grows with the pull, re-checks cloud
            status + reloads on release past the threshold. */}
        <div
          className="flex items-center justify-center gap-1.5 overflow-hidden text-xs text-gray-400 dark:text-gray-500 select-none"
          style={{ height: ptrPull }}
        >
          {ptrRefreshing ? (
            <><RefreshCw size={13} className="animate-spin" /> Refreshing…</>
          ) : ptrPull >= 64 ? (
            <><RefreshCw size={13} /> Release to refresh</>
          ) : ptrPull > 0 ? (
            <><RefreshCw size={13} style={{ transform: `rotate(${Math.min(180, ptrPull * 2.8)}deg)` }} /> Pull to refresh</>
          ) : null}
        </div>
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
                selectMode && isSelected ? 'bg-indigo-100 dark:bg-indigo-950/60' : !selectMode && isActive ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-gray-100 dark:hover:bg-gray-900'
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
                const localAt = newestLocalAt(set, setSongs);
                // Local edits not yet pushed → republish (amber). Cloud rollup
                // ahead of local → another device published a newer version and
                // this one should pull (orange). Mutually exclusive; equal = in sync.
                const isStale    = isPublished && localAt > lastPub;
                const cloudAhead = isPublished && lastPub > localAt;
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
                              <Pencil size={16} />
                            </button>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-600">{count} {count === 1 ? 'song' : 'songs'}</p>
                    </div>
                    {/* Cloud controls — signed-in users only */}
                    {user && !selectMode && editingSetId !== set.id && (
                      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        {/* Sync indicators — always visible (mutually exclusive). */}
                        {isStale && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-0.5 shrink-0"
                            title="Local changes not yet published — republish to sync"
                          />
                        )}
                        {cloudAhead && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-0.5 shrink-0"
                            title="A newer version is in the cloud — pull to update"
                          />
                        )}
                        {/* Publish / Republish button */}
                        <button
                          onClick={() => handlePublishClick(set)}
                          title={isPublished ? 'Republish' : 'Publish to cloud'}
                          className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                        >
                          <UploadCloud size={19} />
                        </button>
                        {/* Share / Unpublish — only after at least one publish */}
                        {isPublished && (
                          <>
                            <button
                              onClick={() => setPullDialog({ setId: set.id })}
                              disabled={presenting}
                              title={presenting ? 'Not available while presenting' : 'Pull from cloud (overwrites this local set)'}
                              className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <DownloadCloud size={19} />
                            </button>
                            <button
                              onClick={() => setShareDialogSet(set)}
                              title="Share link"
                              className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                            >
                              <Link2 size={19} />
                            </button>
                            <button
                              onClick={() => handleUnpublishClick(set)}
                              title="Remove from cloud"
                              className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            >
                              <CloudOff size={19} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {/* Duplicate — a plain icon button, matching the song row's
                        duplicate. Local operation, so available to everyone. */}
                    {!selectMode && editingSetId !== set.id && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDuplicateSet(set); }}
                        title="Duplicate set"
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-300 dark:text-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-all shrink-0"
                      >
                        <Copy size={19} />
                      </button>
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
                  <Trash2 size={19} />
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
          onPublish={publishWithRemediation}
          onSuccess={() => handlePublishSuccess(publishDialog.set.id, newestLocalAt(publishDialog.set, publishDialog.songs))}
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

      {/* Pull dialog — picker when setId is null, otherwise straight to that set */}
      {pullDialog && (
        <PullSetDialog
          setId={pullDialog.setId}
          localSets={sets}
          localSongs={songs}
          userId={user?.id}
          onPulled={handlePullSuccess}
          onClose={() => setPullDialog(null)}
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

// One setlist row, wired for dnd-kit sortable reorder. The GripVertical handle
// is the drag activator (listeners live on it, not the row) so tapping the rest
// of the row still selects/opens the song. The handle carries touch-action:none
// and user-select:none so iOS Safari initiates a drag instead of scrolling /
// highlighting text. Handle only renders in custom sort mode.
function SortableSongRow({ song, idx, draggable, isSelected, isOver, onSelect, onOpen, onRemove }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={`flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 group transition-colors cursor-pointer ${
        isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40' : isOver ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-900'
      }`}
    >
      {draggable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          aria-label="Drag to reorder"
          title="Drag to reorder"
          className="flex items-center justify-center min-h-[44px] pointer-fine:min-h-[36px] px-1.5 -ml-1.5 shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-700 group-hover:text-gray-400 dark:group-hover:text-gray-500"
          style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          <GripVertical size={14} />
        </button>
      )}
      <span className="text-xs text-gray-400 dark:text-gray-600 w-5 shrink-0">{idx + 1}.</span>
      <span className={`flex-1 truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-900 dark:text-white'}`}>{song.metadata?.title || 'Untitled'}</span>
      {song.metadata?.key && <span className="text-base text-indigo-500 dark:text-indigo-400 font-mono shrink-0">{song.metadata.key}</span>}
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-400 hover:text-red-500 transition-colors shrink-0"
        title="Remove from set"
      >
        <Trash2 size={19} />
      </button>
    </div>
  );
}

function SetlistColumn({ set, songs, onUpdateSet, onDeleteSet, onPresent, onEdit, border }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';
  const [overId, setOverId] = useState(null); // dnd-kit: id of the row currently dragged over
  const sensors = useSensors(
    // Pointer Events cover mouse, trackpad, and touch (iOS). 8px activation
    // distance means a short tap won't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );
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

  function handleDragEnd(event) {
    setOverId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = displaySongs.findIndex(s => s.id === active.id);
    const to   = displaySongs.findIndex(s => s.id === over.id);
    if (from === -1 || to === -1) return;
    // Same splice reorder as before, now driven by dnd-kit ids.
    const reordered = [...displaySongs];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
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
            <HeaderPill
              dark={dark} icon={Tv} label="Present"
              title={canAct ? 'Present from selected song' : 'Select a song first'}
              active={canAct} disabled={!canAct}
              onActivate={() => onPresent(displaySongs, selectedIdx)}
            />
          )}
          {displaySongs.length > 0 && (
            <HeaderPill
              dark={dark} icon={Pencil} label="Edit"
              title={canAct ? 'Edit selected song' : 'Select a song first'}
              disabled={!canAct}
              onActivate={() => selectedSong && onEdit?.(selectedSong, selectedIdx, displaySongs)}
            />
          )}
        </div>
      </div>

      {/* Status bar — Gap on the left, Export on the right, song count/duration
          between. Export lives here (not in the controls row above) so it stops
          wrapping to its own line beside Present/Edit on narrower panels (iPad). */}
      <div className={`px-3 py-1.5 border-b ${border} flex items-center gap-2 shrink-0`}>
        {hasDurations && (
          <div className="flex items-center gap-1 shrink-0">
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
        <p className="text-xs text-gray-400 dark:text-gray-600 flex-1 truncate">
          {displaySongs.length} {displaySongs.length === 1 ? 'song' : 'songs'}
          {hasDurations && estimatedSec > 0 && ` · ${formatDuration(estimatedSec)}`}
        </p>
        {/* Export now lives on the Sets column's Select-mode Export ▾ (one place,
            all formats). Select this set there to export it. */}
      </div>

      <div className="flex-1 overflow-y-auto">
        {displaySongs.length === 0 && (
          <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-600 text-center">No songs yet — select songs in the Library and use "Add to Set".</p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragOver={e => setOverId(e.over?.id ?? null)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setOverId(null)}
        >
          <SortableContext items={displaySongs.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {displaySongs.map((song, idx) => (
              <SortableSongRow
                key={song.id}
                song={song}
                idx={idx}
                draggable={sortMode === 'custom'}
                isSelected={song.id === selectedSongId}
                isOver={sortMode === 'custom' && song.id === overId && song.id !== selectedSongId}
                onSelect={() => selectSong(song.id)}
                onOpen={() => onPresent?.(displaySongs, idx)}
                onRemove={() => handleRemove(song.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

    </div>
  );
}

// ---- Library view -----------------------------------------------------------

export default function LibraryView({ songs, sets, onNewSong, onOpenSong, onOpenSongFromList, onImport, onRefresh, onDeleteSong, onPresent, onEditSong, presenting = false }) {
  const { theme, updatePref, chordColor, accidentals } = usePrefs();
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
  const [setsSelectMode, setSetsSelectMode] = useState(false); // mirrors SetsColumn select mode

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
    const q = normSearch(search);
    return (
      normSearch(s.metadata?.title).includes(q) ||
      normSearch(s.metadata?.artist).includes(q) ||
      normSearch(s.metadata?.key).includes(q)
    );
  });

  const artistFiltered = artistFilter !== null ? filtered.filter(s => (s.metadata?.artist || '') === artistFilter) : filtered;
  const keyFiltered    = keyFilter ? artistFiltered.filter(s => (s.metadata?.key || '') === keyFilter) : artistFiltered;

  const sorted = [...keyFiltered].sort((a, b) => {
    if (sortBy === 'title')  return (a.metadata?.title  || '').localeCompare(b.metadata?.title  || '');
    if (sortBy === 'newest') return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    if (sortBy === 'oldest') return (a.updatedAt || '').localeCompare(b.updatedAt || '');
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
    // Selection (and the blueish highlight) only happens in Select mode, where it
    // drives an action — export, add-to-set, or delete. Outside Select mode a
    // single click does nothing (double-click opens the song), so a plain click
    // no longer looks "selected" when it can't be acted on.
    if (!selectMode) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
    setSelected(new Set());
    setSelectMode(false);
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
    setSelected(new Set());
    setSelectMode(false);
  }

  function handleExportSelectedPdf(includeChords = false) {
    const selectedSongs = sorted.filter(s => selected.has(s.id));
    if (selectedSongs.length === 0) return;
    if (selectedSongs.length === 1) {
      const s = selectedSongs[0];
      // Same render lens as the set PDF: transpose to the song's saved View Key.
      exportToPdf(s, { displayKey: s.displayKey, includeChords, chordColor, accidentals });
    } else {
      // Multiple selected → one combined PDF, via a one-off synthesized set.
      exportSetToPdf({ name: 'Songs', songIds: selectedSongs.map(s => s.id) }, songs, { includeChords, chordColor, accidentals });
    }
    setExportDropOpen(false);
    setSelected(new Set());
    setSelectMode(false);
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
          <Music size={28} className="text-indigo-400" />
          <h1 className="text-3xl font-bold tracking-tight">Cue</h1>
        </div>
        {/* Round-button language, matching the editor header: ? and Settings are
            icon-only circles; Import and Backup are icon+label pills. Neutral fill
            (opaque slate on light chrome, translucent on dark) — no indigo anchor,
            as none of these is a primary action. */}
        <div className="flex items-center gap-2">
          {(() => {
            const headerFill = dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY_CHROME;
            const PillLabel = ({ children }) => <span className="text-sm font-medium leading-none whitespace-nowrap">{children}</span>;
            return (
              <>
                <RoundButton size={ROUND_SIZE_ACTION} label="Open user manual" title="Open user manual" fill={headerFill} onActivate={openManualPDF}>
                  <span className="font-bold leading-none" style={{ fontSize: 20 }}>?</span>
                </RoundButton>
                <RoundButton size={ROUND_SIZE_ACTION} label="Settings" title="Settings" fill={headerFill} onActivate={() => setSettingsOpen(true)}>
                  <Settings size={22} />
                </RoundButton>
                {/* Wrapper keeps the onboarding tour's spotlight target intact. */}
                <span data-onboard="import-btn" className="inline-flex">
                  <RoundButton size={ROUND_SIZE_ACTION} pill label="Import" title="Import" fill={headerFill} onActivate={onImport}>
                    <Download size={18} /><PillLabel>Import</PillLabel>
                  </RoundButton>
                </span>
                <RoundButton size={ROUND_SIZE_ACTION} pill label="Backup" title="Backup" fill={headerFill} onActivate={() => exportBackup()}>
                  <Archive size={18} /><PillLabel>Backup</PillLabel>
                </RoundButton>
              </>
            );
          })()}
        </div>
      </header>

      {/* Body — three columns */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Column 1: Library */}
        <div data-onboard="songs-panel" className={`flex-1 min-w-0 min-h-0 flex flex-col border-r ${border} overflow-hidden`}>
          <div className={`px-4 py-2 border-b ${border} flex items-center justify-between`}>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Library</span>
              <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">{sorted.length} {sorted.length === 1 ? 'song' : 'songs'}</span>
            </div>
            <div className="flex items-center gap-2">
              {selectMode
                ? <HeaderPill dark={dark} label="Done" onActivate={toggleSelectMode} />
                : <HeaderPill dark={dark} icon={CheckSquare} label="Select" onActivate={toggleSelectMode} />
              }
              <HeaderPill dark={dark} icon={Plus} label="New Song" active onActivate={onNewSong} dataOnboard="new-song-btn" />
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

          {/* Action buttons — always present; grayed out until Select is clicked
              (and, as before, until at least one song is selected). Artist / key
              filter breadcrumbs sit on the right. */}
          <div className={`px-4 border-b ${border} flex items-center gap-2 min-h-[44px]`}>
            <div className="relative">
              <HeaderPill
                dark={dark} icon={Upload} label="Export"
                disabled={!selectMode || selected.size === 0}
                onActivate={() => setExportDropOpen(v => !v)}
              />
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
                    <button className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white" onClick={() => handleExportSelectedPdf(false)}>
                      PDF
                    </button>
                    <button className="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white" onClick={() => handleExportSelectedPdf(true)}>
                      PDF + Chord Charts
                    </button>
                  </div>
                </>
              )}
            </div>
            <HeaderPill
              dark={dark} label="Add to Set"
              title={!selectMode || selected.size === 0 ? undefined : !activeSetId ? 'Select a set in the Sets panel first' : `Add to "${activeSet?.name}"`}
              active={selectMode && selected.size > 0 && !!activeSetId}
              disabled={!selectMode || !(selected.size > 0 && activeSetId)}
              onActivate={handleAddSelectedToSet}
            />
            <RoundButton
              size={ROUND_SIZE_COMPACT}
              label={selectMode && selected.size > 0 ? `Delete ${selected.size} ${selected.size === 1 ? 'song' : 'songs'}` : 'Delete'}
              title={selectMode && selected.size > 0 ? `Delete ${selected.size} ${selected.size === 1 ? 'song' : 'songs'}` : undefined}
              fill={selectMode && selected.size > 0 ? ROUND_FILL_DANGER : (dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY_CHROME)}
              disabled={!selectMode || selected.size === 0}
              onActivate={handleDeleteSelected}
            >
              <Trash2 size={20} />
            </RoundButton>

            <div className="flex-1" />
            {/* Select-all / count in select mode; filter breadcrumbs otherwise —
                all in this always-present row so the song list never shifts. */}
            {selectMode ? (
              <>
                <button
                  onClick={allVisibleSelected ? deselectAll : selectAll}
                  className="text-sm text-indigo-500 hover:text-indigo-400 transition-colors shrink-0 whitespace-nowrap"
                >
                  {allVisibleSelected ? 'Deselect all' : 'Select all'}
                </button>
                {selected.size > 0 && (
                  <button onClick={deselectAll} className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0 whitespace-nowrap hover:text-indigo-500" title="Clear selection">
                    {selected.size} ✕
                  </button>
                )}
              </>
            ) : (
              <>
                {artistFilter !== null && sortBy === 'artist' && (
                  <>
                    <button onClick={() => setArtistFilter(null)} className="text-xs text-indigo-500 hover:text-indigo-400 shrink-0">← All artists</button>
                    <span className="text-xs text-gray-400 dark:text-gray-600 shrink-0 truncate">/ {artistFilter || 'No artist'}</span>
                  </>
                )}
                {keyFilter && (
                  <button onClick={() => setKeyFilter(null)} className="text-xs text-indigo-500 hover:text-indigo-400 shrink-0">Clear key</button>
                )}
              </>
            )}
          </div>

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
            onSelectModeChange={setSetsSelectMode}
            presenting={presenting}
            border={border}
          />
        </div>

        {/* Column 3: Setlist */}
        <div data-onboard="setlist-panel" className={`flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden`}>
          <SetlistColumn
            key={activeSetId}
            set={setsSelectMode ? null : activeSet}
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
