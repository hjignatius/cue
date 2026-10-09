// Backdrop dismissal: when it fires, and when it must not.
//
// Howard: starting Fill in song details and tapping outside the progress window
// cancelled the search. Dismissing a dialog mid-run aborts the request, and a
// stray tap is not a decision to throw away a paid call — so while anything is
// running, the backdrop does nothing and only Cancel or the X close it.
//
// Run: node scripts/overlayDismissCheck.mjs

import { dismissOnOutside } from '../src/utils/overlayDismiss.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

const BACKDROP = { el: 'backdrop' };
const PANEL    = { el: 'panel' };

// Drive a press/release pair through whatever handlers the backdrop was given.
function gesture(handlers, pressOn, releaseOn) {
  handlers.onPointerDown?.({ target: pressOn, currentTarget: BACKDROP });
  handlers.onClick?.({ target: releaseOn, currentTarget: BACKDROP });
}
function spy() {
  const calls = { n: 0 };
  return [() => { calls.n++; }, calls];
}

// ---- 1. enabled: the ordinary cases ----------------------------------------
let [fn, calls] = spy();
gesture(dismissOnOutside(fn), BACKDROP, BACKDROP);
check('press and release on the backdrop dismisses', calls.n, 1);

[fn, calls] = spy();
gesture(dismissOnOutside(fn), PANEL, PANEL);
check('a click inside does not', calls.n, 0);

[fn, calls] = spy();
gesture(dismissOnOutside(fn), PANEL, BACKDROP);
check('a drag out of the panel does not', calls.n, 0);

[fn, calls] = spy();
gesture(dismissOnOutside(fn), BACKDROP, PANEL);
check('a drag into the panel does not', calls.n, 0);

// ---- 2. disabled: the reported bug -----------------------------------------
[fn, calls] = spy();
gesture(dismissOnOutside(fn, false), BACKDROP, BACKDROP);
check('while running, the backdrop does nothing', calls.n, 0);

// Cancel and the X are ordinary buttons — unaffected by any of this. They call
// the same handler directly, which is what keeps them working while disabled.
[fn, calls] = spy();
fn();
check('the close handler itself still works', calls.n, 1);

// ---- 3. the flag must not survive a disabled press -------------------------
// Press and hold the backdrop during a run; the run ends and dismissal comes
// back; let go. The click must not find a stale "you pressed the backdrop".
[fn, calls] = spy();
dismissOnOutside(() => {}, true).onPointerDown({ target: BACKDROP, currentTarget: BACKDROP }); // arm it
dismissOnOutside(fn, false).onPointerDown({ target: BACKDROP, currentTarget: BACKDROP });      // press while running
dismissOnOutside(fn, true).onClick({ target: BACKDROP, currentTarget: BACKDROP });             // release after it ends
check('a press made while disabled cannot dismiss later', calls.n, 0);

// And the normal path still arms correctly straight afterwards.
[fn, calls] = spy();
gesture(dismissOnOutside(fn, true), BACKDROP, BACKDROP);
check('dismissal works again once enabled', calls.n, 1);

// ---- 4. shape of the returned handlers -------------------------------------
check('enabled gives both handlers', Object.keys(dismissOnOutside(() => {})).sort(), ['onClick', 'onPointerDown']);
check('disabled gives only the flag-clearing press', Object.keys(dismissOnOutside(() => {}, false)), ['onPointerDown']);
check('a missing callback is tolerated', (() => {
  try { gesture(dismissOnOutside(undefined), BACKDROP, BACKDROP); return 'ok'; } catch (e) { return e.message; }
})(), 'ok');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
