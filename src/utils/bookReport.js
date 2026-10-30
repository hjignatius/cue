// The book report: what Cue says about a songbook BEFORE anything is imported.
//
// Surveyed on 36 songbooks found online (2026-10-29). About half split cleanly;
// the rest are charts with chords above the lyrics, pictures of pages, or books
// whose titles look like everything else. Importing those anyway made junk —
// one book came out as 271 "songs" titled with chord names. So the report says
// plainly what the book is, how the songs were found, how they will come in,
// what was tidied on the way, and one of three verdicts:
//
//   ok     Looks right      — import as listed
//   check  Check the list   — something looks off, and the report says what
//   cant   Can't split this book — no list at all, only "keep it as one PDF"
//
// All of it is measured from the split itself (songbook.js). No AI.
//
// Also here: tidying titles (version numbers, "Difficulty = a", "(Key of C)",
// "Song – Artist"), and reading the title off a single PDF sheet, for a batch
// of separate PDFs imported together.

import { readSongbook, roundBracketChords, chordNamesOnly, titleWorthy, bookContent } from './songbook.js';

// A page with less text than this is a picture of a page (or blank).
const TEXT_PAGE_MIN = 40;
// A book whose pages are mostly pictures cannot be split at all.
const PICTURE_BOOK_SHARE = 0.8;
// Under half the songs with chords Cue can read: the split has gone wrong, or
// the book writes chords some other way.
const CHORDED_MIN = 0.5;
// Under this share, some songs without chords are worth a word in the report
// (they start unticked either way).
const CHORDED_GOOD = 0.85;
// Found by title type and averaging more pages than this per song: songs have
// probably run together because titles were not bigger than the lyrics.
const PAGES_PER_SONG_MAX = 3.5;
// Found by title type or "by" line, ONE song this many pages long has probably
// swallowed the songs after it. Moogly's averaged 1.6 pages a song, so the
// average said all was well, while "I Will Survive" ran on for 11.
const SONG_PAGES_MAX = 4;
// More than this share of titles that are chord names, a page long, or one
// character: titles were not found properly.
const ODD_TITLES_MAX = 0.1;
// More than this share, and the list is not worth checking: Brighton's
// songbooks set titles no bigger than the lyrics, and 10 of the 11 "titles"
// found were chords or lyric lines.
const ODD_TITLES_CANT = 0.5;
const oddTitle = (s) => looksLikeChord(s.title) || s.title.length > 70 || s.title.trim().length < 2;
// A book this long gets a report even when nothing in it splits — it is plainly
// a book, and saying why it can't be split beats a silent one-PDF import. A
// short PDF that is one chart still goes straight in, as it always has.
export const REPORT_PAGES_MIN = 13;
// …and a shorter PDF is a book too when songs start on this many different
// pages, or it has a contents page. "Beginning Ukulele Songbook" is 10 pages:
// an index, then a song a page, chords above the lyrics — it can't be split as
// charts, but it is plainly not one song, and the picker can take it apart.
const BOOK_START_PAGES = 3;

/** Whether a PDF gets the report at all, rather than going in as one song. */
export function isBook(report) {
  if (report.pages >= REPORT_PAGES_MIN) return true;
  if (report.verdict !== 'cant' && report.songs.length >= 2) return true;
  if (report.kind === 'pictures' || report.kind === 'none') return false;
  const starts = new Set(report.songs.map(s => s.firstPage));
  return starts.size >= BOOK_START_PAGES || report.songs.some(s => NOT_A_SONG.test(s.title));
}

// ---- Titles -----------------------------------------------------------------

