import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Pencil, Wrench } from 'lucide-react';
import PresentControls, { PRESENT_CONTROL_IDLE_OPACITY, PRESENT_CONTROL_EDGE_MARGIN } from '../components/PresentControls.jsx';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY, MIN_TOUCH_TARGET } from '../components/RoundButton.jsx';
import ResizeHandle from '../components/ResizeHandle.jsx';
import { useResizePanel } from '../hooks/useResizePanel.js';
import AnnotationCanvas from '../components/AnnotationCanvas.jsx';
import { useYouTube } from '../context/YouTubeContext.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import { parseChordPro, attachSectionLabels, expandSections, styleSegments } from '../utils/chordPro.js';
import { transposeText, semitonesBetween, useFlatsForKey } from '../utils/transpose.js';
import { convertToBrackets } from '../utils/chordStyle.js';
import ChordDiagram from '../components/ChordDiagram.jsx';
import { resolveChordShape } from '../utils/chordLookup.js';
import { loadCustomChords, loadHiddenChords } from '../utils/chordStorage.js';
import { readableChordColor } from '../utils/chordColor.js';
import { Fragment } from 'react';
import SongChordPanel from '../components/SongChordPanel.jsx';
import PdfSongView from '../components/PdfSongView.jsx';
import PdfPageStack from '../components/PdfPageStack.jsx';
import PdfAnnotationCanvas from '../components/PdfAnnotationCanvas.jsx';
import { usePrefs, PRESENT_NO_FADE } from '../context/PrefsContext.jsx';
import { useIsNarrow } from '../hooks/useIsNarrow.js';
import { isPdfSong } from '../utils/songType.js';

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

