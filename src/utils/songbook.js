// Splitting a songbook PDF into songs.
//
// Load as text takes ONE chart out of a PDF. A songbook is many charts in one
// file, so the new question is where each song starts and ends — everything
// else (rebuilding lines, putting back the blank lines a PDF never stored) is
// pdfText.js, unchanged.
//
// Surveyed on the first real book, "DUS modified.pdf" (36 pages, 2026-10-28):
//
//   * every title is set in larger type than anything else on its page — 16pt
//     against 12pt lyrics and a 10pt footer — and nothing else is;
//   * the line under the title is the writer ("by …", "By: …", "Written by:",
//     or bare names, "Traditional"), then a video link, then the chart;
//   * every page ends "Table of Contents   Updated: August 11, 2026", the date
//     varying page to page;
//   * the chord diagrams are pictures, so they are not in the text at all.
//
// So: a song starts at a line in title type, and runs until the next one —
// across page breaks, which is what makes a two-page song come out whole. Lines
// that repeat on most pages are the book's furniture and are dropped. NO AI is
// involved, and as with Load as text, every line that survives is the PDF's own
// line, character for character.

import { textFromLines } from './pdfText.js';

// Title type has to stand clearly above the lyric type. 16pt over 12pt is 1.33;
// 1.2 leaves room for a book that is less emphatic without catching the odd
// line set a point larger for a heading.
const TITLE_RATIO = 1.2;

// A line is furniture when it turns up on at least this share of the pages…
const FURNITURE_SHARE = 0.5;
// …nearly always at the top or bottom edge of the page…
const FURNITURE_EDGE_SHARE = 0.8;
// …and the book has enough pages for "most of them" to mean anything.
const FURNITURE_MIN_PAGES = 4;
// Share alone is not enough. A "CHORUS" label or an "INTRO: [C] ////" line can
// be in most songs of a book, and they are the song; the footer is also at the
// foot of every page and has no chords in it. All three conditions, or it stays.

