import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supportsExportFolder, getExportFolderName, chooseExportFolder, clearExportFolder } from '../utils/filePicker.js';

const CHORD_SCALE_STEPS = [-30, -20, -10, 0, 10, 20, 30];

// Supabase returns a 422 with wording like "Signups not allowed for otp" when
// sign-ups are disabled. Match on content rather than the exact string, since
// the phrasing varies. Every other error passes through unchanged.
function friendlyAuthError(err) {
  const msg = err?.message || '';
  if (/signups?\s+not\s+allowed/i.test(msg)) {
    return "Cue isn't accepting new accounts. Ask admin to add you.";
  }
  return msg || 'Something went wrong. Please try again.';
}

// Classifies a verifyOtp failure so the UI never tells someone their code is
// wrong when the request never actually completed.
//
//   'network'  — the fetch never got a verdict from the server. supabase-js
//                wraps these as AuthRetryableFetchError (status 0), and a bare
//                TypeError is what fetch throws when offline.
//   'expired'  — the server rejected it specifically as expired.
//   'invalid'  — the server rejected the code itself.
//
// Supabase returns one 403 for both wrong and expired codes, distinguished only
// by the message text, so 'expired' is matched on the message and 'invalid' is
// the fallback for a genuine server rejection.
function classifyOtpError(err) {
  const msg    = err?.message || '';
  const status = err?.status;

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline ||
      err?.name === 'AuthRetryableFetchError' ||
      status === 0 || status === undefined && err instanceof TypeError ||
      /fetch|network|failed to fetch|load failed/i.test(msg)) {
    return { kind: 'network', message: "Couldn't reach the server. Check your connection and try again — your code is still valid." };
  }
  if (/expire/i.test(msg)) {
    return { kind: 'expired', message: 'That code has expired. Send a new one.' };
  }
  if (/invalid|incorrect|not found/i.test(msg) || status === 403 || status === 401) {
    return { kind: 'invalid', message: "That code isn't right. Check it and try again." };
  }
  return { kind: 'invalid', message: msg || 'Something went wrong. Please try again.' };
}

const RESEND_COOLDOWN_SEC = 60;

// Supabase's Email OTP Length is a per-project setting, adjustable from 6 to 10
// (Authentication → Providers → Email). Accept the whole range rather than
// hardcoding one length: assuming 6 silently truncates a longer code and submits
// a wrong one, with no way to type the rest.
const OTP_MIN_LEN = 6;
const OTP_MAX_LEN = 10;
// Auto-submit fires this long after the last keystroke rather than the instant
// the minimum length is reached — with a longer code, submitting at 6 digits
// would reject a code the user is still typing. Any further digit cancels the
// pending submit, so 6-, 8- and 10-digit projects all work untouched.
const OTP_AUTOSUBMIT_MS = 400;

