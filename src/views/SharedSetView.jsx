import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getSharedSet, describeCloudError } from '../lib/cloud.js';
import { downloadPdfBlob } from '../lib/pdfSync.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { saveSong, saveSet, loadSongs, loadSets, loadPdfBlob, savePdfBlob } from '../utils/storage.js';
import { mergeCustomChords } from '../utils/fileIO.js';
import PresentationView from './PresentationView.jsx';
import { Bookmark, BookmarkCheck, Library, Settings, Tv, Copy, Check, RefreshCw } from 'lucide-react';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY_CHROME, ROUND_SIZE_ACTION, ROUND_SIZE_COMPACT } from '../components/RoundButton.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';

// Visible label inside a RoundButton pill (white via RoundButton's text-white).
function PillLabel({ children }) {
  return <span className="text-sm font-medium leading-none whitespace-nowrap">{children}</span>;
}

// The Cue app icon — indigo rounded square with a white "C" arc, matching
// public/cue-icon.svg (the home-screen mark). Inlined as SVG so it stays crisp
// at small sizes, needs no asset load, and works offline. Its own indigo fill
// reads on both light and dark headers.
function CueMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Cue" className="shrink-0 block">
      <rect width="100" height="100" rx="23" fill="#4f46e5" />
      <path d="M66.7 30.1 A26 26 0 1 0 66.7 69.9" fill="none" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" />
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

// Shared-with-me bookmarks: { token, setName, savedAt, lastLoadedAt }[]
export const SHARED_WITH_ME_KEY = 'cue:shared_with_me';
function loadSavedShares() {
  try { return JSON.parse(localStorage.getItem(SHARED_WITH_ME_KEY) || '[]'); } catch { return []; }
}
function persistSavedShares(arr) { localStorage.setItem(SHARED_WITH_ME_KEY, JSON.stringify(arr)); }

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

function normalizeTitle(str) {
  return (str || '').toLowerCase().trim();
}

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

