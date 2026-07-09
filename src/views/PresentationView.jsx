import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import YouTubePlayer from '../components/YouTubePlayer.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import { parseChordPro, attachSectionLabels, expandSections, splitAnnotations } from '../utils/chordPro.js';
import { transposeText, semitonesBetween } from '../utils/transpose.js';
import { convertToBrackets } from '../utils/chordStyle.js';
import { Fragment } from 'react';
import SongChordPanel from '../components/SongChordPanel.jsx';
import ResizeHandle from '../components/ResizeHandle.jsx';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useResizePanel } from '../hooks/useResizePanel.js';
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

function SongBody({ text, semitones, fontPx, dark, chordColor, displayMode = 'over' }) {
  const transposed = transposeText(convertToBrackets(text), semitones);
  const lines = attachSectionLabels(expandSections(parseChordPro(transposed)));
  const lyricColor = dark ? '#f3f4f6' : '#1f2937';
  const labelColor = dark ? '#818cf8' : '#4f46e5';
  const chordPx = fontPx * 0.85;

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
// Fallback scroll speeds (px/s) when no duration is set
const FALLBACK_SPEEDS = [10, 20, 36, 60];

export default function PresentationView({ songs, startIndex = 0, onExit, onEdit, onNavigate }) {
  const { theme, chordColor: prefsChordColor, metronomeMode, updatePref } = usePrefs();
  const dark = theme === 'dark';
  const isNarrow = useIsNarrow();
  const [index, setIndex]       = useState(Math.max(0, Math.min(startIndex, songs.length - 1)));
  const [fontPx, setFontPx]     = useState(DEFAULT_FONT);
  const [scrolling, setScrolling] = useState(false);
  const [speedIdx, setSpeedIdx]   = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [sizeLevel, setSizeLevel]   = useState(() => {
    const stored = localStorage.getItem('cue:present_chord_size');
    return stored !== null ? parseInt(stored, 10) : 2;
  });
  const [chordsWidth, chordsHandleProps] = useResizePanel(208, 150, 450, 'cue:present_chords_px');
  const [flashState, setFlashState] = useState(null); // null | 'beat' | 'accent'
  const [showYT, setShowYT] = useState(false);
  const scrollRef      = useRef(null);
  const rafRef         = useRef(0);
  const flashTimers    = useRef([]);

  const song  = songs[index];
  const total = songs.length;
  const meta  = song?.metadata || {};
  const semitones = semitonesBetween(meta.key, song?.displayKey);

  const goTo = useCallback((target) => {
    const clamped = Math.max(0, Math.min(total - 1, target));
    if (clamped === index) return;
    setScrolling(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setIndex(clamped);
  }, [index, total, songs]);

  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);

  // Notify parent and close YouTube player whenever the displayed song changes
  useEffect(() => {
    if (onNavigate && songs[index]) onNavigate(songs[index]);
    setShowYT(false);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if      (e.key === 'ArrowRight' || e.key === 'PageDown') next();
      else if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   prev();
      else if (e.key === 'Escape')  onExit();
      else if (e.key === '+' || e.key === '=') setFontPx(f => Math.min(MAX_FONT, f + FONT_STEP));
      else if (e.key === '-' || e.key === '_') setFontPx(f => Math.max(MIN_FONT, f - FONT_STEP));
      else if (e.key === ' ') { e.preventDefault(); setScrolling(s => !s); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onExit]);

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
  const btn     = `flex items-center justify-center rounded-lg border transition-colors px-2 h-8 text-xs font-semibold ${
    dark ? 'border-neutral-700 text-neutral-200 hover:bg-neutral-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'
  }`;

  const hasDuration = parseDuration(meta.duration) > 0;
  const timeSig = meta.timeSig || '4/4';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${bg}`}>
      {/* Top bar */}
      <div className={`relative flex items-center gap-2 px-4 py-2 border-b ${barBg} backdrop-blur shrink-0 overflow-hidden`}>
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

        {/* Metronome — tap to play/flash, toggle button to switch mode */}
        {meta.tempo && (
          <div className="flex items-center gap-0.5">
            <button
              className={btn}
              onClick={handleMetronomeTap}
              title={`${metronomeMode === 'sound' ? 'Play' : 'Flash'} ${meta.tempo} BPM`}
            >
              ♩ {meta.tempo}
            </button>
            <button
              className={`${btn} px-2 text-[10px] font-bold tracking-wide ${
                metronomeMode === 'silent'
                  ? (dark ? 'bg-indigo-900 border-indigo-600 text-indigo-300' : 'bg-indigo-100 border-indigo-400 text-indigo-700')
                  : ''
              }`}
              onClick={() => updatePref('metronomeMode', metronomeMode === 'sound' ? 'silent' : 'sound')}
              title={`Metronome mode: ${metronomeMode} — click to switch`}
            >
              {metronomeMode === 'sound' ? 'SND' : 'VIS'}
            </button>
          </div>
        )}

        {/* Prev / Next */}
        {total > 1 && (
          <>
            <button className={`${btn} px-3 disabled:opacity-30`} onClick={prev} disabled={index === 0} title="Previous song">← Prev</button>
            <button className={`${btn} px-3 disabled:opacity-30`} onClick={next} disabled={index === total - 1} title="Next song">Next →</button>
          </>
        )}

        {/* Font size */}
        <button className={`${btn} w-8`} onClick={() => setFontPx(f => Math.max(MIN_FONT, f - FONT_STEP))} title="Smaller">A−</button>
        <button className={`${btn} w-8`} onClick={() => setFontPx(f => Math.min(MAX_FONT, f + FONT_STEP))} title="Larger">A+</button>

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

        {/* Dark/light toggle */}
        <button className={`${btn} w-8`} onClick={() => updatePref('theme', dark ? 'light' : 'dark')} title="Toggle theme">
          {dark ? '☀' : '☾'}
        </button>

        {/* YouTube playback */}
        {(() => {
          const hasYT = !!youtubeEmbedUrl(meta.youtubeUrl);
          return (
            <button
              className={`${btn} ${hasYT ? 'text-red-400 dark:text-red-400' : 'opacity-30 cursor-not-allowed'}`}
              onClick={() => hasYT && setShowYT(true)}
              disabled={!hasYT}
              title={hasYT ? 'Play YouTube' : 'No YouTube URL for this song'}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
            </button>
          );
        })()}

        {/* Edit current song */}
        <button
          className={btn}
          onClick={() => onEdit?.(songs[index], index)}
          title="Edit this song"
        >
          Edit
        </button>

        {/* Exit */}
        <button
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
          onClick={onExit}
          title="Exit (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Song content + optional chord sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto px-6 py-6 md:px-12">
          <div className="pb-32">
            {meta.title?.trim() && (
              <h1 className={`font-sans font-bold mb-6 ${textCol}`} style={{ fontSize: fontPx * 1.4 }}>
                {meta.title.trim()}
              </h1>
            )}
            <SongBody text={song?.text || ''} semitones={semitones} fontPx={fontPx} dark={dark} chordColor={prefsChordColor} displayMode={song?.previewMode || song?.chordStyle || 'over'} />
          </div>
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
                    className={`text-sm leading-none ${dark ? 'text-neutral-500 hover:text-neutral-200' : 'text-gray-400 hover:text-gray-700'}`}
                  >✕</button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <SongChordPanel
                    text={song?.text || ''}
                    semitones={semitones}
                    sizeLevel={sizeLevel}
                    onSizeLevelChange={level => { setSizeLevel(level); localStorage.setItem('cue:present_chord_size', level); }}
                    readonly
                    chordPrefs={song?.chordPrefs ?? {}}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <ResizeHandle handleProps={chordsHandleProps} dark={dark} />
              <div className={`shrink-0 flex flex-col overflow-hidden ${dark ? 'border-neutral-800 bg-neutral-900' : 'border-gray-200 bg-gray-50'}`} style={{ width: chordsWidth }}>
                <div className={`px-3 py-1.5 border-b text-xs font-semibold uppercase tracking-wide shrink-0 ${dark ? 'border-neutral-800 text-neutral-500' : 'border-gray-200 text-gray-500'}`}>
                  Chords
                </div>
                <div className="flex-1 overflow-hidden">
                  <SongChordPanel
                    text={song?.text || ''}
                    semitones={semitones}
                    sizeLevel={sizeLevel}
                    onSizeLevelChange={level => { setSizeLevel(level); localStorage.setItem('cue:present_chord_size', level); }}
                    readonly
                    chordPrefs={song?.chordPrefs ?? {}}
                  />
                </div>
              </div>
            </>
          )
        )}
      </div>

      {showYT && <YouTubePlayer url={meta.youtubeUrl} onClose={() => setShowYT(false)} />}
    </div>
  );
}
