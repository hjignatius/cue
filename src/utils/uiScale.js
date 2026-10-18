// How big the app's text is, as a percentage of normal.
//
// The browser's root font size is the lever. Tailwind sizes AND spacing are rem,
// so moving the root scales the type and the gaps around it together and the
// layout reflows — which is what Cmd+ does, rather than a transform that just
// magnifies pixels.
//
// WHAT IT DELIBERATELY DOES NOT MOVE: anything sized in explicit pixels. That is
// the song chart in the Preview, Present's song body (which has A-/A+ of its
// own) and the chord diagrams. Those stay put on purpose — the Preview is a
// faithful scale model of Present, and read-only ink lands on the same words in
// both only while nothing underneath them moves. Scaling the chrome is safe;
// scaling the chart would drag annotations off the words they were drawn over.

export const UI_SCALES = [90, 100, 110, 125, 150];
export const DEFAULT_UI_SCALE = 100;
const ROOT_PX = 16;   // the browser default this is a percentage OF

// A stored value we are willing to apply. Anything else — junk in the prefs
// blob, a value from a newer version, nothing at all — reads as 100, because an
// unreadable setting must leave the app at a size that definitely works.
export function normalizeUiScale(value) {
  const n = Math.trunc(Number(value));
  return UI_SCALES.includes(n) ? n : DEFAULT_UI_SCALE;
}

// The root font size to set, in px.
export function rootFontPx(value) {
  return ROOT_PX * normalizeUiScale(value) / 100;
}

// Applied by writing the style rather than a class, because the value is a
// continuum of possibilities rather than a fixed set of classes Tailwind could
// have compiled. 100% clears the property instead of setting 16px, so a browser
// or OS default other than 16 is still honoured by someone who never touches
// this setting.
export function applyUiScale(value, root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root) return;
  const n = normalizeUiScale(value);
  if (n === DEFAULT_UI_SCALE) root.style.removeProperty('font-size');
  else root.style.fontSize = `${rootFontPx(n)}px`;
}
