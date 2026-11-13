// Does a shape sound the chord it is named after? (src/utils/chordFormula.js)
//
// The rule both the chord audit and the AI chord tools use. The case that
// started it: a model drew an F for Gbdim7 (2026-11-13), and nothing checked.
//
// Run: node scripts/chordFormulaCheck.mjs
import { parseChord, judgeShape, shapeFitsChord } from '../src/utils/chordFormula.js';
import { sanitizeVoicings } from '../src/lib/ai.js';
import { UKULELE_CHORDS } from '../src/data/ukuleleChords.js';
import { BARITONE_CHORDS } from '../src/data/baritoneChords.js';
import { GUITAR_CHORDS } from '../src/data/guitarChords.js';
import { CHORD_LIBRARIES } from '../src/data/chordLibraries.js';

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};
const GCEA = ['G', 'C', 'E', 'A'];
const DGBE = ['D', 'G', 'B', 'E'];

// ── Reading names ────────────────────────────────────────────────────────────
check('Gbdim7', parseChord('Gbdim7'), { root: 6, suffix: 'dim7', bass: null });
check('°7 is dim7', parseChord('F#°7')?.suffix, 'dim7');
check('o7 is dim7', parseChord('Ao7')?.suffix, 'dim7');
check('ø is m7b5', parseChord('Bø')?.suffix, 'm7b5');
check('plain major', parseChord('C')?.suffix, '');
check('M7 is maj7', parseChord('CM7')?.suffix, 'maj7');
check('slash bass read', parseChord('Am/G'), { root: 9, suffix: 'm', bass: 7 });
check('an unknown quality is null', parseChord('C7#11b13'), null);
check('not a chord is null', parseChord('N.C.'), null);

// ── The case that started it ─────────────────────────────────────────────────
check('an F shape is not a Gbdim7', shapeFitsChord('Gbdim7', [2, 0, 1, 0], GCEA), false);
check('2-3-2-3 is a Gbdim7', shapeFitsChord('Gbdim7', [2, 3, 2, 3], GCEA), true);
check('the F shape has foreign notes', judgeShape('Gbdim7', [2, 0, 1, 0], GCEA).foreign.length > 0, true);

// ── Roots ────────────────────────────────────────────────────────────────────
check('old ukulele Fdim (no F) is refused', shapeFitsChord('Fdim', [1, 2, 4, 2], GCEA), false);
check('old baritone Cdim (no C) is refused', shapeFitsChord('Cdim', [1, 2, 4, 2], DGBE), false);
check('a rootless 9 is fine (voiced that way on purpose)', shapeFitsChord('C9', [0, 2, 0, 1], GCEA), true);

// ── Missing notes ────────────────────────────────────────────────────────────
check('Gm drawn for Gm7 is refused', shapeFitsChord('Gm7', [0, 2, 3, 1], GCEA), false);
check('…but allowed where a dropped note is labelled', shapeFitsChord('Gm7', [0, 2, 3, 1], GCEA, { allowLacking: true }), true);
check('a wrong note is refused even then', shapeFitsChord('Gm7', [0, 2, 3, 2], GCEA, { allowLacking: true }), false);
check('a slash bass may sound', shapeFitsChord('C/G', [0, 0, 0, 3], GCEA), true);
check('an unreadable name is let through', shapeFitsChord('C7#11b13', [0, 0, 0, 0], GCEA), null);
check('one note is not a chord', shapeFitsChord('C', [-1, 0, -1, -1], GCEA), false);

// ── Other ways to play it ────────────────────────────────────────────────────
// notes match the frets (so the model read its own shape right), but the shape
// is not the chord asked for: dropped.
check('Other ways: a self-consistent wrong chord is dropped',
  sanitizeVoicings([{ frets: [2, 0, 1, 0], notes: ['A', 'C', 'F', 'A'] }], { name: 'Gbdim7', strings: 4, tuning: GCEA }).length, 0);
check('Other ways: the real Gbdim7 passes',
  sanitizeVoicings([{ frets: [2, 3, 2, 3], notes: ['A', 'D#', 'F#', 'C'] }], { name: 'Gbdim7', strings: 4, tuning: GCEA }).length, 1);

// ── Every shipped dim and dim7 has its root and only its notes ──────────────
for (const [libId, chords] of [['ukulele_gcea', UKULELE_CHORDS], ['baritone_dgbe', BARITONE_CHORDS], ['guitar', GUITAR_CHORDS]]) {
  const tuning = CHORD_LIBRARIES[libId].tuning;
  const dims = chords.filter(c => /dim7?$/.test(c.name));
  check(`${libId}: 17 dim7 shapes`, dims.filter(c => c.name.endsWith('dim7')).length, 17);
  const bad = dims.filter(c => shapeFitsChord(c.name, c.frets, tuning) !== true);
  check(`${libId}: every dim/dim7 sounds its root and nothing foreign`, bad.map(c => `${c.name} [${c.frets}]`), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
