import { useCallback, useEffect, useRef, useState } from 'react';
import { beatsPerBar } from '../utils/timeSig.js';
import { ArrowDown, ChevronDown, ChevronUp, Gauge, Pause, Wrench } from 'lucide-react';
import { useDraggablePanel } from '../hooks/useDraggablePanel.js';
import RoundButton, {
  ROUND_FILL_NIGHT,
  ROUND_FILL_DAY,
  TriangleLeft,
  TriangleRight,
} from './RoundButton.jsx';


// ---- Tunables ---------------------------------------------------------------

// Sits between the 44px action/chord buttons and the old 64px primary tier:
// smaller than before, still comfortably above the MIN_TOUCH_TARGET.
export const PRESENT_CONTROL_BUTTON_SIZE   = 54;   // px diameter
export const PRESENT_CONTROL_GAP           = 12;
export const PRESENT_CONTROL_IDLE_OPACITY  = 0.35;
// Collapsing is the only way to hide the panel, so the pill is the sole way back
// to the controls. It fades to its own higher floor than the expanded panel — at
// 64px on a bright stage, 0.35 is easy to lose.
export const PRESENT_CONTROL_PILL_IDLE_OPACITY = 0.55;
// Fallback only — the live value is the user's presentIdleSec pref, passed in as
// idleDelayMs. Kept exported so callers have a sane default before prefs load.
export const PRESENT_CONTROL_IDLE_DELAY_MS = 3000;

// The collapsed pill is the only way back to the controls, so it must stay
// findable even while ghosted on a bright stage. A solid indigo (the app accent)
// with a white chevron reads on both white and dark backgrounds — unlike the
// translucent white it used to be, which vanished at the idle opacity.
const PILL_BG     = 'rgba(79,70,229,0.95)';   // indigo-600
const PILL_BORDER = 'rgba(255,255,255,0.30)';
export const PRESENT_CONTROL_EDGE_MARGIN   = 16;   // min gap from any viewport edge

const PANEL_PADDING     = 12;
// The panel shell carries a 1px border, and clientHeight excludes it — so without
// this the inner column is 2px short of what the height maths promised, and the
// only shrinkable child (the selector) silently absorbs the difference.
const PANEL_BORDER      = 1;
const HANDLE_H          = 24;
const FLASH_MS          = 180;
// Full-width "Save speed" row below the button grid. Present only when a save
// handler is wired (Present-from-library), so its height is added conditionally.
const SAVE_ROW_H        = 40;

const GRID_ROWS = 4; // A−/A+ · Prev/Next · D−/D+ · Count-in/Scroll
const GRID_W = PRESENT_CONTROL_BUTTON_SIZE * 2 + PRESENT_CONTROL_GAP;
const GRID_H = PRESENT_CONTROL_BUTTON_SIZE * GRID_ROWS + PRESENT_CONTROL_GAP * (GRID_ROWS - 1);

const EXPANDED_W  = GRID_W + PANEL_PADDING * 2;
const COLLAPSED_W = PRESENT_CONTROL_BUTTON_SIZE;
const COLLAPSED_H = PRESENT_CONTROL_BUTTON_SIZE;

// Which tab the panel is showing. Persisted: between songs you carry on where
// you left off, rather than the panel resetting under you every time.
const TAB_KEY       = 'cue:present_controls_tab';
// The tab toggle is ONE button carrying the icon of where it takes you, not two
// segments showing where you are. Icon only — a label under it would say what the
// button already says, and cost height the panel does not have in landscape.
//
// A short pill, centred. Full width (120) read as a header and dominated a panel
// whose actual controls sit below it; a 40px circle was too small to aim at. 54
// is wide enough to read as a pill and still leaves the collapse caret its corner
// with room to spare — at 80 a centred pill reached into the caret's hit area,
// and a tap near its right end collapsed the panel instead of switching tabs.
//
// The hit box is padded to MIN_TOUCH_TARGET vertically and pulled back with a
// negative margin, so the header row still measures TOGGLE_H rather than the
// larger target.
const TOGGLE_W      = 54;
const TOGGLE_H      = 40;
const TOGGLE_HIT_H  = 44;
// The collapse caret sits in its own full-width row directly beneath the selector,
// so it lands where the collapsed blue pill appears. Kept deliberately short, and
// tucked close under the selector, because those two rows are pure chrome and
// every pixel they take comes off the controls in landscape.
// The collapse caret is pinned in the panel's top-right corner and positioned
// absolutely, so it takes no room in the header row at all. Its glyph is small
// but its hit box is not — the corner is easy to aim at, and the pill you get
// back is 54px, so only the way IN is small.
const CARET_HIT     = 34;

