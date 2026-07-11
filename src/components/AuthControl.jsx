import { useState } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { usePrefs } from '../context/PrefsContext.jsx';

export default function AuthControl({ btnBorder }) {
  const { user, isConfigured, signInWithEmail, signOut } = useAuth();
  const { theme } = usePrefs();
  const dark = theme === 'dark';

  const [modalOpen, setModalOpen]     = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [email, setEmail]             = useState('');
  const [status, setStatus]           = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg]       = useState('');

  if (!isConfigured) return null;

  function openModal() {
    setEmail('');
    setStatus('idle');
    setErrorMsg('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus('sending');
    setErrorMsg('');
    try {
      await signInWithEmail(trimmed);
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    }
  }

  // ── Signed-in state ─────────────────────────────────────────────────────────
  if (user) {
    return (
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(v => !v)}
          title={user.email}
          className={`flex items-center gap-1.5 h-11 px-4 pointer-fine:h-9 pointer-fine:px-3 text-sm rounded-lg transition-colors ${btnBorder}`}
        >
          <User size={14} />
          <span className="hidden sm:inline max-w-[130px] truncate">{user.email}</span>
        </button>

        {dropdownOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
            <div className={`absolute right-0 top-full mt-1 z-20 w-52 rounded-xl shadow-xl border overflow-hidden ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <p className={`px-3 py-2.5 text-xs break-all ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{user.email}</p>
              <div className={`border-t ${dark ? 'border-gray-700' : 'border-gray-100'}`} />
              <button
                onClick={() => { signOut(); setDropdownOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${dark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Signed-out state ─────────────────────────────────────────────────────────
  return (
    <>
      <button
        onClick={openModal}
        className={`flex items-center gap-1.5 h-11 px-4 pointer-fine:h-9 pointer-fine:px-3 text-sm rounded-lg transition-colors ${btnBorder}`}
      >
        <User size={14} />
        <span>Sign in</span>
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
            onClick={e => e.stopPropagation()}
          >
            {status === 'sent' ? (
              // ── Confirmation state ──────────────────────────────────────────
              <>
                <div className="text-center space-y-2">
                  <p className="text-3xl">✉️</p>
                  <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Check your email</h2>
                  <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    We sent a sign-in link to{' '}
                    <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{email}</span>.
                    Click it to sign in.
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className={`w-full py-3 pointer-fine:py-2 text-sm rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                >
                  Done
                </button>
              </>
            ) : (
              // ── Email form ──────────────────────────────────────────────────
              <>
                <div className="flex flex-col gap-1">
                  <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Sign in to Cue</h2>
                  <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Enter your email and we'll send you a magic link.
                  </p>
                </div>

                <form onSubmit={handleSend} className="flex flex-col gap-3">
                  <input
                    type="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
                    required
                    className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors ${dark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                  />
                  {errorMsg && (
                    <p className="text-xs text-red-500">{errorMsg}</p>
                  )}
                  <button
                    type="submit"
                    disabled={status === 'sending' || !email.trim()}
                    className="w-full py-3 pointer-fine:py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                  >
                    {status === 'sending' ? 'Sending…' : 'Send magic link'}
                  </button>
                </form>

                <button
                  onClick={closeModal}
                  className={`text-xs min-h-[44px] pointer-fine:min-h-[36px] flex items-center justify-center w-full text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
