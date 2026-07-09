import { useRef, useState } from 'react';

/**
 * Returns [width, handleProps] for a resizable panel.
 *
 * The panel must sit to the RIGHT of the drag handle — dragging right shrinks
 * it, dragging left grows it. Pointer capture keeps tracking smooth even when
 * the pointer leaves the handle element.
 *
 * @param {number} defaultPx  Initial width when no saved value exists
 * @param {number} minPx      Minimum allowed width
 * @param {number} maxPx      Maximum allowed width
 * @param {string} storageKey localStorage key for persistence
 */
export function useResizePanel(defaultPx, minPx, maxPx, storageKey) {
  const [width, setWidth] = useState(() => {
    try {
      const n = parseInt(localStorage.getItem(storageKey) || '', 10);
      if (!isNaN(n)) return Math.min(maxPx, Math.max(minPx, n));
    } catch {}
    return defaultPx;
  });

  const drag     = useRef(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  function onPointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startW: widthRef.current };
  }

  function onPointerMove(e) {
    if (!drag.current) return;
    const next = Math.min(maxPx, Math.max(minPx,
      drag.current.startW - (e.clientX - drag.current.startX)
    ));
    setWidth(next);
  }

  function onPointerUp(e) {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    try { localStorage.setItem(storageKey, String(Math.round(widthRef.current))); } catch {}
  }

  return [width, { onPointerDown, onPointerMove, onPointerUp }];
}
