// Present's chord panel on a song with no chords.
//
// A song with nothing to list keeps the panel closed unless C is pressed on it,
// and that press doesn't carry to the next song. These are the two halves of
// that: which songs count as having no chords, and which setting decides.
//
// Run: node scripts/chordPanelOpenCheck.mjs

import { songHasChords, chordPanelOpen } from '../src/utils/chordPanelOpen.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- 1. songs with chords --------------------------------------------------
check('bracket chords', songHasChords('[G]Hello [C]world'), true);
check('chords above the lyrics', songHasChords('G       C\nHello world'), true);
check('a line of chords alone', songHasChords('[G] [C] [D]'), true);

// ---- 2. songs with nothing to list -----------------------------------------
// The text of a PDF song is often empty, or missing altogether.
for (const empty of ['', '   \n  ', null, undefined]) {
  check(`no text: ${JSON.stringify(empty)}`, songHasChords(empty), false);
}
check('lyrics only', songHasChords('Hello world\nGoodbye world'), false);
check('a section label is not a chord', songHasChords('[Verse]\nHello world'), false);
check('a performance note is not a chord', songHasChords('[(Fast)]Hello world'), false);

// ---- 3. a song with chords follows the session's C -------------------------
for (const showChords of [true, false]) {
  for (const openedForThisSong of [true, false]) {
    check(`chords, C ${showChords}, opened ${openedForThisSong}`,
      chordPanelOpen({ hasChords: true, showChords, openedForThisSong }), showChords);
  }
}

// ---- 4. a song without chords follows only a press on that song ------------
for (const showChords of [true, false]) {
  check(`no chords, C ${showChords}, not pressed: closed`,
    chordPanelOpen({ hasChords: false, showChords, openedForThisSong: false }), false);
  check(`no chords, C ${showChords}, pressed: open`,
    chordPanelOpen({ hasChords: false, showChords, openedForThisSong: true }), true);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
