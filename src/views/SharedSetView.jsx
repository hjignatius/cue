import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSharedSet } from '../lib/cloud.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { KEY_NAMES } from '../utils/transpose.js';
import { saveSong, saveSet, loadSongs } from '../utils/storage.js';
import PresentationView from './PresentationView.jsx';
import { Bookmark, BookmarkCheck, Library } from 'lucide-react';

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

// Build a map of cloud song ID → local song ID for duplicate detection.
async function buildSourceIdMap() {
  const localSongs = await loadSongs();
  const map = new Map();
  for (const s of localSongs) {
    if (s.copiedFrom?.songId) map.set(s.copiedFrom.songId, s.id);
  }
  return map;
}

export default function SharedSetView() {
  const { token }       = useParams();
  const navigate        = useNavigate();
  const { theme, updatePref } = usePrefs();
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
  const [copying, setCopying]       = useState(false);
  const [copyResult, setCopyResult] = useState(null); // { type, ... }
  const [hasCopied, setHasCopied]   = useState(false); // true once any copy succeeds this session

  // Leave prompt: shown when navigating away before bookmarking/copying
  const [leavePrompt, setLeavePrompt] = useState(false);

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

  // Navigate to the main app. If the viewer hasn't bookmarked or copied anything,
  // offer a lightweight "save before leaving?" prompt first.
  function handleOpenCue() {
    if (status !== 'ok' || isBookmarked || hasCopied) {
      navigate('/');
    } else {
      setLeavePrompt(true);
    }
  }

  // ---- Copy-to-library actions ------------------------------------------------

  async function handleCopySong(song) {
    if (copying) return;
    setCopying(true);
    try {
      const sourceMap = await buildSourceIdMap();
      const title = song.metadata?.title || 'Untitled';
      if (sourceMap.has(song.id)) {
        setCopyResult({ type: 'song_exists', title });
        return;
      }
      const now = new Date().toISOString();
      await saveSong({
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
        copiedFrom: { songId: song.id, setName: setData?.set?.name || '', copiedAt: now },
      });
      setHasCopied(true);
      setCopyResult({ type: 'song', title });
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
      // Always rebuild from DB so previously copied songs are correctly detected
      const sourceMap = await buildSourceIdMap();
      let copied = 0, alreadyHad = 0;
      const newSongIds = [];
      const now = new Date().toISOString();

      for (const song of songs) {
        if (sourceMap.has(song.id)) {
          newSongIds.push(sourceMap.get(song.id));
          alreadyHad++;
        } else {
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
          newSongIds.push(newId);
          sourceMap.set(song.id, newId); // prevent double-counting if song appears twice in set
          copied++;
        }
      }

      await saveSet({ id: null, name: set.name, songIds: newSongIds, sortMode: 'custom' });
      setHasCopied(true);
      setCopyResult({ type: 'set', setName: set.name, copied, alreadyHad });
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
            <p className={`text-sm ${muted}`}>
              The link may have been revoked or doesn't exist.
            </p>
            {bookmarked && (
              <button
                onClick={handleRemoveBookmark}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${dark ? 'border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-800' : 'border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300'}`}
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
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
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
          {/* Save / remove bookmark */}
          <button
            onClick={isBookmarked ? handleRemoveBookmark : handleSaveBookmark}
            title={isBookmarked ? 'Remove from Shared with me' : 'Save to Shared with me'}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isBookmarked ? 'border border-indigo-500 text-indigo-500 hover:text-indigo-400 hover:border-indigo-400' : btnOutline}`}
          >
            {isBookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>
          {/* Copy whole set to library */}
          {enriched.length > 0 && (
            <button
              onClick={handleCopySet}
              disabled={copying}
              title="Copy all songs to my library"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-40 ${btnOutline}`}
            >
              <Library size={14} /> Copy to library
            </button>
          )}
          {/* Present All */}
          <button
            onClick={() => enriched.length > 0 && setPresenting({ songs: enriched, startIndex: 0 })}
            disabled={enriched.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            ▶ Present All
          </button>
          {/* Theme toggle */}
          <button
            onClick={() => updatePref('theme', dark ? 'light' : 'dark')}
            className={`w-8 h-8 flex items-center justify-center ${btnOutline}`}
            title="Toggle theme"
          >
            {dark ? '☀' : '☾'}
          </button>
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
            {copyResult.type === 'set' && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Copied to your library</h2>
                  <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Created set <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>"{copyResult.setName}"</span>.{' '}
                    {copyResult.copied > 0 && (
                      <span className="text-indigo-500 font-medium">
                        {copyResult.copied} {copyResult.copied === 1 ? 'song' : 'songs'} copied
                      </span>
                    )}
                    {copyResult.copied > 0 && copyResult.alreadyHad > 0 && ', '}
                    {copyResult.alreadyHad > 0 && (
                      <span>{copyResult.alreadyHad} already in your library</span>
                    )}
                    .
                  </p>
                </div>
                <button
                  onClick={() => setCopyResult(null)}
                  className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
                >
                  Done
                </button>
              </>
            )}
            {copyResult.type === 'song' && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Song copied</h2>
                  <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>"{copyResult.title}"</span> has been added to your library.
                  </p>
                </div>
                <button
                  onClick={() => setCopyResult(null)}
                  className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
                >
                  Done
                </button>
              </>
            )}
            {copyResult.type === 'song_exists' && (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Already in your library</h2>
                  <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>"{copyResult.title}"</span> was previously copied and is already in your library.
                  </p>
                </div>
                <button
                  onClick={() => setCopyResult(null)}
                  className={`w-full py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                >
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SharedSongRow({ song, index, dark, muted, viewerKey, onViewerKeyChange, onPresent, onCopy, copying }) {
  const meta = song.metadata || {};

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
            {meta.key && (
              <span className={`text-xs ${muted}`}>Key: {meta.key}</span>
            )}
            {meta.tempo && (
              <span className={`text-xs ${muted}`}>{meta.tempo} BPM</span>
            )}
            {meta.duration && (
              <span className={`text-xs ${muted}`}>{meta.duration}</span>
            )}
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
          <button
            onClick={onCopy}
            disabled={copying}
            title="Copy to my library"
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${dark ? 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
          >
            <Library size={14} />
          </button>
          <button
            onClick={onPresent}
            className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
            title="Present this song"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
