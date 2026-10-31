import { BookOpen, ChevronDown, Library, MoreVertical, Plus, User } from 'lucide-react';
import { dismissOnOutside } from '../utils/overlayDismiss.js';
import { shelfTree, viewName, normalizeView } from '../utils/books.js';

// The Library's switch: My songs, All songs, and every book — on its shelf, or
// under Books when it is on none (books.js). Each book and shelf has a ⋮ for
// renaming it, moving it, or removing it (BookDialog). The button shows what
// you are looking at and how many songs that is.
//
// No dimmed backdrop, as everywhere in Cue.

const plural = (n) => `${n.toLocaleString()} ${n === 1 ? 'song' : 'songs'}`;

export default function BooksMenu({ dark, open, onToggle, view, records, songs, shown, onView, onEdit, onNewShelf }) {
  const v = normalizeView(view, records);
  const tree = open ? shelfTree(records, songs) : null;
  const any = tree && (tree.shelves.length || tree.loose.length);
  const row = 'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors';
  const idle = dark ? 'text-gray-100 hover:bg-gray-700' : 'text-gray-800 hover:bg-gray-100';
  const current = dark ? 'bg-indigo-900/50 text-white' : 'bg-indigo-50 text-indigo-900';
  const count = 'ml-auto text-xs tabular-nums text-gray-400 dark:text-gray-500';
  const is = (kind, id) => v.kind === kind && (id === undefined || v.id === id);
  const pick = (next) => { onView(next); onToggle(false); };
  const label = 'px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500';

  const Item = ({ kind, id, icon: Icon, name, n, indent, record }) => (
    <div className={`flex items-center ${is(kind, id) ? current : idle}`}>
      <button onClick={() => pick(id ? { kind, id } : { kind })} className={`${row} min-w-0 ${indent ? 'pl-7' : ''}`}>
        {Icon && <Icon size={15} className="shrink-0 opacity-70" />}
        <span className="truncate">{name}</span>
        <span className={count}>{n.toLocaleString()}</span>
      </button>
      {record && (
        <button onClick={() => { onToggle(false); onEdit(record); }} aria-label={`${record.kind === 'shelf' ? 'Shelf' : 'Book'} options for ${record.name}`}
          className="shrink-0 p-2 mr-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <MoreVertical size={15} />
        </button>
      )}
    </div>
  );

  return (
    <div className="relative">
      <button onClick={() => onToggle(!open)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-1 text-xs tabular-nums text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 max-w-[16rem]">
        <span className={`font-medium truncate ${v.kind === 'mine' ? '' : 'text-indigo-600 dark:text-indigo-400'}`}>{viewName(v, records)}</span>
        <span className="shrink-0">· {plural(shown)}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" {...dismissOnOutside(() => onToggle(false))} />
          <div role="menu" className="absolute left-0 top-full mt-1 z-20 w-72 max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1">
            <Item kind="mine" icon={User} name="My songs" n={tree.mine} />
            <Item kind="all" icon={Library} name="All songs" n={tree.all} />
            {tree.shelves.map(({ shelf, books, count: n }) => (
              <div key={shelf.id}>
                <Item kind="shelf" id={shelf.id} name={shelf.name} n={n} record={shelf} />
                {books.map(({ book, count: m }) => (
                  <Item key={book.id} kind="book" id={book.id} icon={BookOpen} name={book.name} n={m} indent record={book} />
                ))}
                {!books.length && <p className="pl-7 pr-3 pb-2 text-xs text-gray-400 dark:text-gray-500">No books on this shelf yet.</p>}
              </div>
            ))}
            {tree.loose.length > 0 && (
              <>
                <p className={label}>{tree.shelves.length ? 'Books on no shelf' : 'Books'}</p>
                {tree.loose.map(({ book, count: m }) => (
                  <Item key={book.id} kind="book" id={book.id} icon={BookOpen} name={book.name} n={m} record={book} />
                ))}
              </>
            )}
            {!any && (
              <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                Import a songbook PDF and its songs come in as a book of their own, here.
              </p>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
              <button onClick={() => { onToggle(false); onNewShelf(); }} className={`${row} ${idle}`}>
                <Plus size={15} className="shrink-0 opacity-70" /> New shelf
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
