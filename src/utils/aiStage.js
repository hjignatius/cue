// One mapper from an AI tool's progress event to the three things a bar needs.
//
// WHY THIS IS SHARED: the first version of it lived inside EditorView as a
// private helper, and the moment a second view wanted a progress bar the choice
// was to copy it or to move it. Copying arithmetic that must agree with a
// renderer is how Present ended up measuring its columns wrong for months, so
// this moved out the first time it was needed twice.
//
// THE WEIGHTS are a budget, not a guess at duration: 10% to get the request
// away, 55% across the searches, 28% across the items being written, and the
// last 7% is the parse and the dialog swap. What makes them honest is that they
// only advance on an event that really happened — a search that started, a
// search whose results came back, a key or an item that appeared in the reply.
//
// A search counts as HALF when it starts and whole when its results land. The
// wait between those two is the longest pause in a run, and a bar that sat still
// through it would look stuck at exactly the wrong moment.
//
// A tool may use fewer searches than its budget, or return fewer items than its
// cap, so the bar can jump. That is better than the reverse: a denominator sized
// to what actually came back cannot be known until it is too late to draw.

export function stageProgress(stage, {
  idleLabel  = 'Thinking…',
  writeLabel = 'Writing the answer…',
  unit       = 'field',
  units      = null,
} = {}) {
  if (!stage) return { percent: 6, label: idleLabel, detail: '' };

  if (stage.phase === 'search') {
    const { started = 0, done = 0, budget = 2, query = '' } = stage;
    const credit = Math.min(budget, done + (started - done) * 0.5);
    return {
      percent: 10 + 55 * (budget ? credit / budget : 0),
      label: done >= 1 ? `Searching the web — ${done} of ${budget}…` : 'Searching the web…',
      // The query, not a percentage, is what tells you it found YOUR song —
      // which is the question actually being asked during the wait.
      detail: query ? `“${query}”` : '',
    };
  }

  const { wrote = 0, of = 1, searches = true } = stage;
  const plural = units || `${unit}s`;
  // Writing takes the search band as well when this run never searched —
  // otherwise the 10-65% stretch is reserved for something that will not
  // happen, and the bar leaps from nearly empty to nearly full with nothing in
  // between. Set-order and Set-time never search; Fill in song details searches
  // only for the fields that need it.
  const base = searches ? 70 : 10;
  const span = searches ? 28 : 88;
  return {
    percent: base + span * (of ? wrote / of : 0),
    label: writeLabel,
    detail: `${wrote} of ${of} ${of === 1 ? unit : plural}`,
  };
}

// Monotonic clamp. Search events and write events come off different counters,
// and a bar that goes backwards reads as a fault in the thing it is measuring.
// Carried ON the stage rather than derived at render, so the previous value is
// always to hand.
export function advanceStage(prev, next, opts) {
  if (prev && prev.phase === next.phase
      && prev.wrote === next.wrote && prev.done === next.done && prev.started === next.started) {
    return prev;   // same object → React skips the re-render (these fire per token)
  }
  return { ...next, pct: Math.max(prev?.pct ?? 0, stageProgress(next, opts).percent) };
}
