import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { KEY_NAMES, MAX_CAPO, capoFrets } from '../utils/transpose.js';
import { TIME_SIGNATURES } from '../utils/timeSig.js';
import { playMetronome } from '../utils/metronome.js';
import { mmss } from '../utils/duration.js';

// Whether the details stay open, remembered across songs and sessions. Closed by
// default: once a song's artist/key/tempo are set you rarely touch them again,
// and on a phone the open form costs about a quarter of the screen before a
// single lyric shows.
const META_OPEN_KEY = 'cue:editor_meta_open';

const RESET_AFTER_MS = 3000;
const MIN_TAPS = 2;

// Shared height reference: matches DurationStepper -/+ buttons (py-2.5 text-sm border)
const fieldCls = 'border border-gray-300 dark:border-gray-700 rounded outline-none transition-colors';
const fieldFocus = 'focus:border-indigo-500';
const fieldHover = 'hover:border-indigo-400 dark:hover:border-indigo-500';
const fieldText  = 'text-sm text-gray-900 dark:text-white';
const fieldMuted = 'placeholder-gray-400 dark:placeholder-gray-600';

function TapTempo({ bpm, onBpm, timeSig, onTimeSig }) {
  const tapsRef = useRef([]);
  const timerRef = useRef(null);
  const [display, setDisplay] = useState(null);

  function handleTap() {
    const now = Date.now();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { tapsRef.current = []; setDisplay(null); }, RESET_AFTER_MS);
    tapsRef.current.push(now);
    if (tapsRef.current.length < MIN_TAPS) { setDisplay('...'); return; }
    let total = 0;
    for (let i = 1; i < tapsRef.current.length; i++) total += tapsRef.current[i] - tapsRef.current[i - 1];
    const val = Math.round(60000 / (total / (tapsRef.current.length - 1)));
    setDisplay(val);
    onBpm(String(val));
  }

  const previewBpm = Number(display || bpm || 120);
  const tapBtnCls = `px-2 py-2.5 font-medium ${fieldCls} ${fieldHover} text-gray-600 dark:text-gray-300 hover:text-indigo-400 select-none touch-none text-sm`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onPointerDown={handleTap}
        className={tapBtnCls}
        title="Tap in rhythm to set BPM"
      >
        {display === null ? 'Tap' : display === '...' ? '...' : `${display}`}
      </button>
      <button
        type="button"
        onClick={() => playMetronome(previewBpm, timeSig)}
        className={tapBtnCls}
        title={`Preview tempo (${timeSig})`}
      >
        ▶
      </button>
      {/* Was a 4/4 ↔ 3/4 toggle. A signature that came in from an import but
          isn't on the list is prepended, so opening this form can never quietly
          rewrite someone's 7/4 into 4/4. */}
      <select
        value={timeSig}
        onChange={e => onTimeSig(e.target.value)}
        className={`px-2 py-2.5 font-mono font-bold ${fieldCls} ${fieldHover} ${fieldFocus} text-gray-500 dark:text-gray-400 hover:text-indigo-400 text-sm bg-white dark:bg-gray-900 cursor-pointer`}
        title="Time signature"
        aria-label="Time signature"
      >
        {(TIME_SIGNATURES.includes(timeSig) ? TIME_SIGNATURES : [timeSig, ...TIME_SIGNATURES]).map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}

