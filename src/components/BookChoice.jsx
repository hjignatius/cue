import { shelves } from '../utils/books.js';

// "Keep these as a book" in the import lists (SongbookDialog, PagePicker): the
// tick, the book's name, and the shelf it goes on — none, one already there, or
// a new one named here. A songbook starts ticked; a batch of sheets doesn't
// (books.js).
//
// value: { on, name, shelfId, newShelf }. bookChoice(value) is what the import
// is given: { name, shelfId, newShelf } or null.

export const startBook = (on, name) => ({ on, name, shelfId: '', newShelf: '' });

export function bookChoice(value) {
  if (!value?.on || !value.name.trim()) return null;
  const making = value.shelfId === '__new' && value.newShelf.trim();
  return { name: value.name.trim(), shelfId: making || value.shelfId === '__new' ? null : value.shelfId || null, newShelf: making ? value.newShelf.trim() : null };
}

export default function BookChoice({ dark, records, value, onChange }) {
  const head = dark ? 'text-gray-100' : 'text-gray-900';
  const field = `rounded-lg px-3 py-2 text-sm border ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-2">
      <label className={`flex items-center gap-2 text-sm ${head}`}>
        <input type="checkbox" checked={value.on} onChange={e => set({ on: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
        Keep these as a book
      </label>
      {value.on && (
        <div className="flex gap-2">
          <input value={value.name} onChange={e => set({ name: e.target.value })} aria-label="Book name" className={`${field} flex-1 min-w-0`} />
          <select value={value.shelfId} onChange={e => set({ shelfId: e.target.value })} aria-label="Shelf" className={`${field} w-36 shrink-0`}>
            <option value="">No shelf</option>
            {shelves(records).sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__new">New shelf…</option>
          </select>
        </div>
      )}
      {value.on && value.shelfId === '__new' && (
        <input value={value.newShelf} onChange={e => set({ newShelf: e.target.value })} placeholder="Shelf name, e.g. Club" aria-label="New shelf name" className={field} />
      )}
    </div>
  );
}
