// PdfAnnotationCanvas — page-anchored ink overlay for PDF songs in Present.
//
// WHY separate from AnnotationCanvas: a text song is one continuous column, so
// that canvas anchors ink to the column (nx + absolute y). A PDF is drawn TWO
// different ways — fit-to-width in scroll mode, fit-whole-page (centred) in Full
// Page mode — so screen-anchored ink drifts when you switch. Here every stroke is
// tied to a PAGE and stored normalised (0..1) within that page's box, then mapped
// back to wherever that page is currently drawn. Same ink, both layouts.
//
// Placement: render as a child of a `position: relative` container that ALSO
// contains the page canvases tagged `data-page="N"` (PdfPageStack in scroll mode,
// PdfSongView in Full Page mode). The overlay sizes to that parent and locates
// each page by querying `canvas[data-page]` beneath it.
//
// Pointer strategy: the overlay is pointer-transparent (pointerEvents:none) unless
// annotating, so page tap-zones and scrolling work when you're not drawing; the
// ink still shows at all times. While annotating it captures (touchAction:none on
// iOS) and draws.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Undo2, Trash2 } from 'lucide-react';
import { loadAnnotation, saveAnnotation, deleteAnnotation, flushAnnotationQueue } from '../utils/annotations.js';

const INKS = [
  { id: 'red',  color: '#ef4444',               width: 3,  label: 'Red pen' },
  { id: 'blue', color: '#3b82f6',               width: 3,  label: 'Blue pen' },
  { id: 'hl',   color: 'rgba(253,224,71,0.40)', width: 22, label: 'Highlighter' },
];