export default function SettingsPanel({ open, onClose, hideAccount = false }) {
  const { theme, chordColor, chordLabelScale, metronomeMode, accidentals, updatePref } = usePrefs();
  const dark = theme === 'dark';
  const { user, isConfigured, signInWithEmail, verifyEmailOtp, signOut } = useAuth();

  // Two-step email sign-in: 'email' collects the address and sends the code,
  // 'code' verifies it in-app. `email` deliberately persists across the step
  // change — verifyOtp needs both the address and the token.
  const [step, setStep]       = useState('email'); // email | code
  const [email, setEmail]     = useState('');
  const [code, setCode]       = useState('');
  const [status, setStatus]   = useState('idle'); // idle | sending | verifying | error
  const [errorMsg, setErrorMsg] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef(null);
  const autoSubmitRef = useRef(null);

  // Never leave a pending auto-submit behind on unmount.
  useEffect(() => () => clearTimeout(autoSubmitRef.current), []);

  // Resend cooldown. Supabase itself rate-limits one OTP per 60s, so the
  // countdown mirrors the server rather than inventing a stricter rule.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Saved export folder (Chromium only — the section is hidden elsewhere).
  const canPickFolder = supportsExportFolder();
  const [exportFolder, setExportFolder] = useState(null);
  const [folderBusy, setFolderBusy]     = useState(false);
  useEffect(() => {
    if (open && canPickFolder) getExportFolderName().then(setExportFolder).catch(() => {});
  }, [open, canPickFolder]);

  async function pickExportFolder() {
    setFolderBusy(true);
    try {
      const name = await chooseExportFolder();
      if (name) setExportFolder(name);
    } catch { /* picker unavailable or failed — leave as-is */ }
    finally { setFolderBusy(false); }
  }

  async function resetExportFolder() {
    await clearExportFolder();
    setExportFolder(null);
  }

  const bg     = dark ? 'bg-gray-900' : 'bg-white';
  const border = dark ? 'border-gray-700' : 'border-gray-200';
  const label  = dark ? 'text-white' : 'text-gray-900';
  const muted  = dark ? 'text-gray-400' : 'text-gray-500';
  const btnBorder = dark
    ? 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500'
    : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400';

  // Back to step 1, clearing everything — used by "Use a different email".
  function resetForm() {
    setStep('email');
    setEmail('');
    setCode('');
    setStatus('idle');
    setErrorMsg('');
    setResendIn(0);
  }

  // Step 1 → 2. Also the resend path, which re-sends to the same address and
  // keeps the user on step 2.
  async function sendCode(address, { resend = false } = {}) {
    setStatus('sending');
    setErrorMsg('');
    try {
      await signInWithEmail(address);
      setStep('code');
      setStatus('idle');
      setResendIn(RESEND_COOLDOWN_SEC);
      if (resend) setCode('');
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (err) {
      setStatus('error');
      setErrorMsg(friendlyAuthError(err));
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    await sendCode(trimmed);
  }

  // Step 2. On failure the field keeps its value and focus so a typo can be
  // corrected in place rather than retyped.
  async function handleVerify(token) {
    clearTimeout(autoSubmitRef.current);
    const t = (token ?? code).trim();
    if (t.length < OTP_MIN_LEN || status === 'verifying') return;
    setStatus('verifying');
    setErrorMsg('');
    try {
      await verifyEmailOtp(email.trim(), t);
      // onAuthStateChange flips `user`, which swaps this section to the
      // signed-in view; clear the transient step state behind it.
      setStep('email');
      setCode('');
      setStatus('idle');
    } catch (err) {
      const { message } = classifyOtpError(err);
      setStatus('error');
      setErrorMsg(message);
      requestAnimationFrame(() => codeRef.current?.focus());
    }
  }

  // Digits only. Once the code is at least the minimum length, submit shortly
  // after typing stops — each new digit reschedules, so a longer code is never
  // submitted half-typed. The explicit Verify button stays for everyone else.
  function handleCodeChange(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_MAX_LEN);
    setCode(digits);
    if (errorMsg) setErrorMsg('');
    clearTimeout(autoSubmitRef.current);
    if (digits.length >= OTP_MIN_LEN) {
      autoSubmitRef.current = setTimeout(() => handleVerify(digits), OTP_AUTOSUBMIT_MS);
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

          {/* Exports — Chromium only; Safari/Firefox/iOS have no folder picker,
              so the section is hidden rather than shown as unavailable. */}
          {canPickFolder && (
            <section className="flex flex-col gap-4">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Exports</h3>
              <div className="flex flex-col gap-2">
                <span className={`text-sm ${label}`}>Save location</span>
                <p className={`text-[11px] ${muted}`}>
                  {exportFolder
                    ? <>Exports and backups save straight into <span className={`font-medium ${label}`}>{exportFolder}</span>, no dialog. Same-named files get a number, like the browser does.</>
                    : 'Exports ask where to save each time. Pick a folder to save there automatically.'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={pickExportFolder}
                    disabled={folderBusy}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 ${btnBorder}`}
                  >
                    {exportFolder ? 'Change folder…' : 'Choose folder…'}
                  </button>
                  {exportFolder && (
                    <button
                      onClick={resetExportFolder}
                      className={`flex-1 py-2.5 pointer-fine:py-2 text-sm rounded-lg border transition-colors ${btnBorder}`}
                    >
                      Ask every time
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

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
              ) : step === 'code' ? (
                <form
                  onSubmit={e => { e.preventDefault(); handleVerify(); }}
                  className="flex flex-col gap-3"
                >
                  <p className={`text-xs ${muted}`}>
                    Enter the code sent to{' '}
                    <span className={`font-medium ${label}`}>{email}</span>
                  </p>
                  {/* One field, not six boxes: six boxes break paste and are
                      fiddly on mobile. autoComplete="one-time-code" is what
                      makes iOS offer the code above the keyboard. */}
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={OTP_MAX_LEN}
                    placeholder="Code"
                    aria-label="Sign-in code"
                    aria-invalid={!!errorMsg}
                    value={code}
                    onChange={e => handleCodeChange(e.target.value)}
                    autoFocus
                    // In landscape with the keyboard up the panel body is only
                    // ~120px tall, and the browser's focus scroll stops as soon
                    // as the field itself is visible — leaving Verify under the
                    // fold. Reserving margin below the field makes that same
                    // scroll bring the button with it. Doing it in CSS works
                    // with the browser; a JS scroll afterwards just gets undone
                    // when the focus pass re-runs.
                    style={{ scrollMarginBottom: '3.5rem' }}
                    className={`border rounded-lg px-3 py-2.5 text-lg tracking-[0.4em] font-mono text-center outline-none focus:border-indigo-500 transition-colors ${
                      errorMsg ? 'border-red-500' : dark ? 'border-gray-700' : 'border-gray-300'
                    } ${dark ? 'bg-gray-800 text-white placeholder-gray-600' : 'bg-white text-gray-900 placeholder-gray-400'}`}
                  />
                  {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
                  <button
                    type="submit"
                    disabled={status === 'verifying' || code.length < OTP_MIN_LEN}
                    className="h-11 pointer-fine:h-9 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {status === 'verifying' ? 'Verifying…' : 'Verify'}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCode(email.trim(), { resend: true })}
                    disabled={resendIn > 0 || status === 'sending' || status === 'verifying'}
                    className={`h-11 pointer-fine:h-9 text-sm rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${btnBorder}`}
                  >
                    {status === 'sending' ? 'Sending…' : resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className={`text-xs py-1 transition-colors ${muted} ${dark ? 'hover:text-gray-200' : 'hover:text-gray-700'}`}
                  >
                    Use a different email
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSend} className="flex flex-col gap-3">
                  <p className={`text-xs ${muted}`}>Enter your email and we'll send you a sign-in code.</p>
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
                    {status === 'sending' ? 'Sending…' : 'Send code'}
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
