// Share links and the app link: building them, and reading them back from a
// paste or a camera.
//
// The scanner is the strict one. A camera reads whatever QR code it is pointed
// at — a menu, a Wi-Fi code, the "Get Cue" code itself — and only a real share
// link may open a set.
//
// Run: node scripts/shareLinkCheck.mjs

import { shareUrl, appUrl, tokenFromShareInput, readScannedCode } from '../src/utils/shareLink.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

const ORIGIN = 'https://cue.example.app';
const TOKEN = '3f2a9c0d1e4b5a6978c0d1e2f3a4b5c6';

// ---- 1. building ------------------------------------------------------------
check('a share link', shareUrl(TOKEN, ORIGIN), `${ORIGIN}/shared/${TOKEN}`);
check('the app link has no set in it', appUrl(ORIGIN), `${ORIGIN}/`);

// ---- 2. pasting: lenient, as it always was ----------------------------------
check('paste: a full link', tokenFromShareInput(`${ORIGIN}/shared/${TOKEN}`), TOKEN);
check('paste: a bare code', tokenFromShareInput(TOKEN), TOKEN);
check('paste: surrounding spaces', tokenFromShareInput(`  ${TOKEN}  `), TOKEN);
check('paste: a trailing slash', tokenFromShareInput(`${ORIGIN}/shared/${TOKEN}/`), TOKEN);
check('paste: a query string', tokenFromShareInput(`${ORIGIN}/shared/${TOKEN}?utm=x`), TOKEN);
check('paste: a fragment', tokenFromShareInput(`${ORIGIN}/shared/${TOKEN}#top`), TOKEN);
check('paste: nothing', tokenFromShareInput('   '), '');
check('paste: null', tokenFromShareInput(null), '');

// ---- 3. scanning: a share link from anywhere ---------------------------------
check('scan: a share link', readScannedCode(`${ORIGIN}/shared/${TOKEN}`), { kind: 'share', token: TOKEN });
check('scan: from another deployment', readScannedCode(`https://other.vercel.app/shared/${TOKEN}`), { kind: 'share', token: TOKEN });
check('scan: localhost over http', readScannedCode(`http://localhost:5173/shared/${TOKEN}`), { kind: 'share', token: TOKEN });
check('scan: a trailing slash', readScannedCode(`${ORIGIN}/shared/${TOKEN}/`), { kind: 'share', token: TOKEN });
check('scan: a query string', readScannedCode(`${ORIGIN}/shared/${TOKEN}?from=qr`), { kind: 'share', token: TOKEN });
check('scan: a bare code', readScannedCode(TOKEN), { kind: 'share', token: TOKEN });
check('scan: a bare code in capitals', readScannedCode(TOKEN.toUpperCase()), { kind: 'share', token: TOKEN.toUpperCase() });
check('scan: whitespace round it', readScannedCode(`\n${ORIGIN}/shared/${TOKEN} `), { kind: 'share', token: TOKEN });

// ---- 4. scanning: the Get Cue code ------------------------------------------
check('scan: the app link', readScannedCode(`${ORIGIN}/`), { kind: 'app' });
check('scan: the app link without its slash', readScannedCode(ORIGIN), { kind: 'app' });

// ---- 5. scanning: everything else is refused --------------------------------
for (const [label, text] of [
  ['a website page', 'https://restaurant.example/menu.html'],
  ['a shared path with nothing after it', `${ORIGIN}/shared/`],
  ['a shared path with too much after it', `${ORIGIN}/shared/${TOKEN}/extra`],
  ['a word', 'hello'],
  ['a short hex string', 'abc123'],
  ['a Wi-Fi code', 'WIFI:T:WPA;S:Venue;P:secret;;'],
  ['a mailto link', 'mailto:someone@example.com'],
  ['a phone number', 'tel:+15551234567'],
  ['an empty code', ''],
  ['nothing', null],
]) check(`scan: refuses ${label}`, readScannedCode(text), { kind: 'other' });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
