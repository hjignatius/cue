import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { loadPdfjs } from '../utils/pdfjs.js';
import { songsFromMarks } from '../utils/bookReport.js';

// Picking the songs out of a book by hand, page by page, for a book the report
// can't split — chords above the lyrics, pages that are pictures — or one whose
// split needs fixing. Every page is shown small, marked as one of three things:
//
//   New song    a song starts on this page
//   Same song   more of the song before
//   Leave out   a cover, the contents, an advert
//
// Tapping a page moves it on to the next. Cue marks its own guesses first
// (bookReport.js, pickerStart), so for most books this is fixing, not starting
// from nothing. A title is read off each song's first page where there is one
// to read, and can be fixed in place. Each song then comes in as its own PDF,
// exactly as printed (pdfCut.js).
//
// No dimmed backdrop, as with every dialog in Cue.

const NEXT = { start: 'same', same: 'skip', skip: 'start' };
const WORDS = { start: 'New song', same: 'Same song', skip: 'Leave out' };
const SET_DEFAULT_MAX = 100;

export default function PagePicker({ dark, fileName, file, start, onAccept, onBack, onCancel }) {
  const [doc, setDoc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState(start.marks);
  const [titles, setTitles] = useState(start.titles);   // page -> { title, artist, key }
  const [big, setBig] = useState(null);                  // page shown large
  const [makeSetChoice, setMakeSet] = useState(null);
  const [setName, setSetName] = useState(() => (fileName || '').replace(/\.pdf$/i, ''));
  const gridRef = useRef(null);

  useEffect(() => {
    let cancelled = false, opened = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = new Uint8Array(await file.arrayBuffer());
        opened = await pdfjs.getDocument({ data }).promise;
        if (cancelled) { opened.destroy(); return; }
        setDoc(opened);
      } catch (err) {
        console.error('[PagePicker] could not open the PDF', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; try { opened?.destroy(); } catch { /* ignore */ } };
  }, [file]);

  const songs = useMemo(() => songsFromMarks(marks, titles), [marks, titles]);
  // What each page IS, which is not always what it was marked: the first page
  // that isn't left out starts a song whatever it says.
  const shown = useMemo(() => {
    const out = [...marks];
    const first = out.findIndex(m => m !== 'skip');
    if (first >= 0) out[first] = 'start';
    return out;
  }, [marks]);
  const left = marks.filter(m => m === 'skip').length;
  const makeSet = makeSetChoice ?? songs.length <= SET_DEFAULT_MAX;

  const tap = useCallback((p) => setMarks(prev => {
    const next = [...prev];
    next[p - 1] = NEXT[next[p - 1]];
    return next;
  }), []);
  const mark = useCallback((p, m) => setMarks(prev => {
    const next = [...prev];
    next[p - 1] = m;
    return next;
  }), []);
  const retitle = useCallback((p, title) => setTitles(prev => ({ ...prev, [p]: { ...prev[p], title } })), []);

  const panel = dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200';
  const head  = dark ? 'text-white' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const quiet = dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600';
  const primary = 'w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors';
  const secondary = `w-full py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;
  const field = `w-full rounded-lg px-3 py-2 text-sm border ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const n = songs.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`relative w-full max-w-4xl h-[94vh] sm:h-[85vh] rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col gap-2 sm:gap-3 ${panel}`}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${head}`}>Pick the songs <span className={`font-normal text-sm ${muted} break-words`}>“{fileName}”</span></h2>
          <p className={`text-xs sm:text-sm ${head}`}>
            Tap a page to change it: <b>New song</b>, <b>Same song</b> or <b>Leave out</b>. Tap a title to fix it.
            <span className={muted}> Each song comes in as its own PDF, exactly as printed.</span>
          </p>
        </div>

        <div ref={gridRef} className={`flex-1 min-h-0 overflow-y-auto border-y py-3 ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
          {failed ? (
            <p className={`text-sm ${muted}`}>Cue couldn’t open this PDF to show its pages.</p>
          ) : (
            <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}>
              {marks.map((_, i) => (
                <PageCell key={i} p={i + 1} doc={doc} root={gridRef} mark={shown[i]}
                  title={shown[i] === 'start' ? titles[i + 1]?.title ?? '' : null}
                  onTap={tap} onBig={setBig} onRetitle={retitle} dark={dark} muted={muted} />
              ))}
            </div>
          )}
        </div>

        <p className={`text-sm ${head}`}>
          {n} song{n === 1 ? '' : 's'} from {marks.length - left} page{marks.length - left === 1 ? '' : 's'}
          {left ? <span className={muted}> · {left} left out</span> : null}
        </p>
        <div className="flex items-center gap-2">
          <label className={`flex items-center gap-2 text-sm shrink-0 ${head}`}>
            <input type="checkbox" checked={makeSet} onChange={e => setMakeSet(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
            In a new set{makeSet ? ':' : ''}
          </label>
          {makeSet && <input value={setName} onChange={e => setSetName(e.target.value)} aria-label="Set name" className={`${field} py-1.5`} />}
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className={secondary}>Back</button>
          <button disabled={!n || failed}
            onClick={() => onAccept(songs.map(s => ({ ...s, title: s.title.trim() || `Page ${s.firstPage}` })), makeSet && setName.trim() ? setName.trim() : null)}
            className={primary}>
            Make {n} song{n === 1 ? '' : 's'}
          </button>
        </div>
        <button onClick={onCancel} className={`text-xs py-1 text-center transition-colors ${quiet}`}>Cancel</button>

        {big && (
          <BigPage doc={doc} p={big} count={marks.length} mark={shown[big - 1]}
            title={titles[big]?.title ?? ''} onMark={mark} onRetitle={retitle} onGo={setBig} onClose={() => setBig(null)}
            dark={dark} panel={panel} head={head} muted={muted} field={field} />
        )}
      </div>
    </div>
  );
}

