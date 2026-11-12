import { useState } from 'react';
import { BookPlus } from 'lucide-react';
import BookChoice, { startBook, bookChoice } from './BookChoice.jsx';
import { CloseCircle } from './CornerClose.jsx';
import { addToBookPlan, books as booksIn } from '../utils/books.js';
import { saveBookChoice, putSongsInBooks } from '../utils/storage.js';

// Add to Book — Book… in the Library action bar's Add to… menu (Howard,
// 2026-11-12): the ticked songs go into a book — one you have, or a new one on
// a shelf — or, ticked in a book, into My songs. COPY by default: a song stays
// where it was and is in the book too, ONE song in both, so an edit shows in
// each. "Remove them from …" makes it a move, offered only where the songs were
// ticked in My songs or a single book; a song in one of your sets is never
// taken out of My songs. No song is ever duplicated or deleted here.
//
// `from` is the Library's view. The outcome is said here, in the window, as in
// Cue's other tools; onDone refreshes the Library and clears the ticks.
// No dimmed backdrop, as everywhere in Cue.

function firstInto(records, from) {
  const other = booksIn(records)
    .filter(b => b.id !== (from?.kind === 'book' ? from.id : null))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
  return other ? startBook(true, '', other.id) : startBook(true, '');
}

export default function AddToBookDialog({ dark, records = [], songs = [], ids = [], sets = [], from, fromName, onDone, onShow, onClose }) {
  const [into, setInto] = useState(() => firstInto(records, from));
  const [move, setMove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { added, already, keptForSets, moved, where, bookId }
  const canMove = from?.kind === 'mine' || from?.kind === 'book';
  const n = ids.length;
  const [They, them] = n === 1 ? ['It', 'it'] : ['They', 'them'];
  const songsWord = (k) => `${k.toLocaleString()} song${k === 1 ? '' : 's'}`;
  const making = into.on && !into.bookId;
  const ready = !making || (into.name.trim() && (into.shelfId !== '__new' || into.newShelf.trim()));
  const destName = !into.on ? 'My songs' : into.bookId ? `“${records.find(r => r.id === into.bookId)?.name || 'the book'}”` : `“${into.name.trim()}”`;

  async function apply() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const choice = bookChoice(into);
      const intoId = choice ? await saveBookChoice(choice) : null;
      const inSets = new Set(sets.flatMap(s => s.songIds || []));
      const plan = addToBookPlan(ids, songs, { intoId, from, move: canMove && move, inSets });
      await putSongsInBooks(plan.patches);
      setResult({ ...plan, moved: canMove && move, where: destName, bookId: intoId });
      await onDone?.();
    } finally {
      setBusy(false);
    }
  }

  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const head = dark ? 'text-white' : 'text-gray-900';
  const primary = 'flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-full transition-colors';
  const secondary = `flex-1 min-h-11 px-4 py-1.5 inline-flex items-center justify-center gap-2 text-center text-sm font-medium rounded-full border transition-colors ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div className={`w-[24rem] max-w-full rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className={`text-base font-semibold ${head}`}>{result ? (result.moved ? 'Moved' : 'Copied') : `Add ${songsWord(n)} to a book`}</h2>
          <CloseCircle dark={dark} label="Close" onClick={onClose} className="-mt-3 -mb-1 -mr-4" />
        </div>

        {!result && (
          <>
            <BookChoice dark={dark} records={records} value={into} onChange={setInto} into label="Add to"
              noMine={from?.kind !== 'book'} exclude={from?.kind === 'book' ? from.id : null} />
            {canMove && (
              <label className={`flex items-start gap-2 text-sm ${head}`}>
                <input type="checkbox" checked={move} onChange={e => setMove(e.target.checked)} className="h-4 w-4 mt-0.5 accent-indigo-600 shrink-0" />
                <span>Remove {them} from {fromName}</span>
              </label>
            )}
            <p className={`text-xs ${muted}`}>
              {move && canMove
                ? <>{They}’ll be in {destName} and no longer in {fromName}.{from?.kind === 'mine' ? ' A song in one of your sets stays in My songs too.' : ''}</>
                : <>{n === 1 ? 'It stays' : 'They stay'} in {fromName} and {n === 1 ? 'is' : 'are'} in {destName} too, {n === 1 ? 'still one song' : 'each still one song'}, so an edit shows in both.</>}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className={secondary}>Cancel</button>
              <button onClick={apply} disabled={!ready || busy} className={primary}>
                <BookPlus size={18} /> {move && canMove ? 'Move' : 'Copy'}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <p className={`text-sm ${head}`}>
              {result.added ? <>{songsWord(result.added)} {result.moved ? 'moved' : 'added'} to {result.where}.</> : <>Nothing new to add to {result.where}.</>}
              {result.already ? <> {songsWord(result.already)} {result.already === 1 ? 'was' : 'were'} there already.</> : null}
            </p>
            {result.keptForSets > 0 && (
              <p className={`text-sm ${muted}`}>{songsWord(result.keptForSets)} in your sets {result.keptForSets === 1 ? 'stays' : 'stay'} in My songs too.</p>
            )}
            <div className="flex gap-2">
              <button onClick={onClose} className={secondary}>Done</button>
              <button onClick={() => onShow?.(result.bookId)} className={primary}>
                {result.bookId ? 'Open the book' : 'Open My songs'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
