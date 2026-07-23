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