// "v4b", "- v2 web", "Version 3", "v1_6", "rev 2" — at the END of a title only.
const VERSION_TAG = /\s*[-–—(]?\s*\b(?:v|ver\.?|version|rev\.?)\s*\d+(?:[._]\d+)*[a-z]?\b\)?(?:\s+web)?\s*$/i;
// Moselele: "Shake It Off Difficulty = a" over "Taylor Swift", both in title
// type, so they arrive as one title. What follows the rating is the artist.
const DIFFICULTY = /\s*\bdifficulty\s*[=:]\s*(?:[a-z]{1,4}|\d+(?:\/\d+)?)\b\s*(.*)$/i;
// A contents page found as if it were a song.
const NOT_A_SONG = /(?:^|\s)(?:table of )?contents(?: page)?$|^(?:song )?index$|^song list$|(?:^|[\s,])cover(?: page)?$/i;
// Moselele's Spookelele book sets every title over its artist in the same
// type, "Bad Moon Rising" / "Creedence Clearwater Revival", so the two arrive as
// one title. When most songs in a book do that it is the book's layout, not
// titles that happened to wrap, and the second line is the artist.
const TWO_LINE_LAYOUT = 0.6;
// "(Key of C)", "( key of Dm)".
const KEY_OF = /\s*\(\s*key\s+of\s+([A-G][#b♯♭]?m?)\s*\)/i;
// "OVER THE RIVER, Key of D", "LITTLE DRUMMER BOY,.Key of G" — at the end only.
const KEY_OF_END = /\s*[,.;:\-–—]+\s*key\s+of\s+([A-G][#b♯♭]?m?)\s*$/i;
// "Song – Artist", "Song—Artist", "Song - Artist". A plain hyphen only with a
// space either side, so "Brown-Eyed Girl" and "Ob-La-Di" are left whole.
const TITLE_ARTIST = /^(.+?)\s*(?:\s[-–—]\s|—|–)\s*([^-–—]+)$/;
// What follows a dash and is a note on the arrangement, not an artist.
const NOT_AN_ARTIST = /^(?:shorter|longer|easier|easy|harder|tab|with tab|instr|instrumental|web|live|lyrics|chords|version|copy|draft)\b/i;
// "(~ 1950)", "(1927)", " 1965" after a writer's name.
// A whole bracket or a bare year only: "Reg Presley (the Troggs 1967)" keeps
// its bracket closed.
const TRAILING_YEAR = /\s*(?:\(\s*~?\s*\d{4}s?\s*\)|~?\s*\d{4}s?)\s*$/;
const looksLikeChord = (t) => /^[A-G][#b♯♭]?\S{0,6}$/.test(t.trim());
// Chord diagrams labelled for each size of ukulele, printed beside the title
// and read into it: "Bye Bye LoveSopranoBaritone".
const UKE_SIZES = /(?<=\p{Ll})(?:Soprano|Concert|Tenor|Baritone)+$/u;
// Moogly: "Spirit In The Sky-Norman Greenbaum", a bare hyphen. Split only in a
// book where it is the habit — 14 of Moogly's 40 titles, against 3 of USGB's
// 1,622, which are "A Hard Rain's A-Gonna Fall" and medleys — and only with
// two words or more before the hyphen, which "Brown-Eyed Girl" does not have.
// After it, a capital: "Red Red Wine-UB40", "Be My Baby-Ronettes".
const GLUED_ARTIST = /^(\S+(?:\s+\S+)+?)-(\p{Lu}\S*(?:\s+\S+)*)$/u;
const GLUED_BOOK_MIN = 3;
const GLUED_BOOK_SHARE = 0.1;
// TUSC: "People are Strange (The Doors)", "JAMMIN’ (Bob Marley)". The same
// test of habit, and a capital inside — "(from The Jungle Book)", "(x2)" and a
// year are not artists.
const BRACKET_ARTIST = /^(.*\S)\s*\(\s*(\p{Lu}[^()]{1,40}?)\s*\)$/u;
const NOT_A_BRACKET_ARTIST = /^(?:from|live|reprise|part|key|capo|version|instrumental|medley|slow|fast)\b|^\d/i;
const bracketArtist = (title) => {
  const m = BRACKET_ARTIST.exec(title);
  return m && !NOT_A_BRACKET_ARTIST.test(m[2]) && !TRAILING_YEAR.test(`(${m[2]})`) ? m : null;
};
// A page number run into the end of a title: "Father Figure — George
// Michael24", "Britney Spears 11". Only the number this page is printed as, so
// "Maroon 5" and "Blink-182" keep theirs.
const TRAILING_NUMBER = /\s*(\d{1,4})\s*$/;

// Tidy one song's title, and fill the artist and key it gives away. Returns the
// song with its new fields and `tidied`: which kinds of tidying happened, so
// the report can say so ONCE rather than on every row.
export function tidySong(song, { secondLineIsArtist = false, printedPage = null, gluedArtist = false, bracketedArtist = false } = {}) {
  const tidied = new Set();
  const unnumbered = (t) => {
    const m = TRAILING_NUMBER.exec(t);
    return m && printedPage != null && +m[1] === printedPage && t.slice(0, m.index).trim() ? t.slice(0, m.index) : t;
  };
  let title = unnumbered(String(song.title || '')).replace(UKE_SIZES, '').replace(/\s*\*+\s*$/, '').trim();
  let artist = chordNamesOnly(song.artist || '') ? '' : unnumbered(song.artist || '');
  if (secondLineIsArtist && song.titleParts?.length === 2 && !artist && !DIFFICULTY.test(song.titleParts[0])) {
    [title, artist] = song.titleParts;
    tidied.add('artist');
  }
  let key = song.key || '';

  const d = DIFFICULTY.exec(title);
  if (d) {
    title = title.slice(0, d.index);
    if (!artist && d[1].trim()) artist = d[1].trim();
    tidied.add('difficulty');
  }

  const k = KEY_OF.exec(title) || KEY_OF_END.exec(title);
  if (k) {
    title = title.replace(k[0], ' ').trim();
    if (!key) key = k[1];
    tidied.add('key');
  }

  for (let v = title.replace(VERSION_TAG, ''); v !== title && v.trim(); v = title.replace(VERSION_TAG, '')) {
    title = v;
    tidied.add('version');
  }

  if (!artist) {
    const m = TITLE_ARTIST.exec(title);
    if (m && m[1].trim().length > 1 && !NOT_AN_ARTIST.test(m[2].trim()) && m[2].trim().split(/\s+/).length <= 6) {
      title = m[1];
      artist = m[2];
      tidied.add('artist');
    }
  }
  if (!artist && bracketedArtist) {
    const m = bracketArtist(title);
    if (m) {
      title = m[1];
      artist = m[2];
      tidied.add('artist');
    }
  }
  if (!artist && gluedArtist) {
    const m = GLUED_ARTIST.exec(title);
    if (m) {
      title = m[1];
      artist = m[2];
      tidied.add('artist');
    }
  }
  if (artist) {
    const a = artist.replace(/\s*\*+\s*$/, '').replace(TRAILING_YEAR, '').replace(/[\s,;:\-–—]+$/, '').trim();
    artist = a || artist;
  }

  title = title.replace(/[\s\-–—:,]+$/, '').replace(/\s{2,}/g, ' ').trim() || song.title;
  // TUSC quotes some titles whole: "\"Pennies From Heaven\"".
  title = title.replace(/^["“”](.+)["“”]$/u, '$1');
  const noChords = song.noChords || NOT_A_SONG.test(title);
  const out = { ...song, title, artist, key, noChords, tidied };
  delete out.titleParts;
  return out;
}

// ---- A whole book -------------------------------------------------------------

// What a book prints as its page numbers, as an offset from the PDF's own: a
// page of nothing but "25" on the PDF's 27th page is 2. Taken only when most
// of the numbered pages agree, so a stray "12" in a chart decides nothing.
function pageOffset(pages) {
  const counts = new Map();
  pages.forEach((p, i) => {
    for (const l of p.lines) {
      const m = /^\s*(\d{1,4})\s*$/.exec(l.text);
      if (m) { const off = i + 1 - +m[1]; counts.set(off, (counts.get(off) || 0) + 1); }
    }
  });
  let best = null, most = 0, all = 0;
  for (const [off, n] of counts) { all += n; if (n > most) { best = off; most = n; } }
  return most >= 3 && most >= all / 2 ? best : null;
}

/**
 * pages, marks: as extractSongbookPages returns them.
 * Returns { kind, how, verdict, reasons, tidied, songs, pages: n }.
 *   kind     'square' | 'round' | 'mixed' | 'over' | 'pictures' | 'none'
 *   how      'bookmarks' | 'titles' | 'bylines' | 'pages'
 *   verdict  'ok' | 'check' | 'cant'
 *   reasons  plain sentences: why it is 'check' or 'cant'
 *   tidied   { version, difficulty, key, artist } — how many titles each
 *   songs    split and tidied, each with `tidied` removed
 */
export function bookReport(pages = [], marks = []) {
  const n = pages.length;
  const textPages = pages.filter(p => p.lines.map(l => l.text).join('').trim().length >= TEXT_PAGE_MIN).length;
  const round = roundBracketChords(pages);
  const { songs: split, how } = readSongbook(round.pages, marks);

  const tidied = { version: 0, difficulty: 0, key: 0, artist: 0 };
  const chorded = split.filter(s => !s.noChords && !s.pictureOnly);
  const secondLineIsArtist = chorded.filter(s => s.titleParts?.length === 2).length >= chorded.length * TWO_LINE_LAYOUT;
  const glued = chorded.filter(s => !s.artist && GLUED_ARTIST.test(s.title)).length;
  const gluedArtist = glued >= GLUED_BOOK_MIN && glued >= chorded.length * GLUED_BOOK_SHARE;
  const bracketed = chorded.filter(s => !s.artist && bracketArtist(s.title)).length;
  const bracketedArtist = bracketed >= GLUED_BOOK_MIN && bracketed >= chorded.length * GLUED_BOOK_SHARE;
  const offset = pageOffset(pages);
  const songs = split.map(s => {
    const printedPage = offset == null ? null : s.firstPage - offset;
    const t = tidySong(s, { secondLineIsArtist, gluedArtist, bracketedArtist, printedPage });
    for (const kind of t.tidied) tidied[kind]++;
    delete t.tidied;
    return t;
  });

  // Chords written above the lyrics: whole lines of nothing but chord names.
  let over = 0, square = 0;
  for (const p of round.pages) for (const l of p.lines) {
    if (/\[[^\]\s][^\]]*\]/.test(l.text)) square++;
    else if (/^\s*(?:[A-G][#b♯♭]?(?:maj|min|m|dim|aug|sus|add)?\d{0,2}(?:\/[A-G][#b♯♭]?)?\s+){1,}[A-G][#b♯♭]?(?:maj|min|m|dim|aug|sus|add)?\d{0,2}(?:\/[A-G][#b♯♭]?)?\s*$/.test(l.text)) over++;
  }

  const kind = textPages < n * (1 - PICTURE_BOOK_SHARE) ? 'pictures'
    : round.converted && !round.mixed ? 'round'
    : square >= over && square > 0 ? (round.mixed ? 'mixed' : 'square')
    : over > 0 ? 'over' : 'none';

  const real = songs.filter(s => !s.noChords && !s.pictureOnly);
  const reasons = [];
  let verdict = 'ok';
  const cant = (why) => { verdict = 'cant'; reasons.push(why); };

  if (kind === 'pictures') cant('Its pages are pictures, not text, so there is nothing for Cue to read.');
  else if (kind === 'over') cant('Its chords sit above the lyrics. Cue can’t turn that kind of book into charts yet.');
  else if (kind === 'none') cant('Its chords aren’t written in a way Cue can read.');
  else if (songs.length < 2) cant('Cue couldn’t find separate songs in it.');
  else if (real.length < songs.length * CHORDED_MIN) cant(`Only ${real.length} of the ${songs.length} songs Cue found have chords it can read, so the split has gone wrong.`);
  else if (real.filter(oddTitle).length > real.length * ODD_TITLES_CANT) cant('Most of the titles Cue found are chords or lyrics, so it can’t tell where the songs start.');

  if (verdict !== 'cant') {
    if (how === 'pages') reasons.push('Cue couldn’t find the song titles, so each page is a song.');
    const odd = real.filter(oddTitle).length;
    if (odd > real.length * ODD_TITLES_MAX) reasons.push(`${odd} titles look wrong — they may be chords or lyrics.`);
    if (how === 'titles' && n / real.length > PAGES_PER_SONG_MAX) reasons.push(`The songs average ${Math.round(n / real.length)} pages each. Its titles are no bigger than the lyrics, so some songs have probably run together.`);
    else if (how === 'titles' || how === 'bylines') {
      const long = real.filter(s => s.lastPage - s.firstPage + 1 > SONG_PAGES_MAX);
      if (long.length) reasons.push(`${plural(long.length, 'song')} ${long.length === 1 ? 'runs' : 'run'} longer than ${SONG_PAGES_MAX} pages — “${long[0].title}” is ${long[0].lastPage - long[0].firstPage + 1} — so songs after ${long.length === 1 ? 'it' : 'them'} may have run together.`);
    }
    if (real.length < songs.length * CHORDED_GOOD) reasons.push(`${songs.length - real.length} have no chords and are left unticked.`);
    if (reasons.length) verdict = 'check';
  }

  return { kind, how, verdict, reasons, tidied, songs, pages: n };
}

// ---- One PDF sheet, from a batch of separate PDFs ---------------------------

// A club's sheets carry notes in their file names: "Fun  Fun  Fun - shorter -
// v5.pdf", "Lovely Hula Hands - instr - low g tab - v2d.pdf", and sort
// prefixes — "1 Aloha Week Hula", "z White Sandy Beach". The title is read
// off the page where the page has one (it is the club's own spelling, with
// its punctuation); the file name adds its notes and key.
function fromFileName(fileName) {
  let name = fileName.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
  let key = '';
  const k = KEY_OF.exec(name);
  if (k) { key = k[1]; name = name.replace(KEY_OF, ' '); }
  for (let v = name.replace(VERSION_TAG, ''); v !== name && v.trim(); v = name.replace(VERSION_TAG, '')) name = v;
  const parts = name.split(/\s+-\s*|\s*-\s+/).map(p => p.replace(/^\(|\)$/g, '').trim()).filter(p => p && !/^web$/i.test(p));
  return { title: parts[0] || name.trim(), notes: parts.slice(1), key };
}

const sameTitle = (a, b) => {
  const k = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const x = k(a), y = k(b);
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
};

// The title at the top of a sheet's first page, and the "by" line under it.
//
// Read directly rather than by splitting the page as a book: a club's sheet
// draws its chord diagrams in a symbol font at 80pt, under the title, and the
// splitter took that row for a second title — so the real one, with nothing
// under it but its writer, came out empty and was dropped. The title is the
// FIRST line in large type, which is above the diagrams on every sheet seen.
const SHEET_TITLE_RATIO = 1.2;
const SHEET_TOP_LINES = 3;
const BY_LINE = /^\s*(?:(?:written|words|music|lyrics)(?:\s+(?:and|&)\s+\w+)*\s+)?by\s*:?\s*/i;
function sheetTitle(lines = []) {
  const counts = new Map();
  for (const l of lines) { const h = Math.round(l.height); if (h > 0) counts.set(h, (counts.get(h) || 0) + 1); }
  let body = 0, most = -1;
  for (const [h, c] of counts) if (c > most) { body = h; most = c; }
  const top = lines.slice(0, SHEET_TOP_LINES);
  const i = top.findIndex(l => body > 0 && l.height >= body * SHEET_TITLE_RATIO && /\p{L}{3}/u.test(l.text) && !l.text.includes('['));
  if (i < 0) return null;
  const by = lines[i + 1] && BY_LINE.test(lines[i + 1].text) ? lines[i + 1].text.replace(BY_LINE, '').trim() : '';
  return { title: lines[i].text.trim(), artist: by };
}

/**
 * One PDF that is one song. Returns { title, artist, key, text, lastPage }, or
 * null when it is not one song (a book: it gets a report of its own).
 */
export function sheetInfo(pages = [], marks = [], fileName = '') {
  const file = fromFileName(fileName);
  if (pages.length >= REPORT_PAGES_MIN) return null;
  const { songs } = readSongbook(roundBracketChords(pages).pages, marks);
  if (songs.filter(s => !s.noChords).length > 1 || isBook(bookReport(pages, marks))) return null;
  const head = sheetTitle(pages[0]?.lines);
  const onPage = head ? tidySong(head) : null;
  // The page's title wins when it is the same song as the file name says —
  // "Ain’t She Sweet?" over "Ain't She Sweet". A sort prefix ("z White Sandy
  // Beach") goes with it.
  const title = onPage?.title && (sameTitle(onPage.title, file.title) || !file.title) ? onPage.title : file.title;
  const notes = file.notes.filter(n => !sameTitle(n, title));
  return {
    title: notes.length ? `${title} (${notes.join(', ')})` : title,
    fromPage: title === onPage?.title,
    notes,
    artist: onPage?.artist || '',
    key: onPage?.key || file.key,
    text: songs.map(s => s.text).join('\n\n'),
    firstPage: 1,
    lastPage: Math.max(1, pages.length),
  };
}

// ---- What the report says ---------------------------------------------------

export const VERDICT_WORDS = { ok: 'Looks right', check: 'Check the list', cant: 'Can’t split this book' };

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A batch of separate PDFs, one song each, as a report the same dialog can show.
// `sheets` are sheetInfo results with `fromPage` (title read off the page) and
// `notes` (notes kept from the file name).
export function sheetsReport(sheets) {
  const fromFile = sheets.filter(s => !s.fromPage).length;
  const reasons = fromFile > sheets.length * ODD_TITLES_MAX
    ? [`For ${plural(fromFile, 'PDF')}, Cue couldn’t read a title on the page and used the file name.`] : [];
  return {
    kind: 'sheets', how: 'sheets', verdict: reasons.length ? 'check' : 'ok', reasons,
    tidied: { notes: sheets.filter(s => s.notes?.length).length },
    songs: sheets, pages: sheets.length,
  };
}

/**
 * The report's sentences, in the order the design settled: what the book is,
 * how the songs were found, how they come in, what was tidied — once, as a
 * summary, never per row — and what is already in the library.
 */
export function reportLines(report, inLibrary = 0) {
  const n = report.songs.length;
  const lines = [];
  lines.push({
    square: 'Charts with chords in [square brackets].',
    round: 'Charts with chords in (round brackets). They become [square brackets], the way Cue writes them.',
    mixed: 'Charts with chords in [square brackets], and some in (round brackets). The round ones become square, the way Cue writes them.',
    over: 'Charts with the chords written above the lyrics.',
    none: 'Sheets whose chords aren’t written in brackets.',
    pictures: 'Pictures of pages, not text.',
    sheets: `${plural(n, 'PDF')}, one song each.`,
  }[report.kind] || '');
  // The reason already says what a book of pictures or of chords-above-lyrics
  // is; the kind is only worth adding where the reason is about the split.
  if (report.verdict === 'cant') return ['square', 'round', 'mixed'].includes(report.kind) ? lines : [];

  lines.push({
    bookmarks: `Cue found ${plural(n, 'song')} from the book’s bookmarks.`,
    titles: `Cue found ${plural(n, 'song')} by the large title at the top of each.`,
    bylines: `Cue found ${plural(n, 'song')} by the title and “by …” line at the top of each.`,
    pages: `Cue found ${plural(n, 'page')} and made each one a song.`,
    sheets: 'Titles, writers and keys are read from the top of each first page.',
  }[report.how]);
  lines.push(report.kind === 'sheets'
    ? 'They come in as PDF pages, exactly as printed.'
    : 'They come in as charts you can edit and transpose.');

  const t = report.tidied || {};
  const did = [
    t.version && `removed version numbers from ${plural(t.version, 'title')}`,
    t.difficulty && `removed “Difficulty” from ${plural(t.difficulty, 'title')}`,
    t.key && `moved the key out of ${plural(t.key, 'title')}`,
    t.artist && `took the artist from ${plural(t.artist, 'title')}`,
    t.notes && `kept the file name’s note, like “(shorter)”, on ${plural(t.notes, 'title')}`,
  ].filter(Boolean);
  if (did.length) lines.push(`Tidied: ${did.join('; ')}.`);
  if (inLibrary) lines.push(`${inLibrary} ${inLibrary === 1 ? 'is' : 'are'} already in your library and left unticked.`);
  return lines;
}

// ---- The page picker ----------------------------------------------------------
//
// For a book the report can't split — chords above the lyrics, pages that are
// pictures — or one whose split needs fixing, you mark the pages yourself:
// each is the start of a NEW song, more of the SAME song, or LEFT OUT. Each
// song then comes in as its own PDF, exactly as printed (pdfCut.js).

// A title is looked for this far down a page.
const PAGE_TITLE_LINES = 4;
const STARTS_BY = /^\s*(?:(?:written|words|music|lyrics)(?:\s+(?:and|&)\s+\w+)*\s+)?by\s*:?\s+\p{L}/iu;
const TITLE_THEN_BY = /^(.*?\p{L}.*?)\s+by\s+(\p{Lu}.*)$/u;
const ROUND_CHORD = /\([A-G][#b♯♭]?[^)\s]{0,6}\)/;
// A title stands out from the page's ordinary text by at least this much.
const PAGE_TITLE_RATIO = 1.1;
// Text whose font has lost its letters comes out as other letters entirely —
// Happy Ukulele's "ĐƌŽƐƐƚŚĞ…" — and two pages printed side by side run their
// lines together, "OFGauld". Neither is a title; "Page 10" is better.
const GARBLED = /[\u0100-\u024F\u0370-\u03FF\u0400-\u04FF]/gu;
const RUN_TOGETHER = /\p{Lu}{2,}\p{Ll}{2,}|\p{Ll}{2,}\p{Lu}{2,}/u;
// A split whose songs average more pages than this has run songs together;
// the picker starts from one song a page instead.
const PICKER_PAGES_PER_SONG = 2.5;

// The title on one page, read the way a reader would: the largest line with a
// word in it near the top, and a "by" line under it or after it for the artist.
// `lines` are the page's own (bookContent). Null when nothing looks like one.
export function pageTitle(lines = []) {
  const counts = new Map();
  for (const l of lines) { const h = Math.round(l.height); if (h > 0) counts.set(h, (counts.get(h) || 0) + 1); }
  let body = 0, most = -1;
  for (const [h, c] of counts) if (c > most || (c === most && h < body)) { body = h; most = c; }
  const top = lines.slice(0, PAGE_TITLE_LINES);
  let best = -1;
  top.forEach((l, i) => {
    const t = l.text.trim();
    const letters = (t.match(/\p{L}/gu) || []).length;
    if (!titleWorthy(t) || !/\p{L}{3}/u.test(t) || t.includes('[') || ROUND_CHORD.test(t) || STARTS_BY.test(t) || t.length > 70) return;
    if ((t.match(GARBLED) || []).length > letters * 0.25 || RUN_TOGETHER.test(t)) return;
    if (lines.length > 1 && l.height < body * PAGE_TITLE_RATIO) return;
    if (best < 0 || l.height > top[best].height + 0.5) best = i;
  });
  if (best < 0) return null;
  let title = top[best].text.trim(), artist = '';
  const next = lines[best + 1]?.text || '';
  const inline = TITLE_THEN_BY.exec(title);
  if (STARTS_BY.test(next)) artist = next.replace(BY_LINE, '');
  else if (inline) [, title, artist] = inline;
  const t = tidySong({ title, artist });
  return { title: t.title, artist: t.artist, key: t.key };
}

/**
 * Where the picker starts. From the split when the report could make one — the
 * report did the work, and the picker is for fixing it — or when the book's
 * bookmarks found its songs, with pages no song claimed (the cover, the
 * contents) left out. Otherwise every page is a song
 * of its own: most songs in these books fit on a page, and a page turn is one
 * tap to make "Same song".
 *
 * Returns { marks: ['start' | 'same' | 'skip', ...] one per page,
 *           titles: { [page]: { title, artist, key } } for every page }.
 */
export function pickerStart(report, pages = []) {
  const n = pages.length;
  const content = bookContent(pages);
  const titles = {};
  let marks;
  // A book's bookmarks say where its songs start even when its chords can't be
  // read — Farmers Market has one per song, chords above the lyrics.
  const split = (report.verdict !== 'cant' || report.how === 'bookmarks')
    && report.songs.length && n / report.songs.length <= PICKER_PAGES_PER_SONG;
  if (split) {
    marks = Array(n).fill('skip');
    for (const s of report.songs) {
      // "No chords" means no chords Cue can read — every song, in a book whose
      // chords sit above the lyrics. There, only a contents page is left out.
      const notASong = report.verdict === 'cant' ? NOT_A_SONG.test(s.title) : s.noChords && !s.pictureOnly;
      if (notASong) continue;
      for (let p = s.firstPage; p <= Math.min(s.lastPage, n); p++) if (marks[p - 1] === 'skip') marks[p - 1] = 'same';
      if (marks[s.firstPage - 1] !== 'start') {
        marks[s.firstPage - 1] = 'start';
        // Under a title in a book of chords above the lyrics, the "artist" Cue
        // found is as often a chord line or a label ("CCHORUS").
        const artist = report.verdict === 'cant' && /chorus|verse|intro|bridge|outro/i.test(s.artist || '') ? '' : s.artist || '';
        titles[s.firstPage] = { title: s.title, artist, key: s.key || '' };
      }
    }
  } else marks = Array(n).fill('start');
  for (let p = 1; p <= n; p++) {
    if (!titles[p]) titles[p] = pageTitle(content[p - 1]) || { title: `Page ${p}`, artist: '', key: '' };
  }
  // A contents or index page, wherever the report or the page itself names it.
  if (!split) {
    for (const s of report.songs) if (NOT_A_SONG.test(s.title)) marks[s.firstPage - 1] = 'skip';
    for (let p = 1; p <= n; p++) if (NOT_A_SONG.test(titles[p].title)) marks[p - 1] = 'skip';
  }
  return { marks, titles };
}

/**
 * The songs the marks make: [{ title, artist, key, pages: [n…], firstPage,
 * lastPage }]. A "Same song" with no song before it starts one — there is
 * nothing for it to be the same as. A left-out page in the middle of a song
 * (an advert) is just not in it.
 */
export function songsFromMarks(marks = [], titles = {}) {
  const songs = [];
  let cur = null;
  marks.forEach((m, i) => {
    const p = i + 1;
    if (m === 'skip') return;
    if (m === 'start' || !cur) {
      cur = { title: `Page ${p}`, artist: '', key: '', ...titles[p], pages: [], firstPage: p };
      songs.push(cur);
    }
    cur.pages.push(p);
  });
  return songs.map(s => ({ ...s, lastPage: s.pages.at(-1) }));
}
