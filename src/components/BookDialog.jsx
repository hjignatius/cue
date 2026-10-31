import { useState } from 'react';
import { shelves, removeBookPlan } from '../utils/books.js';

// One book or shelf, from its ⋮ in the Library's switch (BooksMenu): rename it,
// put a book on a shelf — one already there, or a new one named here — or
// remove it. Removing says what it will do before it does it: a book's songs
// you never used go, the ones you did stay as My songs; a shelf's books stay,
// on no shelf, and no song goes.
//
// `record` is the book or shelf, or { kind: 'shelf' } for a new shelf.
// onSave({ name, shelfId, newShelf }) — newShelf is a name, when the book goes
// on a shelf made here. No dimmed backdrop, as everywhere in Cue.

export default function BookDialog({ dark, record, records, songs, onSave, onRemove, onClose }) {
  const isBook = record.kind === 'book';
  const isNew = !record.id;
  const [name, setName] = useState(record.name || '');
  const [shelfId, setShelfId] = useState(record.shelfId || '');
  const [newShelf, setNewShelf] = useState('');
  const [confirming, setConfirming] = useState(false);
  const plan = isBook && !isNew ? removeBookPlan(record.id, songs) : null;
  const onShelf = !isBook && !isNew ? records.filter(r => r.kind === 'book' && r.shelfId === record.id).length : 0;

  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const head = dark ? 'text-white' : 'text-gray-900';
  const field = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 ${dark ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const secondary = `flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  const making = shelfId === '__new';
  const ok = name.trim() && (!making || newShelf.trim());
  const save = () => ok && onSave({ name: name.trim(), shelfId: making || !shelfId ? null : shelfId, newShelf: making ? newShelf.trim() : null });
  const n = (k, word) => `${k.toLocaleString()} ${word}${k === 1 ? '' : 's'}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div className={`w-[24rem] max-w-full rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <h2 className={`text-base font-semibold ${head}`}>{isNew ? 'New shelf' : isBook ? 'Book' : 'Shelf'}</h2>

        {!confirming && (
          <>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              Name
              <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} className={field} />
            </label>
            {isBook && (
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                Shelf
                <select value={shelfId} onChange={e => setShelfId(e.target.value)} className={field}>
                  <option value="">No shelf</option>
                  {shelves(records).sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="__new">New shelf…</option>
                </select>
                {making && <input value={newShelf} onChange={e => setNewShelf(e.target.value)} placeholder="Shelf name, e.g. Club" aria-label="New shelf name" className={field} />}
              </label>
            )}
            <div className="flex gap-2">
              <button onClick={onClose} className={secondary}>Cancel</button>
              <button onClick={save} disabled={!ok} className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors">
                {isNew ? 'Make shelf' : 'Save'}
              </button>
            </div>
            {!isNew && (
              <button onClick={() => setConfirming(true)} className="text-xs py-1 text-center text-red-600 dark:text-red-400 hover:underline">
                {isBook ? 'Remove book…' : 'Remove shelf…'}
              </button>
            )}
          </>
        )}

        {confirming && (
          <>
            <p className={`text-sm ${head}`}>Remove “{record.name}”?</p>
            <p className={`text-sm ${muted}`}>
              {isBook
                ? <>{plan.remove.length ? <>{n(plan.remove.length, 'song')} you haven’t used will be removed.</> : <>Every song in it is one you’ve used.</>}{' '}
                    {plan.keep.length ? <>{n(plan.keep.length, 'song')} you’ve put in a set, edited or inked {plan.keep.length === 1 ? 'stays' : 'stay'}, in My songs.</> : null}</>
                : <>{onShelf ? <>Its {n(onShelf, 'book')} {onShelf === 1 ? 'stays' : 'stay'}, on no shelf.</> : <>There are no books on it.</>} No songs are removed.</>}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} className={secondary}>Back</button>
              <button onClick={onRemove} className="flex-1 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors">
                {isBook ? 'Remove book' : 'Remove shelf'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
