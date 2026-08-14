import { Font } from '@react-pdf/renderer';

// @react-pdf's built-in Courier/Helvetica are the PDF "standard 14" fonts, whose
// WinAnsi encoding can't represent the symbols the app offers (↑↓←→ ✓ ✗ ★ ♪ …)
// or smart quotes — those characters render as the wrong glyph. Embedding DejaVu
// (Sans for headers, Sans Mono for lyrics/chords) fixes that. DejaVu Sans Mono's
// advance is 0.602em, matching the Courier layout math, so chord/lyric alignment
// is preserved. The .ttf files are emitted as separate assets (Vite `?url`) and
// fetched only when a PDF is first exported, so they never bloat the app bundle.
import monoRegular    from '../assets/fonts/DejaVuSansMono.ttf?url';
import monoBold       from '../assets/fonts/DejaVuSansMono-Bold.ttf?url';
import monoOblique    from '../assets/fonts/DejaVuSansMono-Oblique.ttf?url';
import monoBoldObl    from '../assets/fonts/DejaVuSansMono-BoldOblique.ttf?url';
import sansRegular    from '../assets/fonts/DejaVuSans.ttf?url';
import sansBold       from '../assets/fonts/DejaVuSans-Bold.ttf?url';

export const FONT_SANS = 'DejaVu Sans';
export const FONT_MONO = 'DejaVu Sans Mono';

let registered = false;

// Idempotent. `srcs` lets a Node test harness swap the Vite `?url` values for
// filesystem paths; the app calls it with no argument.
export function registerPdfFonts(srcs) {
  if (registered) return;
  registered = true;
  const s = srcs || { monoRegular, monoBold, monoOblique, monoBoldObl, sansRegular, sansBold };
  Font.register({
    family: FONT_MONO,
    fonts: [
      { src: s.monoRegular },
      { src: s.monoBold,    fontWeight: 'bold' },
      { src: s.monoOblique, fontStyle: 'italic' },
      { src: s.monoBoldObl, fontWeight: 'bold', fontStyle: 'italic' },
    ],
  });
  Font.register({
    family: FONT_SANS,
    fonts: [
      { src: s.sansRegular },
      { src: s.sansBold, fontWeight: 'bold' },
    ],
  });
}

// A couple of palette glyphs (⤴ ⤵ — rightwards-then-curving arrows) aren't in
// DejaVu; map them to the closest arrows it does have so they never render as a
// missing-glyph box. Everything else in the palette is covered directly.
const SUBS = { '⤴': '↱', '⤵': '↳' }; // ⤴→↱  ⤵→↳
const SUBS_RE = /[⤴⤵]/g;
export function sanitizeForPdf(str) {
  return typeof str === 'string' ? str.replace(SUBS_RE, (c) => SUBS[c]) : str;
}
