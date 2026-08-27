// Post-build: inject the hashed pdfjs chunk + worker filenames into dist/sw.js.
//
// The service worker is a hand-written file copied verbatim into dist, so it
// can't know Vite's content-hashed asset names. This resolves them from the
// actual build output and rewrites the `const PDF_PRECACHE = [];` placeholder,
// so those assets are precached at SW install and a PDF renders fully offline.
// (Not a CDN, not a static guess — the real dist filenames.)

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const assetsDir = join(dist, 'assets');
const swPath = join(dist, 'sw.js');

if (!existsSync(swPath)) {
  console.error('[inject-sw-precache] dist/sw.js not found — did vite build run?');
  process.exit(1);
}
if (!existsSync(assetsDir)) {
  console.error('[inject-sw-precache] dist/assets not found');
  process.exit(1);
}

// The pdfjs library chunk (pdf-<hash>.js) and its worker (pdf.worker.min-<hash>.mjs).
const files = readdirSync(assetsDir);
const pdfAssets = files.filter(f =>
  /^pdf-[^/]+\.js$/.test(f) || /^pdf\.worker\.min-[^/]+\.mjs$/.test(f)
);

if (pdfAssets.length === 0) {
  console.warn('[inject-sw-precache] no pdfjs assets found — leaving PDF_PRECACHE empty');
}

const urls = pdfAssets.map(f => `/assets/${f}`);
const literal = `const PDF_PRECACHE = ${JSON.stringify(urls)};`;

let sw = readFileSync(swPath, 'utf8');
if (!/const PDF_PRECACHE = \[\];/.test(sw)) {
  console.error('[inject-sw-precache] placeholder "const PDF_PRECACHE = [];" not found in dist/sw.js');
  process.exit(1);
}
sw = sw.replace(/const PDF_PRECACHE = \[\];/, literal);
writeFileSync(swPath, sw);

console.log(`[inject-sw-precache] injected ${urls.length} pdfjs asset(s) into dist/sw.js:`);
for (const u of urls) console.log('  ' + u);
