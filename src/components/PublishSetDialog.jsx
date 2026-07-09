import { useState } from 'react';
import { publishSet } from '../lib/cloud.js';
import { usePrefs } from '../context/PrefsContext.jsx';

// Modal that confirms, runs, and reports the publish operation for a single set.
export default function PublishSetDialog({ set, songs, userId, onSuccess, onClose }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';
  const [phase, setPhase] = useState('confirm'); // confirm | publishing | success | error
  const [errMsg, setErrMsg] = useState('');

  async function run() {
    setPhase('publishing');
    setErrMsg('');
    try {
      await publishSet(set, songs, userId);
      setPhase('success');
      onSuccess(new Date().toISOString());
    } catch (err) {
      setPhase('error');
      setErrMsg(err.message || 'Publish failed. Please try again.');
    }
  }

  const overlay = `fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm`;
  const panel   = `w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`;
  const h2      = `text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`;
  const sub     = `text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const btnPrimary = `w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors`;
  const btnGhost   = `text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`;

  const dismissable = phase !== 'publishing';

  return (
    <div className={overlay} onClick={dismissable ? onClose : undefined}>
      <div className={panel} onClick={e => e.stopPropagation()}>
        {phase === 'confirm' && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className={h2}>Publish set</h2>
              <p className={sub}>
                <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-800'}`}>"{set.name}"</span>{' '}
                ({songs.length} {songs.length === 1 ? 'song' : 'songs'}) will be uploaded so it can be shared.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={run} className={btnPrimary}>Publish</button>
              <button onClick={onClose} className={btnGhost}>Cancel</button>
            </div>
          </>
        )}

        {phase === 'publishing' && (
          <div className="text-center py-2 space-y-1">
            <p className={`text-sm font-medium ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Publishing…</p>
            <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
              Uploading {songs.length} {songs.length === 1 ? 'song' : 'songs'}
            </p>
          </div>
        )}

        {phase === 'success' && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className={h2}>Published!</h2>
              <p className={sub}>"{set.name}" is live. Use the share button to generate a link.</p>
            </div>
            <button onClick={onClose} className={btnPrimary}>Done</button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className={h2}>Publish failed</h2>
              <p className="text-xs text-red-500">{errMsg}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={run} className={btnPrimary}>Retry</button>
              <button onClick={onClose} className={btnGhost}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
