// Run every check suite in this folder.
//
// Cue's tests grew one file at a time, each written alongside the feature it
// guards, and for a while the only way to run them was to remember all twenty
// filenames. This is that list, discovered rather than written down: any new
// scripts/<name>Check.mjs is picked up with no change here.
//
// A suite is a plain node script that prints "<n> passed, <n> failed" and exits
// non-zero if anything failed. This runner reports one line per suite, prints
// the full output of any that fail, and fails the run if any of them did.
//
// chordAudit is deliberately NOT a gate — it reports advisory notes about chord
// shapes and exits 0 either way — so it runs at the end, where its notes are
// visible without being able to break the build.
//
// Run: npm test

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Suites that gate the run: every *Check*.mjs, plus the ones named differently.
const EXTRA_SUITES = ['styleRoundTrip.mjs'];
// Not suites: a generator, a build step, the advisory audit, and this runner.
const NOT_SUITES = new Set(['generateChords.mjs', 'inject-sw-precache.mjs', 'chordAudit.mjs', 'test.mjs']);

const suites = [
  ...readdirSync(here).filter(f => f.endsWith('.mjs') && f.includes('Check') && !NOT_SUITES.has(f)),
  ...EXTRA_SUITES,
].sort();

// A suite's own total, from the "<n> passed, <n> failed" line it signs off with.
function countsOf(output) {
  const m = output.match(/(\d+) passed, (\d+) failed/);
  return m ? { passed: Number(m[1]), failed: Number(m[2]) } : null;
}

let suitesFailed = 0, passed = 0, failed = 0;
const failures = [];

for (const suite of suites) {
  let output = '', ok = true;
  try {
    output = execFileSync('node', [join(here, suite)], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    ok = false;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }
  const counts = countsOf(output);
  if (counts) { passed += counts.passed; failed += counts.failed; }
  if (ok) {
    console.log(`PASS  ${suite.padEnd(26)} ${counts ? `${counts.passed} checks` : ''}`);
  } else {
    suitesFailed++;
    failures.push({ suite, output });
    console.log(`FAIL  ${suite.padEnd(26)} ${counts ? `${counts.failed} of ${counts.passed + counts.failed} checks` : 'did not finish'}`);
  }
}

for (const { suite, output } of failures) {
  console.log(`\n---- ${suite} ----\n${output.trim()}`);
}

console.log(`\n${suites.length} suites · ${passed} checks passed, ${failed} failed`);

// Advisory, never a gate — see the note at the top.
try {
  const audit = execFileSync('node', [join(here, 'chordAudit.mjs')], { encoding: 'utf8', stdio: 'pipe' });
  const summary = audit.trim().split('\n').pop();
  console.log(`\nchordAudit (advisory) · ${summary}`);
} catch {
  console.log('\nchordAudit (advisory) · did not run');
}

process.exit(suitesFailed ? 1 : 0);
