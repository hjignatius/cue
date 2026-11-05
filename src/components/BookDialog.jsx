import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { shelves, removeBookPlan } from '../utils/books.js';
import { CloseCircle } from './CornerClose.jsx';
import RoundButton, { ROUND_FILL_DANGER, ROUND_SIZE_ACTION } from './RoundButton.jsx';

// One book or shelf, from its ⋮ in the Library's switch (BooksMenu): rename it,
// put a book on a shelf — one already there, or a new one named here — or
// merge it into another book, or delete it. Merging moves every one of its
// songs into the other book and removes this one. Deleting says what it will do before it does it: a book's songs
// you never used go, the ones you did stay as My songs. Removing a shelf: its
// books stay, on no shelf, and no song goes.
//
// `record` is the book or shelf, or { kind: 'shelf' } for a new shelf.
// onSave({ name, shelfId, newShelf }) — newShelf is a name, when the book goes
// on a shelf made here. No dimmed backdrop, as everywhere in Cue.

export default function BookDialog({ dark, record, records, songs, onSave, onRemove, onMerge, onClose }) {
  const isBook = record.kind === 'book';
  const isNew = !record.id;
  const [name, setName] = useState(record.name || '');
  const [shelfId, setShelfId] = useState(record.shelfId || '');
  const [newShelf, setNewShelf] = useState('');
  const [confirming, setConfirming] = useState(false);
  const others = isBook && !isNew ? records.filter(r => r.kind === 'book' && r.id !== record.id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : [];
  const [mergeInto, setMergeInto] = useState(null); // the other book's id, while choosing
  const songCount = isBook && !isNew ? songs.filter(s => s.bookId === record.id).length : 0;
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
        <div className="flex items-center justify-between">
          <h2 className={`text-base font-semibold ${head}`}>{isNew ? 'New shelf' : isBook ? 'Book' : 'Shelf'}</h2>
          <CloseCircle dark={dark} label="Cancel" onClick={onClose} className="-mt-3 -mb-1 -mr-4" />
        </div>

        {!confirming && mergeInto === null && (
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
            <div className="flex items-center gap-2">
              {others.length > 0 && (
                <button onClick={() => setMergeInto(others[0].id)} className={`${secondary} h-11`}>Merge…</button>
              )}
              <button onClick={save} disabled={!ok} className="flex-1 h-11 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors">
                {isNew ? 'Make shelf' : 'Save'}
              </button>
              {!isNew && (
                <RoundButton size={ROUND_SIZE_ACTION} label={isBook ? 'Delete book' : 'Remove shelf'} title={isBook ? 'Delete book' : 'Remove shelf'}
                  onActivate={() => setConfirming(true)} fill={ROUND_FILL_DANGER} color="#fff" touchAction="manipulation">
                  <Trash2 size={20} />
                </RoundButton>
              )}
            </div>
          </>
        )}

        {mergeInto !== null && (
          <>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              Merge “{record.name}” into
              <select value={mergeInto} onChange={e => setMergeInto(e.target.value)} className={field}>
                {others.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <p className={`text-sm ${muted}`}>
              Its {n(songCount, 'song')} {songCount === 1 ? 'moves' : 'move'} into “{others.find(b => b.id === mergeInto)?.name}”, and “{record.name}” is removed. No songs are removed.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setMergeInto(null)} className={secondary}>Back</button>
              <button onClick={() => onMerge(mergeInto)} className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors">
                Merge
              </button>
            </div>
          </>
        )}

        {confirming && (
          <>
            <p className={`text-sm ${head}`}>{isBook ? 'Delete' : 'Remove'} “{record.name}”?</p>
            <p className={`text-sm ${muted}`}>
              {isBook
                ? <>{plan.remove.length ? <>{n(plan.remove.length, 'song')} you haven’t used will be deleted.</> : <>Every song in it is one you’ve used.</>}{' '}
                    {plan.keep.length ? <>{n(plan.keep.length, 'song')} you’ve put in a set, inked or added to My songs {plan.keep.length === 1 ? 'stays' : 'stay'}, in My songs.</> : null}</>
                : <>{onShelf ? <>Its {n(onShelf, 'book')} {onShelf === 1 ? 'stays' : 'stay'}, on no shelf.</> : <>There are no books on it.</>} No songs are removed.</>}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} className={secondary}>Back</button>
              <button onClick={onRemove} className="flex-1 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors">
                {isBook ? 'Delete book' : 'Remove shelf'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
