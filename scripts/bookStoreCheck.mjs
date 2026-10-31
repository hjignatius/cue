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
const { loadSongs, loadBooks, saveSong, saveSet, markSongsUsed, removeBook, removeShelf, saveBookRecord, savePdfBlob, loadPdfBlob, clearLibrary } = S;
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
check('saving in the editor (then marking it used) makes it yours', [await markSongsUsed(['mo1']), (await byId()).get('mo1').mine], [1, true]);

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

// ---- 6. a wipe ----------------------------------------------------------------------------
await clearLibrary();
check('clearing the library clears the books too', [(await loadSongs()).length, (await loadBooks()).length], [0, 0]);
await saveBookRecord({ id: 'b9', kind: 'book', name: 'Again' });
await saveSong(song('again', { bookId: 'b9', mine: false }));
await saveSet({ id: null, name: 'Next', songIds: ['again'] });
check('…and a song restored after it is marked used afresh when put in a set', (await byId()).get('again').mine, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
