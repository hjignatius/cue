// Splitting a songbook PDF into songs.
//
// Load as text takes ONE chart out of a PDF. A songbook is many charts in one
// file, so the new question is where each song starts and ends — everything
// else (rebuilding lines, putting back the blank lines a PDF never stored) is
// pdfText.js, unchanged.
//
// There are two ways to find where a song starts, and the book decides which:
//
//  1. ITS BOOKMARKS. Every real songbook on hand has one per song — DUS (37),
//     Jim's Christmas (165), the Delmarvalous book (281), the USGB book (1,636),
//     Jim's Ukulele Songbook (4,705). A bookmark is the book's own statement of
//     "a song called this starts here", so when a book has them they win.
//
//  2. TITLE TYPE, for a book without them. Surveyed on "DUS modified.pdf" (36
//     pages, 2026-10-28): every title is set in larger type than anything else
//     on its page — 16pt against 12pt lyrics — and nothing else is.
//
//  3. THE "BY" LINE, for a book whose titles are no bigger than its lyrics.
//     Brighton's songbooks set every title in bold 12pt over 12pt lyrics, and
//     the only larger type is the chord diagrams' names — so title type found
//     "C#m" and "Dsus4". What every song there does have is its title at the
//     top of a page with "by George Harrison, 1969" under it, or "Mister
//     Sandman by Pat Ballard, 1954" as one line. Both 2 and 3 are tried, and
//     the one that finds more songs with chords and sensible titles is used.
//
// Title type alone is NOT enough for a big book, which is why bookmarks come
// first. Those books are gathered from many sources, so the type changes from
// song to song: in the Delmarvalous book "500 Miles" is 16pt title over 16pt
// lyrics, the next song 14pt lyrics. Measured against one size for the whole
// book, every lyric line of the larger songs read as title, and ran together
// into one title the length of the song (2026-10-28: 291 pages came out as 3
// songs). Sizes are now measured page by page, but a page whose title is no
// bigger than its lyrics still has nothing to find.
//
// Either way a song runs until the next one starts — across page breaks, which
// is what makes a two-page song come out whole. Lines that repeat on most pages
// are the book's furniture and are dropped. NO AI is involved, and as with Load
// as text, every line that survives is the PDF's own line, character for
// character.

import { textFromLines } from './pdfText.js';

// Title type has to stand clearly above the lyric type. 16pt over 12pt is 1.33;
// 1.2 leaves room for a book that is less emphatic without catching the odd
// line set a point larger for a heading.
const TITLE_RATIO = 1.2;
// …except a line shaped "Song – Artist", which is how a lot of books head a
// song and which a lyric line almost never is. Ukulele Wednesdays sets it 14pt
// over 12pt lyrics (1.17) and Moogly 16 over 14 (1.14): bigger, but not by 1.2.
const TITLE_ARTIST_RATIO = 1.1;
// Moogly's second half writes it with a bare hyphen, "Spirit In The Sky-Norman
// Greenbaum": a lower-case letter, a hyphen, a capital. "Brown-Eyed Girl" is
// that shape too, but at 1.1× the lyrics it is a title either way.
const TITLE_ARTIST_LINE = /\S\s*(?:\s[-–—]\s|—|–)\s*\S|\p{Ll}-\p{Lu}/u;
// A title that wraps runs to two lines, not more. Anything longer in title type
// is a song set large, not a title.
const TITLE_MAX_LINES = 2;

// A line is furniture when it turns up on at least this share of the pages…
const FURNITURE_SHARE = 0.5;
// …nearly always at the top or bottom edge of the page…
const FURNITURE_EDGE_SHARE = 0.8;
// …and the book has enough pages for "most of them" to mean anything.
const FURNITURE_MIN_PAGES = 4;
// Share alone is not enough. A "CHORUS" label or an "INTRO: [C] ////" line can
// be in most songs of a book, and they are the song; the footer is also at the
// foot of every page and has no chords in it. All three conditions, or it stays.

// Bookmarks are trusted when there are enough of them to be one a song. A book
// bookmarked only by chapter ("A", "B", "Christmas") would otherwise come out
// as a handful of enormous songs; every real book measured has one for at least
// 88% of its pages.
const MARKS_PER_PAGE = 0.25;

