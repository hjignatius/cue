// AnnotationCanvas — transparent ink overlay for Present mode and Editor.
//
// Placement: render as a direct child of a `position: relative` container.
// The canvas element is `position: absolute; inset: 0` and auto-sizes to its
// parent via ResizeObserver. The floating tool strip is `position: fixed`.
//
// Coordinate scheme (v2 — line-anchored). Each point stores:
//   nx          = pointerX / captureWidth   (0–1, normalised to width at draw time)
//   lineIndex   = index of the lyric line the point was drawn over (data-line-index)
//   lineOffset  = pixels from that line element's top to the point at draw time
//   y           = pointerY in canvas-space pixels at draw time (v1 fallback)
// captureWidth is stored once per stroke (canvas.width at draw time).
//
// Rendering (per point):
//   screenX = nx * currentCanvasWidth
//   screenY = lineEl.offsetTop + lineOffset   when the line element still exists,
//             so ink rides its lyric line as the layout reflows (font size,
//             rotation, panel/window resize). x is unchanged from v1.
//   Fallback: v1 strokes (no lineIndex) and v2 points whose line was removed
//             (song edited) render at y * widthRatio, exactly as v1 did.
// lineOffset is intentionally NOT scaled: offsetTop already absorbs reflow, so a
// fixed within-line offset keeps the point glued to its line. Both
// PresentationView's SongBody and SongPreview tag lyric lines with
// data-line-index; see the selector note in each.
//
// Pointer-event strategy:
//   • canvas z-index 8 — below ghost overlay elements (z-index 10).
//     Ghost-area events go to ghost elements; content-area events go to canvas.
//   • pointer-events: auto always (except readOnly) so Apple Pencil (pointerType='pen')
//     reaches the canvas even when the Annotate toggle is off.
//   • touch-action: none while annotating (required on iOS to prevent browser claiming
//     the gesture as scroll before setPointerCapture can lock in the stroke).
//   • touch-action: auto when not annotating: canvas sees the event but doesn't capture
//     it for touch/mouse → browser scrolls the overflow container naturally.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Undo2, Trash2 } from 'lucide-react';
import { loadAnnotation, saveAnnotation, deleteAnnotation, flushAnnotationQueue } from '../utils/annotations.js';

// Available ink colours / modes.
const INKS = [
  { id: 'red',  color: '#ef4444',               width: 3,  label: 'Red pen' },
  { id: 'blue', color: '#3b82f6',               width: 3,  label: 'Blue pen' },
  { id: 'hl',   color: 'rgba(253,224,71,0.40)', width: 22, label: 'Highlighter' },
];

// Distance from point (px, py) to segment (ax,ay)–(bx,by).
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ---- Line-anchored coordinates (scheme v2) ---------------------------------
// Lyric-line elements are tagged with data-line-index in both PresentationView's
// SongBody and SongPreview (i = index into the shared parsed lines array). The
// canvas finds them within its own positioned parent, which is the nearest
// positioned ancestor of those elements, so element.offsetTop is the y in the
// canvas's coordinate space.

// Ordered lyric-line elements under the canvas's positioned parent.
function lineEls(canvas) {
  return canvas?.parentElement
    ? [...canvas.parentElement.querySelectorAll('[data-line-index]')]
    : [];
}

// lineIndex → element, for the current layout.
function buildLineMap(canvas) {
  const map = new Map();
  for (const el of lineEls(canvas)) map.set(Number(el.dataset.lineIndex), el);
  return map;
}

// Nearest line anchor for a canvas-space y: the line whose box contains y, else
// the closest one. Returns { lineIndex, lineOffset } or null when no lines exist.
function anchorForY(els, y) {
  let best = null, bestDist = Infinity;
  for (const el of els) {
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    const dist = y < top ? top - y : y > bottom ? y - bottom : 0;
    if (dist < bestDist) { bestDist = dist; best = el; }
  }
  return best ? { lineIndex: Number(best.dataset.lineIndex), lineOffset: y - best.offsetTop } : null;
}

// Resolve a stored point to a current canvas-space y. v2 points ride their line;
// v1 points — and v2 points whose line no longer exists — fall back to the
// stored absolute y scaled by widthRatio, exactly as v1 rendered.
function resolvePointY(point, ratio, lineMap) {
  if (point.lineIndex != null && lineMap) {
    const el = lineMap.get(point.lineIndex);
    if (el) return el.offsetTop + (point.lineOffset ?? 0);
  }
  return point.y * ratio;
}

// Render one stroke. x scales by widthRatio; y is resolved per point.
function renderStroke(ctx, stroke, canvasWidth, lineMap) {
  if (!stroke.points || stroke.points.length < 2) return;
  const ink = INKS.find(i => i.id === stroke.color) ?? INKS[0];
  const ratio = stroke.captureWidth > 0 ? canvasWidth / stroke.captureWidth : 1;
  ctx.save();
  ctx.strokeStyle = ink.color;
  ctx.lineWidth   = stroke.width;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  const p0 = stroke.points[0];
  ctx.moveTo(p0.nx * canvasWidth, resolvePointY(p0, ratio, lineMap));
  for (let i = 1; i < stroke.points.length; i++) {
    const p = stroke.points[i];
    ctx.lineTo(p.nx * canvasWidth, resolvePointY(p, ratio, lineMap));
  }
  ctx.stroke();
  ctx.restore();
}

