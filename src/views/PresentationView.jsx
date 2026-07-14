import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import AnnotationCanvas from '../components/AnnotationCanvas.jsx';
import { useYouTube } from '../context/YouTubeContext.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import { parseChordPro, attachSectionLabels, expandSections, splitAnnotations } from '../utils/chordPro.js';
import { transposeText, semitonesBetween, useFlatsForKey } from '../utils/transpose.js';
import { convertToBrackets } from '../utils/chordStyle.js';
import { Fragment } from 'react';
import SongChordPanel from '../components/SongChordPanel.jsx';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useIsNarrow } from '../hooks/useIsNarrow.js';

// Parse "3:30" or "210" → seconds
function parseDuration(dur) {
  if (!dur) return 0;
  const s = String(dur);
  if (s.includes(':')) {
    const [m, sec] = s.split(':').map(Number);
    return (m || 0) * 60 + (sec || 0);
  }
  return Number(s) || 0;
}

function playMetronome(bpm, timeSig = '4/4') {
  if (!bpm) return;
  const beatsPerMeasure = timeSig === '3/4' ? 3 : 4;
  const totalBeats = beatsPerMeasure * 2;
  const interval = 60 / bpm;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  for (let i = 0; i < totalBeats; i++) {
    const isAccent = i % beatsPerMeasure === 0;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = isAccent ? 1000 : 700;
    gain.gain.setValueAtTime(isAccent ? 1 : 0.55, ctx.currentTime + i * interval);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * interval + 0.05);
    osc.start(ctx.currentTime + i * interval);
    osc.stop(ctx.currentTime + i * interval + 0.05);
  }
}

function LyricText({ text, accentColor }) {
  return splitAnnotations(text).map((run, i) =>
    run.marker
      ? <span key={i} className="font-bold" style={{ color: accentColor }}>{run.text}</span>
      : <Fragment key={i}>{run.text}</Fragment>
  );
}

