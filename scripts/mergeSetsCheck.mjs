// Merging one set into another.
//
// The rules this guards, all of them Howard's:
//   - the TARGET survives: its songs, their order, and its id (and so its link)
//   - a song already in the target is REFUSED, not repeated
//   - a refused song keeps the position it already had — a merge never reorders
//   - the source's new songs land at the END
//   - nothing is deleted, so the source set is never an input to the result
//   - the published set is the default survivor, because a share link follows
//     the set's ID and not its name
//
// Run: node scripts/mergeSetsCheck.mjs

import { mergedSongIds, mergeCounts, defaultMergeTargetId } from '../src/utils/mergeSets.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- 1. the merged list ----------------------------------------------------
check('the source goes on the end', mergedSongIds(['a', 'b'], ['c', 'd']), ['a', 'b', 'c', 'd']);
check('a song already there is refused', mergedSongIds(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
check('every song already there leaves it unchanged', mergedSongIds(['a', 'b'], ['a', 'b']), ['a', 'b']);
check('an empty source changes nothing', mergedSongIds(['a', 'b'], []), ['a', 'b']);
check('an empty target takes the source whole', mergedSongIds([], ['a', 'b']), ['a', 'b']);
check('two empties', mergedSongIds([], []), []);
check('missing arguments are survivable', mergedSongIds(), []);

// A REFUSED song keeps the position it had in the target — merging must never
// reorder what the target already held, however the source had it ordered.
check('a refused song does not move',
  mergedSongIds(['a', 'b', 'c'], ['c', 'a', 'd']), ['a', 'b', 'c', 'd']);
check('the target order is never rewritten',
  mergedSongIds(['c', 'b', 'a'], ['a', 'b', 'c']), ['c', 'b', 'a']);

// A source that repeats a song must not smuggle it in twice.
check('a repeat inside the source is added once', mergedSongIds(['a'], ['b', 'b', 'c']), ['a', 'b', 'c']);
// Falsy ids are junk, not songs.
check('empty ids are dropped', mergedSongIds(['a'], ['', null, 'b']), ['a', 'b']);

// ---- 2. the numbers the confirm step promises ------------------------------
check('counts a clean merge', mergeCounts(['a'], ['b', 'c']), { added: 2, skipped: 1 - 1 });
check('counts the refusals', mergeCounts(['a', 'b'], ['b', 'c']), { added: 1, skipped: 1 });
check('counts nothing to do', mergeCounts(['a', 'b'], ['a', 'b']), { added: 0, skipped: 2 });
check('a repeat inside the source counts once, then as a skip',
  mergeCounts(['a'], ['b', 'b']), { added: 1, skipped: 1 });
// The promise has to match what actually happens, or the dialog lies.
for (const [t, s] of [[['a', 'b'], ['b', 'c', 'd']], [[], ['a']], [['a'], []], [['a'], ['a', 'b', 'a']]]) {
  check(`promise matches result: ${JSON.stringify(t)} + ${JSON.stringify(s)}`,
    mergeCounts(t, s).added, mergedSongIds(t, s).length - t.length);
}

// ---- 3. which set survives by default --------------------------------------
const A = { id: 'A' }, B = { id: 'B' };
const none = () => false;
check('neither published: the first is offered', defaultMergeTargetId([A, B], none), 'A');
check('the published one wins', defaultMergeTargetId([A, B], id => id === 'B'), 'B');
check('...whichever side it is on', defaultMergeTargetId([A, B], id => id === 'A'), 'A');
// Both published means there is no reason to prefer either — the user chooses,
// and the one NOT chosen keeps its own link and its own unchanged contents.
check('both published: no preference, the first is offered', defaultMergeTargetId([A, B], () => true), 'A');
check('no sets at all', defaultMergeTargetId([], none), null);
check('a missing predicate does not throw', defaultMergeTargetId([A, B]), 'A');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
