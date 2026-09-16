import qrcode from 'qrcode-generator';

// The QR module matrix, shared by the on-screen code (components/QrCode.jsx) and
// the printable one (utils/QrDocument.jsx) so the two can never disagree.
//
// Returns { count, path } where `path` is ONE SVG path of 1×1 squares in a
// `count`×`count` coordinate space — far fewer nodes than a rect per module, and
// the same `d` string works in a browser <svg> and in @react-pdf's <Svg>.
// Returns null if the value can't be encoded (only realistic cause: data too
// long for the largest version), so callers can fail soft instead of throwing.
//
// QUIET_ZONE is part of the spec, not decoration: scanners need that margin of
// light around the symbol to find it at all. Every renderer must apply it.
export const QUIET_ZONE = 4; // modules

export function qrPath(value) {
  if (!value) return null;
  try {
    // typeNumber 0 = smallest version the data fits in. 'M' recovers ~15%, the
    // usual choice for a screen or a printed sheet.
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) path += `M${c},${r}h1v1h-1z`;
      }
    }
    return { count, path };
  } catch (err) {
    console.error('[qr] could not encode', err);
    return null;
  }
}
