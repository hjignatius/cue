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
 * @param {'left'|'right'} anchorX  which horizontal edge stays put when the width
 *   changes (collapse/expand). 'left' (default) keeps the top-left fixed; 'right'
 *   keeps the right edge fixed, so a panel that shrinks collapses toward its
 *   right corner instead of its left.
 */
export function useDraggablePanel({ storageKey, width, height, margin = 0, defaultPos, anchorX = 'left' }) {
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
    const vw = window.innerWidth, vh = window.innerHeight;
    // The margin is a preference, not a floor. Holding y at `margin` when the
    // panel is taller than (viewport - margin) pushes its far edge off-screen for
    // no gain: a phone in landscape is ~402px, so a 390px panel held 16px down
    // lost the bottom 4px — and the bottom of the Present panel is the Save row.
    // Give the margin up only as far as needed, so a panel that fits keeps it.
    const lowX = Math.min(margin, Math.max(0, vw - w));
    const lowY = Math.min(margin, Math.max(0, vh - h));
    // Math.max guards the case where the panel is larger than the viewport even
    // at zero margin: the lower bound wins over a negative upper one.
    const maxX = Math.max(lowX, vw - w - margin);
    const maxY = Math.max(lowY, vh - h - margin);
    return { x: clamp(p.x, lowX, maxX), y: clamp(p.y, lowY, maxY) };
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
  // With anchorX 'right', shift x by the width change first so the right edge —
  // not the left — stays put; the pill then collapses toward the right corner.
  const prevWidthRef = useRef(width);
  useEffect(() => {
    if (posRef.current) {
      let p = posRef.current;
      if (anchorX === 'right') {
        p = { x: p.x + (prevWidthRef.current - width), y: p.y };
      }
      apply(clampPos(p));
    }
    prevWidthRef.current = width;
  }, [width, height, apply, clampPos, anchorX]);

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
