import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, XCircle, Plus, Upload, Trash2, ChevronRight, Music, Download, GripVertical, CheckSquare, Pencil, DownloadCloud, Link2, ExternalLink, Settings, Archive, RefreshCw, SquarePen, Tv, Copy, UploadCloud, CloudOff, Share, ListPlus } from 'lucide-react';
import { saveSong, saveSet, deleteSet, newestLocalAt, reidSong, loadSongs, loadSets, loadPdfBlob, savePdfBlob, setPdfUploaded } from '../utils/storage.js';
import { uploadPdfBlob } from '../lib/pdfSync.js';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY_CHROME, ROUND_FILL_ACTIVE, ROUND_FILL_DANGER, ROUND_SIZE_ACTION, ROUND_SIZE_COMPACT } from '../components/RoundButton.jsx';
import { loadAnnotatedSongIds } from '../utils/annotations.js';
import { exportCho, exportSongJson, exportSongsZip, exportSongsJson, exportSetsJson, exportSetJson, exportSetText, exportBackup, customChordsForSong } from '../utils/fileIO.js';
import { exportSetToPdf, exportSetsToPdf, exportToPdf } from '../utils/pdfExport.js';
import { openManualPDF } from '../utils/manualExport.js';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import OnboardingTour from '../components/OnboardingTour.jsx';
import PublishSetDialog from '../components/PublishSetDialog.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import ShareSetDialog from '../components/ShareSetDialog.jsx';
import PullSetDialog from '../components/PullSetDialog.jsx';
import { unpublishSet, publishSet, ownedSongIds, cloudSetRollups } from '../lib/cloud.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import { useIsPhonePortrait, usePortraitPanels } from '../hooks/useIsPhonePortrait.js';
import { useAutoHideOnScroll } from '../hooks/useAutoHideOnScroll.js';
import SegmentedControl, { SEGMENTED_HEIGHT } from '../components/SegmentedControl.jsx';
import RowMenu from '../components/RowMenu.jsx';

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

// iPhone-portrait single-panel switcher. The active panel is local-first state,
// like the app's other view preferences.
const PHONE_PANEL_KEY = 'cue.phonePanel';
const PHONE_PANELS    = ['library', 'sets', 'setlist'];
function loadPhonePanel() {
  try {
    const v = localStorage.getItem(PHONE_PANEL_KEY);
    return PHONE_PANELS.includes(v) ? v : 'library';
  } catch { return 'library'; }
}
// Room under the last list row so it clears the floating pill and stays tappable:
// pill height + its 8px bottom offset + breathing room + the safe-area inset.
const PILL_CLEARANCE = `calc(${SEGMENTED_HEIGHT.lg}px + 20px + env(safe-area-inset-bottom))`;

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

