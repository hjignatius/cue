// Formatting seconds for display — one rule, after five copies of it.
//
// Run: node scripts/durationCheck.mjs

import { mmss, shortDuration } from '../src/utils/duration.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
}

// ---- mmss ------------------------------------------------------------------
check('zero',             mmss(0),    '0:00');
check('single digit',     mmss(7),    '0:07');
check('pads the seconds', mmss(65),   '1:05');
check('exactly a minute', mmss(60),   '1:00');
check('under the minute', mmss(59),   '0:59');
check('ten minutes',      mmss(605),  '10:05');
check('over an hour runs on, it does not wrap', mmss(3661), '61:01');

// Callers pass measured values, so these are artefacts to absorb, not render.
check('rounds up',        mmss(59.6), '1:00');
check('rounds down',      mmss(59.4), '0:59');
check('clamps negatives', mmss(-5),   '0:00');
check('no value',         mmss(),     '0:00');
check('null',             mmss(null), '0:00');
check('not a number',     mmss('x'),  '0:00');
check('numeric string',   mmss('90'), '1:30');

// ---- shortDuration ---------------------------------------------------------
// Under a minute reads as a bare seconds count; the leading "0:" is noise.
check('zero',               shortDuration(0),    '0s');
check('seconds',            shortDuration(47),   '47s');
check('last second before', shortDuration(59),   '59s');
check('switches at a minute', shortDuration(60), '1:00');
check('and stays mm:ss after', shortDuration(61), '1:01');
check('ten minutes',        shortDuration(605),  '10:05');
check('clamps negatives',   shortDuration(-1),   '0s');
check('rounds across the boundary', shortDuration(59.6), '1:00');

// The two agree above a minute — the only difference is the short form below it.
for (const s of [60, 61, 90, 600, 3599]) {
  check(`agree at ${s}s`, shortDuration(s), mmss(s));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
