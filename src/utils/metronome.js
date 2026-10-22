// The two-bar count-in click, shared by Present's count-in button and the
// editor's ▶ tempo preview.
//
// THE BUG THIS FILE EXISTS FOR: both callers held their own copy of this
// function, and both copies built a NEW AudioContext per press and scheduled
// that count-in on it with nothing holding the previous one. Pressing three
// times quickly gave three click trains running over each other. Fixing one copy
// fixed only one button — which is exactly what happened, so the implementation
// now lives in one place and both import it.
//
// Two problems, one cause:
//   * nothing cancelled the previous count-in, so they stacked;
//   * a browser caps how many AudioContexts a page may create (Safari lowest),
//     so enough presses eventually silenced the click altogether.
//
// ONE context for the page's lifetime, and ONE count-in at a time — app-wide, so
// the editor's preview and Present's count-in cannot overlap each other either.

import { beatsPerBar } from './timeSig.js';

// Created lazily on the first press, which is a user gesture: a context
// constructed before one starts suspended under autoplay policy.
let ctx = null;
let nodes = [];
// Where the context's clock stood at the last press, against the wall clock —
// how a context that SAYS it is running but has gone deaf is caught.
let lastCheck = null;

// A context whose clock has advanced less than this fraction of the wall-clock
// time since the last press is not producing sound, whatever its state says.
const STUCK_CLOCK_RATIO = 0.5;
// Too short a gap to judge: the clock ticks in render quanta, not continuously.
const STUCK_CHECK_MIN_MS = 1000;

function newContext() {
  const AC = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
  return AC ? new AC() : null;
}

function retire(old) {
  try { old?.close?.()?.catch?.(() => {}); } catch { /* already closed */ }
}

// A context that will actually make sound, for THIS press.
//
// The one-context rule above had a hole: an iPad plugged into a TV, or
// unplugged from one, changes its audio route, and Safari parks the context in
// a state the old code never checked for — 'interrupted', not 'suspended'.
// Nothing resumed it, so the count-in stayed silent until Cue was closed,
// while the button went on flashing. Every press now checks:
//   * suspended            -> resume, as before
//   * interrupted / closed -> replace it. A context made inside a tap starts
//                             running, and resuming one mid-interruption can
//                             fail without saying so, then play late or never.
//   * running, but its clock has stalled since the last press -> replace it.
//     That is a context still bound to an output that has gone away, and its
//     state alone would never show it.
// Replacing costs one context per breakage, not per press, so the browser's
// cap on contexts (the reason there is only one) is not at risk.
function readyContext(now) {
  if (ctx) {
    const state = ctx.state;
    let replace = state === 'interrupted' || state === 'closed';
    if (!replace && state === 'running' && lastCheck) {
      const wallSec = (now - lastCheck.wall) / 1000;
      const clockSec = ctx.currentTime - lastCheck.clock;
      if (wallSec * 1000 >= STUCK_CHECK_MIN_MS && clockSec < wallSec * STUCK_CLOCK_RATIO) replace = true;
    }
    if (replace) { stopMetronome(); retire(ctx); ctx = null; }
  }
  if (!ctx) ctx = newContext();
  if (!ctx) return null;
  // Resuming is a no-op when it is already running.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  lastCheck = { wall: now, clock: ctx.currentTime };
  return ctx;
}

/** Silence a count-in that is still running or scheduled. */
export function stopMetronome() {
  for (const n of nodes) {
    try { n.stop(); } catch { /* already stopped, or never started */ }
    try { n.disconnect(); } catch { /* ignore */ }
  }
  nodes = [];
}

/**
 * Play a two-bar count-in at `bpm` in `timeSig`.
 *
 * Pressing again RESTARTS it rather than layering on it — matching the visual
 * count-in, which has always cleared its timers before re-scheduling.
 */
export function playMetronome(bpm, timeSig = '4/4') {
  const rate = Number(bpm);
  if (!rate || rate <= 0) return;

  if (!readyContext(globalThis.performance?.now?.() ?? Date.now())) return;

  stopMetronome();

  const perBar = beatsPerBar(timeSig);
  const total  = perBar * 2;
  const step   = 60 / rate;
  const t0     = ctx.currentTime;
  for (let i = 0; i < total; i++) {
    const accent = i % perBar === 0;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = accent ? 1000 : 700;
    gain.gain.setValueAtTime(accent ? 1 : 0.55, t0 + i * step);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * step + 0.05);
    osc.start(t0 + i * step);
    osc.stop(t0 + i * step + 0.05);
    nodes.push(osc, gain);
  }
}
