import { useEffect, useState } from 'react';

export function useIsNarrow(breakpointPx = 1024) {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth < breakpointPx : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const handler = (e) => setNarrow(e.matches);
    mql.addEventListener('change', handler);
    setNarrow(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpointPx]);
  return narrow;
}
