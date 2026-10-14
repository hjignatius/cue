// The gate on a song's metadata.
//
// Howard had a song whose DURATION was sitting in the time-signature field —
// "2:24" where "4/4" belongs. No current path could put it there; nothing caught
// it either, and a .json round-trip carried it forever while the picker offered
// it back as a legitimate choice.
//
// The rule these pin: clear a value that is PRESENT and provably wrong for its
// field, and do nothing else. Never fill in a default, never touch an empty
// field, never discard something merely unusual.
//
// Run: node scripts/metadataCheck.mjs

import { sanitizeMetadata, metadataProblems } from '../src/utils/songMetadata.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- 1. the song that started it -------------------------------------------
const octopus = { title: "Octopus's Garden", artist: '', key: 'C', tempo: '', duration: '', timeSig: '2:24' };
check('a duration in the time signature is cleared', sanitizeMetadata(octopus).timeSig, '');
check('nothing else in that song is touched',
  (({ timeSig, ...rest }) => rest)(sanitizeMetadata(octopus)),
  (({ timeSig, ...rest }) => rest)(octopus));
check('and it is reportable', metadataProblems(octopus), [{ field: 'timeSig', value: '2:24' }]);

// ---- 2. a clean song is returned UNCHANGED, same object ---------------------
// Identity matters: a save that changes nothing must stay a save that changes
// nothing, or every song in a shared set reads as edited.
const clean = { title: 'Blackbird', artist: 'The Beatles', key: 'G', tempo: '96', duration: '2:18', timeSig: '3/4', youtubeUrl: 'https://www.youtube.com/watch?v=Man4Xw8Xypo' };
check('a clean song comes back identical', sanitizeMetadata(clean) === clean, true);
check('...and reports nothing', metadataProblems(clean), []);

// Empty fields are "not set" — true, harmless, and never filled in.
const blank = { title: 'x', artist: '', key: '', tempo: '', duration: '', timeSig: '' };
check('empty fields are left empty', sanitizeMetadata(blank) === blank, true);
check('a missing field is not invented', sanitizeMetadata({ title: 'x' }), { title: 'x' });

// ---- 3. time signatures ----------------------------------------------------
for (const good of ['4/4', '3/4', '6/8', '12/8', '7/4', '5/4', '2/2', '7/8']) {
  check(`kept: ${good}`, sanitizeMetadata({ timeSig: good }).timeSig, good);
}
for (const bad of ['2:24', '4-4', 'common', '4/5', '0/4', '33/4', '4', '4/4/4', '/4', '4/']) {
  check(`cleared: ${JSON.stringify(bad)}`, sanitizeMetadata({ timeSig: bad }).timeSig, '');
}
// Whitespace is tidied rather than treated as a fault.
check('a padded signature is canonicalised', sanitizeMetadata({ timeSig: ' 6 / 8 ' }).timeSig, '6/8');

// ---- 4. durations ----------------------------------------------------------
for (const good of ['2:18', '0:45', '12:00', '4:05']) {
  check(`kept: ${good}`, sanitizeMetadata({ duration: good }).duration, good);
}
for (const bad of ['4/4', '2:75', '183', '2:1', '2:180', 'four minutes', '2.18']) {
  check(`cleared: ${JSON.stringify(bad)}`, sanitizeMetadata({ duration: bad }).duration, '');
}

// ---- 5. tempo --------------------------------------------------------------
for (const good of ['96', '72', '8', '180', '240']) {
  check(`kept: ${good}`, sanitizeMetadata({ tempo: good }).tempo, good);
}
for (const bad of ['2:24', '96 bpm', 'moderato', '1200', '96.5', '-96']) {
  check(`cleared: ${JSON.stringify(bad)}`, sanitizeMetadata({ tempo: bad }).tempo, '');
}

// ---- 6. the video link -----------------------------------------------------
for (const good of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'http://youtube.com/watch?v=abc', 'https://music.youtube.com/watch?v=abc']) {
  check(`kept: ${good}`, sanitizeMetadata({ youtubeUrl: good }).youtubeUrl, good);
}
for (const bad of ['youtube.com/watch?v=abc', 'https://vimeo.com/123', 'abc', 'https://www.youtube.com/results?search_query=x']) {
  check(`cleared: ${JSON.stringify(bad)}`, sanitizeMetadata({ youtubeUrl: bad }).youtubeUrl, '');
}

// ---- 7. fields with no checkable rule are never touched --------------------
// Discarding a title for looking unusual would be worse than the bug this fixes.
const odd = { title: '4/4', artist: '2:24', key: 'H#', tempo: '96' };
check('title, artist and key are left alone', sanitizeMetadata(odd) === odd, true);

// ---- 8. junk input is survived, not thrown over -----------------------------
check('null', sanitizeMetadata(null), null);
check('undefined', sanitizeMetadata(undefined), undefined);
check('not an object', sanitizeMetadata('x'), 'x');
check('a number where a string belongs', sanitizeMetadata({ tempo: 96 }).tempo, '96');
check('unknown keys ride along', sanitizeMetadata({ timeSig: 'nope', custom: 'keep me' }), { timeSig: '', custom: 'keep me' });

// ---- 9. several faults at once ---------------------------------------------
const messy = { title: 'Something', timeSig: '2:24', duration: '4/4', tempo: 'fast', youtubeUrl: 'nope' };
check('all four are cleared together', sanitizeMetadata(messy), { title: 'Something', timeSig: '', duration: '', tempo: '', youtubeUrl: '' });
check('and all four are reported', metadataProblems(messy).map(p => p.field), ['timeSig', 'duration', 'tempo', 'youtubeUrl']);
// Running it twice changes nothing further.
check('idempotent', sanitizeMetadata(sanitizeMetadata(messy)), sanitizeMetadata(messy));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
