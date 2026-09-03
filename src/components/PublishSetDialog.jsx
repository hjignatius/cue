import { useState } from 'react';
import { publishSet, describeCloudError } from '../lib/cloud.js';
import { usePrefs } from '../context/PrefsContext.jsx';

// Modal that confirms, runs, and reports the publish operation for a single set.
export default function PublishSetDialog({ set, songs, userId, onPublish = publishSet, onSuccess, onClose }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';
  const [phase, setPhase] = useState('confirm'); // confirm | publishing | success | error
  const [errMsg, setErrMsg] = useState('');
  const [pdfFailures, setPdfFailures] = useState([]);

  async function run() {
    setPhase('publishing');
    setErrMsg('');
    try {
      const res = await onPublish(set, songs, userId);
      setPdfFailures(res?.pdfUploadFailures || []);
      setPhase('success');
      onSuccess(new Date().toISOString());
    } catch (err) {
      setPhase('error');
      setErrMsg(describeCloudError(err));
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

        {phase === 'success' && pdfFailures.length === 0 && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className={h2}>Published!</h2>
              <p className={sub}>"{set.name}" is live. Use the share button to generate a link.</p>
            </div>
            <button onClick={onClose} className={btnPrimary}>Done</button>
          </>
        )}

        {/* Loud, explicit partial state: the set published but one or more PDFs
            didn't upload — a row with no bytes behind it. Retry re-runs publish,
            which re-attempts only the still-unuploaded PDFs. Never dismissed as a
            plain success. */}
        {phase === 'success' && pdfFailures.length > 0 && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className={h2}>Published — but a PDF didn't upload</h2>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {pdfFailures.length} PDF {pdfFailures.length === 1 ? 'lead sheet' : 'lead sheets'} failed to
                upload. The set is live, but {pdfFailures.length === 1 ? 'that song' : 'those songs'} will
                show a placeholder on other devices until you retry.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={run} className={btnPrimary}>Retry PDF upload</button>
              <button onClick={onClose} className={btnGhost}>Later</button>
            </div>
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
