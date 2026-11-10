import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullSpinner from '../components/PullSpinner.jsx';
import { getSharedSet, describeCloudError } from '../lib/cloud.js';
import { downloadPdfBlob } from '../lib/pdfSync.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { saveSong, saveSet, loadSongs, loadSets, loadPdfBlob, savePdfBlob, loadBooks, saveBookChoice, cacheSharedSet, loadCachedSharedSet, sharePlayMineKey, forgetShareState, clearDraft } from '../utils/storage.js';
import { mergeTaggedSongCustoms } from '../utils/fileIO.js';
import { loadSavedShares, persistSavedShares, syncBookmark } from '../utils/sharedBookmarks.js';
import { contentHash, contentDiffFields, normalizeTitle } from '../utils/contentHash.js';
import { loadAnnotatedSongIds, flushAllAnnotationQueues } from '../utils/annotations.js';
import PresentationView from './PresentationView.jsx';
import EditorView from './EditorView.jsx';
import VersionPicker from '../components/VersionPicker.jsx';
import { readPlayChoices, otherVersions, pickedCopy, playsMine, copyStanding, newerThan, legacyCopyState } from '../utils/shareVersions.js';
import { isMine } from '../utils/books.js';
import { Bookmark, BookmarkCheck, Library, Settings, Tv, Copy, Check, CloudOff, Award, ArrowDownAZ, ChevronLeft, Plus, Cloud, Equal, EqualNot, ArrowLeft, ArrowRight } from 'lucide-react';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY_CHROME, ROUND_SIZE_ACTION, ROUND_SIZE_COMPACT, GLASS, MIN_TOUCH_TARGET } from '../components/RoundButton.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { dismissOnOutside } from '../utils/overlayDismiss.js';
import InstallTips from '../components/InstallTips.jsx';
import BookChoice, { startBook, startOne, bookChoice } from '../components/BookChoice.jsx';

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
// The titles a copy has to stand apart from. Into a book, only that book's: the
// book's name already says whose version it is, and a "(2)" is part of the
// title, carried into Present, printed PDFs and anything shared onward. Into
// My songs, the whole library, as before.
function titlesAt(localSongs, bookId) {
  return new Set(localSongs.filter(s => !bookId || s.bookId === bookId).map(s => normalizeTitle(s.metadata?.title)));
}

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
  const [presenting, setPresenting] = useState(null);      // { songs, startIndex, annotatable, shareOf }
  // Your own version of a song, open in the editor from Present: { song, back },
  // `back` being the Present to return to.
  const [editing, setEditing] = useState(null);
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

  // Local library snapshot — powers the Copy / Up to date / Update button and the
  // Update list. Reloaded whenever the share loads or after a copy/update.
  const [localSongs, setLocalSongs] = useState([]);
  const [localSets, setLocalSets]   = useState([]);
  const [localBooks, setLocalBooks] = useState([]);
  const [updateDialog, setUpdateDialog] = useState(null); // null | { choices } — the Copy list
  const [ownSetNote, setOwnSetNote]     = useState(false); // the reminder on your own set's Copy
  // WHICH VERSION EACH SONG PLAYS, chosen per song rather than for the set.
  //
  // One switch for the whole set could not say the thing people actually want —
  // "follow the share except the two I marked up" — so it is gone. This is a map
  // of share-song id -> { pick, play, kept }: which copy of yours, which way
  // the TV points, and a newer shared version you chose not to take (see
  // shareVersions.js).
  //
  // Kept against the TOKEN, because it is a fact about this share rather than
  // about the library, and it goes when the bookmark goes.
  const PLAY_MINE_KEY = sharePlayMineKey(token);
  const [playChoices, setPlayChoices] = useState(() => {
    try { return readPlayChoices(localStorage.getItem(PLAY_MINE_KEY)); }
    catch { return {}; }
  });
  const setPlayChoicesPersisted = useCallback((next) => {
    setPlayChoices(next);
    try { localStorage.setItem(PLAY_MINE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }, [PLAY_MINE_KEY]);
  const [picking, setPicking] = useState(null); // { song, mode: 'copy' | 'choose' } while your copies are open

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
    setPlayChoices({});
  }

  // Navigate to the main app. Prompt to save if not yet bookmarked/copied.
  function handleOpenCue() {
    if (status !== 'ok' || isBookmarked || hasCopied) {
      navigate('/');
    } else {
      setLeavePrompt(true);
    }
  }

  // ---- Copy-to-library actions ------------------------------------------------

  // Copy one shared song into My Songs, or a book (`book`, bookChoice()'s
  // answer), or, given `beside`, as a second song next to a copy you have and
  // in the same place. The new copy becomes yours for this song and the TV
  // swings to it: you copied it to use it (Howard, 2026-11-10).
  async function handleCopySong(song, { book = null, beside = null } = {}) {
    if (copying) return;
    setCopying(true);
    try {
      const localSongs = await loadSongs();
      const title      = song.metadata?.title || 'Untitled';

      // Already copied from this exact source (matched by provenance): treat as a
      // no-op, same as a title-skip — nothing new is added. A second copy is
      // only ever asked for, from a newer shared version.
      if (!beside && localSongs.some(ls => ls.copiedFrom?.songId === song.id)) {
        setCopyResult({ type: 'song', title, outcome: 'skipped' });
        return;
      }

      // No "already in your library" question, and the copy keeps its title even
      // when one of yours has it. You only get here from the copy window, which
      // has already shown you what you have. Skip used to be the answer that
      // quietly made no copy, leaving your song with no link to this share. And a
      // title changed to "(2)" would read as your edit from then on, since the
      // title is part of what's compared.
      const now = new Date().toISOString();
      const copiedFrom = { songId: song.id, setName: setData?.set?.name || '', copiedAt: now, baseline: contentHash(song) };
      const bookId = beside ? beside.bookId || null : book ? await saveBookChoice(book) : null;
      const where = beside ? { bookId: beside.bookId, mine: beside.mine } : bookId ? { bookId, mine: false } : NO_BOOK;

      // Spread the whole song so type / pdf / fullPage survive (a subset copy
      // silently degraded a shared PDF to an empty text song). A copied pdf gets a
      // fresh id, so its bytes must re-upload on the new owner's next publish.
      const newId = await saveSong({
        ...song,
        ...where,
        id: null,
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

      setPlayChoicesPersisted({ ...playChoices, [song.id]: { pick: newId, play: 'mine' } });
      setHasCopied(true);
      const bookName = bookId && !beside ? (await loadBooks()).find(b => b.id === bookId)?.name : null;
      setCopyResult({ type: 'song', title, outcome: beside ? 'second' : 'copied', bookName });
    } catch (err) {
      console.error('Copy song failed:', err);
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
    // With two copies of one song (a second one copied from a newer version),
    // the newer copy is the one the share tracks.
    for (const ls of localSongs) {
      const src = ls.copiedFrom?.songId;
      if (src && (!bySource.has(src) || (ls.copiedFrom.copiedAt || '') > (bySource.get(src).copiedFrom.copiedAt || ''))) bySource.set(src, ls);
    }
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
      let state, unsure = false;
      if (baseline == null) ({ state, unsure } = legacyCopyState(local, s, incoming === here));
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
      return { shareSong: s, local, state, matchedBy: 'lineage', changed, unsure };
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

  // WHAT A ROW SHOWS — Howard's design (2026-11-10), which split one question
  // into two. Left, this device: + nothing of yours (tap to copy it, or to use
  // a song of yours with its title), = your copy, the same as shared, ≠ your
  // copy, changed or with your ink, ? a choice waiting: more than one copy of
  // yours and none picked yet, or a shared version newer than yours. Tapping
  // it opens your copies (VersionPicker). Middle, the TV: its arrow points left
  // at yours or right at the shared one, and tapping switches. Only yours can
  // be inked and edited in Present. Right, the share: a plain cloud, what the
  // arrow points at when it points right.
  //
  // Same-title songs are never yours by themselves: they are offered, from +
  // or ?, and only count once you pick one.
  //
  // The rest of your versions of each shared song, for the picker.
  const otherVersionsById = useMemo(() => {
    const m = new Map();
    (updatePlan?.songs || []).forEach(x => {
      const linked = x.matchedBy === 'title' ? null : x.local;
      m.set(x.shareSong.id, otherVersions(x.shareSong, localSongs, linked?.id));
    });
    return m;
  }, [updatePlan, localSongs]);
  const songsById = useMemo(() => new Map(localSongs.map(s => [s.id, s])), [localSongs]);
  const bookNames = useMemo(() => new Map(localBooks.map(b => [b.id, b.name])), [localBooks]);

  function setChoice(shareId, patch) {
    setPlayChoicesPersisted({ ...playChoices, [shareId]: { ...playChoices[shareId], ...patch } });
  }
  // A pick as stored: true for your copy of the song, which follows it if it is
  // replaced by a newer copy, else the song's own id.
  const pickValue = (shareId, s) => (s.id === localBySource.get(shareId)?.id ? true : s.id);

  function rowOf(song) {
    const linked = localBySource.get(song.id) || null;
    const others = otherVersionsById.get(song.id) || [];
    const choice = playChoices[song.id];
    const picked = pickedCopy(choice, linked, others, songsById);
    const inked = !!picked && inkedIds.has(picked.id);
    const edited = !!picked && contentHash(picked) !== contentHash(song);
    // Newer than the copy you use, or, with none picked yet, than any copy of
    // this song you have: several copies is when replacing them all is wanted.
    const newer = picked ? newerThan(picked, song, choice)
      : [linked, ...others].filter(Boolean).map(s => newerThan(s, song, choice)).find(Boolean) || null;
    // A copy you never touched that the share has moved past differs from it,
    // but it isn't "changed": it's older.
    const older = !!picked && copyStanding(picked, song) === 'newer';
    const lib = !picked ? (linked ? '?' : '+') : newer ? '?' : edited || inked ? '≠' : '=';
    const playingMine = playsMine(choice, picked, !edited && !inked);
    return {
      lib, picked, linked, newer, inked, edited, older, playingMine,
      others: others.length,
      // The key shown is the key it plays in, and yours may not be the share's.
      playsKey: playingMine ? (picked.displayKey || picked.metadata?.key) : (song.displayKey || song.metadata?.key),
    };
  }

  // The left box: + copies the song (or uses one of yours); anything else opens
  // your copies. On your own set a song you still have needs no copying.
  function openLeft(song) {
    const { lib } = rowOf(song);
    if (lib === '+' && updatePlan?.mine && !missingHere.has(song.id)) return;
    setPicking({ song, mode: lib === '+' ? 'copy' : 'choose' });
  }
  // The TV switches which plays once there's a copy of yours to play. Until then
  // a ? row opens the choice instead.
  function flipTv(song) {
    const r = rowOf(song);
    if (!r.picked) { if (r.lib === '?') setPicking({ song, mode: 'choose' }); return; }
    setChoice(song.id, { pick: pickValue(song.id, r.picked), play: r.playingMine ? 'share' : 'mine' });
  }
  function pickVersion(song, s) {
    setChoice(song.id, { pick: pickValue(song.id, s), play: 'mine' });
    setPicking(null);
  }
  // Keep yours over a newer shared version: the ? goes until it changes again.
  function keepMine(song) {
    const { picked } = rowOf(song);
    setChoice(song.id, { ...(picked ? { pick: pickValue(song.id, picked) } : {}), kept: contentHash(song) });
    setPicking(null);
  }
  // Copy the shared song over copies of yours, keeping their ids, titles, books
  // and ink (takeShareVersion).
  async function copyOver(song, copies, outcome = 'refreshed') {
    if (copying || !copies.length) return;
    setPicking(null);
    setCopying(true);
    try {
      for (const c of copies) await takeShareVersion(song, c);
      const { kept: _kept, ...rest } = playChoices[song.id] || {};
      setPlayChoicesPersisted({ ...playChoices, [song.id]: rest });
      setHasCopied(true);
      await refreshLocal();
      setCopyResult({ type: 'song', title: song.metadata?.title || 'Untitled', outcome, count: copies.length });
    } catch (err) {
      console.error('Copy over failed:', err);
    } finally {
      setCopying(false);
    }
  }
  // Your copy of a shared song, or another song of yours, as the picker names it.
  const versionLabel = (song, s, linked) => {
    const ink = inkedIds.has(s.id) ? ', with your ink' : '';
    const standing = copyStanding(s, song);
    if (s === linked || standing) return `Your copy${standing === 'newer' ? '' : contentHash(s) !== contentHash(song) ? ', changed' : ', same as shared'}${ink}`;
    return `${isMine(s) ? 'Your song' : `In “${bookNames.get(s.bookId) || 'a book'}”`}${ink}`;
  };

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
    const shareOf = new Map();   // your song's id -> the shared song it plays for
    const songs = base.map(s => {
      const r = rowOf(s);
      const local = r.playingMine ? r.picked : null;
      if (local) { annotatable.add(local.id); shareOf.set(local.id, s.id); return local; }
      return s;
    });
    setPresenting({ songs, startIndex, annotatable, shareOf });
  }

  // Changing your own version from Present (Edit, Full Page) keeps the TV
  // pointed at yours: the change makes yours differ from the shared one, and a
  // song never set would otherwise swing back to the shared version.
  function stayOnYours(song) {
    const shareId = presenting?.shareOf?.get(song.id);
    if (shareId && !playChoices[shareId]?.play) setChoice(shareId, { pick: pickValue(shareId, song), play: 'mine' });
  }

  // Present's Edit, on a song playing your own version.
  function editFromPresent(song, index) {
    stayOnYours(song);
    setEditing({ song, back: { ...presenting, startIndex: index } });
    setPresenting(null);
  }

  // Present's Full Page button, on a song playing your own version — saved to
  // your song, as in the Library's Present (Howard, 2026-11-10).
  async function fullPageFromPresent(songId, fullPage) {
    const song = presenting?.songs.find(s => s.id === songId);
    if (song) stayOnYours(song);
    setPresenting(p => p && { ...p, songs: p.songs.map(s => (s.id === songId ? { ...s, fullPage } : s)) });
    const stored = (await loadSongs()).find(s => s.id === songId);
    if (stored) await saveSong({ ...stored, fullPage });
    refreshLocal();
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
      // Your original (the shared song's own id) isn't a copy of anything:
      // its link, if any, is left as it is.
      copiedFrom: local.id === s.id ? undefined : { ...(local.copiedFrom || {}), songId: s.id, baseline: contentHash(s) },
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

  // `book` is the Update list's book choice (bookChoice()), for songs added from
  // a share whose copies aren't in a book yet; null for none.
  async function applyUpdate(choices, book = null) {
    if (!updatePlan || !setData || copying) return;
    setCopying(true);
    try {
      const now = new Date().toISOString();
      const shareToLocalId = new Map();
      let updated = 0, added = 0, skipped = 0;
      // A song added goes into the book the set's copies are in, or the one
      // chosen in the list — made only if something is actually added.
      const adding = updatePlan.songs.some(x => (isAddish(x.state) || x.state === 'conflict') && (choices?.[x.shareSong.id] ?? defaultUpdateAction(x.state)) === 'add');
      const bookId = updatePlan.bookId || (book && adding && !updatePlan.mine ? await saveBookChoice(book) : null);
      const bookFields = bookId ? { bookId, mine: false } : NO_BOOK;
      const allTitles = titlesAt(localSongs, bookId);

      for (const item of updatePlan.songs) {
        const s = item.shareSong;
        const action = choices?.[s.id] ?? defaultUpdateAction(item.state);

        if ((item.state === 'update' || item.state === 'conflict') && action === 'update' && item.local) {
          await takeShareVersion(s, item.local);
          shareToLocalId.set(s.id, item.local.id);
          updated++;
        } else if ((isAddish(item.state) || item.state === 'conflict') && action === 'add') {
          // A song you also edited, copied as a second song: yours stays as it
          // is but stops being the copy of this one — it's your own now — so
          // the new copy is the one this share tracks from here on.
          if (item.state === 'conflict' && item.local) {
            await saveSong({ ...item.local, copiedFrom: null, updatedAt: item.local.updatedAt });
          }
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

  // Your own set, opened through its link on a device that's missing some of
  // its songs: put them back as they are published, under their own ids — so
  // the set finds them again and they are still the songs you published, not
  // copies — and back into the set where they belong.
  async function putBackOwnSongs() {
    if (!updatePlan?.mine || !setData || copying) return;
    const missing = updatePlan.songs.filter(x => x.state === 'add').map(x => x.shareSong);
    if (!missing.length) return;
    setCopying(true);
    try {
      for (const s of missing) {
        await saveSong({ ...s, ...NO_BOOK, copiedFrom: null, pdf: pdfRefForCopy(s.pdf), updatedAt: s.updatedAt });
        if (s.type === 'pdf') {
          if (s.ownerId) { try { await downloadPdfBlob(s.id, s.ownerId); } catch { /* keep cached */ } }
          const blob = await loadPdfBlob(s.id);
          if (blob) await savePdfBlob(s.id, blob);
        }
      }
      mergeTaggedSongCustoms(missing);
      const own = (await loadSets()).find(st => st.id === setData.set?.id);
      if (own) {
        const ids = [...(own.songIds || [])];
        const order = setData.songs.map(x => x.id);
        for (const s of missing) {
          if (ids.includes(s.id)) continue;
          // After the song before it in the published order, if that's here.
          const before = order.slice(0, order.indexOf(s.id)).reverse().find(id => ids.includes(id));
          ids.splice(before ? ids.indexOf(before) + 1 : 0, 0, s.id);
        }
        await saveSet({ ...own, markUsed: false, songIds: ids, preserveTimestamps: true });
      }
      setOwnSetNote(false);
      await refreshLocal();
      setCopyResult({ type: 'update', updated: 0, added: missing.length, skipped: 0, putBack: true, setName: setData.set?.name || '' });
    } catch (err) {
      console.error('Put back own songs failed:', err);
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
                className={`h-11 px-4 text-sm rounded-full border transition-colors ${dark ? 'border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-800' : 'border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300'}`}
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
              className="h-11 px-5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors"
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

  // The editor, for your own version of a song opened from Present. Back goes to
  // the set; the editor's return-to-Present button goes back to the song.
  if (editing) {
    return (
      <EditorView
        key={editing.song.id}
        song={editing.song}
        backLabel="Back to the set"
        onBack={() => { setEditing(null); refreshLocal(); }}
        onSaved={(saved) => {
          clearDraft();
          refreshLocal();
          if (saved && typeof saved === 'object') setEditing(e => e && { ...e, song: saved });
        }}
        onReturn={(updated) => {
          const { back } = editing;
          setPresenting({ ...back, songs: back.songs.map(s => (s.id === updated.id ? updated : s)) });
          setEditing(null);
          refreshLocal();
        }}
        onPresent={(list, idx = 0) => {
          if (!list?.length) return;
          setPresenting({ songs: list, startIndex: idx, annotatable: new Set(list.map(s => s.id)), shareOf: editing.back.shareOf });
          setEditing(null);
        }}
      />
    );
  }

  if (presenting) {
    return (
      <PresentationView
        songs={presenting.songs}
        startIndex={presenting.startIndex}
        onExit={() => setPresenting(null)}
        showEdit={!!presenting.annotatable?.size}
        editableIds={presenting.annotatable}
        onEdit={editFromPresent}
        onSetFullPage={fullPageFromPresent}
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
            <button onClick={continueToSet} className="w-full min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center rounded-full text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
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
          {/* No whole-set Present button: Howard never used it (2026-11-01).
              Tapping a song's title presents the set from that song. */}
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
          The set's Copy button shares its line, on the right, and the
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
            {/* ONE BUTTON, ALWAYS "COPY" (Howard, 2026-11-09). It used to switch
                between Copy, Update, Up to date and Your set, and "Update" read as
                the app's own Update Cue. A shared set is always the publisher's
                latest, so the only question is what to copy into your library —
                and every tap opens the list that asks it (UpdateDialog). What's
                waiting shows as a count and the highlight, never a new word.
                Above the songs' own buttons, not in the header (Howard,
                2026-11-01): the set's action sits over the column it sums up. */}
            {enriched.length > 0 && (() => {
              const plan = updatePlan;
              if (plan?.mine) {
                // Your own set, opened through its own link. Copying it would
                // duplicate your library, so it looks greyed — but a tap still
                // says why, and puts back any of its songs missing here.
                return (
                  <RoundButton size={ROUND_SIZE_COMPACT} pill dim
                    label="Copy — this is your own published set"
                    title="This is your own published set. Tap to see why there is nothing to copy."
                    fill={headerFill} disabled={copying}
                    onActivate={() => setOwnSetNote(true)}>
                    <Library size={17} /><PillLabel>Copy</PillLabel>
                  </RoundButton>
                );
              }
              // Waiting: songs new to the set or newer than your copy, once
              // you've copied it. A set never copied is all new — no count.
              const copiedBefore = !!plan?.localSet;
              const waiting = copiedBefore ? (plan.songs || []).filter(x => x.state === 'add' || x.state === 'update' || x.state === 'conflict').length : 0;
              const fresh = copiedBefore && (waiting > 0 || plan.orderChanged);
              return (
                <RoundButton size={ROUND_SIZE_COMPACT} pill
                  label={waiting ? `Copy — ${waiting} song${waiting === 1 ? '' : 's'} new or changed since you copied this set` : 'Copy songs to my library'}
                  title={fresh
                    ? (waiting ? `${waiting} song${waiting === 1 ? ' is' : 's are'} new or changed since you copied this set. Choose what to copy.` : 'The set’s running order has changed since you copied it.')
                    : copiedBefore ? 'Your copies match this set. Open it to look through what you have.'
                    : 'Copy this set and its songs into your library. You choose which songs first.'}
                  fill={fresh ? SHARE_NEWER : headerFill} disabled={copying || !plan}
                  onActivate={() => setUpdateDialog({ choices: {} })}>
                  <Library size={17} /><PillLabel>{waiting ? `Copy · ${waiting}` : 'Copy'}</PillLabel>
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
                onLeft={() => openLeft(song)}
                onTv={() => flipTv(song)}
                onPresent={() => present(displayed, idx)}
                ownCopy={updatePlan?.mine && !missingHere.has(song.id)}
                changed={diffBySong.get(song.id)}
                copying={copying}
              />
            ))
          )}
        </div>
      </div>

      {picking && (() => {
        const { song, mode } = picking;
        const r = rowOf(song);
        const list = [...(r.linked ? [r.linked] : []), ...(otherVersionsById.get(song.id) || [])];
        const versions = list.map(s => ({ song: s, standing: copyStanding(s, song), label: versionLabel(song, s, r.linked) }));
        // A copy goes where this share's copies went, if they went into a book.
        const shareBook = updatePlan?.bookId && localBooks.some(b => b.id === updatePlan.bookId) ? updatePlan.bookId : '';
        return (
          <VersionPicker
            key={`${song.id}:${mode}`}
            dark={dark}
            mode={mode}
            song={song}
            versions={versions}
            picked={r.picked}
            newer={mode === 'choose' ? r.newer : null}
            inkedIds={inkedIds}
            records={localBooks}
            startingBook={shareBook ? { ...startOne(localBooks, shareBook), on: true } : startOne(localBooks)}
            onPick={(s) => pickVersion(song, s)}
            onCopy={(book) => { setPicking(null); handleCopySong(song, { book }); }}
            onCopyOver={(c) => copyOver(song, [c], copyStanding(c, song) === 'mine' ? 'putBack' : 'refreshed')}
            onCopySecond={() => { setPicking(null); handleCopySong(song, { beside: r.picked }); }}
            onKeep={() => keepMine(song)}
            onReplaceAll={() => copyOver(song, versions.filter(v => v.standing === 'newer').map(v => v.song))}
            onClose={() => setPicking(null)}
          />
        );
      })()}

      {/* Your own set's Copy: why there is nothing to copy, and the way to put
          back any of its songs this device is missing. */}
      {ownSetNote && updatePlan?.mine && (() => {
        const missing = updatePlan.songs.filter(x => x.state === 'add').length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" {...dismissOnOutside(() => setOwnSetNote(false), !copying)}>
            <div onClick={e => e.stopPropagation()} className={`w-[22rem] max-w-full rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
              <div className="flex flex-col gap-1">
                <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>This is your own set</h2>
                <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                  You published “{setData?.set?.name}”, and its songs are yours, so there’s nothing to copy. Copying it would give you a second copy of every song.
                </p>
                {missing > 0 && (
                  <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {missing === 1 ? '1 of its songs isn’t' : `${missing} of its songs aren’t`} on this device. You can put {missing === 1 ? 'it' : 'them'} back, as published, into the set.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {missing > 0 && (
                  <button onClick={putBackOwnSongs} disabled={copying}
                    className="flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-full transition-colors">
                    {copying ? 'Putting back…' : `Put back ${missing === 1 ? '1 song' : `${missing} songs`}`}
                  </button>
                )}
                <button onClick={() => setOwnSetNote(false)} disabled={copying}
                  className={missing > 0
                    ? `flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium rounded-full transition-colors border ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`
                    : 'flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors'}>
                  {missing > 0 ? 'Not now' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* The Copy list */}
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
            // Copy all takes what's waiting — new songs and newer versions of
            // copies you haven't touched. A song you also edited, or one you
            // have your own version of, keeps its choice: neither is waiting,
            // and Copy all mustn't write over your work or double your songs.
            choices: Object.fromEntries((updatePlan?.songs || []).map(x => [
              x.shareSong.id,
              kind === 'skip' || x.state === 'uptodate' ? 'skip'
                : x.state === 'add' ? 'add' : x.state === 'update' ? 'update'
                : (d.choices?.[x.shareSong.id] ?? defaultUpdateAction(x.state)),
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
                className="flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors"
              >
                Save &amp; go
              </button>
              <button
                onClick={() => navigate('/')}
                className={`flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium rounded-full transition-colors border ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
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
            {copyResult.type === 'song' && <SongCopyResult result={copyResult} dark={dark} onDone={() => setCopyResult(null)} />}
            {copyResult.type === 'update' && <UpdateResult result={copyResult} dark={dark} onDone={() => setCopyResult(null)} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Copy result sub-views ---------------------------------------------------

// A COPY WITH NO BASELINE — made before v1.5.0 (2026-09-03), when Cue recorded
// where a song came from but not what it looked like then. A plain hash compare
// cannot say WHO moved, and it used to call every difference "newer in the
// share": Howard's own edit to a three-month-old copy showed the blue arrow, and
// one tap would have replaced his version with the librarian's.
//
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
  const { updated, added, skipped, bookName, copied, setName, putBack } = result;
  const parts = [];
  if (updated) parts.push(`${updated} newer version${updated === 1 ? '' : 's'} copied over your older cop${updated === 1 ? 'y' : 'ies'}`);
  if (added)   parts.push(putBack ? `${added} song${added === 1 ? '' : 's'} put back` : `${added} copied`);
  if (skipped) parts.push(copied ? `${skipped} of yours used instead` : `${skipped} left as ${skipped === 1 ? 'it was' : 'they were'}`);
  const em = dark ? 'text-gray-200' : 'text-gray-700';
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{putBack ? 'Songs put back' : copied ? 'Set copied' : 'Copied'}</h2>
        <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {copied && <>Created set <span className={`font-medium ${em}`}>“{setName}”</span>. </>}
          {putBack && <>Back in your set <span className={`font-medium ${em}`}>“{setName}”</span>: </>}
          {parts.length ? parts.join(', ') : copied ? 'Every song was one you have' : 'Nothing needed copying'}
          {bookName ? <>, the songs copied in the book <span className={`font-medium ${em}`}>“{bookName}”</span></> : null}.
        </p>
      </div>
      <button onClick={onDone} className="w-full min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors">Done</button>
    </>
  );
}

// The Copy list: one row per song, and whether to copy it.
//
// A shared set always shows the publisher's latest, so nothing here is an
// "update" — that word is the app's own (Update Cue). The question is only
// what to copy into your library. Most rows are Copy or Leave it: a song not
// copied yet, or a newer version of a copy you haven't touched (which simply
// replaces it, ink and all). Two kinds of row ask how, because your own work
// is at stake: a song you also edited (Copy over mine, Copy as a second song,
// Leave mine) and a song of yours with the same title (Copy as a second song,
// or leave it — never over the top).
//
// A share never copied opens here too: applying it makes the set. Where the
// songs it adds have no book yet it asks (`book`, BookChoice's value; ticked
// when never copied).
function UpdateDialog({ plan, choices, setName, dark, busy, focusId, records = [], book, onBook, onChange, onSetAll, onCancel, onApply }) {
  // Arriving from ONE row's button, in a list that can be 83 rows long.
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
  const waiting = plan.songs.filter(s => s.state === 'add' || s.state === 'update').length;
  const anyConflict = plan.songs.some(s => s.state === 'conflict');
  // WHAT IS IN THIS LIST, before reading a single row.
  const n = plan.songs.reduce((a, x) => { const k = x.unsure ? 'unsure' : x.state; return { ...a, [k]: (a[k] || 0) + 1 }; }, {});
  const summary = [
    n.add      && `${n.add} not copied yet`,
    n.update   && `${n.update} newer than your copy`,
    n.conflict && `${n.conflict} you’ve also edited`,
    n.unsure   && `${n.unsure} that differ${n.unsure === 1 ? 's' : ''} from yours`,
    n.have     && `${n.have} you have your own version of`,
    n.uptodate && `${n.uptodate} same as yours`,
  ].filter(Boolean).join(' · ');
  const firstCopy = !plan.localSet && !plan.mine;
  const chosenOf = (item) => choices?.[item.shareSong.id] ?? defaultUpdateAction(item.state);
  const copying = plan.songs.filter(x => x.state !== 'uptodate' && chosenOf(x) !== 'skip').length;
  // Something to apply: songs to copy, a running order that moved (applyUpdate
  // reconciles it whatever the rows say), or a first copy made of songs you
  // already have, which still makes the set.
  const canApply = copying > 0 || plan.orderChanged || (firstCopy && plan.songs.some(x => x.local));
  const nothingToDo = actionable.length === 0 && !plan.orderChanged;
  const askBook = !plan.bookId && !plan.mine && plan.songs.some(x => isAddish(x.state));
  const blocked = busy || !canApply || (askBook && book?.on && !bookChoice(book));
  const label = busy ? 'Copying…'
    : copying ? `Copy ${copying} song${copying === 1 ? '' : 's'}`
    : firstCopy ? 'Copy the set'
    : plan.orderChanged ? 'Copy the new order'
    : 'Copy';

  return (
    /* No scrim, as everywhere else: this screen is about the set behind it, and
       the songs are what you are deciding about. */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" {...dismissOnOutside(onCancel, !busy)}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${em}`}>{firstCopy ? 'Copy' : 'Copy from'} “{setName}”</h2>
          <p className={`text-xs ${sub}`}>{firstCopy
            ? 'Copies this set and its songs into your library. Choose which songs to copy; a song you leave out that you already have is used in its place. Your own songs are never changed.'
            : 'This shared set always shows the latest. Choose what to copy into your library: a newer song replaces your older copy, and keeps your ink. Your own songs are never changed.'}</p>
        </div>

        {summary && <p className={`text-xs font-medium ${em}`}>{summary}</p>}
        {plan.orderChanged && (
          <p className={`text-xs ${sub}`}>The set’s running order has changed.</p>
        )}

        {/* Set every row at once: Copy all takes what's waiting (not your own
            versions, nor songs you've also edited); Leave all leaves the lot. */}
        {actionable.length > 1 && (
          <div className="flex items-center gap-2">
            <span className={`text-[0.6875rem] ${sub}`}>All:</span>
            {waiting > 0 && <button onClick={() => onSetAll('take')} className={seg(false)} title="Copy every song not copied yet, and every newer version of a copy you haven't changed">Copy all</button>}
            <button onClick={() => onSetAll('skip')} className={seg(false)}>Leave all</button>
          </div>
        )}

        {nothingToDo ? (
          <p className={`text-sm ${sub}`}>Your copies already match this set. Nothing to copy.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plan.songs.map((item, i) => {
              const s = item.shareSong;
              const title = s.metadata?.title || 'Untitled';
              const choice = chosenOf(item);
              // Rows that ask how put their three (or long) choices under the title.
              const asks = item.state === 'conflict' || item.state === 'have';
              const choicesOf = item.state === 'conflict'
                ? [['update', 'Copy over mine'], ['add', 'Copy as a second song'], ['skip', 'Leave mine']]
                : item.state === 'have'
                ? [['add', 'Copy as a second song'], ['skip', 'Leave it']]
                : [[item.state === 'add' ? 'add' : 'update', 'Copy'], ['skip', 'Leave it']];
              return (
                <li
                  key={i}
                  ref={s.id === focusId ? focusRow : undefined}
                  className={`flex ${asks ? 'flex-col items-stretch' : 'items-center justify-between'} gap-2 p-2.5 rounded-xl border ${
                    s.id === focusId ? 'border-blue-500 ring-1 ring-blue-500' : dark ? 'border-gray-700' : 'border-gray-200'
                  }`}
                >
                  <span className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate ${em}`}>{title}</span>
                    <span className={`text-[0.6875rem] ${item.state === 'conflict' ? 'text-blue-500' : sub}`}>
                      {item.state === 'uptodate' && 'Same as yours'}
                      {item.state === 'update' && (item.changed?.length
                        ? `Newer than your copy — ${item.changed.join(', ')}`
                        : 'Newer than your copy')}
                      {item.state === 'conflict' && (item.unsure
                        ? 'Yours and theirs differ — Cue can’t tell who changed it'
                        : 'Newer than your copy — and you’ve edited yours')}
                      {/* Not "not in your library": all Cue knows is that no
                          song of yours matches it by where it came from, its
                          content, or its title. */}
                      {item.state === 'add' && 'Not copied yet'}
                      {item.state === 'have' && 'You have your own version of this song'}
                    </span>
                  </span>
                  {item.state === 'uptodate' ? (
                    <Check size={16} className="text-green-500 shrink-0" />
                  ) : (
                    <span className={`flex flex-wrap gap-1 ${asks ? '' : 'shrink-0'}`}>
                      {choicesOf.map(([action, words]) => (
                        <button key={action} onClick={() => onChange(s.id, action)} className={seg(choice === action)}>{words}</button>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {n.have > 0 && (
          <p className={`text-[0.6875rem] ${sub}`}>
            A song you have your own version of is left as it is. <strong>Copy as a second song</strong> brings
            the publisher’s version in beside yours{plan.bookId || (askBook && book?.on)
              ? ', in the book, under its own title'
              : ', with a numbered name'} — yours is never changed or replaced.
          </p>
        )}
        {anyConflict && (
          <p className="text-[0.6875rem] text-amber-500">A song you’ve also edited is set to <strong>Leave mine</strong>, so your version is kept. <strong>Copy over mine</strong> replaces yours with theirs; <strong>Copy as a second song</strong> keeps both. Your ink stays on yours either way.</p>
        )}

        {askBook && book && (
          <div className="flex flex-col gap-1">
            <BookChoice dark={dark} records={records} value={book} onChange={onBook} />
            <p className={`text-[0.6875rem] ${sub}`}>
              {book.on
                ? 'Songs copied stay out of My songs until you put one in a set of your own, ink it, or add it to My songs.'
                : 'Songs copied go straight into My songs.'}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onApply} disabled={blocked}
            className={`flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium rounded-full transition-colors ${blocked ? (dark ? 'bg-gray-800 text-gray-600' : 'bg-gray-100 text-gray-400') : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
            {label}
          </button>
          <button onClick={onCancel} disabled={busy}
            className={`flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium rounded-full transition-colors border ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SongCopyResult({ result, dark, onDone }) {
  const { title, outcome, newTitle, count = 1, bookName } = result;
  const em = `font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`;
  const sub = `text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`;

  let heading, body, btnClass;

  if (outcome === 'copied') {
    heading  = 'Song added';
    body     = bookName
      ? <><span className={em}>"{title}"</span> has been added to the book <span className={em}>“{bookName}”</span>, and plays from there.</>
      : <><span className={em}>"{title}"</span> has been added to My songs, and plays from there.</>;
    btnClass = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  } else if (outcome === 'duplicated') {
    heading  = 'Song added as duplicate';
    body     = <>Added as <span className={em}>"{newTitle}"</span> so it stays separate from the existing version.</>;
    btnClass = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  } else if (outcome === 'second') {
    heading  = 'Second copy added';
    body     = <>The newer <span className={em}>"{title}"</span> was copied beside yours, and is the one you use for this song now. Your older copy is still there.</>;
    btnClass = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  } else if (outcome === 'putBack') {
    heading  = 'Shared version copied';
    body     = <><span className={em}>"{title}"</span> is the shared version again. Your ink annotations were kept.</>;
    btnClass = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  } else if (outcome === 'refreshed') {
    heading  = 'Newer version copied';
    body     = count > 1
      ? <>All {count} copies of <span className={em}>"{title}"</span> now match the publisher's version. Your ink annotations were kept.</>
      : <><span className={em}>"{title}"</span> now matches the publisher's version. Your ink annotations were kept.</>;
    btnClass = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  } else {
    heading  = 'Song skipped';
    body     = <><span className={em}>"{title}"</span> is already in your library — nothing was changed.</>;
    btnClass = `border ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{heading}</h2>
        <p className={sub}>{body}</p>
      </div>
      <button onClick={onDone} className={`w-full min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium rounded-full transition-colors ${btnClass}`}>
        Done
      </button>
    </>
  );
}

// The ? of a row with a choice to make: lucide's question mark without its
// circle — a round ? is Cue's Help button — drawn to sit in the square box
// like + and =, at the same size and line weight.
const Q_BOX = 13;   // the viewBox the glyph is cropped to, in lucide's 24 units
function QuestionMark({ size = 24, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox={`5.5 5 ${Q_BOX} ${Q_BOX}`} fill="none" stroke="currentColor"
      strokeWidth={(strokeWidth * Q_BOX) / 24} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

// ---- Key -----------------------------------------------------------------------

// What the row symbols mean, above the list — only the ones this set shows, so
// a set with nothing to decide gets a short key.
const KEY = [
  ['plus',     Plus,          'Not on this device — tap to copy'],
  ['equal',    Equal,         'Yours, same as shared'],
  ['differs',  EqualNot,      'Yours, changed or with your ink'],
  ['choose',   QuestionMark,  'A choice to make — tap it'],
  ['tv',       Tv,            'Arrow: left plays yours, right plays shared — tap to switch'],
];

function SongKey({ rows, dark }) {
  const shown = new Set();
  for (const r of rows) {
    shown.add(r.lib === '+' ? 'plus' : r.lib === '=' ? 'equal' : r.lib === '≠' ? 'differs' : 'choose');
    if (r.picked) shown.add('tv');
  }
  const items = KEY.filter(([kind]) => shown.has(kind));
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1.5 px-1 pt-2.5 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
      {items.map(([kind, Icon, text]) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span className={`inline-flex items-center justify-center w-[1.125rem] h-[1.125rem] rounded-[0.3125rem] border shrink-0 ${
            kind === 'tv' ? 'border-transparent' : dark ? 'border-gray-600 text-gray-200' : 'border-gray-300 text-gray-800'}`}>
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
// the right. The one Present will play is drawn dark. Blue is kept for the one
// thing waiting on you: a newer version in the share.
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

// What a row says under its title, in words.
function rowStatus({ lib, picked, newer, inked, edited, older, others, playingMine }) {
  if (newer === 'both') return 'Changed in the share, and by you — tap ? to decide';
  if (newer) return 'Newer in the share — tap ? to decide';
  if (lib === '+') return others ? `Not on this device — you have ${others === 1 ? 'a song' : `${others} songs`} with this title` : 'Not on this device';
  if (!picked) return `${others + 1} versions of yours — tap ? to choose one`;
  const what = older ? 'Yours, an older version' : edited ? 'Yours, changed' : 'Yours';
  const yours = inked ? `${what}, with your ink` : edited || older ? what : 'Yours, same as shared';
  return `${yours} — ${playingMine ? 'yours plays' : 'shared plays'}`;
}

function SharedSongRow({ song, index, dark, muted, row, onLeft, onTv, onPresent, ownCopy, changed, copying }) {
  const meta = song.metadata || {};
  const { lib, picked, newer, edited, playingMine, playsKey } = row;
  const changedNote = changed?.length ? ` — ${changed.join(', ')}` : '';
  const tvLive = !!picked || lib === '?';
  const leftLive = !(lib === '+' && ownCopy);

  return (
    <div className={`rounded-xl border p-4 ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <span className={`text-xs pt-0.5 shrink-0 tabular-nums ${muted}`}>{index + 1}</span>
        {/* The title presents the song: the TV is the switch. */}
        <button type="button" onClick={onPresent} title="Present this song"
          className="flex-1 min-w-0 text-left bg-transparent" style={{ WebkitTapHighlightColor: 'transparent' }}>
          <p className={`font-medium truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
            {meta.title || 'Untitled'}
          </p>
          {meta.artist && (
            <p className={`text-sm mt-0.5 truncate ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{meta.artist}</p>
          )}
          <p className={`text-xs mt-1 ${newer ? (dark ? 'text-blue-400' : 'text-blue-600') : dark ? 'text-gray-400' : 'text-gray-500'}`}>{rowStatus(row)}</p>
          {/* The key this song plays in. `song` is enriched, so displayKey already
              folds in any stored viewer key; rowOf falls back to the song's
              original key, or takes yours when yours plays. Shown to the viewer
              simply as "Key". */}
          {playsKey && (
            <p className={`text-xs mt-1.5 ${muted}`}>Key: {playsKey}</p>
          )}
        </button>
        <div className="flex items-center shrink-0 -my-1">
          <SymbolBox
            dark={dark}
            label={lib === '+' ? 'Not on this device — copy it'
              : newer ? 'The shared version is newer than yours — decide what to do'
              : lib === '?' ? 'More than one version of yours — choose one'
              : lib === '≠' ? 'Yours, changed or with your ink — see your versions'
              : 'Yours, the same as shared — see your versions'}
            title={lib === '+' ? 'Copy this song into My Songs or a book, or use one of yours with this title.'
              : newer === 'both' ? `The shared version is newer than yours, and you changed yours too${changedNote}. Tap to copy it over yours, copy it as a second song, or keep yours.`
              : newer ? `The shared version is newer than yours${changedNote}. Tap to copy it over yours, copy it as a second song, or keep yours.`
              : lib === '?' ? 'You have more than one version of this song. Tap to choose the one that goes with this share.'
              : lib === '≠' ? (edited ? `Your copy differs from the shared one${changedNote}.` : 'You have drawn on your copy.') + ' Tap to see your versions.'
              : 'Your copy hasn’t been changed. Tap to see your versions.'}
            plays={playingMine}
            accent={!!newer}
            onActivate={leftLive ? onLeft : undefined}
            disabled={copying}
          >
            {lib === '+' ? <Plus size={19} strokeWidth={2.5} /> : lib === '=' ? <Equal size={19} strokeWidth={2.5} /> : lib === '≠' ? <EqualNot size={19} strokeWidth={2.5} /> : <QuestionMark size={19} strokeWidth={2.5} />}
          </SymbolBox>
          <button
            type="button"
            aria-label={picked ? `Playing ${playingMine ? 'your' : 'the shared'} version. Switch.` : lib === '?' ? 'Choose a version of yours first' : 'Playing the shared version'}
            title={picked ? `Present plays ${playingMine ? 'yours — you can ink and edit it there' : 'the shared version'}. Tap to switch.`
              : lib === '?' ? 'Choose a version of yours, then the TV can point at it.'
              : 'Present plays the shared version. Copy the song to play your own.'}
            aria-disabled={!tvLive || undefined}
            onClick={tvLive ? onTv : undefined}
            className={`relative flex items-center justify-center shrink-0 bg-transparent ${tvLive ? (dark ? 'text-white' : 'text-gray-900') : dark ? 'text-gray-600' : 'text-gray-300'}`}
            style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, cursor: tvLive ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}
          >
            <Tv size={32} strokeWidth={1.75} />
            {(() => { const Arrow = playingMine ? ArrowLeft : ArrowRight; return <Arrow size={13} strokeWidth={3} className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2" />; })()}
          </button>
          <SymbolBox dark={dark} label="The shared version" title="The version in the shared set." plays={!playingMine}>
            <Cloud size={19} strokeWidth={2.25} />
          </SymbolBox>
        </div>
      </div>
    </div>
  );
}
