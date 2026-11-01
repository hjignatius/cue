// Cue's app icon (Cue², from 2.0): the white C on indigo with a bold 2 centred
// inside it. Writes the three SVG sources into public/: the rounded one the
// browser tab uses, the full square the home-screen PNGs are made from, and the
// maskable one, drawn smaller so Android's round or squircle crop never cuts it.
//
// The 2 is DejaVu Sans Bold's outline (the font Cue already ships for PDFs),
// turned into a path here so the icon never depends on a font being present.
//
// Run: node scripts/makeIcons.mjs, then make the PNGs from the SVGs (the list is
// at the end of its output). On the Mac, Quick Look renders an SVG at an exact
// size, which is how the 2.0 PNGs were made:
//   qlmanage -t -s 180 -o <folder> public/cue-icon-square.svg
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';

const root = fileURLToPath(new URL('..', import.meta.url));
const font = fontkit.openSync(`${root}src/assets/fonts/DejaVuSans-Bold.ttf`);
const two = font.glyphForCodePoint(0x32);

const INDIGO = '#4f46e5';
const TWO_HEIGHT = 25;           // in the 100-unit icon, inside the C's 50-unit hollow
const { minX, minY, maxX, maxY } = two.bbox;
const s = TWO_HEIGHT / (maxY - minY);
const tx = 50 - ((minX + maxX) / 2) * s;
const ty = 50 + ((minY + maxY) / 2) * s;   // font units run upward; flip them
const round = (n) => Math.round(n * 1000) / 1000;

// The C: radius 30, open 50° either side of the right, round ends.
const art = (indent = '  ') => [
  `${indent}<path d="M69.284 27.019 A30 30 0 1 0 69.284 72.981" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>`,
  `${indent}<path transform="translate(${round(tx)} ${round(ty)}) scale(${s.toFixed(6)} -${s.toFixed(6)})" d="${two.path.toSVG()}" fill="#ffffff"/>`,
].join('\n');

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512" role="img" aria-label="Cue">\n${body}\n</svg>\n`;

const files = {
  'cue-icon.svg':          svg(`  <rect width="100" height="100" rx="23" fill="${INDIGO}"/>\n${art()}`),
  'cue-icon-square.svg':   svg(`  <rect width="100" height="100" fill="${INDIGO}"/>\n${art()}`),
  'cue-icon-maskable.svg': svg(`  <rect width="100" height="100" fill="${INDIGO}"/>\n  <g transform="translate(10 10) scale(0.8)">\n${art('    ')}\n  </g>`),
};
for (const [name, text] of Object.entries(files)) writeFileSync(`${root}public/${name}`, text);

console.log(`Wrote ${Object.keys(files).join(', ')} in public/.
PNGs to make from them:
  cue-icon-square.svg   -> cue-512.png (512), cue-192.png (192), apple-touch-icon.png (180)
  cue-icon-maskable.svg -> cue-maskable-512.png (512)
  cue-icon.svg          -> favicon-64.png (64)`);
