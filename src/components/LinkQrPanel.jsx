import { useState } from 'react';
import { Copy, Check, QrCode as QrCodeIcon, FileDown, Loader2, Image as ImageIcon } from 'lucide-react';
import QrCode from './QrCode.jsx';
import { exportQrPdf } from '../utils/qrPdf.js';
import { qrPath, QUIET_ZONE } from '../utils/qr.js';

// A link, its Copy button, and the same link as a QR code — with Copy image and
// Save as PDF under the code. ONE component because three windows hand out a
// link this way (Share set, passing on a set shared with you, and Get Cue), and
// the first of them grew its copy-and-QR row before the other two existed.
//
// Clipboard writes can be refused (a browser that asks, an insecure address),
// so a failure says so and leaves the link selectable, rather than a tick that
// lies or a button that silently did nothing.

const QR_PX = 176;
// Big enough to scan off a phone held up to another screen, small enough to
// paste into a message without taking it over.
const IMAGE_PX = 512;

// The code as a PNG, drawn straight onto a canvas from the same module path the
// on-screen <svg> uses — no SVG-to-image round trip, which some browsers treat
// as tainting the canvas.
function qrPngBlob(value) {
  return new Promise((resolve, reject) => {
    const model = qrPath(value);
    if (!model) { reject(new Error('Nothing to draw')); return; }
    const box = model.count + QUIET_ZONE * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = IMAGE_PX;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, IMAGE_PX, IMAGE_PX);
    ctx.scale(IMAGE_PX / box, IMAGE_PX / box);
    ctx.translate(QUIET_ZONE, QUIET_ZONE);
    ctx.fillStyle = '#000000';
    ctx.fill(new Path2D(model.path));
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No image'))), 'image/png');
  });
}

export default function LinkQrPanel({
  url, dark,
  qrTitle,                 // aria label for the code
  qrCaption,               // the line under the code
  pdfTitle, pdfSubtitle, pdfFoot,
  qrOpen: qrOpenInitial = false,
}) {
  const [copied, setCopied]       = useState(false);
  const [copyFailed, setCopyFail] = useState(false);
  const [showQr, setShowQr]       = useState(qrOpenInitial);
  const [imageState, setImage]    = useState('idle'); // idle | copied | failed
  const [savingPdf, setSavingPdf] = useState(false);
  const [pdfErr, setPdfErr]       = useState('');

  function copyUrl() {
    if (!url) return;
    const done = () => { setCopyFail(false); setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (!navigator.clipboard?.writeText) { setCopyFail(true); return; }
    navigator.clipboard.writeText(url).then(done, () => setCopyFail(true));
  }

  // The promise goes INTO the ClipboardItem rather than being awaited first:
  // Safari only allows the write while the tap is still being handled, and
  // drawing the image would otherwise use that moment up.
  function copyImage() {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
      navigator.clipboard.write([new ClipboardItem({ 'image/png': qrPngBlob(url) })])
        .then(() => { setImage('copied'); setTimeout(() => setImage('idle'), 2000); },
              () => setImage('failed'));
    } catch {
      setImage('failed');
    }
  }

  async function savePdf() {
    if (!url || savingPdf) return;
    setSavingPdf(true);
    setPdfErr('');
    try {
      await exportQrPdf(pdfTitle, url, { subtitle: pdfSubtitle, foot: pdfFoot });
    } catch (err) {
      console.error('[LinkQrPanel] QR PDF export failed', err);
      setPdfErr('Could not save the QR code as a PDF.');
    } finally {
      setSavingPdf(false);
    }
  }

  const sub = `text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`;
  const chip = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
    dark ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  }`;
  const okChip = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
    dark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600'
  }`;

  return (
    <div className="flex flex-col gap-4">
      {/* The link */}
      <div className="flex flex-col gap-1.5">
        <div className={`flex items-center gap-2 rounded-xl border p-2 ${dark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
          {copyFailed ? (
            <input
              readOnly
              value={url}
              onFocus={e => e.target.select()}
              aria-label="Link"
              className={`flex-1 min-w-0 text-xs font-mono px-1 bg-transparent outline-none ${dark ? 'text-gray-300' : 'text-gray-700'}`}
            />
          ) : (
            <span className={`flex-1 text-xs font-mono truncate px-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{url}</span>
          )}
          <button
            onClick={copyUrl}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              copied
                ? (dark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600')
                : (dark ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300')
            }`}
          >
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
        </div>
        {copyFailed && (
          <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400">Couldn't reach the clipboard — tap the link to select it and copy it by hand.</p>
        )}
      </div>

      {/* QR code — for handing the link to someone in the room: they point a
          phone at the screen instead of typing it. */}
      <div className="flex flex-col items-center gap-3">
        <button onClick={() => setShowQr(v => !v)} aria-expanded={showQr} className={chip}>
          <QrCodeIcon size={13} /> {showQr ? 'Hide QR code' : 'Show QR code'}
        </button>
        {showQr && (
          <>
            {/* White plate in both themes — the code needs its light field. */}
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <QrCode value={url} size={QR_PX} title={qrTitle} />
            </div>
            {qrCaption && <p className={`${sub} text-center`}>{qrCaption}</p>}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {imageState === 'copied'
                ? <span className={okChip}><Check size={13} /> Image copied</span>
                : <button onClick={copyImage} className={chip}><ImageIcon size={13} /> Copy image</button>}
              <button onClick={savePdf} disabled={savingPdf} className={chip}>
                {savingPdf
                  ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  : <><FileDown size={13} /> Save as PDF</>}
              </button>
            </div>
            {imageState === 'failed' && (
              <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400 text-center">This browser won't copy images. Save as PDF instead, or take a screenshot.</p>
            )}
            {pdfErr && <p className="text-xs text-red-500">{pdfErr}</p>}
          </>
        )}
      </div>
    </div>
  );
}