// The key a song is performed in: its View Key (displayKey) when set, otherwise
// its written key. Used for the Library key badge, search, key filter and sort
// so everything reflects the key you actually play in, not the source key.
function effectiveKey(song) {
  const view = (song?.displayKey || '').trim();
  return view || (song?.metadata?.key || '').trim();
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

// A row in an Export dropdown. Press feedback only (gray on touch-down via
// active:, hover on mouse) — unlike RowMenu it must NOT defer the action a frame
// for a "held" highlight, because export actions open the file-save picker / iOS
// share sheet, which require the live user gesture and would be blocked if the
// call were pushed to a later tick.
function ExportMenuItem({ label, onSelect, disabled = false, title, px = 'px-3' }) {
  const state = disabled
    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
    : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600';
  return (
    <button type="button" disabled={disabled} title={title}
      onClick={() => { if (!disabled) onSelect?.(); }}
      className={`w-full text-left ${px} py-2 text-xs transition-colors ${state}`}>
      {label}
    </button>
  );
}

// ---- Song row ---------------------------------------------------------------

function SongRow({ song, dark, onOpen, onPresent, onDuplicate, onRetryPdf, selected, onToggleSelect, highlighted, hasAnnotation }) {
  const { title, artist, key } = song.metadata || {};

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 cursor-pointer group transition-colors ${
        selected    ? 'bg-indigo-100 dark:bg-indigo-950/60'
        : highlighted ? 'bg-indigo-50 dark:bg-indigo-950/40'
        : 'hover:bg-gray-100 dark:hover:bg-gray-900'
      }`}
      onClick={() => onToggleSelect(song.id)}
    >
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${selected ? 'text-indigo-700 dark:text-indigo-300' : highlighted ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>{title || 'Untitled'}</p>
        {artist && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{artist}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Link dot: this song was copied in from a set someone shared. The
            marker is the copiedFrom provenance the copy already records. */}
        {song.copiedFrom && (
          <span
            title={song.copiedFrom.setName ? `Copied from shared set "${song.copiedFrom.setName}"` : 'Copied from a shared set'}
            className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 dark:bg-emerald-500 shrink-0"
          >
            <Link2 size={9} className="text-white" strokeWidth={2.5} />
          </span>
        )}
        {/* Pencil dot: this song has local ink annotations from Present mode */}
        {hasAnnotation && (
          <span
            title="This song has ink annotations (visible in the editor)"
            className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0"
          >
            <Pencil size={9} className="text-white" strokeWidth={2.5} />
          </span>
        )}
        {/* Amber dot: this pdf song's bytes failed to upload to the cloud, so
            other devices will see a placeholder. Retry via the row's ⋮ menu. */}
        {song.type === 'pdf' && song.pdf?.uploaded === false && (
          <span
            title="This PDF didn't upload to the cloud. Use the ⋮ menu → Retry PDF upload."
            className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 shrink-0"
          >
            <CloudOff size={9} className="text-white" strokeWidth={2.5} />
          </span>
        )}
        {(() => {
          const view = effectiveKey(song);
          if (!view) return null;
          const transposed = view !== (key || '').trim();
          return (
            <span
              className="text-base text-indigo-500 dark:text-indigo-400 font-mono shrink-0"
              title={transposed ? `Played in ${view} (written ${key})` : undefined}
            >{view}</span>
          );
        })()}
        <RowMenu
          dark={dark}
          label={`Actions for ${title || 'Untitled'}`}
          items={[
            { id: 'edit',  label: 'Edit',      icon: SquarePen, onSelect: onOpen },
            { id: 'pres',  label: 'Present',   icon: Tv,        onSelect: () => onPresent(song) },
            { id: 'dup',   label: 'Duplicate', icon: Copy,      onSelect: () => onDuplicate(song) },
            (song.type === 'pdf' && song.pdf?.uploaded === false && onRetryPdf) &&
              { id: 'pdfretry', label: 'Retry PDF upload', icon: CloudOff, onSelect: () => onRetryPdf(song) },
          ].filter(Boolean)}
        />
      </div>
    </div>
  );
}

// ---- Sets column (middle) ---------------------------------------------------

function SetsColumn({ sets, songs, activeSetId, onSelectSet, onRefresh, onSelectModeChange, isPublished, onDeleteBlocked, presenting, border }) {
  // chordColor/accidentals/instrument feed the set PDF export (render lens +
  // which chord library); without them the PDF branch throws a ReferenceError.
  const { theme, chordColor, accidentals, instrument } = usePrefs();
  const { user }  = useAuth();
  const dark = theme === 'dark';
  const [listSort, setListSort] = useState(() => sessionStorage.getItem('cue:set_sort') || 'newest');
  const [setSearch, setSetSearch] = useState(() => sessionStorage.getItem('cue:set_search') || '');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSets, setSelectedSets] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(null); // null | { ids } — in-app delete confirm
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
  const navigate = useNavigate();
  // "Open a shared link" — the only route into a shared set from inside an
  // installed app. iOS cannot hand a tapped URL to a Home Screen web app
  // (Universal Links need a native App Store app), so a recipient who taps a
  // share link lands in Safari with no way across. Pasting it here skips the
  // browser entirely, mirroring the emailed sign-in code.
  const [shareInput, setShareInput] = useState('');
  const [shareErr, setShareErr]     = useState('');

  // Accepts a full share URL or a bare token. Tokens are the last non-empty
  // path segment, so this survives query strings, trailing slashes, and a
  // pasted link from any origin (someone else's deployment included).
  function tokenFromShareInput(raw) {
    const v = (raw || '').trim();
    if (!v) return '';
    const withoutQuery = v.split(/[?#]/)[0];
    const segs = withoutQuery.split('/').filter(Boolean);
    return segs.length ? segs[segs.length - 1] : '';
  }

  function openSharedLink(e) {
    e.preventDefault();
    const token = tokenFromShareInput(shareInput);
    if (!token) { setShareErr('Paste a share link or code.'); return; }
    if (/\s/.test(token)) { setShareErr("That doesn't look like a share link."); return; }
    setShareErr('');
    setShareInput('');
    navigate(`/shared/${token}`);
  }

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
    // Embed each song's custom chord shapes in its published content so another
    // device can render them after pulling (the custom-chord library is local).
    const enrich = (list) => list.map(s => ({ ...s, customChords: customChordsForSong(s, instrument) }));
    try {
      return await publishSet(set, enrich(setSongs), userId);
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
      const res = await publishSet(freshSet, enrich(retrySongs), userId);
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

  // "Unpublish before deleting" gate: opened when a delete targets a published
  // (shared) set. It carries an Unpublish button so the user can unshare in place,
  // after which the set is deletable. null | { ids, phase, error }.
  const [deleteBlockedDialog, setDeleteBlockedDialog] = useState(null);

  async function runGateUnpublish() {
    const ids = deleteBlockedDialog?.ids || [];
    if (!ids.length) return;
    if (!user) { setDeleteBlockedDialog(d => ({ ...d, error: 'Sign in to unpublish this set.' })); return; }
    setDeleteBlockedDialog(d => ({ ...d, phase: 'running', error: '' }));
    try {
      const updated = { ...publishedSets };
      for (const id of ids) {
        await unpublishSet(id, user.id);   // cloud-first; frees the share link
        delete updated[id];
      }
      setPublishedSets(updated);
      localStorage.setItem(PUBLISHED_SETS_KEY, JSON.stringify(updated));
      setDeleteBlockedDialog(null);
      onRefresh();
    } catch (err) {
      setDeleteBlockedDialog(d => ({ ...d, phase: 'confirm', error: err.message || 'Unpublish failed. Check your connection and try again.' }));
    }
  }

  function startRename(set, e) {
    e?.stopPropagation();
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

  useEffect(() => { sessionStorage.setItem('cue:set_search', setSearch); }, [setSearch]);
  useEffect(() => { sessionStorage.setItem('cue:set_sort', listSort); }, [listSort]);

  // 'shared' is the one option that narrows rather than reorders: it answers
  // "which sets are shared?" so anything unshared is hidden while it is active.
  // Ordering inside it falls back to newest-first, the list's normal default.
  const sharedOnly = listSort === 'shared';

  const sorted = [...sets].sort((a, b) => {
    if (listSort === 'alpha')  return a.name.localeCompare(b.name);
    if (listSort === 'oldest') return (a.updatedAt || '').localeCompare(b.updatedAt || '');
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  const bySearch = setSearch.trim()
    ? sorted.filter(s => normSearch(s.name).includes(normSearch(setSearch)))
    : sorted;

  // Sets I published (they carry a live share link).
  const filtered = sharedOnly
    ? bySearch.filter(s => !!publishedSets[s.id])
    : bySearch;

  // Sets others shared with me. Normally these live in their own section below
  // the list; under the Shared filter they belong alongside my published sets,
  // so they are pulled up here and the section below drops its duplicate copy.
  const sharedWithMeMatches = sharedOnly
    ? (setSearch.trim()
        ? savedShares.filter(sh => normSearch(sh.setName || 'Shared set').includes(normSearch(setSearch)))
        : savedShares)
    : [];

  // Header count covers both groups so it matches what is actually on screen.
  const visibleCount = filtered.length + sharedWithMeMatches.length;

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    // Select the just-created set so it becomes the active target. Without this,
    // the previously-active set stayed selected, and "Add to Set" (which silently
    // targets the active set) would add songs to the OLD set — surfacing as a
    // confusing "already in <old set>" when the song was already there.
    const saved = await saveSet({ id: null, name: newName.trim(), songIds: [], sortMode: 'custom' });
    onRefresh();
    onSelectSet?.(saved.id);
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
    const ids = [...selectedSets];
    if (!ids.length) return;
    // A published (shared) set must be unpublished first, so deleting it can't
    // orphan a live share link. Show the in-app "unpublish first" window (which
    // carries an Unpublish button) instead of deleting. Selection is kept so the
    // user can delete again once it's unpublished.
    const published = ids.filter(id => isPublished?.(id));
    if (published.length > 0) {
      onDeleteBlocked?.(published);
      return;
    }
    // Unpublished sets: confirm via a custom in-app modal, NOT native confirm()
    // (which is suppressed in the installed iOS PWA, so the delete never ran).
    setDeleteConfirm({ ids });
  }

  async function performDelete() {
    const ids = deleteConfirm?.ids || [];
    for (const id of ids) await deleteSet(id);
    setDeleteConfirm(null);
    onRefresh();
    setSelectedSets(new Set());
    setSelectMode(false);
  }

  // Export the selected set(s) in the chosen format. One set uses the single-set
  // functions; several combine (one PDF, one JSON bundle). 'setlist' is one set
  // only (a numbered performance list) and is disabled in the menu when >1.
  async function runSetsExport(kind) {
    const chosen = [...selectedSets].map(id => sets.find(s => s.id === id)).filter(Boolean);
    if (chosen.length === 0) return;
    const single = chosen.length === 1;
    setSetsExportOpen(false);
    setSelectedSets(new Set());
    setSelectMode(false);
    // Await + surface failures: the PDF path is async, so an unhandled rejection
    // (e.g. a malformed song) would otherwise fail silently and look like a no-op.
    try {
      if (kind === 'pdf')        single ? await exportSetToPdf(chosen[0], songs, { chordColor, accidentals, instrument })
                                        : await exportSetsToPdf(chosen, songs, { chordColor, accidentals, instrument });
      else if (kind === 'pdf-charts') single ? await exportSetToPdf(chosen[0], songs, { includeChords: true, chordColor, accidentals, instrument })
                                              : await exportSetsToPdf(chosen, songs, { includeChords: true, chordColor, accidentals, instrument });
      else if (kind === 'json')  single ? exportSetJson(chosen[0], songs) : exportSetsJson(chosen, songs);
      else if (kind === 'setlist' && single) exportSetText(chosen[0], songs);
    } catch (err) {
      console.error('Set export failed:', err);
      alert(`Export failed: ${err?.message || err}`);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* In-app delete confirmation — replaces native confirm(), which is
          suppressed in the installed iOS PWA (so the delete never ran). */}
      {deleteConfirm && (() => {
        const n = deleteConfirm.ids.length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setDeleteConfirm(null)}>
            <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
              <div className="flex flex-col gap-1">
                <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Delete {n === 1 ? 'this set' : `${n} sets`}?</h2>
                <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Your songs stay in your library.</p>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={performDelete} className="w-full py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors">
                  {n === 1 ? 'Delete set' : `Delete ${n} sets`}
                </button>
                <button onClick={() => setDeleteConfirm(null)} className={`text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
      <div className={`px-3 py-2 border-b ${border} flex items-center justify-between shrink-0`}>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sets</span>
          <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">{visibleCount} {visibleCount === 1 ? 'set' : 'sets'}</span>
        </div>
        <div className="flex items-center gap-1">
          {user && (
            <RoundButton
              size={ROUND_SIZE_COMPACT}
              label="Pull a set from the cloud"
              title={presenting ? 'Not available while presenting' : 'Pull a set from the cloud'}
              fill={dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY_CHROME}
              disabled={presenting}
              onActivate={() => setPullDialog({ setId: null })}
            >
              <DownloadCloud size={18} />
            </RoundButton>
          )}
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
          <option value="shared">Shared</option>
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
                <ExportMenuItem label="PDF" onSelect={() => runSetsExport('pdf')} />
                <ExportMenuItem label="PDF + Chord Charts" onSelect={() => runSetsExport('pdf-charts')} />
                <ExportMenuItem label=".json" onSelect={() => runSetsExport('json')} />
                <ExportMenuItem
                  label="Setlist (.csv)"
                  disabled={selectedSets.size > 1}
                  title={selectedSets.size > 1 ? 'Setlist exports one set at a time' : undefined}
                  onSelect={() => runSetsExport('setlist')}
                />
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
        {selectMode ? (
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
        ) : user && (
          /* Sync-dot legend — sits in the same row as Export/Delete so it needs
             no extra vertical space. Matters most on iPad/iPhone, where the dots'
             hover tooltips are unreachable. */
          <div className="flex items-center gap-2.5 shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />republish</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />cloud newer</span>
          </div>
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

      <div ref={listRef} data-phone-scroll className="flex-1 overflow-y-auto overscroll-contain">
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
        {sets.length > 0 && visibleCount === 0 && (
          <p className="px-4 py-6 text-xs text-gray-400 dark:text-gray-600 text-center">
            {sharedOnly
              ? (setSearch.trim() ? 'No shared sets match your search.' : 'No shared sets yet. Publish a set, or paste a link someone shared with you.')
              : 'No sets match your search.'}
          </p>
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
                        <p className={`font-medium truncate ${isActive && !selectMode ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>{set.name}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-600">
                        {count} {count === 1 ? 'song' : 'songs'}
                        {isPublished && <span className="text-indigo-500 dark:text-indigo-400"> · Published</span>}
                      </p>
                    </div>
                    {/* Sync indicators — always visible (mutually exclusive). The
                        legend in the header row explains the colors. */}
                    {user && !selectMode && editingSetId !== set.id && isStale && (
                      <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" title="Local changes not yet published — republish to sync" />
                    )}
                    {user && !selectMode && editingSetId !== set.id && cloudAhead && (
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="A newer version is in the cloud — overwrite to update" />
                    )}
                    {/* Right-pointing arrow, to the LEFT of the actions menu. */}
                    {!selectMode && editingSetId !== set.id && (
                      <ChevronRight size={14} className={`shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-gray-300 dark:text-gray-700 group-hover:text-gray-500'}`} />
                    )}
                    {/* Actions menu. Cloud items appear only when signed in, and
                        are grayed until the set has been published at least once. */}
                    {!selectMode && editingSetId !== set.id && (
                      <span onClick={e => e.stopPropagation()}>
                        <RowMenu
                          dark={dark}
                          label={`Actions for ${set.name}`}
                          items={[
                            { id: 'rename', label: 'Rename', icon: SquarePen, onSelect: () => startRename(set) },
                            user && (isPublished
                              ? { id: 'unpub', label: 'Unpublish', icon: CloudOff, danger: true, onSelect: () => handleUnpublishClick(set) }
                              : { id: 'pub',   label: 'Publish',   icon: UploadCloud, onSelect: () => handlePublishClick(set) }),
                            user && { id: 'share',   label: 'Share',     icon: Share,         disabled: !isPublished, onSelect: () => setShareDialogSet(set) },
                            user && { id: 'over',    label: 'Overwrite', icon: DownloadCloud, danger: true, disabled: !isPublished || presenting, onSelect: () => setPullDialog({ setId: set.id }) },
                            user && { id: 'repub',   label: 'Republish', icon: UploadCloud,   disabled: !isPublished, onSelect: () => handlePublishClick(set) },
                            { id: 'dup', label: 'Duplicate', icon: Copy, onSelect: () => handleDuplicateSet(set) },
                          ]}
                        />
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })}

        {/* Under the Shared filter the bookmarks others sent me sit alongside my
            published sets rather than in their own section further down. */}
        {sharedOnly && sharedWithMeMatches.length > 0 && (
          <>
            {filtered.length > 0 && (
              <div className="px-3 pt-3 pb-1.5">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Shared with me</span>
              </div>
            )}
            {sharedWithMeMatches.map(share => (
              <div
                key={share.token}
                className={`flex items-center gap-2 px-3 py-3 border-b ${border} group transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/20`}
              >
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/shared/${share.token}`)}
                    className={`font-medium truncate block text-sm text-left w-full transition-colors ${dark ? 'text-gray-300 hover:text-indigo-400' : 'text-gray-700 hover:text-indigo-600'}`}
                  >
                    {share.setName || 'Shared set'}
                  </button>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">Shared with me</p>
                </div>
                <ExternalLink size={12} className={`shrink-0 ${dark ? 'text-gray-700' : 'text-gray-300'} group-hover:opacity-60 transition-opacity`} />
              </div>
            ))}
          </>
        )}

        {/* Shared with me. Always rendered: the paste box below is the only way
            into a shared set from an installed app, and a first-time recipient
            has no bookmarks yet. */}
        {(
          <div className={`border-t-2 ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            {/* Under the Shared filter the bookmarks are listed above with their
                own heading, so repeating it here would show it twice. The paste
                form below reads fine unlabelled. */}
            {!sharedOnly && (
              <div className={`flex items-center gap-2 px-3 pt-3 pb-1.5`}>
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Shared with me</span>
                {savedShares.length > 0 && (
                  <span className="text-xs text-gray-300 dark:text-gray-700">{savedShares.length}</span>
                )}
              </div>
            )}
            {(sharedOnly ? [] : savedShares).map(share => (
              <div
                key={share.token}
                className={`flex items-center gap-2 px-3 py-3 border-b ${border} group transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/20`}
              >
                <div className="flex-1 min-w-0">
                  {/* Router navigation, not an <a href>: a full page load in a
                      standalone iOS window gets handed to Safari, dropping the
                      user out of the installed app. */}
                  <button
                    type="button"
                    onClick={() => navigate(`/shared/${share.token}`)}
                    className={`font-medium truncate block text-sm text-left w-full transition-colors ${dark ? 'text-gray-300 hover:text-indigo-400' : 'text-gray-700 hover:text-indigo-600'}`}
                  >
                    {share.setName || 'Shared set'}
                  </button>
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

            {/* Open a shared link without leaving the app */}
            <form onSubmit={openSharedLink} className={`px-3 py-3 border-b ${border} flex flex-col gap-2`}>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={shareInput}
                  onChange={e => { setShareInput(e.target.value); if (shareErr) setShareErr(''); }}
                  placeholder="Paste a share link"
                  aria-label="Paste a share link"
                  aria-invalid={!!shareErr}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`flex-1 min-w-0 h-11 pointer-fine:h-9 px-2.5 text-sm rounded-lg border outline-none focus:border-indigo-500 transition-colors ${
                    shareErr ? 'border-red-500' : dark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
                <button
                  type="submit"
                  disabled={!shareInput.trim()}
                  className="h-11 pointer-fine:h-9 px-3 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shrink-0"
                >
                  Open
                </button>
              </div>
              {shareErr
                ? <p className="text-xs text-red-500">{shareErr}</p>
                : <p className="text-xs text-gray-400 dark:text-gray-600">
                    Opens a set someone shared with you, without leaving Cue.
                  </p>}
            </form>
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

      {/* "Unpublish before deleting" gate — a published (shared) set must be
          unpublished first, so deleting can't orphan a live share link. Custom
          in-app modal (never native confirm, which is suppressed in the PWA). */}
      {deleteBlockedDialog && (() => {
        const names   = deleteBlockedDialog.ids.map(id => sets.find(s => s.id === id)?.name).filter(Boolean);
        const many    = deleteBlockedDialog.ids.length > 1;
        const running = deleteBlockedDialog.phase === 'running';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => !running && setDeleteBlockedDialog(null)}>
            <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
              <div className="flex flex-col gap-1">
                <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Unpublish before deleting</h2>
                <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {many
                    ? 'These sets are shared. Unpublish them first, then you can delete them.'
                    : 'This set needs to be unpublished first before you can delete it.'}
                </p>
                {names.length > 0 && (
                  <p className={`text-sm font-medium mt-1 ${dark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {names.map(n => `"${n}"`).join(', ')}
                  </p>
                )}
                <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Unpublishing deactivates the share link. Your songs stay in your library.</p>
              </div>
              {deleteBlockedDialog.error && <p className="text-xs text-red-500">{deleteBlockedDialog.error}</p>}
              <div className="flex flex-col gap-2">
                <button
                  onClick={runGateUnpublish}
                  disabled={running}
                  className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-colors"
                >
                  {running ? 'Unpublishing…' : (many ? 'Unpublish sets' : 'Unpublish')}
                </button>
                <button
                  onClick={() => setDeleteBlockedDialog(null)}
                  disabled={running}
                  className={`text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

    </div>
  );
}

// ---- Setlist column (right) -------------------------------------------------

// One setlist row, wired for dnd-kit sortable reorder. The GripVertical handle
// is the drag activator (listeners live on it, not the row) so tapping the rest
// of the row still selects/opens the song. The handle carries touch-action:none
// and user-select:none so iOS Safari initiates a drag instead of scrolling /
// highlighting text. Handle only renders in custom sort mode.
function SortableSongRow({ song, idx, draggable, isSelected, isOver, onSelect, onPresent, onEdit, onRemove, dark }) {
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
      {effectiveKey(song) && <span className="text-base text-indigo-500 dark:text-indigo-400 font-mono shrink-0" title={effectiveKey(song) !== (song.metadata?.key || '').trim() ? `Played in ${effectiveKey(song)} (written ${song.metadata?.key})` : undefined}>{effectiveKey(song)}</span>}
      <span onClick={e => e.stopPropagation()}>
        <RowMenu
          dark={dark}
          label={`Actions for ${song.metadata?.title || 'Untitled'}`}
          items={[
            { id: 'pres', label: 'Present', icon: Tv,       onSelect: onPresent },
            { id: 'edit', label: 'Edit',    icon: SquarePen, onSelect: onEdit },
            { id: 'del',  label: 'Delete',  icon: Trash2, danger: true, onSelect: onRemove },
          ]}
        />
      </span>
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
          {/* Present / Edit now live in each row's ⋮ menu. */}
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

      <div data-phone-scroll className="flex-1 overflow-y-auto">
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
                dark={dark}
                draggable={sortMode === 'custom'}
                isSelected={song.id === selectedSongId}
                isOver={sortMode === 'custom' && song.id === overId && song.id !== selectedSongId}
                onSelect={() => selectSong(song.id)}
                onPresent={() => onPresent?.(displaySongs, idx)}
                onEdit={() => onEdit?.(song, idx, displaySongs)}
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
  const { theme, updatePref, chordColor, accidentals, instrument } = usePrefs();
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
  const [addToSetOpen, setAddToSetOpen] = useState(false); // create/select-target dialog
  const [newSetName, setNewSetName]     = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSetId, setActiveSetId] = useState(() => sessionStorage.getItem('cue:active_set_id') || null);
  const [setsSelectMode, setSetsSelectMode] = useState(false); // mirrors SetsColumn select mode

  // ---- Portrait single-panel mode --------------------------------------------
  // `stacked` (any portrait phone OR tablet) drives the one-panel-at-a-time
  // layout and its selector; desktop and any landscape device render as before.
  // `isPhonePortrait` (phone width only) still gates the phone-only header
  // cosmetics, which a roomier iPad portrait header does not need.
  const stacked = usePortraitPanels();
  const isPhonePortrait = useIsPhonePortrait();
  const [phonePanel, setPhonePanel] = useState(loadPhonePanel);
  useEffect(() => {
    try { localStorage.setItem(PHONE_PANEL_KEY, phonePanel); } catch { /* ignore */ }
  }, [phonePanel]);

  // Each panel scrolls in its own element, marked data-phone-scroll. The Library
  // column has TWO (artist list vs song list) but only ever renders one, so a
  // query scoped to the active panel resolves whichever is live.
  const layoutRef = useRef(null);
  const getPhoneScrollEl = () => (
    stacked
      ? layoutRef.current?.querySelector(`[data-phone-panel="${phonePanel}"] [data-phone-scroll]`) ?? null
      : null
  );
  const pillHidden = useAutoHideOnScroll(getPhoneScrollEl, `${stacked}:${phonePanel}`);

  // Give the live scroller room to clear the pill. Applied to the element rather
  // than via props so SetsColumn/SetlistColumn keep their existing APIs.
  useEffect(() => {
    const el = getPhoneScrollEl();
    if (!el) return;
    const prev = el.style.paddingBottom;
    el.style.paddingBottom = PILL_CLEARANCE;
    return () => { el.style.paddingBottom = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stacked, phonePanel, sortBy, artistFilter, search, sets.length, songs.length]);

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
      normSearch(effectiveKey(s)).includes(q)
    );
  });

  const artistFiltered = artistFilter !== null ? filtered.filter(s => (s.metadata?.artist || '') === artistFilter) : filtered;
  const keyFiltered    = keyFilter ? artistFiltered.filter(s => effectiveKey(s) === keyFilter) : artistFiltered;
  // 'shared' narrows rather than reorders, exactly like the Sets panel: only
  // songs copied in from a shared set (which carry copiedFrom) are shown.
  const sharedFiltered = sortBy === 'shared' ? keyFiltered.filter(s => !!s.copiedFrom) : keyFiltered;

  const sorted = [...sharedFiltered].sort((a, b) => {
    if (sortBy === 'title')  return (a.metadata?.title  || '').localeCompare(b.metadata?.title  || '');
    if (sortBy === 'newest') return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    if (sortBy === 'oldest') return (a.updatedAt || '').localeCompare(b.updatedAt || '');
    if (sortBy === 'artist') return (a.metadata?.artist || '').localeCompare(b.metadata?.artist || '');
    if (sortBy === 'key')    return effectiveKey(a).localeCompare(effectiveKey(b));
    // 'shared' has no ordering of its own — list alphabetically, the library's
    // default, so the filtered set reads like the normal list, just narrowed.
    if (sortBy === 'shared') return (a.metadata?.title || '').localeCompare(b.metadata?.title || '');
    return 0;
  });

  const uniqueKeys = [...new Set(songs.map(effectiveKey).filter(Boolean))].sort((a, b) => a.localeCompare(b));

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
    const newId = await saveSong({
      id: null,
      metadata: { ...song.metadata, title: (song.metadata?.title || 'Untitled') + ' (Copy)' },
      text: song.text,
      chordStyle: song.chordStyle,
      diagramScale: song.diagramScale,
      chordPrefs: song.chordPrefs,
      displayKey: song.displayKey,
      type: song.type,
      pedalActive: song.pedalActive,
      pdf: song.pdf,
    });
    // A pdf song's bytes live in a separate local store — copy them to the new id
    // so the duplicate renders. (Stage 1a: purely local.)
    if (song.type === 'pdf') {
      const blob = await loadPdfBlob(song.id);
      if (blob) await savePdfBlob(newId, blob);
    }
    onRefresh();
  }

  // Retry a failed PDF upload from the library row (the persistent counterpart to
  // the publish dialog's retry). Clears the amber warning on success.
  async function handleRetryPdf(song) {
    if (!user?.id) { alert('Sign in to upload PDFs to the cloud.'); return; }
    try {
      await uploadPdfBlob(song.id, user.id);
      await setPdfUploaded(song.id, true);
    } catch (err) {
      console.error('Retry PDF upload failed:', err);
      await setPdfUploaded(song.id, false);
      alert('PDF upload failed again. Check your connection and try once more.');
    }
    onRefresh();
  }

  function toggleSelectMode() { setSelectMode(v => !v); setSelected(new Set()); }
  function toggleSelect(id) {
    // Outside Select mode a tap highlights the row (light blue) so the user can
    // see what they touched; the ⋮ menu carries the actions. Tapping the same
    // row again clears it. In Select mode the tap drives the multi-select set
    // (export / delete) as before.
    if (!selectMode) {
      setHighlightedSongId(prev => {
        const next = prev === id ? null : id;
        if (next) sessionStorage.setItem('cue:lib_highlighted_id', next);
        else sessionStorage.removeItem('cue:lib_highlighted_id');
        return next;
      });
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll()   { setSelected(new Set(sorted.map(s => s.id))); }
  function deselectAll() { setSelected(new Set()); }

  // Add the given song ids to a set by id, skipping any already present and
  // reporting the outcome. Alerts on success and on partial/duplicate.
  async function addIdsToSet(setId, ids) {
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    const already = ids.filter(id => set.songIds.includes(id));
    const newIds  = ids.filter(id => !set.songIds.includes(id));
    const titleOf = id => songs.find(s => s.id === id)?.metadata?.title || 'That song';

    if (!newIds.length) {
      alert(already.length === 1
        ? `"${titleOf(already[0])}" is already in "${set.name}".`
        : `All ${already.length} selected songs are already in "${set.name}".`);
      return;
    }

    await saveSet({ ...set, songIds: [...set.songIds, ...newIds] });
    onRefresh();

    const base = `Added ${newIds.length} ${newIds.length === 1 ? 'song' : 'songs'} to "${set.name}".`;
    alert(already.length
      ? `${base} ${already.length} already there ${already.length === 1 ? 'was' : 'were'} skipped.`
      : base);
  }

  // Toolbar "Add to Set": ALWAYS open the picker so the destination is the set
  // the user explicitly taps for THIS action — never a silent fallback to
  // activeSetId or any other ambient selection. Those ambient sources can
  // disagree with what the user sees selected (the Sets-column highlight vs the
  // Setlist panel), which silently added songs to the wrong (previous) set.
  function handleAddSelectedToSet() {
    if (selected.size === 0) return;
    setNewSetName('');
    setAddToSetOpen(true);
  }

  async function addSelectedToSetId(setId) {
    const ids = [...selected];
    await addIdsToSet(setId, ids);
    setSelected(new Set());
    setSelectMode(false);
    setAddToSetOpen(false);
  }

  // Create a new set from the current selection (via the dialog), select it, and
  // exit select mode.
  async function createSetAndAddSelected() {
    const name = newSetName.trim();
    if (!name) return;
    const ids = [...selected];
    const saved = await saveSet({ id: null, name, songIds: ids, sortMode: 'custom' });
    setActiveSetId(saved.id);
    onRefresh();
    setSelected(new Set());
    setSelectMode(false);
    setAddToSetOpen(false);
    alert(`Created "${name}" with ${ids.length} ${ids.length === 1 ? 'song' : 'songs'}.`);
  }

  // Success feedback (incl. the silent export-folder path) is centralized in
  // saveFilePicker; here we only surface a failure so it isn't silent.
  async function handleBackup() {
    try { await exportBackup(); }
    catch (err) { alert(`Backup failed: ${err?.message || err}`); }
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

  async function handleExportSelectedPdf(includeChords = false) {
    const selectedSongs = sorted.filter(s => selected.has(s.id));
    if (selectedSongs.length === 0) return;
    setExportDropOpen(false);
    setSelected(new Set());
    setSelectMode(false);
    try {
      if (selectedSongs.length === 1) {
        const s = selectedSongs[0];
        // Same render lens as the set PDF: transpose to the song's saved View Key.
        await exportToPdf(s, { displayKey: s.displayKey, includeChords, chordColor, accidentals, instrument });
      } else {
        // Multiple selected → one combined PDF, via a one-off synthesized set.
        await exportSetToPdf({ name: 'Songs', songIds: selectedSongs.map(s => s.id) }, songs, { includeChords, chordColor, accidentals, instrument });
      }
    } catch (err) {
      console.error('PDF export failed:', err);
      alert(`Export failed: ${err?.message || err}`);
    }
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
    const next = id === activeSetId ? null : id;
    setActiveSetId(next);
    // Phone portrait shows one panel at a time: picking a set navigates to it.
    // Routed through the same setter as the pill, so there's one switching path.
    if (next) setPhonePanel('setlist');
  }

  const allVisibleSelected = sorted.length > 0 && sorted.every(s => selected.has(s.id));

  const border    = 'border-gray-200 dark:border-gray-800';
  const btnBorder = `border ${dark ? 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400'}`;

  return (
    <div className={`h-dvh flex flex-col ${dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      {/* px-4 in phone portrait: removing the mark left only ~1px of slack at
          390px, which a 375pt device would still overflow. */}
      <header className={`${isPhonePortrait ? 'px-4' : 'px-6'} py-4 border-b ${border} flex items-center justify-between shrink-0`}>
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            {/* The mark costs icon + gap of header width, which iPhone portrait
                can't spare. The wordmark alone still identifies the app. Restored
                at every larger width — including iPhone landscape, which is above
                the hook's 767px breakpoint, so no orientation check is needed. */}
            {!isPhonePortrait && <Music size={28} className="text-indigo-400" />}
            <h1 className="text-3xl font-bold tracking-tight leading-none">Cue</h1>
          </div>
          {/* App version, sourced from package.json at build time. Tells the user
              which release is running — useful for a cached/offline copy. */}
          <span className="mt-1 text-[10px] leading-none font-mono text-gray-400 dark:text-gray-600 tabular-nums">
            v{import.meta.env.VITE_APP_VERSION}
          </span>
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
                <RoundButton size={ROUND_SIZE_ACTION} pill label="Backup" title="Backup" fill={headerFill} onActivate={handleBackup}>
                  <Archive size={18} /><PillLabel>Backup</PillLabel>
                </RoundButton>
              </>
            );
          })()}
        </div>
      </header>

      {/* Body — three columns */}
      <div ref={layoutRef} className="flex-1 min-h-0 flex overflow-hidden">

        {/* Column 1: Library */}
        <div
          data-onboard="songs-panel"
          data-phone-panel="library"
          className={stacked
            ? (phonePanel === 'library' ? 'w-full min-w-0 min-h-0 flex flex-col overflow-hidden' : 'hidden')
            : `flex-1 min-w-0 min-h-0 flex flex-col border-r ${border} overflow-hidden`}
        >
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
              <option value="shared">Shared</option>
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
                    <ExportMenuItem px="px-4" label="PDF" onSelect={() => handleExportSelectedPdf(false)} />
                    <ExportMenuItem px="px-4" label="PDF + Chord Charts" onSelect={() => handleExportSelectedPdf(true)} />
                    <ExportMenuItem px="px-4" label=".json" onSelect={handleExportSelectedJson} />
                    <ExportMenuItem px="px-4" label={selected.size === 1 ? 'ChordPro (.cho)' : 'ZIP (.cho files)'} onSelect={handleExportSelected} />
                  </div>
                </>
              )}
            </div>
            {/* Add the selected songs to a set. Active in Select mode with a
                selection; if no set is selected, opens a create/select dialog. */}
            <HeaderPill
              dark={dark} icon={ListPlus} label="Add to Set"
              title="Add selected songs to a set"
              disabled={!selectMode || selected.size === 0}
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
            <div data-phone-scroll className="flex-1 overflow-y-auto">
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
            <div data-phone-scroll className="flex-1 overflow-y-auto">
              {songs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                  <Music size={32} className="text-gray-300 dark:text-gray-700" />
                  <p className="text-gray-400 dark:text-gray-500 text-sm">No songs yet.<br />Create a new song or import a .cho file.</p>
                </div>
              )}
              {songs.length > 0 && sorted.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-600 text-center">
                  {sortBy === 'shared'
                    ? (search.trim() ? 'No shared songs match your search.' : 'No shared songs yet. Copy a song from a set someone shared with you.')
                    : 'No songs match your search.'}
                </p>
              )}
              {sorted.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  dark={dark}
                  onOpen={() => {
                    setSelected(new Set());
                    setHighlightedSongId(null);
                    sessionStorage.removeItem('cue:lib_highlighted_id');
                    if (onOpenSongFromList) onOpenSongFromList(song, idx, sorted);
                    else onOpenSong(song);
                  }}
                  onPresent={s => onPresent?.([s], 0)}
                  onDuplicate={handleDuplicate}
                  onRetryPdf={handleRetryPdf}
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
        <div
          data-onboard="sets-panel"
          data-phone-panel="sets"
          className={stacked
            ? (phonePanel === 'sets' ? 'w-full min-w-0 min-h-0 flex flex-col overflow-hidden' : 'hidden')
            : `flex-1 min-w-0 min-h-0 flex flex-col border-r ${border} overflow-hidden`}
        >
          <SetsColumn
            sets={sets}
            songs={songs}
            activeSetId={activeSetId}
            onSelectSet={handleSelectSet}
            onRefresh={onRefresh}
            onSelectModeChange={setSetsSelectMode}
            isPublished={id => !!publishedSets[id]}
            onDeleteBlocked={ids => setDeleteBlockedDialog({ ids, phase: 'confirm', error: '' })}
            presenting={presenting}
            border={border}
          />
        </div>

        {/* Column 3: Setlist */}
        <div
          data-onboard="setlist-panel"
          data-phone-panel="setlist"
          className={stacked
            ? (phonePanel === 'setlist' ? 'w-full min-w-0 min-h-0 flex flex-col overflow-hidden' : 'hidden')
            : `flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden`}
        >
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

      {/* Floating panel switcher — iPhone portrait only, and never over Present.
          z-30 sits above panel content but below the modal/dialog layer (z-50). */}
      {stacked && !presenting && (
        <div
          className="fixed left-1/2 z-30 [transition:transform_220ms_ease,opacity_160ms_ease] motion-reduce:[transition:none]"
          style={{
            bottom: 'calc(8px + env(safe-area-inset-bottom))',
            transform: pillHidden ? 'translateX(-50%) translateY(calc(100% + 16px))' : 'translateX(-50%)',
            opacity: pillHidden ? 0 : 1,
            pointerEvents: pillHidden ? 'none' : undefined,
          }}
        >
          <SegmentedControl
            ariaLabel="Panel"
            options={[
              { id: 'library', label: 'Library' },
              { id: 'sets',    label: 'Sets' },
              { id: 'setlist', label: 'Setlist' },
            ]}
            value={phonePanel}
            onChange={setPhonePanel}
            size="lg"
            fullWidth={false}
            translucent
            segmentPadX={18}
          />
        </div>
      )}

      {showTour && <OnboardingTour onDone={finishTour} />}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Add-to-Set target picker — shown when the toolbar button is used with no
          set selected. Create a new set from the selection, or add to an existing. */}
      {addToSetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setAddToSetOpen(false)}>
          <div
            className={`w-80 max-h-[80vh] rounded-2xl shadow-2xl p-5 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
                Add {selected.size} {selected.size === 1 ? 'song' : 'songs'} to a set
              </h2>
              <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Create a new set or choose an existing one.</p>
            </div>

            {/* Create new */}
            <form
              onSubmit={e => { e.preventDefault(); createSetAndAddSelected(); }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={newSetName}
                onChange={e => setNewSetName(e.target.value)}
                placeholder="New set name"
                className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 ${dark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
              />
              <button
                type="submit"
                disabled={!newSetName.trim()}
                className="px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors whitespace-nowrap"
              >
                Create
              </button>
            </form>

            {sets.length > 0 && (
              <>
                <div className={`text-xs uppercase tracking-wide ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Or add to existing</div>
                <div className={`flex-1 overflow-y-auto -mx-1 rounded-lg border ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
                  {sets.map(set => (
                    <button
                      key={set.id}
                      onClick={() => addSelectedToSetId(set.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${dark ? 'text-gray-200 hover:bg-gray-800 active:bg-gray-700' : 'text-gray-800 hover:bg-gray-100 active:bg-gray-200'}`}
                    >
                      <span className="truncate">{set.name}</span>
                      <span className={`text-xs shrink-0 tabular-nums ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{set.songIds.length} {set.songIds.length === 1 ? 'song' : 'songs'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              onClick={() => setAddToSetOpen(false)}
              className={`w-full py-2 text-sm rounded-lg transition-colors ${dark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
