import { useEffect, useRef, useState } from 'react';

// Touch pull-to-refresh for a scrollable element. Attach the returned ref to the
// scroll container and render an indicator sized by `pull`. When the user drags
// down past `threshold` from the very top and releases, `onRefresh` runs (awaited
// so the spinner holds until it settles).
//
// Native listeners are used (not React's synthetic ones) because touchmove must
// be non-passive to preventDefault the browser's overscroll while pulling. All
// mutable gesture state lives in a ref to avoid stale-closure bugs; only `pull`
// and `refreshing` drive rendering. Touch-only by design — desktop refreshes via
// focus/reload.
export function usePullToRefresh(onRefresh, { threshold = 64, max = 90 } = {}) {
  const ref = useRef(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const st = useRef({ startY: null });
  // Keep the latest onRefresh without re-attaching listeners each render.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const setP = (p) => { st.current.pull = p; setPull(p); };

    const onStart = (e) => {
      // Only begin a pull when the list is already at the top and idle.
      if (el.scrollTop <= 0 && !st.current.refreshing) st.current.startY = e.touches[0].clientY;
      else st.current.startY = null;
    };
    const onMove = (e) => {
      if (st.current.startY == null || st.current.refreshing) return;
      const dy = e.touches[0].clientY - st.current.startY;
      if (dy <= 0) { setP(0); return; }
      setP(Math.min(max, dy * 0.5));          // resistance: half the finger travel
      if (st.current.pull > 2) e.preventDefault(); // suppress native overscroll while pulling
    };
    const onEnd = async () => {
      if (st.current.startY == null) return;
      st.current.startY = null;
      if (st.current.pull >= threshold && !st.current.refreshing) {
        st.current.refreshing = true; setRefreshing(true); setP(threshold);
        try { await onRefreshRef.current?.(); } finally { st.current.refreshing = false; setRefreshing(false); setP(0); }
      } else {
        setP(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [threshold, max]);

  return { ref, pull, refreshing };
}
