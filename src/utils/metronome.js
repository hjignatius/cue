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

  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  // The OS can suspend a context (a phone call, an audio-route change). Resuming
  // is a no-op when it is already running.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

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
