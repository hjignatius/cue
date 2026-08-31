import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { usePrefs, PRESENT_NO_FADE, AI_LEVELS } from '../context/PrefsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supportsExportFolder, getExportFolderName, chooseExportFolder, clearExportFolder } from '../utils/filePicker.js';
import { CHORD_LIBRARIES } from '../data/chordLibraries.js';
import { getApiKey, setApiKey } from '../lib/ai.js';

const CHORD_SCALE_STEPS = [-30, -20, -10, 0, 10, 20, 30];

// Chord-diagram instrument selector. Ukulele/Baritone/Guitar labels come from the
// registry; None turns diagrams off.
const INSTRUMENT_OPTIONS = [
  { id: 'none',          label: 'None' },
  { id: 'ukulele_gcea',  label: CHORD_LIBRARIES.ukulele_gcea.label },
  { id: 'baritone_dgbe', label: CHORD_LIBRARIES.baritone_dgbe.label },
  { id: 'guitar',        label: CHORD_LIBRARIES.guitar.label },
];

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
  const { theme, chordColor, chordLabelScale, metronomeMode, accidentals, presentIdleSec, scrollStartDelaySec, instrument, pedalPaging, pageGlideMs, pageSize, aiLevel, updatePref } = usePrefs();
  const glideMs = Math.max(0, Math.min(2000, pageGlideMs ?? 550));
  const noFade = presentIdleSec === PRESENT_NO_FADE;
  const idleSec = noFade ? 3 : Math.max(0, Math.min(5, presentIdleSec ?? 3));
  const scrollDelaySec = Math.max(0, Math.min(10, scrollStartDelaySec ?? 0));
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

  // AI key (bring-your-own). Stored on this device only, never in prefs/backups.
  // `aiKeyDraft` is the editable field; `aiKeySaved` mirrors what's persisted so
  // the section can show a masked "saved" state without holding the key in the UI.
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [aiKeyReveal, setAiKeyReveal] = useState(false);
  const [aiKeySaved, setAiKeySaved] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = getApiKey();
    setAiKeySaved(!!k);
    setAiKeyDraft(k);
    setAiKeyReveal(false);
  }, [open]);
  function saveAiKey() {
    setApiKey(aiKeyDraft);
    setAiKeySaved(!!aiKeyDraft.trim());
  }
  function clearAiKey() {
    setApiKey('');
    setAiKeyDraft('');
    setAiKeySaved(false);
  }
  const aiKeyDirty = aiKeyDraft.trim() !== getApiKey();

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

            {/* Chord instrument — which diagram library the chord panel shows */}
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Chord instrument</span>
              <div className="grid grid-cols-2 gap-2">
                {INSTRUMENT_OPTIONS.map(opt => {
                  const active = instrument === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updatePref('instrument', opt.id)}
                      className={`py-2.5 pointer-fine:py-2 text-sm rounded-lg border transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : `${border} ${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[11px] ${muted}`}>Which chord-diagram library the chord panel shows. “None” hides the diagram panel entirely. Chord names in your lyrics are unaffected.</p>
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
              <span className={`text-sm ${label}`}>Sharps / Flats</span>
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

          {/* Present */}
          <section className="flex flex-col gap-4">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Present</h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${label}`}>Controls fade delay</span>
                <span className={`text-sm tabular-nums ${muted}`}>{noFade ? 'Never' : idleSec === 0 ? 'Immediate' : `${idleSec}s`}</span>
              </div>
              {/* 0–5s: how long the floating controls and the side buttons wait
                  after your last tap before fading and collapsing out of the way.
                  Greyed while practice mode (no fade) is on, since it's inactive. */}
              <div className={`flex rounded-lg border ${border} overflow-hidden ${noFade ? 'opacity-40' : ''}`}>
                {[0, 1, 2, 3, 4, 5].map((n, i) => (
                  <button
                    key={n}
                    onClick={() => updatePref('presentIdleSec', n)}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-sm tabular-nums transition-colors ${i > 0 ? `border-l ${border}` : ''} ${
                      !noFade && idleSec === n
                        ? 'bg-indigo-600 text-white'
                        : `${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {/* Practice mode: keep the floating controls and side gutter up all
                  the time (no fade, no auto-collapse). Toggling it off restores the
                  default 3s fade. */}
              <button
                onClick={() => updatePref('presentIdleSec', noFade ? 3 : PRESENT_NO_FADE)}
                className={`w-full py-2.5 pointer-fine:py-2 rounded-lg border text-sm transition-colors ${
                  noFade
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : `${border} ${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                }`}
              >
                Keep controls up (practice mode)
              </button>
              <p className={`text-xs ${muted}`}>Seconds before the Present controls fade and collapse. 0 hides them right away. Practice mode keeps them up the whole time.</p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${label}`}>Scroll start delay</span>
                <span className={`text-sm tabular-nums ${muted}`}>{scrollDelaySec === 0 ? 'None' : `${scrollDelaySec}s`}</span>
              </div>
              {/* 0–10s lead-in after the scroll button is pressed before
                  auto-scroll actually begins. */}
              <div className={`flex rounded-lg border ${border} overflow-hidden`}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n, i) => (
                  <button
                    key={n}
                    onClick={() => updatePref('scrollStartDelaySec', n)}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-sm tabular-nums transition-colors ${i > 0 ? `border-l ${border}` : ''} ${
                      scrollDelaySec === n
                        ? 'bg-indigo-600 text-white'
                        : `${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className={`text-xs ${muted}`}>Seconds to wait after pressing the scroll button before scrolling starts.</p>
            </div>

            {/* Pedal paging (GLOBAL, not per song): switch Next/Previous from
                song-to-song skipping to paging through the current song a
                screenful at a time (for a page-turner pedal). Disables auto-scroll
                while on. A per-song Full Page song always turns whole pages. */}
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Pedal paging mode</span>
              <button
                onClick={() => updatePref('pedalPaging', !pedalPaging)}
                className={`w-full py-2.5 pointer-fine:py-2 rounded-lg border text-sm transition-colors ${
                  pedalPaging
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : `${border} ${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                }`}
              >
                {pedalPaging ? 'On' : 'Off'}
              </button>
              <p className={`text-xs ${muted}`}>Next/Previous page through the current song by one screen instead of skipping songs; at a song's end they move to the next/previous song. Auto-scroll is turned off in this mode.</p>

              {/* Sub-settings: only shown while pedal paging is on. */}
              {pedalPaging && (
                <div className={`flex flex-col gap-2 mt-1 pl-3 border-l-2 ${border}`}>
                  <span className={`text-sm ${label}`}>Page turn size</span>
                  <div className={`flex rounded-lg border ${border} overflow-hidden`}>
                    {[['full', 'Full'], ['threequarters', '3/4'], ['half', '1/2']].map(([val, text], i) => (
                      <button
                        key={val}
                        onClick={() => updatePref('pageSize', val)}
                        className={`flex-1 py-2.5 pointer-fine:py-2 text-sm tabular-nums transition-colors ${i > 0 ? `border-l ${border}` : ''} ${
                          (pageSize ?? 'full') === val
                            ? 'bg-indigo-600 text-white'
                            : `${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                        }`}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  <p className={`text-xs ${muted}`}>How far each Next / Previous press moves — a full screen, three quarters, or half a screen.</p>

                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-sm ${label}`}>Page turn glide</span>
                    <span className={`text-sm tabular-nums ${muted}`}>{glideMs === 0 ? 'Instant' : `${glideMs} ms`}</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="2000" step="50"
                    value={glideMs}
                    onChange={e => updatePref('pageGlideMs', Number(e.target.value))}
                    aria-label="Page turn glide duration in milliseconds"
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <p className={`text-xs ${muted}`}>How long a page turn takes to glide to the next screen. 0 is an instant jump; higher is a slower, smoother glide.</p>
                </div>
              )}
            </div>
          </section>

          {/* AI (optional) — bring-your-own Anthropic key. Stored on this device
              only; powers the editor's AI menu (find music, clean up, fill in
              details). Never included in exports or backups. */}
          <section className="flex flex-col gap-4" id="settings-ai">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>AI <span className="normal-case">(Optional)</span></h3>
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Anthropic API key</span>
              <p className={`text-[11px] ${muted}`}>
                Enables the editor's <span className={`font-medium ${label}`}>AI</span> menu — find music online, clean up a pasted chart, and fill in song details. Paste a key from <span className={`font-medium ${label}`}>console.anthropic.com → API Keys</span>. It's stored only on this device, never in your exports or backups, and each request bills your own Anthropic account. Treat it like a password.
              </p>
              <div className="flex gap-2">
                <input
                  // A real type="password" makes Chrome/Safari save the key as a
                  // login credential and then autofill it into other fields. We use
                  // a plain text input masked with CSS instead — the password
                  // manager ignores it entirely, so nothing gets saved or offered.
                  type="text"
                  style={{ WebkitTextSecurity: aiKeyReveal ? 'none' : 'disc' }}
                  value={aiKeyDraft}
                  onChange={e => setAiKeyDraft(e.target.value)}
                  placeholder={aiKeySaved && !aiKeyDraft ? '•••• saved ••••' : 'sk-ant-…'}
                  name="cue-anthropic-key"
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  data-1p-ignore data-lpignore="true"
                  className={`flex-1 min-w-0 px-3 py-2.5 pointer-fine:py-2 text-sm rounded-lg border outline-none focus:border-indigo-500 ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                />
                <button
                  onClick={() => setAiKeyReveal(v => !v)}
                  className={`px-3 py-2.5 pointer-fine:py-2 text-sm rounded-lg border transition-colors ${btnBorder}`}
                >
                  {aiKeyReveal ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveAiKey}
                  disabled={!aiKeyDirty}
                  className={`flex-1 py-2.5 pointer-fine:py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 ${aiKeyDirty ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500' : btnBorder}`}
                >
                  {aiKeySaved && !aiKeyDirty ? 'Saved' : 'Save key'}
                </button>
                {aiKeySaved && (
                  <button
                    onClick={clearAiKey}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-sm rounded-lg border transition-colors ${btnBorder}`}
                  >
                    Remove key
                  </button>
                )}
              </div>
              {aiKeySaved && !aiKeyDirty && (
                <p className="text-[11px] text-green-600 dark:text-green-500">Key saved — the AI menu is active in the editor.</p>
              )}
            </div>
            {/* Playing level — tailors AI answers (Ask about music, Transposing
                advice) from beginner-friendly explanations to terse expert ones. */}
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Playing level</span>
              <p className={`text-[11px] ${muted}`}>How the AI pitches its answers — beginners get more explanation and easier options; pros get terse expert replies.</p>
              <div className="grid grid-cols-2 gap-1.5">
                {AI_LEVELS.map(lv => (
                  <button
                    key={lv}
                    onClick={() => updatePref('aiLevel', lv)}
                    className={`py-2 px-2 text-xs rounded-lg border capitalize transition-colors ${
                      aiLevel === lv
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : btnBorder
                    }`}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Exports — Chromium only; Safari/Firefox/iOS have no folder picker,
              so the section is hidden rather than shown as unavailable. */}
          {canPickFolder && (
            <section className="flex flex-col gap-4">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Exports <span className="normal-case">(Chrome Only)</span></h3>
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
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Cloud Account <span className="normal-case">(Optional)</span></h3>

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
