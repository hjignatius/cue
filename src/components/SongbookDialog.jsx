import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, FileText, ListChecks, Music, SkipForward } from 'lucide-react';
import LongList from './LongList.jsx';
import { VERDICT_WORDS, reportLines, songsMatching, startsAsPdfs, stepWords } from '../utils/bookReport.js';
import BookChoice, { startBook, bookChoice } from './BookChoice.jsx';
import { bookName } from '../utils/books.js';
import CornerClose from './CornerClose.jsx';
import FindSong, { SEARCH_FROM } from './FindSong.jsx';

// The review list for a songbook PDF, or for several PDFs imported together:
// the BOOK REPORT on top, then every song Cue found, to tick or untick before
// anything is created. Opens straight away while the pages are still being read
// (`reading` carries real counts), then fills in.
//
// THE REPORT says, in plain words and always in the same order, what the book
// is, how the songs were found, how they will come in, what was tidied — once,
// as a summary, because marking it on every row was too much — and what is
// already in the library. Then one of three verdicts, as a WORD, not a colour:
// Looks right, Check the list, or Can't split this book. A book that can't be
// split shows no list at all — 271 "songs" titled with chord names is worse
// than none — only the offer to keep it as one PDF.
//
// A song already in the library — same title, by normalizeTitle — is marked and
// starts unticked, so importing the same book twice does not double it. So does
// an entry with no chords (a contents page), and one whose chart is a picture
// can't be ticked at all: there is no text to import.
//
// TITLES CAN BE FIXED before importing: tap one and type. Clubs put their own
// version numbers and notes in titles in ways no rule will ever all catch.
//
// A book that can't be split — or whose split is wrong — can be picked apart
// by hand instead, page by page (PagePicker): the main way on for a book that
// can't be split, a second choice for a book that can.
//
// Several PDFs picked together, one song each, mark which ones Cue can read as
// charts ("Chart") and which come in as their pages ("PDF"), as the page
// picker does; one tick turns the charts off and brings every one in as a PDF.
//
// When the songs are in, the outcome is said here, in the dialog, not in the
// toolbar strip or an alert — with a way to go and see them.
//
// A big book is thousands of rows: each row is memoised, and past a few
// hundred only the ones on screen are drawn.
//
// No dimmed backdrop, as with every dialog in Cue.
const SET_DEFAULT_MAX = 100;