export default function AnnotationCanvas({
  songId,
  annotating,   // true = finger/mouse/pen draws; false = only pen draws
  dark,
  readOnly = false,
  onHasStrokes, // (bool) → called when stroke count transitions empty ↔ non-empty
}) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);      // completed, persisted strokes
  const currentRef = useRef(null);   // stroke currently being drawn

  // FIX 1: Track the pointerId that owns the current stroke. Any other pointer
  // arriving while this is non-null is treated as a multi-touch event: the
  // in-progress stroke is discarded and drawing state is reset cleanly.
  const activeStrokePointerIdRef = useRef(null);

  const [inkId, setInkId]   = useState('red');
  const [tool, setTool]     = useState('pen');   // 'pen' | 'eraser'
  const [clearConfirm, setClearConfirm] = useState(false);
  // Drive toolbar undo button enabled/disabled state without storing strokes in state.
  const [strokeCount, setStrokeCount]   = useState(0);

  // Ref so flush effects can read the current songId after potential unmount.
  const songIdRef = useRef(songId);
  useEffect(() => { songIdRef.current = songId; }, [songId]);

  // Flush write queue on unmount and tab-hide so fast exits (navigate away,
  // close tab, iOS home-button) don't drop the last in-flight mutation.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        flushAnnotationQueue(songIdRef.current).catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      flushAnnotationQueue(songIdRef.current).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- helpers ---------------------------------------------------------------

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const lineMap = buildLineMap(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokesRef.current) renderStroke(ctx, s, canvas.width, lineMap);
    if (currentRef.current) renderStroke(ctx, currentRef.current, canvas.width, lineMap);
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
    activeStrokePointerIdRef.current = null;
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

  // ---- pointer helpers -------------------------------------------------------

  function canvasPoint(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return { nx: (e.clientX - rect.left) / canvas.width, y, ...(anchorForY(lineEls(canvas), y) || {}) };
  }

  function coalescedPoints(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const els    = lineEls(canvas); // query once per move; reuse for all coalesced points
    return (e.getCoalescedEvents?.() ?? [e]).map(ev => {
      const y = ev.clientY - rect.top;
      return { nx: (ev.clientX - rect.left) / canvas.width, y, ...(anchorForY(els, y) || {}) };
    });
  }

  // ---- pointer handlers ------------------------------------------------------

  function onPointerDown(e) {
    if (readOnly) return;

    // FIX 2: Pen (Apple Pencil / stylus) always draws regardless of the Annotate
    // toggle. Touch and mouse only draw when annotating is on.
    const shouldDraw = e.pointerType === 'pen' || annotating;
    if (!shouldDraw) return;

    // FIX 1: A second pointer arrived while a stroke is active → multi-touch.
    // Discard the in-progress stroke (do not save) and reset drawing state.
    // The next single-finger/pen down will start a fresh stroke.
    if (activeStrokePointerIdRef.current !== null) {
      currentRef.current = null;
      activeStrokePointerIdRef.current = null;
      redraw();
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    activeStrokePointerIdRef.current = e.pointerId;

    const pt = canvasPoint(e);

    if (tool === 'eraser') {
      // Stroke-level eraser: find the closest stroke within 20 px. Resolve each
      // stored point to its current canvas position (line-anchored, same as the
      // renderer) before the distance test so hits land where the ink is drawn.
      const w   = canvasRef.current.width;
      const lineMap = buildLineMap(canvasRef.current);
      const hit = strokesRef.current.findLastIndex(stroke => {
        const ratio = stroke.captureWidth > 0 ? w / stroke.captureWidth : 1;
        return stroke.points.some((p, j) => {
          if (j === 0) return false;
          const prev = stroke.points[j - 1];
          return pointSegDist(
            pt.nx * w,       pt.y,
            prev.nx * w,     resolvePointY(prev, ratio, lineMap),
            p.nx * w,        resolvePointY(p, ratio, lineMap),
          ) < 20;
        });
      });
      if (hit !== -1) {
        const updated = strokesRef.current.filter((_, i) => i !== hit);
        strokesRef.current = updated;
        redraw();
        persistStrokes(updated);
      }
      // currentRef stays null for eraser; onPointerUp detects this and returns early.
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
    // Only respond to the pointer that owns the current stroke (FIX 1).
    if (e.pointerId !== activeStrokePointerIdRef.current) return;
    if (readOnly || !currentRef.current) return;
    currentRef.current.points.push(...coalescedPoints(e));
    redraw();
  }

  function onPointerUp(e) {
    if (e.pointerId !== activeStrokePointerIdRef.current) return;
    activeStrokePointerIdRef.current = null;
    if (readOnly || !currentRef.current) return;
    const stroke = currentRef.current;
    currentRef.current = null;
    if (stroke.points.length < 2) { redraw(); return; }
    const updated = [...strokesRef.current, stroke];
    strokesRef.current = updated;
    redraw();
    persistStrokes(updated);
  }

  function onPointerCancel(e) {
    if (e.pointerId !== activeStrokePointerIdRef.current) return;
    activeStrokePointerIdRef.current = null;
    currentRef.current = null;
    redraw();
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
    activeStrokePointerIdRef.current = null;
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
      {/* Ink canvas — absolute, covers its positioned parent.
          z-index 8 keeps it below ghost overlay elements (z-index 10) so ghost
          taps still fire in edge zones when annotating is off. Canvas remains
          pointer-events:auto so Apple Pencil events reach it even when the
          Annotate toggle is off. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          pointerEvents: readOnly ? 'none' : 'auto',
          // touch-action:none is required on iOS: pan-y lets the browser claim
          // the gesture as scroll and fire pointercancel before the stroke locks
          // in. When not annotating, auto lets touch scroll the container.
          touchAction: annotating && !readOnly ? 'none' : 'auto',
          zIndex: 8,
          cursor: 'crosshair',
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
          style={{ touchAction: 'none' }}
          onPointerDown={e => e.stopPropagation()}
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