// The writer's line: "by X", "By: X", "Written by: X", "Words and music by X".
const BY_PREFIX = /^(?:(?:written|words|music|lyrics)(?:\s+(?:and|&)\s+\w+)*\s+)?by\s*:?\s*/i;
// Jim's books: "artist:Clyde McLennan writer:James Montgomery, Henry Smart".
// The artist is the one Cue wants; a song with none ("artist: writer:Peter
// Wood", or just "writer:Traditional") falls back to the writer. Jim often
// leaves a stray comma after a name.
const ARTIST_FIELD = /^(?=artist\s*:|writer\s*:)(?:artist\s*:(.*?))?(?:\bwriter\s*:(.*))?$/i;
// The trailing "-" or ":" is where a name ran into a link, "The Carpenters - https://…".
const fieldValue = (s) => (s || '').replace(/[\s,;:\-–—]+$/, '').replace(/\s{2,}/g, ' ').trim();
const URL_RE = /(?:https?:\/\/|www\.)[^\s"'<>]+/gi;
// Any YouTube host, including regional ones (au.youtube.com) that Cue's own
// pattern does not accept; they are rewritten to www on the way out.
const YOUTUBE_URL = /^https?:\/\/(?:[a-z]+\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)/i;
const CHORD = /\[[^\]\s][^\]]*\]/;

