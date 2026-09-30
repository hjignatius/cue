// Does a suggested song match one you already own?
//
// The rule has to be generous about punctuation and strict about people. A
// suggestion naming a different artist is a different song however the title
// reads; a suggestion or a library entry with NO artist is a gap in the record,
// not a claim that it belongs to somebody else.
//
// Run: node scripts/libraryMatchCheck.mjs
import { matchLibrarySong } from '../src/utils/contentHash.js';

const song = (title, artist) => ({ id: `${title}|${artist || ''}`, metadata: { title, artist } });
const LIB = [
  song('Against the Wind', 'Bob Seger'),
  song("Can't Get No Satisfaction", 'The Rolling Stones'),
  song('Yesterday'),                       // filed with no artist
  song('Blackbird', 'The Beatles'),
];

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${got}\n      want ${want}`); }
};
const id = (t, a) => (matchLibrarySong(LIB, t, a) || {}).id ?? null;

check('exact title and artist', id('Against the Wind', 'Bob Seger'), 'Against the Wind|Bob Seger');
check('case and punctuation do not decide it', id('against the WIND!', 'bob seger'), 'Against the Wind|Bob Seger');
check("an apostrophe difference still matches", id('Cant Get No Satisfaction', 'The Rolling Stones'), "Can't Get No Satisfaction|The Rolling Stones");

// The important negative: same title, different act.
check('a different artist is a different song', id('Against the Wind', 'Nobody Else'), null);

// Missing artists are gaps, not claims.
check('no artist on the suggestion still matches', id('Against the Wind', ''), 'Against the Wind|Bob Seger');
check('no artist in the library still matches', id('Yesterday', 'The Beatles'), 'Yesterday|');
check('no artist on either side', id('Yesterday', ''), 'Yesterday|');

check('a song not in the library', id('Hotel California', 'Eagles'), null);
check('an empty title matches nothing', id('', 'The Beatles'), null);
check('a missing title matches nothing', id(undefined, undefined), null);
check('an empty library matches nothing', (matchLibrarySong([], 'Blackbird', 'The Beatles') || {}).id ?? null, null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