function DurationStepper({ value, onChange }) {
  const intervalRef  = useRef(null);
  const timeoutRef   = useRef(null);
  const startTimeRef = useRef(0);
  const valueRef     = useRef(value);
  valueRef.current   = value;

  function parseDuration(str) {
    if (!str?.trim()) return 0;
    const parts = String(str).split(':');
    if (parts.length === 2) return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    return parseInt(str, 10) || 0;
  }

  function doStep(dir) {
    const held = Date.now() - startTimeRef.current;
    const inc  = held > 4000 ? 10 : held > 2000 ? 5 : 1;
    onChange(mmss(parseDuration(valueRef.current) + dir * inc));
  }

  function startHold(e, dir) {
    e.currentTarget.setPointerCapture(e.pointerId);
    startTimeRef.current = Date.now();
    doStep(dir);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => doStep(dir), 150);
    }, 400);
  }

  function stopHold() {
    clearTimeout(timeoutRef.current);
    clearInterval(intervalRef.current);
  }

  const btnCls = `px-3 py-2.5 text-sm font-bold ${fieldCls} ${fieldHover} text-gray-600 dark:text-gray-300 hover:text-indigo-400 select-none touch-none`;

  return (
    <div className="flex items-center gap-1">
      <button type="button" onPointerDown={e => startHold(e, -1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold} className={btnCls} title="Decrease duration">−</button>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="3:30"
        size={5}
        autoComplete="off" data-1p-ignore data-lpignore="true"
        className={`bg-transparent ${fieldCls} ${fieldFocus} px-1 py-2.5 text-sm ${fieldText} ${fieldMuted} text-center`}
      />
      <button type="button" onPointerDown={e => startHold(e, 1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold} className={btnCls} title="Increase duration">+</button>
    </div>
  );
}

export default function MetadataForm({ metadata, onChange, fullPage = false, onFullPageChange }) {
  function set(key, val) { onChange(prev => ({ ...prev, [key]: val })); }

  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(META_OPEN_KEY) === '1'; } catch { return false; }
  });
  function toggle() {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(META_OPEN_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  // The closed row has to be worth reading on its own, or collapsing only hides
  // things and costs a tap. Capo rides with the key because they are read
  // together ("D, capo 2"); the video is a word because a URL would swamp the
  // line. Title is deliberately absent — the editor header already carries it.
  const capo = capoFrets(metadata);
  const summary = [
    metadata.artist,
    metadata.key && (capo ? `${metadata.key} · capo ${capo}` : metadata.key),
    metadata.tempo && `${metadata.tempo} bpm`,
    metadata.duration,
    fullPage && 'Full Page',
    metadata.youtubeUrl && 'video',
  ].filter(Boolean).join(' · ');

  const inputCls = `bg-transparent ${fieldCls} ${fieldFocus} px-2 py-2.5 ${fieldText} ${fieldMuted} w-full`;

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <span className="text-xs font-semibold uppercase tracking-wide shrink-0 text-gray-500">Details</span>
        {/* Values only while shut — open, the real controls say the same thing. */}
        {!open && (
          <span className="ml-auto text-xs truncate text-gray-500 dark:text-gray-400" title={summary}>
            {summary || 'Add artist, key, tempo…'}
          </span>
        )}
        <ChevronRight
          size={14}
          className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-90' : 'ml-1'}`}
        />
      </button>
      {/* No label line above the fields: it cost 16px per wrapped row, and an
          inline label would buy that back in WIDTH, which on a phone just
          wraps to another row. Each control names itself instead — the empty
          option on a select, the placeholder on an input, its own text on a
          button — all of which fit in space the control already occupies.
          aria-label carries the name for screen readers. */}
      {open && (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-2 pt-0.5">
          {/* Artist */}
          <div className="min-w-32">
            <input
              value={metadata.artist || ''}
              onChange={e => set('artist', e.target.value)}
              placeholder="Artist"
              aria-label="Artist"
              autoComplete="off" data-1p-ignore data-lpignore="true"
              className={inputCls}
            />
          </div>

          {/* Source key */}
          <select
            value={metadata.key || ''}
            onChange={e => set('key', e.target.value)}
            aria-label="Key"
            // h-[42px] matches the sibling inputs exactly (a native select renders
            // ~1px shorter than an input at the same py-2.5).
            className={`bg-gray-50 dark:bg-gray-800 ${fieldCls} ${fieldFocus} px-2 h-[42px] text-sm text-gray-900 dark:text-white pr-6 cursor-pointer`}
          >
            <option value="">Key</option>
            {KEY_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          {/* Capo — beside Key on purpose: the two are read together ("D, capo 2"),
              and a fret number next to a key explains itself in a way it would not
              next to a video link.

              IT DOES NOT CHANGE THE KEY. A song in D with a capo on 2 is fingered in
              C and still sounds in D, so Key stays D and only the chords DRAWN come
              down — one semitone per fret, everywhere they are drawn. That is the
              whole difference from Transpose, which changes what you sound. */}
          <select
            value={String(capoFrets(metadata) || '')}
            onChange={e => set('capo', e.target.value)}
            title="Chords are drawn as the shapes you finger with the capo on. The song's key, and what it sounds like, do not change."
            aria-label="Capo fret"
            className={`bg-gray-50 dark:bg-gray-800 ${fieldCls} ${fieldFocus} px-2 h-[42px] text-sm text-gray-900 dark:text-white pr-6 cursor-pointer`}
          >
            <option value="">Capo</option>
            {Array.from({ length: MAX_CAPO }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          {/* Tempo — the Tap button beside it is what says "tempo". */}
          <div className="flex items-center gap-1.5">
            <input
              value={metadata.tempo || ''}
              onChange={e => set('tempo', e.target.value)}
              placeholder="BPM"
              aria-label="Tempo in BPM"
              size={4}
              autoComplete="off" data-1p-ignore data-lpignore="true"
              className={`bg-transparent ${fieldCls} ${fieldFocus} px-2 py-2.5 text-sm ${fieldText} ${fieldMuted}`}
            />
            <TapTempo
              bpm={metadata.tempo}
              onBpm={v => set('tempo', v)}
              timeSig={metadata.timeSig || '4/4'}
              onTimeSig={v => set('timeSig', v)}
            />
          </div>

          {/* Duration (M:SS) */}
          <DurationStepper value={metadata.duration || ''} onChange={v => set('duration', v)} />

          {/* Display mode (per song). Off = continuous scroll (the default that gets
              the most done). On = discrete full pages that fit the screen, turned one
              at a time. Applies to text and PDF songs alike. The Screen-vs-Songs pedal
              choice is a global setting (Settings), not per song. */}
          <button
            type="button"
            title="Off = continuous scroll. On = discrete full pages that fit the screen, turned one at a time. Applies to text and PDF songs."
            onClick={() => onFullPageChange?.(!fullPage)}
            className={`h-[42px] px-4 text-sm rounded-md border transition-colors ${fullPage
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            {/* Full label on wider screens, "FP" on a phone to save room. */}
            <span className="hidden sm:inline">Full Page</span>
            <span className="sm:hidden">FP</span>
          </button>

          {/* YouTube URL */}
          <div className="min-w-48 flex-1">
            <input
              value={metadata.youtubeUrl || ''}
              onChange={e => set('youtubeUrl', e.target.value)}
              placeholder="YouTube URL"
              aria-label="YouTube URL"
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-1p-ignore data-lpignore="true"
              className={inputCls}
            />
          </div>
        </div>
      )}
    </div>
  );
}
