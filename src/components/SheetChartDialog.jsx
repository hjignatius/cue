import { useState } from 'react';
import BookChoice, { startOne, bookChoice } from './BookChoice.jsx';

// A PDF imported into the Library that is one song. When it turned out to be a
// chord chart: load it as text, or keep the page — the same choice the
// editor's Load PDF offers, with the title Cue read for it, so the song lands
// named. When it isn't (`chart` null), just the song's title and Import.
// Either way it can go into a book — one you have or a new one — instead of
// straight into My songs; the book used last is offered first (`bookId`).
//
// onText(book) / onPage(book): book is bookChoice()'s answer, or null.
// No dimmed backdrop, as everywhere in Cue: nothing is lost by either answer.
export default function SheetChartDialog({ dark, fileName, chart, title, records = [], bookId = '', onText, onPage, onCancel }) {
  const [book, setBook] = useState(() => startOne(records, bookId));
  const lines = chart ? chart.text.split('\n').filter(l => l.trim()) : [];
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const into = bookChoice(book);
  const ready = !book.on || into;
  const secondary = `w-full py-2 text-sm font-medium rounded-xl border transition-colors disabled:opacity-40 ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  const primary = 'w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onCancel}>
      <div className={`w-[26rem] max-w-full max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
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
          <button onClick={onCancel} className={`text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
