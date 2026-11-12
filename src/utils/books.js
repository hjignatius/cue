// Books and shelves: the rules, with no storage in them (storage.js keeps the
// records; scripts/booksCheck.mjs checks these).
//
// A songbook PDF imported into Cue becomes a BOOK of songs. Books sit on
// SHELVES you name ("Club", "Christmas"), or on none. One kind of record holds
// both, told apart by `kind`:
//
//   { id, kind: 'book',  name, shelfId: id | null, file, createdAt }
//   { id, kind: 'shelf', name, createdAt }
//
// A song from a book carries `bookId`. It is one of MY SONGS when it is not from
// a book, or when you have used it — put it in a set of your own, inked it —
// which sets `mine: true` on it (storage.js, markSongsUsed), or chosen Add to
// My songs from its ⋮ (setSongMine, which can take it out again). Editing it
// doesn't: that is your choice to make after. It stays in its book as well:
// one song, seen in both places.
// Removing a book removes the songs you never used and keeps the ones you did.
//
// SEVERAL BOOKS (Add to Book, 2026-11-12). A song can sit in more than one book
// and stay ONE song — an edit shows in every book it is in. `bookId` is still
// the first: the book it came in with, which imports, shares and backups have
// always read. `moreBooks` lists the others, and is there only when there are
// others. booksOf() is every book a song is in; a song with none is one of My
// songs, exactly as before. Changing them never touches `updatedAt`, so a song
// put in a book never reads as edited (SEND CHANGES).

export const booksOf = (song) => {
  const more = Array.isArray(song?.moreBooks) ? song.moreBooks : [];
  return [...new Set([song?.bookId, ...more].filter(Boolean))];
};
export const inBook = (song, id) => !!id && booksOf(song).includes(id);

// The song in exactly these books: the one it came in with stays first while it
// is still among them, else the first given takes its place. No books leaves
// it in none — one of My songs.
export function placeIn(song, ids = []) {
  const list = [...new Set(ids.filter(Boolean))];
  const { bookId: _b, moreBooks: _m, ...rest } = song;
  const first = list.includes(song.bookId) ? song.bookId : list[0];
  if (first) rest.bookId = first;
  const more = list.filter(id => id !== first);
  if (more.length) rest.moreBooks = more;
  return rest;
}

export const isMine = (song) => !song?.bookId || song.mine === true;

// The same, knowing which books there are: a song whose book isn't here — one
// restored without it — is yours, or it would be in no list but All songs.
export function mineIn(records = []) {
  const here = new Set(records.filter(r => r.kind === 'book').map(r => r.id));
  return (song) => isMine(song) || !booksOf(song).some(id => here.has(id));
}

export const books = (records = []) => records.filter(r => r.kind === 'book');
export const shelves = (records = []) => records.filter(r => r.kind === 'shelf');

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });

// The book already called this, if there is one, whatever its capitals or
// spaces. Two books of one name can't be told apart in the Library's switch, so
// a book made with that name is this one (saveBookChoice).
const nameKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const bookNamed = (records = [], name = '') => books(records).find(b => nameKey(b.name) === nameKey(name)) || null;

// The name a book gets from its file: "Moselele_Book5_v1_6.pdf" → "Moselele
// Book5 v1 6" would be worse than the file's own spelling, so only the
// extension goes.
export const bookName = (fileName = '') => String(fileName).replace(/\.pdf$/i, '').trim() || 'Book';

// What the Library shows: { kind: 'mine' } | { kind: 'all' } | { kind: 'book',
// id } | { kind: 'shelf', id }. A book or shelf that is gone is My songs.
export const MY_SONGS = { kind: 'mine' };

export function normalizeView(view, records = []) {
  if (view?.kind === 'all' || view?.kind === 'mine') return { kind: view.kind };
  if ((view?.kind === 'book' || view?.kind === 'shelf') && records.some(r => r.id === view.id && r.kind === view.kind)) {
    return { kind: view.kind, id: view.id };
  }
  return MY_SONGS;
}

export function songsInView(songs = [], view = MY_SONGS, records = []) {
  const v = normalizeView(view, records);
  if (v.kind === 'all') return songs;
  if (v.kind === 'mine') return songs.filter(mineIn(records));
  if (v.kind === 'book') return songs.filter(s => inBook(s, v.id));
  const onShelf = new Set(books(records).filter(b => b.shelfId === v.id).map(b => b.id));
  return songs.filter(s => booksOf(s).some(id => onShelf.has(id)));
}

export function viewName(view, records = []) {
  const v = normalizeView(view, records);
  if (v.kind === 'all') return 'All songs';
  if (v.kind === 'mine') return 'My songs';
  return records.find(r => r.id === v.id)?.name || 'My songs';
}

/**
 * The switch's contents, counted: { mine, all, shelves: [{ shelf, count,
 * books: [{ book, count }] }], loose: [{ book, count }] } — shelves and the
 * books on each A–Z, `loose` the books on no shelf.
 */
export function shelfTree(records = [], songs = []) {
  const perBook = new Map();
  const yours = mineIn(records);
  let mine = 0;
  for (const s of songs) {
    if (yours(s)) mine++;
    for (const id of booksOf(s)) perBook.set(id, (perBook.get(id) || 0) + 1);
  }
  const shelfIds = new Set(shelves(records).map(s => s.id));
  const entry = (book) => ({ book, count: perBook.get(book.id) || 0 });
  const all = books(records).sort(byName);
  // A shelf counts songs, not places: one song in two of its books is one.
  const shelfCount = (on) => {
    const ids = new Set(on.map(b => b.book.id));
    return songs.filter(s => booksOf(s).some(id => ids.has(id))).length;
  };
  return {
    mine,
    all: songs.length,
    shelves: shelves(records).sort(byName).map(shelf => {
      const on = all.filter(b => b.shelfId === shelf.id).map(entry);
      return { shelf, books: on, count: shelfCount(on) };
    }),
    loose: all.filter(b => !b.shelfId || !shelfIds.has(b.shelfId)).map(entry),
  };
}

