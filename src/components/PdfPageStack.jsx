import { useEffect, useRef, useState } from 'react';
import { FileWarning } from 'lucide-react';
import { loadPdfjs } from '../utils/pdfjs.js';
import { loadPdfBlob } from '../utils/storage.js';
import { downloadPdfBlob } from '../lib/pdfSync.js';
import { useAuth } from '../context/AuthContext.jsx';

// SCROLL mode (Full Page off): render ALL pages of a PDF, each fit to the
// container WIDTH, stacked vertically in normal flow. It renders content only —
// it sits INSIDE Present's scroll container, so manual scroll, pedal
// screenful-paging, and auto-scroll all work exactly as for a text song.
// Fail-soft (missing/corrupt shows a placeholder with a retry-download), like
// PdfSongView. onReady reports the page count.
export default function PdfPageStack({ songId, onReady, dark }) {
  const { user } = useAuth();
  const wrapRef = useRef(null);
  const docRef  = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [status, setStatus]     = useState('loading'); // loading | ready | missing | error
  const [reloadKey, setReloadKey] = useState(0);
  const [renderTick, setRenderTick] = useState(0);
  const [retrying, setRetrying] = useState(false);

  async function retryDownload() {
    if (!user?.id || retrying) return;
    setRetrying(true);
    try {
      await downloadPdfBlob(songId, user.id);
      setReloadKey(k => k + 1);
    } catch (err) {
      console.error('[PdfPageStack] retry download failed', err);
    } finally {
      setRetrying(false);
    }
  }

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    docRef.current = null;
    setNumPages(0);
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
        setNumPages(doc.numPages);
        onReady?.(doc.numPages);
        setStatus('ready');
      } catch (err) {
        console.error('[PdfPageStack] failed to load PDF', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; try { docRef.current?.destroy(); } catch { /* ignore */ } };
  }, [songId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render on width change (rotation / resize).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w && w !== last) { last = w; setRenderTick(t => t + 1); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render every page to its canvas, fit to width.
  useEffect(() => {
    if (status !== 'ready') return;
    const doc  = docRef.current;
    const wrap = wrapRef.current;
    if (!doc || !wrap) return;
    let cancelled = false;
    const tasks = [];
    (async () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = wrap.clientWidth;
      if (!cssWidth) return;
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled) return;
        const canvas = wrap.querySelector(`canvas[data-page="${n}"]`);
        if (!canvas) continue;
        try {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
          canvas.width  = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width  = cssWidth + 'px';
          canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
          const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
          tasks.push(task);
          await task.promise;
        } catch (err) {
          if (err?.name !== 'RenderingCancelledException') console.error('[PdfPageStack] render page', n, err);
        }
      }
    })();
    return () => { cancelled = true; tasks.forEach(t => { try { t.cancel(); } catch { /* ignore */ } }); };
  }, [status, numPages, renderTick]);

  const muted = dark ? 'text-gray-400' : 'text-gray-500';

  if (status === 'missing' || status === 'error') {
    return (
      <div className="flex items-center justify-center p-8 min-h-[50vh]">
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
    <div ref={wrapRef} className="flex flex-col items-center gap-3">
      {status === 'loading' && <p className={`text-sm py-8 ${muted}`}>Loading…</p>}
      {Array.from({ length: numPages }, (_, i) => (
        <canvas key={i + 1} data-page={i + 1} className="block max-w-full shadow-sm" />
      ))}
    </div>
  );
}
