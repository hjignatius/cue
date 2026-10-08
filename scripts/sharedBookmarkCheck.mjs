// The viewer-side "Shared with me" bookmark row.
//
// The bug: publish a set as "Name 1"; someone bookmarks it; rename the set and
// republish to the same link. Opening the link showed "Name 2" while the row in
// Sets -> Shared with me still said "Name 1", and reopening never fixed it —
// the refresh touched lastLoadedAt and nothing else.
//
// Run: node scripts/sharedBookmarkCheck.mjs

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => store.clear(),
};

const { loadSavedShares, persistSavedShares, syncBookmark, SHARED_WITH_ME_KEY } =
  await import('../src/utils/sharedBookmarks.js');

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

const row = (over = {}) => ({ token: 'abc', setName: 'Name 1', savedAt: 't0', lastLoadedAt: 't0', ...over });

// ---- 1. the reported bug ---------------------------------------------------
let shares = [row()];
let next = syncBookmark(shares, 'abc', { liveName: 'Name 2', cachedAt: null, now: 't1' });
check('a renamed set updates the row', next[0].setName, 'Name 2');
check('...and marks it loaded', next[0].lastLoadedAt, 't1');
check('...without disturbing when it was saved', next[0].savedAt, 't0');
check('the input array is not mutated', shares[0].setName, 'Name 1');

// ---- 2. no change means no write ------------------------------------------
check('same name, cached: nothing to do', syncBookmark([row()], 'abc', { liveName: 'Name 1', cachedAt: 'c' }), null);
check('unknown token: nothing to do', syncBookmark([row()], 'zzz', { liveName: 'Name 2', cachedAt: null }), null);
check('empty list: nothing to do', syncBookmark([], 'abc', { liveName: 'Name 2' }), null);

// ---- 3. a fresh load still stamps the time, name or no name ----------------
next = syncBookmark([row()], 'abc', { liveName: 'Name 1', cachedAt: null, now: 't1' });
check('same name, fresh fetch: timestamp moves', [next[0].setName, next[0].lastLoadedAt], ['Name 1', 't1']);

// ---- 4. cached content: the name syncs, the timestamp must not -------------
// Otherwise a bookmark claims to be fresher than it is.
next = syncBookmark([row()], 'abc', { liveName: 'Name 2', cachedAt: 'c', now: 't1' });
check('cached rename updates the name', next[0].setName, 'Name 2');
check('...but lastLoadedAt stays put', next[0].lastLoadedAt, 't0');

// ---- 5. an empty name never erases a good one ------------------------------
check('a blank live name is ignored', syncBookmark([row()], 'abc', { liveName: '', cachedAt: 'c' }), null);
next = syncBookmark([row()], 'abc', { liveName: '', cachedAt: null, now: 't1' });
check('...even on a fresh load', [next[0].setName, next[0].lastLoadedAt], ['Name 1', 't1']);
// A row saved before a name was known fills in once one arrives.
next = syncBookmark([row({ setName: '' })], 'abc', { liveName: 'Name 2', cachedAt: 'c' });
check('a row with no name takes one', next[0].setName, 'Name 2');

// ---- 6. only the matching row is touched -----------------------------------
const two = [row(), row({ token: 'def', setName: 'Other' })];
next = syncBookmark(two, 'abc', { liveName: 'Name 2', cachedAt: null, now: 't1' });
check('the other bookmark is untouched', next[1], two[1]);
check('row order is preserved', next.map(r => r.token), ['abc', 'def']);

// ---- 7. storage round-trip and bad data ------------------------------------
store.clear();
check('no stored value reads as empty', loadSavedShares(), []);
persistSavedShares([row()]);
check('round-trips through localStorage', loadSavedShares(), [row()]);
localStorage.setItem(SHARED_WITH_ME_KEY, '{not json');
check('corrupt JSON reads as empty', loadSavedShares(), []);
localStorage.setItem(SHARED_WITH_ME_KEY, '{"token":"abc"}');
check('a non-array value reads as empty', loadSavedShares(), []);

// ---- 8. end to end, as he described it -------------------------------------
store.clear();
persistSavedShares([{ token: 'abc', setName: 'Name 1', savedAt: 't0', lastLoadedAt: 't0' }]);
// publisher renames and republishes; viewer opens the same link
const after = syncBookmark(loadSavedShares(), 'abc', { liveName: 'Name 2', cachedAt: null, now: 't1' });
persistSavedShares(after);
check('the Library row now reads Name 2', loadSavedShares()[0].setName, 'Name 2');
// and opening it again changes nothing further
check('reopening is idempotent', syncBookmark(loadSavedShares(), 'abc', { liveName: 'Name 2', cachedAt: 'c' }), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