/**
 * What removing a book does to its songs: { remove: [ids], keep: [ids],
 * elsewhere: [ids] } — the ones you never used go, the ones you did stay (as My
 * songs), and the ones in another book too stay in that book (`elsewhere`, and
 * in `keep`). Kept songs just leave this book.
 */
export function removeBookPlan(bookId, songs = []) {
  const remove = [], keep = [], elsewhere = [];
  for (const s of songs) {
    if (!inBook(s, bookId)) continue;
    const other = booksOf(s).length > 1;
    if (other) elsewhere.push(s.id);
    (s.mine === true || other ? keep : remove).push(s.id);
  }
  return { remove, keep, elsewhere };
}

/**
 * Add to Book: the ticked songs put into the book `intoId`, or into My songs
 * when `intoId` is null. Copy unless `move`, which takes them out of the list
 * they were ticked in, `from` — My songs ({ kind: 'mine' }) or a book ({ kind:
 * 'book', id }); nothing else can be moved from. A song in one of your sets
 * (`inSets`) is never taken out of My songs: a set would be left playing a song
 * that is in no list of yours.
 *
 * Returns { patches: [song], added, already, keptForSets } — `patches` the songs
 * as they should be saved, only those that change.
 */
export function addToBookPlan(ids, songs = [], { intoId = null, from = null, move = false, inSets = new Set() } = {}) {
  const ticked = new Set(ids);
  const fromMine = from?.kind === 'mine';
  const fromBook = from?.kind === 'book' ? from.id : null;
  const patches = [];
  let added = 0, already = 0, keptForSets = 0;
  for (const s of songs) {
    if (!ticked.has(s.id)) continue;
    const had = booksOf(s);
    let list = had;
    let mine = isMine(s);
    const wasThere = intoId ? had.includes(intoId) : mine;
    if (intoId) list = wasThere ? had : [...had, intoId];
    else mine = true;
    if (move && fromBook && fromBook !== intoId) list = list.filter(id => id !== fromBook);
    if (move && fromMine && intoId) {
      if (inSets.has(s.id) && mine) keptForSets++;
      else mine = false;
    }
    if (wasThere) already++; else added++;
    // Mine is only worth saying for a song in a book; with none it is mine anyway.
    const next = placeIn(s, list);
    if (next.bookId) next.mine = mine; else delete next.mine;
    const same = JSON.stringify(booksOf(next)) === JSON.stringify(had) && isMine(next) === isMine(s) && (next.mine === true) === (s.mine === true);
    if (!same) patches.push(next);
  }
  return { patches, added, already, keptForSets };
}

/**
 * The books a selection takes every song of, as ids. `ids` is any list or Set
 * of song ids.
 */
export function wholeBooks(ids, songs = []) {
  const ticked = new Set(ids);
  const books = new Map();
  for (const s of songs) {
    for (const id of booksOf(s)) books.set(id, (books.get(id) ?? true) && ticked.has(s.id));
  }
  return [...books].filter(([, all]) => all).map(([id]) => id);
}

/**
 * The book a selection IS, for naming what is exported: its name when the
 * selection is that one book and nothing else, otherwise null.
 */
export function selectionBook(ids, songs = [], records = []) {
  const [id, another] = wholeBooks(ids, songs);
  if (!id || another || songs.filter(s => inBook(s, id)).length !== new Set(ids).size) return null;
  return records.find(r => r.id === id)?.name || null;
}

/**
 * What to ask before a Delete that takes all of a book, when some of its songs
 * are ones you've used: Delete takes those too, where removing the book would
 * keep them. Returns { books: [id], used: [ids], rest: [ids], names: [name] } —
 * `rest` being what's ticked outside those books — or null with nothing to ask.
 */
export function wholeBookDelete(ids, songs = [], records = []) {
  const books = wholeBooks(ids, songs);
  const inThem = (s) => booksOf(s).some(id => books.includes(id));
  const used = songs.filter(s => inThem(s) && s.mine === true).map(s => s.id);
  if (!used.length) return null;
  const inBooks = new Set(songs.filter(inThem).map(s => s.id));
  return {
    books, used,
    rest: [...new Set(ids)].filter(id => !inBooks.has(id)),
    names: books.map(id => records.find(r => r.id === id)?.name).filter(Boolean),
  };
}

/**
 * Songs imported from a book before books existed carry only `source: { book,
 * page }` — the book's file name. One book each, and the songs already in a set
 * or inked are yours. Returns { books: [record], patches: [{ id, bookId, mine }] }.
 * `used` is the ids of songs in a set or with ink.
 */
export function booksFromSources(songs = [], used = new Set(), { now = new Date().toISOString(), newId = () => crypto.randomUUID() } = {}) {
  const made = new Map();
  const patches = [];
  for (const s of songs) {
    if (s.bookId || !s.source?.book) continue;
    let book = made.get(s.source.book);
    if (!book) {
      book = { id: newId(), kind: 'book', name: bookName(s.source.book), shelfId: null, file: s.source.book, createdAt: now };
      made.set(s.source.book, book);
    }
    patches.push({ id: s.id, bookId: book.id, mine: used.has(s.id) });
  }
  return { books: [...made.values()], patches };
}