export default function SongbookDialog({ dark, batch, fileName, records = [], step = null, reading, report, songs, outcome, onImport, onKeepAsPage, onPick, onStop, onCancel, onShow, onDone }) {
  // A batch of separate PDFs picked together, named by its count ("3 PDFs").
  const sheets = batch || report?.kind === 'sheets';
  const [picked, setPicked] = useState(null);           // Set of indices, once songs arrive
  const [open, setOpen]     = useState(null);           // index whose chart is shown
  const [titles, setTitles] = useState({});             // index -> title as fixed by hand
  // A set is what you take to a gig. One holding a whole 4,000-song book is no
  // use for that and takes seconds to open, so past this many it starts off.
  // A songbook comes in as a book of its own; a batch of sheets may (books.js).
  // While it is going into a book, a new set starts off too: every song in a
  // set is one of yours, and a book is where they wait until you use them.
  const [book, setBook] = useState(() => startBook(!sheets, sheets ? 'Imported sheets' : bookName(fileName)));
  const [makeSetChoice, setMakeSet] = useState(null);
  const makeSet = makeSetChoice ?? (!book.on && !(songs && songs.length > SET_DEFAULT_MAX));
  const [setName, setSetName] = useState(() => (sheets ? 'Imported PDFs' : (fileName || '').replace(/\.pdf$/i, '')));
  const [asCharts, setAsCharts] = useState(true);
  const charts = sheets && (songs || []).some(s => s.chart);
  const listRef = useRef(null);
  // For finding one song in a long list. It only narrows what's shown: ticks are
  // kept, and the box above the list is still for every song.
  const [search, setSearch] = useState('');
  const listed = useMemo(() => songsMatching(songs || [], search, titles), [songs, search, titles]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [search]);

  const tickable = useMemo(() => (songs || []).map((s, i) => (s.pictureOnly ? -1 : i)).filter(i => i >= 0), [songs]);
  const defaults = useMemo(
    () => new Set((songs || []).map((s, i) => (s.inLibrary || s.noChords || s.pictureOnly ? -1 : i)).filter(i => i >= 0)),
    [songs]);
  const chosen = picked ?? defaults;
  const toggle = useCallback((i) => setPicked(prev => {
    const next = new Set(prev ?? defaults);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  }), [defaults]);
  const retitle = useCallback((i, t) => setTitles(prev => ({ ...prev, [i]: t })), []);
  const allOn = tickable.length > 0 && tickable.every(i => chosen.has(i));
  const someOn = !allOn && chosen.size > 0;
  // One box for the lot, like the Library's select-all: everything ticked
  // unticks all; anything less ticks all.
  const tickAll = () => setPicked(allOn ? new Set() : new Set(tickable));

  const panel = dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200';
  const head  = dark ? 'text-white' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const rule  = dark ? 'border-gray-800' : 'border-gray-100';
  const primary = 'w-full sm:w-auto sm:grow min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-full transition-colors';
  const secondary = `w-full sm:w-auto sm:grow min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium rounded-full transition-colors border ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  const n = chosen.size;
  const dupes = (songs || []).filter(s => s.inLibrary).length;
  const saving = reading?.saving;
  const cant = report?.verdict === 'cant';
  const unit = saving ? 'Song' : sheets ? 'PDF' : 'Page';
  const more = step ? step.total - step.to : 0;
  // Nothing to leave once it is saving, or finished: Done says that.
  const canLeave = onCancel && !outcome;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`relative w-full max-w-lg max-h-[92vh] sm:max-h-[85vh] rounded-2xl shadow-2xl p-5 flex flex-col gap-3 ${panel}`}>
        {canLeave && <CornerClose dark={dark} label={more ? `Stop here, skip ${more} more` : 'Cancel'} onClick={more ? onStop : onCancel} />}
        <div className="flex flex-col gap-1 pr-8">
          {step && <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{stepWords(step)}</p>}
          <h2 className={`text-base font-semibold ${head}`}>{sheets ? 'PDFs' : 'Songbook'}</h2>
          <p className={`text-sm ${muted} break-words`}>
            {/* A batch is named by its count, "3 PDFs" — not a file name to quote. */}
            {sheets ? (report || outcome ? 'Picked together' : 'Reading them…')
              : outcome || report ? <>“{fileName}”</>
              : saving ? <>Saving songs from “{fileName}”…</>
              : <>Reading “{fileName}”…</>}
          </p>
        </div>

        {!report && !outcome && (
          <div className="flex flex-col gap-1">
            <div className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <div className="h-full bg-indigo-600 transition-[width]" style={{ width: `${reading?.total ? (reading.done / reading.total) * 100 : 0}%` }} />
            </div>
            <p className={`text-xs ${muted}`}>{reading?.total ? `${unit} ${reading.done} of ${reading.total}` : 'Opening…'}</p>
          </div>
        )}

        {outcome && (
          <>
            <p className={`text-sm ${head}`}>
              Added {outcome.added} song{outcome.added === 1 ? '' : 's'}
              {outcome.bookName ? <> to the book “{outcome.bookName}”{outcome.setName ? <> and the new set “{outcome.setName}”</> : null}</>
                : outcome.setName ? <> to the new set “{outcome.setName}”</> : ' to your library'}.
              {outcome.leftOut ? ` ${outcome.leftOut} ${outcome.leftOut === 1 ? 'was' : 'were'} left out.` : ''}
              {outcome.already ? ` ${outcome.already} ${outcome.already === 1 ? 'was' : 'were'} already in it.` : ''}
            </p>
            {outcome.unsaved ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                This browser wouldn’t save {outcome.unsaved === 1 ? '1 PDF' : `${outcome.unsaved} PDFs`}. They open now but will be gone after a reload — make a backup before closing Cue.
              </p>
            ) : null}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {more > 0
                ? <button onClick={onDone} className={primary}>Next PDF <ChevronRight size={18} /></button>
                : <>
                    <button onClick={onShow} className={primary}><Eye size={18} /> Show them</button>
                    <button onClick={onDone} className={secondary}>Done</button>
                  </>}
            </div>
          </>
        )}

        {report && !outcome && (
          <>
            <Report report={report} inLibrary={dupes} dark={dark} head={head} muted={muted} />
            {cant && onPick && (
              <p className={`text-sm ${head}`}>You can still pick out each song’s pages yourself. {report.chartPages && !startsAsPdfs(report.score) ? 'Pages Cue can read come in as charts, and the rest as PDF pages, exactly as printed.' : 'They come in as PDF pages, exactly as printed.'}</p>
            )}

            {!cant && (
              <>
                <div className={`flex items-center gap-2 text-xs ${muted}`}>
                  <TickAll checked={allOn} mixed={someOn} onToggle={tickAll} />
                  <span className="shrink-0">{n} of {songs.length} ticked</span>
                  <span className={`ml-auto text-right ${songs.length >= SEARCH_FROM ? 'hidden sm:inline' : ''}`}>Tap a title to fix it</span>
                  {/* In this row, not its own: the window has no height to spare. */}
                  {songs.length >= SEARCH_FROM && <FindSong value={search} onChange={setSearch} dark={dark} className="flex-1 min-w-0 sm:max-w-44" />}
                </div>
                {/* Room on the right, so the scroll bar never sits on a row's arrow. */}
                <div ref={listRef} className={`flex-1 min-h-40 overflow-y-auto pr-3 border-y ${rule}`}>
                  {!listed.length && <p className={`py-4 text-sm ${muted}`}>No song matches “{search.trim()}”.</p>}
                  <LongList
                    count={listed.length}
                    scrollRef={listRef}
                    keyOf={at => listed[at]}
                    estimate={() => 56}
                    renderRow={at => {
                      const i = listed[at];
                      return (
                        <SongRow key={i} i={i} song={songs[i]} title={titles[i] ?? songs[i].title}
                          ticked={chosen.has(i)} open={open === i} sheets={sheets} asChart={charts ? asCharts && !!songs[i].chart : null}
                          onTick={toggle} onOpen={setOpen} onRetitle={retitle}
                          head={head} muted={muted} rule={rule} dark={dark} />
                      );
                    }}
                  />
                </div>

                {charts && (
                  <label className={`flex items-center gap-2 text-sm ${head}`}>
                    <input type="checkbox" checked={!asCharts} onChange={e => setAsCharts(!e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                    Make all PDFs
                  </label>
                )}
                <BookChoice dark={dark} records={records} value={book} onChange={setBook} />
                <label className={`flex items-center gap-2 text-sm ${head}`}>
                  <input type="checkbox" checked={makeSet} onChange={e => setMakeSet(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                  Put them in a new set
                </label>
                {makeSet && (
                  <input value={setName} onChange={e => setSetName(e.target.value)} aria-label="Set name"
                    className={`w-full rounded-lg px-3 py-2 text-sm border ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                )}
              </>
            )}

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {!cant && (
                <button disabled={!n}
                  onClick={() => {
                    const ids = [...chosen].sort((a, b) => a - b);
                    const fixed = {};
                    for (const i of ids) if (titles[i]?.trim() && titles[i].trim() !== songs[i].title) fixed[i] = titles[i].trim();
                    onImport(ids, makeSet && setName.trim() ? setName.trim() : null, fixed, asCharts, bookChoice(book));
                  }}
                  className={primary}>
                  <Music size={18} /> Import {n} song{n === 1 ? '' : 's'}
                </button>
              )}
              {cant && onPick && <button onClick={onPick} className={primary}><ListChecks size={18} /> Pick the songs myself</button>}
              {onKeepAsPage && (
                <button onClick={onKeepAsPage} className={cant && !onPick ? primary : secondary}>
                  <FileText size={18} /> {cant ? 'Keep it as one PDF' : 'Keep it as one PDF instead'}
                </button>
              )}
              {!cant && onPick && (
                <button onClick={onPick} className={secondary}><ListChecks size={18} /> Or pick the pages myself</button>
              )}
              {canLeave && more > 0 && <button onClick={onCancel} className={secondary}><SkipForward size={18} /> {sheets ? 'Skip these PDFs' : 'Skip this PDF'}</button>}
            </div>
          </>
        )}

        {!report && canLeave && more > 0 && <button onClick={onCancel} className={secondary}><SkipForward size={18} /> Skip this PDF</button>}
      </div>
    </div>
  );
}

