// The share's version picker (src/utils/shareVersions.js): what it offers, what a
// stored choice means, and that old stored choices still read.
//
// Run: node scripts/shareVersionsCheck.mjs
import { readPlayChoices, otherVersions, chosenSong } from '../src/utils/shareVersions.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

const song = (id, title, extra = {}) => ({ id, metadata: { title, ...(extra.artist ? { artist: extra.artist } : {}) }, ...extra });
const ids = (list) => list.map(s => s.id);

// Stored choices.
check('nothing stored', readPlayChoices(null), {});
check('the old list means your copy', readPlayChoices('["a","b"]'), { a: true, b: true });
check('the new form reads back', readPlayChoices('{"a":true,"b":"x"}'), { a: true, b: 'x' });
check('rubbish is no choice', readPlayChoices('{oops'), {});

// What is offered.
const shared = song('s', 'Lazy River!');
const local = [
  song('copy', 'Lazy River'),
  song('book', 'lazy river', { bookId: 'b1', artist: 'A' }),
  song('mine2', 'Lazy  River', { artist: 'Z' }),
  song('used', 'Lazy River', { bookId: 'b1', mine: true, artist: 'B' }),
  song('other', 'Up a Lazy River'),
];
check('same title, however it is typed; My Songs first; your copy left out',
  ids(otherVersions(shared, local, 'copy')), ['used', 'mine2', 'book']);
check('your copy is offered when it is not the linked one',
  ids(otherVersions(shared, local, null)).includes('copy'), true);
check('the share song itself is never offered back',
  ids(otherVersions(song('copy', 'Lazy River'), local, null)).includes('copy'), false);
check('no title, no matches', otherVersions(song('s', ''), [song('x', '')]), []);

check('a renamed copy of this song is offered',
  ids(otherVersions(shared, [song('renamed', 'River Song', { copiedFrom: { songId: 's' } })], null)), ['renamed']);
check('the original a shared song came from is offered, renamed or not',
  ids(otherVersions(song('s', 'New Name', { copiedFrom: { songId: 'orig' } }), [song('orig', 'Old Name')], null)), ['orig']);
check('a copy of some other song is not',
  ids(otherVersions(shared, [song('x', 'Else', { copiedFrom: { songId: 'zzz' } })], null)), []);
check('two copies: the linked one is left out, the other offered',
  ids(otherVersions(shared, [song('c1', 'Lazy River', { copiedFrom: { songId: 's' } }), song('c2', 'Lazy River', { copiedFrom: { songId: 's' } })], 'c1')), ['c2']);

// What a choice means.
const byId = new Map(local.map(s => [s.id, s]));
check('no choice plays the shared one', chosenSong(undefined, local[0], byId), null);
check('true is your copy', chosenSong(true, local[0], byId)?.id, 'copy');
check('true with no copy left plays the shared one', chosenSong(true, null, byId), null);
check('an id is that song', chosenSong('mine2', local[0], byId)?.id, 'mine2');
check('a deleted pick plays the shared one', chosenSong('gone', local[0], byId), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