const POS_KEY       = 'cue:present_controls_pos';
const COLLAPSED_KEY = 'cue:present_controls_collapsed';

function loadCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

// ---- Icons ------------------------------------------------------------------

// No metronome icon exists in the app or in lucide-react, so it is inline.
function MetronomeIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9.2 3h5.6l3.9 18H5.3L9.2 3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6.6 15.2h10.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 16.4 L15.6 6.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="14.7" cy="9.1" r="1.5" fill="currentColor" />
    </svg>
  );
}

function Glyph({ children }) {
  return <span className="font-bold leading-none" style={{ fontSize: 24, letterSpacing: '-0.02em' }}>{children}</span>;
}

// ---- Control grid -----------------------------------------------------------

// Presentational only: handlers and disabled flags in, buttons out. It knows
// nothing about dragging, positioning or persistence, so a docked variant can
// reuse it as-is.
export function ControlGrid({
  dark,
  onSmaller, onLarger, canSmaller, canLarger,
  onPrev, onNext, canPrev, canNext,
  onFaster, onSlower, canFaster, canSlower,
  onCountIn, canCountIn,
  onToggleScroll, scrolling, scrollDisabled,
  showSaveSpeed, canSaveSpeed, onSaveSpeed, saveSpeedLabel,
  speedPct = 1, fontPx = 0, tempo = 0, timeSig = '4/4',
}) {
  const fill = dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY;
  const saveDisabledBg    = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const saveDisabledColor = dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)';

  // Reliable tap feedback: a momentary lit "flash" fired from the click handler,
  // since CSS :active is unreliable on iOS PWAs. `flashKey` names which button
  // is lit (one at a time). A−/A+ and F/S also show a transient value readout so
  // the change is felt even when the on-screen difference is subtle.
  const [flashKey, setFlashKey] = useState(null);
  const [readout, setReadout]   = useState(null); // null | 'speed' | 'font'
  const flashT = useRef(null);
  const readoutT = useRef(null);
  const beatTimers = useRef([]);
  useEffect(() => () => {
    clearTimeout(flashT.current); clearTimeout(readoutT.current);
    beatTimers.current.forEach(clearTimeout);
  }, []);

  function pulse(key, fn) {
    fn?.();
    setFlashKey(key);
    clearTimeout(flashT.current);
    flashT.current = setTimeout(() => setFlashKey(null), FLASH_MS);
  }
  function pulseWithReadout(key, kind, fn) {
    pulse(key, fn);
    setReadout(kind);
    clearTimeout(readoutT.current);
    readoutT.current = setTimeout(() => setReadout(null), 1400);
  }

  // Count-in: a one-shot two-bar cue. Pulse the button once per beat across the
  // count so the flash reads as a deliberate count, not a flicker.
  function handleCountIn() {
    onCountIn?.();
    const beats = beatsPerBar(timeSig) * 2;
    const intervalMs = tempo > 0 ? 60000 / tempo : 500;
    beatTimers.current.forEach(clearTimeout);
    beatTimers.current = [];
    for (let i = 0; i < beats; i++) {
      beatTimers.current.push(setTimeout(() => setFlashKey('count'), i * intervalMs));
      beatTimers.current.push(setTimeout(() => setFlashKey(k => (k === 'count' ? null : k)), i * intervalMs + Math.min(intervalMs * 0.5, 160)));
    }
  }

  return (
    <div className="relative flex flex-col" style={{ gap: PRESENT_CONTROL_GAP }}>
    {/* Transient value readout for A−/A+ (text px) and F/S (scroll %). Floats
        above the panel so it never reflows the grid. */}
    {readout && (
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold shadow-lg"
        style={{
          top: -36,
          background: dark ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.96)',
          color: dark ? '#ffffff' : '#111111',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)'}`,
        }}
      >
        {readout === 'speed' ? `Scroll ${Math.round((speedPct || 1) * 100)}%` : `Text ${Math.round(fontPx || 0)}px`}
      </div>
    )}
    <div className="grid grid-cols-2" style={{ gap: PRESENT_CONTROL_GAP }}>
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Smaller text" fill={fill} disabled={!canSmaller} active={flashKey === 'as'} onActivate={() => pulseWithReadout('as', 'font', onSmaller)}>
        <Glyph>A−</Glyph>
      </RoundButton>
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Larger text" fill={fill} disabled={!canLarger} active={flashKey === 'al'} onActivate={() => pulseWithReadout('al', 'font', onLarger)}>
        <Glyph>A+</Glyph>
      </RoundButton>

      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Previous song" fill={fill} disabled={!canPrev} active={flashKey === 'prev'} onActivate={() => pulse('prev', onPrev)}>
        <TriangleLeft />
      </RoundButton>
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Next song" fill={fill} disabled={!canNext} active={flashKey === 'next'} onActivate={() => pulse('next', onNext)}>
        <TriangleRight />
      </RoundButton>

      {/* Auto-scroll speed. F = faster, S = slower — spelled out rather than ±
          so the meaning is unmistakable mid-performance (F sits left, matching
          the faster-on-the-left position it had as D−). */}
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Scroll faster" fill={fill} disabled={!canFaster} active={flashKey === 'f'} onActivate={() => pulseWithReadout('f', 'speed', onFaster)}>
        <Glyph>F</Glyph>
      </RoundButton>
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Scroll slower" fill={fill} disabled={!canSlower} active={flashKey === 's'} onActivate={() => pulseWithReadout('s', 'speed', onSlower)}>
        <Glyph>S</Glyph>
      </RoundButton>

      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Count-in" fill={fill} disabled={!canCountIn} active={flashKey === 'count'} onActivate={handleCountIn}>
        <MetronomeIcon />
      </RoundButton>
      <RoundButton
        size={PRESENT_CONTROL_BUTTON_SIZE}
        label={scrollDisabled ? 'Auto-scroll off in pedal paging mode' : scrolling ? 'Pause auto-scroll' : 'Start auto-scroll'}
        fill={fill}
        active={scrolling && !scrollDisabled}
        disabled={scrollDisabled}
        onActivate={onToggleScroll}
      >
        {scrolling && !scrollDisabled ? <Pause size={26} fill="currentColor" /> : <ArrowDown size={28} strokeWidth={2.5} />}
      </RoundButton>
    </div>

    {/* Bakes the current F/S speed into this song's stored length. The label
        carries the concrete target time, so the change is a number, not a
        guess. Disabled until the pace is off neutral (nothing to commit). */}
    {showSaveSpeed && (
      <button
        type="button"
        disabled={!canSaveSpeed}
        onClick={onSaveSpeed}
        aria-label={saveSpeedLabel || 'Save scroll speed to song'}
        className="w-full rounded-xl text-sm font-semibold flex items-center justify-center px-2 transition-colors select-none disabled:cursor-default"
        style={{
          height: SAVE_ROW_H,
          background: canSaveSpeed ? '#4f46e5' : saveDisabledBg,
          color: canSaveSpeed ? '#ffffff' : saveDisabledColor,
          touchAction: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span className="truncate">{saveSpeedLabel}</span>
      </button>
    )}
    </div>
  );
}