// Seconds → "M:SS" (mirrors the editor's DurationStepper formatting) so a speed
// baked into the song reads as a normal duration everywhere else.
function formatDuration(secs) {
  secs = Math.max(0, Math.round(secs));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
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

function SongBody({ text, semitones, useFlats, fontPx, dark, chordColor, chordLabelScale = 0, displayMode = 'over', embed = false, instrument = 'none', chordPrefs = {}, condensed = false }) {
  const transposed = transposeText(convertToBrackets(text), semitones, useFlats);
  const parsed = parseChordPro(transposed);
  // Condensed songs render verbatim — skip section-reference expansion.
  const lines = attachSectionLabels(condensed ? parsed : expandSections(parsed));
  const lyricColor = dark ? '#f3f4f6' : '#1f2937';
  const labelColor = dark ? '#818cf8' : '#4f46e5';
  const chordPx = fontPx * 0.85 * (1 + chordLabelScale / 100);
  // Imbed (chords as diagrams) — over-lyrics only, needs an instrument. Diagrams
  // scale with the Present font; the band keeps lyric baselines aligned.
  const diagrams = embed && displayMode === 'over' && instrument !== 'none';
  const diagScale = Math.max(0.4, fontPx / 25);
  const diagBand = 76 * diagScale;
  // Same resolver as the chord panel / PDF — honors custom shapes and the song's
  // chosen voicing (chordPrefs), not just built-ins.
  const chordSources = useMemo(() => ({
    custom: loadCustomChords(instrument),
    hidden: new Set(loadHiddenChords(instrument)),
  }), [instrument]);
  const shapeFor = (name) => resolveChordShape(name, chordPrefs, instrument, chordSources.custom, chordSources.hidden)?.frets || null;

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
                {styleSegments(line.segments).map((seg, j) => {
                  const frets = diagrams && seg.chord ? shapeFor(seg.chord) : null;
                  return (
                    <div key={j} className="flex flex-col" style={{ whiteSpace: 'pre' }}>
                      {frets ? (
                        <div className="flex items-end shrink-0" style={{ minHeight: diagBand }}>
                          <ChordDiagram chord={{ name: seg.chord, frets }} scale={diagScale} theme={dark ? 'dark' : 'light'} chordColor={chordColor} />
                        </div>
                      ) : diagrams ? (
                        // Imbed on but no shape → keep the name, in a matching band.
                        <span className="font-bold self-end pb-0.5" style={{ color: chordColor, fontSize: chordPx, minHeight: diagBand, display: 'flex', alignItems: 'flex-end' }}>
                          {seg.chord ? seg.chord + ' ' : ' '}
                        </span>
                      ) : (
                        <span className="font-bold leading-tight" style={{ color: chordColor, fontSize: chordPx, height: chordPx * 1.2 }}>
                          {seg.chord ? seg.chord + ' ' : ' '}
                        </span>
                      )}
                      <span className="leading-snug" style={{ fontSize: fontPx }}>
                        {seg.text ? <StyledRuns runs={seg.styledRuns} accentColor={chordColor} /> : ' '}
                      </span>
                    </div>
                  );
                })}
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
// Assumed base duration for songs with no duration set. Auto-scroll paces as if
// the song were this long, and F/S fine-tune from here, so the speed buttons and
// the Save-speed control work even before a real duration exists — one Save bakes
// the tuned value in. 3:30 is a reasonable mid-length song.
const DEFAULT_DURATION_SEC = 210; // 3:30

// Auto-scroll speed multiplier, adjusted by the F/S buttons (F faster, S slower).
// Applied on top of the duration-derived (or fallback) rate, so the base pacing
// is preserved and this just scales it. Each press is an even ±10% proportional
// step (geometric), so the change reads the same on short and long songs and the
// per-press amount is predictable rather than a guess. 1 is the neutral default;
// the Save-speed control bakes the current multiplier into the song's duration.
const SPEED_STEP = 1.20;   // one F/S press = ×/÷ 1.20  (≈ ±20%) — a noticeable swing
const MIN_SPEED  = 0.25;
const MAX_SPEED  = 4;

// Pedal-paging glide duration is a user setting (pageGlideMs, 0–2000). 0 pages
// instantly; any positive value glides over that many ms with an ease-out curve.
const DEFAULT_SPEED = 1;
// Keep the multiplier off binary-float cruft so ×1.05 then ÷1.05 lands back on 1.
const roundMult = (m) => Math.round(m * 1000) / 1000;
// Whether the left-gutter tool tray (Edit / YouTube / ink / chords) is expanded.
// Persisted so it stays as the user left it from song to song and across
// re-entering Present.
const TOOLS_OPEN_KEY = 'cue:present_tools_open';

// Chord-panel size buttons and Present's action buttons share one size: the
// adjustment/utility tier, smaller than PresentControls' 64px primary controls
// but still a full MIN_TOUCH_TARGET, so RoundButton adds no padding. (The chord
// buttons were 32 visual / 44 hit; enlarged to fill the 44 hit box.)
export const CHORD_SIZE_BUTTON_SIZE = 44;
// Present's action buttons (Chords / Finger drawing / YouTube / Edit / Exit).
export const PRESENT_ACTION_BUTTON_SIZE = 44;
const PRESENT_ACTION_GAP = 12;

// When Cue runs as an installed app (Home Screen / Add to Dock), the OS draws
// window controls over the top-left of the content — macOS traffic lights, or
// iPad Stage Manager's controls — which collide with the top action button. Push
// the left gutter down to clear them. A normal browser tab has its own chrome
// and needs no offset, so this only applies in standalone display mode.
const IS_STANDALONE = typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
   window.navigator?.standalone === true);
// Clears macOS traffic lights (~y 12–28) and the iPad Stage Manager control with
// margin to spare; falls back to the normal edge margin in a browser tab.
const GUTTER_TOP = IS_STANDALONE ? 56 : PRESENT_CONTROL_EDGE_MARGIN;

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
// height plus its bottom margin (now fontPx·24/DEFAULT_FONT — proportional, so
// annotation coordinates scale uniformly; = 24px at the default size, and larger
// at bigger fonts, so the tight case has more room than before, not less). A song
// with an artist donates ~1.5x fontPx of that room; a song with a title and NO
// artist donates none, and that is the constraining case (at fontPx 34: ~57px
// title + ~29px margin, block is 2 x fontPx x 1.5 x SCALE tall).
//
// Measured ceiling was 0.795 against the OLD fixed 24px margin; the proportional
// margin only adds room at large fonts, so 0.75 stays safely below it.
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

export default function PresentationView({ songs, startIndex = 0, onExit, onEdit, onNavigate, onSaveDuration, onSetFullPage, showEdit = true, disableAnnotations = false, sourceLabel = null }) {
  const { theme, chordColor: prefsChordColor, chordDiagramSize, chordLabelScale, metronomeMode, accidentals, presentIdleSec, scrollStartDelaySec, instrument, pedalPaging, pageGlideMs, pageSize, updatePref } = usePrefs();
  // Glide duration for within-song paging (ms); 0 = instant. Clamped defensively.
  const glideMs = Math.max(0, Math.min(2000, pageGlideMs ?? 550));
  // Fraction of the viewport a page turn moves: 3/4 or 1/2, else null = a full
  // screenful (the default, which keeps a ~2-line overlap instead).
  const pageFraction = pageSize === 'half' ? 0.5 : pageSize === 'threequarters' ? 0.75 : null;
  // 'none' turns chord diagrams off: no docked panel and no C toggle button.
  const chordsAvailable = instrument !== 'none';
  // One idle delay for every Present control surface (pill + left gutter), from
  // the user's 0–5s setting. Clamped defensively in case an out-of-range value
  // is ever stored. The no-fade sentinel maps to Infinity, which every idle timer
  // reads as "never schedule" — practice mode keeps the controls up all the time.
  const idleDelayMs = presentIdleSec === PRESENT_NO_FADE
    ? Infinity
    : Math.max(0, Math.min(5, presentIdleSec ?? 3)) * 1000;
  // Lead-in before auto-scroll actually moves after the button is pressed (0–10s).
  const scrollStartDelayMs = Math.max(0, Math.min(10, scrollStartDelaySec ?? 0)) * 1000;
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
  // `scrolling` is the user's intent (drives the button icon); `scrollArmed` is
  // whether the start-delay has elapsed and the loop should actually move. They
  // are equal when the delay is 0.
  const [scrolling, setScrolling] = useState(false);
  const [scrollArmed, setScrollArmed] = useState(false);
  // Auto-scroll speed is a LIVE, per-song tweak — never a sticky global. It
  // always starts neutral so the bottom readout equals the song's own duration;
  // a lasting pace change is committed per song via "Save M:SS". (Persisting it
  // per-device made the readout drift by the stale multiplier — and differ
  // between devices — since it's applied as duration ÷ speedMult.)
  const [speedMult, setSpeedMult] = useState(DEFAULT_SPEED);
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
  const [toolsOpen, setToolsOpen] = useState(() => {
    try { return localStorage.getItem(TOOLS_OPEN_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(TOOLS_OPEN_KEY, toolsOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [toolsOpen]);
  const { url: ytUrl, collapsed: ytCollapsed, openPlayer, collapsePlayer, expandPlayer } = useYouTube();
  const ytWasExpandedRef = useRef(false);
  const scrollRef      = useRef(null);
  const contentWrapRef = useRef(null);
  const rafRef         = useRef(0);
  const flashTimers    = useRef([]);
  // Smooth pedal paging tracks the INTENDED scroll destination separately from
  // the live (mid-animation) scrollTop, so two fast presses advance two full
  // pages instead of computing the second off an interpolated position. null =
  // idle (next press starts from the actual scrollTop). An idle timer clears it
  // shortly after the last press so it can't go stale after manual scrolling.
  const pagingTargetRef = useRef(null);
  const pagingIdleTimer = useRef(null);
  const pageAnimRef     = useRef(0); // rAF id for an in-flight smooth-paging glide

  const song  = songs[index];
  const total = songs.length;
  const meta  = song?.metadata || {};
  // Transpose is locked OFF for a PDF: its printed chords can't move, so the
  // diagrams must render at the key the chords were entered in (View Key would
  // otherwise drift the shapes away from the sheet).
  const semitones = isPdfSong(song) ? 0 : semitonesBetween(meta.key, song?.displayKey);
  // Accidental spelling for transposed chords/diagrams — auto follows the View Key.
  const useFlats = useFlatsForKey(accidentals, song?.displayKey);

  // Per-song Full Page control + the within-song advance unit. The pedal, the
  // on-screen ◀/▶, and the pdf tap zones all resolve their meaning through `mode`
  // — never an inline type check. Live override so the Tools toggle takes effect
  // immediately; null = use the song's stored value. Reset on song change (the
  // stored value is authoritative once persisted via onSetFullPage).
  const [fullPageOverride, setFullPageOverride] = useState(null);
  useEffect(() => { setFullPageOverride(null); }, [index]);
  const isFullPage = fullPageOverride ?? (song?.fullPage === true);
  function toggleFullPage() {
    const nextVal = !isFullPage;
    setFullPageOverride(nextVal);
    if (song?.id) onSetFullPage?.(song.id, nextVal);
  }
  // Full Page → discrete page turns ('page'); otherwise continuous scroll.
  const mode = isFullPage ? 'page' : 'scroll';
  const songIsPdf = isPdfSong(song);         // content-type gating only

  // GLOBAL foot-pedal setting (not per song): 'Screen' (pedalPaging on) pages the
  // current song a screenful at a time; 'Songs' (default, off) jumps song-to-song.
  // A Full Page song always turns pages regardless of this. So the pedal / ◀▶
  // advance WITHIN the song when the song is Full Page, or when the setting is
  // Screen; otherwise they move Next/Previous song.
  const advancesWithinSong = isFullPage || pedalPaging === true;

  // Auto-scroll: timed hands-free scroll for a plain scroll song in Songs mode
  // (the default). Full Page and Screen paging both drive the movement manually.
  const autoScrollAvailable = mode === 'scroll' && !advancesWithinSong;
  // Chord tools are text-only, and only when an instrument is selected.
  // Chord diagrams work for a PDF too: the shapes come from chord names typed
  // into the song's text (e.g. [G] [C] [D]), NOT from the PDF — so drop the type
  // gate and let the Chords On/Off toggle show them over the lead sheet.
  const chordControlsAvailable = chordsAvailable;

  // PDF paging state (1-based); pdfCount comes from the rendered document.
  const [pdfPage, setPdfPage]   = useState(1);
  const [pdfCount, setPdfCount] = useState(1);

  const goTo = useCallback((target) => {
    const clamped = Math.max(0, Math.min(total - 1, target));
    if (clamped === index) return;
    setScrolling(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setIndex(clamped);
  }, [index, total, songs]);

  // Clear the intended-target tracking a short moment after the last page press,
  // so a later press (or one after manual scrolling) recomputes from the real
  // scrollTop rather than a stale target. Only used on the smooth path.
  // Glide the scroll container to `target` over glideMs with an ease-out curve.
  // A fresh press cancels any in-flight glide and starts a new one from the
  // current position toward the (already retargeted) destination, so rapid
  // presses chain smoothly. Manual rAF rather than native smooth so the speed is
  // user-tunable and identical on every browser.
  const animatePageTo = useCallback((el, target) => {
    cancelAnimationFrame(pageAnimRef.current);
    const start = el.scrollTop;
    const dist  = target - start;
    if (Math.abs(dist) < 1) { el.scrollTop = target; return; }
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    function frame(now) {
      const p = Math.min(1, (now - t0) / glideMs);
      el.scrollTop = start + dist * ease(p);
      if (p < 1) pageAnimRef.current = requestAnimationFrame(frame);
    }
    pageAnimRef.current = requestAnimationFrame(frame);
  }, [glideMs]);

  // Clear the intended target once a glide has surely finished (its duration plus
  // a buffer), so it never relaxes mid-flight even at the 2000ms maximum; after
  // that a later press recomputes from the real, settled scrollTop.
  const armPagingIdleReset = useCallback(() => {
    clearTimeout(pagingIdleTimer.current);
    pagingIdleTimer.current = setTimeout(() => { pagingTargetRef.current = null; }, glideMs + 250);
  }, [glideMs]);
  useEffect(() => () => { clearTimeout(pagingIdleTimer.current); cancelAnimationFrame(pageAnimRef.current); }, []);
  // A song change resets the destination and cancels any glide — the new song
  // loads at its top (an instant cut). PDF paging resets to page 1.
  useEffect(() => {
    pagingTargetRef.current = null;
    cancelAnimationFrame(pageAnimRef.current);
    setPdfPage(1);
    setPdfCount(1);
  }, [index]);

  // Pedal paging: move within the current song by ~one screenful (dir 1 = down,
  // -1 = up), keeping a small overlap so the reader doesn't lose their place.
  // Only when already at the song's bottom/top does it cross to the next/previous
  // song (start at that song's top — a v1 simplification, always an instant cut).
  // Single-song context (total === 1) can never cross, since index stays 0. No
  // wrap at the ends. The target/overlap math is identical on both paths — only
  // HOW we move to that target differs (instant assign vs smooth glide).
  const pageStep = useCallback((dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const overlap   = Math.round(fontPx * 2.5); // ~2 lines kept on screen
    // Full page keeps a ~2-line overlap; a fractional page moves that share of
    // the viewport (its larger overlap already keeps plenty of context).
    const amount    = pageFraction == null
      ? Math.max(1, el.clientHeight - overlap)
      : Math.max(1, Math.round(el.clientHeight * pageFraction));

    if (glideMs <= 0) {
      // Instant path — byte-for-byte the original behavior.
      if (dir > 0) {
        if (el.scrollTop < maxScroll - 1) el.scrollTop = Math.min(maxScroll, el.scrollTop + amount);
        else if (index < total - 1) goTo(index + 1);
      } else {
        if (el.scrollTop > 0) el.scrollTop = Math.max(0, el.scrollTop - amount);
        else if (index > 0) goTo(index - 1);
      }
      return;
    }

    // Smooth path — compute from the last intended target (falling back to the
    // real position when idle) so rapid presses chain reliably; glide there with
    // native smooth scroll. Song crossings stay an instant cut.
    const base = pagingTargetRef.current ?? el.scrollTop;
    if (dir > 0) {
      if (base >= maxScroll - 1) {
        if (index < total - 1) { cancelAnimationFrame(pageAnimRef.current); pagingTargetRef.current = null; goTo(index + 1); }
      } else {
        const target = Math.min(maxScroll, base + amount);
        pagingTargetRef.current = target;
        animatePageTo(el, target);
        armPagingIdleReset();
      }
    } else {
      if (base <= 0) {
        if (index > 0) { cancelAnimationFrame(pageAnimRef.current); pagingTargetRef.current = null; goTo(index - 1); }
      } else {
        const target = Math.max(0, base - amount);
        pagingTargetRef.current = target;
        animatePageTo(el, target);
        armPagingIdleReset();
      }
    }
  }, [glideMs, pageFraction, fontPx, index, total, goTo, animatePageTo, armPagingIdleReset]);

  // PDF within-song advance for the pedal/keyboard: turn a page, and at the last
  // page (or before the first) cross to the next/previous song — mirroring the
  // scroll path's roll-to-next behavior. No wrap at the set's ends.
  const pdfAdvance = useCallback((dir) => {
    if (dir > 0) {
      if (pdfPage < pdfCount) setPdfPage(p => p + 1);
      else if (index < total - 1) goTo(index + 1);
    } else {
      if (pdfPage > 1) setPdfPage(p => p - 1);
      else if (index > 0) goTo(index - 1);
    }
  }, [pdfPage, pdfCount, index, total, goTo]);

  // PDF tap zones: pure page turn for manual reading — clamp at the ends (tapping
  // never jumps you into another song; the ◀/▶ buttons or the pedal do that).
  const pdfTapTurn = useCallback((dir) => {
    setPdfPage(p => Math.max(1, Math.min(pdfCount, p + dir)));
  }, [pdfCount]);

  // The single within-song advance seam, driven by advanceMode (Full Page flag),
  // not by type. Full Page → discrete page turns (pdfAdvance; a single-page text
  // song rolls straight to the next song). Scroll → screenful paging (pageStep).
  // Both the renderer and this handler consult advanceMode — no scattered checks.
  const withinSongAdvance = useCallback((dir) => {
    if (mode === 'page') pdfAdvance(dir);
    else pageStep(dir);
  }, [mode, pdfAdvance, pageStep]);

  // Shared navigation, reused by the keyboard/pedal and the on-screen ◀/▶. The
  // advancesWithinSong decides the meaning: WITHIN the song (via the
  // advance seam), OFF skips song-to-song (today's default for a text song).
  const prev = useCallback(() => (advancesWithinSong ? withinSongAdvance(-1) : goTo(index - 1)), [advancesWithinSong, withinSongAdvance, goTo, index]);
  const next = useCallback(() => (advancesWithinSong ? withinSongAdvance(1)  : goTo(index + 1)), [advancesWithinSong, withinSongAdvance, goTo, index]);

  const smallerAction = useCallback(() => setFontPx(f => Math.max(MIN_FONT, f - FONT_STEP)), []);
  const largerAction  = useCallback(() => setFontPx(f => Math.min(MAX_FONT, f + FONT_STEP)), []);

  // F faster, S slower — each press a ±10% proportional step, clamped to range.
  const fasterScroll = useCallback(() => setSpeedMult(m => roundMult(Math.min(MAX_SPEED, m * SPEED_STEP))), []);
  const slowerScroll = useCallback(() => setSpeedMult(m => roundMult(Math.max(MIN_SPEED, m / SPEED_STEP))), []);

  // Bake the current multiplier into the song's stored duration, then reset to
  // neutral so the song now scrolls at the chosen pace on its own. effective
  // time = base / multiplier (faster ⇒ shorter). Only meaningful when the song
  // has a base duration and the pace is actually off neutral.
  const saveSpeed = useCallback(() => {
    if (!onSaveDuration || !song?.id) return;
    const base = parseDuration(song?.metadata?.duration) || DEFAULT_DURATION_SEC;
    onSaveDuration(song.id, formatDuration(base / speedMult));
    setSpeedMult(DEFAULT_SPEED);
  }, [onSaveDuration, song?.id, song?.metadata?.duration, speedMult]);

  // Pause in place and resume from there — no rewind. Scroll position is only
  // reset when the song itself changes (see goTo). Matches the spacebar toggle.
  // Inert in pedal paging mode (auto-scroll is disabled there).
  const toggleScroll = useCallback(() => { if (autoScrollAvailable) setScrolling(s => !s); }, [autoScrollAvailable]);

  // Pedal paging disables auto-scroll entirely — make sure any in-progress scroll
  // stops the moment the mode turns on, so the loop can never run alongside paging.
  useEffect(() => { if (!autoScrollAvailable) setScrolling(false); }, [autoScrollAvailable]);

  // Persist the lyric font size so A-/A+ changes survive leaving and re-entering.
  useEffect(() => {
    try { localStorage.setItem(FONT_KEY, String(fontPx)); } catch { /* ignore */ }
  }, [fontPx]);

  // Reset the speed tweak to neutral on every song change, so each song's
  // readout shows its own duration until you actively adjust (and Save) it.
  useEffect(() => { setSpeedMult(DEFAULT_SPEED); }, [index]);

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

  // Keyboard shortcuts — also the wiring for Bluetooth page-turner pedals, which
  // present to the OS as HID keyboards: each pedal press sends one of these keys.
  // Listener lives with Present mode and is torn down on close (effect cleanup).
  useEffect(() => {
    function onKey(e) {
      // Never hijack typing — if a text field is focused (e.g. any future
      // edit-in-place control), let the keystroke through untouched.
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

      // Page navigation (arrows / page keys / pedal presses). Skip auto-repeat so
      // a held-down pedal flips one page, not many; preventDefault so the
      // browser's own scroll on these keys doesn't also fire.
      const isNext = e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown';
      const isPrev = e.key === 'ArrowLeft'  || e.key === 'ArrowUp'   || e.key === 'PageUp';
      if (isNext || isPrev) {
        if (e.repeat) return;
        e.preventDefault();
        if (isNext) next(); else prev();
        return;
      }

      if      (e.key === 'Escape')  onExit();
      else if (e.key === '+' || e.key === '=') setFontPx(f => Math.min(MAX_FONT, f + FONT_STEP));
      else if (e.key === '-' || e.key === '_') setFontPx(f => Math.max(MIN_FONT, f - FONT_STEP));
      // Space toggles auto-scroll — inert in pedal paging mode (nothing to toggle).
      else if (e.key === ' ') { e.preventDefault(); if (autoScrollAvailable) setScrolling(s => !s); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onExit, autoScrollAvailable]);

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

  // Start-delay gate. Pressing scroll flips `scrolling` immediately (so the
  // button reads as engaged), but the loop below waits for `scrollArmed`, which
  // this arms after the user's lead-in. Pressing again, changing song, or
  // reaching the end clears `scrolling`, which disarms here and cancels a pending
  // lead-in. A speed change does NOT re-run this (it isn't in the deps), so it
  // never re-triggers the delay mid-scroll.
  useEffect(() => {
    if (!scrolling) { setScrollArmed(false); return; }
    if (scrollStartDelayMs <= 0) { setScrollArmed(true); return; }
    setScrollArmed(false);
    const t = setTimeout(() => setScrollArmed(true), scrollStartDelayMs);
    return () => clearTimeout(t);
  }, [scrolling, scrollStartDelayMs]);

  // Duration-based auto-scroll.
  // Rate = (total scrollable px) / (song duration in seconds).
  // Falls back to fixed speed when no duration is set.
  useEffect(() => {
    if (!scrollArmed) return;
    const el = scrollRef.current;
    if (!el) return;

    const durationSec = parseDuration(meta.duration) || DEFAULT_DURATION_SEC;
    const scrollable  = el.scrollHeight - el.clientHeight;
    if (scrollable <= 0) { setScrolling(false); return; }

    const basePxPerSec = scrollable / durationSec;
    const pxPerSec = basePxPerSec * speedMult;

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
  }, [scrollArmed, index, meta.duration, speedMult]);

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

  // Save-speed control state. The feature is offered only when a save callback is
  // wired (Present-from-library; the read-only shared view passes none). Songs
  // with no duration fall back to the assumed 3:30 base, so F/S + Save work for
  // them too — committing writes a real duration. It can commit once the pace is
  // off neutral; the label carries the concrete target time so there's no guessing.
  const baseDurationSec = parseDuration(meta.duration) || DEFAULT_DURATION_SEC;
  const speedAdjusted = Math.abs(speedMult - 1) > 0.001;
  const canSaveSpeed = !!onSaveDuration && speedAdjusted;
  // Bottom row shows the (speed-adjusted) play time. When it can be saved to your
  // own song it's a "Save M:SS" button; otherwise — nothing to save, or a shared
  // song you can't edit — it's just the time. "Save" is short enough to keep the
  // value on the button (the old "Duration …" label pushed it off).
  const effectiveDuration = formatDuration(baseDurationSec / speedMult);
  const saveSpeedLabel = canSaveSpeed ? `Save ${effectiveDuration}` : effectiveDuration;

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
      if (!Number.isFinite(idleDelayMs)) return; // practice mode: gutter stays lit
      gutterIdleTimer.current = setTimeout(() => setGutterIdle(true), idleDelayMs);
    };
    wake();
    window.addEventListener('pointerdown', wake, true);
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      clearTimeout(gutterIdleTimer.current);
    };
  }, [idleDelayMs]);

  // select-none on the root: Present is a performance view — lyrics are never
  // meant to be selected. Without it, a double-click (including the setlist row
  // double-tap that opens Present, whose second click can land on the just-mounted
  // lyrics) selects text and paints a highlight box over it.
  return (
    <div className={`fixed inset-0 z-50 flex flex-col select-none ${bg}`}>
      {/* Source badge — which version is playing (shared vs. your edited copy).
          Fixed + pointer-events-none so it never affects the lyric layout. */}
      {sourceLabel && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[55] pointer-events-none">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium shadow ${dark ? 'bg-gray-800/85 text-gray-300 border border-gray-700' : 'bg-white/90 text-gray-600 border border-gray-200'}`}>
            {sourceLabel}
          </span>
        </div>
      )}
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
      {/* PDF in Full Page mode: one page fit-to-screen, tap zones turn pages. */}
      {songIsPdf && mode === 'page' && (
        <PdfSongView
          songId={song?.id}
          page={pdfPage}
          onReady={setPdfCount}
          onTapPrev={() => pdfTapTurn(-1)}
          onTapNext={() => pdfTapTurn(1)}
          dark={dark}
        />
      )}
      {/* Page-anchored ink for a Full Page PDF. Always mounted so the ink shows
          whether or not you're drawing; it's pointer-transparent unless annotating
          (so the page tap-zones stay reachable). `page` tells it which page is on
          screen so it shows that page's strokes and hides the rest. */}
      {songIsPdf && mode === 'page' && song?.id && !disableAnnotations && (
        <PdfAnnotationCanvas key={`pdf-${song.id}`} songId={song.id} annotating={annotating} page={pdfPage} dark={dark} />
      )}
      {/* PDF in scroll mode: a scrollable stack of pages INSIDE the shared scroll
          container (scrollRef), so manual scroll, pedal screenful-paging, and
          auto-scroll all work exactly as for a text song. The ink overlay wraps
          the stack in a relative box so it spans the FULL content height and
          scrolls with the pages; strokes are anchored per-page so they line up in
          Full Page mode too. */}
      {songIsPdf && mode === 'scroll' && (
        <div ref={scrollRef} className={`absolute inset-0 ${advancesWithinSong ? 'overflow-y-hidden' : 'overflow-y-auto'} px-4 md:px-8 py-4`}>
          <div className="relative">
            <PdfPageStack songId={song?.id} onReady={setPdfCount} dark={dark} />
            {song?.id && !disableAnnotations && (
              <PdfAnnotationCanvas key={`pdf-${song.id}`} songId={song.id} annotating={annotating} dark={dark} />
            )}
          </div>
        </div>
      )}
      {/* Text songs: the lyric column, unchanged. Rendered only for text so the
          shared scrollRef isn't claimed by two elements at once. */}
      {!songIsPdf && (
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
          {/* Manual (touch) scroll is disabled while the pedal drives a text
              song, so the reader can't drift off the pedal's position; the glide
              still moves scrollTop programmatically. Pedal-off keeps auto. */}
          <div ref={scrollRef} className={`absolute inset-0 ${advancesWithinSong ? 'overflow-y-hidden' : 'overflow-y-auto'} pl-14 pr-6 py-6 md:px-12`}>
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
                // Gap below the info block is proportional to fontPx (not a fixed
                // mb-6/24px) so EVERY vertical dimension in this box scales linearly
                // with the font. Annotation y is rescaled by the font ratio, which
                // is only exact when nothing is fixed; a fixed 24px gap made ink
                // drift up as the font shrank. Scaled to equal 24px at DEFAULT_FONT
                // so annotations drawn at the default size stay put.
                <div className="relative" style={{ marginBottom: fontPx * (24 / DEFAULT_FONT) }}>
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
              <SongBody text={song?.text || ''} semitones={semitones} useFlats={useFlats} fontPx={fontPx} dark={dark} chordColor={readableChordColor(prefsChordColor, dark)} chordLabelScale={chordLabelScale} displayMode={song?.previewMode || song?.chordStyle || 'over'} embed={song?.embed === true} instrument={instrument} chordPrefs={song?.chordPrefs || {}} condensed={song?.condensed === true} />
              {/* Ink annotation canvas — omitted entirely in shared viewer */}
              {song?.id && !disableAnnotations && (
                <AnnotationCanvas
                  key={song.id}
                  songId={song.id}
                  annotating={annotating}
                  dark={dark}
                  legacyYOffset={legacyInkOffset}
                  fontPx={fontPx}
                />
              )}
            </div>
          </div>

        </div>

        {/* Scroll-clear spacer. Matches the docked panel's live width so the end
            of the longest line can be scrolled out from under it; without it the
            tail would sit under the panel even at maximum scrollLeft. */}
        {chordControlsAvailable && showChords && (
          <div className="shrink-0" style={{ width: chordsWidth }} aria-hidden="true" />
        )}
      </div>
      )}

        {/* Chord diagram — one docked, resizable panel at every width (phone,
            tablet, desktop): no blocking modal, so the round size buttons are
            always present. Absolute, so it takes no row space and keeps its own
            resizable width; the lyrics column runs under it at large fonts
            instead of pushing it off the page. z-30 keeps it below
            PresentControls (z-40) so the control pill stays reachable.
            overflow-hidden lives on the inner column, not here, so the handle's
            44px touch target can overflow the panel's left edge. */}
        {chordControlsAvailable && showChords && (
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
                  extraCustomChords={song?.customChords}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons — the top bar is gone, so these live in the upper-left
          corner, in the lyric column's 48px left gutter where they cover no text
          at rest. Exit stays on top, always visible; below it a Tools toggle
          reveals or hides the four song tools (Edit, YouTube, Finger drawing,
          Chords) so they don't clutter the stage while scrolling. The whole
          group is stationary; PresentControls is draggable, so overlap is
          possible by construction and z-order is the only guarantee: z-35 keeps
          these above the chord panel (z-30) and below PresentControls (z-40), so
          the control pill always wins. Exit is the only pointer route out of
          Present (Escape is the keyboard fallback). The tool tray's open state
          persists, so it stays as left from song to song and across re-entry. */}
      <div
        className="fixed left-0 z-[35] flex flex-col items-center"
        style={{
          top: GUTTER_TOP, gap: PRESENT_ACTION_GAP, paddingLeft: 2,
          opacity: gutterIdle ? PRESENT_CONTROL_IDLE_OPACITY : 1,
          transition: 'opacity 300ms ease',
        }}
      >
        <RoundButton
          size={PRESENT_ACTION_BUTTON_SIZE}
          label="Exit Present mode"
          fill={actionFill}
          onActivate={onExit}
        >
          <X size={22} strokeWidth={2.5} />
        </RoundButton>

        {/* Tools toggle. Indigo accent when open (via active) so it reads as the
            container for the tray, distinct from the neutral tools it reveals. */}
        <RoundButton
          size={PRESENT_ACTION_BUTTON_SIZE}
          label={toolsOpen ? 'Hide tools' : 'Show tools'}
          fill={actionFill}
          active={toolsOpen}
          ariaExpanded={toolsOpen}
          onActivate={() => setToolsOpen(v => !v)}
        >
          <Wrench size={20} strokeWidth={2} />
        </RoundButton>

        {toolsOpen && (<>
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

        {/* Per-song Full Page mirror of the editor's control. Active (indigo) =
            discrete full pages that fit the screen; off = continuous scroll.
            Applies to both PDF and text songs. (The Screen-vs-Songs pedal choice
            is a global setting under Settings, not a per-song control.) */}
        {onSetFullPage && (
          <RoundButton
            size={PRESENT_ACTION_BUTTON_SIZE}
            label={isFullPage ? 'Full Page mode: one page at a time' : 'Scroll mode: continuous scroll'}
            fill={actionFill}
            active={isFullPage}
            onActivate={toggleFullPage}
          >
            <span className="font-bold leading-none" style={{ fontSize: 13 }}>
              {isFullPage ? 'FP' : 'SC'}
            </span>
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
              {/* Red brand mark, matching the editor header. #ff0033 reads on
                  both the night and day action-button fills. RoundButton's opacity
                  still dims it when disabled. */}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#ff0033" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
            </RoundButton>
          );
        })()}

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

        {chordControlsAvailable && (
        <RoundButton
          size={PRESENT_ACTION_BUTTON_SIZE}
          label={showChords ? 'Hide chord diagrams' : 'Show chord diagrams'}
          fill={actionFill}
          active={showChords}
          onActivate={() => setShowChords(v => !v)}
        >
          <span className="font-bold leading-none" style={{ fontSize: 20 }}>C</span>
        </RoundButton>
        )}
        </>)}
      </div>

      {/* Floating control panel — the only in-view control surface for text size,
          song navigation, count-in and auto-scroll. Always present; collapsing to
          the pill is the only way to hide it. In pedal paging mode the ◀/▶ stay
          enabled at set boundaries (they page within a song), and the auto-scroll
          button is disabled since that mode has no auto-scroll. */}
      <PresentControls
        dark={dark}
        idleDelayMs={idleDelayMs}
        onSmaller={smallerAction}
        onLarger={largerAction}
        canSmaller={!songIsPdf && fontPx > MIN_FONT}
        canLarger={!songIsPdf && fontPx < MAX_FONT}
        onPrev={prev}
        onNext={next}
        canPrev={advancesWithinSong || index > 0}
        canNext={advancesWithinSong || index < total - 1}
        onFaster={fasterScroll}
        onSlower={slowerScroll}
        canFaster={speedMult < MAX_SPEED}
        canSlower={speedMult > MIN_SPEED}
        showSaveSpeed={!!onSaveDuration || hasDuration}
        canSaveSpeed={canSaveSpeed}
        onSaveSpeed={saveSpeed}
        saveSpeedLabel={saveSpeedLabel}
        onCountIn={handleMetronomeTap}
        canCountIn={!!Number(meta.tempo)}
        onToggleScroll={toggleScroll}
        scrolling={scrolling}
        scrollDisabled={!autoScrollAvailable}
        speedPct={speedMult}
        fontPx={fontPx}
        tempo={Number(meta.tempo) || 0}
        timeSig={meta.timeSig}
      />

    </div>
  );
}
