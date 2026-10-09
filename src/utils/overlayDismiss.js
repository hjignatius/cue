// Closing a dialog by clicking the backdrop, without closing it when you click
// INSIDE.
//
// THE BUG THIS EXISTS FOR: with a mouse on an iPad, clicking the text box in Ask
// about music shut the dialog instantly. A finger was fine. The panel already
// stopped propagation, which is the usual guard and is not enough — it assumes
// the only way the backdrop's handler can run is a click that bubbled up from a
// child, and that is an assumption about the browser rather than a fact.
//
// Two conditions instead, both about the backdrop itself:
//
//   * the press started ON the backdrop, not inside the panel, and
//   * the release was also on the backdrop.
//
// The first is what stops a click inside closing it however the event reaches
// here. The second also fixes a case nobody had reported yet: select text in a
// field, drag past the edge of the panel, let go — the click resolves to the
// common ancestor, which is the backdrop, and the dialog vanished taking your
// half-typed question with it.
//
// A module-level flag rather than a ref, so this can be called inline in
// conditional JSX — a hook there would break the rules of hooks. Only one element
// can receive a pointerdown at a time, so one flag is enough.
let pressedBackdrop = false;

// `enabled` turns the behaviour off without the caller having to restructure
// its JSX. Pass false while something is running that a stray tap must not
// abandon — an AI request in flight, say, where dismissing cancels the call and
// the work is gone with it. The dialog's own Cancel and X still close it; this
// only removes the one route that nobody chose deliberately.
export function dismissOnOutside(onDismiss, enabled = true) {
  // Still clear the flag while disabled. Otherwise: press and hold the backdrop
  // during a run, the run finishes and re-enables dismissal, you let go — and
  // the click lands with `pressedBackdrop` left true by some earlier overlay,
  // dismissing the thing you were waiting for.
  if (!enabled) return { onPointerDown: () => { pressedBackdrop = false; } };
  return {
    onPointerDown: (e) => { pressedBackdrop = e.target === e.currentTarget; },
    onClick: (e) => {
      if (pressedBackdrop && e.target === e.currentTarget) onDismiss?.();
    },
  };
}
