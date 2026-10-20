// The app's text size.
//
// The browser's root font size is the lever: Tailwind sizes AND spacing are rem,
// so moving the root scales type and the gaps around it together and the layout
// reflows — what Cmd+ does, rather than magnifying pixels.
//
// What it must NOT move is anything sized in explicit pixels: the song chart in
// the Preview, Present's song body, the chord diagrams. The Preview is a
// faithful scale model of Present, and ink lands on the same words in both only
// while nothing underneath them moves.
//
// Run: node scripts/uiScaleCheck.mjs

import { UI_SCALES, DEFAULT_UI_SCALE, normalizeUiScale, rootFontPx, applyUiScale } from '../src/utils/uiScale.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- 1. the offered sizes --------------------------------------------------
check('the steps are predictable, not a slider', UI_SCALES, [80, 90, 100, 110, 125]);
check('normal is one of them', UI_SCALES.includes(DEFAULT_UI_SCALE), true);
for (const n of UI_SCALES) check(`${n}% survives`, normalizeUiScale(n), n);

// ---- 2. anything else reads as normal -------------------------------------
// An unreadable setting must leave the app at a size that definitely works.
for (const junk of [0, -100, 75, 200, 101, 1.5, '', null, undefined, NaN, 'large', {}, []]) {
  // 150 belongs here now: it was an offered size in earlier versions, so a
  // device that still has it stored must come back to normal, not stay large.
  check(`junk reads as ${DEFAULT_UI_SCALE}: ${JSON.stringify(junk)}`, normalizeUiScale(junk), DEFAULT_UI_SCALE);
}
check('a numeric string is accepted', normalizeUiScale('125'), 125);
check('the retired 150 reads as normal', normalizeUiScale(150), DEFAULT_UI_SCALE);

// ---- 3. the root size it works out to -------------------------------------
check('80% of 16px', rootFontPx(80), 12.8);
check('90%', rootFontPx(90), 14.4);
check('100% is the browser default', rootFontPx(100), 16);
check('110%', rootFontPx(110), 17.6);
check('125%', rootFontPx(125), 20);
check('junk lands on the default', rootFontPx('nonsense'), 16);

// ---- 4. applying it -------------------------------------------------------
function fakeRoot() {
  const props = {};
  return {
    style: {
      set fontSize(v) { props['font-size'] = v; },
      get fontSize() { return props['font-size'] ?? ''; },
      removeProperty(k) { delete props[k]; },
    },
    _props: props,
  };
}

let root = fakeRoot();
applyUiScale(125, root);
check('a chosen size is written', root.style.fontSize, '20px');

// 100% CLEARS the property rather than writing 16px, so a browser or OS default
// other than 16 is still honoured by someone who never touches this setting.
applyUiScale(100, root);
check('normal clears the property', root._props['font-size'], undefined);

root = fakeRoot();
applyUiScale('rubbish', root);
check('junk clears it too, rather than writing NaN', root._props['font-size'], undefined);

root = fakeRoot();
applyUiScale(125, root);
applyUiScale(90, root);
check('changing size replaces, never stacks', root.style.fontSize, '14.4px');

// No document, no crash — this runs at module load in a context that may have none.
check('no root at all is survivable', (() => {
  try { applyUiScale(125, null); return 'ok'; } catch (e) { return e.message; }
})(), 'ok');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
