import { useEffect, useState } from 'react';

// How much of the layout viewport the on-screen keyboard is covering, in px.
//
// iOS does NOT shrink the layout viewport when the keyboard opens — it shrinks
// the VISUAL viewport and scrolls it. So `position: fixed; bottom: 24px` lands
// UNDER the keyboard: invisible, untappable, and with no way back short of
// dismissing a keyboard that a <textarea> gives you no button to dismiss.
// The gap between the two viewports is the keyboard's height, which is what a
// floating control has to lift itself by to stay reachable while typing.
//
// Returns 0 when there is no keyboard, no visualViewport API, or the gap is
// small enough to be rounding noise or a collapsing URL bar rather than a
// keyboard.
const NOISE_PX = 80;

export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      setInset(covered > NOISE_PX ? Math.round(covered) : 0);
    };
    update();
    // 'scroll' matters as much as 'resize': iOS shifts the visual viewport
    // when it scrolls the caret into view, which moves the gap without
    // changing its height.
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
