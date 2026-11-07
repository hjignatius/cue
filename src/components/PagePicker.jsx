import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Ban, ChevronLeft, ChevronRight, Link2, Maximize2, Music, Plus, SkipForward, Trash2, Undo2 } from 'lucide-react';
import { loadPdfjs } from '../utils/pdfjs.js';
import { chartSongs, pagesMatching, songsFromMarks, stepWords, switchChart } from '../utils/bookReport.js';
import BookChoice, { startBook, startOne, bookChoice } from './BookChoice.jsx';
import { bookName } from '../utils/books.js';
import CornerClose from './CornerClose.jsx';
import FindSong, { SEARCH_FROM } from './FindSong.jsx';
import RoundButton, { GLASS, ROUND_SIZE_ACTION } from './RoundButton.jsx';

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
// to read, and can be fixed in place. For the one song wanted out of a big book,
// Leave out all clears the lot, and a tap on a page left out makes it New song.
// Find a song narrows the pages shown, by title first and then by the words on
// the page. It only narrows them: marks stay, and Make takes every song.
//
// Each page also says how it comes in: a green "Chart", or a grey "PDF" (a page
// left out says whether Cue could read it, from pageChances). A song whose every
// page reads comes in as a chart, unless you'd rather have the pages; the rest
// come in as their own PDF, exactly as printed (pdfCut.js). On a song that reads
// the mark is a switch, for that song or, with the tick box, all of them.
//
// The X in the corner leaves, as Cancel or, partway through several PDFs, as
// "stop here". Marks are a lot to lose to a stray tap — the large page's own X
// sits almost on top of it — so once any have changed, it asks first.
//
// No dimmed backdrop, as with every dialog in Cue.

const NEXT = { start: 'same', same: 'skip', skip: 'start' };
const WORDS = { start: 'New song', same: 'Same song', skip: 'Leave out' };
const SET_DEFAULT_MAX = 100;

