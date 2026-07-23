import { useEffect, useState } from 'react';

// Phone-width viewports only. Deliberately a WIDTH query rather than
// (orientation: portrait): iPad portrait is 768pt+ and must keep the existing
// three-panel layout, which an orientation query would wrongly collapse.
const QUERY = '(max-width: 767px)';

export function useIsPhonePortrait() {
  // Seed from matchMedia so the first paint is already the right layout.
  const [isPhonePortrait, setIsPhonePortrait] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e) => setIsPhonePortrait(e.matches);
    setIsPhonePortrait(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isPhonePortrait;
}
