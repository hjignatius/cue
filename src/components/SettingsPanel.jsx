import { useEffect, useRef, useState } from 'react';
import { X, ChevronRight} from 'lucide-react';
import { usePrefs, AI_LEVELS, MUSIC_GENRES } from '../context/PrefsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supportsExportFolder, getExportFolderName, chooseExportFolder, clearExportFolder } from '../utils/filePicker.js';
import { CHORD_LIBRARIES } from '../data/chordLibraries.js';
import { getApiKey, setApiKey, AI_TIERS, tierById } from '../lib/ai.js';

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

// A collapsible settings section.
//
// The whole point of collapsing is the `summary`: the section's current values,
// shown on the closed row. Without it an accordion only HIDES things and costs a
// tap to read anything; with it, the shut panel is still a complete picture of
// how Cue is set up, and you open a section only to change something.
function Section({ title, badge, summary, open, onToggle, dark, children }) {
  const border = dark ? 'border-gray-700' : 'border-gray-200';
  const muted  = dark ? 'text-gray-400' : 'text-gray-500';
  const label  = dark ? 'text-white' : 'text-gray-900';
  return (
    <section className={`rounded-xl border ${border}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl transition-colors ${dark ? 'hover:bg-gray-800/60' : 'hover:bg-gray-50'}`}
      >
        <span className={`text-xs font-semibold uppercase tracking-wide shrink-0 ${label}`}>
          {title}{badge && <span className={`normal-case font-normal ml-1 ${muted}`}>{badge}</span>}
        </span>
        {/* Values sit right-aligned and truncate — they're a reminder, not the
            control. Hidden while open, where the real controls say the same. */}
        {!open && summary && (
          <span className={`ml-auto text-xs truncate ${muted}`} title={summary}>{summary}</span>
        )}
        <ChevronRight
          size={16}
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''} ${muted} ${open ? '' : 'ml-1'}`}
        />
      </button>
      {open && <div className={`px-3 pb-4 pt-1 flex flex-col gap-4 border-t ${border}`}>{children}</div>}
    </section>
  );
}

export default function SettingsPanel({ open, onClose, hideAccount = false, initialSection = null }) {
  const { theme, chordColor, chordLabelScale, accidentals, instrument, aiLevel, aiTier, genres, favoriteArtists, personalizeFromLibrary, updatePref } = usePrefs();
  const toggleGenre = (g) => updatePref('genres', (genres || []).includes(g) ? genres.filter(x => x !== g) : [...(genres || []), g]);
  const dark = theme === 'dark';
  const { user, isConfigured, signInWithEmail, verifyEmailOtp, signOut } = useAuth();

  // One section open at a time — the point is to keep the panel short, and
  // multi-open would let it grow back to the wall of controls this replaced.
  // All shut on open: the summaries carry the state, so nothing is hidden that
  // you need a tap to learn.
  const [openSection, setOpenSection] = useState(initialSection);
  const toggleSection = (id) => setOpenSection(cur => (cur === id ? null : id));
  // Re-applied on every open, so arriving from "Set up AI…" lands on the AI
  // section rather than a wall of shut rows — and a later plain open resets.
  useEffect(() => { if (open) setOpenSection(initialSection); }, [open, initialSection]);

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

  // Current-value summaries for the shut rows. Declared HERE, below every piece
  // of state they read (aiKeySaved, exportFolder, user) — placed higher up they
  // hit those constants' temporal dead zone and take the panel out on open.
  const instrumentLabel = INSTRUMENT_OPTIONS.find(o => o.id === instrument)?.label ?? 'None';
  const accidentalLabel = accidentals === 'flats' ? 'Flats' : accidentals === 'sharps' ? 'Sharps' : 'Auto';
  const appearanceSummary = `${dark ? 'Dark' : 'Light'} · ${accidentalLabel}`;
  const chordsSummary = instrumentLabel;
  const aiSummary = aiKeySaved ? `Key saved · ${tierById(aiTier).label}` : 'Not set up';
  const accountSummary = user?.email || 'Signed out';
  // Both halves of Data & Account on one line, skipping whichever doesn't apply.
  const dataSummary = [
    (isConfigured && !hideAccount) ? accountSummary : null,
    canPickFolder ? (exportFolder || 'Ask every time') : null,
  ].filter(Boolean).join(' · ');


  return (
    <>
      {open && (
        /* Transparent: no dim, but still the click-catcher that closes the
           drawer when you tap outside it. */
        <div className="fixed inset-0 z-40" onClick={onClose} />
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
          <Section title="Appearance" summary={appearanceSummary} dark={dark}
            open={openSection === 'appearance'} onToggle={() => toggleSection('appearance')}>

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
          </Section>

          {/* Chords — the instrument library plus how chord names look over
              lyrics. Split out of Appearance: it was the tallest section, and
              these three belong together more than they belong with Theme. */}
          <Section title="Chords" summary={chordsSummary} dark={dark}
            open={openSection === 'chords'} onToggle={() => toggleSection('chords')}>
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
              <p className={`text-[11px] ${muted}`}>Applies to chord names above lyrics, and to the chord shapes when Imbed is on.</p>
            </div>
          </Section>

          {/* AI (optional) — bring-your-own Anthropic key. Stored on this device
              only; powers the editor's AI menu (find music, clean up, fill in
              details). Never included in exports or backups. */}
          <Section title="AI" badge="(Optional)" summary={aiSummary} dark={dark}
            open={openSection === 'ai'} onToggle={() => toggleSection('ai')}>
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
            {/* Which model the AI tools run on. Deliberately named by INTENT, not
                by model id: a retired model is remapped in one row of AI_TIERS,
                where a stored raw id would break every AI action. */}
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Model</span>
              <div className={`flex rounded-lg border ${border} overflow-hidden`}>
                {AI_TIERS.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => updatePref('aiTier', t.id)}
                    className={`flex-1 py-2.5 pointer-fine:py-2 text-sm transition-colors ${i > 0 ? `border-l ${border}` : ''} ${
                      aiTier === t.id
                        ? 'bg-indigo-600 text-white'
                        : `${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className={`text-xs ${muted}`}>{tierById(aiTier).blurb}</p>
              <p className={`text-xs ${muted}`}>
                Every AI action bills your own Anthropic account, so this is your call. <span className={`font-medium ${label}`}>Try again — smarter</span> re-runs a single
                answer one step above this setting; on the top setting there is nothing
                above it, so that link doesn't appear. A cheaper tier is planned once
                Cue can offer a free one.
              </p>
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

            {/* Music taste — steers "Suggest songs to learn". Optional: the
                recommender also infers taste from the songs already in the library. */}
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Music taste</span>
              <p className={`text-[11px] ${muted}`}>Genres and artists you like — used to suggest songs to learn. Optional; Cue also learns from your library.</p>
              <div className="flex flex-wrap gap-1.5">
                {MUSIC_GENRES.map(g => {
                  const on = (genres || []).includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={`py-1.5 px-3 text-xs rounded-full border transition-colors ${
                        on ? 'bg-indigo-600 border-indigo-600 text-white' : btnBorder
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={favoriteArtists || ''}
                onChange={e => updatePref('favoriteArtists', e.target.value)}
                placeholder="Favorite artists, e.g. James Taylor, Billy Strings"
                className={`mt-1 w-full py-2 px-3 text-sm rounded-lg border bg-transparent ${btnBorder} ${label}`}
              />
            </div>

            {/* Personalize from library — when on, "Suggest songs to learn" sends
                your song list to tailor picks and skip ones you own. Off = pick
                from genres/artists only (branch out), and nothing is sent. */}
            <div className="flex flex-col gap-2">
              <span className={`text-sm ${label}`}>Personalize from my library</span>
              <button
                onClick={() => updatePref('personalizeFromLibrary', !personalizeFromLibrary)}
                className={`w-full py-2.5 pointer-fine:py-2 rounded-lg border text-sm transition-colors ${
                  personalizeFromLibrary
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : `${btnBorder} ${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
                }`}
              >
                {personalizeFromLibrary ? 'On' : 'Off'}
              </button>
              <p className={`text-[11px] ${muted}`}>When on, <em>Suggest songs to learn</em> uses the songs in your library to tailor picks and avoid ones you already have (your song titles are sent to the AI on your key). Turn off to get suggestions from your genres/artists only.</p>
            </div>
          </Section>

          {/* Data & Account — where exports land, and who you're signed in as.
              One section rather than two: each was a single row, and a heading
              per row is pure overhead once the rows collapse. Shown if EITHER
              half applies; the folder picker is Chromium-only (Safari/Firefox/
              iOS have none, so it's hidden rather than shown as unavailable). */}
          {(canPickFolder || (isConfigured && !hideAccount)) && (
            <Section title="Data & Account" summary={dataSummary} dark={dark}
              open={openSection === 'data'} onToggle={() => toggleSection('data')}>
              {canPickFolder && (
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
              )}

              {isConfigured && !hideAccount && (<>
                {canPickFolder && <div className={`border-t ${border} -mx-3`} role="separator" />}

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
              </>)}
            </Section>
          )}

          {/* Footnote, below the sections: it points somewhere else rather than
              holding a control, so it isn't a row of its own. */}
          <p className={`text-xs pt-1 ${muted}`}>
            Controls fade, scroll start delay, count-in style and pedal paging live in{' '}
            <span className={label}>Present</span> — tap the wrench, then the gear.
          </p>

          {/* Support link. An outbound link, not a control: Cue takes no payment,
              runs no payment code and stores nothing — this just opens PayPal in
              the browser. Written https even though the link is usually quoted as
              http; paypal.me redirects either way, but there is no reason to make
              the first hop plaintext.
              "Support", not "Donate": PayPal reserves Donate wording and the
              charity fee rate for registered charities in many countries, and Cue
              is one person's app, not a charity. */}
          <p className={`text-xs ${muted}`}>
            Cue is free and always will be.{' '}
            <a
              href="https://paypal.me/howardignatius"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Support Cue
            </a>{' '}
            if it earns its keep.
          </p>
        </div>
      </div>
    </>
  );
}
