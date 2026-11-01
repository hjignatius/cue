// Songs kept as PDF pages in Cue's PDF exports (src/utils/pdfSlots.js): react-pdf
// leaves a page of the slot's size, exactly, and fillSlots swaps each slot for
// the song's own pages, in order, keeping Cue's pages as they were. A PDF that
// won't open isn't used.
//
// Run: node scripts/pdfSlotsCheck.mjs
import { createElement as h } from 'react';
import { pdf, Document, Page, Text } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { slotSize, slotOf, openForSlot, fillSlots, SLOT_WIDTH } from '../src/utils/pdfSlots.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};
const sizes = (doc) => doc.getPages().map(p => p.getSize()).map(({ width, height }) => [Math.round(width), Math.round(height)]);

// A song's PDF: its pages at the size it was printed, each a different height
// here so the order can be checked.
async function songPdf(...heights) {
  const doc = await PDFDocument.create();
  for (const height of heights) doc.addPage([612, height]);
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

// ---- 1. a slot is a size nothing else in an export is ------------------------------
const rendered = await pdf(h(Document, null,
  h(Page, { size: 'A4' }, h(Text, null, 'A song of Cue’s own')),
  h(Page, { size: slotSize(0) }),
  h(Page, { size: 'A4' }, h(Text, null, 'Another')),
  h(Page, { size: slotSize(1) }),
  h(Page, { size: 'A4' }, h(Text, null, 'Chord Reference')),
)).toBuffer();
const chunks = [];
for await (const c of rendered) chunks.push(c);
const bytes = Buffer.concat(chunks);
const before = await PDFDocument.load(bytes);
check('react-pdf draws a slot at exactly its size', sizes(before).filter(([w]) => w === SLOT_WIDTH), [[11, 11], [11, 12]]);
check('each page says which slot it is, or none', before.getPages().map(slotOf), [-1, 0, -1, 1, -1]);
check('slot 40 is still slot 40', slotOf({ getSize: () => slotSize(40) }), 40);

// ---- 2. filling the slots ------------------------------------------------------------
const docs = [await openForSlot(await songPdf(790, 791)), await openForSlot(await songPdf(792))];
const after = await PDFDocument.load(await fillSlots(bytes, docs));
check('each slot becomes its song’s pages, in order, between Cue’s own', sizes(after),
  [[595, 842], [612, 790], [612, 791], [595, 842], [612, 792], [595, 842]]);
check('no slot is left', after.getPages().some(p => slotOf(p) >= 0), false);

// ---- 3. a PDF that won't open --------------------------------------------------------
console.warn = () => {};   // openForSlot says why; not wanted in the test output
check('no PDF on this device', await openForSlot(null), null);
check('a file that isn’t a PDF', await openForSlot(new Blob(['not a pdf'])), null);
check('a PDF with no pages', await openForSlot(new Blob([await (await PDFDocument.create()).save({ addDefaultPage: false })])), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
