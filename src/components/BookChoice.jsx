import { bookNamed, books, shelves } from '../utils/books.js';

// "Keep these as a book" in the import lists (SongbookDialog, PagePicker): the
// tick, the book's name, and the shelf it goes on — none, one already there, or
// a new one named here. A songbook starts ticked; a batch of sheets doesn't
// (books.js).
//
// `one` is for a single song (SheetChartDialog, or one printed twice in the
// PagePicker): "Put it in a book", unticked (startOne), into a book you
// already have or a new one.
//
// value: { on, name, shelfId, newShelf, bookId }. bookChoice(value) is what the
// import is given: { bookId } for a book already there, { name, shelfId,
// newShelf } for a new one, or null. A new one named as a book you already have
// is that book (saveBookChoice), and says so here.
//
// `into` is the shared set's Copy list: one "Copy into" menu — My songs (`on`
// false), a book you have, or a new book — asked first, because where the songs
// go decides what counts as a duplicate (Howard, 2026-11-10).

export const startBook = (on, name, bookId = '') => ({ on, name, shelfId: '', newShelf: '', bookId });

// For one song: unticked, offering first the book last used while it's still
// there, else the first by name, else a new one.
const byName = (records) => books(records).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
export function startOne(records = [], lastId = '') {
  const have = byName(records);
  return startBook(false, '', have.some(b => b.id === lastId) ? lastId : have[0]?.id || '');
}

export function bookChoice(value) {
  if (value?.on && value.bookId) return { bookId: value.bookId };
  if (!value?.on || !value.name.trim()) return null;
  const making = value.shelfId === '__new' && value.newShelf.trim();
  return { name: value.name.trim(), shelfId: making || value.shelfId === '__new' ? null : value.shelfId || null, newShelf: making ? value.newShelf.trim() : null };
}

// `noMine` leaves My songs out of the `into` menu and `exclude` a book — Add to
// Book, where those are the list the songs were ticked in.
export default function BookChoice({ dark, records, value, onChange, one = false, into = false, label = null, noMine = false, exclude = null }) {
  const head = dark ? 'text-gray-100' : 'text-gray-900';
  const field = `rounded-lg px-3 py-2 text-sm border ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const set = (patch) => onChange({ ...value, ...patch });
  const have = one || into ? byName(records).filter(b => b.id !== exclude) : [];
  const newBook = value.on && !value.bookId && (
    <>
      <div className="flex gap-2">
        <input value={value.name} onChange={e => set({ name: e.target.value })} placeholder="Book name" aria-label="Book name" className={`${field} flex-1 min-w-0`} />
        <select value={value.shelfId} onChange={e => set({ shelfId: e.target.value })} aria-label="Shelf" className={`${field} w-36 shrink-0`}>
          <option value="">No shelf</option>
          {shelves(records).sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="__new">New shelf…</option>
        </select>
      </div>
      {bookNamed(records, value.name) && (
        <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>You already have this book, so these songs will join it.</p>
      )}
      {value.shelfId === '__new' && (
        <input value={value.newShelf} onChange={e => set({ newShelf: e.target.value })} placeholder="Shelf name, e.g. Club" aria-label="New shelf name" className={field} />
      )}
    </>
  );
  if (into) {
    const where = !value.on ? '__mine' : value.bookId || '__new';
    return (
      <div className="flex flex-col gap-2">
        <label className={`flex items-center gap-2 text-sm font-medium ${head}`}>
          <span className="shrink-0">{label || 'Copy into'}</span>
          <select value={where} aria-label={label || 'Copy into'} className={`${field} flex-1 min-w-0`}
            onChange={e => { const v = e.target.value; set(v === '__mine' ? { on: false } : v === '__new' ? { on: true, bookId: '' } : { on: true, bookId: v }); }}>
            {!noMine && <option value="__mine">My songs</option>}
            {have.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="__new">New book…</option>
          </select>
        </label>
        {newBook}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <label className={`flex items-center gap-2 text-sm ${head}`}>
        <input type="checkbox" checked={value.on} onChange={e => set({ on: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
        {label || (one ? 'Put it in a book' : 'Keep these as a book')}
      </label>
      {value.on && have.length > 0 && (
        <select value={value.bookId} onChange={e => set({ bookId: e.target.value })} aria-label="Book" className={field}>
          {have.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          <option value="">New book…</option>
        </select>
      )}
      {newBook}
    </div>
  );
}
