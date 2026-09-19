// Time signature: one definition of what Cue offers and how many beats to count.
//
// Cue originally modelled this as a two-state toggle (4/4 ↔ 3/4) with every
// count-in doing `timeSig === '3/4' ? 3 : 4`. That was fine while the field was
// hand-set, but it silently mislabels 6/8 — common in folk and worship material
// — and a ChordPro import could already bring in any {timesig:} value that then
// counted as 4.

export const DEFAULT_TIME_SIG = '4/4';

// Offered in the picker, commonest first. NOT a whitelist: a signature arriving
// from an import is kept as-is (see normalizeTimeSig) and the picker shows it
// alongside these, so opening the form can never quietly rewrite someone's 7/4.
export const TIME_SIGNATURES = ['4/4', '3/4', '2/4', '2/2', '6/8', '9/8', '12/8', '5/4', '7/8'];

// Parse to [numerator, denominator]; null when it isn't a time signature at all.
function parse(v) {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const num = +m[1], den = +m[2];
  if (num < 1 || num > 32) return null;
  if (![1, 2, 4, 8, 16].includes(den)) return null;   // a denominator is a note value
  return [num, den];
}

// Canonical "n/d", or the default when the value is missing or nonsense. Keeps
// any musically valid signature, including ones not in TIME_SIGNATURES.
export function normalizeTimeSig(v) {
  const p = parse(v);
  return p ? `${p[0]}/${p[1]}` : DEFAULT_TIME_SIG;
}

// Strict form for UNTRUSTED input (an AI answer): the canonical signature, or ''
// when it isn't one. Deliberately unlike normalizeTimeSig, which falls back to
// 4/4 — a signature the model couldn't work out must come back empty, not
// wearing the default as though it were a confident answer.
export function timeSigOrEmpty(v) {
  const p = parse(v);
  return p ? `${p[0]}/${p[1]}` : '';
}

// Beats to COUNT in one bar — the pulse a player actually feels, not the
// notated numerator.
//
// Compound metres (6/8, 9/8, 12/8) group their eighths in threes and are felt
// in dotted-quarter pulses, so 12/8 counts FOUR. Clicking twelve times would be
// unusable as a count-in, and a tempo written for a 6/8 song is the dotted-
// quarter rate anyway — so the entered BPM lines up with this pulse, not the
// denominator. 3/8 stays 3: it's one group, felt in three.
export function beatsPerBar(timeSig) {
  const p = parse(timeSig);
  if (!p) return 4;
  const [num, den] = p;
  if (den === 8 && num > 3 && num % 3 === 0) return num / 3;
  return num;
}