// The writer's line: "by X", "By: X", "Written by: X", "Words and music by X".
const BY_PREFIX = /^(?:(?:written|words|music|lyrics)(?:\s+(?:and|&)\s+\w+)*\s+)?by\s*:?\s*/i;
const URL_RE = /(?:https?:\/\/|www\.)[^\s"'<>]+/gi;
// Any YouTube host, including regional ones (au.youtube.com) that Cue's own
// pattern does not accept; they are rewritten to www on the way out.
const YOUTUBE_URL = /^https?:\/\/(?:[a-z]+\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)/i;

// What a line has to look like to be the same furniture on every page: the
// letters only, so "Updated: August 9, 2026" and "Updated: August11, 2026" are
// one line.
function furnitureKey(text) {
  return text.toLowerCase().replace(/[^a-z]+/g, '');
}

// The line under a title is the writer unless it is plainly part of the chart:
// a strum pattern, a time signature, a section label, a playing note.
const NOT_A_WRITER = /\/\/|^\(|[¼½¾]|\b\d+\/\d+\b|^(?:intro|verse|chorus|bridge|outro|tag|strum|capo|key|tempo)\b/i;
function looksLikeWriter(text) {
  return /[a-z]{2,}/i.test(text) && !NOT_A_WRITER.test(text);
}

// A page number: "12", "- 12 -", "Page 12", "12 of 340". Digits, and only the
// few words page numbers use — so a strum line ("//// ////") or a stray "[" is
// never mistaken for one, as it would be by "no letters in it".
const PAGE_NUMBER = /^[\s\-–—]*(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?[\s\-–—]*$/i;

function youtubeOf(url) {
  if (!url || !YOUTUBE_URL.test(url)) return '';
  return url.replace(/^https?:\/\/(?:[a-z]+\.)?youtube\.com/i, 'https://www.youtube.com');
}

// The size of the lyric type: the height carried by the most lines.
function bodyHeight(pages) {
  const counts = new Map();
  for (const page of pages) {
    for (const l of page.lines) {
      const h = Math.round(l.height);
      if (h > 0) counts.set(h, (counts.get(h) || 0) + 1);
    }
  }
  let best = 0, bestN = -1;
  for (const [h, n] of counts) if (n > bestN) { best = h; bestN = n; }
  return best;
}

// The book's furniture, as furnitureKeys. A key counts once per page however
// often it appears there, so a chorus can never make itself furniture.
function furniture(pages) {
  const out = new Set();
  if (pages.length < FURNITURE_MIN_PAGES) return out;
  const seen = new Map();      // key -> { pages, edge }
  for (const page of pages) {
    const n = page.lines.length;
    const keys = new Map();    // key -> at an edge of this page?
    page.lines.forEach((l, i) => {
      if (l.text.includes('[')) return;
      const key = furnitureKey(l.text);
      keys.set(key, keys.get(key) || i === 0 || i === n - 1);
    });
    for (const [key, edge] of keys) {
      const c = seen.get(key) || { pages: 0, edge: 0 };
      c.pages++; if (edge) c.edge++;
      seen.set(key, c);
    }
  }
  for (const [key, c] of seen) {
    if (key && c.pages / pages.length >= FURNITURE_SHARE && c.edge / c.pages >= FURNITURE_EDGE_SHARE) out.add(key);
  }
  return out;
}

// Does a link on the page sit over this line? `links` carry the rectangle's
// vertical extent in the same page units as the line's y.
function linkOver(line, links = []) {
  return links.find(k => line.y >= k.bottom - 2 && line.y <= k.top + 2) || null;
}

/**
 * pages: [{ lines: [{ text, x, y, height, gapBefore }], links: [{ url, top, bottom }] }]
 * — the lines as pdfText's linesFromItems builds them, one entry per page.
 *
 * Returns [{ title, artist, youtubeUrl, text, firstPage, lastPage }], in book
 * order. A book with no title type at all comes back one song per page, titled
 * from its first line, rather than as one unreadable song.
 */
export function splitSongbook(pages = []) {
  const body = bodyHeight(pages);
  const isTitle = (l) => body > 0 && l.height >= body * TITLE_RATIO;
  const junk = furniture(pages);
  const anyTitle = pages.some(p => p.lines.some(isTitle));

  const songs = [];
  let cur = null;
  const start = (title, pageNo) => {
    cur = { title, artist: '', youtubeUrl: '', lines: [], firstPage: pageNo, lastPage: pageNo, afterTitle: 0 };
    songs.push(cur);
  };

  pages.forEach((page, i) => {
    const pageNo = i + 1;
    if (!anyTitle) start('', pageNo);
    for (const line of page.lines) {
      if (PAGE_NUMBER.test(line.text)) continue;
      if (!line.text.includes('[') && junk.has(furnitureKey(line.text))) continue;

      if (anyTitle && isTitle(line)) {
        // Two title-type lines in a row are one title that wrapped.
        if (cur && cur.lastPage === pageNo && cur.afterTitle === 0 && !cur.lines.length) {
          cur.title = `${cur.title} ${line.text}`.trim();
          continue;
        }
        start(line.text, pageNo);
        continue;
      }
      if (!cur) continue;              // a cover page, before the first song
      // A song carried over a page turn: the turn reads as a blank line, as it
      // does in Load as text. The PDF's own gap is measured from the top of the
      // new page and says nothing about the old one.
      const turned = cur.lines.length && pageNo !== cur.lastPage;
      cur.lastPage = pageNo;
      cur.afterTitle++;

      // The header: the line straight under the title is the writer, and a link
      // anywhere in the first few lines goes to the video field.
      const link = linkOver(line, page.links);
      const inHeader = anyTitle && cur.afterTitle <= 3 && !cur.lines.length;
      if (inHeader) {
        const urls = line.text.match(URL_RE) || [];
        const rest = line.text.replace(URL_RE, '').trim();
        const video = youtubeOf(urls[0]) || youtubeOf(link?.url);
        if (video && !cur.youtubeUrl) cur.youtubeUrl = video;
        // Close under the title, with no chords in it: the writer. A song with
        // a picture between title and chart (Rudolph) has no such line, and
        // the gap says so.
        if (cur.afterTitle === 1 && looksLikeWriter(rest) && !line.text.includes('[') && line.gapBefore < body * 3) {
          cur.artist = rest.replace(BY_PREFIX, '').replace(/\s{2,}/g, ' ').trim();
          continue;
        }
        // A line that is nothing but a link (or a link's caption, like "The
        // Chipmunk Song" over a search URL) is not part of the chart.
        if ((urls.length && !rest) || (link && !line.text.includes('['))) continue;
      }
      // The first line's gap is to the header above it, which is gone; left in,
      // it would count toward the song's usual line spacing.
      cur.lines.push(turned ? { ...line, gapBefore: Infinity }
        : cur.lines.length ? line : { ...line, gapBefore: 0 });
    }
  });

  return songs.map(s => ({
    title: s.title || (s.lines[0]?.text ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim() || `Page ${s.firstPage}`,
    artist: s.artist,
    youtubeUrl: s.youtubeUrl,
    text: textFromLines(s.lines),
    firstPage: s.firstPage,
    lastPage: s.lastPage,
  })).filter(s => s.text.trim());
}
