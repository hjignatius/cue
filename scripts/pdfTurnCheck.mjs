// Present's ◀/▶ on a Full Page song: Next walks every page; Previous turns back
// within the song, and from page 1 goes to the TOP of the song before, or to its
// last page with the Present setting on.
//
// Run: node scripts/pdfTurnCheck.mjs

import { pdfTurn } from '../src/utils/pdfTurn.js';

let passed = 0, failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++;
  else { failed++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
}

const at = (dir, page, count, index, total) => pdfTurn({ dir, page, count, index, total });

check('next turns within a song', at(1, 1, 2, 0, 3), { page: 2 });
check('next off the last page goes to the next song', at(1, 2, 2, 0, 3), { index: 1, lastPage: false });
check('next stops at the end of the list', at(1, 2, 2, 2, 3), null);
check('previous turns within a song', at(-1, 2, 2, 1, 3), { page: 1 });
check('previous off page 1 goes to the song before', at(-1, 1, 2, 1, 3), { index: 0, lastPage: false });
check('previous stops at the start of the list', at(-1, 1, 2, 0, 3), null);
check('a single song has nowhere to go from page 1', at(-1, 1, 2, 0, 1), null);
check('a single song still turns its own pages', at(-1, 2, 2, 0, 1), { page: 1 });

check('with the setting, previous lands on the last page', pdfTurn({ dir: -1, page: 1, count: 2, index: 1, total: 3, previousToLast: true }), { index: 0, lastPage: true });
check('the setting changes nothing within a song', pdfTurn({ dir: -1, page: 3, count: 4, index: 1, total: 3, previousToLast: true }), { page: 2 });
check('the setting changes nothing going forward', pdfTurn({ dir: 1, page: 2, count: 2, index: 0, total: 3, previousToLast: true }), { index: 1, lastPage: false });
check('the setting still stops at the start', pdfTurn({ dir: -1, page: 1, count: 2, index: 0, total: 3, previousToLast: true }), null);

// The whole walk, from the end of a list.
const songs = [2, 2, 1, 3, 2];
function walk(dir, index, page, previousToLast = false) {
  const seen = [`${index}.${page}`];
  for (;;) {
    const t = pdfTurn({ dir, page, count: songs[index], index, total: songs.length, previousToLast });
    if (!t) return seen;
    if (t.page) page = t.page;
    else { index = t.index; page = t.lastPage ? songs[index] : 1; }
    seen.push(`${index}.${page}`);
  }
}
const forward = walk(1, 0, 1);
check('forward sees every page', forward.length, 10);
check('back goes to the top of each song', walk(-1, 4, 2), ['4.2', '4.1', '3.1', '2.1', '1.1', '0.1']);
check('with the setting, back sees every page', walk(-1, 4, 2, true), [...forward].reverse());

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