export default function PagePicker({ dark, fileName, file, start, records = [], step = null, onStop, onAccept, onBack, onCancel }) {
  const [doc, setDoc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState(start.marks);
  const [titles, setTitles] = useState(start.titles);   // page -> { title, artist, key }
  const [big, setBig] = useState(null);                  // page shown large
  const [asking, setAsking] = useState(null);            // the way out, held until "Discard" is pressed
  // A book's songs come in as a book (books.js); one song printed twice over
  // (start.asBook false) is yours, as a sheet is, unless you put it in a book
  // — start.bookId's, the one last used, offered first.
  const one = start.asBook === false;
  const [book, setBook] = useState(() => (one ? startOne(records, start.bookId) : startBook(true, bookName(fileName))));
  const [makeSetChoice, setMakeSet] = useState(start.makeSet ?? null);
  const [asCharts, setAsCharts] = useState(true);
  const [asPdf, setAsPdf] = useState(() => new Set());   // pages of the songs switched to a PDF
  const [setName, setSetName] = useState(() => (fileName || '').replace(/\.pdf$/i, ''));
  const [search, setSearch] = useState('');
  const gridRef = useRef(null);
  const found = useMemo(() => pagesMatching(start, titles, search), [start, titles, search]);
  useEffect(() => { if (gridRef.current) gridRef.current.scrollTop = 0; }, [search]);

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

  const chances = start.chances;
  const songs = useMemo(() => chartSongs(songsFromMarks(marks, titles), chances, asPdf), [marks, titles, chances, asPdf]);
  const readable = songs.filter(s => s.reads).length;
  const charts = asCharts ? songs.filter(s => s.chart).length : 0;
  // Each page's song, for its mark to say how that song comes in.
  const songOf = useMemo(() => {
    const out = {};
    for (const s of songs) for (const p of s.pages) out[p] = s;
    return out;
  }, [songs]);
  const comesAs = (p) => (songOf[p] ? asCharts && songOf[p].chart : !!chances?.[p - 1]);
  const switches = (p) => asCharts && !!songOf[p]?.reads;
  // What each page IS, which is not always what it was marked: the first page
  // that isn't left out starts a song whatever it says.
  const shown = useMemo(() => {
    const out = [...marks];
    const first = out.findIndex(m => m !== 'skip');
    if (first >= 0) out[first] = 'start';
    return out;
  }, [marks]);
  const left = marks.filter(m => m === 'skip').length;
  const makeSet = makeSetChoice ?? (!book.on && songs.length <= SET_DEFAULT_MAX);

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
  // Through a ref, so that a tap re-renders the pages it changes, not every page.
  const songsNow = useRef(songs);
  useEffect(() => { songsNow.current = songs; }, [songs]);
  const switchSong = useCallback((p) => setAsPdf(prev => switchChart(songsNow.current, prev, p)), []);
  const retitle = useCallback((p, title) => setTitles(prev => ({ ...prev, [p]: { ...prev[p], title } })), []);

  const panel = dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200';
  const head  = dark ? 'text-white' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  // Pills, like Cue's main buttons: filled for the action, outlined for the rest.
  const pill = 'h-11 px-5 inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium rounded-full transition-colors';
  const primary = `${pill} bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white`;
  const secondary = `${pill} border ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  const field = `w-full rounded-lg px-3 py-2 text-sm border ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const n = songs.length;
  const more = step ? step.total - step.to : 0;
  const changed = titles !== start.titles || asPdf.size > 0 || marks.some((m, i) => m !== start.marks[i]);
  const leave = (go) => (changed ? setAsking(() => go) : go());
  // For the one song wanted out of a big book. Tapping a page left out makes it
  // New song, so that's a tap for each song from here. With everything left out
  // the same button puts Cue's marks back, and with nothing to lose it doesn't ask.
  const allOut = left === marks.length;
  const leaveAllOut = () => { setMarks(prev => prev.map(() => 'skip')); setAsking(null); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`relative w-full max-w-4xl h-[94vh] sm:h-[85vh] rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col gap-2 sm:gap-3 ${panel}`}>
        <CornerClose dark={dark} label={more ? `Stop here, skip ${more} more` : 'Cancel'} onClick={() => leave(more ? onStop : onCancel)} />
        <div className="flex flex-col gap-1 pr-9">
          {step && <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{stepWords(step)}</p>}
          <h2 className={`text-base font-semibold ${head}`}>Pick the songs <span className={`font-normal text-sm ${muted} break-words`}>“{fileName}”</span></h2>
          <p className={`text-xs sm:text-sm ${head}`}>
            Tap a page to change it: <b>New song</b>, <b>Same song</b> or <b>Leave out</b>. Tap a title to fix it.
            <span className={muted}> <Chance chart /> comes in as a chart, <Chance /> as a PDF, exactly as printed. Tap the mark to switch a song Cue can read.</span>
          </p>
        </div>

        {marks.length >= SEARCH_FROM && <FindSong value={search} onChange={setSearch} dark={dark} className="shrink-0" />}

        <div ref={gridRef} className={`flex-1 min-h-0 overflow-y-auto border-y py-3 pr-3 ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
          {failed ? (
            <p className={`text-sm ${muted}`}>Cue couldn’t open this PDF to show its pages.</p>
          ) : found && !found.length ? (
            <p className={`text-sm ${muted}`}>No page matches “{search.trim()}”.</p>
          ) : (
            <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}>
              {(found ? found.map(p => p - 1) : marks.map((_, i) => i)).map(i => (
                <PageCell key={i} p={i + 1} doc={doc} root={gridRef} mark={shown[i]}
                  title={shown[i] === 'start' ? titles[i + 1]?.title ?? '' : null} chart={comesAs(i + 1)} canSwitch={switches(i + 1)}
                  onTap={tap} onSwitch={switchSong} onBig={setBig} onRetitle={retitle} dark={dark} muted={muted} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <p className={`flex-1 min-w-0 text-sm ${head}`}>
            {n} song{n === 1 ? '' : 's'} from {marks.length - left} page{marks.length - left === 1 ? '' : 's'}
            {left ? <span className={muted}> · {left} left out</span> : null}
            {n ? <span className={muted}> · {charts} as chart{charts === 1 ? '' : 's'}, {n - charts} as PDF{n - charts === 1 ? '' : 's'}</span> : null}
          </p>
          {allOut
            ? <button onClick={() => setMarks(start.marks)} className={`${secondary} shrink-0 !px-4`}><Undo2 size={18} /> Cue’s marks</button>
            : <button onClick={() => leave(leaveAllOut)} className={`${secondary} shrink-0 !px-4`}><Ban size={18} /> Leave out all</button>}
        </div>
        {readable > 0 && (
          <label className={`flex items-center gap-2 text-sm ${head}`}>
            <input type="checkbox" checked={asCharts} onChange={e => setAsCharts(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
            Make charts of the songs Cue can read
          </label>
        )}
        <BookChoice dark={dark} records={records} value={book} onChange={setBook} one={one} label={one && n !== 1 ? 'Put them in a book' : null} />
        <div className="flex items-center gap-2">
          <label className={`flex items-center gap-2 text-sm shrink-0 ${head}`}>
            <input type="checkbox" checked={makeSet} onChange={e => setMakeSet(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
            In a new set{makeSet ? ':' : ''}
          </label>
          {makeSet && <input value={setName} onChange={e => setSetName(e.target.value)} aria-label="Set name" className={`${field} py-1.5`} />}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {more > 0 && <button onClick={() => leave(onCancel)} className={`${secondary} sm:mr-auto`}><SkipForward size={18} /> Skip this PDF</button>}
          {onBack && <button onClick={onBack} className={secondary}>Back</button>}
          <button disabled={!n || failed || (book.on && !bookChoice(book))}
            onClick={() => onAccept(songs.map(s => ({ ...s, chart: asCharts && s.chart, title: s.title.trim() || `Page ${s.firstPage}` })), makeSet && setName.trim() ? setName.trim() : null, bookChoice(book))}
            className={`${primary} flex-1 sm:flex-none sm:min-w-44`}>
            <Music size={18} /> Make {n} song{n === 1 ? '' : 's'}
          </button>
        </div>

        {big && (
          <BigPage doc={doc} p={big} count={marks.length} mark={shown[big - 1]} chart={comesAs(big)} canSwitch={switches(big)} onSwitch={switchSong}
            title={titles[big]?.title ?? ''} onMark={mark} onRetitle={retitle} onGo={setBig} onClose={() => setBig(null)}
            dark={dark} panel={panel} head={head} muted={muted} field={field} />
        )}

        {/* An in-app question, not confirm(): that is suppressed in a home-screen app. */}
        {asking && (
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center p-4" onClick={() => setAsking(null)}>
            <div className={`w-72 max-w-full rounded-2xl shadow-2xl p-5 flex flex-col gap-3 ${panel}`} onClick={e => e.stopPropagation()}>
              <h3 className={`text-base font-semibold ${head}`}>Discard your picks?</h3>
              <p className={`text-sm ${muted}`}>The changes you’ve made to these pages will be lost.</p>
              <div className="flex gap-2">
                <button onClick={() => setAsking(null)} className={`${secondary} flex-1 !px-3`}>Keep picking</button>
                <button onClick={asking} className={`${pill} flex-1 !px-3 bg-red-600 hover:bg-red-500 text-white`}><Trash2 size={18} /> Discard</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// How a page comes in: a green "Chart" or a grey "PDF". `arrows` marks one you
// can switch.
function Chance({ chart = false, arrows = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-0.5 align-middle text-[10px] font-semibold leading-none px-1.5 py-1 rounded ${
      chart ? 'bg-emerald-600 text-white' : 'bg-gray-500/80 text-white'} ${className}`}>
      {chart ? 'Chart' : 'PDF'}{arrows && <ArrowLeftRight size={9} strokeWidth={3} aria-hidden="true" />}
    </span>
  );
}

