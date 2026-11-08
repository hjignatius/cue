// Links in PDF songs (pdfLinks.js, pdfCut.js).
//
// Which addresses a tap may open, where each link's box lands on the drawn page
// (turned pages included), where a jump to another page goes, and that a song
// cut from a book keeps its web links and drops its links into the rest of the
// book — which pointed nowhere, and dragged the pages they pointed at along
// into the song's file.
//
// Run: node scripts/pdfLinksCheck.mjs

import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { safeHref, linkBoxes, destPage, linkName } from '../src/utils/pdfLinks.js';
import { openBook } from '../src/utils/pdfCut.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}
const round = (boxes) => boxes.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v])));

// ---- 1. what a tap may open --------------------------------------------------
check('a web address', safeHref('https://www.youtube.com/watch?v=x'), 'https://www.youtube.com/watch?v=x');
check('plain http', safeHref('http://ozbcoz.com/'), 'http://ozbcoz.com/');
check('email', safeHref('mailto:club@example.com'), 'mailto:club@example.com');
check('a phone number', safeHref('tel:+15551234'), 'tel:+15551234');
check('a bare www address means the web', safeHref('www.moselele.co.uk'), 'https://www.moselele.co.uk');
for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'launch.exe', '', null, 42]) check(`not followed: ${JSON.stringify(bad)}`, safeHref(bad), null);

// ---- 2. where the box lands ---------------------------------------------------
// A page 200 wide and 400 tall, drawn at that size; PDF y runs up from the foot.
const flat = { width: 200, height: 400, convertToViewportRectangle: ([x1, y1, x2, y2]) => [x1, 400 - y1, x2, 400 - y2] };
const web = { subtype: 'Link', url: 'https://youtu.be/abc', rect: [20, 360, 120, 380] };
check('a web link, in fractions of the page', round(await linkBoxes([web], flat)), [{ href: 'https://youtu.be/abc', left: 0.1, top: 0.05, width: 0.5, height: 0.05 }]);
// The same page turned a quarter: 400 wide, 200 tall.
const turned = { width: 400, height: 200, convertToViewportRectangle: ([x1, y1, x2, y2]) => [y1, x1, y2, x2] };
check('…and on a turned page, turned with it', round(await linkBoxes([web], turned)), [{ href: 'https://youtu.be/abc', left: 0.9, top: 0.1, width: 0.05, height: 0.5 }]);
const jump = { subtype: 'Link', dest: 'toc', rect: [0, 0, 200, 40] };
check('a jump to another page', round(await linkBoxes([jump], flat, async () => 3)), [{ page: 3, left: 0, top: 0.9, width: 1, height: 0.1 }]);
check('a jump that goes nowhere is left off', await linkBoxes([jump], flat, async () => null), []);
check('…as is one whose lookup fails', await linkBoxes([jump], flat, async () => { throw new Error('x'); }), []);
check('an unsafe address is left off', await linkBoxes([{ subtype: 'Link', unsafeUrl: 'javascript:x', rect: [0, 0, 10, 10] }], flat), []);
check('so is a box with no size', await linkBoxes([{ ...web, rect: [20, 360, 20, 380] }], flat), []);
check('and anything not a link', await linkBoxes([{ subtype: 'Text', url: 'https://x.com', rect: [0, 0, 10, 10] }], flat), []);

// ---- 3. where a jump goes -----------------------------------------------------
const fakeDoc = {
  numPages: 5,
  getDestination: async (name) => (name === 'toc' ? [{ num: 7 }, { name: 'XYZ' }] : null),
  getPageIndex: async (ref) => (ref.num === 7 ? 1 : 9),
};
check('a named jump', await destPage(fakeDoc)('toc'), 2);
check('an explicit jump', await destPage(fakeDoc)([{ num: 7 }, { name: 'Fit' }]), 2);
check('a jump by page index', await destPage(fakeDoc)([3, { name: 'Fit' }]), 4);
check('a name the PDF doesn’t have', await destPage(fakeDoc)('nope'), null);
check('a page past the end', await destPage(fakeDoc)([{ num: 8 }]), null);

// ---- 4. the label --------------------------------------------------------------
check('a site', linkName({ href: 'https://www.youtube.com/watch?v=x' }), 'Open youtube.com');
check('a page', linkName({ page: 12 }), 'Go to page 12');
check('an email', linkName({ href: 'mailto:club@example.com?subject=Hi' }), 'Email club@example.com');

// ---- 5. cutting a book ---------------------------------------------------------
// Three pages; page 1 has a web link and a jump to page 3, which is heavy.
const book = await PDFDocument.create();
const pages = [book.addPage([200, 400]), book.addPage([200, 400]), book.addPage([200, 400])];
const font = await book.embedFont('Courier');
// Text that won't squeeze down, so the page is plainly heavy.
let seed = 7;
const noise = Array.from({ length: 30000 }, () => String.fromCharCode(33 + ((seed = (seed * 48271) % 2147483647) % 90))).join('');
pages[2].drawText(noise, { x: 0, y: 0, size: 4, font });
const ctx = book.context;
const webAnnot = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [20, 360, 120, 380], P: pages[0].ref, A: { S: 'URI', URI: PDFString.of('https://youtu.be/abc') } }));
const jumpAnnot = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 200, 40], Dest: [pages[2].ref, 'XYZ', null, null, null] }));
pages[0].node.set(PDFName.of('Annots'), ctx.obj([webAnnot, jumpAnnot]));
const bookBytes = await book.save();

async function linksIn(bytes) {
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    for (const a of await (await doc.getPage(p)).getAnnotations()) if (a.subtype === 'Link') out.push(a.url || 'jump');
  }
  return out;
}
check('the book has both links', await linksIn(bookBytes), ['https://youtu.be/abc', 'jump']);
const cutter = await openBook(bookBytes);
const song = await cutter.cut([1]);
check('a song cut from it keeps the web link and drops the jump', await linksIn(song), ['https://youtu.be/abc']);
// What the cut used to be: a plain copy of the page, its links and all.
const plain = await PDFDocument.create();
const src = await PDFDocument.load(bookBytes);
for (const pg of await plain.copyPages(src, [0])) plain.addPage(pg);
const before = await plain.save();
check('…and no longer carries the page the jump pointed at', [before.length > bookBytes.length / 2, song.length < before.length / 5], [true, true]);
check('a song of the page with no links has none', await linksIn(await cutter.cut([2])), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
