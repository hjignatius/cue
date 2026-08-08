import { useEffect, useState } from 'react';

// True when the editor chrome must collapse to stay usable on a phone:
//
//   (max-width: 767px)                      iPhone portrait — width-constrained.
//   (max-height: 450px) and (pointer: coarse)
//                                           iPhone landscape (~390pt tall) —
//                                           height-constrained, where a wrapped
//                                           toolbar row eats a large share of the
//                                           editing area.
//
// The pointer: coarse guard is what keeps a short desktop browser window on the
// full toolbar — a mouse user with a squat window is not space-starved the way a
// phone is.
const QUERIES = [
  '(max-width: 767px)',
  '(max-height: 450px) and (pointer: coarse)',
];

export function useCompactChrome() {
  // Seed from matchMedia so the first paint is already the right chrome.
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && QUERIES.some(q => window.matchMedia(q).matches)
  );

  useEffect(() => {
    const mqls = QUERIES.map(q => window.matchMedia(q));
    const update = () => setCompact(mqls.some(m => m.matches));
    update();
    mqls.forEach(m => m.addEventListener('change', update));
    return () => mqls.forEach(m => m.removeEventListener('change', update));
  }, []);

  return compact;
}

// A phone held in landscape: short, touch, and wider than tall. Distinguishes
// iPhone-landscape from iPhone-portrait (both are compact chrome) so the editor
// can spread controls out and use the side-by-side panel layout there. iPad is
// excluded by the height cap; a mouse desktop by pointer: coarse.
const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';

export function usePhoneLandscape() {
  const [landscape, setLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(LANDSCAPE_QUERY).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(LANDSCAPE_QUERY);
    const update = () => setLandscape(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return landscape;
}