const CHIP = {
  start: 'bg-indigo-600 text-white',
  same: 'bg-gray-600/80 text-white',
  skip: 'bg-gray-300 text-gray-700 line-through',
};

// One page in the grid. Memoised: a tap re-renders the page tapped, not 300.
const PageCell = memo(function PageCell({ p, doc, root, mark, title, chart, canSwitch, onTap, onSwitch, onBig, onRetitle, dark, muted }) {
  const ring = mark === 'start' ? 'border-indigo-600' : dark ? 'border-gray-700' : 'border-gray-200';
  return (
    // Off-screen pages skip layout and paint; a 300-page book stays quick.
    <div className="flex flex-col gap-1 min-w-0" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 190px' }}>
      <div className="relative">
        <button onClick={() => onTap(p)} aria-label={`Page ${p}: ${WORDS[mark]}, ${chart ? 'reads as a chart' : 'a PDF page'}. Tap to change.`}
          className={`block w-full rounded-lg overflow-hidden border-2 ${ring} ${mark === 'skip' ? 'opacity-40' : ''}`}>
          <Thumb doc={doc} p={p} root={root} />
          <span className={`absolute top-1 left-1 text-[10px] font-semibold leading-none px-1.5 py-1 rounded ${CHIP[mark]}`}>{WORDS[mark]}</span>
          <span className="absolute top-1 right-1 text-[10px] leading-none px-1 py-1 rounded bg-black/50 text-white">{p}</span>
          {!canSwitch && <Chance chart={chart} className="absolute bottom-1 left-1" />}
        </button>
        {/* Its own button beside the page's, a finger's width to tap. */}
        {canSwitch && (
          <button onClick={() => onSwitch(p)} aria-label={`Page ${p}: this song comes in as a ${chart ? 'chart' : 'PDF'}. Tap to make it a ${chart ? 'PDF' : 'chart'}.`}
            title={chart ? 'Make this song a PDF' : 'Make this song a chart'}
            className="absolute bottom-0 left-0 z-10 min-w-[44px] h-[44px] flex items-end justify-start p-1">
            <Chance chart={chart} arrows />
          </button>
        )}
        {/* A finger's width to tap, around a badge that hides less of the page. */}
        <button onClick={() => onBig(p)} aria-label={`Show page ${p} large`} title="Show it large"
          className="group absolute bottom-0 right-0 w-[44px] h-[44px] flex items-end justify-end p-1">
          <span className="p-1 rounded bg-black/50 text-white group-hover:bg-black/70"><Maximize2 size={15} /></span>
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
// arrows to the pages either side. Choosing moves on to the next page, so a
// book can be gone through without reaching for the arrow: the choice already
// lit counts too, agreeing with Cue's guess being a decision like any other.
// After the last page, back to all the pages, where Make is.
function BigPage({ doc, p, count, mark, chart, canSwitch, onSwitch, title, onMark, onRetitle, onGo, onClose, dark, panel, head, muted, field }) {
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

  const decide = (m) => {
    onMark(p, m);
    if (p < count) onGo(p + 1);
    else onClose();
  };

  const choice = (m) => `flex-1 min-w-0 h-11 inline-flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap text-[13px] sm:text-sm font-medium rounded-full border transition-colors ${mark === m
    ? 'border-indigo-600 bg-indigo-600 text-white'
    : dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  // The same glass circles as the way out of Present. Their tap areas run the
  // page's full height and reach into the dialog's margin, so on a phone the
  // page loses no width to them.
  const glass = GLASS(dark);
  const arrow = { size: ROUND_SIZE_ACTION, tall: true, glass: true, fill: glass.fill, border: glass.border, color: glass.ink, touchAction: 'manipulation' };
  return (
    <div className={`absolute inset-0 rounded-2xl p-5 flex flex-col gap-3 ${panel}`}>
      <CornerClose dark={dark} label="Back to all the pages" onClick={onClose} />
      <div className="flex items-center gap-2 pr-8">
        <h3 className={`text-base font-semibold whitespace-nowrap shrink-0 ${head}`}>Page {p} <span className={`font-normal ${muted}`}>of {count}</span></h3>
        {canSwitch ? (
          <button onClick={() => onSwitch(p)} className={`min-h-11 min-w-0 flex items-center gap-1.5 text-left text-xs ${muted}`}>
            <Chance chart={chart} arrows className="shrink-0" /> {chart ? 'This song comes in as a chart. Tap for a PDF.' : 'This song comes in as a PDF. Tap for a chart.'}
          </button>
        ) : (
          <span className={`text-xs ${muted}`}><Chance chart={chart} /> {chart ? 'Cue can read this page as a chart' : 'This page comes in as a PDF'}</span>
        )}
      </div>
      <div className="flex-1 min-h-0 flex items-center gap-2">
        <div className="flex self-stretch -ml-3">
          <RoundButton {...arrow} label="Page before" disabled={p <= 1} onActivate={() => onGo(p - 1)}><ChevronLeft size={26} strokeWidth={2.5} /></RoundButton>
        </div>
        <div ref={boxRef} className="flex-1 h-full min-w-0 flex items-center justify-center">
          <canvas ref={canvasRef} className="bg-white shadow" />
        </div>
        <div className="flex self-stretch -mr-3">
          <RoundButton {...arrow} label="Page after" disabled={p >= count} onActivate={() => onGo(p + 1)}><ChevronRight size={26} strokeWidth={2.5} /></RoundButton>
        </div>
      </div>
      <div className="flex gap-2">
        {[['start', Plus], ['same', Link2], ['skip', Ban]].map(([m, Icon]) => (
          <button key={m} onClick={() => decide(m)} className={choice(m)} aria-pressed={mark === m}>
            <Icon size={16} className="shrink-0 max-[359px]:hidden" /> {WORDS[m]}
          </button>
        ))}
      </div>
      {mark === 'start' && (
        <input value={title} onChange={e => onRetitle(p, e.target.value)} aria-label="Title" spellCheck={false} className={field} />
      )}
    </div>
  );
}
