import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getOrCreateShareToken, revokeShareToken } from '../lib/cloud.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import LinkQrPanel from './LinkQrPanel.jsx';
import { shareUrl } from '../utils/shareLink.js';
import { dismissOnOutside } from '../utils/overlayDismiss.js';

// ONE LINK PER SET. Opening Share shows the set's single link, creating it if the
// set has none and REUSING it if it already does — it can never mint a second.
// "Stop sharing" revokes that link (reversible): the set stays, the link dies,
// and tapping Share again mints a fresh single link (getOrCreate finds no active
// token once the old one is revoked). Deleting the set removes everything —
// that's the delete cascade, not here.
export default function ShareSetDialog({ set, onClose }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';

  const [phase, setPhase]   = useState('loading'); // loading | shared | notshared | error
  const [token, setToken]   = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [busy, setBusy]     = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const stopTimer = useRef(null);
  useEffect(() => () => clearTimeout(stopTimer.current), []);

  useEffect(() => { ensureLink(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create-or-reuse: the single source of the link. Used on open and to re-create
  // after a Stop-sharing.
  async function ensureLink() {
    setPhase('loading');
    setErrMsg('');
    try {
      const t = await getOrCreateShareToken(set.id);
      setToken(t);
      setPhase('shared');
    } catch (err) {
      setErrMsg(err.message || 'Failed to create the share link.');
      setPhase('error');
    }
  }

  const url = token ? shareUrl(token) : '';

  function armStop() {
    clearTimeout(stopTimer.current);
    setConfirmingStop(true);
    stopTimer.current = setTimeout(() => setConfirmingStop(false), 4000);
  }
  function cancelStop() {
    clearTimeout(stopTimer.current);
    setConfirmingStop(false);
  }
  async function confirmStop() {
    clearTimeout(stopTimer.current);
    setConfirmingStop(false);
    setBusy(true);
    setErrMsg('');
    try {
      await revokeShareToken(token);
      setToken(null);
      setPhase('notshared'); // takes the code with it: it would point at a dead link
    } catch (err) {
      setErrMsg(err.message || 'Failed to stop sharing.');
    } finally {
      setBusy(false);
    }
  }

  const panel = `w-96 max-w-[92vw] rounded-2xl shadow-2xl flex flex-col ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`;
  const h2    = `text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`;
  const sub   = `text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`;
  const muted = `text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" {...dismissOnOutside(onClose)}>
      <div className={panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 pt-5 pb-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div>
            <h2 className={h2}>Share set</h2>
            <p className={`mt-0.5 ${sub}`}>"{set.name}"</p>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-gray-500 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}

          {phase === 'loading' && (
            <p className={`text-sm text-center py-4 ${muted}`}>Loading…</p>
          )}

          {phase === 'error' && (
            <button onClick={ensureLink} className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors">
              Try again
            </button>
          )}

          {phase === 'shared' && (
            <>
              <p className={muted}>Anyone with this link can view the set and copy its songs into their own Cue.</p>
              {/* The one link, and the same link as a QR code. Collapsed by
                  default so the dialog keeps its size until asked. */}
              <LinkQrPanel
                url={url}
                dark={dark}
                qrTitle={`QR code for the "${set.name}" share link`}
                qrCaption="Point a phone camera at this to open the set."
                pdfTitle={set.name}
                shareTitle={`Cue set: ${set.name}`}
                shareText={`"${set.name}" — a set shared from Cue.`}
              />

              {/* Stop sharing — reversible. Two taps so it isn't hit by accident. */}
              <div className="flex items-center justify-end pt-1">
                {confirmingStop ? (
                  <div className="flex items-center gap-2">
                    <span className={muted}>Stop sharing?</span>
                    <button onClick={cancelStop} className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors ${dark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}>Cancel</button>
                    <button onClick={confirmStop} disabled={busy} className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50">
                      Stop sharing
                    </button>
                  </div>
                ) : (
                  <button onClick={armStop} className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors ${dark ? 'text-red-400/80 hover:text-red-300 hover:bg-red-950/40' : 'text-red-500 hover:text-red-600 hover:bg-red-50'}`}>
                    Stop sharing
                  </button>
                )}
              </div>
            </>
          )}

          {phase === 'notshared' && (
            <>
              <p className={muted}>This set isn't shared. Create a link to let others view and copy it.</p>
              <button onClick={ensureLink} disabled={busy} className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50">
                Create share link
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
