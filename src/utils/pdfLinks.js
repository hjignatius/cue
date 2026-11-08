// Links in a PDF song: web addresses, email, and jumps to another page of the
// same PDF. Workshop notes and club books carry them (a YouTube link per song,
// a contents page that jumps to each one). Cue draws a PDF page as a picture,
// so a link is a box laid over the spot, placed from the page's own link list.
//
// PDF songs only. A page turned into a chart leaves its links behind.

// Addresses a tap may open. Anything else a PDF can hold — javascript:, file:,
// a program to launch — is not a link Cue follows.
const SAFE = /^(https?:|mailto:|tel:)/i;

/** The address to open, or null when it isn't one Cue follows. */
export function safeHref(url) {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (SAFE.test(u)) return u;
  // A bare "www.…" in a PDF means the web.
  if (/^www\.[^\s]+\.[^\s]+/i.test(u)) return `https://${u}`;
  return null;
}

/**
 * A page's links as boxes over the drawn page, each in fractions of it (0..1),
 * so they fit the page at any size. `viewport` is the one the page was drawn
 * with, which turns them with the page. `pageOf(dest)` finds the page a jump
 * goes to (1-based), or null.
 */
export async function linkBoxes(annotations = [], viewport, pageOf = async () => null) {
  const out = [];
  for (const a of annotations) {
    if (a?.subtype !== 'Link' || !Array.isArray(a.rect)) continue;
    const href = safeHref(a.url || a.unsafeUrl);
    const page = href ? null : a.dest ? await pageOf(a.dest).catch(() => null) : null;
    if (!href && !page) continue;
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
    const left = Math.min(x1, x2) / viewport.width, top = Math.min(y1, y2) / viewport.height;
    const width = Math.abs(x2 - x1) / viewport.width, height = Math.abs(y2 - y1) / viewport.height;
    if (!(width > 0 && height > 0)) continue;
    out.push(href ? { href, left, top, width, height } : { page, left, top, width, height });
  }
  return out;
}

/** Where a jump in `doc` lands: its page number, from 1, or null. */
export function destPage(doc) {
  return async (dest) => {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    const target = Array.isArray(explicit) ? explicit[0] : null;
    if (target == null) return null;
    const index = typeof target === 'number' ? target : await doc.getPageIndex(target);
    return Number.isInteger(index) && index >= 0 && index < doc.numPages ? index + 1 : null;
  };
}

/** The links of page `page` of `doc`, drawn with `viewport`. Never throws. */
export async function pageLinks(doc, page, viewport) {
  try {
    return await linkBoxes(await page.getAnnotations({ intent: 'display' }), viewport, destPage(doc));
  } catch {
    return [];
  }
}

/** A short name for a link, for its label: the site, or the page. */
export function linkName(link) {
  if (link.page) return `Go to page ${link.page}`;
  if (/^mailto:/i.test(link.href)) return `Email ${link.href.slice(7).split('?')[0]}`;
  if (/^tel:/i.test(link.href)) return `Call ${link.href.slice(4)}`;
  try { return `Open ${new URL(link.href).hostname.replace(/^www\./, '')}`; } catch { return 'Open link'; }
}
