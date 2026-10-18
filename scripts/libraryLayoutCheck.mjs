// Does the Library stack its three columns, or show them side by side?
//
// The preference frees a TABLET in portrait. It must never free a phone: three
// columns on a 390pt screen is not a layout. That asymmetry is the whole reason
// this rule lives in a function of its own rather than inline in the view.
//
// Run: node scripts/libraryLayoutCheck.mjs

import { shouldStack } from '../src/utils/libraryLayout.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${got}\n      want: ${want}`);
}

// The three device shapes, each with the preference both ways.
const PHONE_PORTRAIT   = { portraitPanels: true,  tabletPortrait: false };
const TABLET_PORTRAIT  = { portraitPanels: true,  tabletPortrait: true  };
const LANDSCAPE_OR_WIDE = { portraitPanels: false, tabletPortrait: false };

// ---- 1. a phone always stacks ---------------------------------------------
check('phone portrait, preference off', shouldStack({ ...PHONE_PORTRAIT, columnsOnTablet: false }), true);
check('phone portrait, preference ON', shouldStack({ ...PHONE_PORTRAIT, columnsOnTablet: true }), true);
// Even if something upstream got the flags wrong, the phone case cannot unstack
// by preference alone — only by not being portrait at all.
check('a phone cannot be freed by the setting', shouldStack({ portraitPanels: true, tabletPortrait: false, columnsOnTablet: true }), true);

// ---- 2. a tablet in portrait is the one that can choose -------------------
check('tablet portrait, default', shouldStack({ ...TABLET_PORTRAIT, columnsOnTablet: false }), true);
check('tablet portrait, opted into columns', shouldStack({ ...TABLET_PORTRAIT, columnsOnTablet: true }), false);

// ---- 3. landscape and desktop are untouched -------------------------------
check('landscape, preference off', shouldStack({ ...LANDSCAPE_OR_WIDE, columnsOnTablet: false }), false);
check('landscape, preference on', shouldStack({ ...LANDSCAPE_OR_WIDE, columnsOnTablet: true }), false);
// A tablet rotated to landscape: portraitPanels goes false, so it is already
// three columns and the preference changes nothing.
check('tablet landscape ignores the setting', shouldStack({ portraitPanels: false, tabletPortrait: false, columnsOnTablet: true }), false);

// ---- 4. the default is the behaviour that shipped -------------------------
// Nobody's layout changes until they ask for it.
for (const shape of [PHONE_PORTRAIT, TABLET_PORTRAIT, LANDSCAPE_OR_WIDE]) {
  check(`unset preference matches today: ${JSON.stringify(shape)}`,
    shouldStack({ ...shape, columnsOnTablet: undefined }), shape.portraitPanels);
}

// ---- 5. missing or junk flags fail SAFE, i.e. stacked ---------------------
// A missing flag must not spread three columns onto something small.
check('no arguments at all', shouldStack({}), false);           // not portrait → nothing to stack
check('portrait with nothing else known', shouldStack({ portraitPanels: true }), true);
check('a truthy non-boolean preference still needs a tablet', shouldStack({ portraitPanels: true, tabletPortrait: 0, columnsOnTablet: 'yes' }), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
