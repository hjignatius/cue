// Books and shelves in storage (storage.js): songs imported before books are
// sorted into them once, using a book song makes it yours without making its
// sets read SEND CHANGES, removing a book keeps the songs you used, removing a
// shelf removes no song, and a wipe takes the books with it.
//
// Starts from a database as Cue left it before books (version 4), so the
// sorting runs exactly as it will on a device that has imported books already.
//
// Run: node scripts/bookStoreCheck.mjs
import 'fake-indexeddb/auto';
import { openDB } from 'idb';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  clear: () => mem.clear(),
  get length() { return mem.size; },
};
localStorage.setItem('cue:idb_migrated', '1');
localStorage.setItem('cue:schema_version', '3');

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

const OLD = '2026-01-01T00:00:00.000Z';
const song = (id, extra = {}) => ({ id, metadata: { title: id }, text: '[G]x', type: 'text', pedalActive: false, createdAt: OLD, updatedAt: OLD, ...extra });

// ---- the library before books ----------------------------------------------------
const v4 = await openDB('cue-db', 4, {
  upgrade(d) { for (const [name, keyPath] of [['songs', 'id'], ['sets', 'id'], ['annotations', 'songId'], ['pdfs', 'songId'], ['sharedSets', 'token']]) d.createObjectStore(name, { keyPath }); },
});
await v4.put('songs', song('mine'));
await v4.put('songs', song('fm1', { source: { book: 'Farmers Market.pdf', page: 1 } }));
await v4.put('songs', song('fm2', { source: { book: 'Farmers Market.pdf', page: 2 } }));
await v4.put('songs', song('fm3', { source: { book: 'Farmers Market.pdf', page: 3 } }));
await v4.put('songs', song('mo1', { source: { book: 'Moselele.pdf', page: 4 } }));
await v4.put('sets', { id: 'gig', name: 'Gig', songIds: ['fm2'], sortMode: 'custom', createdAt: OLD, updatedAt: OLD });
await v4.put('annotations', { songId: 'fm3', strokes: [{ id: 's' }] });
v4.close();

const S = await import('../src/utils/storage.js');
const { loadSongs, loadBooks, saveSong, saveSet, markSongsUsed, removeBook, removeShelf, saveBookRecord, saveBookChoice, mergeBooks, dropEmptyBooks, deleteSong, savePdfBlob, loadPdfBlob, clearLibrary } = S;
const byId = async () => new Map((await loadSongs()).map(s => [s.id, s]));

// ---- 1. sorted into books, once ---------------------------------------------------
let books = await loadBooks();
check('a book for each book file', books.map(b => [b.kind, b.name, b.file]).sort(),
  [['book', 'Farmers Market', 'Farmers Market.pdf'], ['book', 'Moselele', 'Moselele.pdf']]);
const fm = books.find(b => b.name === 'Farmers Market').id;
let s = await byId();
check('each song into its book; the one in a set and the inked one are yours',
  ['fm1', 'fm2', 'fm3'].map(id => [s.get(id).bookId === fm, s.get(id).mine]), [[true, false], [true, true], [true, true]]);
check('a song not from a book is left as it was', [s.get('mine').bookId, s.get('mine').mine], [undefined, undefined]);
check('sorting changes no song’s edit time', [...s.values()].every(x => x.updatedAt === OLD), true);

// ---- 2. using a book song makes it yours ---------------------------------------------
await saveSet({ id: 'gig', name: 'Gig', songIds: ['fm2', 'fm1'], sortMode: 'custom' });
s = await byId();
check('put in a set, a book song is yours', s.get('fm1').mine, true);
check('…and its edit time is as it was, so a published set doesn’t read SEND CHANGES', s.get('fm1').updatedAt, OLD);
check('marking a song already yours, or one not from a book, changes nothing', await markSongsUsed(['fm1', 'mine', 'nope']), 0);
const mo = books.find(b => b.name === 'Moselele').id;
await saveSong({ ...s.get('mo1'), metadata: { title: 'Edited' }, bookId: undefined, mine: undefined });
check('a later save that doesn’t mention the book keeps it', (await byId()).get('mo1').bookId, mo);
check('saving it (as the editor does) doesn’t make it yours', (await byId()).get('mo1').mine, false);
const editedAt = (await byId()).get('mo1').updatedAt;
await S.setSongMine('mo1', true);
check('choosing Add to My songs does, without touching its edit time', [(await byId()).get('mo1').mine, (await byId()).get('mo1').updatedAt], [true, editedAt]);
await S.setSongMine('mo1', false);
check('…and Take out of My songs undoes it', (await byId()).get('mo1').mine, false);
await saveSet({ id: null, name: 'Again', songIds: ['mo1'] });
check('…after which a set of your own makes it yours again', [(await byId()).get('mo1').mine, await markSongsUsed(['mo1'])], [true, 0]);

// ---- 3. removing a book ----------------------------------------------------------------
await saveSong(song('fm4', { bookId: fm, mine: false, type: 'pdf' }));
await savePdfBlob('fm4', new Blob(['%PDF']));
check('removing a book says what it did', await removeBook(fm), { removed: 1, kept: 3 });
s = await byId();
check('the song you never used is gone, with its PDF', [s.has('fm4'), await loadPdfBlob('fm4')], [false, null]);
check('the ones you used stay, in no book', ['fm1', 'fm2', 'fm3'].map(id => [s.has(id), s.get(id).bookId, s.get(id).mine]),
  [[true, undefined, true], [true, undefined, true], [true, undefined, true]]);
check('the book is gone', (await loadBooks()).some(b => b.id === fm), false);

