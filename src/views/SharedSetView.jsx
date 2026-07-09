import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getSharedSet } from '../lib/cloud.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { KEY_NAMES } from '../utils/transpose.js';
import PresentationView from './PresentationView.jsx';

// Viewer-local key overrides: stored in localStorage so they survive a page refresh,
// but never written to any Supabase table or the viewer's song library.
const VIEWER_KEYS_KEY = 'cue:viewer_keys';
function loadViewerKeys() {
  try { return JSON.parse(localStorage.getItem(VIEWER_KEYS_KEY) || '{}'); } catch { return {}; }
}
function saveViewerKeys(obj) { localStorage.setItem(VIEWER_KEYS_KEY, JSON.stringify(obj)); }

export default function SharedSetView() {
  const { token }       = useParams();
  const { theme, updatePref } = usePrefs();
  const dark = theme === 'dark';

  const [status, setStatus]     = useState('loading'); // loading | ok | not_found | error
  const [setData, setSetData]   = useState(null);      // { set, songs: [cue-native song objects] }
  const [presenting, setPresenting] = useState(null);  // { songs, startIndex }
  const [retryCount, setRetryCount] = useState(0);

  // Per-song view-key overrides chosen by this viewer (display-only, never synced)
  const [viewerKeys, setViewerKeys] = useState(loadViewerKeys);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setSetData(null);

    async function load() {
      try {
        const data = await getSharedSet(token);
        if (cancelled) return;
        if (!data) { setStatus('not_found'); return; }
        // songs rows from the RPC contain the full Cue-native object in the `content` field
        const songs = (data.songs ?? []).map(row => row.content ?? row);
        setSetData({ set: data.set, songs });
        setStatus('ok');
      } catch (err) {
        if (cancelled) return;
        console.error('SharedSetView:', err);
        // An error talking to Supabase likely means the token isn't found or the
        // service is unreachable — surface the appropriate message.
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

  function setViewerKey(songId, key) {
    const updated = { ...viewerKeys, [songId]: key };
    setViewerKeys(updated);
    saveViewerKeys(updated);
  }

  // Merge viewer's per-song key overrides into the song objects before presenting
  function songsWithViewerKeys(songs) {
    return songs.map(s => ({
      ...s,
      displayKey: viewerKeys[s.id] || s.displayKey || '',
    }));
  }

  // Shared theme/layout helpers
  const bg    = dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900';
  const bdr   = dark ? 'border-gray-800' : 'border-gray-200';
  const muted = dark ? 'text-gray-500' : 'text-gray-400';
  const btnOutline = `border rounded-lg transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400'}`;

  if (status === 'loading') {
    return (
      <div className={`min-h-dvh flex items-center justify-center ${bg}`}>
        <p className={`text-sm ${muted}`}>Loading…</p>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className={`min-h-dvh flex items-center justify-center ${bg}`}>
        <div className="text-center space-y-2 px-6 max-w-sm">
          <p className={`text-lg font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
            This shared set isn't available
          </p>
          <p className={`text-sm ${muted}`}>
            The link may have been revoked or doesn't exist.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`min-h-dvh flex items-center justify-center ${bg}`}>
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
    );
  }

  const { set, songs } = setData;
  const enriched = songsWithViewerKeys(songs);

  // Present mode — reuse PresentationView in read-only mode (no Edit button)
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
          <span className={`text-base font-bold tracking-tight shrink-0 ${dark ? 'text-white' : 'text-gray-900'}`}>Cue</span>
          <span className={`shrink-0 ${muted}`}>·</span>
          <h1 className={`text-base font-semibold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{set.name}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => enriched.length > 0 && setPresenting({ songs: enriched, startIndex: 0 })}
            disabled={enriched.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            ▶ Present All
          </button>
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
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SharedSongRow({ song, index, dark, muted, viewerKey, onViewerKeyChange, onPresent }) {
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
        <button
          onClick={onPresent}
          className="shrink-0 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          title="Present this song"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
