// Shared round control and its fill palette, used by the Present floating panel,
// the chord size strip, and the editor header. Owns the palette so no consumer
// has to import from a sibling (e.g. SongChordPanel must not depend on the
// Present-only PresentControls).

// NIGHT/DAY are translucent: tuned to sit OVER content (lyrics, blank stage),
// where a semi-transparent grey reads well and does not dominate. ACTIVE is the
// indigo "on"/anchor state.
export const ROUND_FILL_NIGHT  = 'rgba(140,140,140,0.55)';
export const ROUND_FILL_DAY    = 'rgba(70,70,70,0.55)';
export const ROUND_FILL_ACTIVE = 'rgba(79,70,229,0.85)'; // indigo-600

// Opaque day fill for buttons that sit on solid CHROME (menu bars) rather than
// content. The translucent DAY fill composites to ~#979797 on light chrome —
// white glyphs at only ~2.9:1, below WCAG AA. This is #374151 (slate-700), fully
// opaque so the background is irrelevant, giving white glyphs 11.35:1. Neutral,
// so it does not compete with the indigo ACTIVE. (Night chrome uses ROUND_FILL_
// NIGHT unchanged — it composites to ~#4e5055, 8:1, already fine.)
export const ROUND_FILL_DAY_CHROME = '#374151';

// iOS minimum touch target (44pt = 44 CSS px). A control smaller than this keeps
// its visual size and pads the hit area out to meet it.
export const MIN_TOUCH_TARGET = 44;

// The "action/utility" size tier: Present's gutter buttons, the chord strip, and
// the editor header. Smaller than the 64px primary panel, equal to the touch
// minimum so RoundButton adds no padding.
export const ROUND_SIZE_ACTION = 44;

// The "compact" size tier: the dense panel/toolbar sub-headers (Library's
// Select/New Song, Sets, Setlist Present/Edit, the editor's Preview/Chords
// toggles). Matches the 36px visual height those rows already used, so pills sit
// flush with their non-round neighbours; RoundButton still pads the hit area out
// to the 44px touch minimum.
export const ROUND_SIZE_COMPACT = 36;

// Solid navigation triangles — shared by Present's prev/next controls and the
// editor header's prev/next. They live here (the shared leaf that already owns
// the fills) rather than in the Present-only PresentControls, so the editor does
// not have to depend on a Present component or copy the path.
export function TriangleLeft({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M16 4.5 L16 19.5 L5.5 12 Z" fill="currentColor" />
    </svg>
  );
}
export function TriangleRight({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 4.5 L8 19.5 L18.5 12 Z" fill="currentColor" />
    </svg>
  );
}

/**
 * A coloured control with white content. Two shapes:
 *   - circle (default): a `size` px circle centred in a transparent button whose
 *     hit area is at least MIN_TOUCH_TARGET. At size >= 44 the button box and the
 *     circle are the same size, so the 64px Present controls are unaffected.
 *   - pill (`pill` set): an auto-width rounded-full bar `size` px tall, holding
 *     the caller's children in a row (icon + label, arranged by the caller). For
 *     labelled menu controls, where a detached label beside a circle reads as
 *     orphaned. Hit height stays >= MIN_TOUCH_TARGET.
 *
 * `label` is the aria-label; `title` is the hover tooltip (menu surfaces want it).
 *
 * aria-disabled rather than the `disabled` attribute: disabled form controls
 * swallow pointer events in Safari/Chrome, which would create dead patches the
 * floating panel could not be dragged from. The handler is omitted, so it stays a
 * true no-op.
 */
export default function RoundButton({
  size,
  label,
  title,
  onActivate,
  fill,
  disabled = false,
  active = false,
  pill = false,
  disabledOpacity = 0.3,
  touchAction = 'none',
  children,
}) {
  const hit = Math.max(size, MIN_TOUCH_TARGET);
  const bg = active ? ROUND_FILL_ACTIVE : fill;
  const opacity = disabled ? disabledOpacity : 1;
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onActivate}
      className="group flex items-center justify-center shrink-0 bg-transparent"
      style={{
        // Pill: auto width, min-width the touch target. Circle: square hit box.
        width: pill ? undefined : hit,
        minWidth: pill ? hit : undefined,
        height: hit,
        cursor: disabled ? 'default' : 'pointer',
        touchAction,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* The visual shape. Press-scale lives here rather than on the button so a
          padded hit area does not scale its transparent surround. */}
      {pill ? (
        <span
          className="flex items-center gap-2 rounded-full text-white select-none transition-transform group-active:scale-95"
          style={{ height: size, paddingLeft: 12, paddingRight: 16, background: bg, opacity }}
        >
          {children}
        </span>
      ) : (
        <span
          className="flex items-center justify-center rounded-full text-white select-none transition-transform group-active:scale-95"
          style={{ width: size, height: size, background: bg, opacity }}
        >
          {children}
        </span>
      )}
    </button>
  );
}
