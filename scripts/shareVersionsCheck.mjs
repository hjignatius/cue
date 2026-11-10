// The share's versions (src/utils/shareVersions.js): what the picker offers,
// what a stored choice means, which way the TV points, when the shared song is
// newer than your copy, and that old stored choices still read.
//
// Run: node scripts/shareVersionsCheck.mjs
import { readPlayChoices, otherVersions, chosenSong, pickedCopy, playsMine, copyStanding, newerThan } from '../src/utils/shareVersions.js';
import { contentHash } from '../src/utils/contentHash.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

const song = (id, title, extra = {}) => ({ id, metadata: { title, ...(extra.artist ? { artist: extra.artist } : {}) }, ...extra });
const ids = (list) => list.map(s => s.id);

// Stored choices: { pick, play, kept }, and the two forms before it.
check('nothing stored', readPlayChoices(null), {});
check('the old list means your copy, playing', readPlayChoices('["a","b"]'), { a: { pick: true, play: 'mine' }, b: { pick: true, play: 'mine' } });
check('the last form means that song, playing', readPlayChoices('{"a":true,"b":"x"}'), { a: { pick: true, play: 'mine' }, b: { pick: 'x', play: 'mine' } });
check('the new form reads back', readPlayChoices('{"a":{"pick":"x","play":"share","kept":"h"}}'), { a: { pick: 'x', play: 'share', kept: 'h' } });
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
check('no pick is no song', chosenSong(undefined, local[0], byId), null);
check('true is your copy', chosenSong({ pick: true }, local[0], byId)?.id, 'copy');
check('true with no copy left is no song', chosenSong({ pick: true }, null, byId), null);
check('an id is that song', chosenSong({ pick: 'mine2' }, local[0], byId)?.id, 'mine2');
check('a deleted pick is no song', chosenSong({ pick: 'gone' }, local[0], byId), null);

// Which copy is yours: the one picked, or your copy when it's the only one.
check('your copy alone is yours without asking', pickedCopy(undefined, local[0], [], byId)?.id, 'copy');
check('…but beside other versions, it asks', pickedCopy(undefined, local[0], [local[1]], byId), null);
check('…until you pick', pickedCopy({ pick: 'mine2' }, local[0], [local[1]], byId)?.id, 'mine2');
check('a same-title song alone is never yours by itself', pickedCopy(undefined, null, [local[1]], byId), null);

// Which way the TV points.
check('nothing of yours: the shared one', playsMine({ play: 'mine' }, null, true), false);
check('yours, the same, never set: yours', playsMine(undefined, local[0], true), true);
check('yours, changed, never set: the shared one, as before', playsMine(undefined, local[0], false), false);
check('set to the shared one, it stays there', playsMine({ play: 'share' }, local[0], true), false);
check('set to yours, it stays there', playsMine({ play: 'mine' }, local[0], false), true);

// When the shared song is newer than your copy.
const v1 = song('s', 'Lazy River', { text: '[C] up a lazy river' });
const v2 = { ...v1, text: '[C] up a lazy river [G] by the old mill run' };
const copyOf = (from, extra = {}) => ({ ...from, id: 'c', copiedFrom: { songId: 's', baseline: contentHash(from) }, ...extra });
const untouched = copyOf(v1), mineToo = copyOf(v1, { text: '[C] up a lazy river, mine' });
check('a copy the same as the shared song', copyStanding(copyOf(v1), v1), 'same');
check('only you changed it', copyStanding(mineToo, v1), 'mine');
check('only the share did', copyStanding(untouched, v2), 'newer');
check('you both did', copyStanding(mineToo, v2), 'both');
check('a song not copied from it has no standing', copyStanding(local[0], v1), null);
check('newer asks', newerThan(untouched, v2, undefined), 'newer');
check('…until you keep yours over that version', newerThan(untouched, v2, { kept: contentHash(v2) }), null);
check('…and asks again when it changes again', newerThan(untouched, { ...v2, text: 'v3' }, { kept: contentHash(v2) }), 'newer');
check('nothing newer, nothing to ask', newerThan(mineToo, v1, undefined), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
