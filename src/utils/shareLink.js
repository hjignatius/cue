// Share links and the app link, in one place: built here, and read back here
// whether they arrive pasted, typed or scanned off someone else's screen.

// Tokens are minted as a UUID with its dashes removed (cloud.js), so a bare
// token is 32 hex characters. Only the scanner needs to know this — a typed or
// pasted value is taken on trust, as it always was, and the shared view says so
// if it leads nowhere.
const BARE_TOKEN = /^[0-9a-f]{32}$/i;

// The link Cue hands out for a set. Built against THIS origin, which is the
// right one for anyone you are sending it to, whatever address it arrived from.
export function shareUrl(token, origin = globalThis.location?.origin || '') {
  return `${origin}/shared/${token}`;
}

// The link to Cue itself, with no set attached — what "Get Cue" hands out.
export function appUrl(origin = globalThis.location?.origin || '') {
  return `${origin}/`;
}

// A pasted share link or bare code -> its token. The token is the last
// non-empty path segment, so this survives query strings, trailing slashes, and
// a link from any origin (someone else's deployment included).
export function tokenFromShareInput(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  const withoutQuery = v.split(/[?#]/)[0];
  const segs = withoutQuery.split('/').filter(Boolean);
  return segs.length ? segs[segs.length - 1] : '';
}

// What a scanned QR code turned out to be.
//   { kind: 'share', token }  a Cue share link (any origin) or a bare code
//   { kind: 'app' }           the link to Cue itself — the "Get Cue" code
//   { kind: 'other' }         anything else: a menu, a website, a Wi-Fi code
//
// Stricter than pasting, on purpose. A camera reads whatever code it is pointed
// at, and treating the last segment of ANY url as a token would open a "set"
// called "menu.html". So a scan must say /shared/ or be a bare code.
export function readScannedCode(text) {
  const v = (text || '').trim();
  if (!v) return { kind: 'other' };
  if (BARE_TOKEN.test(v)) return { kind: 'share', token: v };

  let url;
  try { url = new URL(v); } catch { return { kind: 'other' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'other' };

  const segs = url.pathname.split('/').filter(Boolean);
  const at = segs.indexOf('shared');
  if (at !== -1 && segs.length === at + 2 && segs[at + 1]) return { kind: 'share', token: segs[at + 1] };
  if (segs.length === 0) return { kind: 'app' };
  return { kind: 'other' };
}
