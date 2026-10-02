// Tablature is monospace art, not chords.
//
// A tab line fools the chord test in a way that is worse than failing outright,
// because it only fools it SOMETIMES. "A|--------|" strips to a bare "A" once
// the trailing dashes and pipe go, so that line reads as a chord; "D|---2---|"
// keeps a digit in the middle and does not. Howard's six-line guitar tab had two
// of its strings turned into chord lines and four left as text — two phantom
// chords in the song, and a block rendered in two different styles down its own
// height.
//
// Run: node scripts/tabCheck.mjs
import { isTabLine, isChordLine } from '../src/utils/visualImport.js';
import { detectChords, normalizeChordName } from '../src/utils/chordDetect.js';
import { convertToBrackets } from '../src/utils/chordStyle.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};
const chords = (t) => detectChords(convertToBrackets(t)).map(normalizeChordName);

// Howard's example, every string of a guitar.
const GUITAR = [
  'e|--------------------|-2----0--------------------------|',
  'B|0--7s0-0--7-5-3-2-0-|---3----3--2---------------------|',
  'G|--------------------|-------------4--2--1----1--2--4--|',
  'D|--------------------|----------------------2----------|',
  'A|--------------------|---------------------------------|',
  'E|--------------------|---------------------------------|',
].join('\n');
check('every line of a guitar tab is tab', GUITAR.split('\n').map(isTabLine), [true, true, true, true, true, true]);
check('none of it is a chord line', GUITAR.split('\n').map(isChordLine), [false, false, false, false, false, false]);
check('no phantom chords come out of it', chords(GUITAR), []);
check('and the text is left exactly alone', convertToBrackets(GUITAR), GUITAR);

// Four strings, not six — ukulele (A E C G) and baritone (E B G D).
const UKE  = ['A|-----3--2--0----|', 'E|--0-------------|', 'C|----------------|', 'G|----------------|'].join('\n');
const BARI = ['E|--2-------|', 'B|-----3----|', 'G|----------|', 'D|----------|'].join('\n');
check('ukulele tab', chords(UKE), []);
check('ukulele tab text untouched', convertToBrackets(UKE), UKE);
check('baritone tab', chords(BARI), []);

// Tunings and spacings a tab really turns up in.
for (const l of ['D|--0--2--3----|', 'F#|--4----------|', 'e |---------3---|', 'c|---2---------|']) {
  check(`tab line ${JSON.stringify(l)}`, isTabLine(l), true);
}

// And the things that must STILL be chord lines. Four dashes is the threshold
// precisely so a chord written with a dash or two is not mistaken for tab.
for (const l of ['A    G  D', 'A -', 'D - - -', 'C|', 'Am7 D7', 'E', 'Bm7b5  Esus4']) {
  check(`still a chord line: ${JSON.stringify(l)}`, isChordLine(l), true);
}
check('a bare continuation bar is neither', [isTabLine('|-----5---|'), isChordLine('|-----5---|')], [false, false]);

// A tab sitting in a real song must not disturb the song around it.
const SONG = ['G        C', 'Amazing grace how sweet', '', 'e|---------3---|', 'B|------0------|', '', 'D        G', 'that saved a wretch'].join('\n');
check('chords around a tab are still found', chords(SONG), ['G', 'C', 'D']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