// The verdict, as a word with a mark in front, then the reasons and the report's
// sentences.
function Report({ report, inLibrary, dark, head, muted }) {
  const mark = { ok: '✓', check: '!', cant: '✕' }[report.verdict];
  const tone = report.verdict === 'ok'
    ? (dark ? 'text-emerald-400' : 'text-emerald-700')
    : report.verdict === 'check' ? 'text-amber-600' : (dark ? 'text-red-400' : 'text-red-600');
  const lines = reportLines(report, inLibrary);
  return (
    // Capped, so on a phone a long report never squeezes the list down to two
    // rows; it scrolls instead.
    <div className="flex flex-col gap-1.5 shrink-0 max-h-[30vh] overflow-y-auto">
      {report.kind !== 'sheets' || report.verdict !== 'ok' ? (
        <p className={`text-sm font-semibold ${tone}`}><span aria-hidden="true">{mark}</span> {VERDICT_WORDS[report.verdict]}</p>
      ) : null}
      {report.reasons.map((r, i) => <p key={`r${i}`} className={`text-sm ${head}`}>{r}</p>)}
      {lines.map((l, i) => <p key={i} className={`text-sm ${muted}`}>{l}</p>)}
    </div>
  );
}

function TickAll({ checked, mixed, onToggle }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return (
    <label className="shrink-0 -mx-3.5 px-3.5 py-2 flex items-center cursor-pointer">
      <input ref={ref} type="checkbox" checked={checked} onChange={onToggle}
        aria-label={checked ? 'Untick all' : 'Tick all'} className="h-4 w-4 accent-indigo-600 cursor-pointer" />
    </label>
  );
}

