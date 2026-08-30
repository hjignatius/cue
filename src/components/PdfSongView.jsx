import { useEffect, useRef, useState } from 'react';
import { FileWarning } from 'lucide-react';
import { loadPdfjs } from '../utils/pdfjs.js';
import { loadPdfBlob } from '../utils/storage.js';
import { downloadPdfBlob } from '../lib/pdfSync.js';
import { useAuth } from '../context/AuthContext.jsx';

// Renders ONE PDF page fit to the container WIDTH (not continuous scroll) at
// scale × devicePixelRatio for retina crispness. CONTROLLED: the parent owns the
// current `page` (1-based) and learns the page count via onReady(numPages).
//
// FAIL SOFT: a missing blob or a load/render error shows a clear placeholder and
// never throws into Present mode. Tap zones (left = previous, right = next) call
// the parent so page-turn stays unified with the pedal/keyboard handler.
export default function PdfSongView({ songId, page, onReady, onTapPrev, onTapNext, dark }) {
  const { user } = useAuth();
  const wrapRef   = useRef(null);
  const canvasRef = useRef(null);
  const docRef    = useRef(null);
  const taskRef   = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | missing | error
  const [renderTick, setRenderTick] = useState(0);  // bump to re-render on resize
  const [reloadKey, setReloadKey] = useState(0);    // bump to re-run the load
  const [retrying, setRetrying]   = useState(false);

  // Retry a missing download: pull the bytes from cloud (owner-only), then reload.
  // A musician who pulled a set before losing wifi can recover it here rather than
  // being stuck on the placeholder. No-op if not signed in (no owner to fetch as).
  async function retryDownload() {
    if (!user?.id || retrying) return;
    setRetrying(true);
    try {
      await downloadPdfBlob(songId, user.id);
      setReloadKey(k => k + 1);
    } catch (err) {
      console.error('[PdfSongView] retry download failed', err);
    } finally {
      setRetrying(false);
    }
  }

  // Load the document for this song.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    docRef.current = null;
    (async () => {
      try {
        const blob = await loadPdfBlob(songId);
        if (cancelled) return;
        if (!blob) { setStatus('missing'); return; }
        const pdfjs = await loadPdfjs();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) { try { doc.destroy(); } catch { /* ignore */ } return; }
        docRef.current = doc;
        onReady?.(doc.numPages);
        setStatus('ready');
      } catch (err) {
        console.error('[PdfSongView] failed to load PDF', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      try { taskRef.current?.cancel(); } catch { /* ignore */ }
      try { docRef.current?.destroy(); } catch { /* ignore */ }
    };
  }, [songId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render on container resize (rotation / window resize).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRenderTick(t => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render the current page fit-to-width.
  useEffect(() => {
    if (status !== 'ready') return;
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!doc || !canvas || !wrap) return;
    let cancelled = false;
    (async () => {
      try {
        const pageNum = Math.max(1, Math.min(doc.numPages, page || 1));
        const pdfPage = await doc.getPage(pageNum);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const cssWidth  = wrap.clientWidth;
        const cssHeight = wrap.clientHeight;
        const base = pdfPage.getViewport({ scale: 1 });
        // Full Page mode: fit the WHOLE page inside the area (min of width- and
        // height-fit) so a tall page is never clipped — the entire page shows.
        const fit = Math.min(cssWidth / base.width, cssHeight / base.height);
        const viewport = pdfPage.getViewport({ scale: fit * dpr });
        canvas.width  = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width  = Math.floor(viewport.width / dpr) + 'px';
        canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
        try { taskRef.current?.cancel(); } catch { /* ignore */ }
        const task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport });
        taskRef.current = task;
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('[PdfSongView] render failed', err);
        }
      }
    })();
    return () => { cancelled = true; try { taskRef.current?.cancel(); } catch { /* ignore */ } };
  }, [status, page, renderTick]);

  const muted = dark ? 'text-gray-400' : 'text-gray-500';

  if (status === 'missing' || status === 'error') {
    return (
      <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center p-8">
        <div className={`text-center max-w-sm ${muted}`}>
          <FileWarning size={40} className="mx-auto mb-3 opacity-60" />
          <p className="text-base font-medium">
            {status === 'missing' ? 'PDF not available on this device' : "Couldn't open this PDF"}
          </p>
          <p className="text-sm mt-1">
            {status === 'missing'
              ? 'The lead sheet is stored in the cloud and has not downloaded to this device yet.'
              : 'The file may be damaged. Try re-importing it in the editor.'}
          </p>
          {status === 'missing' && user?.id && (
            <button
              type="button"
              onClick={retryDownload}
              disabled={retrying}
              className={`mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'} disabled:opacity-50`}
            >
              {retrying ? 'Downloading…' : 'Retry download'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden flex items-start justify-center">
      {/* The page canvas, fit whole to the screen. data-page lets a page-anchored
          ink overlay locate it and map strokes to this exact page. */}
      <canvas ref={canvasRef} data-page={Math.max(1, Math.min(page || 1, 9999))} className="block" />
      {status === 'loading' && (
        <div className={`absolute inset-0 flex items-center justify-center text-sm ${muted}`}>Loading…</div>
      )}
      {/* Tap zones: left third = previous page, right two-thirds = next page.
          They call the parent so page-turn is unified with the pedal handler. */}
      <button
        type="button" aria-label="Previous page" tabIndex={-1}
        onClick={onTapPrev}
        className="absolute inset-y-0 left-0 w-1/3"
        style={{ background: 'transparent' }}
      />
      <button
        type="button" aria-label="Next page" tabIndex={-1}
        onClick={onTapNext}
        className="absolute inset-y-0 right-0 w-2/3"
        style={{ background: 'transparent' }}
      />
    </div>
  );
}
