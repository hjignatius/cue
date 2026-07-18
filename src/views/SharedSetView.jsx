import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSharedSet } from '../lib/cloud.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { KEY_NAMES } from '../utils/transpose.js';
import { saveSong, saveSet, loadSongs } from '../utils/storage.js';
import PresentationView from './PresentationView.jsx';
import { Bookmark, BookmarkCheck, Library, Settings, Tv } from 'lucide-react';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY_CHROME, ROUND_SIZE_ACTION, ROUND_SIZE_COMPACT } from '../components/RoundButton.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';

// Visible label inside a RoundButton pill (white via RoundButton's text-white).
function PillLabel({ children }) {
  return <span className="text-sm font-medium leading-none whitespace-nowrap">{children}</span>;
}

// Viewer-local key overrides: stored in localStorage, never written to any Supabase table.
const VIEWER_KEYS_KEY = 'cue:viewer_keys';
function loadViewerKeys() {
  try { return JSON.parse(localStorage.getItem(VIEWER_KEYS_KEY) || '{}'); } catch { return {}; }
}
function saveViewerKeys(obj) { localStorage.setItem(VIEWER_KEYS_KEY, JSON.stringify(obj)); }

// Shared-with-me bookmarks: { token, setName, savedAt, lastLoadedAt }[]
export const SHARED_WITH_ME_KEY = 'cue:shared_with_me';
function loadSavedShares() {
  try { return JSON.parse(localStorage.getItem(SHARED_WITH_ME_KEY) || '[]'); } catch { return []; }
}
function persistSavedShares(arr) { localStorage.setItem(SHARED_WITH_ME_KEY, JSON.stringify(arr)); }

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
  const { theme } = usePrefs();
  const dark = theme === 'dark';

  const [status, setStatus]         = useState('loading'); // loading | ok | not_found | error
  const [setData, setSetData]       = useState(null);      // { set, songs }
  const [presenting, setPresenting] = useState(null);      // { songs, startIndex }
  const [retryCount, setRetryCount] = useState(0);
  const [viewerKeys, setViewerKeys] = useState(loadViewerKeys);

  // Bookmark state
  const [savedShares, setSavedShares] = useState(loadSavedShares);
  const isBookmarked = savedShares.some(s => s.token === token);

  // Copy-to-library state
  const [copying, setCopying]           = useState(false);
  const [copyResult, setCopyResult]     = useState(null);  // { type, ... }
  const [hasCopied, setHasCopied]       = useState(false); // true once any copy/duplicate succeeds
  const [conflictDialog, setConflictDialog] = useState(null); // { conflicts, resolve } | null

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
      } catch (err) {
        if (cancelled) return;
        console.error('SharedSetView:', err);
        const msg = err?.message ?? '';
        if (msg.includes('not found') || msg.includes('invalid') || msg.includes('revoked')) {
          setStatus('not_found');
        } else {
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

  function setViewerKey(songId, key) {
    const updated = { ...viewerKeys, [songId]: key };
    setViewerKeys(updated);
    saveViewerKeys(updated);
  }

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
      const copiedFrom = { songId: song.id, setName: setData?.set?.name || '', copiedAt: now };

      if (outcome === 'skip') {
        setCopyResult({ type: 'song', title, outcome: 'skipped' });
        return;
      }

      if (outcome === 'duplicate') {
        const allTitles = new Set(localSongs.map(s => normalizeTitle(s.metadata?.title)));
        newTitle = makeUniqueTitle(title, allTitles);
      }

      await saveSong({
        id: null,
        metadata: { ...song.metadata, title: newTitle },
        text: song.text,
        chordStyle: song.chordStyle,
        previewMode: song.previewMode,
        diagramScale: song.diagramScale,
        chordPrefs: song.chordPrefs,
        displayKey: song.displayKey,
        createdAt: now,
        updatedAt: now,
        copiedFrom,
      });

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
            id: null,
            metadata: song.metadata,
            text: song.text,
            chordStyle: song.chordStyle,
            previewMode: song.previewMode,
            diagramScale: song.diagramScale,
            chordPrefs: song.chordPrefs,
            displayKey: song.displayKey,
            createdAt: now,
            updatedAt: now,
            copiedFrom: { songId: song.id, setName: set.name, copiedAt: now },
          });
          allTitles.add(titleKey);
          newSongIds.push(newId);
          copied++;
        } else {
          const choice = choices[song.id] ?? 'skip';
          if (choice === 'duplicate') {
            const newTitle = makeUniqueTitle(song.metadata?.title || 'Untitled', allTitles);
            allTitles.add(normalizeTitle(newTitle));
            const newId = await saveSong({
              id: null,
              metadata: { ...song.metadata, title: newTitle },
              text: song.text,
              chordStyle: song.chordStyle,
              previewMode: song.previewMode,
              diagramScale: song.diagramScale,
              chordPrefs: song.chordPrefs,
              displayKey: song.displayKey,
              createdAt: now,
              updatedAt: now,
              copiedFrom: { songId: song.id, setName: set.name, copiedAt: now },
            });
            newSongIds.push(newId);
            duplicated++;
          } else {
            // Skip: reference the existing local song so the set is complete
            newSongIds.push(titleMap.get(titleKey).id);
            skipped++;
          }
        }
      }

      await saveSet({ id: null, name: set.name, songIds: newSongIds, sortMode: 'custom' });
      if (copied + duplicated > 0) setHasCopied(true);
      setCopyResult({ type: 'set', setName: set.name, copied, duplicated, skipped });
    } catch (err) {
      console.error('Copy set failed:', err);
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
            className={`text-base font-bold tracking-tight transition-colors ${dark ? 'text-white hover:text-indigo-400' : 'text-gray-900 hover:text-indigo-600'}`}
            title="Open Cue"
          >
            Cue
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
            className={`text-base font-bold tracking-tight transition-colors ${dark ? 'text-white hover:text-indigo-400' : 'text-gray-900 hover:text-indigo-600'}`}
            title="Open Cue"
          >
            Cue
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 px-6 max-w-sm">
            <p className={`text-lg font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
              This shared set is temporarily unavailable
            </p>
            <p className={`text-sm ${muted}`}>Try again later.</p>
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

  return (
    <div className={`h-dvh flex flex-col overflow-hidden ${bg}`}>
      {/* Header */}
      <header className={`px-6 py-4 border-b ${bdr} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleOpenCue}
            title="Open Cue"
            className={`text-base font-bold tracking-tight shrink-0 transition-colors ${dark ? 'text-white hover:text-indigo-400' : 'text-gray-900 hover:text-indigo-600'}`}
          >
            Cue
          </button>
          <span className={`shrink-0 ${muted}`}>·</span>
          <h1 className={`text-base font-semibold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{set.name}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Save / remove bookmark — indigo when bookmarked */}
          <RoundButton
            size={ROUND_SIZE_ACTION}
            label={isBookmarked ? 'Remove from Shared with me' : 'Save to Shared with me'}
            title={isBookmarked ? 'Remove from Shared with me' : 'Save to Shared with me'}
            fill={headerFill} active={isBookmarked}
            onActivate={isBookmarked ? handleRemoveBookmark : handleSaveBookmark}
          >
            {isBookmarked ? <BookmarkCheck size={22} /> : <Bookmark size={22} />}
          </RoundButton>
          {/* Copy whole set to library */}
          {enriched.length > 0 && (
            <RoundButton
              size={ROUND_SIZE_ACTION} pill
              label="Copy to library" title="Copy all songs to my library"
              fill={headerFill} disabled={copying}
              onActivate={handleCopySet}
            >
              <Library size={20} /><PillLabel>Copy to library</PillLabel>
            </RoundButton>
          )}
          {/* Present All — indigo anchor action */}
          <RoundButton
            size={ROUND_SIZE_ACTION} pill
            label="Present All" title="Present the whole set"
            fill={headerFill} active={enriched.length > 0} disabled={enriched.length === 0}
            onActivate={() => setPresenting({ songs: enriched, startIndex: 0 })}
          >
            <Tv size={20} /><PillLabel>Present All</PillLabel>
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
                viewerKey={viewerKeys[song.id] || ''}
                onViewerKeyChange={key => setViewerKey(song.id, key || '')}
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

function SharedSongRow({ song, index, dark, muted, viewerKey, onViewerKeyChange, onPresent, onCopy, copying }) {
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
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {meta.key    && <span className={`text-xs ${muted}`}>Key: {meta.key}</span>}
            {meta.tempo  && <span className={`text-xs ${muted}`}>{meta.tempo} BPM</span>}
            {meta.duration && <span className={`text-xs ${muted}`}>{meta.duration}</span>}
            {/* Viewer-local View Key — stored in localStorage, never sent to server */}
            <label className={`flex items-center gap-1 text-xs ${muted}`}>
              View key
              <select
                value={viewerKey}
                onChange={e => onViewerKeyChange(e.target.value)}
                className={`border rounded px-1.5 py-0.5 text-xs ${dark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-700'}`}
              >
                <option value="">Original</option>
                {KEY_NAMES.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Round-button language: neutral copy circle, indigo present circle. */}
          <RoundButton
            size={ROUND_SIZE_COMPACT}
            label="Copy to my library" title="Copy to my library"
            fill={fill} disabled={copying}
            onActivate={onCopy}
          >
            <Library size={16} />
          </RoundButton>
          <RoundButton
            size={ROUND_SIZE_COMPACT}
            label="Present this song" title="Present this song"
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
