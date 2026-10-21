// How big Present's floating panel is: full size, or 80%.
//
// Two sizes and nothing between. 80% is the floor because it is where the
// buttons reach the touch minimum: 54px x 0.8 is 43, and a circle smaller than
// 44 still needs a 44px hit box, so the panel would look smaller while taking
// the same room — and the height sums below would stop adding up.
//
// The panel is RESIZED, not magnified. Every dimension is multiplied here and
// the panel lays itself out from the result, so the draggable hook clamps it to
// the edges at the size it actually is. A CSS transform would leave the layout
// box at full size: it would stop short of the screen edges and collapse toward
// the wrong corner.
//
// Per device by construction: it is a pref, and prefs live in this browser's
// localStorage — cloud sync and backups carry none of them.

export const PANEL_SIZES = [100, 80];
export const DEFAULT_PANEL_SIZE = 100;

// The iOS touch minimum (RoundButton's MIN_TOUCH_TARGET). Repeated rather than
// imported so this stays a plain module the checks can load in Node.
const TOUCH_MIN = 44;

// Full-size dimensions, px. PresentControls' layout is built from these.
const FULL = {
  button:   54,  // control and tool circles
  gap:      12,
  padding:  12,
  toggleW:  80,  // the Controls/Tools pill
  toggleH:  40,
  handleH:  24,  // the bare collapse chevron, when there are no tools
  saveRowH: 40,  // the "Save speed" row under the grid
};

// A stored value we are willing to apply. Anything else reads as full size,
// because an unreadable setting must leave the panel at a size that works.
export function normalizePanelSize(value) {
  const n = Math.trunc(Number(value));
  return PANEL_SIZES.includes(n) ? n : DEFAULT_PANEL_SIZE;
}

export function panelMetrics(value) {
  const size = normalizePanelSize(value);
  const scale = size / 100;
  const px = (n) => Math.round(n * scale);
  return {
    size,
    scale,
    button:   Math.max(TOUCH_MIN, px(FULL.button)),
    gap:      px(FULL.gap),
    padding:  px(FULL.padding),
    toggleW:  px(FULL.toggleW),
    toggleH:  px(FULL.toggleH),
    // The toggle keeps a full touch-height hit box at any size; only the pill
    // you see shrinks.
    toggleHitH: TOUCH_MIN,
    handleH:  px(FULL.handleH),
    // Already below the touch minimum at full size; 36 keeps its label legible.
    saveRowH: Math.max(36, px(FULL.saveRowH)),
  };
}

// A glyph or icon inside a panel button, scaled with it. 11px is the floor so
// the smallest label (FP / SC, 13px at full size) stays readable.
export function panelGlyph(n, metrics) {
  return Math.max(11, Math.round(n * (metrics?.scale ?? 1)));
}
