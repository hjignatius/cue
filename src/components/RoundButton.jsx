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

/**
 * A coloured circle of `size` px centred inside a transparent button whose hit
 * area is at least MIN_TOUCH_TARGET. At size >= 44 the button box and the circle
 * are the same size, so the 64px Present controls are unaffected.
 *
 * aria-disabled rather than the `disabled` attribute: disabled form controls
 * swallow pointer events in Safari/Chrome, which would create dead patches the
 * floating panel could not be dragged from. The handler is omitted, so it stays a
 * true no-op.
 */
export default function RoundButton({
  size,
  label,
  onActivate,
  fill,
  disabled = false,
  active = false,
  disabledOpacity = 0.3,
  touchAction = 'none',
  children,
}) {
  const hit = Math.max(size, MIN_TOUCH_TARGET);
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onActivate}
      className="group flex items-center justify-center shrink-0 bg-transparent"
      style={{
        width: hit,
        height: hit,
        cursor: disabled ? 'default' : 'pointer',
        touchAction,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* The visual circle. Press-scale lives here rather than on the button so a
          padded hit area does not scale its transparent surround. */}
      <span
        className="flex items-center justify-center rounded-full text-white select-none transition-transform group-active:scale-95"
        style={{
          width: size,
          height: size,
          background: active ? ROUND_FILL_ACTIVE : fill,
          opacity: disabled ? disabledOpacity : 1,
        }}
      >
        {children}
      </span>
    </button>
  );
}
