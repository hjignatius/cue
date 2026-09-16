import { useEffect, useRef, useState } from 'react';
import { Copy, Check, X, QrCode as QrCodeIcon, FileDown, Loader2 } from 'lucide-react';
import { getOrCreateShareToken, revokeShareToken } from '../lib/cloud.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import QrCode from './QrCode.jsx';
import { exportQrPdf } from '../utils/qrPdf.js';

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
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [savingQr, setSavingQr] = useState(false);
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

  const url = token ? `${window.location.origin}/shared/${token}` : '';

  function copyUrl() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Save the code as a one-page printable sheet — for propping on a stand or
  // pinning up, where a screen isn't practical.
  async function saveQrPdf() {
    if (!url || savingQr) return;
    setSavingQr(true);
    setErrMsg('');
    try {
      await exportQrPdf(set.name, url);
    } catch (err) {
      console.error('[ShareSetDialog] QR PDF export failed', err);
      setErrMsg('Could not save the QR code as a PDF.');
    } finally {
      setSavingQr(false);
    }
  }

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
      setShowQr(false); // the code on screen would now point at a dead link
      setPhase('notshared');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={onClose}>
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
              {/* The one link */}
              <div className={`flex items-center gap-2 rounded-xl border p-2 ${dark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
                <span className={`flex-1 text-xs font-mono truncate px-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{url}</span>
                <button
                  onClick={copyUrl}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    copied
                      ? (dark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600')
                      : (dark ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300')
                  }`}
                >
                  {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>

              {/* QR code — for handing the link to someone in the room: they point
                  a phone at the screen instead of typing it. Collapsed by default
                  so the dialog keeps its size until asked. */}
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => setShowQr(v => !v)}
                  aria-expanded={showQr}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    dark ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <QrCodeIcon size={13} /> {showQr ? 'Hide QR code' : 'Show QR code'}
                </button>
                {showQr && (
                  <>
                    {/* White plate in both themes — the code needs its light field. */}
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <QrCode value={url} size={176} title={`QR code for the "${set.name}" share link`} />
                    </div>
                    <p className={`${sub} text-center`}>Point a phone camera at this to open the set.</p>
                    <button
                      onClick={saveQrPdf}
                      disabled={savingQr}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                        dark ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {savingQr
                        ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                        : <><FileDown size={13} /> Save as PDF</>}
                    </button>
                  </>
                )}
              </div>

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