// Distance from point (px,py) to segment (ax,ay)-(bx,by), in screen px.
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export default function PdfAnnotationCanvas({ songId, annotating, dark, page, onHasStrokes }) {
  const canvasRef  = useRef(null);
  const strokesRef = useRef([]);      // persisted strokes: { id,color,width,page,capW,points:[{x,y}] }
  const currentRef = useRef(null);    // in-progress stroke
  const activePointerRef = useRef(null);
  const activePageElRef  = useRef(null); // page canvas the current stroke is on

  const [inkId, setInkId] = useState('red');
  const [tool, setTool]   = useState('pen');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [strokeCount, setStrokeCount]   = useState(0);

  const songIdRef = useRef(songId);
  useEffect(() => { songIdRef.current = songId; }, [songId]);

  // Flush queued writes on unmount / tab-hide so a fast exit never drops ink.
  useEffect(() => {
    function onVis() { if (document.visibilityState === 'hidden') flushAnnotationQueue(songIdRef.current).catch(() => {}); }
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); flushAnnotationQueue(songIdRef.current).catch(() => {}); };
  }, []);

  // ---- page geometry ---------------------------------------------------------

  // Every page canvas rendered under our parent, by page number.
  function pageEl(n) {
    return canvasRef.current?.parentElement?.querySelector(`canvas[data-page="${n}"]`) || null;
  }
  // A page's box in OUR canvas pixels (= CSS px, since we size 1:1). null when the
  // page isn't currently drawn (e.g. Full Page mode shows only the current page).
  function pageBox(n) {
    const el = pageEl(n);
    const canvas = canvasRef.current;
    if (!el || !canvas) return null;
    const cr = canvas.getBoundingClientRect();
    const r  = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { left: r.left - cr.left, top: r.top - cr.top, width: r.width, height: r.height };
  }
  // Which page canvas is under a client point, if any.
  function pageAtPoint(clientX, clientY) {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return null;
    for (const el of parent.querySelectorAll('canvas[data-page]')) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return el;
    }
    return null;
  }

  // ---- render ----------------------------------------------------------------

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const all = currentRef.current ? [...strokesRef.current, currentRef.current] : strokesRef.current;
    for (const s of all) {
      if (!s.points || s.points.length < 2) continue;
      const box = pageBox(s.page);
      if (!box) continue; // page not visible in this mode → its ink is hidden
      const ink = INKS.find(i => i.id === s.color) ?? INKS[0];
      const ratio = s.capW ? box.width / s.capW : 1; // keep thickness proportional
      ctx.save();
      ctx.strokeStyle = ink.color;
      ctx.lineWidth = Math.max(1, s.width * ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(box.left + s.points[0].x * box.width, box.top + s.points[0].y * box.height);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(box.left + s.points[i].x * box.width, box.top + s.points[i].y * box.height);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  const persist = useCallback(async (strokes) => {
    if (!songId) return;
    await saveAnnotation(songId, strokes);
    setStrokeCount(strokes.length);
    onHasStrokes?.(strokes.length > 0);
  }, [songId, onHasStrokes]);

  // Load strokes on song change.
  useEffect(() => {
    strokesRef.current = [];
    currentRef.current = null;
    activePointerRef.current = null;
    setStrokeCount(0);
    if (!songId) { redraw(); return; }
    loadAnnotation(songId).then(ann => {
      strokesRef.current = ann?.strokes ?? [];
      setStrokeCount(strokesRef.current.length);
      onHasStrokes?.(strokesRef.current.length > 0);
      redraw();
    });
  }, [songId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the overlay sized to its parent AND redraw whenever a page canvas
  // appears or changes size. The PDF pages render asynchronously and Full Page
  // swaps the visible page's size, so watching only the parent (whose size never
  // changes) would leave ink mapped to a stale page box. We watch: the parent's
  // size, every page canvas's size, and DOM/attribute changes (new pages, a page
  // canvas re-styled on render, data-page swapped in Full Page).
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;
    function sync() {
      const w = parent.offsetWidth, h = parent.offsetHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      redraw();
    }
    const roParent = new ResizeObserver(sync);
    roParent.observe(parent);
    const roPages = new ResizeObserver(sync);
    const observePages = () => parent.querySelectorAll('canvas[data-page]').forEach(el => roPages.observe(el));
    observePages();
    const mo = new MutationObserver(() => { observePages(); sync(); });
    mo.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-page', 'style', 'width', 'height'] });
    sync();
    return () => { roParent.disconnect(); roPages.disconnect(); mo.disconnect(); };
  }, [redraw]);

  // Full Page mode swaps which page is on screen (same canvas element, new
  // data-page); redraw so the new page's ink shows and the old page's hides.
  useEffect(() => { redraw(); }, [page, redraw]);

  // ---- pointer handlers ------------------------------------------------------

  function onPointerDown(e) {
    if (!annotating) return;
    if (activePointerRef.current !== null) { // second finger → discard in-progress
      currentRef.current = null; activePointerRef.current = null; redraw(); return;
    }
    const hit = pageAtPoint(e.clientX, e.clientY);
    if (!hit) return; // drew in the letterbox margin, not on a page
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    activePointerRef.current = e.pointerId;
    activePageElRef.current  = hit;
    const pageNum = Number(hit.getAttribute('data-page'));
    const r = hit.getBoundingClientRect();

    if (tool === 'eraser') {
      const hitIdx = strokesRef.current.findLastIndex(s => {
        if (s.page !== pageNum) return false;
        const box = pageBox(s.page); if (!box) return false;
        const canvas = canvasRef.current.getBoundingClientRect();
        const px = e.clientX - canvas.left, py = e.clientY - canvas.top;
        return s.points.some((p, j) => {
          if (j === 0) return false;
          const a = s.points[j - 1];
          return pointSegDist(
            px, py,
            box.left + a.x * box.width, box.top + a.y * box.height,
            box.left + p.x * box.width, box.top + p.y * box.height,
          ) < 20;
        });
      });
      if (hitIdx !== -1) {
        const updated = strokesRef.current.filter((_, i) => i !== hitIdx);
        strokesRef.current = updated; redraw(); persist(updated);
      }
      return;
    }

    const ink = INKS.find(i => i.id === inkId) ?? INKS[0];
    currentRef.current = {
      id: crypto.randomUUID(), color: inkId, width: ink.width,
      page: pageNum, capW: r.width,
      points: [{ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }],
    };
  }

  function onPointerMove(e) {
    if (e.pointerId !== activePointerRef.current || !currentRef.current) return;
    const el = activePageElRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const evs = e.getCoalescedEvents?.() ?? [e];
    for (const ev of evs) {
      currentRef.current.points.push({ x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height });
    }
    redraw();
  }

  function onPointerUp(e) {
    if (e.pointerId !== activePointerRef.current) return;
    activePointerRef.current = null;
    const stroke = currentRef.current;
    currentRef.current = null;
    activePageElRef.current = null;
    if (!stroke || stroke.points.length < 2) { redraw(); return; }
    const updated = [...strokesRef.current, stroke];
    strokesRef.current = updated; redraw(); persist(updated);
  }

  function onPointerCancel(e) {
    if (e.pointerId !== activePointerRef.current) return;
    activePointerRef.current = null; currentRef.current = null; activePageElRef.current = null; redraw();
  }

  // ---- toolbar ---------------------------------------------------------------

  function handleUndo() {
    if (!strokesRef.current.length) return;
    const updated = strokesRef.current.slice(0, -1);
    strokesRef.current = updated; redraw(); persist(updated);
  }
  async function handleClear() {
    strokesRef.current = []; currentRef.current = null; activePointerRef.current = null;
    redraw(); setClearConfirm(false); setStrokeCount(0);
    if (songId) { await deleteAnnotation(songId); onHasStrokes?.(false); }
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          pointerEvents: annotating ? 'auto' : 'none',
          touchAction: annotating ? 'none' : 'auto',
          zIndex: 8,
          cursor: 'crosshair',
          WebkitTapHighlightColor: 'transparent',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />

      {annotating && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 rounded-2xl shadow-2xl backdrop-blur-sm ${
            dark ? 'bg-neutral-900/95 border border-neutral-700' : 'bg-white/95 border border-gray-200'
          }`}
          style={{ touchAction: 'none' }}
          onPointerDown={e => e.stopPropagation()}
        >
          {INKS.map(ink => {
            const active = tool === 'pen' && inkId === ink.id;
            return (
              <button
                key={ink.id}
                onClick={() => { setInkId(ink.id); setTool('pen'); }}
                title={ink.label}
                className={`flex items-center justify-center rounded-full transition-all shrink-0 ${
                  active ? `ring-2 ring-offset-2 ring-indigo-500 scale-110 ${dark ? 'ring-offset-neutral-900' : 'ring-offset-white'}` : 'opacity-70 hover:opacity-100 hover:scale-105'
                }`}
                style={{ width: 44, height: 44, backgroundColor: ink.id === 'hl' ? '#fde047' : ink.color, border: ink.id === 'hl' ? '2px dashed #ca8a04' : 'none' }}
              />
            );
          })}
          <div className={`w-px h-7 mx-0.5 ${dark ? 'bg-neutral-700' : 'bg-gray-300'}`} />
          <button
            onClick={() => setTool('eraser')}
            title="Eraser — tap a stroke to remove it"
            className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${tool === 'eraser' ? 'bg-indigo-600 text-white' : dark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
          >
            <Eraser size={18} />
          </button>
          <button
            onClick={handleUndo}
            title="Undo last stroke"
            disabled={strokeCount === 0}
            className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${dark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
          >
            <Undo2 size={18} />
          </button>
          {clearConfirm ? (
            <div className="flex items-center gap-1">
              <span className={`text-xs ${dark ? 'text-neutral-300' : 'text-gray-700'}`}>Clear all?</span>
              <button onClick={handleClear} className="h-9 px-2.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">Yes</button>
              <button onClick={() => setClearConfirm(false)} className={`h-9 px-2.5 text-xs font-medium rounded-lg transition-colors ${dark ? 'bg-neutral-700 hover:bg-neutral-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>No</button>
            </div>
          ) : (
            <button
              onClick={() => { if (strokeCount > 0) setClearConfirm(true); }}
              title="Clear all annotations for this song"
              disabled={strokeCount === 0}
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${dark ? 'text-neutral-400 hover:text-red-400 hover:bg-neutral-800' : 'text-gray-500 hover:text-red-500 hover:bg-gray-100'}`}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
