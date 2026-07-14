import { useState } from 'react';
import { X } from 'lucide-react';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const CHORD_SCALE_STEPS = [-30, -20, -10, 0, 10, 20, 30];

export default function SettingsPanel({ open, onClose, hideAccount = false }) {
  const { theme, chordColor, chordLabelScale, metronomeMode, accidentals, updatePref } = usePrefs();
  const dark = theme === 'dark';
  const { user, isConfigured, signInWithEmail, signOut } = useAuth();

  const [email, setEmail]     = useState('');
  const [status, setStatus]   = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('');

  const bg     = dark ? 'bg-gray-900' : 'bg-white';
  const border = dark ? 'border-gray-700' : 'border-gray-200';
  const label  = dark ? 'text-white' : 'text-gray-900';
  const muted  = dark ? 'text-gray-400' : 'text-gray-500';
  const btnBorder = dark
    ? 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500'
    : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400';

  function resetForm() {
    setEmail('');
    setStatus('idle');
    setErrorMsg('');
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

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}

      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-80 ${bg} border-l ${border} shadow-2xl flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className={`px-5 py-4 border-b ${border} flex items-center justify-between shrink-0`}>
          <h2 className={`text-sm font-semibold ${label}`}>Settings</h2>
          <button
            onClick={onClose}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${dark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-7">

          {/* Appearance */}
          <section className="flex flex-col gap-4">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Appearance</h3>

            {/* Theme */}
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Theme</span>
              <div className={`flex rounded-lg border ${border} overflow-hidden`}>
                {[['light', '☀ Light'], ['dark', '☾ Dark']].map(([val, text], i) => (
                  <button
                    key={val}
                    onClick={() => updatePref('theme', val)}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-sm transition-colors ${i === 1 ? `border-l ${border}` : ''} ${
                      theme === val
                        ? 'bg-indigo-600 text-white'
                        : `${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            {/* Chord color */}
            <div className="flex items-center justify-between">
              <span className={`text-sm ${label}`}>Chord color</span>
              <div className="relative w-10 h-10 pointer-fine:w-8 pointer-fine:h-8">
                <input
                  type="color"
                  value={chordColor}
                  onChange={e => updatePref('chordColor', e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div
                  className="w-full h-full rounded-lg shadow-sm pointer-events-none border"
                  style={{
                    backgroundColor: chordColor,
                    borderColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                  }}
                />
              </div>
            </div>

            {/* Chord label size (Over Lyrics format only) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className={`text-sm ${label}`}>Chord label size</span>
                <span className={`text-xs ${muted}`}>
                  {chordLabelScale === 0 ? 'default' : chordLabelScale > 0 ? `+${chordLabelScale}%` : `${chordLabelScale}%`}
                </span>
              </div>
              <div className="flex gap-1">
                {CHORD_SCALE_STEPS.map(step => (
                  <button
                    key={step}
                    onClick={() => updatePref('chordLabelScale', step)}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-[11px] rounded-lg border transition-colors ${
                      chordLabelScale === step
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : dark ? 'border-gray-700 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {step === 0 ? '0' : step > 0 ? `+${step}` : step}
                  </button>
                ))}
              </div>
              <p className={`text-[11px] ${muted}`}>Applies to chord names above lyrics only.</p>
            </div>

            {/* Accidentals — how transposed chords spell the five ambiguous pitch classes */}
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Accidentals</span>
              <div className={`flex rounded-lg border ${border} overflow-hidden`}>
                {[['auto', 'Auto'], ['flats', '♭ Flats'], ['sharps', '♯ Sharps']].map(([val, text], i) => (
                  <button
                    key={val}
                    onClick={() => updatePref('accidentals', val)}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-sm transition-colors ${i > 0 ? `border-l ${border}` : ''} ${
                      accidentals === val
                        ? 'bg-indigo-600 text-white'
                        : `${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <p className={`text-[11px] ${muted}`}>Spelling of transposed C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭. Auto follows the View Key.</p>
            </div>
          </section>

          {/* Metronome */}
          <section className="flex flex-col gap-4">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Metronome</h3>
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>BPM tap mode</span>
              <div className={`flex rounded-lg border ${border} overflow-hidden`}>
                {[['sound', '♪ Sound'], ['silent', '⚡ Visual']].map(([val, text], i) => (
                  <button
                    key={val}
                    onClick={() => updatePref('metronomeMode', val)}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-sm transition-colors ${i === 1 ? `border-l ${border}` : ''} ${
                      metronomeMode === val
                        ? 'bg-indigo-600 text-white'
                        : `${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Account */}
          {isConfigured && !hideAccount && (
            <section className="flex flex-col gap-4">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Account</h3>

              {user ? (
                <div className="flex flex-col gap-3">
                  <p className={`text-sm break-all ${label}`}>{user.email}</p>
                  <button
                    onClick={() => signOut()}
                    className={`h-11 pointer-fine:h-9 text-sm rounded-lg border transition-colors ${btnBorder}`}
                  >
                    Sign out
                  </button>
                </div>
              ) : status === 'sent' ? (
                <div className="flex flex-col gap-3 items-center text-center">
                  <p className="text-3xl">✉️</p>
                  <p className={`text-sm font-medium ${label}`}>Check your email</p>
                  <p className={`text-xs ${muted}`}>
                    We sent a sign-in link to{' '}
                    <span className={`font-medium ${label}`}>{email}</span>. Click it to sign in.
                  </p>
                  <button
                    onClick={resetForm}
                    className={`w-full h-11 pointer-fine:h-9 text-sm rounded-lg border transition-colors ${btnBorder}`}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSend} className="flex flex-col gap-3">
                  <p className={`text-xs ${muted}`}>Enter your email to receive a magic sign-in link.</p>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
                    required
                    className={`border rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors ${dark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                  />
                  {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
                  <button
                    type="submit"
                    disabled={status === 'sending' || !email.trim()}
                    className="h-11 pointer-fine:h-9 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {status === 'sending' ? 'Sending…' : 'Send magic link'}
                  </button>
                </form>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
