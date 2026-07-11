// AnnotationCanvas — transparent ink overlay for Present mode and Editor.
//
// Placement: render as a direct child of a `position: relative` container.
// The canvas element is `position: absolute; inset: 0` and auto-sizes to its
// parent via ResizeObserver. The floating tool strip is `position: fixed`.
//
// Coordinate scheme (stored per stroke):
//   nx  = pointerX / canvasWidth at capture time  (0–1, normalised)
//   y   = pointerY in canvas-space pixels (absolute from top of content element)
//   captureWidth = canvas.width at time of capture, so strokes can be rescaled
//                  if the container width changes (multiply nx by new width).
// Drift note: font-size or transpose re-layout shifts lyric positions; stored y
// coordinates do not update, so annotations drift after layout changes. Acceptable for v1.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Undo2, Trash2 } from 'lucide-react';
import { loadAnnotation, saveAnnotation, deleteAnnotation } from '../utils/annotations.js';

// Available ink colours / modes.
// 'hl' (highlighter) uses a wide semi-transparent stroke.
const INKS = [
  { id: 'red',  color: '#ef4444',               width: 3,  label: 'Red pen' },
  { id: 'blue', color: '#3b82f6',               width: 3,  label: 'Blue pen' },
  { id: 'hl',   color: 'rgba(253,224,71,0.40)', width: 22, label: 'Highlighter' },
];

// Distance from a point (px, py) to the closest point on line segment (ax,ay)–(bx,by).
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Draw a single stroke onto a 2D context.
function renderStroke(ctx, stroke, canvasWidth) {
  if (!stroke.points || stroke.points.length < 2) return;
  const ink = INKS.find(i => i.id === stroke.color) ?? INKS[0];
  ctx.save();
  ctx.strokeStyle = ink.color;
  ctx.lineWidth   = stroke.width;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].nx * canvasWidth, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].nx * canvasWidth, stroke.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

