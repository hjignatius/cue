// What counts as a chord line, and how a performance note rides on one.
//
// Howard's chart had "Dm↓   Am \\\\   Trill for  5 beats". The arrow and the
// beat backslashes were fine; the four plain words demoted the whole line to
// text, because isChordLine requires every token to be chord-ish. That rule is
// load-bearing — it is what stops a lyric line being drawn as chords.
//
// Reading the note from its spacing was measured and rejected: "chords, wide
// gap, then prose" turns "A    long time ago" into a chord row at a 1-chord
// threshold, still breaks "A  B  C of it all" at 2, and misses his own line at
// 3. There is no threshold that works, so the marking is explicit instead: a
// PARENTHESISED note. It was trailing-only at first, which demoted
// "G (Riff)         G (Riff)" — a note after each chord — to text (section 7).
// The lyric corpus below pins that decision — if someone later relaxes the rule
// to guess from spacing, these fail.
//
// Run: node scripts/chordLineCheck.mjs

import { isChordLine } from '../src/utils/visualImport.js';
import { convertToBrackets, convertToOver, detectChordStyle } from '../src/utils/chordStyle.js';
import { detectChords } from '../src/utils/chordDetect.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- 1. his line ------------------------------------------------------------
const HIS = 'Dm↓                Am \\\\\\\\   (Trill for 5 beats)';
check('his line, with the note parenthesised', isChordLine(HIS), true);
check('his line without the note is still a chord line', isChordLine('Dm↓                Am \\\\\\\\'), true);
check('unparenthesised prose still demotes it', isChordLine('Dm↓                Am \\\\\\\\   Trill for 5 beats'), false);

// ---- 2. notes that must be accepted ----------------------------------------
for (const l of [
  'G                 C            (let it ring)',
  'Am      F            (hold 2 bars)',
  'C   G   Am   F          (repeat to fade)',
  'C (x4)',
  'Dm  Am  (Trill)',
  'F//// (four beats)',
  'N.C.   Am   (build)',
  'C   G   ()',                       // empty note, degenerate but harmless
]) check(`accepted: ${JSON.stringify(l)}`, isChordLine(l), true);

// ---- 3. the corpus that must NOT flip --------------------------------------
// Real lyric lines that open with chord-shaped words. Every one of these would
// have become a chord row under a spacing heuristic.
for (const l of [
  'A                   long time ago',
  'A    man walks down the street',
  'A                   day in the life',
  'Em   and the rain came down',
  'G   o   o   d   night',
  'E                   everybody\'s talking at me',
  'D                   don\'t let me be lonely tonight',
  'F                 forever young',
  'A         B         C of it all',
  'A       B       side of the road',
  'G       C       D      major scale practice',
  'Love Potion Number Ni-ah-ah-a-ine',
  'Dear       Prudence',
  'Baby        you can drive my car',
]) check(`still lyrics: ${JSON.stringify(l)}`, isChordLine(l), false);

// A note needs chords in front of it; a parenthesis alone is not a chord line.
check('a bare parenthetical is not a chord line', isChordLine('(Trill for 5 beats)'), false);
check('a lyric ending in a parenthetical is not either', isChordLine('And I love her (ooh)'), false);
check('...nor one with a wide gap', isChordLine('Baby you can drive my car   (beep beep)'), false);
check('prose before the note still demotes', isChordLine('C  G  loud here  (then soft)'), false);

// ---- 4. the space before '(' is what separates a note from a chord ---------
check('G(4x) is one chord token, not a note', isChordLine('G(4x)'), true);
check('Am7(b5) is a chord', isChordLine('Am7(b5)'), true);
check('C7(b9)  F  is chords', isChordLine('C7(b9)  F'), true);
// The note form is the spaced one; both read as chord lines, but for different
// reasons, and extractChords must not split the unspaced one.
check('G(4x) keeps its decoration in one bracket', convertToBrackets('G(4x)\nwords'), '[G(4x)]words');

