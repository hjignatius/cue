import { useEffect, useState } from 'react';
import { useVirtualizer, defaultRangeExtractor } from '@tanstack/react-virtual';

// A list that may hold thousands of rows: the Library once a songbook is in it,
// or a set made from one.
//
// Drawing every row is what froze the Library at 4,600 songs — every letter
// typed in search re-made all 4,600 rows, ~1.5s apiece, and opening a set of
// them took ~3.5s. Past LONG_LIST_FROM rows only the ones on screen (and a
// screenful either side) exist; the rest are an empty space of the right
// height, so the scrollbar still says where you are.
//
// Under it nothing changes: a 40-song set is drawn exactly as it always was.
// That is deliberate. Setlist drag-to-reorder is what gets used mid-gig, and it
// should not take on new behaviour for the sake of a case it never meets.
//
// The list must be the first thing in `scrollRef`'s element — rows are placed
// from its top.
//
// `keep` is an index that must stay drawn even when scrolled out of view: the
// row being dragged, which dnd-kit loses track of if it disappears mid-drag.
export const LONG_LIST_FROM = 300;

export default function LongList({ count, ...rest }) {
  if (count < LONG_LIST_FROM) {
    return Array.from({ length: count }, (_, i) => rest.renderRow(i));
  }
  return <Windowed count={count} {...rest} />;
}

function Windowed({ count, scrollRef, estimate, keyOf, renderRow, keep = -1 }) {
  // Off until the first render is on screen. When the list and its scrolling
  // box appear together (opening a set) the box's ref is not attached yet when
  // the virtualizer first looks, and it found nothing to fill. And once it does
  // find the box it scrolls it to where it thinks it is — which, left to
  // itself, is the top, undoing the Library putting you back where you were
  // when you return from the editor. Starting it later, from wherever the box
  // already is, gets both right.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const v = useVirtualizer({
    count,
    enabled: ready,
    initialOffset: () => scrollRef.current?.scrollTop ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimate,
    getItemKey: keyOf,
    overscan: 12,
    rangeExtractor: (range) => {
      const out = defaultRangeExtractor(range);
      if (keep < 0 || keep >= count || out.includes(keep)) return out;
      return [...out, keep].sort((a, b) => a - b);
    },
  });
  // Switched off, it measures nothing and says the list is 0px tall — and a box
  // with nothing in it cannot be scrolled back to where you were. So until it
  // is on, the height is the rows' estimates added up.
  let height = 0;
  if (ready) height = v.getTotalSize();
  else for (let i = 0; i < count; i++) height += estimate(i);
  return (
    <div style={{ height, position: 'relative' }}>
      {v.getVirtualItems().map(item => (
        <div
          key={item.key}
          data-index={item.index}
          ref={v.measureElement}
          // Each row sits in its own layer, so a dragged row lifts above the
          // others only if its layer does.
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)`, zIndex: item.index === keep ? 20 : undefined }}
        >
          {renderRow(item.index)}
        </div>
      ))}
    </div>
  );
}
