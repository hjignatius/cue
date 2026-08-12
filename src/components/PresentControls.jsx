import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ChevronDown, ChevronUp, Pause } from 'lucide-react';
import { useDraggablePanel } from '../hooks/useDraggablePanel.js';
import RoundButton, {
  ROUND_FILL_NIGHT,
  ROUND_FILL_DAY,
  ROUND_FILL_ACTIVE,
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
const HANDLE_H          = 24;
const FLASH_MS          = 180;
// Full-width "Save speed" row below the button grid. Present only when a save
// handler is wired (Present-from-library), so its height is added conditionally.
const SAVE_ROW_H        = 40;

const GRID_ROWS = 4; // A−/A+ · Prev/Next · D−/D+ · Count-in/Scroll
const GRID_W = PRESENT_CONTROL_BUTTON_SIZE * 2 + PRESENT_CONTROL_GAP;
const GRID_H = PRESENT_CONTROL_BUTTON_SIZE * GRID_ROWS + PRESENT_CONTROL_GAP * (GRID_ROWS - 1);

const EXPANDED_W  = GRID_W + PANEL_PADDING * 2;
const EXPANDED_H  = GRID_H + HANDLE_H + PRESENT_CONTROL_GAP + PANEL_PADDING * 2;
const COLLAPSED_W = PRESENT_CONTROL_BUTTON_SIZE;
const COLLAPSED_H = PRESENT_CONTROL_BUTTON_SIZE;

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
  onToggleScroll, scrolling,
  showSaveSpeed, canSaveSpeed, onSaveSpeed, saveSpeedLabel,
}) {
  const fill = dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY;
  const saveDisabledBg    = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const saveDisabledColor = dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)';

  // The count-in is a one-shot two-bar cue, not a running metronome, so it gets
  // a brief press-flash instead of a persistent active state.
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  function handleCountIn() {
    onCountIn?.();
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), FLASH_MS);
  }

  return (
    <div className="flex flex-col" style={{ gap: PRESENT_CONTROL_GAP }}>
    <div className="grid grid-cols-2" style={{ gap: PRESENT_CONTROL_GAP }}>
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Smaller text" fill={fill} disabled={!canSmaller} onActivate={onSmaller}>
        <Glyph>A−</Glyph>
      </RoundButton>
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Larger text" fill={fill} disabled={!canLarger} onActivate={onLarger}>
        <Glyph>A+</Glyph>
      </RoundButton>

      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Previous song" fill={fill} disabled={!canPrev} onActivate={onPrev}>
        <TriangleLeft />
      </RoundButton>
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Next song" fill={fill} disabled={!canNext} onActivate={onNext}>
        <TriangleRight />
      </RoundButton>

      {/* Auto-scroll speed. F = faster, S = slower — spelled out rather than ±
          so the meaning is unmistakable mid-performance (F sits left, matching
          the faster-on-the-left position it had as D−). */}
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Scroll faster" fill={fill} disabled={!canFaster} onActivate={onFaster}>
        <Glyph>F</Glyph>
      </RoundButton>
      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Scroll slower" fill={fill} disabled={!canSlower} onActivate={onSlower}>
        <Glyph>S</Glyph>
      </RoundButton>

      <RoundButton size={PRESENT_CONTROL_BUTTON_SIZE} label="Count-in" fill={fill} disabled={!canCountIn} active={flash} onActivate={handleCountIn}>
        <MetronomeIcon />
      </RoundButton>
      <RoundButton
        size={PRESENT_CONTROL_BUTTON_SIZE}
        label={scrolling ? 'Pause auto-scroll' : 'Start auto-scroll'}
        fill={fill}
        active={scrolling}
        onActivate={onToggleScroll}
      >
        {scrolling ? <Pause size={26} fill="currentColor" /> : <ArrowDown size={28} strokeWidth={2.5} />}
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
  // Only user-initiated collapse/expand is remembered across sessions. The idle
  // auto-collapse is transient — persisting it would make every session start as
  // a pill a few seconds after the last, even when the user wanted it open.
  const setCollapsedByUser = useCallback((v) => {
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  // The save-speed row adds a button + one gap to the expanded panel; reserve it
  // whenever the feature is wired so the panel size stays stable as it enables.
  const expandedH = EXPANDED_H + (props.showSaveSpeed ? SAVE_ROW_H + PRESENT_CONTROL_GAP : 0);
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
          className="w-full h-full rounded-2xl shadow-xl backdrop-blur-md border flex flex-col"
          style={{ background: shellBg, borderColor: shellBorder, padding: PANEL_PADDING, gap: PRESENT_CONTROL_GAP }}
        >
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
          <ControlGrid {...props} />
        </div>
      )}
    </div>
  );
}
