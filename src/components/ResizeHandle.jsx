import { useState, useRef } from 'react';
import { ROUND_FILL_NIGHT, ROUND_FILL_DAY } from './RoundButton.jsx';

/**
 * @param hitWidth  Width of the transparent touch target. It grows from the
 *                  handle's left edge INTO the panel (useResizePanel's contract
 *                  puts the panel to the right), never over the neighbour — a
 *                  target that overhung the lyric scroller would swallow finger
 *                  scrolls and Pencil strokes there, and native scrolling could
 *                  not be handed back because the scroller is not an ancestor.
 *                  Defaults to 12 (no overlay) so the editor's handles keep their
 *                  existing footprint over the textarea.
 * @param hitTop    Distance from the top at which the target starts, so it can
 *                  clear chrome pinned above it. Callers derive this from that
 *                  chrome's real height rather than guessing.
 * @param grip      Show a small centred grab indicator. Off by default; the
 *                  editor's handles sit between visibly distinct panes and do
 *                  not need one.
 * @param ignorePen Ignore stylus input, so an Apple Pencil never resizes. Matches
 *                  Present's rule that a Pencil always draws even when Annotate is
 *                  off. Off by default so the editor's handles, which sit over a
 *                  textarea rather than an ink canvas, still accept a stylus.
 */
export default function ResizeHandle({ handleProps, dark, hitWidth = 12, hitTop = 0, grip = false, ignorePen = false }) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef(null);

  function showTab() {
    clearTimeout(hideTimer.current);
    setVisible(true);
  }

  function scheduleHide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 1500);
  }

  function onPointerDown(e) {
    // A stylus is for drawing, never for resizing. Bail before the hook can
    // preventDefault/setPointerCapture, so the gesture is not consumed.
    if (ignorePen && e.pointerType === 'pen') return;
    showTab();
    handleProps.onPointerDown(e);
  }

  function onPointerUp(e) {
    if (ignorePen && e.pointerType === 'pen') return;
    scheduleHide();
    handleProps.onPointerUp(e);
  }

  function onPointerCancel() {
    scheduleHide();
  }

  const barColor = visible
    ? (dark ? 'bg-indigo-500' : 'bg-indigo-400')
    : (dark ? 'bg-gray-800 group-hover:bg-indigo-600' : 'bg-gray-200 group-hover:bg-indigo-500');

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={e => { if (ignorePen && e.pointerType === 'pen') return; handleProps.onPointerMove(e); }}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ width: 12, touchAction: 'none', flexShrink: 0 }}
      className="group relative cursor-col-resize select-none overflow-visible"
    >
      {/* Enlarged transparent touch target. Overflows the 12px strip to the
          right only (the container is overflow-visible); events bubble to the
          handlers above. Only rendered when the caller asks for it. */}
      {hitWidth > 12 && (
        <div className="absolute bottom-0" style={{ left: 0, top: hitTop, width: hitWidth }} />
      )}

      {/* Thin visual line */}
      <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] transition-colors ${barColor}`} />

      {/* Grab indicator — the strip is otherwise a 3px line that only reveals
          itself on hover, which does not exist on a touch screen. Same fill
          family as the round controls so it reads as chrome, not content. */}
      {grip && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: 4, height: 28, background: dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY }}
        />
      )}
    </div>
  );
}
