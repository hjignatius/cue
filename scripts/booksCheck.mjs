// Books and shelves (src/utils/books.js): which songs are yours, what each view
// of the Library shows, the switch's counts, what removing a book does, and
// how songs imported before books existed are sorted into them.
//
// Run: node scripts/booksCheck.mjs
import { bookNamed, isMine, mineIn, songsInView, viewName, normalizeView, shelfTree, removeBookPlan, booksFromSources, bookName, wholeBooks, selectionBook, wholeBookDelete, booksOf, inBook, placeIn, addToBookPlan, removeFromBookPlan } from '../src/utils/books.js';

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
  removeBookPlan('fm', songs), { remove: ['b'], keep: ['c'], elsewhere: [] });
check('…and touches no other book', removeBookPlan('mos', songs), { remove: ['d'], keep: [], elsewhere: [] });

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

// ---- several books (Add to Book) -------------------------------------------
const multi = [
  { id: 'a' },                                              // typed in, yours
  { id: 'm', bookId: 'fm', moreBooks: ['wed'] },            // in two books, never used
  { id: 'u', bookId: 'fm', moreBooks: ['mos'], mine: true },// in two books and yours
  { id: 'x', bookId: 'jim' },
];
check('every book a song is in, the one it came in with first', [booksOf(multi[1]), booksOf(multi[0]), booksOf({ bookId: 'fm', moreBooks: ['fm', 'wed'] })], [['fm', 'wed'], [], ['fm', 'wed']]);
check('…and in each one', [inBook(multi[1], 'wed'), inBook(multi[1], 'fm'), inBook(multi[1], 'mos'), inBook(multi[0], null)], [true, true, false, false]);
check('placing a song keeps the book it came in with first while it stays in it',
  [placeIn(multi[1], ['wed', 'fm', 'jim']), placeIn(multi[1], ['wed']), placeIn(multi[1], [])],
  [{ id: 'm', bookId: 'fm', moreBooks: ['wed', 'jim'] }, { id: 'm', bookId: 'wed' }, { id: 'm' }]);
check('a book shows every song in it, wherever it came in', ids(songsInView(multi, { kind: 'book', id: 'wed' }, records)), ['m']);
check('a shelf shows a song in two of its books once', ids(songsInView(multi, { kind: 'shelf', id: 'club' }, records)), ['m', 'u']);
const mtree = shelfTree(records, multi);
check('the switch counts a song in each book it is in, and once on a shelf',
  [mtree.shelves.find(s => s.shelf.id === 'club').count, mtree.shelves.find(s => s.shelf.id === 'club').books.map(b => b.count), mtree.loose.map(b => b.count)],
  [2, [2, 1], [1]]);
check('removing a book keeps a song that is also in another, in that one',
  removeBookPlan('fm', multi), { remove: [], keep: ['m', 'u'], elsewhere: ['m', 'u'] });
check('…and a song only in it goes, unless used', removeBookPlan('jim', multi), { remove: ['x'], keep: [], elsewhere: [] });
check('a song whose books are all gone is yours; one still in a book here is not',
  [mineIn(records)({ id: 'q', bookId: 'gone', moreBooks: ['gone2'] }), mineIn(records)({ id: 'q', bookId: 'gone', moreBooks: ['wed'] })], [true, false]);
check('a selection is a whole book counting the songs added to it', wholeBooks(['m'], multi).sort(), ['wed']);

const plan = (tickedIds, opts) => addToBookPlan(tickedIds, multi, opts);
check('copy from My songs into a book: still yours, now in the book too',
  plan(['a'], { intoId: 'wed', from: { kind: 'mine' } }), { patches: [{ id: 'a', bookId: 'wed', mine: true }], added: 1, already: 0, keptForSets: 0 });
check('move from My songs: in the book only',
  plan(['a'], { intoId: 'wed', from: { kind: 'mine' }, move: true }).patches, [{ id: 'a', bookId: 'wed', mine: false }]);
check('…but a song in one of your sets stays in My songs',
  plan(['a'], { intoId: 'wed', from: { kind: 'mine' }, move: true, inSets: new Set(['a']) }), { patches: [{ id: 'a', bookId: 'wed', mine: true }], added: 1, already: 0, keptForSets: 1 });
check('copy from one book to another: one song in both',
  plan(['x'], { intoId: 'wed', from: { kind: 'book', id: 'jim' } }).patches, [{ id: 'x', bookId: 'jim', moreBooks: ['wed'], mine: false }]);
check('move from one book to another: out of the first',
  plan(['x'], { intoId: 'wed', from: { kind: 'book', id: 'jim' }, move: true }).patches, [{ id: 'x', bookId: 'wed', mine: false }]);
check('a song already in the book is counted, not changed',
  plan(['m'], { intoId: 'wed', from: { kind: 'book', id: 'fm' } }), { patches: [], added: 0, already: 1, keptForSets: 0 });
check('…though moving still takes it out of the book it was ticked in',
  plan(['m'], { intoId: 'wed', from: { kind: 'book', id: 'fm' }, move: true }).patches, [{ id: 'm', bookId: 'wed', mine: false }]);
check('into My songs from a book: copy makes it yours and keeps it in the book',
  plan(['x'], { intoId: null, from: { kind: 'book', id: 'jim' } }).patches, [{ id: 'x', bookId: 'jim', mine: true }]);
check('…move takes it out of the book, leaving a plain song of yours',
  plan(['x'], { intoId: null, from: { kind: 'book', id: 'jim' }, move: true }).patches, [{ id: 'x' }]);
check('from All songs nothing is taken out, even asked',
  plan(['x'], { intoId: 'wed', from: { kind: 'all' }, move: true }).patches, [{ id: 'x', bookId: 'jim', moreBooks: ['wed'], mine: false }]);
check('songs not ticked are left alone', plan([], { intoId: 'wed', from: { kind: 'mine' } }), { patches: [], added: 0, already: 0, keptForSets: 0 });

// ---- Delete in a book's list --------------------------------------------------
check('Delete in a book: a song in another book just leaves this one',
  removeFromBookPlan(['m'], multi, 'fm'), { patches: [{ id: 'm', bookId: 'wed' }], remove: [], kept: 1 });
check('…one of yours stays in My songs',
  removeFromBookPlan(['u'], [{ id: 'u', bookId: 'fm', mine: true }], 'fm'), { patches: [{ id: 'u', mine: true }], remove: [], kept: 1 });
check('…one only in this book and never used is deleted', removeFromBookPlan(['x'], multi, 'jim'), { patches: [], remove: ['x'], kept: 0 });
check('…a song not in this book is not touched', removeFromBookPlan(['a', 'x'], multi, 'fm'), { patches: [], remove: [], kept: 0 });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