const CHIP = {
  start: 'bg-indigo-600 text-white',
  same: 'bg-gray-600/80 text-white',
  skip: 'bg-gray-300 text-gray-700 line-through',
};

// One page in the grid. Memoised: a tap re-renders the page tapped, not 300.
const PageCell = memo(function PageCell({ p, doc, root, mark, title, onTap, onBig, onRetitle, dark, muted }) {
  const ring = mark === 'start' ? 'border-indigo-600' : dark ? 'border-gray-700' : 'border-gray-200';
  return (
    // Off-screen pages skip layout and paint; a 300-page book stays quick.
    <div className="flex flex-col gap-1 min-w-0" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 190px' }}>
      <div className="relative">
        <button onClick={() => onTap(p)} aria-label={`Page ${p}: ${WORDS[mark]}. Tap to change.`}
          className={`block w-full rounded-lg overflow-hidden border-2 ${ring} ${mark === 'skip' ? 'opacity-40' : ''}`}>
          <Thumb doc={doc} p={p} root={root} />
          <span className={`absolute top-1 left-1 text-[10px] font-semibold leading-none px-1.5 py-1 rounded ${CHIP[mark]}`}>{WORDS[mark]}</span>
          <span className="absolute bottom-1 left-1 text-[10px] leading-none px-1 py-0.5 rounded bg-black/50 text-white">{p}</span>
        </button>
        <button onClick={() => onBig(p)} aria-label={`Show page ${p} large`} title="Show it large"
          className="absolute bottom-1 right-1 p-1 rounded bg-black/50 text-white hover:bg-black/70">
          <Maximize2 size={12} />
        </button>
      </div>
      {title != null && (
        <input value={title} onChange={e => onRetitle(p, e.target.value)} aria-label={`Title of the song on page ${p}`} spellCheck={false}
          className={`w-full bg-transparent text-xs font-medium rounded px-1 py-0.5 border border-transparent focus:outline-none truncate ${
            dark ? 'text-white hover:border-gray-700 focus:border-indigo-500' : 'text-gray-900 hover:border-gray-200 focus:border-indigo-400'}`} />
      )}
      {title == null && <span className={`text-[11px] px-1 ${muted}`}>&nbsp;</span>}
    </div>
  );
});

// A page, drawn small once it scrolls near view. Sized to the page's own shape
// once known; until then, a sheet of paper's.
function Thumb({ doc, p, root }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const [ratio, setRatio] = useState(1.294);
  useEffect(() => {
    const el = boxRef.current;
    if (!doc || !el) return;
    let cancelled = false, task = null;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      try {
        const page = await doc.getPage(p);
        if (cancelled) return;
        const unit = page.getViewport({ scale: 1 });
        setRatio(unit.height / unit.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: ((el.clientWidth || 120) * dpr) / unit.width });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
      } catch { /* cancelled, or a page pdf.js can't draw: it stays blank */ }
    }, { root: root?.current || null, rootMargin: '600px 0px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); task?.cancel(); };
  }, [doc, p, root]);
  return (
    <div ref={boxRef} className="w-full bg-white" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}

// One page large enough to read, with the same three choices as buttons and
// arrows to the pages either side.
function BigPage({ doc, p, count, mark, title, onMark, onRetitle, onGo, onClose, dark, panel, head, muted, field }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!doc || !el) return;
    let cancelled = false, task = null;
    (async () => {
      try {
        const page = await doc.getPage(p);
        if (cancelled) return;
        const unit = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const fit = Math.min(el.clientWidth / unit.width, el.clientHeight / unit.height);
        const viewport = page.getViewport({ scale: fit * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
      } catch { /* cancelled */ }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, p]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft' && p > 1) onGo(p - 1);
      else if (e.key === 'ArrowRight' && p < count) onGo(p + 1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, count, onGo, onClose]);

  const choice = (m) => `flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${mark === m
    ? 'bg-indigo-600 text-white'
    : dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;
  const arrow = `p-2 rounded-lg disabled:opacity-30 ${dark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`;
  return (
    <div className={`absolute inset-0 rounded-2xl p-5 flex flex-col gap-3 ${panel}`}>
      <div className="flex items-center gap-2">
        <h3 className={`text-base font-semibold ${head}`}>Page {p} <span className={`font-normal ${muted}`}>of {count}</span></h3>
        <button onClick={onClose} aria-label="Back to all the pages" className={`ml-auto ${arrow}`}><X size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center gap-2">
        <button onClick={() => onGo(p - 1)} disabled={p <= 1} aria-label="Page before" className={arrow}><ChevronLeft size={22} /></button>
        <div ref={boxRef} className="flex-1 h-full min-w-0 flex items-center justify-center">
          <canvas ref={canvasRef} className="bg-white shadow" />
        </div>
        <button onClick={() => onGo(p + 1)} disabled={p >= count} aria-label="Page after" className={arrow}><ChevronRight size={22} /></button>
      </div>
      <div className="flex gap-2">
        {['start', 'same', 'skip'].map(m => (
          <button key={m} onClick={() => onMark(p, m)} className={choice(m)} aria-pressed={mark === m}>{WORDS[m]}</button>
        ))}
      </div>
      {mark === 'start' && (
        <input value={title} onChange={e => onRetitle(p, e.target.value)} aria-label="Title" spellCheck={false} className={field} />
      )}
    </div>
  );
}