function SongBody({ text, semitones, useFlats, fontPx, dark, chordColor, chordLabelScale = 0, displayMode = 'over' }) {
  const transposed = transposeText(convertToBrackets(text), semitones, useFlats);
  const lines = attachSectionLabels(expandSections(parseChordPro(transposed)));
  const lyricColor = dark ? '#f3f4f6' : '#1f2937';
  const labelColor = dark ? '#818cf8' : '#4f46e5';
  const chordPx = fontPx * 0.85 * (1 + chordLabelScale / 100);

  return (
    <div className="font-mono" style={{ color: lyricColor }}>
      {lines.map((line, i) => {
        const label = line.label ? (
          <div
            key={`lbl-${i}`}
            className="font-sans font-bold uppercase tracking-widest"
            style={{ color: labelColor, fontSize: fontPx * 0.6, marginTop: i === 0 ? 0 : fontPx, marginBottom: fontPx * 0.25 }}
          >
            {line.label}
          </div>
        ) : null;

        if (line.type === 'directive') return label;
        if (line.type === 'empty') return <div key={i}>{label}<div style={{ height: fontPx * 0.8 }} /></div>;

        if (line.type === 'chords') {
          if (displayMode === 'brackets') {
            return (
              <div key={i}>
                {label}
                <div className="leading-relaxed" style={{ fontSize: fontPx, marginBottom: fontPx * 0.2 }}>
                  {line.segments.map((seg, j) => (
                    <span key={j}>
                      {seg.chord && (
                        <span className="font-bold" style={{ color: chordColor }}>[{seg.chord}]</span>
                      )}
                      {seg.text ? <LyricText text={seg.text} accentColor={chordColor} /> : null}
                    </span>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div key={i}>
              {label}
              <div className="flex flex-wrap" style={{ marginBottom: fontPx * 0.2 }}>
                {line.segments.map((seg, j) => (
                  <div key={j} className="flex flex-col" style={{ whiteSpace: 'pre' }}>
                    <span className="font-bold leading-tight" style={{ color: chordColor, fontSize: chordPx, height: chordPx * 1.2 }}>
                      {seg.chord ? seg.chord + ' ' : ' '}
                    </span>
                    <span className="leading-snug" style={{ fontSize: fontPx }}>
                      {seg.text ? <LyricText text={seg.text} accentColor={chordColor} /> : ' '}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={i}>
            {label}
            <div className="leading-snug" style={{ fontSize: fontPx, marginBottom: fontPx * 0.2, whiteSpace: 'pre-wrap' }}>
              <LyricText text={line.segments?.[0]?.text || ''} accentColor={chordColor} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MIN_FONT = 14;
const MAX_FONT = 56;
const FONT_STEP = 2;
const DEFAULT_FONT = 28;
// Present-mode lyric font size persists across sessions (survives exiting to the
// editor / setlist and returning, which unmounts and remounts this view).
const FONT_KEY = 'cue:present_font_px';
// Fallback scroll speeds (px/s) when no duration is set
const FALLBACK_SPEEDS = [10, 20, 36, 60];

// Present mode targets a canonical monospace line width: the lyrics column is
// sized to hold this many characters at the current font size, independent of
// the chord shapes panel. Tune LYRIC_TARGET_CHARS to taste.
const LYRIC_TARGET_CHARS = 65;
// Horizontal padding of the scroll area inside the lyrics column (scrollRef uses
// md:px-12 = 48px per side; the wide layout is always ≥1024px so md: is active).
const LYRIC_COL_PADDING = 96;
// Font stack matching SongBody's `font-mono` (Tailwind), used to measure the
// monospace advance width so the column width tracks the real glyph metrics.
const MONO_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// Pixel width of a lyrics column that holds LYRIC_TARGET_CHARS monospace chars at
// the given font size, plus the scroll padding. Measured via canvas; falls back
// to the ~0.6em monospace advance if measurement is unavailable.
function lyricColumnWidth(fontPx) {
  let textW = LYRIC_TARGET_CHARS * fontPx * 0.6;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${fontPx}px ${MONO_FONT_STACK}`;
    const measured = ctx.measureText('0'.repeat(LYRIC_TARGET_CHARS)).width;
    if (measured > 0) textW = measured;
  } catch { /* keep fallback */ }
  return Math.round(textW + LYRIC_COL_PADDING);
}

// Tap-only handler: fires onTap only when pointer didn't move >10 px.
// touch-action: pan-y on the element lets the browser handle vertical
// scroll natively; pointercancel fires when the browser takes over.
function useGhostTap(onTap) {
  const [pressed, setPressed] = useState(false);
  const s = useRef({ startX: 0, startY: 0, isDrag: false });
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  return {
    pressed,
    onPointerDown(e) {
      s.current = { startX: e.clientX, startY: e.clientY, isDrag: false };
      setPressed(true);
    },
    onPointerMove(e) {
      if (s.current.isDrag) return;
      const d = Math.hypot(e.clientX - s.current.startX, e.clientY - s.current.startY);
      if (d > 10) { s.current.isDrag = true; setPressed(false); }
    },
    onPointerUp() {
      if (!s.current.isDrag) tapRef.current();
      s.current.isDrag = true;
      setPressed(false);
    },
    onPointerCancel() {
      s.current.isDrag = true;
      setPressed(false);
    },
  };
}

export default function PresentationView({ songs, startIndex = 0, onExit, onEdit, onNavigate, showEdit = true, disableAnnotations = false }) {
  const { theme, chordColor: prefsChordColor, chordDiagramSize, chordLabelScale, metronomeMode, accidentals, updatePref } = usePrefs();
  const dark = theme === 'dark';
  const isNarrow = useIsNarrow();
  const [index, setIndex]       = useState(Math.max(0, Math.min(startIndex, songs.length - 1)));
  const [fontPx, setFontPx]     = useState(() => {
    try {
      const n = parseInt(localStorage.getItem(FONT_KEY) || '', 10);
      if (!isNaN(n)) return Math.min(MAX_FONT, Math.max(MIN_FONT, n));
    } catch { /* ignore */ }
    return DEFAULT_FONT;
  });
  const [scrolling, setScrolling] = useState(false);
  const [speedIdx, setSpeedIdx]   = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [flashState, setFlashState] = useState(null); // null | 'beat' | 'accent'
  const [barCanScrollRight, setBarCanScrollRight] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const { url: ytUrl, collapsed: ytCollapsed, openPlayer, collapsePlayer, expandPlayer } = useYouTube();
  const ytWasExpandedRef = useRef(false);
  const scrollRef      = useRef(null);
  const contentWrapRef = useRef(null);
  const barRef         = useRef(null);
  const rafRef         = useRef(0);
  const flashTimers    = useRef([]);
  const [ghostsIdle, setGhostsIdle] = useState(false);
  const [prevBounce, setPrevBounce] = useState(false);
  const [nextBounce, setNextBounce] = useState(false);
  const ghostTimerRef  = useRef(null);

  const song  = songs[index];
  const total = songs.length;
  const meta  = song?.metadata || {};
  const semitones = semitonesBetween(meta.key, song?.displayKey);
  // Accidental spelling for transposed chords/diagrams — auto follows the View Key.
  const useFlats = useFlatsForKey(accidentals, song?.displayKey);

  const goTo = useCallback((target) => {
    const clamped = Math.max(0, Math.min(total - 1, target));
    if (clamped === index) return;
    setScrolling(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setIndex(clamped);
  }, [index, total, songs]);

  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);

  const wakeGhosts = useCallback(() => {
    setGhostsIdle(false);
    clearTimeout(ghostTimerRef.current);
    ghostTimerRef.current = setTimeout(() => setGhostsIdle(true), 4000);
  }, []);

  const handlePrev = useCallback(() => {
    wakeGhosts();
    if (index === 0) { setPrevBounce(true); setTimeout(() => setPrevBounce(false), 300); }
    else prev();
  }, [wakeGhosts, index, prev]);

  const handleNext = useCallback(() => {
    wakeGhosts();
    if (index === total - 1) { setNextBounce(true); setTimeout(() => setNextBounce(false), 300); }
    else next();
  }, [wakeGhosts, index, total, next]);

  const smallerAction = useCallback(() => { wakeGhosts(); setFontPx(f => Math.max(MIN_FONT, f - FONT_STEP)); }, [wakeGhosts]);
  const largerAction  = useCallback(() => { wakeGhosts(); setFontPx(f => Math.min(MAX_FONT, f + FONT_STEP)); }, [wakeGhosts]);

  const prevGhost    = useGhostTap(handlePrev);
  const nextGhost    = useGhostTap(handleNext);
  const smallerGhost = useGhostTap(smallerAction);
  const largerGhost  = useGhostTap(largerAction);

  // Persist the lyric font size so A-/A+ changes survive leaving and re-entering.
  useEffect(() => {
    try { localStorage.setItem(FONT_KEY, String(fontPx)); } catch { /* ignore */ }
  }, [fontPx]);

  // Notify parent whenever the displayed song changes
  useEffect(() => {
    if (onNavigate && songs[index]) onNavigate(songs[index]);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse the floating player when entering present mode; restore on exit
  useEffect(() => {
    const wasExpanded = !!ytUrl && !ytCollapsed;
    ytWasExpandedRef.current = wasExpanded;
    if (wasExpanded) collapsePlayer();
    return () => {
      if (ytWasExpandedRef.current) expandPlayer();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Metronome helpers
  function triggerVisualMetronome(bpm, sig) {
    flashTimers.current.forEach(clearTimeout);
    flashTimers.current = [];
    const beatsPerMeasure = sig === '3/4' ? 3 : 4;
    const totalBeats = beatsPerMeasure * 2;
    const intervalMs = 60000 / bpm;
    for (let i = 0; i < totalBeats; i++) {
      const isAccent = i % beatsPerMeasure === 0;
      const onMs = isAccent ? Math.min(120, intervalMs * 0.45) : Math.min(70, intervalMs * 0.28);
      flashTimers.current.push(
        setTimeout(() => setFlashState(isAccent ? 'accent' : 'beat'), i * intervalMs),
        setTimeout(() => setFlashState(null), i * intervalMs + onMs),
      );
    }
  }

  function handleMetronomeTap() {
    const bpm = Number(meta.tempo);
    if (!bpm) return;
    if (metronomeMode === 'sound') {
      playMetronome(bpm, timeSig);
    } else {
      triggerVisualMetronome(bpm, timeSig);
    }
  }

  // Clear flash timers on unmount
  useEffect(() => () => flashTimers.current.forEach(clearTimeout), []);

  // Start the ghost idle timer on mount; wake on scroll
  useEffect(() => {
    ghostTimerRef.current = setTimeout(() => setGhostsIdle(true), 4000);
    return () => clearTimeout(ghostTimerRef.current);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', wakeGhosts, { passive: true });
    return () => el.removeEventListener('scroll', wakeGhosts);
  }, [wakeGhosts]);

  // Track whether the toolbar can scroll right (for fade affordance)
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const check = () => setBarCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { el.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, []);
  // Re-check overflow when song changes (metronome buttons may appear/disappear)
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    setBarCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, [index]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if      (e.key === 'ArrowRight' || e.key === 'PageDown') next();
      else if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   prev();
      else if (e.key === 'Escape')  onExit();
      else if (e.key === '+' || e.key === '=') { setFontPx(f => Math.min(MAX_FONT, f + FONT_STEP)); wakeGhosts(); }
      else if (e.key === '-' || e.key === '_') { setFontPx(f => Math.max(MIN_FONT, f - FONT_STEP)); wakeGhosts(); }
      else if (e.key === ' ') { e.preventDefault(); setScrolling(s => !s); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onExit, wakeGhosts]);

  // Screen wake lock
  useEffect(() => {
    let lock = null;
    let gone = false;
    async function acquire() {
      try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch { /* fine */ }
    }
    acquire();
    function onVisible() { if (document.visibilityState === 'visible' && !gone) acquire(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { lock?.release(); } catch { /* already gone */ }
    };
  }, []);

  // Duration-based auto-scroll.
  // Rate = (total scrollable px) / (song duration in seconds).
  // Falls back to fixed speed when no duration is set.
  useEffect(() => {
    if (!scrolling) return;
    const el = scrollRef.current;
    if (!el) return;

    const durationSec = parseDuration(meta.duration);
    const scrollable  = el.scrollHeight - el.clientHeight;
    if (scrollable <= 0) { setScrolling(false); return; }

    const pxPerSec = durationSec > 0
      ? (scrollable / durationSec) * (speedIdx + 1)
      : FALLBACK_SPEEDS[speedIdx];

    let last  = performance.now();
    let carry = 0;

    function step(now) {
      const dt = (now - last) / 1000;
      last = now;
      carry += pxPerSec * dt;
      const whole = Math.floor(carry);
      if (whole > 0) {
        carry -= whole;
        el.scrollTop += whole;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setScrolling(false);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scrolling, speedIdx, index, meta.duration]);

  // Theme helpers
  const bg      = dark ? 'bg-neutral-950' : 'bg-white';
  const barBg   = dark ? 'bg-neutral-900/95 border-neutral-800' : 'bg-gray-50/95 border-gray-200';
  const muted   = dark ? 'text-neutral-400' : 'text-gray-500';
  const textCol = dark ? 'text-white' : 'text-gray-900';
  const btn     = `relative flex items-center justify-center rounded-lg border transition-colors px-2 h-11 pointer-fine:h-9 text-xs font-semibold after:absolute after:-inset-1.5 after:content-[''] ${
    dark ? 'border-neutral-700 text-neutral-200 hover:bg-neutral-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'
  }`;

  const hasDuration = parseDuration(meta.duration) > 0;
  const timeSig = meta.timeSig || '4/4';

  // Fixed lyrics-column width for the wide layout. Recomputes only on font-size
  // change (A-/A+), never on chord-panel resize — so contentWrapRef.offsetWidth
  // stays constant when the chord panel is dragged and the annotation
  // ResizeObserver never fires.
  const lyricColWidth = useMemo(() => lyricColumnWidth(fontPx), [fontPx]);

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${bg}`}>
      {/* Top bar */}
      <div className="relative shrink-0">
      <div ref={barRef} className={`relative flex items-center gap-2 px-4 py-2 border-b ${barBg} backdrop-blur overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [justify-content:safe_center]`}>
        {/* Silent-mode beat flash overlay — accent beats brighter than regular beats */}
        <div
          className={`absolute inset-0 pointer-events-none ${dark ? 'bg-white' : 'bg-black'}`}
          style={{
            opacity: flashState === 'accent' ? 0.7 : flashState === 'beat' ? 0.35 : 0,
            transition: flashState ? 'opacity 18ms' : 'opacity 130ms',
          }}
        />
        {/* Song info */}
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-bold truncate ${textCol}`}>
            {meta.title?.trim() || 'Untitled'}
            {meta.artist?.trim() && <span className={`ml-2 font-normal ${muted}`}>· {meta.artist.trim()}</span>}
          </div>
          <div className={`text-[11px] ${muted}`}>
            {total > 1 && `Song ${index + 1} of ${total}`}
            {total > 1 && (meta.key?.trim() || meta.tempo) && ' · '}
            {(song?.displayKey || meta.key?.trim()) && <>Key {song?.displayKey || meta.key.trim()}</>}
            {meta.key?.trim() && meta.tempo && ' · '}
            {meta.tempo && <>{meta.tempo} BPM</>}
            {meta.tempo && timeSig === '3/4' && ' · 3/4'}
            {hasDuration && ` · ${meta.duration}`}
          </div>
        </div>

        {/* Metronome tap */}
        {meta.tempo && (
          <button
            className={btn}
            onClick={handleMetronomeTap}
            title={`${metronomeMode === 'sound' ? 'Play' : 'Flash'} ${meta.tempo} BPM`}
          >
            ♩ {meta.tempo}
          </button>
        )}

        {/* Scroll control */}
        <button
          className={`${btn} gap-1 ${scrolling ? (dark ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-indigo-600 border-indigo-600 text-white') : ''}`}
          onClick={() => {
            if (scrollRef.current && !scrolling) scrollRef.current.scrollTop = 0;
            setScrolling(s => !s);
          }}
          title={hasDuration ? `Auto-scroll over ${meta.duration}` : 'Auto-scroll (space)'}
        >
          {scrolling ? '❚❚' : '▶'} {hasDuration ? meta.duration : 'Scroll'}
        </button>

        {/* Speed multiplier — always shown */}
        <button
          className={btn}
          onClick={() => setSpeedIdx(i => (i + 1) % FALLBACK_SPEEDS.length)}
          title={hasDuration ? '1× = song duration pace; 2×/3×/4× = faster' : 'Scroll speed'}
        >
          {speedIdx + 1}×
        </button>

        {/* Chord panel toggle */}
        <button
          className={`${btn} px-2 ${showChords ? (dark ? 'bg-indigo-900 border-indigo-700' : 'bg-indigo-100 border-indigo-400') : ''}`}
          onClick={() => setShowChords(v => !v)}
          title="Toggle chord diagrams"
        >
          Chords
        </button>

        {/* Annotate toggle — hidden in shared viewer; annotations are local-only */}
        {!disableAnnotations && (
          <button
            className={`${btn} !px-2 ${annotating ? (dark ? 'bg-indigo-900 border-indigo-700' : 'bg-indigo-100 border-indigo-400') : ''}`}
            onClick={() => setAnnotating(v => !v)}
            title={annotating ? 'Exit annotation mode' : 'Draw annotations over the song (finger or stylus)'}
          >
            <Pencil size={22} />
          </button>
        )}

        {/* YouTube playback */}
        {(() => {
          const hasYT = !!youtubeEmbedUrl(meta.youtubeUrl);
          return (
            <button
              className={`${btn} !px-1.5 ${hasYT ? 'text-red-500 dark:text-red-400' : 'opacity-30 cursor-not-allowed'}`}
              onClick={() => hasYT && openPlayer(meta.youtubeUrl, meta.title)}
              disabled={!hasYT}
              title={hasYT ? 'Play YouTube' : 'No YouTube URL for this song'}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
            </button>
          );
        })()}

        {/* Edit current song — hidden on shared/read-only routes */}
        {showEdit && (
          <button
            className={btn}
            onClick={() => onEdit?.(songs[index], index)}
            title="Edit this song"
          >
            Edit
          </button>
        )}

        {/* Exit */}
        <button
          className="flex items-center justify-center w-11 h-11 pointer-fine:w-9 pointer-fine:h-9 shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          onClick={onExit}
          title="Exit (Esc)"
        >
          <X size={26} />
        </button>
      </div>
      {/* Right-edge fade — visible only when more buttons are scrolled off-screen */}
      {barCanScrollRight && (
        <div
          className={`absolute right-0 top-0 bottom-0 w-10 pointer-events-none bg-gradient-to-l to-transparent ${
            dark ? 'from-neutral-900/90' : 'from-gray-50/90'
          }`}
        />
      )}
      </div>

      {/* Song content + optional chord sidebar. overflow-x-auto so a wide chord
          panel pushes the row wider (horizontal scroll) instead of shrinking the
          fixed-width lyrics column. */}
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden min-h-0">

        {/* Lyrics column. Wide layout: fixed width from LYRIC_TARGET_CHARS at the
            current font size, so the chord panel never steals its width (contentWrapRef
            stays constant → ink never rescales on chord resize). Narrow layout keeps
            flex-1 (the chord panel there is a fixed overlay that never takes row space).
            Ghost zones are absolute children here. */}
        <div
          className={`relative ${isNarrow ? 'flex-1 min-w-0' : 'shrink-0'}`}
          style={isNarrow ? undefined : { width: lyricColWidth }}
          onPointerMove={wakeGhosts}
          onPointerDown={wakeGhosts}
        >
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-6 py-6 md:px-12">
            {/* relative wrapper so the canvas can use position:absolute inset-0 */}
            <div ref={contentWrapRef} className="pb-32 relative">
              {meta.title?.trim() && (
                <h1 className={`font-sans font-bold mb-6 ${textCol}`} style={{ fontSize: fontPx * 1.4 }}>
                  {meta.title.trim()}
                </h1>
              )}
              <SongBody text={song?.text || ''} semitones={semitones} useFlats={useFlats} fontPx={fontPx} dark={dark} chordColor={prefsChordColor} chordLabelScale={chordLabelScale} displayMode={song?.previewMode || song?.chordStyle || 'over'} />
              {/* Ink annotation canvas — omitted entirely in shared viewer */}
              {song?.id && !disableAnnotations && (
                <AnnotationCanvas
                  key={song.id}
                  songId={song.id}
                  annotating={annotating}
                  dark={dark}
                />
              )}
            </div>
          </div>

          {/* Ghost: Previous song — left edge, full height */}
          {/* Suppressed while annotating to prevent accidental navigation while drawing */}
          {total > 1 && !annotating && (() => {
            const opacity = ghostsIdle ? 'opacity-[0.04]' : prevGhost.pressed ? 'opacity-75' : 'opacity-[0.18] pointer-fine:hover:opacity-60';
            return (
              <div
                onPointerDown={prevGhost.onPointerDown}
                onPointerMove={prevGhost.onPointerMove}
                onPointerUp={prevGhost.onPointerUp}
                onPointerCancel={prevGhost.onPointerCancel}
                className={`absolute left-0 inset-y-0 w-16 flex items-center justify-center z-10 cursor-pointer select-none transition-opacity duration-[400ms] ${opacity} ${dark ? 'text-white' : 'text-gray-900'}`}
                style={{
                  touchAction: 'pan-y',
                  transform: prevBounce ? 'translateX(5px)' : 'none',
                  transition: 'transform 150ms ease-out, opacity 400ms',
                }}
              >
                <ChevronLeft size={36} strokeWidth={1.2} />
              </div>
            );
          })()}

          {/* Ghost: Next song — right edge, full height */}
          {total > 1 && !annotating && (() => {
            const opacity = ghostsIdle ? 'opacity-[0.04]' : nextGhost.pressed ? 'opacity-75' : 'opacity-[0.18] pointer-fine:hover:opacity-60';
            return (
              <div
                onPointerDown={nextGhost.onPointerDown}
                onPointerMove={nextGhost.onPointerMove}
                onPointerUp={nextGhost.onPointerUp}
                onPointerCancel={nextGhost.onPointerCancel}
                className={`absolute right-0 inset-y-0 w-16 flex items-center justify-center z-10 cursor-pointer select-none transition-opacity duration-[400ms] ${opacity} ${dark ? 'text-white' : 'text-gray-900'}`}
                style={{
                  touchAction: 'pan-y',
                  transform: nextBounce ? 'translateX(-5px)' : 'none',
                  transition: 'transform 150ms ease-out, opacity 400ms',
                }}
              >
                <ChevronRight size={36} strokeWidth={1.2} />
              </div>
            );
          })()}

          {/* Ghost: A−/A+ font size — top, shifted right of center. Hidden while annotating. */}
          {!annotating && (
            <div className="absolute top-3 left-[55%] flex gap-2 z-10">
              {[
                { ghost: smallerGhost, label: 'A−', title: 'Smaller text' },
                { ghost: largerGhost,  label: 'A+', title: 'Larger text' },
              ].map(({ ghost, label, title }) => {
                const opacity = ghostsIdle ? 'opacity-[0.04]' : ghost.pressed ? 'opacity-75' : 'opacity-[0.18] pointer-fine:hover:opacity-60';
                return (
                  <div
                    key={label}
                    onPointerDown={ghost.onPointerDown}
                    onPointerMove={ghost.onPointerMove}
                    onPointerUp={ghost.onPointerUp}
                    onPointerCancel={ghost.onPointerCancel}
                    title={title}
                    className={`w-16 h-16 flex items-center justify-center cursor-pointer select-none rounded-xl text-3xl font-bold transition-opacity duration-[400ms] ${opacity} ${dark ? 'text-white' : 'text-gray-900'}`}
                    style={{ touchAction: 'pan-y' }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chord diagram — sidebar on wide screens, slide-in overlay on narrow */}
        {showChords && (
          isNarrow ? (
            <>
              <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowChords(false)} />
              <div className={`fixed right-0 top-0 bottom-0 z-50 w-72 flex flex-col overflow-hidden shadow-2xl ${dark ? 'bg-neutral-900 border-l border-neutral-800' : 'bg-white border-l border-gray-200'}`}>
                <div className={`px-3 py-2 border-b flex items-center justify-between shrink-0 ${dark ? 'border-neutral-800' : 'border-gray-200'}`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-neutral-500' : 'text-gray-500'}`}>Chords</span>
                  <button
                    onClick={() => setShowChords(false)}
                    className={`h-11 w-11 flex items-center justify-center rounded-lg text-sm transition-colors ${dark ? 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                  >✕</button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <SongChordPanel
                    text={song?.text || ''}
                    semitones={semitones}
                    useFlats={useFlats}
                    sizeLevel={chordDiagramSize}
                    onSizeLevelChange={level => updatePref('chordDiagramSize', level)}
                    readonly
                    chordPrefs={song?.chordPrefs ?? {}}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Chord panel fills the leftover row space beside the fixed-width
                  lyrics column — no drag handle, no fixed width. The lyrics column
                  stays shrink-0 at its 65-char width, so a changing fill-width here
                  never affects contentWrapRef (ink cannot rescale). */}
              <div className={`flex-1 min-w-0 flex flex-col overflow-hidden border-l ${dark ? 'border-neutral-800 bg-neutral-900' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`px-3 py-1.5 border-b text-xs font-semibold uppercase tracking-wide shrink-0 ${dark ? 'border-neutral-800 text-neutral-500' : 'border-gray-200 text-gray-500'}`}>
                  Chords
                </div>
                <div className="flex-1 overflow-hidden">
                  <SongChordPanel
                    text={song?.text || ''}
                    semitones={semitones}
                    useFlats={useFlats}
                    sizeLevel={chordDiagramSize}
                    onSizeLevelChange={level => updatePref('chordDiagramSize', level)}
                    readonly
                    chordPrefs={song?.chordPrefs ?? {}}
                  />
                </div>
              </div>
            </>
          )
        )}
      </div>

    </div>
  );
}