const pagesOf = (s) => (s.lastPage !== s.firstPage ? `pp. ${s.firstPage}–${s.lastPage}` : `p. ${s.firstPage}`);

// One song in the list. `onTick`, `onOpen` and `onRetitle` take the index, so
// the row's props stay the same from one render to the next unless the row
// itself changed.
// `asChart`: true or false where the PDFs picked together include charts — the
// mark says which way this one comes in — null where there's nothing to mark.
const SongRow = memo(function SongRow({ i, song: s, title, ticked, open, sheets, asChart, onTick, onOpen, onRetitle, head, muted, rule, dark }) {
  const tag = s.pictureOnly ? 'Picture only' : s.inLibrary ? 'In library' : s.noChords && !sheets ? 'No chords' : '';
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className={`border-b ${rule}`}>
      <div className="flex items-start gap-3 py-2">
        <input type="checkbox" checked={ticked} disabled={s.pictureOnly} onChange={() => onTick(i)}
          aria-label={`Import ${title}`} className="mt-1.5 h-4 w-4 shrink-0 accent-indigo-600 disabled:opacity-30" />
        <div className="flex-1 min-w-0">
          <span className="flex items-baseline gap-2">
            <input value={title} disabled={s.pictureOnly} onChange={e => onRetitle(i, e.target.value)}
              aria-label="Title" spellCheck={false}
              className={`flex-1 min-w-0 bg-transparent text-sm font-medium truncate rounded px-1 -mx-1 py-0.5 border border-transparent focus:outline-none ${
                dark ? 'hover:border-gray-700 focus:border-indigo-500' : 'hover:border-gray-200 focus:border-indigo-400'} ${s.pictureOnly ? muted : head}`} />
            {tag && <span className="shrink-0 text-xs font-medium text-amber-600">{tag}</span>}
            {asChart != null && (
              // The page picker's mark, so the two read the same.
              <span className={`shrink-0 self-center text-[10px] font-semibold leading-none px-1.5 py-1 rounded text-white ${asChart ? 'bg-emerald-600' : 'bg-gray-500/80'}`}>
                {asChart ? 'Chart' : 'PDF'}
              </span>
            )}
          </span>
          <span className={`block text-xs truncate ${muted}`}>
            {[s.artist, s.key && `key ${s.key}`, pagesOf(s), s.youtubeUrl ? 'video' : ''].filter(Boolean).join(' · ')}
          </span>
        </div>
        {s.text && (
          <button onClick={() => onOpen(o => (o === i ? null : i))} aria-label={open ? 'Hide the chart' : 'Show the chart'}
            title={open ? 'Hide the chart' : 'Show the chart'}
            className={`shrink-0 p-1.5 rounded-lg ${dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
            <Chevron size={16} />
          </button>
        )}
      </div>
      {open && s.text && (
        <pre className={`mb-2 ml-7 max-h-60 overflow-auto text-xs leading-snug whitespace-pre-wrap font-mono ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{s.text}</pre>
      )}
    </div>
  );
});
