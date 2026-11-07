// Books and shelves (src/utils/books.js): which songs are yours, what each view
// of the Library shows, the switch's counts, what removing a book does, and
// how songs imported before books existed are sorted into them.
//
// Run: node scripts/booksCheck.mjs
import { bookNamed, isMine, mineIn, songsInView, viewName, normalizeView, shelfTree, removeBookPlan, booksFromSources, bookName, wholeBooks, selectionBook, wholeBookDelete } from '../src/utils/books.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

const records = [
  { id: 'club', kind: 'shelf', name: 'Club' },
  { id: 'xmas', kind: 'shelf', name: 'Christmas' },
  { id: 'fm', kind: 'book', name: 'Farmers Market', shelfId: 'club' },
  { id: 'mos', kind: 'book', name: 'Moselele Book 5', shelfId: 'club' },
  { id: 'jim', kind: 'book', name: 'Jim’s Christmas', shelfId: 'xmas' },
  { id: 'wed', kind: 'book', name: 'Ukulele Wednesdays', shelfId: null },
];
const songs = [
  { id: 'a' },                                   // typed in: yours
  { id: 'b', bookId: 'fm' },                     // in a book, never used
  { id: 'c', bookId: 'fm', mine: true },         // in a book, used
  { id: 'd', bookId: 'mos' },
  { id: 'e', bookId: 'jim' },
  { id: 'f', bookId: 'wed' },
  { id: 'g', bookId: 'gone' },                   // its book isn't here
];
const ids = (list) => list.map(s => s.id);

// ---- 1. whose songs ----------------------------------------------------------
check('a song not from a book is yours; one from a book only once used',
  [isMine(songs[0]), isMine(songs[1]), isMine(songs[2])], [true, false, true]);
check('a song whose book isn’t here is yours, knowing the books', [isMine(songs[6]), mineIn(records)(songs[6])], [false, true]);

// ---- 2. what each view shows -------------------------------------------------
check('My songs: your own and the book songs you used', ids(songsInView(songs, { kind: 'mine' }, records)), ['a', 'c', 'g']);
check('All songs: every one', ids(songsInView(songs, { kind: 'all' }, records)), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
check('a book: its songs, used or not', ids(songsInView(songs, { kind: 'book', id: 'fm' }, records)), ['b', 'c']);
check('a shelf: the songs of every book on it', ids(songsInView(songs, { kind: 'shelf', id: 'club' }, records)), ['b', 'c', 'd']);
check('a book or shelf that is gone shows My songs',
  [normalizeView({ kind: 'book', id: 'nope' }, records), normalizeView({ kind: 'shelf', id: 'fm' }, records), normalizeView(null, records)],
  [{ kind: 'mine' }, { kind: 'mine' }, { kind: 'mine' }]);
check('the switch names what it shows',
  [viewName({ kind: 'mine' }, records), viewName({ kind: 'all' }, records), viewName({ kind: 'book', id: 'jim' }, records), viewName({ kind: 'shelf', id: 'club' }, records)],
  ['My songs', 'All songs', 'Jim’s Christmas', 'Club']);

// ---- 3. the switch's counts ----------------------------------------------------
const tree = shelfTree(records, songs);
check('counts: My songs and All songs', [tree.mine, tree.all], [3, 7]);
check('shelves A–Z, each with its books A–Z and their songs counted',
  tree.shelves.map(s => [s.shelf.name, s.count, s.books.map(b => [b.book.name, b.count])]),
  [['Christmas', 1, [['Jim’s Christmas', 1]]], ['Club', 3, [['Farmers Market', 2], ['Moselele Book 5', 1]]]]);
check('books on no shelf, or on one that is gone, are listed apart',
  shelfTree([...records, { id: 'lost', kind: 'book', name: 'Lost shelf book', shelfId: 'nowhere' }], songs).loose.map(b => b.book.name),
  ['Lost shelf book', 'Ukulele Wednesdays']);
check('an empty shelf is still listed', shelfTree([{ id: 's', kind: 'shelf', name: 'Empty' }], []).shelves.map(s => [s.shelf.name, s.books.length]), [['Empty', 0]]);

// ---- 4. removing a book --------------------------------------------------------
check('removing a book takes the songs you never used and keeps the ones you did',
  removeBookPlan('fm', songs), { remove: ['b'], keep: ['c'] });
check('…and touches no other book', removeBookPlan('mos', songs), { remove: ['d'], keep: [] });

// ---- 5. songs from before books --------------------------------------------------
let n = 0;
const old = [
  { id: 's1', source: { book: 'Farmers Market book 2 - All Songs.pdf', page: 1 } },
  { id: 's2', source: { book: 'Farmers Market book 2 - All Songs.pdf', page: 3 } },
  { id: 's3', source: { book: 'Moselele_Book_7.pdf', page: 2 } },
  { id: 's4' },
  { id: 's5', source: { book: 'Moselele_Book_7.pdf', page: 9 }, bookId: 'already' },
];
const sorted = booksFromSources(old, new Set(['s2']), { now: 'T', newId: () => `b${++n}` });
check('one book per book file, named after it', sorted.books.map(b => [b.id, b.name, b.file]),
  [['b1', 'Farmers Market book 2 - All Songs', 'Farmers Market book 2 - All Songs.pdf'], ['b2', 'Moselele_Book_7', 'Moselele_Book_7.pdf']]);
check('…each song into its book, yours when it is in a set or inked; a song with a book already is left',
  sorted.patches, [{ id: 's1', bookId: 'b1', mine: false }, { id: 's2', bookId: 'b1', mine: true }, { id: 's3', bookId: 'b2', mine: false }]);
check('a book’s name is its file’s, without the .pdf', [bookName('Moselele_Book_7.pdf'), bookName('X.PDF'), bookName('')], ['Moselele_Book_7', 'X', 'Book']);

// ---- selections that are whole books -----------------------------------------
check('a selection takes a book only with every song of it', [wholeBooks(['b'], songs), wholeBooks(['b', 'c', 'd'], songs)], [[], ['fm', 'mos']]);
check('…a song in no book is in none', wholeBooks(['a'], songs), []);
check('an export is named for the book it is', selectionBook(new Set(['b', 'c']), songs, records), 'Farmers Market');
check('…not part of one', selectionBook(['b'], songs, records), null);
check('…not one with more besides', [selectionBook(['b', 'c', 'a'], songs, records), selectionBook(['b', 'c', 'd'], songs, records)], [null, null]);
check('deleting all of a book asks about the songs you’ve used',
  wholeBookDelete(['a', 'b', 'c'], songs, records), { books: ['fm'], used: ['c'], rest: ['a'], names: ['Farmers Market'] });
check('…not when you’ve used none of them', wholeBookDelete(['d'], songs, records), null);
check('…nor when it’s only part of the book', wholeBookDelete(['c'], songs, records), null);

const named = [{ id: 's', kind: 'shelf', name: 'Club' }, { id: 'b', kind: 'book', name: 'Holiday Book' }];
check('a book is found by its name, whatever its capitals or spaces', bookNamed(named, ' holiday  BOOK')?.id, 'b');
check('…never a shelf of that name, and nothing for no name', [bookNamed(named, 'Club'), bookNamed(named, '')], [null, null]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
