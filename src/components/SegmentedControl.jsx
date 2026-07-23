import { useRef } from 'react';

// Enclosed pill selector: a rounded track holding N text-only segments, with a
// single thumb that slides behind the active one. Follows RoundButton's
// convention — tokens as exported constants, Tailwind classes plus inline styles
// for the computed geometry, no per-component stylesheet.

// Track padding (px). The thumb is inset by this on all four sides, so a
// segment's width is exactly (track padding-box - 2 * pad) / count.
const PAD = { sm: 3, lg: 4 };
// Total track height (px). lg equals MIN_TOUCH_TARGET so it needs no extra hit padding.
export const SEGMENTED_HEIGHT = { sm: 32, lg: 44 };
const FONT = { sm: 13, lg: 15 };

/**
 * @param options   [{ id, label }] — text only, no icons
 * @param value     id of the active option
 * @param onChange  (id) => void
 * @param size      'sm' | 'lg'
 * @param fullWidth stretch the track to its container
 * @param ariaLabel accessible name for the group
 * @param translucent  frosted track for floating use over scrolling content.
 *                     The opaque colour is the base rule and the translucent one
 *                     is applied only under supports-[backdrop-filter], which is
 *                     exactly the required @supports-not fallback.
 * @param segmentPadX  horizontal padding per segment (px)
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'sm',
  fullWidth = false,
  ariaLabel,
  translucent = false,
  segmentPadX,
}) {
  const btnRefs = useRef([]);
  const pad    = PAD[size] ?? PAD.sm;
  const height = SEGMENTED_HEIGHT[size] ?? SEGMENTED_HEIGHT.sm;
  const font   = FONT[size] ?? FONT.sm;
  const count  = options.length;
  // Unknown/absent value falls back to the first segment rather than -1.
  const activeIndex = Math.max(0, options.findIndex(o => o.id === value));

  function select(i) {
    const opt = options[i];
    if (!opt) return;
    onChange?.(opt.id);
    btnRefs.current[i]?.focus();
  }

  // Left/Right move selection and focus, wrapping at both ends.
  function onKeyDown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (count === 0) return;
    e.preventDefault();
    select((activeIndex + (e.key === 'ArrowRight' ? 1 : -1) + count) % count);
  }

  const track = translucent
    ? 'bg-gray-100 dark:bg-gray-800 supports-[backdrop-filter]:bg-gray-100/72 dark:supports-[backdrop-filter]:bg-gray-800/72 supports-[backdrop-filter]:backdrop-blur-[20px] border-gray-300/80 dark:border-gray-600/80 shadow-lg'
    : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`relative rounded-full border select-none ${track} ${fullWidth ? 'flex w-full' : 'inline-flex'}`}
      style={{ height, padding: pad }}
    >
      {/* One thumb for the whole track — translated, not re-rendered per segment.
          Stays fully opaque so the active label reads over scrolling content. */}
      {count > 0 && (
        <div
          aria-hidden="true"
          className="absolute rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 shadow-sm transition-transform duration-200 [transition-timing-function:ease] motion-reduce:transition-none"
          style={{
            top: pad,
            left: pad,
            width: `calc((100% - ${2 * pad}px) / ${count})`,
            height: `calc(100% - ${2 * pad}px)`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
      )}

      {options.map((opt, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={opt.id}
            ref={el => { btnRefs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(i)}
            className={`relative z-10 flex-1 flex items-center justify-center rounded-full border-0 bg-transparent whitespace-nowrap cursor-pointer transition-colors ${
              active
                ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            style={{ fontSize: font, paddingLeft: segmentPadX, paddingRight: segmentPadX }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
