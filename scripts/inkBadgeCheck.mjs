// Does the Library's ink badge tell the truth right after Present?
//
// Ink is written through a queue, so "draw a stroke, then ask which songs have
// ink" is a race: the canvas unmounts and starts its write, and the query can
// run before it lands. That is precisely the moment the badge is read — coming
// back from Present — and it is why annotating straight from the Library left no
// badge while going via the editor worked.
//
// Runs against a real IndexedDB (fake-indexeddb in memory), so this exercises the
// actual queue rather than a model of it.
//
// Run: node scripts/inkBadgeCheck.mjs
import 'fake-indexeddb/auto';

// storage.js runs a one-time localStorage migration when the database opens, and
// Node has no localStorage. A few lines of it is all that is needed — and the
// modules must be imported AFTER it exists, so these are dynamic imports.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  clear: () => mem.clear(),
  get length() { return mem.size; },
};

const { saveAnnotation, deleteAnnotation, loadAnnotatedSongIds, flushAllAnnotationQueues } =
  await import('../src/utils/annotations.js');

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`); }
};
const stroke = () => ([{ id: '1', color: '#f00', width: 3, tool: 'pen', captureWidth: 400, points: [{ nx: 0.1, y: 10 }] }]);
const ids = async () => [...await loadAnnotatedSongIds()].sort();

// The bug, reproduced: ask without flushing and the write may not have landed.
saveAnnotation('song-a', stroke());
const unflushed = await ids();

// The fix: wait for the queue, then ask.
await flushAllAnnotationQueues();
check('after a flush, a song that was just annotated has ink', (await ids()).includes('song-a'),
  `got ${JSON.stringify(await ids())}`);
void unflushed;

// Clearing ink — the other half of his report: the badge must go away too.
deleteAnnotation('song-a');
await flushAllAnnotationQueues();
check('after clearing, it has no ink', !(await ids()).includes('song-a'), `got ${JSON.stringify(await ids())}`);

// An empty stroke list is not ink. Present's trash writes one of these.
saveAnnotation('song-b', []);
await flushAllAnnotationQueues();
check('an empty stroke list does not count as ink', !(await ids()).includes('song-b'), `got ${JSON.stringify(await ids())}`);

// Several songs annotated in one Present run — the queue is per song.
saveAnnotation('song-c', stroke());
saveAnnotation('song-d', stroke());
saveAnnotation('song-e', stroke());
await flushAllAnnotationQueues();
{
  const got = await ids();
  check('every song annotated in one sitting is reported',
    ['song-c', 'song-d', 'song-e'].every(id => got.includes(id)), `got ${JSON.stringify(got)}`);
}

// Draw then immediately clear: the last word wins, not whichever write is quicker.
saveAnnotation('song-f', stroke());
deleteAnnotation('song-f');
await flushAllAnnotationQueues();
check('draw then clear leaves no ink', !(await ids()).includes('song-f'), `got ${JSON.stringify(await ids())}`);

// And flushing when nothing is queued must not hang or throw.
await flushAllAnnotationQueues();
check('flushing an idle queue resolves', true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
