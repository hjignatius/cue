import { linkName } from '../utils/pdfLinks.js';

// The links on one drawn PDF page (pdfLinks.js), laid over it. Place it inside a
// `position: relative` box the exact size of the page's canvas.
//
// It sits above the page's own taps — a Full Page song's page-turn zones — so a
// tap on a link opens it, and a tap anywhere else does what it always did. The
// ink overlay sits above it: while you draw, the pen gets the page, links and
// all; the rest of the time the ink lets taps through.
//
// A faint tint shows where each link is, since a PDF doesn't always print its
// links blue. Web links open in Safari, beside Cue; a jump goes to that page of
// the same PDF through `onGoPage`.
export default function PdfLinkLayer({ links, onGoPage }) {
  if (!links?.length) return null;
  const box = (l) => ({
    left: `${l.left * 100}%`, top: `${l.top * 100}%`,
    width: `${l.width * 100}%`, height: `${l.height * 100}%`,
  });
  const look = 'absolute block rounded-sm bg-sky-400/10 hover:bg-sky-400/25 active:bg-sky-400/40 transition-colors';
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {links.map((l, i) => l.href ? (
        <a key={i} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={linkName(l)} title={l.href}
          onClick={e => e.stopPropagation()}
          className={`${look} pointer-events-auto`} style={box(l)} />
      ) : (
        <button key={i} type="button" aria-label={linkName(l)} title={linkName(l)}
          onClick={e => { e.stopPropagation(); onGoPage?.(l.page); }}
          className={`${look} pointer-events-auto`} style={box(l)} />
      ))}
    </div>
  );
}
