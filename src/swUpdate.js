import { useSyncExternalStore } from 'react';

// Registration + update detection for public/sw.js, plus a tiny dependency-free
// store the UI subscribes to. The ONLY page reload lives here and fires ONLY
// after the user taps Update (userInitiatedReload) — a first install's
// clients.claim() also emits controllerchange, but the flag keeps it from
// reloading, so no reload ever happens without a tap.

let waitingWorker = null;
let userInitiatedReload = false;
let reloaded = false;

let state = { updateAvailable: false, dismissed: false };
const listeners = new Set();

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function markUpdateAvailable(worker) {
  waitingWorker = worker || waitingWorker;
  // A newly available update clears a prior dismiss so it shows again.
  set({ updateAvailable: true, dismissed: false });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot() { return state; }

// Hide the button for this session (returns on next launch).
export function dismissUpdate() {
  if (!state.dismissed) set({ dismissed: true });
}

// Called by the Update button: tell the waiting worker to activate. The
// controllerchange listener below then reloads exactly once.
export function applyUpdate() {
  if (!waitingWorker) return;
  userInitiatedReload = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function registerSw() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userInitiatedReload || reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  // Register after load so it never competes with first paint / hydration.
  window.addEventListener('load', () => {
    // updateViaCache: 'none' forces a fresh sw.js fetch every check, so a bumped
    // CACHE value reliably registers as an update.
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // An update installed in a previous session, already parked in waiting.
        if (reg.waiting && navigator.serviceWorker.controller) markUpdateAvailable(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // 'installed' WITH an existing controller means this is an update,
            // not a first install (first install has no controller yet).
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              markUpdateAvailable(reg.waiting || installing);
            }
          });
        });
      })
      .catch(() => { /* SW unsupported or blocked — the app still runs online */ });
  });
}

// React binding for the store. Returns { updateAvailable, dismissed }.
export function useSwUpdate() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
