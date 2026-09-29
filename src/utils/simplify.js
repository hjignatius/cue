// Easier chords that still say the same thing.
//
// The point of this file is that it DECIDES BY MEASUREMENT, never by the shape
// of the chord symbol. The obvious design — walk a ladder from the fancy name
// toward the plain one, Cmaj9 -> Cmaj7 -> C — is wrong, and Howard's song is the
// proof: on a ukulele E is a four-fret stretch (4-4-4-2) and E7 is 1-2-0-2, so
// "simplify the symbol" would have made Still Got The Blues HARDER. The symbol
// says nothing about the hand. Every candidate here is looked up in the real
// library and scored.
//
// Two kinds of answer come out, and keeping them apart is the whole honesty of
// the feature:
//
//   SAFE       every note of the substitute is already in the written chord.
//              You have lost colour, not gained a wrong note. Dm7/G -> Dm7,
//              Fmaj7 -> F, E7#9 -> E7.
//   JUDGEMENT  the substitute brings one note the chart did not ask for.
//              E -> E7 adds the D; Dm7/G -> G7 adds the B. Often exactly what a
//              player wants — and not something to do behind their back.
//
// More than one foreign note and it is not a substitution, it is a different
// chord, so it is never offered.

import { isChordLine } from './visualImport.js';
import { shapesForName } from './chordLookup.js';
import { chordPitchClasses, splitChord, shapeNotes, notePitchClass } from './notes.js';
import { NOTE_NAMES } from './transpose.js';
import { getActiveTuning } from '../data/chordLibraries.js';

// Every quality worth trying as a substitute. Deliberately the ones the shipped
// libraries actually contain — a candidate with no shape helps nobody.
const CANDIDATE_SUFFIXES = [
  '', 'm', '5', '6', 'm6', '7', 'maj7', 'm7', 'm7b5', 'dim', 'aug',
  'sus2', 'sus4', '7sus4', '9', 'add9', '7b9', '7#5', '7#9', '13',
];

/**
 * How hard a shape is to hold: fingers first (a barre is one finger, not three),
 * then the stretch, then how far up the neck it sits.
 *
 * The same scale the chord generator was calibrated on, where position turned
 * out to matter more than fingers — which is what a ukulele rewards and the
 * opposite of the first guess.
 */
export function shapeDifficulty(frets = []) {
  const stopped = frets.filter((f) => f > 0);
  if (!stopped.length) return 0;                       // all open: free
  const low = Math.min(...stopped), high = Math.max(...stopped);
  const atLow = stopped.filter((f) => f === low).length;
  const fingers = stopped.length - (atLow > 1 ? atLow - 1 : 0);
  return fingers * 40 + (high - low) * 25 + high * 30;
}

// The easiest shape the library has for a name, or null.
function easiestShape(name, instrument, custom, hidden) {
  const shapes = shapesForName(name, instrument, custom, hidden);
  if (!shapes.length) return null;
  return shapes.reduce((a, b) => (shapeDifficulty(a.frets) <= shapeDifficulty(b.frets) ? a : b));
}

const noteName = (pc) => NOTE_NAMES[pc];
const has = (set, root, semis) => set.has((root + semis) % 12);

/**
 * Would this substitute still be the chord that was written?
 *
 * THE 3rd IS NEVER NEGOTIABLE. It is what makes a chord major or minor, and a
 * substitute that drops it or flips it is not a simpler version of the chord,
 * it is a different one.
 *
 * Past that, the rule depends on which kind of substitution this is. Dropping
 * colour and adding NOTHING is how a player simplifies — Fmaj7 to F loses the
 * 7th and is exactly right. But a substitute that ADDS a note has to earn it by
 * keeping everything that defines the original: its 7th, its altered 5th, and
 * the 4th or 2nd of a suspension. Otherwise you get Cmaj7 to C6, which trades
 * the major 7th for a 6th and is a different sound, not an easier one.
 */
function keepsWhatMatters(written, cand, root, addsNote) {
  // MAJOR FIRST when a chord holds both. A 7#9 contains its major 3rd AND a #9
  // that sounds as a minor 3rd — that clash is the chord. Reading the lower of
  // the two as "the 3rd" made E7#9 look like a minor chord, and the tool
  // cheerfully offered Em7 for it and called it safe.
  const third = has(written, root, 4) ? 4 : has(written, root, 3) ? 3 : null;
  if (third != null) {
    if (!has(cand, root, third)) return false;                    // dropped its own 3rd
    const other = third === 3 ? 4 : 3;
    if (has(cand, root, other) && !has(written, root, other)) return false;  // flipped major/minor
  }
  if (!addsNote) return true;                                     // pure subtraction is a player's own move

  for (const semis of [10, 11]) if (has(written, root, semis) && !has(cand, root, semis)) return false;
  // The 5th, altered or not. A plain 5th is the one note players drop without
  // thinking, but dropping it while ADDING something else is how E turns into
  // Eaug — the 5th replaced by a #5, which is a different chord wearing the
  // same root.
  for (const semis of [6, 7, 8]) if (has(written, root, semis) && !has(cand, root, semis)) return false;
  if (third == null) {
    for (const semis of [2, 5]) if (has(written, root, semis) && !has(cand, root, semis)) return false;
  }
  return true;
}

/**
 * For each chord in `names`, what you could play instead that is easier.
 *
 * `minGain` is how much easier a substitute has to be before it is worth
 * mentioning: swapping a chord is a real cost to the player, and a shape that is
 * barely easier is not worth relearning a grip for.
 */