// ---- 5. the note survives the round trip whole ------------------------------
const SONG = `Dm                Am
Love Potion Number Ni-ah-ah-a-ine

Slow:
${HIS}
Love Potion Number Ni-ah-ah-a-ine`;
const brackets = convertToBrackets(SONG);
check('the note stays one bracket', /\[\(Trill for 5 beats\)\]/.test(brackets), true);
check('it is not split into words', /\[\(Trill\]/.test(brackets), false);
check('over -> brackets -> over is lossless', convertToOver(brackets), SONG);

// A note past the end of a short lyric must not lose the line.
const SHORT = 'C        G     (hold)\nOh\nx';
check('a note past the end of the lyric round-trips', convertToOver(convertToBrackets(SHORT)), SHORT);

// ---- 6. a note is never looked up as a chord -------------------------------
check('notes are left out of the chord list', detectChords(brackets), ['Dm', 'Am']);
// The dangerous ones: parens get stripped when folding alterations, so a note
// opening with A-G would arrive at the chord panel as a chord to find a shape for.
for (const [line, want] of [
  ['C   G   (Fast)',            ['C', 'G']],
  ['C   G   (Easy does it)',    ['C', 'G']],
  ['C   G   (Give it 4 beats)', ['C', 'G']],
  ['C   G   (Breathe)',         ['C', 'G']],
]) check(`no phantom chord from ${JSON.stringify(line)}`, detectChords(convertToBrackets(`${line}\nwords here`)), want);
// ...while a parenthesised ALTERATION is still a chord.
check('Am7(b5) is still detected as a chord', detectChords(convertToBrackets('Am7(b5)\nwords')), ['Am7b5']);


// ---- 14. chord names never fuse in the over-lyrics text --------------------
//
// "It's [D] easy [Am6]   [D6]  [D7]" came out of the Inline -> Over switch as
// "Am6D6D7". A chord NAME is wider than the syllable under it, so by the time
// the next chord's column arrives the chord line has already passed it. The
// Preview looked right — it positions chords itself — but the Text pane, which
// is what you edit, held one unreadable token.
const FUSED = /[A-G][#b]?[A-Za-z0-9#b/+°()-]*[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M)?\d/;
function chordRowOf(brackets) {
  return convertToOver(brackets).split('\n')[0];
}
function noFusedNames(label, brackets) {
  const row = chordRowOf(brackets);
  // Every whitespace-separated token must be a single chord, not two run together.
  const bad = row.trim().split(/\s+/).filter(t => t && FUSED.test(t) && !/^[A-G][#b]?(maj|min|m|M|dim|aug|sus|add|°)?\d*(sus[24]?|add\d+|aug|dim|\+|b\d+|#\d+)?(\([^)]+\))?(\/[A-G][#b]?)?$/.test(t));
  check(label, bad, []);
}

noFusedNames('his line: trailing turnaround', "It's [D] easy [Am6]   [D6]  [D7]");
noFusedNames('two long names, one gap',       "[Cmaj7]a [D]b");
noFusedNames('stacked at one column',         "[C][G][Am]");
noFusedNames('long name then short syllable', "[Am7]a[B]b and on we go");
noFusedNames('slash chords',                  "[D/F#]a [G/B]b");

check('his line reads as three chords',
  chordRowOf("It's [D] easy [Am6]   [D6]  [D7]").trim().split(/\s+/),
  ['D', 'Am6', 'D6', 'D7']);

// Spacing that is already wide enough is left exactly as it was — the rule adds
// a separator, it does not re-space a line that reads fine.
check('a comfortable line is untouched',
  convertToOver("[C]Love [Am]potion [F]number [G]nine"),
  'C    Am     F      G\nLove potion number nine');
check('...and still round-trips',
  convertToBrackets(convertToOver("[C]Love [Am]potion [F]number [G]nine")),
  "[C]Love [Am]potion [F]number [G]nine");

// The chord still sits over its own syllable wherever the width allows it.
check('chords stay on their syllables when there is room',
  convertToOver("[C]Love [Am]potion").split('\n')[0].indexOf('Am'),
  'Love '.length);

// Switching format twice settles rather than creeping further each time.
for (const src of ["It's [D] easy [Am6]   [D6]  [D7]", "[Cmaj7]a [D]b", "[C]Love [Am]potion [F]number [G]nine"]) {
  const once  = convertToBrackets(convertToOver(src));
  const twice = convertToBrackets(convertToOver(once));
  check(`settles after one pass: ${JSON.stringify(src)}`, twice, once);
}



// ---- 15. a chord-only line keeps its width -------------------------------
//
// Switching format used to WIDEN a chord-only line every time, for ever:
//   [Am6] [D6] -> [Am6]    [D6] -> [Am6]       [D6] -> …
// Converting TO brackets records each chord's column; converting back used to
// spend that column on the NAME and then add the gap again, so each pass grew
// the line by the width of every chord name. Both directions now read the
// column.

// On an intro or a turnaround the spacing IS the notation — it says where in
// the bar each chord falls. A line written in over-lyrics must come back
// byte-identical.
for (const line of [
  'Am6    D6  D7',
  'C       G       Am      F',
  'Fm7     Bb7',
  'G  G6  G7  G6',
  'D/F#    G    A7sus4   A7',
]) check(`gaps kept: ${JSON.stringify(line)}`, convertToOver(convertToBrackets(line)), line);

// A line written in brackets settles after one pass instead of creeping.
for (const src of ['[Am6] [D6]', '[Am6]   [D6]  [D7]', '[C]  [G]  [Am]', '[C][G]', '[C][G][Am]']) {
  const once  = convertToBrackets(convertToOver(src));
  const twice = convertToBrackets(convertToOver(once));
  check(`settles: ${JSON.stringify(src)}`, twice, once);
}

// On a wordless line the spacing between the BRACKETS is the gap between the
// NAMES — which is also what it looks like when you read it. So it is carried
// across as-is, in both directions, and only a gap too narrow to hold a
// separator is touched at all.
check('the gap is carried across as written', convertToOver('[Am6]       [D6]'), 'Am6       D6');
check('a one-space gap stays one space', convertToOver('[Am6] [D6]'), 'Am6 D6');
check('stacked chords get the one space they need', convertToOver('[C][G][Am]'), 'C G Am');
// Which makes the whole thing symmetric: written in EITHER format, it survives
// any number of switches byte for byte.
for (const src of ['[Am] [Em7] [G] [Am]', '[Am6]   [D6]  [D7]', '[Am6] [D6]']) {
  check(`brackets survive a switch: ${JSON.stringify(src)}`, convertToBrackets(convertToOver(src)), src);
}

// ---- 16. a label followed by nothing but chords is two lines --------------
//
// "Intro: [Am] [Em7] [G] [Am]" counted the label as the line's lyric, so
// over-lyrics laid eight chord names above the six characters of "Intro:" and
// the chart read as though the intro were sung. It is a heading with a chord
// run under it.
check('his intro splits in two',
  convertToOver('Intro: [Am] [Em7] [G] [Am] [Am] [Em7] [G] [Am]'),
  'Intro:\nAm Em7 G Am Am Em7 G Am');
check('...and survives the trip back',
  convertToBrackets(convertToOver('Intro: [Am] [Em7] [G] [Am]')),
  'Intro:\n[Am] [Em7] [G] [Am]');
for (const label of ['Intro:', 'Outro:', 'Chorus:', 'Verse 2:', 'Instrumental:']) {
  check(`label: ${label}`, convertToOver(`${label} [C] [G]`), `${label}\nC G`);
}
// Narrow on purpose: the label must be the ONLY non-chord text on the line.
// Still one line with words under it, and the chord still sits over the
// syllable it belongs to — six columns in, above the "I".
check('a lyric after a chord keeps the line whole',
  convertToOver('Baby: [C]I love you'), '      C\nBaby: I love you');
check('words after the chords keep it whole',
  convertToOver('Intro: [Am] la la').split('\n').length, 2);
check('a line with no chords is not a label run',
  convertToOver('Intro: just talking'), 'Intro: just talking');

// A chord-only line is the same whether it stands alone, precedes a blank, or
// precedes another chord line.
check('alone and in a run agree',
  convertToOver('[Am6]   [D6]\n[C]   [G]').split('\n'),
  [convertToOver('[Am6]   [D6]'), convertToOver('[C]   [G]')]);



// ---- 17. switching format does not need the detector to be sure -----------
//
// THE BUG: the Format switch converted only when detectChordStyle could name
// the CURRENT format, and that detector wants a chord line with a lyric line
// under it before it commits. A song that is a heading and a chord run —
// "Intro:" over "Am Em7 G Am" — gives it nothing, so it answers null, nothing
// was converted, and both modes were set to the new format anyway. The Text
// pane then showed unconverted over-lyrics while the Preview, which converts on
// its own, drew the same song in inline notation, brackets and all.
//
// The switch now converts unconditionally, which is safe because each
// conversion is a no-op on text already in its own format. These pin that.

const DETECTOR_BLIND = [
  'Intro:\nAm Em7 G Am Am Em7 G Am',   // his song
  'Am6    D6  D7',                      // a turnaround on its own
  'Intro:\nC  G  Am  F',
];
for (const t of DETECTOR_BLIND) {
  check(`the detector cannot name it: ${JSON.stringify(t.slice(0, 24))}`, detectChordStyle(t), null);
  // ...and it does not matter, because converting is still correct.
  check(`over -> over is a no-op anyway: ${JSON.stringify(t.slice(0, 24))}`, convertToOver(t), t);
  const br = convertToBrackets(t);
  check(`and it really does convert: ${JSON.stringify(t.slice(0, 24))}`, /\[/.test(br), true);
  check(`brackets -> brackets is a no-op: ${JSON.stringify(t.slice(0, 24))}`, convertToBrackets(br), br);
  check(`and back again returns the song: ${JSON.stringify(t.slice(0, 24))}`, convertToOver(br), t);
}

// The same no-op property on songs the detector IS sure about, so the switch is
// safe to call whatever state it is in.
for (const t of ['C       Am\nwords here', 'Intro:\nAm Em7 G Am\n\nC   Am\nwords']) {
  check(`over -> over: ${JSON.stringify(t.slice(0, 20))}`, convertToOver(t), t);
}
for (const t of ['[C]words [Am]here', 'Intro:\n[Am] [Em7]', 'Intro: [Am] la la']) {
  check(`brackets -> brackets: ${JSON.stringify(t.slice(0, 20))}`, convertToBrackets(t), t);
}

// ---- 7. a note after any chord, not only at the end -------------------------
// "G (Riff)" worked and "G (Riff)         G (Riff)" did not: only the last note
// was lifted, which left "(Riff)" mid-line as a word and demoted the line.
const RIFF = 'G (Riff)         G (Riff)';
check('a note after each chord is a chord line', isChordLine(RIFF), true);
for (const l of [
  'G (Riff)   C   D',
  'Am (let ring)     F     C (hold)',
  'G (Riff) (x2)',
]) check(`mid-line notes accepted: ${JSON.stringify(l)}`, isChordLine(l), true);
// Notes don't excuse prose: a bare word between them still demotes the line.
check('prose between notes still demotes', isChordLine('G (Riff)  then  G (Riff)'), false);
check('a note cannot open the line', isChordLine('(Riff) G'), false);

const RIFF_SONG = `${RIFF}\nSome words here and more words`;
const riffBr = convertToBrackets(RIFF_SONG);
check('each note stays one bracket at its column', riffBr, '[G]So[(Riff)]me words here a[G]nd[(Riff)] more words');
check('riff: over -> brackets -> over is lossless', convertToOver(riffBr), RIFF_SONG);
check('riff: notes are left out of the chord list', detectChords(riffBr), ['G']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
