import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

// Renders `value` as a QR code, drawn as an SVG so it stays crisp at any size
// and prints cleanly.
//
// ALWAYS dark-on-white, in BOTH themes, with the full 4-module quiet zone the
// spec requires. This is deliberate and must not be "fixed" to follow the dark
// theme: scanners look for dark modules on a light field, and an inverted or
// margin-less symbol reads as noise to many phone cameras — exactly the moment
// this is used, someone pointing a phone at a screen across a room.
export default function QrCode({ value, size = 176, title }) {
  const model = useMemo(() => {
    if (!value) return null;
    try {
      // typeNumber 0 = smallest version the data fits in. 'M' recovers ~15%,
      // the usual choice for a screen or a printed sheet.
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      const count = qr.getModuleCount();
      // One path of 1×1 squares — far fewer DOM nodes than a <rect> per module.
      let d = '';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
        }
      }
      return { d, count };
    } catch (err) {
      // Only realistic cause is data too long for the largest version. Fail
      // soft — a share dialog must never go blank over its QR code.
      console.error('[QrCode] could not encode', err);
      return null;
    }
  }, [value]);

  if (!model) return null;

  const QUIET = 4;
  const box = model.count + QUIET * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title || `QR code for ${value}`}
    >
      <rect width={box} height={box} fill="#ffffff" />
      <g transform={`translate(${QUIET},${QUIET})`} fill="#000000">
        <path d={model.d} />
      </g>
    </svg>
  );
}