export default function AnnotationCanvas({
  songId,
  annotating,    // true = finger/pointer draws; false = pointer-events:none (pen always draws when true)
  dark,
  readOnly = false,
  onHasStrokes,  // (bool) → called when stroke count transitions empty ↔ non-empty
}) {
  const canvasRef          = useRef(null);
  const strokesRef         = useRef([]);       // persisted completed strokes
  const currentRef         = useRef(null);     // stroke currently being drawn
  const activePointersRef  = useRef(new Set()); // pointerId values currently down
  const [inkId, setInkId]  = useState('red');
  const [tool, setTool]    = useState('pen');  // 'pen' | 'eraser'
  const [clearConfirm, setClearConfirm] = useState(false);
  // Force re-render so toolbar undo button reflects stroke count changes
  const [strokeCount, setStrokeCount] = useState(0);

  // ---- helpers ---------------------------------------------------------------

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokesRef.current) renderStroke(ctx, s, canvas.width);
    if (currentRef.current) renderStroke(ctx, currentRef.current, canvas.width);
  }

  const persistStrokes = useCallback(async (strokes) => {
    if (!songId) return;
    await saveAnnotation(songId, strokes);
    const has = strokes.length > 0;
    setStrokeCount(strokes.length);
    onHasStrokes?.(has);
  }, [songId, onHasStrokes]);

  // ---- load annotation on song change ----------------------------------------

  useEffect(() => {
    strokesRef.current = [];
    currentRef.current = null;
    activePointersRef.current.clear();
    setStrokeCount(0);
    if (!songId) { redraw(); return; }
    loadAnnotation(songId).then(ann => {
      strokesRef.current = ann?.strokes ?? [];
      setStrokeCount(strokesRef.current.length);
      onHasStrokes?.(strokesRef.current.length > 0);
      redraw();
    });
  }, [songId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- size canvas to its parent ---------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    function resize() {
      const w = parent.offsetWidth;
      const h = parent.offsetHeight;
      if (canvas.width === w && canvas.height === h) return;
      canvas.width  = w;
      canvas.height = h;
      redraw();
    }

    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(parent);
    return () => obs.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- pointer event helpers -------------------------------------------------

  function canvasPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / canvasRef.current.width,
      y:   e.clientY - rect.top,
    };
  }

  function coalescedPoints(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    return (e.getCoalescedEvents?.() ?? [e]).map(ev => ({
      nx: (ev.clientX - rect.left) / canvas.width,
      y:   ev.clientY - rect.top,
    }));
  }

  // ---- pointer handlers ------------------------------------------------------

  function onPointerDown(e) {
    if (readOnly) return;
    // Pen always draws; touch/mouse draws only when annotating mode is on.
    const shouldDraw = e.pointerType === 'pen' || annotating;
    if (!shouldDraw) return;
    // Two-finger touch: don't capture — let second finger scroll (with touch-action:pan-y).
    if (e.pointerType === 'touch' && activePointersRef.current.size >= 1) return;

    activePointersRef.current.add(e.pointerId);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();

    const pt = canvasPoint(e);

    if (tool === 'eraser') {
      // Stroke-level eraser: find the closest stroke within 20 px and remove it.
      const w   = canvasRef.current.width;
      const hit = strokesRef.current.findLastIndex(stroke =>
        stroke.points.some((p, j) => {
          if (j === 0) return false;
          const prev = stroke.points[j - 1];
          return pointSegDist(
            pt.nx * w, pt.y,
            prev.nx * w, prev.y,
            p.nx * w, p.y,
          ) < 20;
        })
      );
      if (hit !== -1) {
        const updated = strokesRef.current.filter((_, i) => i !== hit);
        strokesRef.current = updated;
        redraw();
        persistStrokes(updated);
      }
      return;
    }

    const ink = INKS.find(i => i.id === inkId) ?? INKS[0];
    currentRef.current = {
      id:           crypto.randomUUID(),
      color:        inkId,
      width:        ink.width,
      tool:         inkId === 'hl' ? 'highlighter' : 'pen',
      captureWidth: canvasRef.current.width,
      points:       [pt],
    };
  }

  function onPointerMove(e) {
    if (readOnly || !currentRef.current) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    currentRef.current.points.push(...coalescedPoints(e));
    redraw();
  }

  function onPointerUp(e) {
    activePointersRef.current.delete(e.pointerId);
    if (readOnly || !currentRef.current) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const stroke = currentRef.current;
    currentRef.current = null;
    if (stroke.points.length < 2) { redraw(); return; }
    const updated = [...strokesRef.current, stroke];
    strokesRef.current = updated;
    redraw();
    persistStrokes(updated);
  }

  function onPointerCancel(e) {
    activePointersRef.current.delete(e.pointerId);
    if (currentRef.current) { currentRef.current = null; redraw(); }
  }

  // ---- toolbar actions -------------------------------------------------------

  function handleUndo() {
    if (strokesRef.current.length === 0) return;
    const updated = strokesRef.current.slice(0, -1);
    strokesRef.current = updated;
    redraw();
    persistStrokes(updated);
  }

  async function handleClear() {
    strokesRef.current = [];
    currentRef.current = null;
    redraw();
    setClearConfirm(false);
    setStrokeCount(0);
    if (songId) {
      await deleteAnnotation(songId);
      onHasStrokes?.(false);
    }
  }

  // ---- render ----------------------------------------------------------------

  return (
    <>
      {/* Ink canvas — absolute, covers its positioned parent */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          // pointer-events:none passes all input through when not drawing.
          // pen (pointerType==='pen') drawing requires annotating=true in v1;
          // always-draw-with-pen regardless of toggle can be added by keeping
          // pointer-events:auto always, but it blocks ghost taps when inactive.
          pointerEvents: annotating && !readOnly ? 'auto' : 'none',
          // pan-y: two-finger scroll still works — second touch isn't captured.
          touchAction:   annotating && !readOnly ? 'pan-y' : 'auto',
          zIndex: 15,
          cursor: tool === 'eraser' ? 'crosshair' : 'crosshair',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />

      {/* Floating tool strip — fixed at bottom-centre, only when active */}
      {annotating && !readOnly && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 rounded-2xl shadow-2xl backdrop-blur-sm ${
            dark
              ? 'bg-neutral-900/95 border border-neutral-700'
              : 'bg-white/95 border border-gray-200'
          }`}
          style={{ touchAction: 'none' }} // prevent toolbar area from triggering canvas draw
          onPointerDown={e => e.stopPropagation()} // don't let toolbar taps reach canvas
        >
          {/* Ink swatches */}
          {INKS.map(ink => {
            const active = tool === 'pen' && inkId === ink.id;
            return (
              <button
                key={ink.id}
                onClick={() => { setInkId(ink.id); setTool('pen'); }}
                title={ink.label}
                className={`flex items-center justify-center rounded-full transition-all shrink-0 ${
                  active
                    ? `ring-2 ring-offset-2 ring-indigo-500 scale-110 ${dark ? 'ring-offset-neutral-900' : 'ring-offset-white'}`
                    : 'opacity-70 hover:opacity-100 hover:scale-105'
                }`}
                style={{
                  width: 44, height: 44,
                  backgroundColor: ink.id === 'hl' ? '#fde047' : ink.color,
                  border: ink.id === 'hl' ? '2px dashed #ca8a04' : 'none',
                }}
              />
            );
          })}

          <div className={`w-px h-7 mx-0.5 ${dark ? 'bg-neutral-700' : 'bg-gray-300'}`} />

          {/* Eraser */}
          <button
            onClick={() => setTool('eraser')}
            title="Eraser — tap a stroke to remove it"
            className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
              tool === 'eraser'
                ? 'bg-indigo-600 text-white'
                : dark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Eraser size={18} />
          </button>

          {/* Undo */}
          <button
            onClick={handleUndo}
            title="Undo last stroke"
            disabled={strokeCount === 0}
            className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
              dark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Undo2 size={18} />
          </button>

          {/* Clear page (with inline confirm) */}
          {clearConfirm ? (
            <div className="flex items-center gap-1">
              <span className={`text-xs ${dark ? 'text-neutral-300' : 'text-gray-700'}`}>Clear all?</span>
              <button
                onClick={handleClear}
                className="h-9 px-2.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >Yes</button>
              <button
                onClick={() => setClearConfirm(false)}
                className={`h-9 px-2.5 text-xs font-medium rounded-lg transition-colors ${
                  dark ? 'bg-neutral-700 hover:bg-neutral-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >No</button>
            </div>
          ) : (
            <button
              onClick={() => { if (strokeCount > 0) setClearConfirm(true); }}
              title="Clear all annotations for this song"
              disabled={strokeCount === 0}
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
                dark ? 'text-neutral-400 hover:text-red-400 hover:bg-neutral-800' : 'text-gray-500 hover:text-red-500 hover:bg-gray-100'
              }`}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
