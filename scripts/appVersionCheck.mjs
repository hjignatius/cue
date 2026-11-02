// Telling a file from a newer Cue (appVersion.js): only a later version counts,
// and a file without a stamp — everything written before 2.0 — never does.
//
// Run: node scripts/appVersionCheck.mjs

import { isNewerVersion } from '../src/utils/appVersion.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
}

check('later major',            isNewerVersion('2.0.0', '1.9.28'), true);
check('later minor',            isNewerVersion('2.1.0', '2.0.0'),  true);
check('later patch',            isNewerVersion('2.0.1', '2.0.0'),  true);
check('compares numbers, not text', isNewerVersion('1.10.0', '1.9.28'), true);
check('same version',           isNewerVersion('2.0.0', '2.0.0'),  false);
check('older file',             isNewerVersion('1.9.28', '2.0.0'), false);
check('shorter, same',          isNewerVersion('2.0', '2.0.0'),    false);
check('shorter, later',         isNewerVersion('2.1', '2.0.9'),    true);
check('unstamped file',         isNewerVersion(undefined, '2.0.0'), false);
check('empty stamp',            isNewerVersion('', '2.0.0'),       false);
check('not a version',          isNewerVersion('beta', '2.0.0'),   false);
check('not a string',           isNewerVersion(3, '2.0.0'),        false);
check('this Cue unknown',       isNewerVersion('2.0.0', ''),       false);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
