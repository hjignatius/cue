import { useEffect, useState } from 'react';

function useMediaQuery(query) {
  // Seed from matchMedia so the first paint is already the right layout.
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

// Stack the three columns into one panel-at-a-time view with a selector.
//
// Orientation-based, capped at the largest tablet portrait width (the 12.9" iPad
// Pro is 1024pt): any portrait phone or tablet collapses, while every landscape
// device — including iPad landscape and desktop — keeps the side-by-side layout.
// A width-only query cannot separate 1024pt iPad-Pro portrait (should stack)
// from 1024pt iPad landscape (should not); orientation is what distinguishes
// them. A rotated desktop monitor wider than 1024 still shows three columns.
const PORTRAIT_PANELS_QUERY = '(orientation: portrait) and (max-width: 1024px)';
export function usePortraitPanels() {
  return useMediaQuery(PORTRAIT_PANELS_QUERY);
}

// Phone-width only. Drives header cosmetics that only the ~375–430pt phone
// header needs (hiding the logo mark, tighter padding) — a portrait iPad has
// room for both, so those stay off there even though it now stacks panels.
const PHONE_QUERY = '(max-width: 767px)';
export function useIsPhonePortrait() {
  return useMediaQuery(PHONE_QUERY);
}
