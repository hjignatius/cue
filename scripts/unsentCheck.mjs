// Does Cue know, at sign-out, what the cloud has not got?
//
// Signing out is how the baton passes to another device, and the one thing that
// must not be left behind is work the cloud has never seen. The comparison is
// the same one the set rows make for SEND CHANGES — published time against the
// newest local change across the set AND its songs — so the warning can never
// disagree with the badge it is warning about.
//
// Run: node scripts/unsentCheck.mjs
import 'fake-indexeddb/auto';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  clear: () => mem.clear(),
  get length() { return mem.size; },
};

const { saveSong, saveSet, setsWithUnsentChanges } = await import('../src/utils/storage.js');

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};
const publish = (map) => localStorage.setItem('cue:published_sets', JSON.stringify(map));

const OLD = '2026-01-01T00:00:00.000Z';
const PUB = '2026-06-01T00:00:00.000Z';
const NEW = '2026-09-01T00:00:00.000Z';

const songId = await saveSong({ metadata: { title: 'Quiet' }, text: 'G', createdAt: OLD, updatedAt: OLD });
// saveSet returns the whole entry, not the id — unlike saveSong, which returns
// the id. Worth the note: assuming they matched is what broke this check first.
const setId  = (await saveSet({ id: null, name: 'Friday', songIds: [songId], sortMode: 'custom', createdAt: OLD, updatedAt: OLD, preserveTimestamps: true })).id;

publish({});
check('nothing published, nothing to warn about', await setsWithUnsentChanges(), []);

publish({ [setId]: PUB });
check('published and untouched since', await setsWithUnsentChanges(), []);

// A SONG changed after publishing — the set row counts this, so this must too.
await saveSong({ id: songId, metadata: { title: 'Quiet' }, text: 'G C', createdAt: OLD, updatedAt: NEW });
check('a song changed after publishing counts', await setsWithUnsentChanges(), ['Friday']);

// Back in step.
await saveSong({ id: songId, metadata: { title: 'Quiet' }, text: 'G C', createdAt: OLD, updatedAt: OLD });
check('and stops counting once it is older again', await setsWithUnsentChanges(), []);

// The SET itself changed (a rename, a reorder) with no song touched.
await saveSet({ id: setId, name: 'Friday', songIds: [songId], sortMode: 'custom', createdAt: OLD, updatedAt: NEW, preserveTimestamps: true });
check('a set changed after publishing counts', await setsWithUnsentChanges(), ['Friday']);

// A set that was never published is not this warning's business, however new.
const otherSong = await saveSong({ metadata: { title: 'Loud' }, text: 'D', createdAt: NEW, updatedAt: NEW });
await saveSet({ id: null, name: 'Saturday', songIds: [otherSong], sortMode: 'custom', createdAt: NEW, updatedAt: NEW, preserveTimestamps: true });
check('an unpublished set is never mentioned', await setsWithUnsentChanges(), ['Friday']);

// A published id with no matching set left — deleted locally, still in the cache.
publish({ [setId]: PUB, 'ghost-set-id': PUB });
check('a published id with no set does not crash or appear', await setsWithUnsentChanges(), ['Friday']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
