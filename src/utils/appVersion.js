// Which Cue wrote a file. Every .json Cue exports carries `appVersion`, so a
// Cue older than the file can tell, and ask for the update rather than quietly
// dropping what it doesn't know about (books, a turned PDF). Files from before
// 2.0 carry none, and are taken as they always were.
export const APP_VERSION = import.meta.env?.VITE_APP_VERSION || '';

// True only when `theirs` is a later version than `mine`. Anything missing or
// unreadable is not newer: an unstamped file is an old one.
export function isNewerVersion(theirs, mine) {
  const parse = (v) => (typeof v === 'string' && /^\d+(\.\d+)*$/.test(v.trim())) ? v.trim().split('.').map(Number) : null;
  const a = parse(theirs), b = parse(mine);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}
