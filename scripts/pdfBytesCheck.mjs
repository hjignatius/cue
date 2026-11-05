// PDFs saved before they were stored as bytes get rewritten when Cue opens.
//
// Starts from a library as 1.9 leaves it: version 4, PDFs held as Blobs. Those
// are the form Mac Safari can lose, so a 2.0 that only read them would leave
// every existing PDF exposed. What matters here is that nothing is ever lost on
// the way: a PDF that won't read keeps its record and gets another go, and one
// replaced during the conversion isn't overwritten with the old copy.
//
// Run: node scripts/pdfBytesCheck.mjs
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
console.warn = () => {};   // it says why a PDF wouldn't convert; not wanted here

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};
const FLAG = 'cue:pdf_bytes_v1';
const text = (buf) => Buffer.from(buf).toString();
const OLD = '2026-01-01T00:00:00.000Z';

// ---- the library 1.9 leaves --------------------------------------------------
const v4 = await openDB('cue-db', 4, {
  upgrade(d) { for (const [name, keyPath] of [['songs', 'id'], ['sets', 'id'], ['annotations', 'songId'], ['pdfs', 'songId'], ['sharedSets', 'token']]) d.createObjectStore(name, { keyPath }); },
});
const pdfSong = (id) => ({ id, metadata: { title: id }, text: '', type: 'pdf', pdfUploaded: true, createdAt: OLD, updatedAt: OLD });
await v4.put('songs', pdfSong('a'));
await v4.put('songs', pdfSong('b'));
await v4.put('pdfs', { songId: 'a', blob: new Blob(['%PDF first'], { type: 'application/pdf' }) });
await v4.put('pdfs', { songId: 'b', blob: new Blob(['%PDF second']) });
await v4.put('pdfs', { songId: 'new', bytes: new TextEncoder().encode('%PDF already').buffer, type: 'application/pdf' });
v4.close();

const S = await import('../src/utils/storage.js');

// ---- 1. opening Cue converts them --------------------------------------------
const db = await S.getDB();
for (let i = 0; i < 200 && !localStorage.getItem(FLAG); i++) await new Promise(r => setTimeout(r, 5));
const a = await db.get('pdfs', 'a'), b = await db.get('pdfs', 'b');
check('it runs by itself when Cue opens', localStorage.getItem(FLAG), '1');
check('now bytes, no Blob', [a.bytes instanceof ArrayBuffer, 'blob' in a], [true, false]);
check('the same PDF', text(a.bytes), '%PDF first');
check('its type is kept', a.type, 'application/pdf');
check('a Blob with no type reads as a PDF', [text(b.bytes), b.type], ['%PDF second', 'application/pdf']);
check('it still loads', await (await S.loadPdfBlob('a')).text(), '%PDF first');
check('one already bytes is left alone', text((await db.get('pdfs', 'new')).bytes), '%PDF already');

// ---- 2. the songs don't change -----------------------------------------------
const songA = (await S.loadSongs()).find(s => s.id === 'a');
check('no song is touched, so no set reads SEND CHANGES', [songA.updatedAt, songA.pdfUploaded], [OLD, true]);

// ---- 3. once only ------------------------------------------------------------
check('a second run does nothing', await S.convertOldPdfs(db), { converted: 0, failed: 0 });

// ---- 4. one that won't read stays, and gets another go ------------------------
const realRead = Blob.prototype.arrayBuffer;
const failFor = (size) => { Blob.prototype.arrayBuffer = function () { return this.size === size ? Promise.reject(new Error('lost')) : realRead.call(this); }; };
localStorage.removeItem(FLAG);
await db.put('pdfs', { songId: 'dead', blob: new Blob(['1234567']) });        // 7 bytes
await db.put('pdfs', { songId: 'empty', blob: new Blob([]) });
await db.put('pdfs', { songId: 'fine', blob: new Blob(['%PDF fine']) });
failFor(7);
check('the others still go through', await S.convertOldPdfs(db), { converted: 1, failed: 2 });
check('its record is left as it was', [!!(await db.get('pdfs', 'dead')).blob, !!(await db.get('pdfs', 'empty')).blob], [true, true]);
check('so the flag stays down', localStorage.getItem(FLAG), null);
check('the good one converted', text((await db.get('pdfs', 'fine')).bytes), '%PDF fine');
Blob.prototype.arrayBuffer = realRead;
await db.delete('pdfs', 'empty');
check('next launch it goes through', await S.convertOldPdfs(db), { converted: 1, failed: 0 });
check('and the flag goes up', localStorage.getItem(FLAG), '1');

// ---- 5. a PDF replaced meanwhile isn't overwritten ---------------------------
localStorage.removeItem(FLAG);
await db.put('pdfs', { songId: 'swap', blob: new Blob(['123456789012345']) }); // 15 bytes
Blob.prototype.arrayBuffer = function () {
  if (this.size !== 15) return realRead.call(this);
  return S.savePdfBlob('swap', new Blob(['%PDF replaced'])).then(() => realRead.call(this));
};
check('nothing to convert after all', await S.convertOldPdfs(db), { converted: 0, failed: 0 });
Blob.prototype.arrayBuffer = realRead;
check('the new PDF stands', text((await db.get('pdfs', 'swap')).bytes), '%PDF replaced');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
