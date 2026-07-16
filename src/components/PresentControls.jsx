import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ChevronDown, ChevronUp, Pause } from 'lucide-react';
import { useDraggablePanel } from '../hooks/useDraggablePanel.js';

// ---- Tunables ---------------------------------------------------------------

export const PRESENT_CONTROL_BUTTON_SIZE   = 64;   // px diameter — large on purpose
export const PRESENT_CONTROL_GAP           = 12;
export const PRESENT_CONTROL_IDLE_OPACITY  = 0.35;
// Collapsing is the only way to hide the panel, so the pill is the sole way back
// to the controls. It fades to its own higher floor than the expanded panel — at
// 64px on a bright stage, 0.35 is easy to lose.
export const PRESENT_CONTROL_PILL_IDLE_OPACITY = 0.55;
export const PRESENT_CONTROL_IDLE_DELAY_MS = 4000;
export const PRESENT_CONTROL_EDGE_MARGIN   = 16;   // min gap from any viewport edge

// Button fills. The reference value is the Night one: a translucent grey circle
// reads well against a dark background. Day inverts to a darker fill so the white
// glyph keeps its contrast against a light page.
export const PRESENT_CONTROL_FILL_NIGHT = 'rgba(140,140,140,0.55)';
export const PRESENT_CONTROL_FILL_DAY   = 'rgba(70,70,70,0.55)';
export const PRESENT_CONTROL_FILL_ACTIVE = 'rgba(79,70,229,0.85)'; // indigo-600

const PANEL_PADDING     = 12;
const HANDLE_H          = 24;
const DISABLED_OPACITY  = 0.3;
const FLASH_MS          = 180;

const GRID_W = PRESENT_CONTROL_BUTTON_SIZE * 2 + PRESENT_CONTROL_GAP;
const GRID_H = PRESENT_CONTROL_BUTTON_SIZE * 3 + PRESENT_CONTROL_GAP * 2;

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

function TriangleLeft({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M16 4.5 L16 19.5 L5.5 12 Z" fill="currentColor" />
    </svg>
  );
}

function TriangleRight({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 4.5 L8 19.5 L18.5 12 Z" fill="currentColor" />
    </svg>
  );
}

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

// ---- Round button -----------------------------------------------------------

// aria-disabled rather than the `disabled` attribute: disabled form controls
// swallow pointer events in Safari/Chrome, which would create dead patches the
// panel could not be dragged from. The handler is omitted, so it is a true no-op.
function RoundButton({ label, onActivate, disabled = false, active = false, fill, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onActivate}
      className="flex items-center justify-center rounded-full text-white select-none transition-transform active:scale-95"
      style={{
        width: PRESENT_CONTROL_BUTTON_SIZE,
        height: PRESENT_CONTROL_BUTTON_SIZE,
        background: active ? PRESENT_CONTROL_FILL_ACTIVE : fill,
        opacity: disabled ? DISABLED_OPACITY : 1,
        cursor: disabled ? 'default' : 'pointer',
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
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
  onCountIn, canCountIn,
  onToggleScroll, scrolling,
}) {
  const fill = dark ? PRESENT_CONTROL_FILL_NIGHT : PRESENT_CONTROL_FILL_DAY;

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
    <div className="grid grid-cols-2" style={{ gap: PRESENT_CONTROL_GAP }}>
      <RoundButton label="Smaller text" fill={fill} disabled={!canSmaller} onActivate={onSmaller}>
        <Glyph>A−</Glyph>
      </RoundButton>
      <RoundButton label="Larger text" fill={fill} disabled={!canLarger} onActivate={onLarger}>
        <Glyph>A+</Glyph>
      </RoundButton>

      <RoundButton label="Previous song" fill={fill} disabled={!canPrev} onActivate={onPrev}>
        <TriangleLeft />
      </RoundButton>
      <RoundButton label="Next song" fill={fill} disabled={!canNext} onActivate={onNext}>
        <TriangleRight />
      </RoundButton>

      <RoundButton label="Count-in" fill={fill} disabled={!canCountIn} active={flash} onActivate={handleCountIn}>
        <MetronomeIcon />
      </RoundButton>
      <RoundButton
        label={scrolling ? 'Pause auto-scroll' : 'Start auto-scroll'}
        fill={fill}
        active={scrolling}
        onActivate={onToggleScroll}
      >
        {scrolling ? <Pause size={26} fill="currentColor" /> : <ArrowDown size={28} strokeWidth={2.5} />}
      </RoundButton>
    </div>
  );
}

// ---- Floating shell ---------------------------------------------------------

export default function PresentControls(props) {
  const { dark } = props;

  const [collapsed, setCollapsed] = useState(loadCollapsed);
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const width  = collapsed ? COLLAPSED_W : EXPANDED_W;
  const height = collapsed ? COLLAPSED_H : EXPANDED_H;

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
  });

  // Idle fade. Any pointerdown anywhere in Present restores full opacity; the
  // listener is capture-phase so a handler that stops propagation cannot hide it.
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(null);
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), PRESENT_CONTROL_IDLE_DELAY_MS);
  }, []);
  useEffect(() => {
    wake();
    window.addEventListener('pointerdown', wake, true);
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      clearTimeout(idleTimer.current);
    };
  }, [wake]);

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
          onClick={() => setCollapsed(false)}
          className="w-full h-full rounded-full flex items-center justify-center shadow-xl backdrop-blur-md border"
          style={{ background: shellBg, borderColor: shellBorder, color: handleTint, touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
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
            onClick={() => setCollapsed(true)}
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
