// Present's floating panel: full size or 80%, per device.
//
// The panel lays itself out from panelMetrics(), so these are the guarantees
// that layout leans on: no button under the touch minimum, the two sizes only,
// junk reading as full size, and the Controls tab still fitting a phone held
// sideways at either size.
//
// Run: node scripts/presentPanelSizeCheck.mjs

import { PANEL_SIZES, DEFAULT_PANEL_SIZE, normalizePanelSize, panelMetrics, panelGlyph } from '../src/utils/presentPanelSize.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- 1. the offered sizes --------------------------------------------------
check('two sizes, nothing between', PANEL_SIZES, [100, 80]);
check('full is the default', DEFAULT_PANEL_SIZE, 100);
for (const n of PANEL_SIZES) check(`${n}% survives`, normalizePanelSize(n), n);
check('a numeric string is accepted', normalizePanelSize('80'), 80);

// ---- 2. anything else reads as full size ----------------------------------
for (const junk of [0, 90, 70, 50, 120, 0.8, '', null, undefined, NaN, 'small', {}, []]) {
  check(`junk reads as full: ${JSON.stringify(junk)}`, normalizePanelSize(junk), 100);
}

// ---- 3. full size is exactly what the panel was ---------------------------
// Nothing may move for a device that never touches the setting.
const full = panelMetrics(100);
check('full: the layout it always had', full, {
  size: 100, scale: 1, button: 54, gap: 12, padding: 12,
  toggleW: 80, toggleH: 40, toggleHitH: 44, handleH: 24, saveRowH: 40,
});
check('junk lays out as full', panelMetrics('rubbish'), full);

// ---- 4. 80% ---------------------------------------------------------------
const small = panelMetrics(80);
check('80%: buttons sit on the touch minimum, not under it', small.button, 44);
check('80%: gap', small.gap, 10);
check('80%: padding', small.padding, 10);
check('80%: toggle pill', [small.toggleW, small.toggleH], [64, 32]);
check('80%: toggle hit box keeps its touch height', small.toggleHitH, 44);
check('80%: save row floored for its label', small.saveRowH, 36);

// ---- 5. the sums the panel makes ------------------------------------------
// Mirrors PresentControls: header + gap + body + padding + 1px border each side.
const GRID_ROWS = 4;
function controlsH(m, saveRow = true) {
  const grid = m.button * GRID_ROWS + m.gap * (GRID_ROWS - 1);
  const body = grid + (saveRow ? m.saveRowH + m.gap : 0);
  return m.toggleH + m.gap + body + m.padding * 2 + 2;
}
function toolsH(m, rows) {
  return m.toggleH + m.gap + (rows * m.button + m.gap * (rows - 1)) + m.padding * 2 + 2;
}
const width = (m) => m.button * 2 + m.gap + m.padding * 2;

check('full Controls tab is the 382px it was', controlsH(full), 382);
check('full width is the 144px it was', width(full), 144);
check('80% Controls tab', controlsH(small), 316);
check('80% width', width(small), 118);
check('80% Tools tab, three rows', toolsH(small, 3), 216);

// A phone in landscape is ~402px tall; the Controls tab must fit inside it at
// either size, or the Save speed row falls off the bottom.
for (const m of [full, small]) check(`${m.size}% fits a 402px landscape phone`, controlsH(m) <= 402, true);
check('80% is genuinely smaller', controlsH(small) < controlsH(full) && width(small) < width(full), true);

// ---- 6. glyphs ------------------------------------------------------------
check('full glyphs are unchanged', [24, 26, 20, 13].map(n => panelGlyph(n, full)), [24, 26, 20, 13]);
check('80% glyphs scale', [24, 26, 28, 20, 22].map(n => panelGlyph(n, small)), [19, 21, 22, 16, 18]);
check('the smallest label keeps a floor', panelGlyph(13, small), 11);
check('no metrics reads as full', panelGlyph(24), 24);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