export function easierChords(names = [], {
  instrument = 'ukulele_gcea', custom, hidden, minGain = 60,
} = {}) {
  const tuning = getActiveTuning(instrument);
  const rows = [];

  for (const name of [...new Set(names)]) {
    const parts = splitChord(name);
    const written = chordPitchClasses(name);
    const current = easiestShape(name, instrument, custom, hidden);
    // Unreadable symbols get no opinion — better to say nothing than to guess
    // what somebody's "N.C." or "%" means.
    if (!parts || !written) continue;

    const root = notePitchClass(parts.root);
    const currentCost = current ? shapeDifficulty(current.frets) : Infinity;
    const options = [];

    // Candidates: the same root in every quality the libraries carry, plus — for
    // a slash chord — the bass note read as a dominant, which is what Dm7/G is
    // really doing in a ii-V and why a player reaches for G7.
    const candidates = CANDIDATE_SUFFIXES.map((s) => `${parts.root}${s}`);
    if (parts.bass) candidates.push(parts.bass, `${parts.bass}7`, `${parts.root}${parts.suffix}`);

    for (const candName of [...new Set(candidates)]) {
      if (candName === name) continue;
      const candSet = chordPitchClasses(candName);
      if (!candSet) continue;
      const shape = easiestShape(candName, instrument, custom, hidden);
      if (!shape) continue;

      const cost = shapeDifficulty(shape.frets);
      if (cost > currentCost - minGain) continue;         // not enough easier to be worth it

      const adds = [...candSet].filter((p) => !written.has(p));
      if (adds.length > 1) continue;                      // a different chord, not a substitute
      const loses = [...written].filter((p) => !candSet.has(p));

      // THE SUBSET TEST IS NOT ENOUGH, and the first run proved it: it offered
      // Em7 for E7#9 and called it safe, because Em7's notes really are a subset
      // of E7#9's. What it drops is the major 3rd, which turns a dominant into a
      // minor chord. "Contains no wrong note" and "is still the same chord" are
      // different questions, exactly as the library audit found.
      // A candidate on a DIFFERENT root is a re-reading, not a simplification:
      // Dm7/G is functioning as the G chord in a ii-V, which is why a player
      // reaches for G7. Judging it by what it keeps of a D chord is the wrong
      // question, so it is judged by overlap instead — it must still be most of
      // the same notes — and it is always a judgement, never safe.
      const candRoot = notePitchClass(splitChord(candName).root);
      if (candRoot === root) {
        if (!keepsWhatMatters(written, candSet, root, adds.length > 0)) continue;
      } else {
        const shared = [...candSet].filter((p) => written.has(p)).length;
        if (shared < 3) continue;
      }

      options.push({
        name: candName,
        frets: shape.frets,
        notes: shapeNotes(shape.frets, tuning),
        cost,
        kind: (adds.length || candRoot !== root) ? 'judgement' : 'safe',
        adds: adds.map(noteName),
        loses: loses.map(noteName),
      });
    }

    options.sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'safe' ? -1 : 1) || a.cost - b.cost);

    if (options.length) {
      rows.push({
        name,
        current: current ? { frets: current.frets, notes: shapeNotes(current.frets, tuning), cost: currentCost } : null,
        options: options.slice(0, 3),
      });
    }
  }

  // Hardest first: the chord costing you the most is the one worth changing.
  rows.sort((a, b) => (b.current?.cost ?? Infinity) - (a.current?.cost ?? Infinity));
  return rows;
}

/**
 * Swap chords through a song's text.
 *
 * TWO THINGS MAKE THIS MORE THAN A FIND-AND-REPLACE.
 *
 * A chord name is a whole token, so "E" must not eat the E of "Em", of "E7#9",
 * or of the word "Easy" — a match has to start at a bracket, whitespace or the
 * line start and stop where a chord name could not continue. Longer names go
 * first, or replacing "Am" would leave "Am7/B" behind where "Am/B" was.
 *
 * And in over-lyrics a chord's COLUMN is the syllable it is sung on, so a name
 * that changes length drags every chord after it onto the wrong word. E to E7 is
 * one character longer; on a chord line each token is put back at the column it
 * came from instead, and only pushed right when a longer name would otherwise
 * run into its neighbour.
 */
export function swapChords(text, picks = []) {
  const pairs = [...picks].filter(([from, to]) => from && to && from !== to)
    .sort((a, b) => b[0].length - a[0].length);
  if (!pairs.length) return text;

  const swapToken = (token) => {
    for (const [from, to] of pairs) if (token === from) return to;
    return token;
  };

  return text.split('\n').map((line) => {
    if (isChordLine(line)) {
      // Column-preserving: place every token back where it started.
      let out = '';
      for (const m of line.matchAll(/\S+/g)) {
        const target = m.index;
        out = out.length && out.length >= target ? `${out} ` : out.padEnd(target, ' ');
        out += swapToken(m[0]);
      }
      return out.replace(/[ \t]+$/, '');
    }
    // Lyric or bracketed line: a plain token-safe replacement, since nothing
    // here is positional.
    let next = line;
    for (const [from, to] of pairs) {
      const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      next = next.replace(new RegExp(`(^|[\\s[])${esc}(?![A-Za-z0-9#b/])`, 'g'), `$1${to}`);
    }
    return next;
  }).join('\n');
}
