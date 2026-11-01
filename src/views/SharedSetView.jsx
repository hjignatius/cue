import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullSpinner from '../components/PullSpinner.jsx';
import { getSharedSet, describeCloudError } from '../lib/cloud.js';
import { downloadPdfBlob } from '../lib/pdfSync.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { saveSong, saveSet, loadSongs, loadSets, loadPdfBlob, savePdfBlob, loadBooks, saveBookChoice, cacheSharedSet, loadCachedSharedSet, sharePlayMineKey, forgetShareState } from '../utils/storage.js';
import { mergeTaggedSongCustoms } from '../utils/fileIO.js';
import { loadSavedShares, persistSavedShares, syncBookmark } from '../utils/sharedBookmarks.js';
import { contentHash, contentDiffFields, isEditedCopy, normalizeTitle } from '../utils/contentHash.js';
import { loadAnnotatedSongIds, flushAllAnnotationQueues } from '../utils/annotations.js';
import PresentationView from './PresentationView.jsx';
import { Bookmark, BookmarkCheck, Library, Settings, Tv, Copy, Check, UserCheck, CloudOff, Award, ArrowDownAZ, ChevronLeft, Plus, Download, Cloud, CloudDownload, Equal, EqualNot, ArrowLeft, ArrowRight, ArrowLeftRight } from 'lucide-react';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY_CHROME, ROUND_SIZE_ACTION, ROUND_SIZE_COMPACT, GLASS, MIN_TOUCH_TARGET } from '../components/RoundButton.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { useIsNarrow } from '../hooks/useIsNarrow.js';
import { dismissOnOutside } from '../utils/overlayDismiss.js';
import InstallTips from '../components/InstallTips.jsx';
import BookChoice, { startBook, bookChoice } from '../components/BookChoice.jsx';

// A shared song carries the publisher's book, if it had one; never ours. Spread
// after it so saveSong leaves the book alone (books.js).
const NO_BOOK = { bookId: undefined, mine: undefined };

// Blue is kept for one thing in this window: something newer in the share
// (the set's Update button, a row's cloud with a down-arrow). Howard,
// 2026-11-01 — before, amber meant three different things here.
const SHARE_NEWER = '#2563eb';

// Visible label inside a RoundButton pill (white via RoundButton's text-white).
function PillLabel({ children }) {
  return <span className="text-sm font-medium leading-none whitespace-nowrap">{children}</span>;
}

// The Cue app icon — indigo rounded square, a white "C" arc and the 2 of Cue²
// inside it, matching public/cue-icon.svg (the home-screen mark; both come from
// scripts/makeIcons.mjs). Inlined as SVG so it stays crisp
// at small sizes, needs no asset load, and works offline. Its own indigo fill
// reads on both light and dark headers.
function CueMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Cue" className="shrink-0 block">
      <rect width="100" height="100" rx="23" fill="#4f46e5" />
      <path d="M69.284 27.019 A30 30 0 1 0 69.284 72.981" fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" />
      <path transform="translate(38.413 62.5) scale(0.016447 -0.016447)" d="M590 283L1247 283L1247 0L162 0L162 283L707 764Q780 830 815 893Q850 956 850 1024Q850 1129 779.5 1193Q709 1257 592 1257Q502 1257 395 1218.5Q288 1180 166 1104L166 1432Q296 1475 423 1497.5Q550 1520 672 1520Q940 1520 1088.5 1402Q1237 1284 1237 1073Q1237 951 1174 845.5Q1111 740 909 563Z" fill="#ffffff" />
    </svg>
  );
}

// Viewer-local key overrides from earlier versions: stored in localStorage, never
// written to any Supabase table. The shared view no longer offers a picker, but
// any previously-stored override still applies and shows in the read-only View key.
const VIEWER_KEYS_KEY = 'cue:viewer_keys';
function loadViewerKeys() {
  try { return JSON.parse(localStorage.getItem(VIEWER_KEYS_KEY) || '{}'); } catch { return {}; }
}

// Shared-with-me bookmarks live in utils/sharedBookmarks.js — one copy, read
// by this view and by the Library list that shows the same rows.

