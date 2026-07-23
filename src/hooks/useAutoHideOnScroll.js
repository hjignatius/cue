import { useEffect, useState } from 'react';

// Hide a floating control while scrolling toward the end of a list; reveal it
// immediately on any upward scroll. Returns `hidden`.
//
// `getScrollEl` resolves the element that actually scrolls; `key` re-runs the
// effect (re-attaching to the new element and revealing) whenever the active
// panel changes.
//
// iOS Safari specifics, all deliberate:
//   - scrollTop is clamped to >= 0. Rubber-banding reports negative values at
//     the top and past-the-end values at the bottom, both of which otherwise
//     produce phantom direction flips.
//   - deltas under 8px are ignored as noise, so a jittery finger doesn't toggle.
//   - the listener is passive and only reads scrollTop inside rAF, never on
//     every scroll event.
//   - it attaches to the panel's scroller, not window — the panels scroll
//     internally, so window never fires.
//
// Under prefers-reduced-motion the hook attaches nothing and always reports
// visible, so the control never moves.
export function useAutoHideOnScroll(getScrollEl, key) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false); // always reveal when the active panel changes
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const el = getScrollEl?.();
    if (!el) return;

    let last = Math.max(0, el.scrollTop);
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = Math.max(0, el.scrollTop);
        if (y <= 24) { setHidden(false); last = y; return; } // always shown near the top
        const dy = y - last;
        if (Math.abs(dy) < 8) return;                        // ignore jitter
        setHidden(dy > 0);                                   // down hides, up reveals
        last = y;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return hidden;
}
