import { useMemo } from 'react';
import { qrPath, QUIET_ZONE } from '../utils/qr.js';

// Renders `value` as a QR code, drawn as an SVG so it stays crisp at any size.
//
// ALWAYS dark-on-white, in BOTH themes, with the full quiet zone. This is
// deliberate and must not be "fixed" to follow the dark theme: scanners look for
// dark modules on a light field, and an inverted or margin-less symbol reads as
// noise to many phone cameras — exactly the moment this is used, someone
// pointing a phone at a screen across a room.
export default function QrCode({ value, size = 176, title }) {
  const model = useMemo(() => qrPath(value), [value]);
  if (!model) return null;

  const box = model.count + QUIET_ZONE * 2;

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
      <g transform={`translate(${QUIET_ZONE},${QUIET_ZONE})`} fill="#000000">
        <path d={model.path} />
      </g>
    </svg>
  );
}
