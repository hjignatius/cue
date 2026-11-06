import { useState } from 'react';
import BookChoice, { startOne, bookChoice } from './BookChoice.jsx';
import { stepWords } from '../utils/bookReport.js';
import CornerClose from './CornerClose.jsx';

// A PDF imported into the Library that is one song. When it turned out to be a
// chord chart: load it as text, or keep the page — the same choice the
// editor's Load PDF offers, with the title Cue read for it, so the song lands
// named. When it isn't (`chart` null), just the song's title and Import.
// Either way it can go into a book — one you have or a new one — instead of
// straight into My songs; the book used last is offered first (`bookId`).
//
// onText(book) / onPage(book): book is bookChoice()'s answer, or null.
// No dimmed backdrop, as everywhere in Cue: nothing is lost by either answer.
export default function SheetChartDialog({ dark, fileName, chart, title, records = [], bookId = '', step = null, onStop, onText, onPage, onCancel }) {
  const [book, setBook] = useState(() => startOne(records, bookId));
  const lines = chart ? chart.text.split('\n').filter(l => l.trim()) : [];
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const into = bookChoice(book);
  const more = step ? step.total - step.to : 0;
  const ready = !book.on || into;
  const secondary = `w-full min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium rounded-full border transition-colors disabled:opacity-40 ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  const primary = 'w-full min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-full transition-colors';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onCancel}>
      <div className={`relative w-[26rem] max-w-full rounded-2xl shadow-2xl ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <CornerClose dark={dark} label={more ? `Stop here, skip ${more} more` : 'Cancel'} onClick={more ? onStop : onCancel} />
        {/* Scrolls inside the panel, so the X stays put on a short screen. */}
        <div className="max-h-[85vh] overflow-y-auto rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1 pr-7">
          {step && <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{stepWords(step)}</p>}
          <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{chart ? <>There&rsquo;s a chord chart in this PDF</> : 'Import a song'}</h2>
          <p className={`text-xs break-words ${muted}`}>{fileName}</p>
          {chart && (
            <p className={`text-sm ${muted}`}>
              Load it as text and it becomes a song you can transpose, restyle and capo, and ink lands on the words. Keep it as a page and you get the sheet exactly as it was drawn.
            </p>
          )}
        </div>

        {/* What was actually found, so the choice isn't blind. */}
        <div className={`rounded-xl border px-3 py-2 ${dark ? 'border-gray-700 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}>
          <p className={`text-sm font-medium ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
            {chart ? chart.title : title}{chart?.artist ? <span className={`font-normal ${muted}`}> · {chart.artist}</span> : null}
          </p>
          {chart && <>
            <pre className={`mt-1 text-[11px] leading-snug font-mono whitespace-pre-wrap break-words ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{lines.slice(0, 6).join('\n')}</pre>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 tabular-nums">{lines.length} lines</p>
          </>}
        </div>

        <div className="flex flex-col gap-1">
          <BookChoice dark={dark} records={records} value={book} onChange={setBook} one />
          <p className={`text-xs ${muted}`}>
            {book.on ? 'It stays out of My songs until you put it in a set of your own, ink it, or add it to My songs.' : 'It goes straight into My songs.'}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {chart && <button onClick={() => onText(into)} disabled={!ready} className={primary}>Load as text</button>}
          <button onClick={() => onPage(into)} disabled={!ready} className={chart ? secondary : primary}>
            {chart ? 'Keep it as a page' : 'Import'}
          </button>
          {more > 0 && <button onClick={onCancel} className={secondary}>Skip this PDF</button>}
        </div>
        </div>
      </div>
    </div>
  );
}
