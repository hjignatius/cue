import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

// A vertical three-dot trigger plus an anchored dropdown, for per-row actions in
// the Library / Sets / Setlist panels.
//
// The menu renders in a portal with fixed positioning computed from the trigger,
// so a list's `overflow-y-auto` can never clip it and a bottom row's menu flips
// upward when there isn't room below. It closes on selection, outside press,
// Escape, or any scroll (a fixed menu would otherwise detach from its row).
//
// items: array of { id, label, onSelect, disabled?, danger?, icon? }. `icon` is a
// lucide component; it inherits the row's text color via currentColor, so a red
// (danger) item's icon is red too. Falsy entries are skipped, so callers can
// inline conditionals (cond && { ... }).
export default function RowMenu({ items, dark, label = 'More actions', iconSize = 19, buttonClassName }) {
  const [open, setOpen]     = useState(false);
  const [coords, setCoords] = useState(null); // { top, left } in viewport px
  const [pending, setPending] = useState(null); // id of a just-tapped item, held highlighted
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  const visible = (items || []).filter(Boolean);

  // Held tap feedback: highlight the tapped item, hold it a clearly perceptible
  // beat so the choice registers, then run the action. On a slow device the action
  // then blocks or navigates (unmounting this menu) while that gray is still
  // painted, so the press stays visible through the wait rather than the menu just
  // vanishing. The hold must exceed a couple of frames — otherwise the item
  // navigates away before the highlight is ever seen.
  const HOLD_MS = 150;
  function choose(it) {
    if (it.disabled) return;
    setPending(it.id);
    setTimeout(() => {
      it.onSelect?.();
      setOpen(false);
      setPending(null);
    }, HOLD_MS);
  }

  // Clear any held highlight whenever the menu closes (e.g. dismissed by an
  // outside tap) so it never lingers into the next open.
  useEffect(() => { if (!open) setPending(null); }, [open]);

  useLayoutEffect(() => {
    if (!open) { setCoords(null); return; }
    const trig = wrapRef.current;
    const el = menuRef.current;
    if (!trig || !el) return;
    const MARGIN = 8, GAP = 4;
    const r = trig.getBoundingClientRect();
    const menuH = el.offsetHeight;
    const menuW = el.offsetWidth;
    const below = window.innerHeight - r.bottom;
    const openUp = below < menuH + GAP + MARGIN && r.top > below;
    const top = openUp
      ? Math.max(MARGIN, r.top - menuH - GAP)
      : r.bottom + GAP;
    // Right-align the menu to the trigger, then clamp inside the viewport.
    const left = Math.max(MARGIN, Math.min(r.right - menuW, window.innerWidth - menuW - MARGIN));
    setCoords({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (wrapRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }
    // A fixed-positioned menu would drift from its row on scroll — close instead.
    function onScroll() { setOpen(false); }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className={buttonClassName || `h-9 w-9 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
          open
            ? (dark ? 'text-white bg-gray-800' : 'text-gray-900 bg-gray-200')
            : 'text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-gray-200/60 dark:hover:bg-gray-800 active:bg-gray-300/60 dark:active:bg-gray-700'
        }`}
      >
        <MoreVertical size={iconSize} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          className={`fixed z-50 min-w-[12rem] rounded-xl border shadow-xl overflow-hidden ${
            dark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}
          style={{
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            visibility: coords ? 'visible' : 'hidden',
          }}
        >
          {visible.map(it => {
            const isPending = pending === it.id;
            const text = it.disabled
              ? (dark ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
              : it.danger ? (dark ? 'text-red-400' : 'text-red-600')
                          : (dark ? 'text-gray-200' : 'text-gray-800');
            // Held highlight while pending; otherwise hover (mouse) + a stronger
            // active shade for the press itself (touch).
            const bg = it.disabled ? ''
              : isPending ? (dark ? 'bg-gray-700' : 'bg-gray-200')
                          : (dark ? 'hover:bg-gray-800 active:bg-gray-700' : 'hover:bg-gray-100 active:bg-gray-200');
            return (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => choose(it)}
                className={`w-full flex items-center gap-2 px-3 py-3 pointer-fine:py-2.5 text-sm text-left ${text} ${bg}`}
              >
                {it.icon && <it.icon size={16} strokeWidth={2} className="shrink-0" />}
                {it.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </span>
  );
}