// Tokens whose landing gate the viewer has already passed on this device, so a
// repeat visit (or a bookmarked set) goes straight to the songs instead of the
// follow-vs-save chooser.
const CONTINUED_KEY = 'cue:shared_continued';
function loadContinued() { try { return new Set(JSON.parse(localStorage.getItem(CONTINUED_KEY) || '[]')); } catch { return new Set(); } }
function markContinued(tok) {
  const s = loadContinued(); s.add(tok);
  try { localStorage.setItem(CONTINUED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

// ---- Title-based duplicate helpers -------------------------------------------

// Returns Map<normalizedTitle, localSong> from the user's library.
function buildTitleMap(localSongs) {
  const map = new Map();
  for (const s of localSongs) {
    const key = normalizeTitle(s.metadata?.title);
    if (key && !map.has(key)) map.set(key, s);
  }
  return map;
}

// A copied PDF hasn't been uploaded to the COPIER's cloud yet, so drop the
// source's `uploaded` flag (leaving it undefined) rather than setting it false.
// Undefined behaves like a fresh import — no "didn't upload" warning in the
// Library — and publish still uploads it (its guard is `uploaded !== true`).
function pdfRefForCopy(pdf) {
  if (!pdf) return pdf;
  const { uploaded, ...rest } = pdf; // eslint-disable-line no-unused-vars
  return rest;
}

// Find the lowest available "(N)" suffix so the new title is unique.
function makeUniqueTitle(baseTitle, existingTitlesSet) {
  const cleanBase = (baseTitle || 'Untitled').replace(/ \(\d+\)$/, '');
  let n = 2;
  while (existingTitlesSet.has(normalizeTitle(`${cleanBase} (${n})`))) n++;
  return `${cleanBase} (${n})`;
}


// ---- Main component ----------------------------------------------------------

export default function SharedSetView() {
  const { token }       = useParams();
  const navigate        = useNavigate();
  const location        = useLocation();
  // Opened via the Sets panel "Paste a share link" box → an explicit catalog
  // intent, so we auto-bookmark it and skip the follow-vs-save landing gate.
  const autoSave        = !!location.state?.autoSave;
  const { theme } = usePrefs();
  const dark = theme === 'dark';

  const [status, setStatus]         = useState('loading'); // loading | ok | not_found | error
  const [loadError, setLoadError]   = useState(null);      // the error behind status==='error'
  const [setData, setSetData]       = useState(null);      // { set, songs }
  const [presenting, setPresenting] = useState(null);      // { songs, startIndex }
  const [retryCount, setRetryCount] = useState(0);
  const reloadDone = useRef(null);

  // Pull the list down to fetch the share again. Until now the only way to see a
  // change the publisher had made was to leave the page and come back — the view
  // loads once per token and nothing re-checked while you sat on it.
  //
  // Resolves when the reload settles, so the spinner reflects the request rather
  // than a fixed delay. The timeout is a backstop: if the effect somehow does not
  // run, a spinner that never stops is worse than one that gives up.
  const pullRefresh = useCallback(() => new Promise((resolve) => {
    const finish = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(finish, 15000);
    reloadDone.current = finish;
    setRetryCount((c) => c + 1);
  }), []);
  const { ref: ptrRef, pull: ptrPull, refreshing: ptrRefreshing } = usePullToRefresh(pullRefresh);
  const [viewerKeys] = useState(loadViewerKeys);

  // Bookmark state
  const [savedShares, setSavedShares] = useState(loadSavedShares);
  const isBookmarked = savedShares.some(s => s.token === token);

  // Landing gate: shown on a fresh open so the viewer can choose "follow along
  // here" vs "copy the code to save in my own Cue". Skipped once passed on this
  // device, or if the set is already bookmarked.
  const [gatePassed, setGatePassed] = useState(() => loadContinued().has(token));
  const [copiedCode, setCopiedCode] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  function copyCode() {
    if (!token) return;
    navigator.clipboard.writeText(token).then(() => { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); });
  }
  function continueToSet() { markContinued(token); setGatePassed(true); }

  // Copy-to-library state
  const [copying, setCopying]           = useState(false);
  const [copyResult, setCopyResult]     = useState(null);  // { type, ... }
  const [hasCopied, setHasCopied]       = useState(false); // true once any copy/duplicate succeeds
  const [conflictDialog, setConflictDialog] = useState(null); // { conflicts, resolve } | null
  const [bookAsk, setBookAsk] = useState(null); // { records, book, resolve } | null — Copy set's book choice

  // Local library snapshot — powers the Copy / Up to date / Update button and the
  // Update list. Reloaded whenever the share loads or after a copy/update.
  const [localSongs, setLocalSongs] = useState([]);
  const [localSets, setLocalSets]   = useState([]);
  const [localBooks, setLocalBooks] = useState([]);
  const [updateDialog, setUpdateDialog] = useState(null); // null | { choices } — the Update list
  // WHICH VERSION EACH SONG PLAYS, chosen per song rather than for the set.
  //
  // One switch for the whole set could not say the thing people actually want —
  // "follow the share except the two I marked up" — so it is gone. This is a map
  // of share-song id -> true meaning "play mine". Absent means the share's.
  //
  // Kept against the TOKEN, because it is a fact about this share rather than
  // about the library, and it goes when the bookmark goes.
  const PLAY_MINE_KEY = sharePlayMineKey(token);
  const [playMineIds, setPlayMineIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(PLAY_MINE_KEY) || '[]')); }
    catch { return new Set(); }
  });
  const setPlayMinePersisted = useCallback((next) => {
    setPlayMineIds(next);
    try { localStorage.setItem(PLAY_MINE_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
  }, [PLAY_MINE_KEY]);

  // Songs carrying ink, by LOCAL id. Ink lives in its own store keyed by song id,
  // so this is the only way to know a copy has marks on it.
  const [inkedIds, setInkedIds] = useState(() => new Set());

  // Re-read after Present, and wait for the write first.
  //
  // THE SAME SHAPE AS THE LIBRARY'S INK BADGE, and I did not carry the fix
  // across. Present renders OVER this page rather than in place of it, so the
  // view never unmounts and a one-shot load on mount is the last word it ever
  // hears. Howard cleared a song's annotations in Present, came back, and the
  // row still showed amber with a pencil — it only corrected itself after a trip
  // through the Library, which is exactly the tell from last week.
  //
  // Flushed first because ink saves through a queue: the moment this most needs
  // to be right is the moment the delete is still in flight.
  const reloadInked = useCallback(() => {
    flushAllAnnotationQueues()
      .then(() => loadAnnotatedSongIds())
      .then(setInkedIds)
      .catch(() => {});
  }, []);
  useEffect(() => { reloadInked(); }, [token, reloadInked]);
  const [sortMode, setSortMode] = useState('custom');     // view-only: publisher order ('custom') vs alphabetical ('alpha')
  // Non-null when what's on screen came from the offline cache rather than the
  // cloud — carries the date it was last fetched, which the banner shows.
  const [cachedAt, setCachedAt] = useState(null);
  // "today" / "yesterday" / a short date — more useful on a stand than an ISO
  // timestamp, and it answers the only question that matters: how stale is this?
  const formatCachedAt = (iso) => {
    const then = new Date(iso);
    if (isNaN(then)) return 'earlier';
    const days = Math.floor((Date.now() - then.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return `on ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  };
  // Coming back from Present: the ink may have changed while this page sat
  // underneath it, and the local copies may have too.
  useEffect(() => {
    if (!presenting) reloadInked();
  }, [presenting, reloadInked]);

  const refreshLocal = useCallback(async () => {
    try { setLocalSongs(await loadSongs()); setLocalSets(await loadSets()); setLocalBooks(await loadBooks()); } catch { /* offline / no db */ }
  }, []);
  useEffect(() => { if (status === 'ok' && setData) refreshLocal(); }, [status, setData, hasCopied, refreshLocal]);

  // Leave prompt: shown when navigating away before bookmarking/copying
  const [leavePrompt, setLeavePrompt] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setSetData(null);
    setCachedAt(null);

    // Show a previously loaded copy of this share. Returns true if it managed to.
    async function showCached() {
      const hit = await loadCachedSharedSet(token);
      if (cancelled || !hit) return false;
      const songs = (hit.data.songs ?? []).map(row => row.content ?? row);
      setSetData({ set: hit.data.set, songs });
      setCachedAt(hit.cachedAt);
      setStatus('ok');
      return true;
    }

    async function load() {
      // Plainly offline: go straight to the cache rather than making someone
      // watch a 20-second timeout to be told what we already know. This is the
      // reported case — arriving at a venue assuming the wifi had connected.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (await showCached()) return;
      }
      try {
        const data = await getSharedSet(token);
        if (cancelled) return;
        if (!data) { setStatus('not_found'); return; }
        const songs = (data.songs ?? []).map(row => row.content ?? row);
        setSetData({ set: data.set, songs });
        setCachedAt(null);
        setStatus('ok');
        // Keep a copy for the next time there's no signal. Fire and forget —
        // a cache write must never delay or break showing the set.
        cacheSharedSet(token, data);
        // Stage 2: fetch the bytes for any pdf songs so they render in Present.
        // The published content carries `ownerId`, and the additive Storage read
        // policy lets a shared viewer read {owner}/{songId}.pdf for a published set.
        // Background + fail-soft — the set shows now; a miss leaves the placeholder.
        for (const song of songs) {
          if (cancelled || song?.type !== 'pdf' || !song.id) continue;
          if (!song.ownerId) {
            console.warn('[SharedSetView] pdf song has no ownerId — re-publish the set so its content carries it', song.id);
            continue;
          }
          downloadPdfBlob(song.id, song.ownerId)
            .catch(err => console.warn('[SharedSetView] pdf download failed', `${song.ownerId}/${song.id}.pdf`, err?.message || err));
        }
      } catch (err) {
        if (cancelled) return;
        console.error('SharedSetView:', err);
        const msg = err?.message ?? '';
        if (msg.includes('not found') || msg.includes('invalid') || msg.includes('revoked')) {
          // A revoked or bad token is authoritative — do NOT fall back to a
          // cached copy of a share that has since been withdrawn.
          setStatus('not_found');
        } else if (await showCached()) {
          // Couldn't reach the cloud, but we've seen this share before.
          console.warn('[SharedSetView] showing the cached copy —', msg);
        } else {
          setLoadError(err);
          setStatus('error');
        }
      }
    }
    // Let a caller WAIT for the reload. Pull-to-refresh needs to hold its spinner
    // until the share has actually come back, and bumping retryCount on its own
    // says nothing about when that happened.
    load().finally(() => {
      if (cancelled) return;
      const done = reloadDone.current;
      reloadDone.current = null;
      done?.();
    });
    return () => { cancelled = true; };
  }, [token, retryCount]);

  // When the set loads OK, bring this token's bookmark up to date.
  //
  // The NAME matters as much as the timestamp. A publisher can rename a set and
  // republish to the same link, and the row in Sets -> Shared with me kept the
  // name captured the day it was bookmarked — so opening the link showed the new
  // name while the list that sent you there still showed the old one.
  useEffect(() => {
    if (status !== 'ok') return;
    const shares = loadSavedShares();
    const next = syncBookmark(shares, token, { liveName: setData?.set?.name || '', cachedAt });
    if (!next) return;
    persistSavedShares(next);
    setSavedShares(next);
  }, [status, token, cachedAt, setData]);

  // Auto-bookmark when opened from the "Paste a share link" box (catalog intent),
  // so the set shows up under Sets → Shared with me without a manual bookmark tap.
  useEffect(() => {
    if (status === 'ok' && setData && autoSave && !isBookmarked) handleSaveBookmark();
  }, [status, setData, autoSave, isBookmarked]); // eslint-disable-line react-hooks/exhaustive-deps

  function songsWithViewerKeys(songs) {
    return songs.map(s => ({ ...s, displayKey: viewerKeys[s.id] || s.displayKey || '' }));
  }

  // ---- Bookmark actions -------------------------------------------------------

  function handleSaveBookmark() {
    const now = new Date().toISOString();
    const shares = loadSavedShares();
    if (shares.some(s => s.token === token)) return;
    const updated = [...shares, { token, setName: setData?.set?.name || '', savedAt: now, lastLoadedAt: now }];
    persistSavedShares(updated);
    setSavedShares(updated);
  }

  function handleRemoveBookmark() {
    const updated = loadSavedShares().filter(s => s.token !== token);
    persistSavedShares(updated);
    setSavedShares(updated);
    // The share goes and its choices go with it — which version each song plays
    // is a fact about this share, not about the library.
    forgetShareState(token);
    setPlayMineIds(new Set());
  }

  // Navigate to the main app. Prompt to save if not yet bookmarked/copied.
  function handleOpenCue() {
    if (status !== 'ok' || isBookmarked || hasCopied) {
      navigate('/');
    } else {
      setLeavePrompt(true);
    }
  }

  // ---- Conflict dialog (Promise-based) ----------------------------------------

  // Shows the conflict dialog and returns a Promise that resolves with:
  //   { [cloudSongId]: 'duplicate' | 'skip' }  when user clicks Proceed
  //   null                                       when user cancels
  function askConflicts(conflicts) {
    return new Promise(resolve => setConflictDialog({ conflicts, resolve }));
  }

  // ---- Copy-to-library actions ------------------------------------------------

  async function handleCopySong(song) {
    if (copying) return;
    setCopying(true);
    try {
      const localSongs = await loadSongs();
      const title      = song.metadata?.title || 'Untitled';

      // Already copied from this exact source (matched by provenance): treat as a
      // no-op, same as a title-skip — nothing new is added.
      if (localSongs.some(ls => ls.copiedFrom?.songId === song.id)) {
        setCopyResult({ type: 'song', title, outcome: 'skipped' });
        return;
      }

      const titleMap   = buildTitleMap(localSongs);
      const titleKey   = normalizeTitle(song.metadata?.title);
      const hasConflict = titleMap.has(titleKey);

      let outcome = 'copied';
      let newTitle = title;

      if (hasConflict) {
        const choices = await askConflicts([{ cloudSong: song, localSong: titleMap.get(titleKey) }]);
        setConflictDialog(null);
        if (choices === null) return; // cancelled
        outcome = choices[song.id] ?? 'skip';
      }

      const now = new Date().toISOString();
      const copiedFrom = { songId: song.id, setName: setData?.set?.name || '', copiedAt: now, baseline: contentHash(song) };

      if (outcome === 'skip') {
        setCopyResult({ type: 'song', title, outcome: 'skipped' });
        return;
      }

      if (outcome === 'duplicate') {
        const allTitles = new Set(localSongs.map(s => normalizeTitle(s.metadata?.title)));
        newTitle = makeUniqueTitle(title, allTitles);
      }

      // Spread the whole song so type / pdf / fullPage survive (a subset copy
      // silently degraded a shared PDF to an empty text song). A copied pdf gets a
      // fresh id, so its bytes must re-upload on the new owner's next publish.
      const newId = await saveSong({
        ...song,
        ...NO_BOOK,
        id: null,
        metadata: { ...song.metadata, title: newTitle },
        createdAt: now,
        updatedAt: now,
        copiedFrom,
        pdf: pdfRefForCopy(song.pdf),
      });

      // Copy the PDF bytes (fetched locally when the shared set loaded) under the
      // new id so the duplicate renders.
      if (song.type === 'pdf') {
        const blob = await loadPdfBlob(song.id);
        if (blob) await savePdfBlob(newId, blob);
      }

      // Bring any custom chord shapes this song carries into the local library,
      // under the instrument they were published for.
      mergeTaggedSongCustoms([song]);

      setHasCopied(true);
      setCopyResult({ type: 'song', title, outcome, newTitle: outcome === 'duplicate' ? newTitle : undefined });
    } catch (err) {
      console.error('Copy song failed:', err);
    } finally {
      setCopying(false);
    }
  }

  async function handleCopySet() {
    if (copying || !setData) return;
    setCopying(true);
    try {
      const { set, songs } = setData;
      const localSongs = await loadSongs();
      const titleMap   = buildTitleMap(localSongs);
      // Provenance index: original source song id -> the local copy already made
      // from it. Keyed on copiedFrom (not song id — copies are re-id'd — and not
      // title, which can legitimately differ), this is what makes re-copying a
      // set idempotent: an already-copied song is reused, never re-added.
      const copyBySource = new Map();
      for (const ls of localSongs) {
        const src = ls.copiedFrom?.songId;
        if (src && !copyBySource.has(src)) copyBySource.set(src, ls);
      }

      // Collect conflicts: cloud songs whose title already exists locally — but
      // skip any already copied (handled by provenance below), so we don't prompt
      // for songs we're going to reuse silently.
      const conflicts = songs
        .filter(s => !copyBySource.has(s.id) && titleMap.has(normalizeTitle(s.metadata?.title)))
        .map(s => ({ cloudSong: s, localSong: titleMap.get(normalizeTitle(s.metadata?.title)) }));

      // Keep its songs as a book, out of My songs until used (books.js). A set
      // copied before goes on into the book its songs are already in.
      const records = await loadBooks();
      const here = new Set(records.filter(r => r.kind === 'book').map(r => r.id));
      let bookId = songs.map(s => copyBySource.get(s.id)?.bookId).find(id => here.has(id)) || null;
      if (!bookId && songs.some(s => !copyBySource.has(s.id))) {
        const asked = await new Promise(resolve => setBookAsk({ records, book: startBook(true, set.name || 'Shared set'), resolve }));
        setBookAsk(null);
        if (asked === null) return; // cancelled
        if (asked) bookId = await saveBookChoice(asked);
      }
      const bookFields = bookId ? { bookId, mine: false } : NO_BOOK;

      let choices = {};
      if (conflicts.length > 0) {
        const resolved = await askConflicts(conflicts);
        setConflictDialog(null);
        if (resolved === null) return; // cancelled
        choices = resolved;
      }

      // Running set of normalized titles (grows as we add songs, prevents suffix collisions)
      const allTitles = new Set(localSongs.map(s => normalizeTitle(s.metadata?.title)));
      let copied = 0, duplicated = 0, skipped = 0;
      const newSongIds = [];
      const now = new Date().toISOString();

      for (const song of songs) {
        // Already copied from this exact source: reuse the existing local copy so
        // re-copying the set doesn't duplicate library entries.
        const priorCopy = copyBySource.get(song.id);
        if (priorCopy) {
          newSongIds.push(priorCopy.id);
          skipped++;
          continue;
        }

        const titleKey    = normalizeTitle(song.metadata?.title);
        const hasConflict = titleMap.has(titleKey);

        if (!hasConflict) {
          const newId = await saveSong({
            ...song,
            ...bookFields,
            id: null,
            createdAt: now,
            updatedAt: now,
            copiedFrom: { songId: song.id, setName: set.name, copiedAt: now, baseline: contentHash(song) },
            pdf: pdfRefForCopy(song.pdf),
          });
          if (song.type === 'pdf') { const blob = await loadPdfBlob(song.id); if (blob) await savePdfBlob(newId, blob); }
          allTitles.add(titleKey);
          newSongIds.push(newId);
          copied++;
        } else {
          const choice = choices[song.id] ?? 'skip';
          if (choice === 'duplicate') {
            const newTitle = makeUniqueTitle(song.metadata?.title || 'Untitled', allTitles);
            allTitles.add(normalizeTitle(newTitle));
            const newId = await saveSong({
              ...song,
              ...bookFields,
              id: null,
              metadata: { ...song.metadata, title: newTitle },
              createdAt: now,
              updatedAt: now,
              copiedFrom: { songId: song.id, setName: set.name, copiedAt: now, baseline: contentHash(song) },
              pdf: pdfRefForCopy(song.pdf),
            });
            if (song.type === 'pdf') { const blob = await loadPdfBlob(song.id); if (blob) await savePdfBlob(newId, blob); }
            newSongIds.push(newId);
            duplicated++;
          } else {
            // Skip: reference the existing local song so the set is complete
            newSongIds.push(titleMap.get(titleKey).id);
            skipped++;
          }
        }
      }

      // Reuse the existing local copy of this share's set if there is one, so a
      // re-copy updates it in place rather than making a second set.
      const priorSet = (await loadSets()).find(st => st.copiedFrom?.token === token);
      await saveSet({ markUsed: false, id: priorSet?.id || null, name: set.name, songIds: newSongIds, sortMode: 'custom', copiedFrom: { token, setName: set.name } });
      // Bring the set's songs' custom chord shapes into the local library, each
      // under the instrument it was published for.
      mergeTaggedSongCustoms(songs);
      if (copied + duplicated > 0) setHasCopied(true);
      const inBookName = bookId && copied + duplicated ? (await loadBooks()).find(b => b.id === bookId)?.name : null;
      setCopyResult({ type: 'set', setName: set.name, copied, duplicated, skipped, bookName: inBookName });
    } catch (err) {
      console.error('Copy set failed:', err);
    } finally {
      setCopying(false);
    }
  }

  // ---- Update from share ------------------------------------------------------

  // Compare the share against local copies (by copiedFrom provenance + a baseline
  // hash captured at copy time). status: 'copy' (nothing copied yet), 'uptodate'
  // (all copies match the share), or 'update' (a song changed, was added, or the
  // set order drifted). Per-song state: uptodate | update | conflict | add.
  const updatePlan = useMemo(() => {
    if (!setData) return null;
    const bySource = new Map();
    for (const ls of localSongs) { const src = ls.copiedFrom?.songId; if (src && !bySource.has(src)) bySource.set(src, ls); }
    // SECOND WAY TO RECOGNISE A SONG. Lineage is the authoritative match, but it
    // only knows about songs that arrived THROUGH a share — so your own songs,
    // coming back to you in a set someone built from them, matched nothing and
    // every row read as never-copied. An identical content hash covers the rest:
    // same words, same chords, same title, same key. Whatever its history, it is
    // the same song, and there is nothing to copy.
    //
    // This match can ONLY ever produce 'uptodate', never 'update'. That is what
    // makes it safe: a song matched this way has no baseline, so if the
    // publisher later changes it the hashes stop agreeing, no match is found,
    // and it becomes an 'add' — offered as a new song beside yours rather than
    // written over the top of one Cue was never told was a copy.
    const byHash = new Map();
    for (const ls of localSongs) { const h = contentHash(ls); if (!byHash.has(h)) byHash.set(h, ls); }
    // THE ORIGINAL ITSELF. A published song keeps its id, and so does a song
    // restored from a full backup, so a local song with the share song's own id
    // IS its source — your own set, opened through its link. Same content is
    // 'uptodate'; different is 'have' (never Update: Cue can't tell whether you
    // edited it here or the published one moved on, and overwriting your own
    // original from your own share is the last thing to offer). Needed once
    // same-title songs stopped counting as yours (below): your own edited
    // original must not read as "not on this device".
    const byId = new Map(localSongs.map(ls => [ls.id, ls]));
    // THIRD, and weakest: same title, different content. NOT the same song — a
    // friend's arrangement of one you own is a real, different thing and Cue
    // must not pretend otherwise. But it must not pre-tick Add for it either. A
    // share built from 83 of Howard's own songs offered to add 72 of them, and
    // refusing that was 72 taps.
    const byTitle = new Map();
    for (const ls of localSongs) { const t = normalizeTitle(ls.metadata?.title); if (t && !byTitle.has(t)) byTitle.set(t, ls); }

    const songs = setData.songs.map(s => {
      const local = bySource.get(s.id) || null;
      if (!local) {
        const self = byId.get(s.id);
        if (self) {
          const same = contentHash(self) === contentHash(s);
          return { shareSong: s, local: self, state: same ? 'uptodate' : 'have', matchedBy: 'origin', changed: same ? undefined : contentDiffFields(self, s) };
        }
        const twin = byHash.get(contentHash(s));
        if (twin) return { shareSong: s, local: twin, state: 'uptodate', matchedBy: 'content' };
        const sameName = byTitle.get(normalizeTitle(s.metadata?.title));
        if (sameName) return { shareSong: s, local: sameName, state: 'have', matchedBy: 'title' };
        return { shareSong: s, local: null, state: 'add' };
      }
      const incoming = contentHash(s);
      const here = contentHash(local);
      const baseline = local.copiedFrom?.baseline;
      let state;
      if (baseline == null) state = incoming === here ? 'uptodate' : 'update'; // legacy copy — no baseline to attribute
      else if (incoming === baseline) state = 'uptodate';                      // publisher unchanged
      else if (here === baseline) state = 'update';                            // publisher changed, you didn't
      else state = 'conflict';                                                 // both changed
      // WHAT differs, not just that something does. A row going amber with no
      // edit anyone remembers making is unanswerable from a hash — it can only
      // say "not the same". The signature is a fixed set of named fields, so the
      // difference can be named, and then the next time this happens it is
      // evidence instead of a mystery.
      //
      // Carried on the plan rather than computed in the dialog so both the row's
      // tooltip and the Update list read the same answer.
      const changed = contentDiffFields(local, s);
      return { shareSong: s, local, state, matchedBy: 'lineage', changed };
    });
    const anyMatched = songs.some(x => x.local);
    // Your OWN set, opened through its own share link — something Howard does
    // often, to show people what a share looks like. A copied set always gets a
    // fresh id, so a local set carrying this one's id can only be the original.
    // Without this the screen offered to Copy, and Copy on your own share is two
    // taps from duplicating your entire library.
    const mine = localSets.some(st => st.id === setData.set?.id);
    const localSet = localSets.find(st => st.copiedFrom?.token === token) || null;
    let setChanged = false, orderChanged = false;
    if (localSet) {
      // From the plan's own matches, so this agrees with what applyUpdate writes.
      const expected = songs.map(x => x.local?.id).filter(Boolean);
      const copiedIds = new Set(expected);
      const currentOrder = (localSet.songIds || []).filter(id => copiedIds.has(id));
      // `orderChanged` on its own — setChanged folds in the presence of new
      // songs, because either reason means the copied set needs reconciling.
      // That conflation is fine for deciding whether to act and useless for
      // telling someone WHY, which is what the summary line has to do.
      orderChanged = expected.join('|') !== currentOrder.join('|');
      setChanged = songs.some(x => x.state === 'add') || orderChanged;
    }
    // 'have' is deliberately NOT actionable. It defaults to Skip, so a share
    // made entirely of songs you already own has nothing waiting — rather than an
    // Update badge over rows with nothing to do.
    const actionable = songs.some(x => x.state === 'update' || x.state === 'conflict' || x.state === 'add') || setChanged;
    // "YOUR SET" ONLY WHEN THERE IS NOTHING TO FETCH. Owning the set is a reason
    // not to COPY it — copying your own share duplicates your library — and it
    // was being read as a reason to offer nothing at all.
    //
    // Howard hit the far end of that: he cleared the songs off a device, opened
    // the set's own share link to get them back, and the page said "Your set"
    // and gave him no way to download anything. The set was his, the songs were
    // gone, and the one place holding them refused to hand them over on the
    // grounds that they were already his.
    //
    // So ownership still suppresses Copy, but not Update: when songs from this
    // share are missing here, the Update list can put them back into the set
    // that already exists — which is the right tool for it anyway, since it adds
    // to that set rather than making a second one.
    const status = mine && !actionable ? 'mine'
                 : !anyMatched ? 'copy'
                 : actionable ? 'update'
                 : 'uptodate';
    // The book this share's copies went into — from songs that came THROUGH
    // this share only. A song matched by title or content is yours or another
    // book's, and its book is no guide to where the share's new songs belong.
    const here = new Set(localBooks.filter(r => r.kind === 'book').map(r => r.id));
    const bookId = songs.filter(x => x.matchedBy === 'lineage').map(x => x.local.bookId).find(id => here.has(id)) || null;
    return { status, songs, localSet, setChanged, orderChanged, mine, bookId };
  }, [setData, localSongs, localSets, localBooks, token]);

  // Map share song id -> your local (edited/annotated) copy, for "Follow along
  // with your copy". Presenting then plays your versions where you have them.
  const localBySource = useMemo(() => {
    const m = new Map();
    (updatePlan?.songs || []).forEach(x => { if (x.local && x.matchedBy !== 'title') m.set(x.shareSong.id, x.local); });
    return m;
  }, [updatePlan]);

  // Share song ids whose LOCAL copy is behind: the publisher changed the song,
  // you didn't, and you haven't taken the new version yet.
  //
  // Only that one state gets marked on the list. A tick on every up-to-date row
  // is noise on eight rows out of nine and points at nothing to do, and the
  // count of never-copied songs is already in the dialog's summary. This is the
  // only case where the list is quietly misleading — present the song and you
  // get the old version, with nothing on screen saying so.
  //
  // CONFLICTS ARE DELIBERATELY LEFT OUT. Their Present button is already amber
  // for "you have your own version", and there being behind is a choice you
  // made rather than something you have overlooked. A second amber signal on the
  // same row would blur the one already there.
  const behindShare = useMemo(() => {
    const s = new Set();
    (updatePlan?.songs || []).forEach(x => { if (x.state === 'update') s.add(x.shareSong.id); });
    return s;
  }, [updatePlan]);

  // BOTH of you changed it. The publisher moved and so did you, so there is
  // something new in the share AND something of yours to lose — the one state
  // the rows used to say nothing about at all.
  //
  // It was left out on purpose while the Present button went amber for any edited
  // copy: a second amber on the same row would have blurred the one already
  // there. Present now colours what will PLAY rather than what you own, so amber
  // here is free and means one thing again — there is something to look at.
  //
  // What it does NOT get is the one-tap take that a plain 'update' row has.
  // Tapping this opens the choice instead, because taking the share here throws
  // your edit away, and defaulting conflicts to Skip was the whole point.
  // Share song id -> the named fields that differ from your copy, for whichever
  // control ends up amber on that row.
  const diffBySong = useMemo(() => {
    const m = new Map();
    (updatePlan?.songs || []).forEach(x => { if (x.changed?.length) m.set(x.shareSong.id, x.changed); });
    return m;
  }, [updatePlan]);

  // Share songs with nothing local behind them — never copied, or copied and
  // since deleted.
  const missingHere = useMemo(() => {
    const s = new Set();
    (updatePlan?.songs || []).forEach(x => { if (!x.local || x.matchedBy === 'title') s.add(x.shareSong.id); });
    return s;
  }, [updatePlan]);

  // GREEN OR AMBER, and the rule is Howard's: green when your copy is the share,
  // amber when anything of yours is on it — an edit, ink, or both.
  //
  // What that buys is that a GREEN song needs no choice at all. Playing "theirs"
  // and playing "yours" are the same screen, so there is nothing to decide and no
  // control to show. The selector only has to exist where the two differ.
  //
  // It also removes, by construction, the one combination Cue cannot render
  // honestly: the publisher's words with your ink over them. Ink is positioned
  // against the text it was drawn on, so it only fits your copy — and under this
  // rule there is no way to ask for the other thing, because having ink makes a
  // song amber and choosing amber brings its words along.
  const yoursById = useMemo(() => {
    const m = new Map();
    (updatePlan?.songs || []).forEach(x => {
      // A song that only shares a TITLE is not yours to play here (Howard,
      // 2026-11-01): your arrangement, or one from a book or PDF, is a
      // different song. The row shows + for it, as for one you don't have.
      if (!x.local || x.matchedBy === 'title') return;
      // "DIFFERS", NOT "EDITED" — because for half these songs Cue cannot know
      // who changed them, and the button does not need to know.
      //
      // isEditedCopy compares against the baseline saved when a song was copied
      // THROUGH this share. A song that got here another way — restored from a
      // backup, or already in the library and matched to the share by content —
      // has no baseline, so isEditedCopy answers false forever. Howard has two
      // devices with identical libraries: on the read-only one the songs were
      // never copied through the share, so editing one left the button green
      // however much he changed it.
      //
      // Without a baseline the honest comparison is the local copy against the
      // share itself. That cannot attribute the difference — the publisher may
      // have moved instead — but attribution is not what this button is for. It
      // asks whether the two versions differ enough to be worth choosing
      // between, and a hash says that much on its own.
      const base = x.local.copiedFrom?.baseline;
      const differs = base != null
        ? isEditedCopy(x.local)
        : contentHash(x.local) !== contentHash(x.shareSong);
      m.set(x.shareSong.id, {
        localId: x.local.id,
        edited: differs,
        attributable: base != null,
        inked: inkedIds.has(x.local.id),
      });
    });
    return m;
  }, [updatePlan, inkedIds]);

  // Share song ids where choosing is meaningful at all.
  const choosable = useMemo(() => {
    const s = new Set();
    yoursById.forEach((v, id) => { if (v.edited || v.inked) s.add(id); });
    return s;
  }, [yoursById]);

  const bothChanged = useMemo(() => {
    const s = new Set();
    (updatePlan?.songs || []).forEach(x => { if (x.state === 'conflict') s.add(x.shareSong.id); });
    return s;
  }, [updatePlan]);

  // WHAT A ROW SHOWS — Howard's three symbols (2026-11-01), replacing a colour
  // that meant three things. Left, this device: + not here, = yours and
  // unchanged, ≠ yours and changed (edited or inked). Middle, a TV whose arrow
  // points at what Present plays. Right, the share: a cloud, with a down-arrow
  // when there is something newer in it ('take' when only they moved, 'decide'
  // when you both did).
  function rowOf(song) {
    const y = yoursById.get(song.id);
    const lib = !y ? '+' : choosable.has(song.id) ? '≠' : '=';
    return {
      lib,
      newer: bothChanged.has(song.id) ? 'decide' : behindShare.has(song.id) ? 'take' : null,
      inkOnly: !!y && y.inked && !y.edited,
      playingMine: lib === '≠' && playMineIds.has(song.id),
    };
  }



  // ONE switch decides what plays, and it is the header toggle — for the whole
  // set and for a single row alike. There used to be a forceMine argument here,
  // for a per-row override that would play your copy against the toggle; nothing
  // ever passed it, and now nothing should. A row that plays something other than
  // what the toggle says is a row whose colour cannot be trusted.
  // Swap in your copy only for the songs you have chosen. A song you have not
  // chosen plays the publisher's version, and a song with nothing of yours on it
  // is the same either way.
  //
  // `annotatable` is the ids whose ink may be drawn and shown: your own copies,
  // and only the ones actually playing. Present must not let you draw on the
  // publisher's version — ink would be stored under THEIR song id, leaving two
  // sets of marks for what you think of as one song.
  function present(base, startIndex) {
    const annotatable = new Set();
    const songs = base.map(s => {
      const local = playMineIds.has(s.id) ? localBySource.get(s.id) : null;
      if (local) { annotatable.add(local.id); return local; }
      return s;
    });
    setPresenting({ songs, startIndex, annotatable });
  }

  // Apply the Update: overwrite changed copies in place (keeping their id so set
  // references hold), add new songs, skip the rest, then reconcile the copied
  // set's order/membership to the share. Never touches non-copied local songs.
  // Write the publisher's version of ONE song over the copy you already have.
  //
  // Keeps the local id, which is what makes this safe to do in place: the set
  // that references it still resolves, and the annotation store is keyed by id
  // so your ink stays where it is. Keeps your title too — renaming a song you
  // have filed is not the publisher's business. Records a fresh baseline, so the
  // next comparison knows this is what you were given.
  //
  // Shared by the Update list and the per-song button on a row that is behind.
  // Extracted rather than copied: this is four side effects in a row, and two
  // copies of it would diverge on the first one anybody forgot.
  async function takeShareVersion(shareSong, local) {
    const s = shareSong;
    await saveSong({
      ...s,
      ...NO_BOOK, // the copy keeps its own book; the publisher's isn't ours
      id: local.id,
      metadata: { ...s.metadata, title: local.metadata?.title || s.metadata?.title },
      createdAt: local.createdAt,
      updatedAt: new Date().toISOString(),
      copiedFrom: { ...(local.copiedFrom || {}), songId: s.id, baseline: contentHash(s) },
      pdf: pdfRefForCopy(s.pdf),
    });
    if (s.type === 'pdf') {
      // Make sure we write the CURRENT sheet: re-fetch the publisher's bytes
      // (in case they changed the PDF) before copying. Fail-soft — if offline,
      // fall back to whatever was cached when the share opened.
      if (s.ownerId) { try { await downloadPdfBlob(s.id, s.ownerId); } catch { /* keep cached */ } }
      const blob = await loadPdfBlob(s.id);
      if (blob) await savePdfBlob(local.id, blob);
    }
    mergeTaggedSongCustoms([s]);
  }

  // The library button on a row marked as behind. One tap, no confirmation:
  // 'update' means the publisher moved and YOU DID NOT, so your copy still
  // matches the baseline and there is nothing of yours to lose. (A song you had
  // also edited is a 'conflict', is not marked, and does not reach here — that
  // one stays a decision in the Update list.)
  async function updateOneSong(shareSong) {
    const item = (updatePlan?.songs || []).find(x => x.shareSong.id === shareSong.id);
    if (!item?.local || item.state !== 'update' || copying) return;
    setCopying(true);
    try {
      await takeShareVersion(item.shareSong, item.local);
      setHasCopied(true);
      await refreshLocal();
      setCopyResult({ type: 'song', title: item.local.metadata?.title || shareSong.metadata?.title, outcome: 'refreshed' });
    } catch (err) {
      console.error('Update one song failed:', err);
    } finally {
      setCopying(false);
    }
  }

  // `book` is the Update list's book choice (bookChoice()), for songs added from
  // a share whose copies aren't in a book yet; null for none.
  async function applyUpdate(choices, book = null) {
    if (!updatePlan || !setData || copying) return;
    setCopying(true);
    try {
      const now = new Date().toISOString();
      const shareToLocalId = new Map();
      const allTitles = new Set(localSongs.map(s => normalizeTitle(s.metadata?.title)));
      let updated = 0, added = 0, skipped = 0;
      // A song added goes into the book the set's copies are in, or the one
      // chosen in the list — made only if something is actually added.
      const adding = updatePlan.songs.some(x => isAddish(x.state) && (choices?.[x.shareSong.id] ?? defaultUpdateAction(x.state)) === 'add');
      const bookId = updatePlan.bookId || (book && adding && !updatePlan.mine ? await saveBookChoice(book) : null);
      const bookFields = bookId ? { bookId, mine: false } : NO_BOOK;

      for (const item of updatePlan.songs) {
        const s = item.shareSong;
        const action = choices?.[s.id] ?? defaultUpdateAction(item.state);

        if ((item.state === 'update' || item.state === 'conflict') && action === 'update' && item.local) {
          await takeShareVersion(s, item.local);
          shareToLocalId.set(s.id, item.local.id);
          updated++;
        } else if (isAddish(item.state) && action === 'add') {
          let title = s.metadata?.title || 'Untitled';
          if (allTitles.has(normalizeTitle(title))) title = makeUniqueTitle(title, allTitles);
          allTitles.add(normalizeTitle(title));
          const newId = await saveSong({
            ...s, ...bookFields, id: null,
            metadata: { ...s.metadata, title },
            createdAt: now, updatedAt: now,
            copiedFrom: { songId: s.id, setName: setData.set?.name || '', copiedAt: now, baseline: contentHash(s) },
            pdf: pdfRefForCopy(s.pdf),
          });
          if (s.type === 'pdf') { const blob = await loadPdfBlob(s.id); if (blob) await savePdfBlob(newId, blob); }
          mergeTaggedSongCustoms([s]);
          shareToLocalId.set(s.id, newId);
          added++;
        } else if (item.local) {
          // up to date, or the user chose Skip — keep the existing copy in the set.
          shareToLocalId.set(s.id, item.local.id);
          if (item.state !== 'uptodate') skipped++;
        }
      }

      const newIds = setData.songs.map(s => shareToLocalId.get(s.id)).filter(Boolean);
      if (updatePlan.localSet) {
        await saveSet({ markUsed: false, id: updatePlan.localSet.id, name: setData.set?.name || updatePlan.localSet.name, songIds: newIds, sortMode: 'custom', copiedFrom: updatePlan.localSet.copiedFrom });
      } else if (!updatePlan.mine && newIds.length) {
        // Never copied — the list stood in for Copy because some songs matched
        // ones you have — so make the set, as Copy would.
        const name = setData.set?.name || 'Shared set';
        await saveSet({ markUsed: false, id: null, name, songIds: newIds, sortMode: 'custom', copiedFrom: { token, setName: name } });
      }

      setHasCopied(true);
      setUpdateDialog(null);
      await refreshLocal();
      const inBookName = bookId && added ? (await loadBooks()).find(b => b.id === bookId)?.name : null;
      setCopyResult({ type: 'update', updated, added, skipped, bookName: inBookName, copied: !updatePlan.localSet && !updatePlan.mine, setName: setData.set?.name || '' });
    } catch (err) {
      console.error('Update from share failed:', err);
    } finally {
      setCopying(false);
    }
  }

  // ---- Theme helpers ----------------------------------------------------------

  const bg         = dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900';
  const bdr        = dark ? 'border-gray-800' : 'border-gray-200';
  const muted      = dark ? 'text-gray-500' : 'text-gray-400';
  const btnOutline = `border rounded-lg transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400'}`;
  // Round-button language, matching the app header elsewhere: opaque slate on
  // light chrome, translucent grey on dark; indigo ACTIVE for anchor states.
  const headerFill = dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY_CHROME;
  // On a phone the header's action pills are dropped to icon-only circles.
  // Measured at 390px: the right-hand group is a fixed 309px that never shrinks,
  // which left 33px for the Cue mark and the set's name — so the name was already
  // truncated to nothing, and a full-size mark would have overflowed the bar.
  // Icon-only takes that group to 200px, which pays for both.
  const compactHeader = useIsNarrow(640);

  // ---- Render -----------------------------------------------------------------

  if (status === 'loading') {
    return (
      <div className={`ios-glass-inset min-h-dvh flex items-center justify-center ${bg}`}>
        <p className={`text-sm ${muted}`}>Loading…</p>
      </div>
    );
  }

  if (status === 'not_found') {
    const bookmarked = savedShares.some(s => s.token === token);
    return (
      <div className={`ios-glass-inset min-h-dvh flex flex-col ${bg}`}>
        <header className={`px-6 py-4 border-b ${bdr} shrink-0`}>
          <RoundButton
            size={ROUND_SIZE_ACTION}
            label="Leave this shared set" title="Leave this shared set"
            glass fill={GLASS(dark).fill} border={GLASS(dark).border} color={GLASS(dark).ink}
            onActivate={() => navigate('/')}
          >
            <ChevronLeft size={26} strokeWidth={2.5} />
          </RoundButton>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 px-6 max-w-sm">
            <p className={`text-lg font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
              This shared set isn't available
            </p>
            <p className={`text-sm ${muted}`}>The link may have been revoked or doesn't exist.</p>
            {bookmarked && (
              <button
                onClick={handleRemoveBookmark}
                className={`h-11 px-4 pointer-fine:h-9 pointer-fine:px-3 text-sm rounded-lg border transition-colors ${dark ? 'border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-800' : 'border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300'}`}
              >
                Remove from Shared with me
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`ios-glass-inset min-h-dvh flex flex-col ${bg}`}>
        <header className={`px-6 py-4 border-b ${bdr} shrink-0`}>
          <RoundButton
            size={ROUND_SIZE_ACTION}
            label="Leave this shared set" title="Leave this shared set"
            glass fill={GLASS(dark).fill} border={GLASS(dark).border} color={GLASS(dark).ink}
            onActivate={() => navigate('/')}
          >
            <ChevronLeft size={26} strokeWidth={2.5} />
          </RoundButton>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 px-6 max-w-sm">
            <p className={`text-lg font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
              {typeof navigator !== 'undefined' && navigator.onLine === false ? "You're offline" : "Couldn't load this shared set"}
            </p>
            <p className={`text-sm ${muted}`}>{describeCloudError(loadError)}</p>
            <button
              onClick={() => setRetryCount(c => c + 1)}
              className="h-11 px-4 pointer-fine:h-9 pointer-fine:px-3 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { set, songs } = setData;
  const enriched = songsWithViewerKeys(songs);
  // A–Z is a view only — it never changes the set, just how it's listed and
  // presented here. 'custom' keeps the publisher's order.
  const displayed = sortMode === 'alpha'
    ? [...enriched].sort((a, b) => (a.metadata?.title || '').localeCompare(b.metadata?.title || ''))
    : enriched;

  if (presenting) {
    return (
      <PresentationView
        songs={presenting.songs}
        startIndex={presenting.startIndex}
        onExit={() => setPresenting(null)}
        showEdit={false}
        annotatableIds={presenting.annotatable}
        sourceLabel={presenting.annotatable?.size
          ? (presenting.annotatable.size === presenting.songs.length ? 'Playing your copies' : 'Playing your copies where you chose them')
          : 'Playing shared versions'}
      />
    );
  }

  // Landing gate — a fresh open offers "follow along here" vs "copy the code to
  // save in your own Cue" before showing the songs. Skipped once passed on this
  // device, or when the set is already bookmarked.
  if (!gatePassed && !isBookmarked && !autoSave) {
    return (
      // Scrolls, and centres with my-auto rather than justify-center: with the
      // install steps open this card outgrows a phone held sideways, and a
      // justify-centred column that overflows cuts off its top with no way to
      // scroll up to it.
      <div className={`ios-glass-inset h-dvh overflow-y-auto flex flex-col items-center p-6 ${bg}`}>
        <div className={`my-auto w-full max-w-md rounded-2xl border ${bdr} ${dark ? 'bg-gray-900' : 'bg-white'} shadow-xl p-6 flex flex-col gap-5`}>
          <div className="flex items-center gap-2">
            <CueMark size={24} />
            <span className={`text-xs uppercase tracking-wide ${muted}`}>Shared with you from Cue</span>
          </div>
          <div>
            <h1 className={`text-xl font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{set.name}</h1>
            <p className={`text-sm ${muted}`}>{songs.length} {songs.length === 1 ? 'song' : 'songs'}</p>
          </div>

          {/* Follow along — the common case. */}
          <div className="flex flex-col gap-1.5">
            <button onClick={continueToSet} className="w-full py-2.5 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
              Continue to set
            </button>
            <p className={`text-xs text-center ${muted}`}>Opens the set here in your browser to follow along.</p>
          </div>

          {/* Save the code into the viewer's own Cue app. This page is almost
              always open in a browser, and on an iPhone or iPad the Cue app
              keeps separate storage from it — so anything saved HERE is not in
              the app. Copy-and-paste is the way across from this page; the
              scan button inside Cue is the way next time. */}
          <div className={`flex flex-col gap-2 border-t ${bdr} pt-4`}>
            <p className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
              To save it in the Cue app on your device: copy this code, open Cue → Sets → Shared with me, paste it into "Paste a share link", then tap Open.
            </p>
            <div className={`flex items-center gap-2 rounded-xl border ${bdr} p-2 ${dark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
              <span className={`flex-1 text-xs font-mono truncate px-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{token}</span>
              <button
                onClick={copyCode}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  copiedCode
                    ? (dark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600')
                    : (dark ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300')
                }`}
              >
                {copiedCode ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy code</>}
              </button>
            </div>
            <p className={`text-xs ${muted}`}>
              Next time, open Cue first and tap the scan button beside that box, then scan the set's QR code — it goes straight into the app.
            </p>
          </div>

          {/* For someone who has no Cue yet: install it BEFORE saving anything,
              or what they save stays behind in the browser. */}
          <div className={`flex flex-col gap-2 border-t ${bdr} pt-4`}>
            <button
              type="button"
              onClick={() => setShowInstall(v => !v)}
              aria-expanded={showInstall}
              className={`self-start text-sm font-medium ${dark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500'}`}
            >
              {showInstall ? "Hide how to get Cue" : "Don't have Cue yet?"}
            </button>
            {showInstall && (
              <>
                <p className={`text-xs ${muted}`}>
                  Add Cue to your device as an app first, then paste the code into it. On an iPhone or iPad the app and the browser keep separate libraries, so a set saved here in the browser won't appear in the app.
                </p>
                <InstallTips dark={dark} />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`ios-glass-inset h-dvh flex flex-col overflow-hidden ${bg}`}>
      {/* Header */}
      <header className={`px-6 py-4 border-b ${bdr} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-3 min-w-0">
          {/* The way out, matching Present and the editor: same glass circle, same
              corner, same chevron. NOT called "Back" — for someone who arrived
              from a link there is nowhere to go back TO, and "Leave this shared
              set" is true for them and for you.

              It keeps handleOpenCue, which is why the chevron suits it better
              than the Cue mark did: that handler already stops and asks when you
              have neither bookmarked nor copied anything, exactly as the editor's
              exit asks about unsaved changes. The logo advertised none of that. */}
          <RoundButton
            size={ROUND_SIZE_ACTION}
            label="Leave this shared set" title="Leave this shared set"
            glass fill={GLASS(dark).fill} border={GLASS(dark).border} color={GLASS(dark).ink}
            onActivate={handleOpenCue}
          >
            <ChevronLeft size={26} strokeWidth={2.5} />
          </RoundButton>
          <h1 className={`text-base font-semibold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{set.name}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Save / remove bookmark — indigo when bookmarked */}
          <RoundButton
            size={ROUND_SIZE_ACTION}
            label={isBookmarked ? 'Remove this saved link' : 'Bookmark this link'}
            title={isBookmarked
              ? 'Remove this link from your saved “Shared with me” list.'
              : 'Bookmark this link so you can reopen this set later from your Cue — no need to keep the link.'}
            fill={headerFill} active={isBookmarked}
            onActivate={isBookmarked ? handleRemoveBookmark : handleSaveBookmark}
          >
            {isBookmarked ? <BookmarkCheck size={22} /> : <Bookmark size={22} />}
          </RoundButton>
          {/* Present — indigo anchor action */}
          <RoundButton
            size={ROUND_SIZE_ACTION} pill={!compactHeader}
            label="Present the whole set"
            title="Play the set full-screen, one song at a time — big chords and lyrics for performing. No account needed."
            fill={headerFill} active={enriched.length > 0} disabled={enriched.length === 0}
            onActivate={() => present(displayed, 0)}
          >
            <Tv size={20} />{!compactHeader && <PillLabel>Present</PillLabel>}
          </RoundButton>
          {/* Settings */}
          <RoundButton
            size={ROUND_SIZE_ACTION}
            label="Settings" title="Settings"
            fill={headerFill}
            onActivate={() => setSettingsOpen(true)}
          >
            <Settings size={23} />
          </RoundButton>
        </div>
      </header>

      {/* No "Use mine for all" here any more. It was a second control for what
          each row's amber button already sets, and one confusing button too
          many (Howard, 2026-11-01). Each song's choice is made on its row. */}

      {/* Showing a cached copy. Stated plainly with its date: this is the set as
          it was, and the publisher may have changed it since. Not an error
          screen — you're at a gig and the songs are on screen, which is the
          point. Retry is there for when the signal comes back. */}
      {cachedAt && (
        <div className="max-w-2xl mx-auto w-full px-4 pt-3 shrink-0">
          <div className={`rounded-xl border px-3 py-2 flex items-center gap-3 ${dark ? 'border-amber-500/40 bg-amber-500/10' : 'border-amber-500/50 bg-amber-50'}`}>
            <CloudOff size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span className={`text-xs flex-1 min-w-0 ${dark ? 'text-amber-200' : 'text-amber-900'}`}>
              No connection — showing the copy you last opened{' '}
              <span className="font-semibold">{formatCachedAt(cachedAt)}</span>. The publisher may have changed it since.
            </span>
            <button
              onClick={() => setRetryCount(c => c + 1)}
              className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${dark ? 'border-amber-500/40 text-amber-200 hover:bg-amber-500/20' : 'border-amber-500/50 text-amber-900 hover:bg-amber-100'}`}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Sort view — publisher's order or A–Z. View only; never changes the set.
          The set's Copy / Update button shares its line, on the right, and the
          key sits under both: all three stay put while the songs scroll. */}
      <div className="max-w-2xl mx-auto w-full px-4 pt-3 shrink-0">
        <div className="flex items-center gap-3 pr-[1.3125rem]">
          {enriched.length > 1 && (
            <div>
              {/* Same sliding pill as the editor's Text/Preview/Chords and the
                  Library's panel switcher, so one control behaves one way. */}
              <SegmentedControl
                ariaLabel="Song order"
                options={[
                  // A medal rather than lucide's `Badge`: at 18px that icon's scalloped
                  // edge collapses into a plain ring, indistinguishable from a circle.
                  { id: 'custom', label: 'Original', icon: <Award size={18} strokeWidth={2} /> },
                  { id: 'alpha',  label: 'A–Z',      icon: <ArrowDownAZ size={18} strokeWidth={2} /> },
                ]}
                value={sortMode}
                onChange={setSortMode}
                size="stack"
                segmentPadX={14}
              />
            </div>
          )}
          <div className="ml-auto">
            {/* Copy whole set to library — becomes "Up to date" / "Update" once the
                set has been copied, reflecting whether the share has since changed.
                Above the songs' own buttons, not in the header (Howard, 2026-11-01):
                the set's action sits over the column of per-song actions it sums up. */}
            {enriched.length > 0 && (() => {
              const st = updatePlan?.status || 'copy';
              if (st === 'mine') {
                return (
                  <RoundButton size={ROUND_SIZE_COMPACT} pill
                    label="This is your own set"
                    title="You published this set. These are your songs — there is nothing to copy or update."
                    fill={headerFill} disabled>
                    <UserCheck size={17} /><PillLabel>Your set</PillLabel>
                  </RoundButton>
                );
              }
              if (st === 'uptodate') {
                // NEUTRAL, BUT STILL A DOOR. Nothing here is waiting, so it does not
                // nag in amber — but it stays tappable, because "nothing waiting"
                // now also covers a share full of songs you own a different version
                // of. Disabling it would have taken away the only deliberate route
                // to the publisher's arrangement of a song you already have.
                //
                // "Up to date" is not strictly true in that second case — nothing is
                // pending, but 72 of 83 songs may be different versions rather than
                // matching copies. Raised with Howard on 2026-09-30 and left alone
                // deliberately: every shorter alternative was worse, and opening it
                // says exactly what is in there. Leave the wording be.
                return (
                  <RoundButton size={ROUND_SIZE_COMPACT} pill
                    label="Nothing waiting — review this set"
                    title="Nothing here is waiting for you. Open it to look through the set anyway — anything you already have is set to leave alone."
                    fill={headerFill} disabled={copying}
                    onActivate={() => setUpdateDialog({ choices: {} })}>
                    <Check size={17} /><PillLabel>Up to date</PillLabel>
                  </RoundButton>
                );
              }
              if (st === 'update' && !updatePlan.localSet && !updatePlan.mine) {
                // Never copied, but some songs match ones you have: Copy, through
                // the Update list, which can say which you have (UpdateDialog).
                return (
                  <RoundButton size={ROUND_SIZE_COMPACT} pill
                    label="Copy songs to my library"
                    title="Save your own copy of this set. Some of its songs are already in your library — choose which to add."
                    fill={headerFill} disabled={copying}
                    onActivate={() => setUpdateDialog({ choices: {} })}>
                    <Library size={17} /><PillLabel>Copy</PillLabel>
                  </RoundButton>
                );
              }
              if (st === 'update') {
                return (
                  <RoundButton size={ROUND_SIZE_COMPACT} pill
                    label="Update my copies from this shared set"
                    title="This shared set has changed since you copied it — review and update your copies."
                    fill={SHARE_NEWER} disabled={copying}
                    onActivate={() => setUpdateDialog({ choices: {} })}>
                    <Download size={17} /><PillLabel>Update</PillLabel>
                  </RoundButton>
                );
              }
              return (
                <RoundButton size={ROUND_SIZE_COMPACT} pill
                  label="Copy songs to my library"
                  title="Save your own copy: adds all of these songs to your Cue library, where you can open, edit, and keep them."
                  fill={headerFill} disabled={copying}
                  onActivate={handleCopySet}>
                  <Library size={17} /><PillLabel>Copy</PillLabel>
                </RoundButton>
              );
            })()}
          </div>
        </div>
        <SongKey dark={dark} rows={displayed.map(rowOf)} />
      </div>

      {/* Song list */}
      <div ref={ptrRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div
          className="flex items-center justify-center gap-2 overflow-hidden text-xs font-medium text-gray-500 dark:text-gray-400 select-none"
          style={{ height: ptrPull }}
        >
          {ptrRefreshing ? (
            <><PullSpinner spinning /> Checking for changes…</>
          ) : ptrPull > 0 ? (
            <>
              <PullSpinner progress={ptrPull / 64} />
              {ptrPull >= 64 ? 'Release to refresh' : 'Pull to refresh'}
            </>
          ) : null}
        </div>
        <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-2">
          {displayed.length === 0 ? (
            <p className={`text-sm text-center py-12 ${muted}`}>No songs in this set.</p>
          ) : (
            displayed.map((song, idx) => (
              <SharedSongRow
                key={song.id}
                song={song}
                index={idx}
                dark={dark}
                muted={muted}
                row={rowOf(song)}
                onToggleMine={choosable.has(song.id) ? () => {
                  const next = new Set(playMineIds);
                  if (next.has(song.id)) next.delete(song.id); else next.add(song.id);
                  setPlayMinePersisted(next);
                } : undefined}
                onPresent={() => present(displayed, idx)}
                onCopy={
                  // On your own set a song you STILL HAVE needs no copy button —
                  // that is the duplication this guard exists to prevent. One
                  // that has gone missing is a different matter, and refusing it
                  // is how a set you own becomes the one place you cannot get
                  // your own songs back from.
                  updatePlan?.mine && !missingHere.has(song.id) ? undefined : () => handleCopySong(song)
                }
                onCloud={bothChanged.has(song.id) ? () => setUpdateDialog({ choices: {}, focus: song.id })
                  : behindShare.has(song.id) ? () => updateOneSong(song) : undefined}
                changed={diffBySong.get(song.id)}
                copying={copying}
              />
            ))
          )}
        </div>
      </div>

      {/* Conflict dialog — shown before any writes when title matches are found */}
      {bookAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className={`w-[22rem] max-w-full rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Copy “{setData?.set?.name}”</h2>
            <div className="flex flex-col gap-1">
              <BookChoice dark={dark} records={bookAsk.records} value={bookAsk.book} onChange={(book) => setBookAsk(a => ({ ...a, book }))} />
              <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                {bookAsk.book.on
                  ? 'Its songs stay out of My songs until you put one in a set of your own, ink it, or add it to My songs.'
                  : 'Its songs go straight into My songs.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => bookAsk.resolve(null)} className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Cancel</button>
              <button onClick={() => bookAsk.resolve(bookChoice(bookAsk.book) || false)} className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors">Copy</button>
            </div>
          </div>
        </div>
      )}

      {conflictDialog && (
        <ConflictDialog
          conflicts={conflictDialog.conflicts}
          dark={dark}
          onResolve={conflictDialog.resolve}
        />
      )}

      {/* Update-from-share list */}
      {updateDialog && updatePlan && (
        <UpdateDialog
          plan={updatePlan}
          choices={updateDialog.choices}
          setName={setData?.set?.name || ''}
          dark={dark}
          busy={copying}
          focusId={updateDialog.focus}
          records={localBooks}
          book={updateDialog.book ?? startBook(!updatePlan.localSet, setData?.set?.name || 'Shared set')}
          onBook={(book) => setUpdateDialog(d => ({ ...d, book }))}
          onChange={(id, action) => setUpdateDialog(d => ({ ...d, choices: { ...d.choices, [id]: action } }))}
          onSetAll={(kind) => setUpdateDialog(d => ({
            ...d,
            choices: Object.fromEntries((updatePlan?.songs || []).map(x => [
              x.shareSong.id,
              kind === 'skip' || x.state === 'uptodate' ? 'skip' : (isAddish(x.state) ? 'add' : 'update'),
            ])),
          }))}
          onCancel={() => setUpdateDialog(null)}
          onApply={() => applyUpdate(updateDialog.choices, bookChoice(updateDialog.book ?? startBook(!updatePlan.localSet, setData?.set?.name || 'Shared set')))}
        />
      )}

      {/* Leave prompt — shown when navigating away before saving/copying */}
      {leavePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setLeavePrompt(false)}
        >
          <div
            className={`w-full sm:w-80 rounded-t-2xl sm:rounded-2xl shadow-2xl px-5 pt-5 pb-6 flex flex-col gap-3 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
            onClick={e => e.stopPropagation()}
          >
            <p className={`text-sm font-medium ${dark ? 'text-white' : 'text-gray-900'}`}>
              Save this shared set before leaving?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { handleSaveBookmark(); navigate('/'); }}
                className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                Save &amp; go
              </button>
              <button
                onClick={() => navigate('/')}
                className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                Just go
              </button>
            </div>
            <button
              onClick={() => setLeavePrompt(false)}
              className={`text-xs text-center py-0.5 transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} hideAccount />

      {/* Copy result modal */}
      {copyResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setCopyResult(null)}
        >
          <div
            className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
            onClick={e => e.stopPropagation()}
          >
            {copyResult.type === 'set' && <SetCopyResult result={copyResult} dark={dark} onDone={() => setCopyResult(null)} />}
            {copyResult.type === 'song' && <SongCopyResult result={copyResult} dark={dark} onDone={() => setCopyResult(null)} />}
            {copyResult.type === 'update' && <UpdateResult result={copyResult} dark={dark} onDone={() => setCopyResult(null)} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Copy result sub-views ---------------------------------------------------

function SetCopyResult({ result, dark, onDone }) {
  const { setName, copied, duplicated, skipped, bookName } = result;
  const parts = [];
  if (copied)     parts.push(`${copied} copied`);
  if (duplicated) parts.push(`${duplicated} duplicated`);
  if (skipped)    parts.push(`${skipped} skipped`);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
          Added to your library
        </h2>
        <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Created set{' '}
          <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>"{setName}"</span>
          {bookName ? <>, its songs in the book <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>“{bookName}”</span></> : null}.
          {parts.length > 0 && (
            <span className="block mt-1">{parts.join(', ')}.</span>
          )}
        </p>
      </div>
      <button
        onClick={onDone}
        className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
      >
        Done
      </button>
    </>
  );
}

// What each per-song row starts on when the Update list opens.
//
// A CONFLICT DEFAULTS TO SKIP. Both sides changed that song, so taking the
// publisher's version discards yours — and a pre-ticked destructive option gets
// a reflex confirm from anyone who doesn't stop to read the amber line. Skip
// makes the fast path the safe one and keeping the publisher's version the
// deliberate act, which is the right way round.
//
// This USED to exist twice: once here for applyUpdate and once inline in
// UpdateDialog for the segmented buttons. They agreed by luck. Two copies of a
// default are how a dialog comes to show one thing and do another, so there is
// now one.
function defaultUpdateAction(state) {
  if (state === 'add') return 'add';
  if (state === 'update') return 'update';
  return 'skip';   // conflict, uptodate, have
}

// States whose action ADDS a song rather than replacing one. 'have' belongs
// here: taking it brings the publisher's version in as a SEPARATE song and never
// writes over the one of yours that happens to share its title.
const isAddish = (state) => state === 'add' || state === 'have';

function UpdateResult({ result, dark, onDone }) {
  const { updated, added, skipped, bookName, copied, setName } = result;
  const parts = [];
  if (updated) parts.push(`${updated} updated`);
  if (added)   parts.push(`${added} added`);
  if (skipped) parts.push(copied ? `${skipped} of yours used instead` : `${skipped} skipped`);
  const em = dark ? 'text-gray-200' : 'text-gray-700';
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{copied ? 'Set copied' : 'Copies updated'}</h2>
        <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {copied && <>Created set <span className={`font-medium ${em}`}>“{setName}”</span>. </>}
          {parts.length ? parts.join(', ') : copied ? 'Every song was one you have' : 'Everything was already up to date'}
          {bookName ? <>, the songs added in the book <span className={`font-medium ${em}`}>“{bookName}”</span></> : null}.
        </p>
      </div>
      <button onClick={onDone} className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors">Done</button>
    </>
  );
}

// The Update-from-share list: one row per song with its state and the action to
// take (Update / Skip, or Add / Skip for songs not yet in your library).
//
// A share never copied whose songs partly match ones you have opens here, not
// in Copy, and says Copy: applying it makes the set. Where the songs it adds
// have no book yet — this share's copies aren't in one — it asks, as Copy does
// (`book`, BookChoice's value; ticked when never copied).
function UpdateDialog({ plan, choices, setName, dark, busy, focusId, records = [], book, onBook, onChange, onSetAll, onCancel, onApply }) {
  // Arriving from ONE row's blue button, in a list that can be 83 rows long.
  // Without this you land somewhere in the middle of a wall of songs with
  // nothing saying which one you came to decide about.
  //
  // A callback ref, not a plain one: the row it belongs to is rendered
  // conditionally inside a map, so there is no mount for an effect to hang on
  // and a plain ref would still be null when the effect ran.
  const focusRow = useCallback((el) => {
    if (el) el.scrollIntoView({ block: 'center' });
  }, []);
  const em   = dark ? 'text-gray-100' : 'text-gray-900';
  const sub  = dark ? 'text-gray-400' : 'text-gray-500';
  const seg  = (on) => `px-2.5 py-1 text-xs rounded-lg border transition-colors ${on ? 'bg-indigo-600 border-indigo-600 text-white' : dark ? 'border-gray-700 text-gray-300' : 'border-gray-300 text-gray-600'}`;
  const actionable = plan.songs.filter(s => s.state !== 'uptodate');
  const anyConflict = plan.songs.some(s => s.state === 'conflict');
  // WHAT IS IN THIS LIST, before reading a single row. "Update" has to cover
  // four situations — songs you have never copied, songs the publisher changed,
  // songs you BOTH changed, and a set whose running order moved — and no one
  // word can carry that. The counts can.
  const n = plan.songs.reduce((a, x) => ({ ...a, [x.state]: (a[x.state] || 0) + 1 }), {});
  const summary = [
    n.add      && `${n.add} to copy`,
    n.update   && `${n.update} changed in the share`,
    n.conflict && `${n.conflict} you’ve also edited`,
    n.have     && `${n.have} already in your library`,
    n.uptodate && `${n.uptodate} already up to date`,
  ].filter(Boolean).join(' · ');
  // A set can be actionable with every song untouched, when only the order
  // moved. Without this the row said Update and the dialog said everything was
  // up to date.
  const nothingToDo = actionable.length === 0 && !plan.orderChanged;
  const firstCopy = !plan.localSet && !plan.mine;
  const askBook = !plan.bookId && !plan.mine && plan.songs.some(x => isAddish(x.state));
  const blocked = busy || nothingToDo || (askBook && book?.on && !bookChoice(book));

  return (
    /* No scrim, as everywhere else: this screen is about the set behind it, and
       the songs are what you are deciding about. */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" {...dismissOnOutside(onCancel, !busy)}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${em}`}>{firstCopy ? 'Copy' : 'Update from'} “{setName}”</h2>
          <p className={`text-xs ${sub}`}>{firstCopy
            ? 'Some of these songs are already in your library. Choose which to add; the set is copied with the songs you have in their places. Your own songs are never touched.'
            : 'Refresh your copies with the latest from this shared set. Your own (non-copied) songs are never touched, and your ink annotations are kept — a song keeps its place in your library, only its words and chords change.'}</p>
        </div>

        {summary && <p className={`text-xs font-medium ${em}`}>{summary}</p>}
        {plan.orderChanged && (
          <p className={`text-xs ${sub}`}>The set’s running order has changed.</p>
        )}

        {/* Set every row at once. The already-in-your-library dialog has had an
            apply-to-all for ages; this list never got one, and 83 songs is where
            that stops being a detail. */}
        {actionable.length > 1 && (
          <div className="flex items-center gap-2">
            <span className={`text-[0.6875rem] ${sub}`}>All:</span>
            <button onClick={() => onSetAll('take')} className={seg(false)}>Take everything</button>
            <button onClick={() => onSetAll('skip')} className={seg(false)}>Skip everything</button>
          </div>
        )}

        {nothingToDo ? (
          <p className={`text-sm ${sub}`}>Everything is already up to date.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plan.songs.map((item, i) => {
              const s = item.shareSong;
              const title = s.metadata?.title || 'Untitled';
              const choice = choices?.[s.id] ?? defaultUpdateAction(item.state);
              return (
                <li
                  key={i}
                  ref={s.id === focusId ? focusRow : undefined}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border ${
                    s.id === focusId ? 'border-blue-500 ring-1 ring-blue-500' : dark ? 'border-gray-700' : 'border-gray-200'
                  }`}
                >
                  <span className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate ${em}`}>{title}</span>
                    <span className={`text-[0.6875rem] ${item.state === 'conflict' ? 'text-blue-500' : sub}`}>
                      {item.state === 'uptodate' && 'Up to date'}
                      {item.state === 'update' && (item.changed?.length
                        ? `Changed in the share — ${item.changed.join(', ')}`
                        : 'Changed in the share')}
                      {item.state === 'conflict' && 'Changed in the share — you also edited your copy'}
                      {/* Not "New — not in your library": the list matches by
                          LINEAGE, not by title or content, so all it knows is
                          that this song has not arrived from this share. Saying
                          otherwise was actively wrong for anyone looking at a
                          share built from songs they already own — which is
                          exactly what happens when a friend copies your set and
                          publishes it back. */}
                      {item.state === 'add' && 'Not copied from this share'}
                      {item.state === 'have' && 'In your library — a different version of this song'}
                    </span>
                  </span>
                  {item.state === 'uptodate' ? (
                    <Check size={16} className="text-green-500 shrink-0" />
                  ) : (
                    <span className="flex gap-1 shrink-0">
                      <button onClick={() => onChange(s.id, isAddish(item.state) ? 'add' : 'update')} className={seg(choice !== 'skip')}>
                        {isAddish(item.state) ? 'Add' : 'Update'}
                      </button>
                      <button onClick={() => onChange(s.id, 'skip')} className={seg(choice === 'skip')}>Skip</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {n.have > 0 && (
          <p className={`text-[0.6875rem] ${sub}`}>
            A song you already have is set to <strong>Skip</strong>. Choosing <strong>Add</strong> brings the
            publisher’s version in as a <em>separate</em> song with a numbered name — your own copy is never
            changed or replaced.
          </p>
        )}
        {anyConflict && (
          <p className="text-[0.6875rem] text-amber-500">A song you’ve also edited is set to <strong>Skip</strong>, so your version is kept. Choose <strong>Update</strong> only where you’d rather have the shared one — it replaces yours. Your ink annotations are kept either way.</p>
        )}

        {askBook && book && (
          <div className="flex flex-col gap-1">
            <BookChoice dark={dark} records={records} value={book} onChange={onBook} />
            <p className={`text-[0.6875rem] ${sub}`}>
              {book.on
                ? 'Songs added stay out of My songs until you put one in a set of your own, ink it, or add it to My songs.'
                : 'Songs added go straight into My songs.'}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {/* nothingToDo, not actionable.length: a set whose running order moved
              has no per-song work but still has something to apply, and this
              button used to be dead in exactly that case. applyUpdate
              reconciles the order whatever the rows say. */}
          <button onClick={onApply} disabled={blocked}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${blocked ? (dark ? 'bg-gray-800 text-gray-600' : 'bg-gray-100 text-gray-400') : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
            {busy ? (firstCopy ? 'Copying…' : 'Updating…') : firstCopy ? 'Copy' : 'Update'}
          </button>
          <button onClick={onCancel} disabled={busy}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SongCopyResult({ result, dark, onDone }) {
  const { title, outcome, newTitle } = result;
  const em = `font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`;
  const sub = `text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`;

  let heading, body, btnClass;

  if (outcome === 'copied') {
    heading  = 'Song added';
    body     = <><span className={em}>"{title}"</span> has been added to your library.</>;
    btnClass = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  } else if (outcome === 'duplicated') {
    heading  = 'Song added as duplicate';
    body     = <>Added as <span className={em}>"{newTitle}"</span> so it stays separate from the existing version.</>;
    btnClass = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  } else if (outcome === 'refreshed') {
    heading  = 'Song updated';
    body     = <><span className={em}>"{title}"</span> now matches the publisher's version. Your ink annotations were kept.</>;
    btnClass = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  } else {
    heading  = 'Song skipped';
    body     = <><span className={em}>"{title}"</span> is already in your library — nothing was changed.</>;
    btnClass = dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700';
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{heading}</h2>
        <p className={sub}>{body}</p>
      </div>
      <button onClick={onDone} className={`w-full py-2 text-sm font-medium rounded-xl transition-colors ${btnClass}`}>
        Done
      </button>
    </>
  );
}

// ---- Conflict dialog ---------------------------------------------------------

function ConflictDialog({ conflicts, dark, onResolve }) {
  const [choices, setChoices] = useState(
    () => Object.fromEntries(conflicts.map(c => [c.cloudSong.id, 'skip']))
  );

  const allSkip      = conflicts.every(c => choices[c.cloudSong.id] === 'skip');
  const allDuplicate = conflicts.every(c => choices[c.cloudSong.id] === 'duplicate');

  function applyToAll(choice) {
    setChoices(Object.fromEntries(conflicts.map(c => [c.cloudSong.id, choice])));
  }

  const bdr = dark ? 'border-gray-700' : 'border-gray-200';
  const btnToggle = (active) =>
    `flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
      active
        ? 'bg-indigo-600 border-indigo-600 text-white'
        : dark
          ? 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
          : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => onResolve(null)}
    >
      <div
        className={`w-96 max-h-[80vh] rounded-2xl shadow-2xl flex flex-col ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-6 pt-5 pb-4 shrink-0 border-b ${bdr}`}>
          <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
            {conflicts.length === 1
              ? 'Song already in your library'
              : `${conflicts.length} songs already in your library`}
          </h2>
          <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Choose what to do with each one.
          </p>
          {/* Apply-to-all shortcuts — only useful when multiple conflicts */}
          {conflicts.length > 1 && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => applyToAll('skip')}      className={btnToggle(allSkip)}>Skip all</button>
              <button onClick={() => applyToAll('duplicate')} className={btnToggle(allDuplicate)}>Duplicate all</button>
            </div>
          )}
        </div>

        {/* Per-song rows */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {conflicts.map(({ cloudSong }, i) => {
            const choice = choices[cloudSong.id];
            return (
              <div
                key={cloudSong.id}
                className={`px-6 py-4 ${i < conflicts.length - 1 ? `border-b ${bdr}` : ''}`}
              >
                <p className={`text-sm font-medium truncate mb-2.5 ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {cloudSong.metadata?.title || 'Untitled'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChoices(prev => ({ ...prev, [cloudSong.id]: 'skip' }))}
                    className={btnToggle(choice === 'skip')}
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => setChoices(prev => ({ ...prev, [cloudSong.id]: 'duplicate' }))}
                    className={btnToggle(choice === 'duplicate')}
                  >
                    Duplicate
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 shrink-0 border-t ${bdr} flex gap-2`}>
          <button
            onClick={() => onResolve(choices)}
            className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
          >
            Proceed
          </button>
          <button
            onClick={() => onResolve(null)}
            className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Key -----------------------------------------------------------------------

// What the row symbols mean, above the list — only the ones this set shows, so
// a set with nothing to decide gets a short key.
const KEY = [
  ['plus',     Plus,          'Not on this device — tap to copy'],
  ['equal',    Equal,         'Same as shared'],
  ['notequal', EqualNot,      'Yours is changed'],
  ['newer',    CloudDownload, 'Newer in the share — tap to get it'],
  ['tv',       Tv,            'Arrow points at what plays — tap to switch'],
];

function SongKey({ rows, dark }) {
  const shown = new Set();
  for (const r of rows) {
    shown.add(r.lib === '+' ? 'plus' : r.lib === '=' ? 'equal' : 'notequal');
    if (r.lib === '≠') shown.add('tv');
    if (r.newer) shown.add('newer');
  }
  const items = KEY.filter(([kind]) => shown.has(kind));
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1.5 px-1 pt-2.5 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
      {items.map(([kind, Icon, text]) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span className={`inline-flex items-center justify-center w-[1.125rem] h-[1.125rem] rounded-[0.3125rem] border shrink-0 ${
            kind === 'newer' ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : kind === 'tv' ? 'border-transparent' : dark ? 'border-gray-600 text-gray-200' : 'border-gray-300 text-gray-800'}`}>
            <Icon size={kind === 'tv' ? 15 : 12} strokeWidth={2.5} />
          </span>
          {text}
        </span>
      ))}
    </div>
  );
}

// ---- Song row ----------------------------------------------------------------

// One of the row's two outlined boxes: this device on the left, the share on
// the right. The one Present will play is drawn dark; on a = row both are,
// being the same song. Blue is kept for the one thing waiting on you — a newer
// version in the share.
function SymbolBox({ label, title, plays, accent, onActivate, disabled, dark, children }) {
  const live = !!onActivate && !disabled;
  const look = accent
    ? `${plays ? 'border-2' : 'border'} border-blue-500 ${dark ? 'text-blue-400' : 'text-blue-600'}`
    : plays
      ? `border-2 ${dark ? 'border-white text-white bg-gray-800' : 'border-gray-900 text-gray-900 bg-gray-50'}`
      : `border ${dark ? 'border-gray-600 text-gray-500' : 'border-gray-300 text-gray-400'}`;
  return (
    <button
      type="button" aria-label={label} title={title}
      aria-disabled={!live || undefined}
      onClick={live ? onActivate : undefined}
      className="group flex items-center justify-center shrink-0 bg-transparent"
      style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, cursor: live ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}
    >
      <span className={`flex items-center justify-center w-[2.375rem] h-[2.375rem] rounded-[0.5625rem] select-none ${look} ${live ? 'transition-transform group-active:scale-95' : ''}`}>
        {children}
      </span>
    </button>
  );
}

function SharedSongRow({ song, index, dark, muted, row, onToggleMine, onPresent, onCopy, onCloud, changed, copying }) {
  const meta = song.metadata || {};
  const { lib, newer, inkOnly, playingMine } = row;
  const changedNote = changed?.length ? ` — ${changed.join(', ')}` : '';
  // A = row with nothing newer is the same song on both sides, so both boxes
  // are drawn as playing and there is nothing to switch.
  const same = lib === '=' && !newer;
  const status = lib === '+' ? 'Not on this device'
    : newer === 'decide' ? 'You both changed it — tap the cloud to choose'
    : newer === 'take' ? 'Newer in the share — tap the cloud to get it'
    : lib === '=' ? 'On this device, same as shared'
    : `${inkOnly ? 'You drew on your copy' : 'You changed your copy'} — ${playingMine ? 'yours plays' : 'shared plays'}`;
  const Arrow = onToggleMine ? (playingMine ? ArrowLeft : ArrowRight) : same ? ArrowLeftRight : ArrowRight;

  return (
    <div className={`rounded-xl border p-4 ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <span className={`text-xs pt-0.5 shrink-0 tabular-nums ${muted}`}>{index + 1}</span>
        {/* The title presents the song: the TV is the switch now. */}
        <button type="button" onClick={onPresent} title="Present this song"
          className="flex-1 min-w-0 text-left bg-transparent" style={{ WebkitTapHighlightColor: 'transparent' }}>
          <p className={`font-medium truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
            {meta.title || 'Untitled'}
          </p>
          {meta.artist && (
            <p className={`text-sm mt-0.5 truncate ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{meta.artist}</p>
          )}
          <p className={`text-xs mt-1 ${newer ? (dark ? 'text-blue-400' : 'text-blue-600') : dark ? 'text-gray-400' : 'text-gray-500'}`}>{status}</p>
          {/* The key this song plays in. `song` is enriched, so displayKey already
              folds in any stored viewer key; fall back to the song's original key.
              Shown to the viewer simply as "Key". */}
          {(song.displayKey || meta.key) && (
            <p className={`text-xs mt-1.5 ${muted}`}>Key: {song.displayKey || meta.key}</p>
          )}
        </button>
        <div className="flex items-center shrink-0 -my-1">
          <SymbolBox
            dark={dark}
            label={lib === '+' ? 'Not on this device — copy this song to my library' : lib === '=' ? 'On this device, unchanged' : 'On this device, changed'}
            title={lib === '+' ? 'Add just this song to your Cue library, where you can open, edit, and keep it.'
              : lib === '=' ? 'Your copy hasn’t been changed.'
              : inkOnly ? 'You have drawn on your copy.' : `Your copy differs from the shared one${changedNote}.`}
            plays={same || playingMine}
            onActivate={lib === '+' ? onCopy : undefined}
            disabled={copying}
          >
            {lib === '+' ? <Plus size={19} strokeWidth={2.5} /> : lib === '=' ? <Equal size={19} strokeWidth={2.5} /> : <EqualNot size={19} strokeWidth={2.5} />}
          </SymbolBox>
          <button
            type="button"
            aria-label={onToggleMine ? (playingMine ? 'Playing your version. Switch to the shared one.' : 'Playing the shared version. Switch to yours.') : 'Which version plays'}
            title={onToggleMine ? (playingMine ? 'Present plays your version — tap to play the shared one.' : 'Present plays the shared version — tap to play yours.')
              : lib === '+' ? 'Present plays the shared version — there isn’t one on this device.'
              : same ? 'Your copy and the shared one are the same song.' : 'Present plays the newer shared version.'}
            aria-disabled={!onToggleMine || undefined}
            onClick={onToggleMine}
            className={`relative flex items-center justify-center shrink-0 bg-transparent ${onToggleMine ? (dark ? 'text-white' : 'text-gray-900') : dark ? 'text-gray-600' : 'text-gray-300'}`}
            style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, cursor: onToggleMine ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}
          >
            <Tv size={32} strokeWidth={1.75} />
            <Arrow size={13} strokeWidth={3} className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2" />
          </button>
          <SymbolBox
            dark={dark}
            label={newer === 'decide' ? 'You and the publisher both changed this song — decide what to do'
              : newer === 'take' ? 'Get the newer shared version of this song' : 'The shared version'}
            title={newer === 'decide' ? `The publisher has changed this song, and so have you${changedNote}. Nothing is taken automatically: this opens the list so you can keep yours or take theirs.`
              : newer === 'take' ? `The publisher has changed this song since you copied it${changedNote}. This replaces your copy with their newer version — your ink annotations are kept.`
              : 'The version in the shared set.'}
            plays={!playingMine}
            accent={!!newer}
            onActivate={newer ? onCloud : undefined}
            disabled={copying}
          >
            {newer ? <CloudDownload size={19} strokeWidth={2.25} /> : <Cloud size={19} strokeWidth={2.25} />}
          </SymbolBox>
        </div>
      </div>
    </div>
  );
}