// ---- 4. shelves ---------------------------------------------------------------------------
const club = await saveBookRecord({ kind: 'shelf', name: 'Club' });
await saveBookRecord({ ...(await loadBooks()).find(b => b.id === mo), shelfId: club.id });
check('a book goes on a shelf', (await loadBooks()).find(b => b.id === mo).shelfId, club.id);
const before = (await loadSongs()).length;
await removeShelf(club.id);
books = await loadBooks();
check('removing a shelf leaves its books, on no shelf, and every song', [books.some(b => b.id === club.id), books.find(b => b.id === mo).shelfId, (await loadSongs()).length],
  [false, null, before]);

// ---- 4b. sets that came with their songs, and merging --------------------------------
// A friend's set, imported or copied from a share, comes with its songs: they stay
// in their book, not yours, and reordering that set doesn't change it. Adding one
// of them to a set of your own does.
const friends = await saveBookChoice({ name: 'Pat’s set', shelfId: null, newShelf: 'Friends' });
const fb = (await loadBooks()).find(b => b.id === friends);
check('…named, on the new shelf', [fb.name, (await loadBooks()).find(r => r.id === fb.shelfId)?.name], ['Pat’s set', 'Friends']);
await saveSong(song('p1', { bookId: friends, mine: false }));
await saveSong(song('p2', { bookId: friends, mine: false }));
const pats = await saveSet({ id: null, name: 'Pat’s set', songIds: ['p1', 'p2'], markUsed: false });
s = await byId();
check('a set imported with its songs leaves them in the book', [s.get('p1').mine, s.get('p2').mine], [false, false]);
await saveSet({ ...pats, songIds: ['p2', 'p1'] });
s = await byId();
check('…and reordering it doesn’t make them yours', [s.get('p1').mine, s.get('p2').mine], [false, false]);
await saveSet({ id: null, name: 'Mine', songIds: ['p2'] });
check('putting one in a set of your own does', [(await byId()).get('p1').mine, (await byId()).get('p2').mine], [false, true]);
const other = await saveBookChoice({ name: 'Pat’s other set', shelfId: fb.shelfId, newShelf: null });
const bookCount = (await loadBooks()).length;
check('a song put into a book already there goes into that one, and makes no new book',
  [await saveBookChoice({ bookId: other }), (await loadBooks()).length], [other, bookCount]);
await saveSong(song('p3', { bookId: other, mine: false }));
check('merging a book moves every song, used or not, and says how many', await mergeBooks(friends, other), 2);
s = await byId();
check('…into the other book, each still yours or not as before', ['p1', 'p2', 'p3'].map(id => [s.get(id).bookId === other, s.get(id).mine]),
  [[true, false], [true, true], [true, false]]);
check('…and the merged book is gone', (await loadBooks()).some(b => b.id === friends), false);
check('merging a book into itself does nothing', [await mergeBooks(other, other), (await loadBooks()).some(b => b.id === other)], [0, true]);

// ---- 5. a PDF is stored as bytes --------------------------------------------------
// Mac Safari kept a book's songs but not their PDFs when the PDF went in as a
// Blob; bytes are stored as plainly as a song is.
check('a stored PDF says it was stored', await savePdfBlob('p1', new Blob(['%PDF-1.7 x'], { type: 'application/pdf' })), true);
const raw = await (await S.getDB()).get('pdfs', 'p1');
check('…as bytes, not a Blob', [raw.bytes instanceof ArrayBuffer, 'blob' in raw, raw.type], [true, false, 'application/pdf']);
const back = await loadPdfBlob('p1');
check('…and reads back the same', [back instanceof Blob, back.type, await back.text()], [true, 'application/pdf', '%PDF-1.7 x']);
await (await S.getDB()).put('pdfs', { songId: 'p0', blob: new Blob(['%PDF old']) });
check('a PDF stored the old way still opens', await (await loadPdfBlob('p0')).text(), '%PDF old');

// ---- 5b. a book whose last song is deleted -----------------------------------------
const shelf = await saveBookRecord({ kind: 'shelf', name: 'Tidy' });
const tidy = await saveBookChoice({ name: 'Two songs', shelfId: shelf.id, newShelf: null });
await saveSong(song('t1', { bookId: tidy, mine: false }));
await saveSong(song('t2', { bookId: tidy, mine: true }));
const keptBooks = (await loadBooks()).filter(b => b.kind === 'book').map(b => b.id).sort();
await deleteSong('t1');
check('a book with a song left stays, even when that song is yours', [await dropEmptyBooks(), (await loadBooks()).some(b => b.id === tidy)], [0, true]);
await deleteSong('t2');
check('deleting its last song takes the book', [await dropEmptyBooks(), (await loadBooks()).some(b => b.id === tidy)], [1, false]);
check('…but not its shelf, now empty', (await loadBooks()).some(b => b.id === shelf.id), true);
check('…nor any other book', (await loadBooks()).filter(b => b.kind === 'book').map(b => b.id).sort(), keptBooks.filter(id => id !== tidy));

// ---- 6. a wipe ----------------------------------------------------------------------------
await clearLibrary();
check('clearing the library clears the books too', [(await loadSongs()).length, (await loadBooks()).length], [0, 0]);
await saveBookRecord({ id: 'b9', kind: 'book', name: 'Again' });
await saveSong(song('again', { bookId: 'b9', mine: false }));
await saveSet({ id: null, name: 'Next', songIds: ['again'] });
check('…and a song restored after it is marked used afresh when put in a set', (await byId()).get('again').mine, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
