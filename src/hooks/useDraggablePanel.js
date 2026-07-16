import { useCallback, useEffect, useRef, useState } from 'react';

// A pointer that travels further than this is a drag, not a tap, so a tap on a
// button is never misread as a drag of the panel.
export const DRAG_THRESHOLD_PX = 10;

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function loadPos(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null;
  } catch { return null; }
}

function savePos(key, pos) {
  try { localStorage.setItem(key, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) })); }
  catch { /* quota / private mode — position just won't persist */ }
}

/**
 * Draggable, viewport-clamped, position-persisted floating panel.
 *
 * Generalises the pattern already used by the YouTube mini-player (pointer drag,
 * clamp to viewport, re-clamp on resize, persist to localStorage) and adds a
 * tap-vs-drag threshold plus a minimum edge margin.
 *
 * Drag may begin anywhere on the panel — including on a button — because motion
 * under the threshold is ignored and the click that follows a real drag is
 * suppressed via onClickCapture. That keeps the whole surface grabbable without
 * buttons firing by accident.
 *
 * @param {string}   storageKey  localStorage key holding { x, y }
 * @param {number}   width       current panel width  (re-clamps when it changes)
 * @param {number}   height      current panel height (re-clamps when it changes)
 * @param {number}   margin      minimum gap from every viewport edge
 * @param {Function} defaultPos  ({ vw, vh, width, height, margin }) => ({ x, y })
 */
export function useDraggablePanel({ storageKey, width, height, margin = 0, defaultPos }) {
  const [pos, setPos]           = useState(null); // null until first measure
  const [dragging, setDragging] = useState(false);

  const draggedRef = useRef(false); // exceeded the threshold this gesture?
  const posRef     = useRef(null);
  const sizeRef    = useRef({ width, height });
  sizeRef.current  = { width, height };
  const defaultRef = useRef(defaultPos);
  defaultRef.current = defaultPos;

  const clampPos = useCallback((p) => {
    const { width: w, height: h } = sizeRef.current;
    // Math.max guards the case where the panel is larger than the viewport:
    // margin wins over a negative upper bound.
    const maxX = Math.max(margin, window.innerWidth  - w - margin);
    const maxY = Math.max(margin, window.innerHeight - h - margin);
    return { x: clamp(p.x, margin, maxX), y: clamp(p.y, margin, maxY) };
  }, [margin]);

  const apply = useCallback((p) => { posRef.current = p; setPos(p); }, []);

  // Initial position: persisted if present, else the caller's default. Clamped
  // either way, so a stored position from a larger window still lands on-screen.
  useEffect(() => {
    const { width: w, height: h } = sizeRef.current;
    const base = loadPos(storageKey)
      ?? defaultRef.current({ vw: window.innerWidth, vh: window.innerHeight, width: w, height: h, margin });
    apply(clampPos(base));
  }, [storageKey, margin, apply, clampPos]);

  // Re-clamp when the panel resizes (collapse/expand) so it can't hang off-edge.
  useEffect(() => {
    if (posRef.current) apply(clampPos(posRef.current));
  }, [width, height, apply, clampPos]);

  // Re-clamp on resize and rotation.
  useEffect(() => {
    function reclamp() { if (posRef.current) apply(clampPos(posRef.current)); }
    window.addEventListener('resize', reclamp);
    window.addEventListener('orientationchange', reclamp);
    return () => {
      window.removeEventListener('resize', reclamp);
      window.removeEventListener('orientationchange', reclamp);
    };
  }, [apply, clampPos]);

  // Listeners are attached imperatively rather than in an effect keyed on
  // `dragging`, so a fast flick can't slip through before the effect runs.
  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!posRef.current) return;

    draggedRef.current = false;
    const start = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y };
    setDragging(true);

    function onMove(ev) {
      const dx = ev.clientX - start.sx;
      const dy = ev.clientY - start.sy;
      if (!draggedRef.current) {
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
        draggedRef.current = true;
      }
      apply(clampPos({ x: start.ox + dx, y: start.oy + dy }));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDragging(false);
      if (draggedRef.current && posRef.current) savePos(storageKey, posRef.current);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [apply, clampPos, storageKey]);

  // Swallow the click a real drag generates, so releasing over a button after
  // repositioning never triggers it. Reset here and on the next pointerdown.
  const onClickCapture = useCallback((e) => {
    if (!draggedRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    draggedRef.current = false;
  }, []);

  return { pos, dragging, onPointerDown, onClickCapture };
}