// Stable signature + hash of a song's copyable content. A baseline hash is saved
// at copy time (in copiedFrom.baseline); comparing it against the incoming share
// version and the local copy tells "up to date" from a publisher change vs a
// local edit — so Update never silently clobbers your own edits.
function contentSig(song) {
  const m = song?.metadata || {};
  return JSON.stringify({
    t: song?.text || '',
    md: { title: m.title || '', artist: m.artist || '', key: m.key || '', tempo: m.tempo || '', duration: m.duration || '', timeSig: m.timeSig || '', youtubeUrl: m.youtubeUrl || '' },
    cs: song?.chordStyle || '', pm: song?.previewMode || '',
    fp: !!song?.fullPage, em: !!song?.embed, type: song?.type || 'text',
  });
}
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
function contentHash(song) { return hashStr(contentSig(song)); }

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
  const [viewerKeys] = useState(loadViewerKeys);

  // Bookmark state
  const [savedShares, setSavedShares] = useState(loadSavedShares);
  const isBookmarked = savedShares.some(s => s.token === token);

  // Landing gate: shown on a fresh open so the viewer can choose "follow along
  // here" vs "copy the code to save in my own Cue". Skipped once passed on this
  // device, or if the set is already bookmarked.
  const [gatePassed, setGatePassed] = useState(() => loadContinued().has(token));
  const [copiedCode, setCopiedCode] = useState(false);
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

  // Local library snapshot — powers the Copy / Up to date / Update button and the
  // Update list. Reloaded whenever the share loads or after a copy/update.
  const [localSongs, setLocalSongs] = useState([]);
  const [localSets, setLocalSets]   = useState([]);
  const [updateDialog, setUpdateDialog] = useState(null); // null | { choices } — the Update list
  const refreshLocal = useCallback(async () => {
    try { setLocalSongs(await loadSongs()); setLocalSets(await loadSets()); } catch { /* offline / no db */ }
  }, []);
  useEffect(() => { if (status === 'ok' && setData) refreshLocal(); }, [status, setData, hasCopied, refreshLocal]);

  // Leave prompt: shown when navigating away before bookmarking/copying
  const [leavePrompt, setLeavePrompt] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setSetData(null);

    async function load() {
      try {
        const data = await getSharedSet(token);
        if (cancelled) return;
        if (!data) { setStatus('not_found'); return; }
        const songs = (data.songs ?? []).map(row => row.content ?? row);
        setSetData({ set: data.set, songs });
        setStatus('ok');
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
          setStatus('not_found');
        } else {
          setLoadError(err);
          setStatus('error');
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token, retryCount]);

  // When set loads OK, update lastLoadedAt if this token is bookmarked
  useEffect(() => {
    if (status !== 'ok') return;
    const shares = loadSavedShares();
    const idx = shares.findIndex(s => s.token === token);
    if (idx === -1) return;
    const now = new Date().toISOString();
    shares[idx] = { ...shares[idx], lastLoadedAt: now };
    persistSavedShares(shares);
    setSavedShares([...shares]);
  }, [status, token]);

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

      // Bring any custom chord shapes this song carries into the local library.
      if (Array.isArray(song.customChords) && song.customChords.length) mergeCustomChords(song.customChords);

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
      await saveSet({ id: priorSet?.id || null, name: set.name, songIds: newSongIds, sortMode: 'custom', copiedFrom: { token, setName: set.name } });
      // Bring any custom chord shapes the set's songs carry into the local library.
      const customs = songs.flatMap(s => Array.isArray(s.customChords) ? s.customChords : []);
      if (customs.length) mergeCustomChords(customs);
      if (copied + duplicated > 0) setHasCopied(true);
      setCopyResult({ type: 'set', setName: set.name, copied, duplicated, skipped });
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
    const anyCopied = setData.songs.some(s => bySource.has(s.id));
    const songs = setData.songs.map(s => {
      const local = bySource.get(s.id) || null;
      if (!local) return { shareSong: s, local: null, state: 'add' };
      const incoming = contentHash(s);
      const here = contentHash(local);
      const baseline = local.copiedFrom?.baseline;
      let state;
      if (baseline == null) state = incoming === here ? 'uptodate' : 'update'; // legacy copy — no baseline to attribute
      else if (incoming === baseline) state = 'uptodate';                      // publisher unchanged
      else if (here === baseline) state = 'update';                            // publisher changed, you didn't
      else state = 'conflict';                                                 // both changed
      return { shareSong: s, local, state };
    });
    const localSet = localSets.find(st => st.copiedFrom?.token === token) || null;
    let setChanged = false;
    if (localSet) {
      const expected = setData.songs.map(s => bySource.get(s.id)?.id).filter(Boolean);
      const copiedIds = new Set(expected);
      const currentOrder = (localSet.songIds || []).filter(id => copiedIds.has(id));
      setChanged = songs.some(x => x.state === 'add') || expected.join('|') !== currentOrder.join('|');
    }
    const actionable = songs.some(x => x.state === 'update' || x.state === 'conflict' || x.state === 'add') || setChanged;
    return { status: !anyCopied ? 'copy' : actionable ? 'update' : 'uptodate', songs, localSet, setChanged };
  }, [setData, localSongs, localSets, token]);

  function defaultUpdateAction(state) {
    if (state === 'add') return 'add';
    if (state === 'update' || state === 'conflict') return 'update';
    return 'skip';
  }

  // Apply the Update: overwrite changed copies in place (keeping their id so set
  // references hold), add new songs, skip the rest, then reconcile the copied
  // set's order/membership to the share. Never touches non-copied local songs.
  async function applyUpdate(choices) {
    if (!updatePlan || !setData || copying) return;
    setCopying(true);
    try {
      const now = new Date().toISOString();
      const shareToLocalId = new Map();
      const allTitles = new Set(localSongs.map(s => normalizeTitle(s.metadata?.title)));
      let updated = 0, added = 0, skipped = 0;

      for (const item of updatePlan.songs) {
        const s = item.shareSong;
        const action = choices?.[s.id] ?? defaultUpdateAction(item.state);

        if ((item.state === 'update' || item.state === 'conflict') && action === 'update' && item.local) {
          await saveSong({
            ...s,
            id: item.local.id,
            metadata: { ...s.metadata, title: item.local.metadata?.title || s.metadata?.title },
            createdAt: item.local.createdAt,
            updatedAt: now,
            copiedFrom: { ...(item.local.copiedFrom || {}), songId: s.id, baseline: contentHash(s) },
            pdf: pdfRefForCopy(s.pdf),
          });
          if (s.type === 'pdf') {
            // Make sure we write the CURRENT sheet: re-fetch the publisher's bytes
            // (in case they changed the PDF) before copying. Fail-soft — if offline,
            // fall back to whatever was cached when the share opened.
            if (s.ownerId) { try { await downloadPdfBlob(s.id, s.ownerId); } catch { /* keep cached */ } }
            const blob = await loadPdfBlob(s.id);
            if (blob) await savePdfBlob(item.local.id, blob);
          }
          if (Array.isArray(s.customChords) && s.customChords.length) mergeCustomChords(s.customChords);
          shareToLocalId.set(s.id, item.local.id);
          updated++;
        } else if (item.state === 'add' && action === 'add') {
          let title = s.metadata?.title || 'Untitled';
          if (allTitles.has(normalizeTitle(title))) title = makeUniqueTitle(title, allTitles);
          allTitles.add(normalizeTitle(title));
          const newId = await saveSong({
            ...s, id: null,
            metadata: { ...s.metadata, title },
            createdAt: now, updatedAt: now,
            copiedFrom: { songId: s.id, setName: setData.set?.name || '', copiedAt: now, baseline: contentHash(s) },
            pdf: pdfRefForCopy(s.pdf),
          });
          if (s.type === 'pdf') { const blob = await loadPdfBlob(s.id); if (blob) await savePdfBlob(newId, blob); }
          if (Array.isArray(s.customChords) && s.customChords.length) mergeCustomChords(s.customChords);
          shareToLocalId.set(s.id, newId);
          added++;
        } else if (item.local) {
          // up to date, or the user chose Skip — keep the existing copy in the set.
          shareToLocalId.set(s.id, item.local.id);
          if (item.state !== 'uptodate') skipped++;
        }
      }

      if (updatePlan.localSet) {
        const newIds = setData.songs.map(s => shareToLocalId.get(s.id)).filter(Boolean);
        await saveSet({ id: updatePlan.localSet.id, name: setData.set?.name || updatePlan.localSet.name, songIds: newIds, sortMode: 'custom', copiedFrom: updatePlan.localSet.copiedFrom });
      }

      setHasCopied(true);
      setUpdateDialog(null);
      await refreshLocal();
      setCopyResult({ type: 'update', updated, added, skipped });
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

  // ---- Render -----------------------------------------------------------------

  if (status === 'loading') {
    return (
      <div className={`min-h-dvh flex items-center justify-center ${bg}`}>
        <p className={`text-sm ${muted}`}>Loading…</p>
      </div>
    );
  }

  if (status === 'not_found') {
    const bookmarked = savedShares.some(s => s.token === token);
    return (
      <div className={`min-h-dvh flex flex-col ${bg}`}>
        <header className={`px-6 py-4 border-b ${bdr} shrink-0`}>
          <button
            onClick={() => navigate('/')}
            title="Open Cue"
            aria-label="Open Cue"
            className="shrink-0 rounded-[23%] transition-opacity hover:opacity-80"
          >
            <CueMark size={26} />
          </button>
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
      <div className={`min-h-dvh flex flex-col ${bg}`}>
        <header className={`px-6 py-4 border-b ${bdr} shrink-0`}>
          <button
            onClick={() => navigate('/')}
            title="Open Cue"
            aria-label="Open Cue"
            className="shrink-0 rounded-[23%] transition-opacity hover:opacity-80"
          >
            <CueMark size={26} />
          </button>
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

  if (presenting) {
    return (
      <PresentationView
        songs={presenting.songs}
        startIndex={presenting.startIndex}
        onExit={() => setPresenting(null)}
        showEdit={false}
        disableAnnotations
      />
    );
  }

  // Landing gate — a fresh open offers "follow along here" vs "copy the code to
  // save in your own Cue" before showing the songs. Skipped once passed on this
  // device, or when the set is already bookmarked.
  if (!gatePassed && !isBookmarked && !autoSave) {
    return (
      <div className={`h-dvh flex flex-col items-center justify-center p-6 ${bg}`}>
        <div className={`w-full max-w-md rounded-2xl border ${bdr} ${dark ? 'bg-gray-900' : 'bg-white'} shadow-xl p-6 flex flex-col gap-5`}>
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

          {/* Save the code into the viewer's own Cue app. */}
          <div className={`flex flex-col gap-2 border-t ${bdr} pt-4`}>
            <p className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
              To save it in the Cue app on your device: open Cue → Sets → "Paste a share link", paste this code, then tap Open.
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-dvh flex flex-col overflow-hidden ${bg}`}>
      {/* Header */}
      <header className={`px-6 py-4 border-b ${bdr} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleOpenCue}
            title="Open Cue"
            aria-label="Open Cue"
            className="shrink-0 rounded-[23%] transition-opacity hover:opacity-80"
          >
            <CueMark size={26} />
          </button>
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
          {/* Copy whole set to library — becomes "Up to date" / "Update" once the
              set has been copied, reflecting whether the share has since changed. */}
          {enriched.length > 0 && (() => {
            const st = updatePlan?.status || 'copy';
            if (st === 'uptodate') {
              return (
                <RoundButton size={ROUND_SIZE_ACTION} pill
                  label="Your copies are up to date"
                  title="Your saved copies match this shared set — nothing to update."
                  fill={headerFill} disabled>
                  <Check size={20} /><PillLabel>Up to date</PillLabel>
                </RoundButton>
              );
            }
            if (st === 'update') {
              return (
                <RoundButton size={ROUND_SIZE_ACTION} pill
                  label="Update my copies from this shared set"
                  title="This shared set has changed since you copied it — review and update your copies."
                  fill={headerFill} disabled={copying}
                  onActivate={() => setUpdateDialog({ choices: {} })}>
                  <RefreshCw size={18} /><PillLabel>Update</PillLabel>
                </RoundButton>
              );
            }
            return (
              <RoundButton size={ROUND_SIZE_ACTION} pill
                label="Copy songs to my library"
                title="Save your own copy: adds all of these songs to your Cue library, where you can open, edit, and keep them."
                fill={headerFill} disabled={copying}
                onActivate={handleCopySet}>
                <Library size={20} /><PillLabel>Copy</PillLabel>
              </RoundButton>
            );
          })()}
          {/* Present — indigo anchor action */}
          <RoundButton
            size={ROUND_SIZE_ACTION} pill
            label="Present the whole set"
            title="Play the set full-screen, one song at a time — big chords and lyrics for performing. No account needed."
            fill={headerFill} active={enriched.length > 0} disabled={enriched.length === 0}
            onActivate={() => setPresenting({ songs: enriched, startIndex: 0 })}
          >
            <Tv size={20} /><PillLabel>Present</PillLabel>
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

      {/* Song list */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-2">
          {enriched.length === 0 ? (
            <p className={`text-sm text-center py-12 ${muted}`}>No songs in this set.</p>
          ) : (
            enriched.map((song, idx) => (
              <SharedSongRow
                key={song.id}
                song={song}
                index={idx}
                dark={dark}
                muted={muted}
                onPresent={() => setPresenting({ songs: enriched, startIndex: idx })}
                onCopy={() => handleCopySong(song)}
                copying={copying}
              />
            ))
          )}
        </div>
      </div>

      {/* Conflict dialog — shown before any writes when title matches are found */}
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
          onChange={(id, action) => setUpdateDialog(d => ({ choices: { ...d.choices, [id]: action } }))}
          onCancel={() => setUpdateDialog(null)}
          onApply={() => applyUpdate(updateDialog.choices)}
        />
      )}

      {/* Leave prompt — shown when navigating away before saving/copying */}
      {leavePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
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
  const { setName, copied, duplicated, skipped } = result;
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
          <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>"{setName}"</span>.
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

function UpdateResult({ result, dark, onDone }) {
  const { updated, added, skipped } = result;
  const parts = [];
  if (updated) parts.push(`${updated} updated`);
  if (added)   parts.push(`${added} added`);
  if (skipped) parts.push(`${skipped} skipped`);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Copies updated</h2>
        <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {parts.length ? parts.join(', ') + '.' : 'Everything was already up to date.'}
        </p>
      </div>
      <button onClick={onDone} className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors">Done</button>
    </>
  );
}

// The Update-from-share list: one row per song with its state and the action to
// take (Update / Skip, or Add / Skip for songs not yet in your library).
function UpdateDialog({ plan, choices, setName, dark, busy, onChange, onCancel, onApply }) {
  const em   = dark ? 'text-gray-100' : 'text-gray-900';
  const sub  = dark ? 'text-gray-400' : 'text-gray-500';
  const seg  = (on) => `px-2.5 py-1 text-xs rounded-lg border transition-colors ${on ? 'bg-indigo-600 border-indigo-600 text-white' : dark ? 'border-gray-700 text-gray-300' : 'border-gray-300 text-gray-600'}`;
  const actionable = plan.songs.filter(s => s.state !== 'uptodate');
  const anyConflict = plan.songs.some(s => s.state === 'conflict');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={busy ? undefined : onCancel}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${em}`}>Update from “{setName}”</h2>
          <p className={`text-xs ${sub}`}>Refresh your copies with the latest from this shared set. Your own (non-copied) songs are never touched.</p>
        </div>

        {actionable.length === 0 ? (
          <p className={`text-sm ${sub}`}>Everything is already up to date.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plan.songs.map((item, i) => {
              const s = item.shareSong;
              const title = s.metadata?.title || 'Untitled';
              const choice = choices?.[s.id] ?? (item.state === 'add' ? 'add' : item.state === 'uptodate' ? 'skip' : 'update');
              return (
                <li key={i} className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate ${em}`}>{title}</span>
                    <span className={`text-[11px] ${item.state === 'conflict' ? 'text-amber-500' : sub}`}>
                      {item.state === 'uptodate' && 'Up to date'}
                      {item.state === 'update' && 'Changed in the share'}
                      {item.state === 'conflict' && 'Changed in the share — you also edited your copy'}
                      {item.state === 'add' && 'New — not in your library'}
                    </span>
                  </span>
                  {item.state === 'uptodate' ? (
                    <Check size={16} className="text-green-500 shrink-0" />
                  ) : (
                    <span className="flex gap-1 shrink-0">
                      <button onClick={() => onChange(s.id, item.state === 'add' ? 'add' : 'update')} className={seg(choice !== 'skip')}>
                        {item.state === 'add' ? 'Add' : 'Update'}
                      </button>
                      <button onClick={() => onChange(s.id, 'skip')} className={seg(choice === 'skip')}>Skip</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {anyConflict && (
          <p className="text-[11px] text-amber-500">Updating a song you’ve edited replaces your version with the shared one. Choose Skip to keep yours.</p>
        )}

        <div className="flex gap-2">
          <button onClick={onApply} disabled={busy || actionable.length === 0}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${busy || actionable.length === 0 ? (dark ? 'bg-gray-800 text-gray-600' : 'bg-gray-100 text-gray-400') : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
            {busy ? 'Updating…' : 'Update'}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
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

// ---- Song row ----------------------------------------------------------------

function SharedSongRow({ song, index, dark, muted, onPresent, onCopy, copying }) {
  const meta = song.metadata || {};
  const fill = dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY_CHROME;

  return (
    <div className={`rounded-xl border p-4 ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <span className={`text-xs pt-0.5 shrink-0 tabular-nums ${muted}`}>{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-medium truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
            {meta.title || 'Untitled'}
          </p>
          {meta.artist && (
            <p className={`text-sm mt-0.5 truncate ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{meta.artist}</p>
          )}
          {/* The key this song plays in. `song` is enriched, so displayKey already
              folds in any stored viewer key; fall back to the song's original key.
              Shown to the viewer simply as "Key". */}
          {(song.displayKey || meta.key) && (
            <div className="mt-2">
              <span className={`text-xs ${muted}`}>Key: {song.displayKey || meta.key}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Round-button language: neutral copy circle, indigo present circle. */}
          <RoundButton
            size={ROUND_SIZE_COMPACT}
            label="Copy this song to my library"
            title="Add just this song to your Cue library, where you can open, edit, and keep it."
            fill={fill} disabled={copying}
            onActivate={onCopy}
          >
            <Library size={16} />
          </RoundButton>
          <RoundButton
            size={ROUND_SIZE_COMPACT}
            label="Present this song"
            title="Play just this song full-screen — big chords and lyrics for performing."
            fill={fill} active
            onActivate={onPresent}
          >
            <Tv size={16} />
          </RoundButton>
        </div>
      </div>
    </div>
  );
}
