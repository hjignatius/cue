import { useEffect, useRef, useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { getShareTokens, createShareToken, revokeShareToken } from '../lib/cloud.js';
import { usePrefs } from '../context/PrefsContext.jsx';

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

export default function ShareSetDialog({ set, onClose }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';

  const [loading, setLoading]       = useState(true);
  const [tokens, setTokens]         = useState([]);
  const [errMsg, setErrMsg]         = useState('');
  const [generating, setGenerating] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  // Revoke is destructive and can't be undone, so it takes two taps: the first
  // arms this token, the second (a separate red button) actually revokes. The
  // armed state auto-cancels after a few seconds so a stray first tap is
  // harmless. Only one row can be armed at a time.
  const [confirmingToken, setConfirmingToken] = useState(null);
  const revokeTimer = useRef(null);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(revokeTimer.current), []);

  function armRevoke(token) {
    clearTimeout(revokeTimer.current);
    setConfirmingToken(token);
    revokeTimer.current = setTimeout(() => setConfirmingToken(null), 4000);
  }
  function cancelRevoke() {
    clearTimeout(revokeTimer.current);
    setConfirmingToken(null);
  }
  function confirmRevoke(token) {
    clearTimeout(revokeTimer.current);
    setConfirmingToken(null);
    handleRevoke(token);
  }

  async function load() {
    setLoading(true);
    setErrMsg('');
    try {
      setTokens(await getShareTokens(set.id));
    } catch (err) {
      setErrMsg(err.message || 'Failed to load share links.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setErrMsg('');
    try {
      const token = await createShareToken(set.id);
      setTokens(prev => [{ token, created_at: new Date().toISOString(), revoked: false }, ...prev]);
    } catch (err) {
      setErrMsg(err.message || 'Failed to create share link.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(token) {
    setErrMsg('');
    try {
      await revokeShareToken(token);
      setTokens(prev => prev.map(t => t.token === token ? { ...t, revoked: true } : t));
    } catch (err) {
      setErrMsg(err.message || 'Failed to revoke link.');
    }
  }

  function copyUrl(token) {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  const panel = `w-96 max-h-[80vh] flex flex-col rounded-2xl shadow-2xl ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`;
  const divider = `border-t ${dark ? 'border-gray-800' : 'border-gray-100'}`;
  const h2 = `text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`;

  const activeTokens  = tokens.filter(t => !t.revoked);
  const revokedCount  = tokens.filter(t => t.revoked).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 pt-5 pb-4 shrink-0 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div>
            <h2 className={h2}>Share links</h2>
            <p className={`text-xs mt-0.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>"{set.name}"</p>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-gray-500 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Token list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}

          {loading ? (
            <p className={`text-sm text-center py-6 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Loading…</p>
          ) : activeTokens.length === 0 ? (
            <p className={`text-sm text-center py-6 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No active share links yet.</p>
          ) : (
            activeTokens.map(t => (
              <div
                key={t.token}
                className={`rounded-xl p-3 border ${dark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}
              >
                {/* Link + created date */}
                <span className={`block text-xs font-mono truncate ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                  /shared/{t.token}
                </span>
                <p className={`text-[10px] mt-1.5 ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
                  Created {fmtDate(t.created_at)}
                </p>

                {/* Actions — Copy is the primary, frequent action on the left;
                    Revoke is destructive so it sits far right and takes a second
                    confirming tap (which replaces the row until confirmed/cancelled). */}
                <div className="flex items-center gap-2 mt-2.5">
                  {confirmingToken === t.token ? (
                    <>
                      <span className={`text-xs ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                        Revoke for everyone?
                      </span>
                      <button
                        onClick={cancelRevoke}
                        className={`ml-auto shrink-0 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${dark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200'}`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => confirmRevoke(t.token)}
                        title="Permanently revoke this link"
                        className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                      >
                        Revoke
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => copyUrl(t.token)}
                        title="Copy link"
                        className={`inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          copiedToken === t.token
                            ? (dark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600')
                            : (dark ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300')
                        }`}
                      >
                        {copiedToken === t.token
                          ? <><Check size={13} /> Copied</>
                          : <><Copy size={13} /> Copy link</>}
                      </button>
                      <button
                        onClick={() => armRevoke(t.token)}
                        title="Revoke this link"
                        className={`ml-auto shrink-0 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${dark ? 'text-red-400/80 hover:text-red-300 hover:bg-red-950/40' : 'text-red-500 hover:text-red-600 hover:bg-red-50'}`}
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {revokedCount > 0 && (
            <p className={`text-xs ${dark ? 'text-gray-700' : 'text-gray-300'}`}>
              {revokedCount} revoked link{revokedCount > 1 ? 's' : ''} not shown
            </p>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 shrink-0 ${divider}`}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors"
          >
            {generating ? 'Generating…' : 'Generate new link'}
          </button>
        </div>
      </div>
    </div>
  );
}
