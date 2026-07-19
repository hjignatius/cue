import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Pencil } from 'lucide-react';
import PresentControls, { PRESENT_CONTROL_IDLE_OPACITY, PRESENT_CONTROL_IDLE_DELAY_MS } from '../components/PresentControls.jsx';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY, MIN_TOUCH_TARGET } from '../components/RoundButton.jsx';
import ResizeHandle from '../components/ResizeHandle.jsx';
import { useResizePanel } from '../hooks/useResizePanel.js';
import AnnotationCanvas from '../components/AnnotationCanvas.jsx';
import { useYouTube } from '../context/YouTubeContext.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import { parseChordPro, attachSectionLabels, expandSections, styleSegments } from '../utils/chordPro.js';
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

// Render pre-parsed styled runs. Repeat markers keep the accent color; other
// runs apply the user's bold/italic/color. Chords render separately (unchanged).
function StyledRuns({ runs, accentColor }) {
  return (runs || []).map((r, i) =>
    r.marker
      ? <span key={i} className="font-bold" style={{ color: accentColor }}>{r.text}</span>
      : <span key={i} style={{ fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? 'italic' : undefined, color: r.color || undefined }}>{r.text}</span>
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
                  {styleSegments(line.segments).map((seg, j) => (
                    <span key={j}>
                      {seg.chord && (
                        <span className="font-bold" style={{ color: chordColor }}>[{seg.chord}]</span>
                      )}
                      {seg.text ? <StyledRuns runs={seg.styledRuns} accentColor={chordColor} /> : null}
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
                {styleSegments(line.segments).map((seg, j) => (
                  <div key={j} className="flex flex-col" style={{ whiteSpace: 'pre' }}>
                    <span className="font-bold leading-tight" style={{ color: chordColor, fontSize: chordPx, height: chordPx * 1.2 }}>
                      {seg.chord ? seg.chord + ' ' : ' '}
                    </span>
                    <span className="leading-snug" style={{ fontSize: fontPx }}>
                      {seg.text ? <StyledRuns runs={seg.styledRuns} accentColor={chordColor} /> : ' '}
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
              <StyledRuns runs={styleSegments(line.segments)[0]?.styledRuns} accentColor={chordColor} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MIN_FONT = 14;
// 14→34 in steps of 2 is exactly 10 A+ presses. The ceiling is set by geometry,
// not taste: the lyrics column is a fixed LYRIC_TARGET_CHARS wide, so its pixel
// width grows with the font. Past ~34px it squeezes the chord panel off-screen
// and the row starts scrolling sideways. A stored size above the ceiling is
// clamped down on load (see fontPx below), so lowering this cannot strand anyone.
const MAX_FONT = 34;
const FONT_STEP = 2;
const DEFAULT_FONT = 28;
// Present-mode lyric font size persists across sessions (survives exiting to the
// editor / setlist and returning, which unmounts and remounts this view).
const FONT_KEY = 'cue:present_font_px';
// Fallback scroll speed (px/s) when no duration is set
const FALLBACK_SPEED = 10;

// Chord-panel size buttons and Present's action buttons share one size: the
// adjustment/utility tier, smaller than PresentControls' 64px primary controls
// but still a full MIN_TOUCH_TARGET, so RoundButton adds no padding. (The chord
// buttons were 32 visual / 44 hit; enlarged to fill the 44 hit box.)
export const CHORD_SIZE_BUTTON_SIZE = 44;
// Present's action buttons (Chords / Finger drawing / YouTube / Edit / Exit).
export const PRESENT_ACTION_BUTTON_SIZE = 44;
const PRESENT_ACTION_GAP = 12;

// Artist line height, as a multiple of fontPx. The artist sits in the lyric flow
// (inside contentWrapRef), so this IS the amount v1 annotations must be pushed
// down by — see ANNOTATION_LAYOUT_VERSION. Styling the line and computing the
// offset from one constant is what keeps the two from drifting apart.
const ARTIST_LINE_HEIGHT = 1.5;
// Key/BPM size relative to fontPx: clearly below the title, close to the artist.
//
// The ceiling is not taste, it is geometry. The block is absolutely positioned so
// it contributes no flow height — that is what keeps it from moving the lyrics and
// breaking annotation coordinates — but it also means nothing pushes the lyrics
// down to make room for it. It therefore has to fit inside the info block's own
// height plus its 24px bottom margin. A song with an artist donates ~1.5x fontPx
// of that room; a song with a title and NO artist donates none, and that is the
// constraining case: at fontPx 34 there are 81px available and the block is
// 2 x fontPx x 1.5 x SCALE tall.
//
// Measured ceiling: 0.795 (at 1.0 the BPM line lands 21px into the first lyric).
// 0.75 is deliberately below it — 0.8 cleared by 0.6px, which is a collision
// waiting for the next margin change and no test would catch it.
const KEY_BPM_SCALE = 0.75;
// Horizontal room reserved for the Key/BPM block so a long title cannot run under
// it. In px at the current font; ~10 monospace characters.
const KEY_BPM_RESERVE_EM = 6;
// Vertical padding above and below the size strip.
const CHORD_STRIP_PAD_Y = 4;
// The strip's height is fully determined by its contents: RoundButton pads the
// 32px circle out to MIN_TOUCH_TARGET, plus this strip's own padding. Derived —
// not a hardcoded 48 — so the resize target's top edge cannot drift away from the
// strip if CHORD_SIZE_BUTTON_SIZE or the padding changes. The same constant sets
// the strip's real padding below, so the two cannot disagree.
const CHORD_STRIP_H = Math.max(CHORD_SIZE_BUTTON_SIZE, MIN_TOUCH_TARGET) + CHORD_STRIP_PAD_Y * 2;

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

export default function PresentationView({ songs, startIndex = 0, onExit, onEdit, onNavigate, showEdit = true, disableAnnotations = false }) {
  const { theme, chordColor: prefsChordColor, chordDiagramSize, chordLabelScale, metronomeMode, accidentals, updatePref } = usePrefs();
  const dark = theme === 'dark';
  // isNarrow (1024) drives the lyric column: fixed 65-char width on wide screens,
  // flex-1 below (so tablet-portrait and phones don't need to scroll the column
  // sideways). The chord panel is a separate decision: it only falls back to a
  // full-screen modal drawer at true phone widths — on a tablet in portrait there
  // is room to dock it beside the lyrics, resizable and non-blocking, the same as
  // landscape. Docking it (rather than the blocking modal) is what keeps Present
  // usable when an iPad is rotated to portrait.
  const isNarrow = useIsNarrow();
  const isPhone = useIsNarrow(640);
  const [index, setIndex]       = useState(Math.max(0, Math.min(startIndex, songs.length - 1)));
  const [fontPx, setFontPx]     = useState(() => {
    try {
      const n = parseInt(localStorage.getItem(FONT_KEY) || '', 10);
      if (!isNaN(n)) return Math.min(MAX_FONT, Math.max(MIN_FONT, n));
    } catch { /* ignore */ }
    return DEFAULT_FONT;
  });
  const [scrolling, setScrolling] = useState(false);
  // Chords are docked (non-blocking) on tablet/desktop, so default them on there.
  // At phone widths the panel is a full-screen modal drawer, so it must NOT
  // auto-open — starting it on would bury the song behind a modal the moment
  // Present opens. Start off on a phone; the C button opens it on demand.
  const [showChords, setShowChords] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth >= 640 : true)
  );
  // Entering phone width (e.g. rotating an iPhone to portrait) collapses the
  // chord panel so it never eats a docked column on a screen with no room to
  // spare. The panel is otherwise the same docked, resizable panel everywhere.
  useEffect(() => { if (isPhone) setShowChords(false); }, [isPhone]);
  // Restores the pre-e6eeb0f key and range, so a width saved before the panel
  // became flex-1 comes back. Docking is new; the width mechanism is the old one.
  const [chordsWidth, chordsHandleProps] = useResizePanel(208, 150, 450, 'cue:present_chords_px');
  const [flashState, setFlashState] = useState(null); // null | 'beat' | 'accent'
  const [annotating, setAnnotating] = useState(false);
  const { url: ytUrl, collapsed: ytCollapsed, openPlayer, collapsePlayer, expandPlayer } = useYouTube();
  const ytWasExpandedRef = useRef(false);
  const scrollRef      = useRef(null);
  const contentWrapRef = useRef(null);
  const rafRef         = useRef(0);
  const flashTimers    = useRef([]);

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

  const smallerAction = useCallback(() => setFontPx(f => Math.max(MIN_FONT, f - FONT_STEP)), []);
  const largerAction  = useCallback(() => setFontPx(f => Math.min(MAX_FONT, f + FONT_STEP)), []);

  // Pause in place and resume from there — no rewind. Scroll position is only
  // reset when the song itself changes (see goTo). Matches the spacebar toggle.
  const toggleScroll = useCallback(() => setScrolling(s => !s), []);

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
      ? scrollable / durationSec
      : FALLBACK_SPEED;

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
  }, [scrolling, index, meta.duration]);

  // Theme helpers
  const bg      = dark ? 'bg-neutral-950' : 'bg-white';
  const muted   = dark ? 'text-neutral-400' : 'text-gray-500';
  const textCol = dark ? 'text-white' : 'text-gray-900';

  // Same fill family as the floating control panel, half the diameter.
  const chordBtnFill = dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY;
  // Same fill family again — one visual language across all three sizes.
  const actionFill = chordBtnFill;

  // The View Key drives the info block, so it updates live on transpose.
  const viewKey = song?.displayKey || meta.key?.trim() || '';
  const hasKeyOrTempo = !!(viewKey || meta.tempo);

  // How far v1 annotations must move down: exactly the artist line's height,
  // because the artist is the only thing this layout added inside contentWrapRef.
  // Derived from the same constant that styles the line, so the two cannot drift.
  // Zero when the song has no artist — nothing was added, nothing shifted.
  const legacyInkOffset = meta.artist?.trim() ? Math.round(fontPx * ARTIST_LINE_HEIGHT) : 0;

  const hasDuration = parseDuration(meta.duration) > 0;
  const timeSig = meta.timeSig || '4/4';

  // Fixed lyrics-column width for the wide layout. Recomputes only on font-size
  // change (A-/A+), never on chord-panel resize — so contentWrapRef.offsetWidth
  // stays constant when the chord panel is dragged and the annotation
  // ResizeObserver never fires.
  const lyricColWidth = useMemo(() => lyricColumnWidth(fontPx), [fontPx]);

  // Idle fade for the gutter action buttons — mirrors PresentControls: fade after
  // a spell of no input, wake on any pointerdown. Same delay/opacity so the two
  // control surfaces ghost together and come back together.
  const [gutterIdle, setGutterIdle] = useState(false);
  const gutterIdleTimer = useRef(null);
  useEffect(() => {
    const wake = () => {
      setGutterIdle(false);
      clearTimeout(gutterIdleTimer.current);
      gutterIdleTimer.current = setTimeout(() => setGutterIdle(true), PRESENT_CONTROL_IDLE_DELAY_MS);
    };
    wake();
    window.addEventListener('pointerdown', wake, true);
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      clearTimeout(gutterIdleTimer.current);
    };
  }, []);

  // select-none on the root: Present is a performance view — lyrics are never
  // meant to be selected. Without it, a double-click (including the setlist row
  // double-tap that opens Present, whose second click can land on the just-mounted
  // lyrics) selects text and paints a highlight box over it.
  return (
    <div className={`fixed inset-0 z-50 flex flex-col select-none ${bg}`}>
      {/* Visual count-in flash. Full-screen now the top bar is gone — it used to
          be an overlay inside that bar. z-[60] puts it above everything including
          PresentControls, which is safe because it is strictly transient: opacity
          is 0 except during the ~2 bars of a count-in, and it is
          pointer-events-none throughout, so it never intercepts a tap. */}
      <div
        className={`fixed inset-0 z-[60] pointer-events-none ${dark ? 'bg-white' : 'bg-black'}`}
        style={{
          opacity: flashState === 'accent' ? 0.7 : flashState === 'beat' ? 0.35 : 0,
          transition: flashState ? 'opacity 18ms' : 'opacity 130ms',
        }}
      />

      {/* Content area. The wide chord panel is docked absolutely on top of this
          box rather than sharing the row, so it owns its width and can never be
          squeezed as fontPx grows. This wrapper — not the scroller — is the
          panel's positioning context, so the panel sits below the top bar and
          does not scroll away with the lyrics. */}
      <div className="flex-1 relative min-h-0">
      <div className="absolute inset-0 flex overflow-x-auto overflow-y-hidden">

        {/* Lyrics column. Wide layout: fixed width from LYRIC_TARGET_CHARS at the
            current font size, so the chord panel never steals its width (contentWrapRef
            stays constant → ink never rescales on chord resize). Narrow layout keeps
            flex-1 (the chord panel there is a fixed overlay that never takes row space). */}
        <div
          className={`relative ${isNarrow ? 'flex-1 min-w-0' : 'shrink-0'}`}
          style={isNarrow ? undefined : { width: lyricColWidth }}
        >
          {/* pl-14 (56px) keeps lyrics clear of the fixed left gutter buttons
              (~46px wide) on narrow/phone widths, where px-6 (24px) let text run
              under them. md:px-12 restores symmetric 48px padding on wide, which
              already cleared the gutter. */}
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto pl-14 pr-6 py-6 md:px-12">
            {/* relative wrapper so the canvas can use position:absolute inset-0 */}
            <div ref={contentWrapRef} className="pb-32 relative">
              {/* Song info, in the lyric flow rather than in chrome.
                  Title and ARTIST are in normal flow, so they sit inside the
                  canvas's parent and push the lyrics down — that shift is what
                  ANNOTATION_LAYOUT_VERSION 2 exists for.
                  Key/BPM are absolutely positioned: they contribute ZERO flow
                  height, so they cannot move the lyrics and cannot affect
                  annotation coordinates no matter how tall they get. */}
              {(meta.title?.trim() || meta.artist?.trim() || hasKeyOrTempo) && (
                <div className="relative mb-6">
                  <div style={{ paddingRight: hasKeyOrTempo ? fontPx * KEY_BPM_RESERVE_EM : 0 }}>
                    {meta.title?.trim() && (
                      <h1 className={`font-mono font-bold ${textCol}`} style={{ fontSize: fontPx * 1.4, lineHeight: 1.2 }}>
                        {meta.title.trim()}
                      </h1>
                    )}
                    {meta.artist?.trim() && (
                      <p className={`font-mono ${muted}`} style={{ fontSize: fontPx, lineHeight: ARTIST_LINE_HEIGHT }}>
                        {meta.artist.trim()}
                      </p>
                    )}
                  </div>
                  {hasKeyOrTempo && (
                    <div
                      className={`absolute top-0 right-0 text-right font-mono ${muted}`}
                      style={{ fontSize: fontPx * KEY_BPM_SCALE, lineHeight: ARTIST_LINE_HEIGHT }}
                    >
                      {viewKey && <div>Key: <span className={textCol}>{viewKey}</span></div>}
                      {meta.tempo && <div>{meta.tempo} BPM</div>}
                    </div>
                  )}
                </div>
              )}
              <SongBody text={song?.text || ''} semitones={semitones} useFlats={useFlats} fontPx={fontPx} dark={dark} chordColor={prefsChordColor} chordLabelScale={chordLabelScale} displayMode={song?.previewMode || song?.chordStyle || 'over'} />
              {/* Ink annotation canvas — omitted entirely in shared viewer */}
              {song?.id && !disableAnnotations && (
                <AnnotationCanvas
                  key={song.id}
                  songId={song.id}
                  annotating={annotating}
                  dark={dark}
                  legacyYOffset={legacyInkOffset}
                />
              )}
            </div>
          </div>

        </div>

        {/* Scroll-clear spacer. Matches the docked panel's live width so the end
            of the longest line can be scrolled out from under it; without it the
            tail would sit under the panel even at maximum scrollLeft. */}
        {showChords && (
          <div className="shrink-0" style={{ width: chordsWidth }} aria-hidden="true" />
        )}
      </div>

        {/* Chord diagram — one docked, resizable panel at every width (phone,
            tablet, desktop): no blocking modal, so the round size buttons are
            always present. Absolute, so it takes no row space and keeps its own
            resizable width; the lyrics column runs under it at large fonts
            instead of pushing it off the page. z-30 keeps it below
            PresentControls (z-40) so the control pill stays reachable.
            overflow-hidden lives on the inner column, not here, so the handle's
            44px touch target can overflow the panel's left edge. */}
        {showChords && (
          <div
            className={`absolute right-0 inset-y-0 z-30 flex border-l ${dark ? 'border-neutral-800 bg-neutral-900' : 'border-gray-200 bg-gray-50'}`}
            style={{ width: chordsWidth }}
          >
            <ResizeHandle handleProps={chordsHandleProps} dark={dark} hitWidth={MIN_TOUCH_TARGET} hitTop={CHORD_STRIP_H} grip ignorePen />
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {/* Size strip — Present renders its own so SongChordPanel's
                  built-in one stays out of the editor, which shares that
                  component. justify-center keeps the buttons centred on the
                  panel's live width as it is resized. */}
              <div className="flex items-center justify-center gap-2 shrink-0" style={{ paddingTop: CHORD_STRIP_PAD_Y, paddingBottom: CHORD_STRIP_PAD_Y }}>
                <RoundButton
                  size={CHORD_SIZE_BUTTON_SIZE}
                  label="Smaller chord diagrams"
                  fill={chordBtnFill}
                  disabled={chordDiagramSize === 0}
                  onActivate={() => updatePref('chordDiagramSize', Math.max(0, chordDiagramSize - 1))}
                >
                  <span className="font-bold leading-none" style={{ fontSize: 24 }}>−</span>
                </RoundButton>
                <RoundButton
                  size={CHORD_SIZE_BUTTON_SIZE}
                  label="Larger chord diagrams"
                  fill={chordBtnFill}
                  disabled={chordDiagramSize === 4}
                  onActivate={() => updatePref('chordDiagramSize', Math.min(4, chordDiagramSize + 1))}
                >
                  <span className="font-bold leading-none" style={{ fontSize: 24 }}>+</span>
                </RoundButton>
              </div>
              <div className="flex-1 overflow-hidden">
                <SongChordPanel
                  text={song?.text || ''}
                  semitones={semitones}
                  useFlats={useFlats}
                  sizeLevel={chordDiagramSize}
                  readonly
                  chordPrefs={song?.chordPrefs ?? {}}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons — the top bar is gone, so these live in the lyric
          column's 48px left gutter, where they cover no text at rest. They are
          stationary; PresentControls is draggable, so overlap is possible by
          construction and z-order is the only guarantee: z-35 keeps these above
          the chord panel (z-30) and below PresentControls (z-40), so the control
          pill always wins. Exit is here too — it is the only pointer route out of
          Present (Escape is the keyboard fallback). */}
      <div
        className="fixed left-0 z-[35] flex flex-col items-center"
        style={{
          top: '50%', transform: 'translateY(-50%)', gap: PRESENT_ACTION_GAP, paddingLeft: 2,
          opacity: gutterIdle ? PRESENT_CONTROL_IDLE_OPACITY : 1,
          transition: 'opacity 300ms ease',
        }}
      >
        <RoundButton
          size={PRESENT_ACTION_BUTTON_SIZE}
          label={showChords ? 'Hide chord diagrams' : 'Show chord diagrams'}
          fill={actionFill}
          active={showChords}
          onActivate={() => setShowChords(v => !v)}
        >
          <span className="font-bold leading-none" style={{ fontSize: 20 }}>C</span>
        </RoundButton>

        {/* Pen glyph vs "Finger drawing" label: the mismatch is DELIBERATE, do not
            "fix" the icon to a hand.
            The glyph reads as ink, which is what the control is about. But the
            toggle only gates FINGER and mouse drawing — an Apple Pencil draws
            whatever the state (AnnotationCanvas:
            shouldDraw = e.pointerType === 'pen' || annotating). So "off" does NOT
            mean "no ink", and the label has to say what the toggle actually does
            even though the glyph says what the feature is. */}
        {!disableAnnotations && (
          <RoundButton
            size={PRESENT_ACTION_BUTTON_SIZE}
            label={annotating ? 'Finger drawing on' : 'Finger drawing off'}
            fill={actionFill}
            active={annotating}
            onActivate={() => setAnnotating(v => !v)}
          >
            <Pencil size={22} strokeWidth={2} />
          </RoundButton>
        )}

        {(() => {
          const hasYT = !!youtubeEmbedUrl(meta.youtubeUrl);
          return (
            <RoundButton
              size={PRESENT_ACTION_BUTTON_SIZE}
              label={hasYT ? 'Play YouTube' : 'No YouTube URL for this song'}
              fill={actionFill}
              disabled={!hasYT}
              onActivate={() => openPlayer(meta.youtubeUrl, meta.title)}
            >
              {/* Red brand mark, matching the editor header. #f87171 reads on
                  both the night and day action-button fills. RoundButton's opacity
                  still dims it when disabled. */}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#f87171" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
            </RoundButton>
          );
        })()}

        {showEdit && (
          <RoundButton
            size={PRESENT_ACTION_BUTTON_SIZE}
            label="Edit this song"
            fill={actionFill}
            onActivate={() => onEdit?.(songs[index], index)}
          >
            <span className="font-bold leading-none" style={{ fontSize: 20 }}>E</span>
          </RoundButton>
        )}

        <RoundButton
          size={PRESENT_ACTION_BUTTON_SIZE}
          label="Exit Present mode"
          fill={actionFill}
          onActivate={onExit}
        >
          <X size={22} strokeWidth={2.5} />
        </RoundButton>
      </div>

      {/* Floating control panel — the only in-view control surface for text size,
          song navigation, count-in and auto-scroll. Always present; collapsing to
          the pill is the only way to hide it. */}
      <PresentControls
        dark={dark}
        onSmaller={smallerAction}
        onLarger={largerAction}
        canSmaller={fontPx > MIN_FONT}
        canLarger={fontPx < MAX_FONT}
        onPrev={prev}
        onNext={next}
        canPrev={index > 0}
        canNext={index < total - 1}
        onCountIn={handleMetronomeTap}
        canCountIn={!!Number(meta.tempo)}
        onToggleScroll={toggleScroll}
        scrolling={scrolling}
      />

    </div>
  );
}
