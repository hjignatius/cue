import { pdf } from '@react-pdf/renderer';
import { QrDocument } from './QrDocument.jsx';
import { saveFilePicker } from './filePicker.js';
import { sanitizeForPdf } from './pdfFonts.js';

// Kept in its own module rather than added to pdfExport.js: that file drags in
// the whole chart-rendering chain (chordPro, transpose, chord libraries), and
// the share dialog has no use for any of it.

function sanitize(name) {
  return (name || 'shared-set').replace(/[/\\:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 100) || 'shared-set';
}

// Save a link as a one-page printable QR sheet — a set's share link, or the
// link to Cue itself. `subtitle` and `foot` replace the set wording for the
// latter. Returns saveFilePicker's { ok, method } — method 'cancelled' when the
// user dismissed the save dialog, which is not an error.
export async function exportQrPdf(setName, url, { subtitle, foot } = {}) {
  const blob = await pdf(QrDocument({ title: sanitizeForPdf(setName), url, subtitle, foot })).toBlob();
  return saveFilePicker(blob, `${sanitize(setName)}_QR.pdf`);
}
