import { useRef, useCallback, useEffect } from 'react';

// One AbortController per named AI action, so closing a dialog can stop the
// request behind it.
//
// THE BUG THIS EXISTS FOR: closing an AI dialog set its result state to null,
// which is the only thing keeping the dialog on screen — but the request carried
// on, and when it landed it set that state again. The dialog POPPED BACK OPEN,
// minutes later, over whatever you had moved on to. Six dialogs behaved that
// way. Cancelling is the fix for both halves: the request stops costing time and
// money, and the state that would have reopened the dialog is never set.
//
// Keyed by action rather than one controller per view, because a view can have
// more than one in flight — the Library's duplicate scan does not go through the
// same busy guard as its setlist tools.
export function useAiAbort() {
  const controllers = useRef(new Map());

  // Begin `key`, cancelling any previous run of it. Returns the signal to pass
  // down to the AI call.
  const startAi = useCallback((key) => {
    controllers.current.get(key)?.abort();
    const c = new AbortController();
    controllers.current.set(key, c);
    return c.signal;
  }, []);

  const cancelAi = useCallback((key) => {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
  }, []);

  // Leaving the view is a cancel too — otherwise an editor closed mid-request
  // keeps a stream open and then sets state on a component that is gone.
  useEffect(() => {
    const map = controllers.current;
    return () => { for (const c of map.values()) c.abort(); map.clear(); };
  }, []);

  return { startAi, cancelAi };
}