// What a line has to look like to be the same furniture on every page: the
// letters only, so "Updated: August 9, 2026" and "Updated: August11, 2026" are
// one line — and no month names, so Jim's "Date Created - Jul-22 ,2026" is the
// same line in August.
const MONTH = /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/;
const MONTH_WORD = new RegExp(`\\b${MONTH.source}\\b`, 'g');
function furnitureKey(text) {
  return text.toLowerCase().replace(/[^a-z]+/g, ' ').replace(MONTH_WORD, '').replace(/ +/g, '');
}
// What a title has to look like to be the same title: letters AND digits,
// since "9 to 5" and "500 Miles" are mostly digits.
function titleKey(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
// A bookmark list sorts "Christmas Song, The"; the page says "The Christmas Song".
function uninvert(title) {
  const m = /^(.*\S),\s*(the|a|an)$/i.exec(title.trim());
  return m ? `${m[2]} ${m[1]}` : title.trim();
}

// The line under a title is the writer unless it is plainly part of the chart:
// a strum pattern, a time signature, a section label, a playing note.
const NOT_A_WRITER = /\/\/|^\(|[¼½¾]|\b\d+\/\d+\b|^(?:intro|verse|chorus|bridge|outro|tag|strum|capo|key|tempo)\b/i;
// Nor is a line of nothing but chord names: Moselele lists "CHORDS USED IN
// THIS SONG" under each title, then "Am G C".
// "C7+5" is Brighton's: an augmented fifth after the seventh.
const CHORD_NAME = /^[A-G][#b♯♭]?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+)?\d{0,2}(?:(?:sus|add|maj|b|#|-|\+)\d{1,2})*(?:\/[A-G][#b♯♭]?)?\*?$/;
export function chordNamesOnly(text) {
  const words = String(text).trim().split(/[\s,]+/).filter(Boolean);
  return words.length > 0 && words.every(w => CHORD_NAME.test(w));
}
// A title has a word in it. Not a line of chord names — Brighton's chord
// diagrams print theirs larger than the lyrics — and not a single letter:
// TUSC runs a song's name down the margin in 48pt capitals, one to a line.
// "R.E.M.", "U2" and "L-O-V-E" are words.
export function titleWorthy(text) {
  return /\p{L}[\p{L}\p{N}.'’-]/u.test(text) && !chordNamesOnly(text);
}
function looksLikeWriter(text) {
  return /[a-z]{2,}/i.test(text) && !NOT_A_WRITER.test(text) && !chordNamesOnly(text);
}

// A page number: "12", "- 12 -", "Page 12", "12 of 340". Digits, and only the
// few words page numbers use — so a strum line ("//// ////") or a stray "[" is
// never mistaken for one, as it would be by "no letters in it".
const PAGE_NUMBER = /^[\s\-–—]*(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?[\s\-–—]*$/i;

// The "by" line under a title: "by Bob Dylan", "By Frankie Lymon", "Words &
// Music by Milt Gabler". A space and a letter after "by", so "Bye Bye Love" is
// not one.
const BY_LINE = /^(?:(?:written|words|music|lyrics)(?:\s+(?:and|&)\s+\w+)*\s+)?by\s*:?\s+\p{L}/iu;
// A title and its writer on one line: "Mister Sandman by Pat Ballard, 1954",
// "Sweet Georgia Brown Words by A. Ken Casey". A lower-case "by" and a capital
// after it, which a title like "Stand By Me" never has.
const TITLE_BY = /^(.*?\p{L}.*?)\s+(?:(?:[Ww]ritten|[Ww]ords|[Mm]usic|[Ll]yrics)(?:\s+(?:and|&)\s+\w+)*\s+)?by\s+(\p{Lu}.*)$/u;
// What comes before "by" is the second line of a title when it opens with a
// bracket or a small letter — "Everybody's Talkin’" over "(Theme from Midnight
// Cowboy) by Harry Nilsson", "Do Re Mi" over "from the Sound of Music (sung by
// Julie Andrews)". The line above is the title.
const SUBTITLE = /^[(\p{Ll}]/u;
// More credits under the first: "Recorded by Nat "King" Cole, 1964",
// "Released by The Foundations".
const CREDIT_LINE = /^(?:[\p{L}&]+\s+){1,3}by\s+\p{L}/iu;
// A song starts near the top of a page — within its first few lines — or after
// a gap this many lyric lines tall.
const BY_TOP_LINES = 3;
const BY_GAP = 2.5;

function youtubeOf(url) {
  if (!url || !YOUTUBE_URL.test(url)) return '';
  return url.replace(/^https?:\/\/(?:[a-z]+\.)?youtube\.com/i, 'https://www.youtube.com');
}

// The size of the lyric type on one page: the height carried by the most lines
// with chords in them, since those are lyrics whatever else is on the page. A
// page with no chords at all falls back to every line. On a tie the smaller
// size wins — a short last page ("Last" / "[C] End" / the footer) has one line
// of each, and the title must not be the one taken for the lyrics.
function bodyHeight(lines) {
  const chorded = lines.filter(l => l.text.includes('['));
  const counts = new Map();
  for (const l of chorded.length ? chorded : lines) {
    const h = Math.round(l.height);
    if (h > 0) counts.set(h, (counts.get(h) || 0) + 1);
  }
  let best = 0, bestN = -1;
  for (const [h, n] of counts) if (n > bestN || (n === bestN && h < best)) { best = h; bestN = n; }
  return best;
}

// The book's furniture, as furnitureKeys. A key counts once per page however
// often it appears there, so a chorus can never make itself furniture.
//
// "At the edge" means outside the chart: above the first line with a chord in
// it, or below the last. The first and last lines alone were too narrow — Jim's
// pages open with TWO lines of it, "Date Created" and then "Go To Contents" —
// and outside the chart is still where a CHORUS label never is.
function furniture(pages) {
  const out = new Set();
  if (pages.length < FURNITURE_MIN_PAGES) return out;
  const seen = new Map();      // key -> { pages, edge }
  for (const page of pages) {
    const n = page.lines.length;
    const chorded = page.lines.map((l, i) => (CHORD.test(l.text) ? i : -1)).filter(i => i >= 0);
    const first = chorded.length ? chorded[0] : n, last = chorded.length ? chorded.at(-1) : -1;
    const keys = new Map();    // key -> at an edge of this page?
    page.lines.forEach((l, i) => {
      if (l.text.includes('[')) return;
      const key = furnitureKey(l.text);
      keys.set(key, keys.get(key) || i === 0 || i === n - 1 || i < first || i > last);
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

// Where each bookmark's song actually begins. A bookmark gives a page and, if
// the book was careful, a height on it — but every DUS bookmark points at the
// top of the page whatever is there, and Jim's give no height at all. So the
// title is looked for on the page itself; when it is found the song starts at
// that line, which is also what lets two songs share a page. When it is not,
// the song starts where the bookmark says.
//
// Returns [{ title, page, at, line }] in book order: `at` is the y the song
// starts at (null: the top of the page), `line` the title line found, if any.
function placeMarks(pages, marks) {
  const placed = [];
  for (const m of marks || []) {
    const lines = pages[m.page - 1]?.lines;
    if (!lines || !m.title?.trim()) continue;
    const name = uninvert(m.title);
    const keys = [titleKey(name), titleKey(m.title)].filter(Boolean);
    let line = null;
    for (const l of lines) {
      const k = titleKey(l.text);
      if (k.length < 2) continue;
      // A line with a chord in it is a lyric — unless it is the bookmark word
      // for word: the USGB book names its key in the title, "Banks Of The Ohio [D]".
      const exact = keys.includes(k);
      if (CHORD.test(l.text) && !exact) continue;
      if (exact || (k.length >= 4 && keys.some(t => t.startsWith(k) || k.startsWith(t)))) {
        // Nearest the bookmark's own height, when it gave one.
        if (!line || (m.top != null && Math.abs(l.y - m.top) < Math.abs(line.y - m.top))) line = l;
      }
    }
    placed.push({
      // The title as the page prints it when the line is the whole title,
      // which keeps "The" where the page puts it and the book's own capitals.
      title: line && keys.includes(titleKey(line.text)) ? line.text.trim() : name,
      page: m.page,
      at: line ? line.y : (m.top ?? null),
      line,
    });
  }
  const top = (x) => (x.at == null ? Infinity : x.at);
  placed.sort((a, b) => a.page - b.page || top(b) - top(a));
  // A song bookmarked twice (under two names, or once from a second list)
  // would come out as a second, empty song.
  return placed.filter((x, i) => !i || x.page !== placed[i - 1].page || top(x) !== top(placed[i - 1]));
}

// The header that sits between a title and its chart: the writer, a video link,
// the link's caption. Shared by both ways of finding a song. Returns true when
// the line was header and is used up, false when it is the chart.
function takeHeader(cur, line, page, body) {
  const urls = line.text.match(URL_RE) || [];
  const rest = line.text.replace(URL_RE, '').trim();
  const link = linkOver(line, page.links);
  const video = youtubeOf(urls[0]) || youtubeOf(link?.url);
  if (video && !cur.youtubeUrl) cur.youtubeUrl = video;
  const chords = line.text.includes('[');

  // The writer: "artist:" anywhere in the header, "by …" anywhere in it, or
  // anything writer-like close under a title that was found — a song with a
  // picture between title and chart (Rudolph) has no such line, and the gap
  // says so.
  if (!cur.artist && !chords) {
    const field = ARTIST_FIELD.exec(rest);
    if (field) { cur.artist = fieldValue(field[1]) || fieldValue(field[2]); return true; }
    const byLine = BY_PREFIX.test(rest) && /[a-z]{2,}/i.test(rest.replace(BY_PREFIX, ''));
    const underTitle = cur.afterTitle === 1 && cur.titleSeen && looksLikeWriter(rest) && line.gapBefore < body * 3;
    if ((byLine && !NOT_A_WRITER.test(rest)) || underTitle) {
      cur.artist = fieldValue(rest.replace(BY_PREFIX, ''));
      return true;
    }
  }
  // A line that is nothing but a link (or a link's caption, like "The Chipmunk
  // Song" over a search URL) is not part of the chart.
  return Boolean((urls.length && !rest) || (link && !chords));
}

// Every page's lines that are the songs' own: no page numbers, no furniture,
// and no chord diagram's name. A diagram's name is a chord name on a line of
// its own in another size from the lyrics (Brighton's are larger); a line of
// chord names in the lyric size is the chart's own, an intro or a chord line.
const DIAGRAM_SIZE = 0.15;
function contentLines(page, junk) {
  const body = bodyHeight(page.lines);
  return page.lines.filter(l => !PAGE_NUMBER.test(l.text)
    && (l.text.includes('[') || !junk.has(furnitureKey(l.text)))
    && !(body && !l.text.includes('[') && chordNamesOnly(l.text) && !/\s/.test(l.text.trim())
      && Math.abs(l.height - body) > body * DIAGRAM_SIZE));
}

/**
 * pages: [{ lines: [{ text, x, y, height, gapBefore }], links: [{ url, top, bottom }] }]
 * — the lines as pdfText's linesFromItems builds them, one entry per page.
 * marks: [{ title, page, top }] — the book's bookmarks, page numbered from 1,
 * `top` the height the bookmark points at (null when it gives none).
 *
 * Returns [{ title, artist, youtubeUrl, text, firstPage, lastPage, noChords,
 * pictureOnly }], in book order. `noChords` marks what a bookmark list also
 * points at — the contents, a thank-you page, a chord chart — so it can start
 * unticked. `pictureOnly` is a bookmarked song with no text under its title at
 * all: the chart is an image (five of them in the Delmarvalous book). It is
 * kept so the list can say so, rather than the song quietly not being there.
 */
export function splitSongbook(pages = [], marks = []) {
  return readSongbook(pages, marks).songs;
}

// The same, saying how the songs were found — 'bookmarks', 'titles', 'bylines',
// or 'pages' when there was no title type to go on and each page is a song —
// which the book report (bookReport.js) needs to say how far to trust it.
export function readSongbook(pages = [], marks = []) {
  const placed = placeMarks(pages, marks);
  const withText = pages.filter(p => p.lines.length).length;
  let how = placed.length >= 2 && placed.length >= withText * MARKS_PER_PAGE ? 'bookmarks' : 'titles';
  let found;
  if (how === 'bookmarks') found = byBookmarks(pages, placed);
  else {
    found = byTitleType(pages);
    const byLines = byByLines(pages);
    if (wellFound(byLines) > wellFound(found)) { found = byLines; how = 'bylines'; }
  }
  const songs = found.map(s => ({
    title: s.title || (s.lines[0]?.text ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim() || `Page ${s.firstPage}`,
    // The title-type lines one by one, when a title ran to two: a wrapped
    // title, or — in a book that does it for every song — title over artist.
    titleParts: s.titleParts?.length > 1 ? s.titleParts : undefined,
    artist: s.artist,
    youtubeUrl: s.youtubeUrl,
    text: textFromLines(s.lines),
    firstPage: s.firstPage,
    lastPage: s.lastPage,
    noChords: !s.lines.some(l => CHORD.test(l.text)),
    pictureOnly: Boolean(s.marked) && !s.lines.length,
  })).filter(s => s.text.trim() || s.pictureOnly);
  return { songs, how: how === 'titles' && found.onePerPage ? 'pages' : how };
}

function newSong(title, pageNo) {
  return { title, artist: '', youtubeUrl: '', lines: [], firstPage: pageNo, lastPage: pageNo, afterTitle: 0, titleSeen: false };
}

// One more line of the song. A song carried over a page turn: the turn reads
// as a blank line, as it does in Load as text — the PDF's own gap is measured
// from the top of the new page and says nothing about the old one. The first
// line's gap is to the header above it, which is gone; left in, it would count
// toward the song's usual line spacing.
function push(cur, line, pageNo) {
  const turned = cur.lines.length && pageNo !== cur.lastPage;
  cur.lastPage = pageNo;
  cur.lines.push(turned ? { ...line, gapBefore: Infinity }
    : cur.lines.length ? line : { ...line, gapBefore: 0 });
}

function byBookmarks(pages, placed) {
  const junk = furniture(pages);
  const songs = [];
  let next = 0, cur = null;

  pages.forEach((page, i) => {
    const pageNo = i + 1;
    const body = bodyHeight(page.lines);
    let chartYet = false;
    contentLines(page, junk).forEach((line, n) => {
      const mark = placed[next];
      // A heading above a song's title, at the very top of its page and before
      // anything with a chord, belongs to the page, not to the song that ended
      // on the page before. Only above the page's FIRST title: under it, the
      // lines are that song's header.
      if (mark?.page === pageNo && mark.line && line.y > mark.at + 1 && n < 3 && !chartYet
        && !CHORD.test(line.text) && cur?.firstPage !== pageNo) return;
      if (CHORD.test(line.text)) chartYet = true;
      // The next bookmark takes over at its line, or at the top of its page.
      while (next < placed.length && (placed[next].page < pageNo
        || (placed[next].page === pageNo && (placed[next].at == null || line.y <= placed[next].at + 1)))) {
        cur = newSong(placed[next].title, pageNo);
        cur.titleLine = placed[next].line;
        cur.key = titleKey(placed[next].title);
        cur.marked = true;
        songs.push(cur);
        next++;
      }
      if (!cur) return;                 // a cover page, before the first song

      if (!cur.lines.length && cur.afterTitle < 4) {
        cur.afterTitle++;
        // The title itself, and the second line of one that wrapped.
        const k = titleKey(line.text);
        if (line === cur.titleLine
          || (!line.text.includes('[') && k.length >= 2 && cur.key.includes(k) && cur.afterTitle <= TITLE_MAX_LINES)) {
          cur.titleSeen = true;
          cur.afterTitle = 0;
          cur.lastPage = pageNo;
          return;
        }
        if (takeHeader(cur, line, page, body)) { cur.lastPage = pageNo; return; }
      }
      push(cur, line, pageNo);
    });
  });
  return songs;
}

function byTitleType(pages) {
  const junk = furniture(pages);
  const songs = [];
  let cur = null;

  pages.forEach((page, i) => {
    const pageNo = i + 1;
    // Measured on this page, not across the book: a book gathered from many
    // sources sets each song in its own size.
    const body = bodyHeight(page.lines);
    const isTitle = (l) => body > 0 && !l.text.includes('[') && titleWorthy(l.text)
      && (l.height >= body * TITLE_RATIO || (l.height >= body * TITLE_ARTIST_RATIO && TITLE_ARTIST_LINE.test(l.text)));
    for (const line of contentLines(page, junk)) {
      // A "by" line straight under a title is its writer, however large it is
      // set: TUSC prints "by Richard Whiting and Gus Kahn" bigger than the
      // "Ukulele Lady" over it. Anywhere else it may be a title — Moselele has
      // a song called "By Your Hand".
      const writer = BY_LINE.test(line.text) && cur?.lastPage === pageNo && cur.titleSeen && !cur.lines.length && !cur.artist;
      // …and when the title over it was set a shade too small to be found
      // (TUSC's "Ukulele Lady", 24pt over 20pt lyrics), the "by" line in title
      // type gives it away: the plain line just above it, on this page, was the
      // title, not the last line of the song before.
      const before = cur?.lines.at(-1);
      if (isTitle(line) && !writer && BY_LINE.test(line.text) && before && cur.lastPage === pageNo
        && before.y > line.y && !CHORD.test(before.text) && titleWorthy(before.text)) {
        cur.lines.pop();
        cur = newSong(before.text.trim(), pageNo);
        cur.titleSeen = true;
        cur.titleLines = 1;
        cur.titleParts = [before.text.trim()];
        cur.artist = fieldValue(line.text.replace(BY_PREFIX, ''));
        songs.push(cur);
        continue;
      }
      if (isTitle(line) && !writer) {
        // Two title-type lines in a row are one title that wrapped.
        if (cur && cur.lastPage === pageNo && cur.afterTitle === 0 && !cur.lines.length && cur.titleLines < TITLE_MAX_LINES) {
          cur.title = `${cur.title} ${line.text}`.trim();
          cur.titleLines++;
          cur.titleParts.push(line.text.trim());
          continue;
        }
        cur = newSong(line.text, pageNo);
        cur.titleSeen = true;
        cur.titleLines = 1;
        cur.titleParts = [line.text.trim()];
        songs.push(cur);
        continue;
      }
      if (!cur) continue;               // a cover page, before the first song
      if (!cur.lines.length && cur.afterTitle < 3) {
        cur.afterTitle++;
        if (takeHeader(cur, line, page, body)) { cur.lastPage = pageNo; continue; }
      }
      push(cur, line, pageNo);
    }
  });

  // No title type anywhere: one song a page, rather than one unreadable song.
  if (!songs.length) {
    pages.forEach((page, i) => {
      const s = newSong('', i + 1);
      for (const line of contentLines(page, junk)) push(s, line, i + 1);
      songs.push(s);
    });
    songs.onePerPage = true;
  }
  return songs;
}

// A title, then "by …" under it — or both on one line — near the top of a page.
function byByLines(pages) {
  const junk = furniture(pages);
  const songs = [];
  let cur = null;

  pages.forEach((page, i) => {
    const pageNo = i + 1;
    const body = bodyHeight(page.lines);
    const lines = contentLines(page, junk);
    let skip = null;
    lines.forEach((line, n) => {
      if (line === skip) return;
      const text = line.text.trim();
      const top = n < BY_TOP_LINES || line.gapBefore >= body * BY_GAP;
      // Still in the header of a song that started on this page: "Recorded by
      // Nat "King" Cole" under the writer is a credit, not the next song.
      const inHeader = cur?.firstPage === pageNo && !cur.lines.length;
      if (top && !inHeader && !CHORD.test(text) && !BY_LINE.test(text)) {
        const next = lines[n + 1];
        const inline = TITLE_BY.exec(text);
        let start = null;
        if (next && BY_LINE.test(next.text) && !CHORD.test(next.text) && titleWorthy(text)) {
          start = { title: text, artist: next.text.replace(BY_PREFIX, '') };
          skip = next;
        } else if (inline && titleWorthy(inline[1])) {
          start = { title: inline[1], artist: inline[2] };
          const above = lines[n - 1];
          if (SUBTITLE.test(inline[1]) && above && cur?.lastPage === pageNo && cur.lines.at(-1)?.text === above.text
            && !CHORD.test(above.text) && titleWorthy(above.text)) {
            cur.lines.pop();
            start.title = inline[1].startsWith('(') ? `${above.text.trim()} ${inline[1]}` : above.text.trim();
          }
          // "(sung by Julie Andrews)": the bracket "by" opened closes after the name.
          if ((start.artist.match(/\)/g) || []).length > (start.artist.match(/\(/g) || []).length) start.artist = start.artist.replace(/\)\s*$/, '');
        }
        if (start) {
          cur = newSong(start.title.trim(), pageNo);
          cur.artist = fieldValue(start.artist);
          cur.titleSeen = true;
          songs.push(cur);
          return;
        }
      }
      if (!cur) return;                 // a cover page, before the first song
      if (!cur.lines.length && cur.afterTitle < 3) {
        cur.afterTitle++;
        if (CREDIT_LINE.test(text) && !CHORD.test(text)) { cur.lastPage = pageNo; return; }
        if (takeHeader(cur, line, page, body)) { cur.lastPage = pageNo; return; }
      }
      push(cur, line, pageNo);
    });
  });
  return songs;
}

// How many songs a way of splitting found that look like songs: chords in
// them, and a title with a word in it that is not a lyric's length.
function wellFound(songs) {
  return songs.filter(s => s.title && titleWorthy(s.title) && s.title.length <= 70
    && s.lines.some(l => CHORD.test(l.text))).length;
}

// Every page's own lines — no furniture, no page numbers, no diagram names —
// for the page picker, which reads a title off each page by itself.
export function bookContent(pages = []) {
  const junk = furniture(pages);
  return pages.map(p => contentLines(p, junk));
}

// One song picked out by hand in the page picker: its pages, in order, read as
// one chart. `pages` are the book's own lines for just those pages (bookContent,
// so the book's furniture is already gone) with their links.
//
// The pages are known to be one song, so nothing here may split it. The title
// and header are found the usual way, and everything from the first line of
// the chart on is kept, whatever else looks like a title further down — a
// CHORUS set large is still part of the song. When something with chords
// comes before what was taken for the title, the title was a guess too far
// down the page, and every line is kept.
//
// A "by" line counts for more here than in a whole book: on one song's page,
// Brighton's "Mr. Blue Sky / by Jeff Lynne" is the title whatever else on the
// page is set larger ("CHORDS", over its diagrams). When no title is found the
// picker's own — `title`, read off the page — is taken off the top if it's
// printed there.
//
// Returns { artist, youtubeUrl, text }, or null when there is no chart in it.
export function chartFromPages(pages = [], title = '') {
  const all = pages.flatMap((p, i) => p.lines.map(line => ({ line, page: i })));
  if (!all.some(x => CHORD.test(x.line.text))) return null;
  let found = byTitleType(pages);
  const byLines = byByLines(pages);
  if (wellFound(byLines) >= wellFound(found) && byLines.length) found = byLines;
  const at = found.onePerPage ? -1 : found.findIndex(s => s.lines.length);
  const head = at >= 0 ? found[at] : null;
  const first = head?.lines[0];
  let from = first ? all.findIndex(x => x.page >= head.firstPage - 1 && x.line.text === first.text && x.line.y === first.y) : -1;
  if (from < 0 || all.slice(0, from).some(x => CHORD.test(x.line.text))) from = 0;
  let artist = from > 0 ? found.slice(0, at + 1).map(s => s.artist).find(Boolean) || '' : '';
  let youtubeUrl = from > 0 ? head.youtubeUrl || '' : '';
  if (!from && title) {
    const n = all.slice(0, TITLE_MAX_LINES + 1).findIndex(x => titleKey(x.line.text) === titleKey(title));
    if (n >= 0 && !all.slice(0, n).some(x => CHORD.test(x.line.text))) {
      // …and the header under it, as under any title: the writer, a video.
      const cur = newSong(title, 1);
      cur.titleSeen = true;
      const body = bodyHeight(pages[0].lines);
      for (from = n + 1; from < all.length && cur.afterTitle < 3 && !all[from].page; from++) {
        cur.afterTitle++;
        if (!takeHeader(cur, all[from].line, pages[0], body)) break;
      }
      artist = cur.artist;
      youtubeUrl = cur.youtubeUrl;
    }
  }
  const lines = all.slice(from).map((x, i, kept) => (
    !i ? { ...x.line, gapBefore: 0 } : x.page !== kept[i - 1].page ? { ...x.line, gapBefore: Infinity } : x.line));
  return { artist, youtubeUrl, text: textFromLines(lines) };
}

// ROUND BRACKETS. A common way to write a chart without ChordPro: "(Am) She
// leads a (G) lonely life" — Ukulele Wednesdays, Moogly, the Christmas Ukulele
// Song Book. Each "(Am)" is exactly a "[Am]", so turning one into the other
// keeps the chart as the book wrote it and lets the rest of the splitter read it.
//
// Only for a book that writes its charts that way. Lyrics have brackets of
// their own — "(x4)", "(oh whey oh)", "(Bb C7)" over a chord line — so a book
// qualifies only when lines with lyrics AND a bracketed chord name are common,
// and outnumber the square-bracket ones. Inside it, only a bracket holding one
// chord name and nothing else changes.
//
// A book can also mix the two: TUSC writes "Yellow" with [G] and "Faith" with
// (C), and decided for the whole book, Faith lost its chords. When the book as
// a whole does not qualify, each page is decided on its own, by the same test.
const PAREN_CHORD = /\(([A-G][#b♯♭]?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+)?\d{0,2}(?:(?:sus|add|maj|b|#|-)\d{1,2})*(?:\/[A-G][#b♯♭]?)?)\)/g;
const PAREN_BOOK_MIN = 10;
const PAREN_PAGE_MIN = 3;

export function roundBracketChords(pages = []) {
  const counts = pages.map(p => {
    let inline = 0, square = 0;
    for (const l of p.lines) {
      if (CHORD.test(l.text)) { square++; continue; }
      PAREN_CHORD.lastIndex = 0;
      if (PAREN_CHORD.test(l.text) && /[a-z]{3}/i.test(l.text.replace(PAREN_CHORD, ''))) inline++;
    }
    return { inline, square };
  });
  const inline = counts.reduce((n, c) => n + c.inline, 0);
  const square = counts.reduce((n, c) => n + c.square, 0);
  const swap = (p) => ({ ...p, lines: p.lines.map(l => (l.text.includes('(') ? { ...l, text: l.text.replace(PAREN_CHORD, '[$1]') } : l)) });
  if (inline >= PAREN_BOOK_MIN && inline > square) return { pages: pages.map(swap), converted: true, mixed: false };
  const own = counts.map(c => c.inline >= PAREN_PAGE_MIN && c.inline > c.square);
  if (!own.some(Boolean)) return { pages, converted: false, mixed: false };
  return { pages: pages.map((p, i) => (own[i] ? swap(p) : p)), converted: true, mixed: true };
}