// ---- Floating shell ---------------------------------------------------------

export default function PresentControls(props) {
  const { dark, idleDelayMs = PRESENT_CONTROL_IDLE_DELAY_MS } = props;

  const [collapsed, setCollapsed] = useState(loadCollapsed);
  // 'controls' (text size, navigation, scroll) or 'tools' (the per-song actions
  // that used to live in the left gutter). One panel with a selector rather than
  // two floating panels: two draggables on a phone collide by construction, and
  // a single tall stack of everything didn't fit landscape at all.
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem(TAB_KEY) === 'tools' ? 'tools' : 'controls'; }
    catch { return 'controls'; }
  });
  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ }
  }, [tab]);
  // No tools wired (the shared viewer passes none) → no selector, no tools tab.
  const hasTools = !!props.toolsSlot;
  const showTools = hasTools && tab === 'tools';
  // Only user-initiated collapse/expand is remembered across sessions. The idle
  // auto-collapse is transient — persisting it would make every session start as
  // a pill a few seconds after the last, even when the user wanted it open.
  const setCollapsedByUser = useCallback((v) => {
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  // The save-speed row adds a button + one gap to the expanded panel; reserve it
  // whenever the feature is wired so the panel size stays stable as it enables.
  // Height follows the VISIBLE tab — only one set of buttons is ever rendered,
  // which is what makes the whole thing fit a phone in landscape.
  const toolsRows = props.toolsRows || 0;
  const bodyH = showTools
    ? toolsRows * PRESENT_CONTROL_BUTTON_SIZE + PRESENT_CONTROL_GAP * Math.max(0, toolsRows - 1)
    : GRID_H + (props.showSaveSpeed ? SAVE_ROW_H + PRESENT_CONTROL_GAP : 0);
  // The toggle REPLACES the drag-handle row rather than sitting above it. Stacking
  // chrome rows cost 44px once before, which put the Controls tab at 408px against
  // a phone's ~402px landscape viewport — the Save speed row fell off the bottom
  // of the very screen this redesign exists to fit.
  // The caret is corner-anchored and absolutely positioned, so it costs the
  // header nothing — the row is just the toggle.
  const headerH = hasTools ? TOGGLE_H : HANDLE_H;
  const expandedH = headerH + PRESENT_CONTROL_GAP + bodyH + PANEL_PADDING * 2 + PANEL_BORDER * 2;
  const width  = collapsed ? COLLAPSED_W : EXPANDED_W;
  const height = collapsed ? COLLAPSED_H : expandedH;

  const defaultPos = useCallback(
    ({ vw, vh, width: w, height: h, margin }) => ({ x: vw - w - margin, y: vh - h - margin }),
    [],
  );

  const { pos, dragging, onPointerDown, onClickCapture } = useDraggablePanel({
    storageKey: POS_KEY,
    width,
    height,
    margin: PRESENT_CONTROL_EDGE_MARGIN,
    defaultPos,
    // Collapse toward the right corner of where the panel sat, not the left.
    anchorX: 'right',
  });

  // Idle behaviour. Any pointerdown anywhere in Present restores full opacity and
  // re-arms the countdown; the listener is capture-phase so a handler that stops
  // propagation cannot suppress it. When the timer fires the panel auto-collapses
  // to the pill, which then ghosts at its idle opacity — so an untouched panel
  // gets out of the way on its own, and a tap on the pill brings it back.
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(null);
  // Read inside the timeout so a slow drag in progress when it fires doesn't
  // yank the panel to a pill mid-drag; the drag-end effect re-arms it.
  const draggingRef = useRef(false);
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    // Practice mode (idleDelayMs === Infinity): never schedule the auto
    // fade/collapse, so the panel stays fully up until manually collapsed.
    if (!Number.isFinite(idleDelayMs)) return;
    idleTimer.current = setTimeout(() => {
      if (draggingRef.current) return;
      setIdle(true);
      setCollapsed(true); // transient — not setCollapsedByUser
    }, idleDelayMs);
  }, [idleDelayMs]);
  useEffect(() => {
    wake();
    window.addEventListener('pointerdown', wake, true);
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      clearTimeout(idleTimer.current);
    };
  }, [wake]);
  // Track dragging for the timeout guard, and re-arm the countdown when a drag
  // ends (pointerup does not fire the pointerdown wake).
  useEffect(() => {
    draggingRef.current = dragging;
    if (!dragging) wake();
  }, [dragging, wake]);

  if (!pos) return null; // wait for the first measure so it never flashes at 0,0

  const shellBg     = dark ? 'rgba(24,24,27,0.55)' : 'rgba(255,255,255,0.55)';
  const shellBorder = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  const handleTint  = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  // The toggle reads as a control, not as chrome: a filled track and a full-
  // strength glyph, against the collapse caret's deliberately quiet tint.
  const toggleBg    = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const toggleTint  = dark ? '#e5e7eb' : '#1f2937';

  return (
    <div
      // stopPropagation keeps every tap and drag inside the panel from reaching
      // the lyrics area beneath it.
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e); }}
      onClickCapture={onClickCapture}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width,
        height,
        zIndex: 40,
        touchAction: 'none',
        opacity: idle && !dragging
          ? (collapsed ? PRESENT_CONTROL_PILL_IDLE_OPACITY : PRESENT_CONTROL_IDLE_OPACITY)
          : 1,
        transition: dragging ? 'none' : 'opacity 300ms ease',
      }}
    >
      {collapsed ? (
        <button
          type="button"
          aria-label="Expand floating controls"
          aria-expanded={false}
          onClick={() => setCollapsedByUser(false)}
          className="w-full h-full rounded-full flex items-center justify-center shadow-xl backdrop-blur-md border"
          style={{ background: PILL_BG, borderColor: PILL_BORDER, color: '#ffffff', touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <ChevronUp size={26} strokeWidth={2.5} />
        </button>
      ) : (
        <div
          className="relative w-full h-full rounded-2xl shadow-xl backdrop-blur-md border flex flex-col"
          style={{ background: shellBg, borderColor: shellBorder, padding: PANEL_PADDING, gap: PRESENT_CONTROL_GAP }}
        >
          {/* Header row: the selector when there are tools to switch to, the bare
              chevron otherwise. Either way it doubles as the drag grip — the
              panel's whole surface starts a drag, and onClickCapture swallows the
              click that would otherwise fire on whatever was under the finger. */}
          {hasTools ? (
            <button
              type="button"
              role="tab"
              aria-label={showTools ? 'Show controls' : 'Show tools'}
              onClick={() => setTab(showTools ? 'controls' : 'tools')}
              className="self-center flex items-center justify-center shrink-0 relative bg-transparent border-0"
              style={{
                width: TOGGLE_W, height: TOGGLE_HIT_H,
                margin: `${(TOGGLE_H - TOGGLE_HIT_H) / 2}px 0`,
                color: toggleTint, touchAction: 'none', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span
                aria-hidden="true"
                className="absolute rounded-full border"
                style={{ width: TOGGLE_W, height: TOGGLE_H, background: toggleBg, borderColor: shellBorder }}
              />
              {/* Both icons are always mounted and cross-faded, so pressing the
                  button visibly SWAPS one for the other. That swap is the whole
                  explanation of the control: the icon you see is where you are
                  going, and watching it turn into the other one teaches that in a
                  single press, with nothing to read. */}
              {[
                { key: 'tools',    icon: <Wrench size={22} strokeWidth={2} />, on: !showTools },
                { key: 'controls', icon: <Gauge  size={22} strokeWidth={2} />, on: showTools },
              ].map(({ key, icon, on }) => (
                <span
                  key={key}
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center motion-reduce:transition-none"
                  style={{
                    opacity: on ? 1 : 0,
                    transform: `rotate(${on ? 0 : -90}deg) scale(${on ? 1 : 0.7})`,
                    transition: 'opacity 160ms ease, transform 220ms ease',
                  }}
                >
                  {icon}
                </span>
              ))}
            </button>
          ) : (
            <button
              type="button"
              aria-label="Collapse floating controls"
              aria-expanded={true}
              onClick={() => setCollapsedByUser(true)}
              className="w-full flex items-center justify-center rounded-lg shrink-0"
              style={{ height: HANDLE_H, color: handleTint, touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <ChevronDown size={20} strokeWidth={2.5} />
            </button>
          )}
          {/* Collapse — pinned in the top-right corner, out of the flow, so the
              header row is nothing but the toggle. Quiet tint on purpose: it is
              chrome next to a control, and the two must not compete for the eye. */}
          {hasTools && (
            <button
              type="button"
              aria-label="Collapse floating controls"
              aria-expanded={true}
              onClick={() => setCollapsedByUser(true)}
              className="absolute flex items-center justify-center rounded-lg"
              style={{
                top: 1, right: 1, width: CARET_HIT, height: CARET_HIT,
                color: handleTint, touchAction: 'none', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <ChevronDown size={16} strokeWidth={2.5} />
            </button>
          )}
          {showTools
            ? <div style={{ display: 'grid', gridTemplateColumns: `repeat(2, ${PRESENT_CONTROL_BUTTON_SIZE}px)`, gap: PRESENT_CONTROL_GAP }}>{props.toolsSlot}</div>
            : <ControlGrid {...props} />}
        </div>
      )}
    </div>
  );
}
