// Splitting a songbook PDF into songs.
//
// The pages here are built by hand in the shape pdfText's linesFromItems gives
// back, from what the first real book ("DUS modified.pdf") measured: 16pt
// titles, 12pt lyrics, a 10pt footer on every page. Each case is one of the
// ways a book can be laid out.
//
// Run: node scripts/songbookCheck.mjs
import { splitSongbook, roundBracketChords } from '../src/utils/songbook.js';
import { tidySong, bookReport, sheetInfo, sheetsReport, reportLines, pageTitle, pickerStart, songsFromMarks, isBook, pageChances, pickedCharts } from '../src/utils/bookReport.js';
import { openBook } from '../src/utils/pdfCut.js';
import { linesFromItems } from '../src/utils/pdfText.js';
import { PDFDocument } from 'pdf-lib';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

// One page from a list of [text, height?, gapBefore?]. y runs down the page.
function page(rows, links = []) {
  let y = 741;
  const lines = rows.map(([text, height = 12, gap = 15], i) => {
    if (i) y -= gap;
    return { text, x: 36, y, height, gapBefore: i ? gap : 0 };
  });
  return { lines, links };
}
const T = (text) => [text, 16];
const FOOT = (date = 'August 11, 2026') => [`Table of Contents Updated: ${date}`, 10, 60];
const VERSE = ['[C] All I want for [F] Christmas', 'Is my [G7] two front [C] teeth', 'Gee, if I could [D7] only have'];

// ---- 1. one song a page, the DUS layout ---------------------------------------
const book = [
  page([T('All I Want for Christmas'), ['by Donald Yetter Gardner'], ['https://www.youtube.com/watch?v=WI02_UJ1C6I'],
        ['INTRO: [C] //// ////', 12, 30], [VERSE[0], 12, 30], [VERSE[1]], [VERSE[2]], FOOT()]),
  page([T('Auld Lang Syne'), ['By: Robbie Burns'], ['INTRO: [G] ///', 12, 30], ['[D7] Should [G] auld acquaintance'], FOOT('August 9, 2026')]),
  page([T('Chipmunk Song'), ['by Ross Bagdasarian Sr.'], ['The Chipmunk Song'], ['¾ time', 12, 30], ['[C] Christmas, Christmas [G7] time is near'], FOOT('August11, 2026')],
       [{ url: 'https://www.google.com/search?q=chipmunks', top: 715, bottom: 705 }]),
  page([T('Mele Kalikimaka'), ['By R. Alex Anderson', 12, 28], ['http://au.youtube.com/watch?v=rdGnBt7Txy8'], ['INTRO: [C] ////', 12, 30], FOOT()]),
];
const songs = splitSongbook(book);
check('four songs', songs.map(s => s.title), ['All I Want for Christmas', 'Auld Lang Syne', 'Chipmunk Song', 'Mele Kalikimaka']);
check('writers, with "by" / "By:" taken off', songs.map(s => s.artist), ['Donald Yetter Gardner', 'Robbie Burns', 'Ross Bagdasarian Sr.', 'R. Alex Anderson']);
check('video from a printed link', songs[0].youtubeUrl, 'https://www.youtube.com/watch?v=WI02_UJ1C6I');
check('a regional YouTube host comes back as www', songs[3].youtubeUrl, 'https://www.youtube.com/watch?v=rdGnBt7Txy8');
check('a link that is not a video sets nothing', songs[2].youtubeUrl, '');
check('the chart, with its blank lines put back', songs[0].text, `INTRO: [C] //// ////\n\n${VERSE.join('\n')}`);
check('the footer is gone, whatever its date', songs.some(s => /Table of Contents|Updated/.test(s.text)), false);
check('a link caption is not a lyric', songs[2].text.includes('The Chipmunk Song'), false);
check('a note under the writer stays in the chart', songs[2].text.startsWith('¾ time'), true);
check('pages recorded', songs.map(s => [s.firstPage, s.lastPage]), [[1, 1], [2, 2], [3, 3], [4, 4]]);

// ---- 2. every line that survives is the PDF's own line --------------------------
const source = new Set(book.flatMap(p => p.lines.map(l => l.text)));
check('no line is invented or altered', songs.every(s => s.text.split('\n').every(l => l === '' || source.has(l))), true);

// ---- 3. a song over two pages, two songs on one ---------------------------------
const turn = splitSongbook([
  page([T('Long Song'), ['Traditional'], [VERSE[0], 12, 30], [VERSE[1]], FOOT()]),
  page([['[F] Second page, same [C] song'], ['And [G7] on it [C] goes'], FOOT()]),
  page([T('Short One'), ['by Someone'], ['[G] One [D7] line', 12, 30], T('Short Two'), ['by Someone Else'], ['[C] Another [G7] line', 12, 30], FOOT()]),
  page([T('Last'), ['[C] End', 12, 30], FOOT()]),
]);
check('the second page joins the song it continues', turn.map(s => s.title), ['Long Song', 'Short One', 'Short Two', 'Last']);
check('…with the page turn read as a blank line', turn[0].text, `${VERSE[0]}\n${VERSE[1]}\n\n[F] Second page, same [C] song\nAnd [G7] on it [C] goes`);
check('…and both pages recorded', [turn[0].firstPage, turn[0].lastPage], [1, 2]);
check('two songs on one page split at the second title', [turn[1].text, turn[2].text], ['[G] One [D7] line', '[C] Another [G7] line']);
check('a bare name under the title is the writer', turn[0].artist, 'Traditional');
check('a chord line under the title is not a writer', [turn[3].artist, turn[3].text], ['', '[C] End']);

// ---- 4. titles and writers in their other shapes ---------------------------------
const odd = splitSongbook([
  page([['My Songbook', 20], ['Compiled 2026'], FOOT()]),                                    // a cover
  page([T('A Title So Long'), T('It Wraps'), ['Written by: Benjamin Hanby (1865) www.example.ca'], ['[G] Up on the [C] housetop', 12, 30], FOOT()]),
  page([T('Rudolph'), ['(Single strum)', 12, 139], ['You know [Dm] Dasher', 12, 15], FOOT()]),
  page([T('Grinch'), ['Albert Hague / Theodor S. Geisel https://www.youtube.com/watch?v=moF9ZXsPKGI'], ['[Gm] Mean one', 12, 30], FOOT()],
       [{ url: 'https://www.youtube.com/watch?v=moF9ZXsPKGI', top: 730, bottom: 722 }]),
]);
check('a cover page before the first song is skipped', odd[0].title, 'A Title So Long It Wraps');
check('"Written by:" and a web address come off the writer', odd[0].artist, 'Benjamin Hanby (1865)');
check('a song with a picture under its title has no writer', [odd[1].artist, odd[1].text], ['', '(Single strum)\nYou know [Dm] Dasher']);
check('writer and video on one line', [odd[2].artist, odd[2].youtubeUrl], ['Albert Hague / Theodor S. Geisel', 'https://www.youtube.com/watch?v=moF9ZXsPKGI']);

// ---- 5. what is NOT furniture ------------------------------------------------------
const chorus = '[C] Jingle bells, [F] jingle bells';
const rep = splitSongbook([
  page([T('One'), [chorus, 12, 30], [chorus], [chorus], FOOT()]),
  page([T('Two'), ['[G] Merry Christmas', 12, 30], FOOT()]),
  page([T('Three'), ['[G] Merry Christmas', 12, 30], FOOT()]),
  page([T('Four'), ['[D] Something else', 12, 30], FOOT()]),
  page([T('Five'), ['[A] And more', 12, 30], FOOT()]),
]);
check('a chorus repeated within one song stays', rep[0].text.split('\n').length, 3);
check('a line in two songs of five stays', rep[1].text, '[G] Merry Christmas');
const labels = splitSongbook([1, 2, 3, 4].map(n => page([T(`Song ${n}`), ['INTRO: [C] ////', 12, 30], ['CHORUS', 12, 30], ['[F] words', 12, 15], FOOT()])));
check('a CHORUS label in every song stays', labels.every(s => s.text.includes('CHORUS')), true);
check('an INTRO line in every song stays', labels.every(s => s.text.startsWith('INTRO: [C] ////')), true);
check('…while the footer still goes', labels.some(s => /Updated/.test(s.text)), false);
const marks = splitSongbook([
  page([T('Strums'), ['//// ////', 12, 30], ['['], ['[C] words'], ['12', 10, 60]]),
  page([T('Numbers'), ['[G] words', 12, 30], ['- 13 -', 10, 60]]),
  page([T('More'), ['[D] words', 12, 30], ['Page 14', 10, 60]]),
]);
check('strum marks and a stray bracket are not page numbers', marks[0].text, '//// ////\n[\n[C] words');
check('a time signature under the title is not a writer',
  splitSongbook([page([T('Waltz'), ['¾ time'], ['[C] words', 12, 30]])])[0].artist, '');
check('page numbers go', [marks[1].text, marks[2].text], ['[G] words', '[D] words']);

// ---- 6. a book with no title type ----------------------------------------------------
const plain = splitSongbook([
  page([['[C] First song [G] line'], ['[F] more']]),
  page([['Second Song'], ['[G] words']]),
]);
check('one song a page, titled from its first line', plain.map(s => s.title), ['First song line', 'Second Song']);
check('empty input', splitSongbook([]), []);

// ---- 7. a book with bookmarks ----------------------------------------------------------
// The big books: gathered from many sources, so each song is set in its own
// size — the Delmarvalous "500 Miles" has a 16pt title over 16pt lyrics, which
// by type size alone ran every song into one title. Jim's pages open with a
// date line and a contents link above the title; his header is "artist:… writer:…".
const HEAD = [['Date Created - Jul-22 ,2026', 10], ['Go To Contents', 10]];
const big = [
  page([['Cover page'], ['Put together by Jim']]),
  page([['Ukulele Songbook Table of Contents'], ['500 Miles ......... 3'], ['900 Miles ......... 4']]),
  page([...HEAD, ['500 Miles', 16, 30], ['By: Peter Paul and Mary', 16], [VERSE[0], 16, 30], [VERSE[1], 16], ['Page 3 of 9', 10, 60]]),
  page([...HEAD, ['900 Miles', 16, 30], ['artist:Wham , writer:Dan Lindfors', 14], [VERSE[1], 14, 30], [VERSE[2], 14], ['Page 4 of 9', 10, 60]]),
  page([...HEAD, ['[F] Second page of [C] 900', 14, 30], ['[G] and on', 14], ['Page 5 of 9', 10, 60]]),
  page([...HEAD, ['Christmas Song, The', 18, 30], ['artist: writer:Traditional', 12], ['[G] Chestnuts', 12, 30],
        ['Banks Of The Ohio [D]', 18, 40], ['[D] I asked my love', 12, 30], ['Page 6 of 9', 10, 60]]),
  page([...HEAD, ['Que Sera Sera', 16, 30], ['By: Jay Livingston and Ray Evans', 12], ['Page 7 of 9', 10, 600]]),
  page([...HEAD, ['Last Song', 16, 30], ['[C] The end', 12, 30], ['Page 8 of 9', 10, 60]]),
  page([...HEAD, ['Lyric Only', 16, 30], ['[C] More end', 12, 30], ['Page 9 of 9', 10, 60]]),
];
const bm = splitSongbook(big, [
  { title: 'Ukulele Songbook Table of Contents', page: 2, top: 763 },
  { title: '500 Miles', page: 3, top: 763 },
  { title: '900 Miles', page: 4, top: null },
  { title: 'Christmas Song, The', page: 6, top: null },
  { title: 'Banks Of The Ohio [D]', page: 6, top: null },
  { title: 'Que Sera Sera', page: 7, top: 763 },
  { title: 'Last Song', page: 8, top: null },
  { title: 'Lyric Only', page: 9, top: null },
]);
check('bookmarks: one song each, wherever the type size', bm.map(s => s.title),
  ['Ukulele Songbook Table of Contents', '500 Miles', '900 Miles', 'Christmas Song, The', 'Banks Of The Ohio [D]', 'Que Sera Sera', 'Last Song', 'Lyric Only']);
check('…a title the size of its lyrics is still taken off the chart', bm[1].text, `${VERSE[0]}\n${VERSE[1]}`);
check('…a song over a page turn stays whole', [bm[2].text, bm[2].firstPage, bm[2].lastPage], [`${VERSE[1]}\n${VERSE[2]}\n\n[F] Second page of [C] 900\n[G] and on`, 4, 5]);
check('…the heading above a title joins neither song', bm.some(s => /Date Created|Go To Contents/.test(s.text)), false);
check('…two songs on one page split at the second title', [bm[3].text, bm[4].text], ['[G] Chestnuts', '[D] I asked my love']);
check('…a title with its key in it is found', bm[4].text.includes('Banks'), false);
check('artist: field, stray comma gone; writer: when there is no artist', [bm[2].artist, bm[3].artist], ['Wham', 'Traditional']);
check('"By:" still read under a bookmarked title', bm[1].artist, 'Peter Paul and Mary');
check('a contents page is flagged as no chords', [bm[0].noChords, bm[1].noChords], [true, false]);
check('a song whose chart is a picture is kept, flagged', [bm[5].pictureOnly, bm[5].text, bm[5].artist], [true, '', 'Jay Livingston and Ray Evans']);
check('the cover, before the first bookmark, is no song', bm.some(s => /Cover/.test(s.text)), false);
const bmSource = new Set(big.flatMap(p => p.lines.map(l => l.text)));
check('bookmarks: no line is invented or altered', bm.every(s => s.text.split('\n').every(l => l === '' || bmSource.has(l))), true);

// A book bookmarked by chapter only is not split by its bookmarks: one mark for
// every few dozen pages would make songs dozens of pages long.
const chapters = splitSongbook(book, [{ title: 'Christmas', page: 1, top: null }]);
check('chapter bookmarks alone fall back to title type', chapters.map(s => s.title),
  ['All I Want for Christmas', 'Auld Lang Syne', 'Chipmunk Song', 'Mele Kalikimaka']);
check('a bookmark to a page the book no longer has is ignored',
  splitSongbook(book, [{ title: 'Gone', page: 99, top: null }]).length, 4);


// ---- 8. the book report: tidying titles ---------------------------------------
// Measured on 36 songbooks found online (2026-10-29).
const t = (title, artist = '') => { const r = tidySong({ title, artist }); return [r.title, r.artist, r.key]; };
check('version number dropped', t('Ripple - v7d'), ['Ripple', '', '']);
check('…with "web" after it', t('Blue Hawaii - v5a  web'), ['Blue Hawaii', '', '']);
check('…but a title ending in a digit keeps it', t('9 to 5'), ['9 to 5', '', '']);
check('"(Key of C)" moves to the key', t('Aloha Week Hula (Key of C)- v4b'), ['Aloha Week Hula', '', 'C']);
check('Moselele: difficulty dropped, the artist after it kept', t('Shake It Off Difficulty = a Taylor Swift'), ['Shake It Off', 'Taylor Swift', '']);
check('"Song – Artist" splits', t('Video Killed the Radio Star – The Buggles*'), ['Video Killed the Radio Star', 'The Buggles', '']);
check('…and "Song—Artist"', t('Merry Xmas Everybody—Slade'), ['Merry Xmas Everybody', 'Slade', '']);
check('…but a hyphenated title stays whole', t('Brown-Eyed Girl'), ['Brown-Eyed Girl', '', '']);
check('…and an arrangement note is not an artist', t('Proud Mary - shorter'), ['Proud Mary - shorter', '', '']);
check('…and a song with an artist already keeps its title', t('Ob-La-Di – Ob-La-Da', 'The Beatles'), ['Ob-La-Di – Ob-La-Da', 'The Beatles', '']);
check('a year after the writer goes, a bracket stays closed',
  [t('X', 'Jack Pitman (~ 1950)')[1], t('X', 'Reg Presley (the Troggs 1967)')[1], t('X', 'Meredith Wilson ,')[1]],
  ['Jack Pitman', 'Reg Presley (the Troggs 1967)', 'Meredith Wilson']);
check('a list of chord names is not an artist', t('X', 'Am F C G E7')[1], '');
check('", Key of D" at the end moves to the key', [t('OVER THE RIVER, Key of D'), t('LITTLE DRUMMER BOY,.Key of G'), t('The Key of Life')],
  [['OVER THE RIVER', '', 'D'], ['LITTLE DRUMMER BOY', '', 'G'], ['The Key of Life', '', '']]);
check('a cover page is no song', tidySong({ title: 'HOLIDAY SONGS, Cover Page' }).noChords, true);
check('ukulele sizes stuck to a title go', t('Bye Bye LoveSopranoBaritone'), ['Bye Bye Love', '', '']);
check('a contents page is no song', tidySong({ title: 'Ukulele Songbook Table of Contents' }).noChords, true);

// ---- 9. round brackets --------------------------------------------------------
const roundPage = () => page([['(Am) She leads a (G) lonely life'], ['Oh (x4) whey (Bb C7)'], ['(C) (Dm7) (G7/B)'], ['and (F#m) more (Bbmaj7) words'], ['the (A) end (Dsus4) here']]);
const rb = roundBracketChords([roundPage(), roundPage(), roundPage(), roundPage()]);
check('a book of (G) chords becomes [G]', [rb.converted, rb.pages[0].lines.map(l => l.text)], [true,
  ['[Am] She leads a [G] lonely life', 'Oh (x4) whey (Bb C7)', '[C] [Dm7] [G7/B]', 'and [F#m] more [Bbmaj7] words', 'the [A] end [Dsus4] here']]);
const strayPage = () => page([['Sing it (G) again'], ['and once (Am) more'], ['[C] the rest is square']]);
check('…but a stray bracket or two is left alone', roundBracketChords([...book, strayPage()]).converted, false);
check('…and a square-bracket book is left alone', roundBracketChords(book).converted, false);
// TUSC: "Yellow" in [G], "Faith" in (C). The book as a whole doesn't qualify,
// so each page is decided on its own.
const mixed = roundBracketChords([...book, roundPage()]);
check('a mixed book converts its round pages only', [mixed.converted, mixed.mixed, mixed.pages[0] === book[0], mixed.pages[4].lines[0].text],
  [true, true, true, '[Am] She leads a [G] lonely life']);

// ---- 10. verdicts -------------------------------------------------------------
check('a good book looks right', [bookReport(book).verdict, bookReport(book).kind, bookReport(book).how], ['ok', 'square', 'titles']);
const pictures = Array.from({ length: 15 }, () => page([['12']]));
check('pages of pictures can’t be split', [bookReport(pictures).verdict, bookReport(pictures).kind], ['cant', 'pictures']);
const overPage = (title) => page([T(title), ['C        G       Am'], ['Some lyric words here'], ['F        C'], ['More of the words now']]);
const over = bookReport([overPage('One'), overPage('Two'), overPage('Three'), overPage('Four')]);
check('chords above the lyrics can’t be split yet', [over.verdict, over.kind], ['cant', 'over']);
check('…and a book that can’t be split says no more than its reason', reportLines(over), []);
const verses = () => Array.from({ length: 4 }, () => page([[VERSE[0]], [VERSE[1]]]));
const runTogether = bookReport([book[0], ...verses(), book[1], ...verses()]);
check('songs many pages long: check the list', [runTogether.verdict, /run together/.test(runTogether.reasons.join(' '))], ['check', true]);
check('the report says it in order', reportLines(bookReport(book), 2), [
  'Charts with chords in [square brackets].',
  'Cue found 4 songs by the large title at the top of each.',
  'They come in as charts you can edit and transpose.',
  '2 are already in your library and left unticked.',
]);

// ---- 12. titles no bigger than the lyrics: the "by" line ----------------------
// Brighton: a header on every page, the title in the lyric size with "by …"
// under it or beside it, and chord diagrams whose names are the largest type.
const BRIGHTON_HEAD = ['Brighton Ukulele Sundays – Songbook', 12];
const DIAGRAM = (name) => [name, 20, 2];
const brighton = bookReport([
  page([BRIGHTON_HEAD, ['Here Comes The Sun'], ['by George Harrison, 1969'], DIAGRAM('Cmaj7'), ['[G] Here comes the sun'], ['[Cmaj7] Here comes the [A7] sun'], ['22/04/2009 5', 11, 300]]),
  page([BRIGHTON_HEAD, ['Mister Sandman by Pat Ballard, 1954'], DIAGRAM('C7+5'), ['[C7]Mister [F]Sandman'], ['[A7]Make him the cutest'], ['22/04/2009 6', 11, 300]]),
  page([BRIGHTON_HEAD, ['[D7]Sandman, I’m so alone'], ['Don’t have [G7]nobody'], ['22/04/2009 7', 11, 300]]),
  page([BRIGHTON_HEAD, ['Dance Tonight'], ['By Paul McCartney'], ['Recorded by Paul McCartney, 2007'], DIAGRAM('Dsus4'), ['[G] Everybody gonna dance tonight'], ['22/04/2009 8', 11, 300]]),
]);
check('a "by" line under the title finds the song', [brighton.how, brighton.verdict], ['bylines', 'ok']);
check('…titles and writers, from either layout', brighton.songs.map(s => [s.title, s.artist, s.firstPage, s.lastPage]), [
  ['Here Comes The Sun', 'George Harrison', 1, 1],
  ['Mister Sandman', 'Pat Ballard', 2, 3],
  ['Dance Tonight', 'Paul McCartney', 4, 4],
]);
check('…and neither the diagram names nor a second credit get into the chart',
  brighton.songs.some(s => /^(?:Cmaj7|C7\+5|Dsus4)$|Recorded by/m.test(s.text)), false);
check('the report says how', reportLines(brighton)[1], 'Cue found 3 songs by the title and “by …” line at the top of each.');
const subtitled = bookReport([
  page([BRIGHTON_HEAD, ['Dance Tonight'], ['by Paul McCartney'], ['[G] Everybody gonna dance tonight'], ['22/04/2009 8', 11, 300]]),
  page([BRIGHTON_HEAD, ['Everybody’s Talkin’'], ['(Theme from Midnight Cowboy) by Harry Nilsson'], ['[F] Everybody’s [Am] talking at me'], ['22/04/2009 9', 11, 300]]),
  page([BRIGHTON_HEAD, ['Do Re Mi'], ['from the Sound of Music (sung by Julie Andrews)'], ['[C] Doe, a deer'], ['22/04/2009 10', 11, 300]]),
  page([BRIGHTON_HEAD, ['L-O-V-E'], ['Words & Music by Milt Gabler & Bert Kaempfert'], ['Recorded by Nat "King" Cole, 1964'], ['[G] L is for the [Am] way'], ['22/04/2009 11', 11, 300]]),
  page([BRIGHTON_HEAD, ['Sweet Georgia Brown Words by A. Ken Casey'], ['[A7] No gal made has got a shade'], ['22/04/2009 12', 11, 300]]),
]);
check('…a title’s second line, and credits in any case', subtitled.songs.map(s => [s.title, s.artist]), [
  ['Dance Tonight', 'Paul McCartney'], ['Everybody’s Talkin’ (Theme from Midnight Cowboy)', 'Harry Nilsson'],
  ['Do Re Mi', 'Julie Andrews'], ['L-O-V-E', 'Milt Gabler & Bert Kaempfert'], ['Sweet Georgia Brown', 'A. Ken Casey']]);

// A chord name or a lone letter in large type is no title; TUSC runs a song's
// name down its margin one 48pt capital at a time.
const margin = splitSongbook([
  page([T('Yellow'), ['[G]Look at the stars'], ['L', 48], ['Look how they shine for [D]you'], ['C#m', 20], ['And everything you [C]do']]),
  page([T('Faith'), ['Well I guess it would be [C] nice']]),
]);
check('lone letters and chord names are not titles', margin.map(s => s.title), ['Yellow', 'Faith']);

// A "by" line in title type straight under its title is the writer…
const lady = splitSongbook([
  page([T('Mellow Yellow'), ['[C]I’m just mad about [F]Saffron']]),
  page([['"Ukulele Lady"', 23], ['by Richard Whiting and Gus Kahn', 28], ['[F]I used to linger'], ['on Hona[Db7]lu[C7]lu [F]bay']]),
  page([T('Faith'), ['by George Michael', 20], ['Well I guess it would be [C] nice']]),
]);
check('a big "by" line is the writer of the line above it', lady.map(s => [s.title, s.artist]),
  [['Mellow Yellow', ''], ['"Ukulele Lady"', 'Richard Whiting and Gus Kahn'], ['Faith', 'George Michael']]);
check('…but a song can be called "By Your Hand"', splitSongbook([
  page([T('Faith'), ['Well I guess it would be [C] nice'], T('By Your Hand'), ['[G] By your hand']]),
]).map(s => s.title), ['Faith', 'By Your Hand']);

// ---- 13. the book's habits ---------------------------------------------------
// Moogly: "Spirit In The Sky-Norman Greenbaum", and the page number run into
// the title, "Father Figure — George Michael24", on the PDF's 26th page.
const moogly = (titles) => titles.map((title, i) => page([['' + (i + 1), 10], T(title), ['(A)When I die and they (D)lay me to rest'], ['Gonna (E)go to the place that’s the (A)best']]));
const habit = bookReport([page([['Moogly’s Songbook', 30]]), ...moogly(['Spirit In The Sky-Norman Greenbaum', 'Red Red Wine-UB40',
  'Brown-Eyed Girl', 'Seasons In The Sun-Terry Jacks', 'Father Figure — George Michael5'])]);
check('a bare-hyphen artist splits in a book that does it', habit.songs.map(s => [s.title, s.artist]), [
  ['Spirit In The Sky', 'Norman Greenbaum'], ['Red Red Wine', 'UB40'], ['Brown-Eyed Girl', ''],
  ['Seasons In The Sun', 'Terry Jacks'], ['Father Figure', 'George Michael']]);
check('…but not in a book where it is rare', bookReport(moogly(['A Hard Rain’s A-Gonna Fall', 'Hound Dog-Shake Rattle and Roll',
  'Bye Bye Blackbird-Side by Side', ...Array.from({ length: 30 }, (_, i) => `Tune ${'abcdefghijklmnopqrstuvwxyzABCD'[i]}x`)])).songs[0].title, 'A Hard Rain’s A-Gonna Fall');
check('a page number keeps a band’s digits', tidySong({ title: 'Harder To Breathe', artist: 'Maroon 5' }, { printedPage: 12 }).artist, 'Maroon 5');
const tusc = bookReport(moogly(['People are Strange (The Doors)', 'JAMMIN’ (Bob Marley)', 'I Wanna Be Like You (from The Jungle Book)',
  'Love Me Like You (Magic Numbers)', '"Pennies From Heaven"']));
check('an artist in brackets, in a book that does it', tusc.songs.map(s => [s.title, s.artist]), [
  ['People are Strange', 'The Doors'], ['JAMMIN’', 'Bob Marley'], ['I Wanna Be Like You (from The Jungle Book)', ''],
  ['Love Me Like You', 'Magic Numbers'], ['Pennies From Heaven', '']]);

// One song much longer than the rest has swallowed the ones after it, even
// when the average is fine.
const swallowed = bookReport([...moogly(['Yellow', 'Hello', 'Imagine', 'Jolene', 'Respect', 'Wonderwall']), ...verses(), page([['more words [C] here']])]);
check('one song running long: check the list', [swallowed.verdict, swallowed.reasons.join(' ')],
  ['check', '1 song runs longer than 4 pages — “Wonderwall” is 6 — so songs after it may have run together.']);

// ---- 11. a sheet from a batch of separate PDFs --------------------------------
// Farmers Market: a 24pt title, the writer under it, chord diagrams drawn in a
// symbol font at 80pt, then the chart with chords above the lyrics.
const sheet = [page([['Ain’t She Sweet?', 24], ['by Milton Ager and Jack Yellen (1927)', 10], ['CLH a KN%df', 80],
  ['Intro: C . E7 . | A7 . A7+5 |', 14], ['C . C#dim7 . | Dm . G7', 14], ['Ain’t she sweet? See her com-in’ down the street', 14]])];
const info = sheetInfo(sheet, [], "Ain't She Sweet - v2d.pdf");
check('a sheet’s title and writer come off the page', [info.title, info.artist, info.fromPage], ['Ain’t She Sweet?', 'Milton Ager and Jack Yellen', true]);
const noted = sheetInfo(sheet, [], "z Ain't She Sweet - shorter - (key of C) - v5.pdf");
check('…the file name adds its note and key, not its sort prefix or version', [noted.title, noted.key], ['Ain’t She Sweet? (shorter)', 'C']);
const untitled = sheetInfo([page([['ripple chart', 12], ['[G] words', 12]])], [], 'Ripple - v7d.pdf');
check('…and with no title on the page, the file name is the title', [untitled.title, untitled.fromPage], ['Ripple', false]);
check('a batch of sheets looks right when titles were read', sheetsReport([info, noted]).verdict, 'ok');
check('…and says to check when many were not', sheetsReport([info, untitled]).verdict, 'check');
check('a long PDF is a book, not a sheet', sheetInfo(Array.from({ length: 13 }, () => sheet[0]), [], 'x.pdf'), null);

// ---- 14. the page picker ------------------------------------------------------
check('marks make songs: a left-out page is in none, a page turn joins',
  songsFromMarks(['skip', 'same', 'same', 'start', 'skip', 'same', 'start'], { 4: { title: 'Four', artist: 'A', key: '' } })
    .map(s => [s.title, s.pages, s.firstPage, s.lastPage]),
  [['Page 2', [2, 3], 2, 3], ['Four', [4, 6], 4, 6], ['Page 7', [7], 7, 7]]);
check('a page’s title: the largest line near the top, its "by" line the artist',
  pageTitle(page([['BOOM CHICKA BOOM', 16], ['by Traditional', 10], ['I said a boom chicka boom'], ['I said a boom chicka boom']]).lines),
  { title: 'BOOM CHICKA BOOM', artist: 'Traditional', key: '' });
check('…a version number and key tidied as in the report',
  pageTitle(page([['Feliz Navidad (Key of D) v2', 16], ['Feliz Navidad, prospero año'], ['y felicidad']]).lines),
  { title: 'Feliz Navidad', artist: '', key: 'D' });
check('…but no title when nothing stands out, or the text is garbled', [
  pageTitle(page([['Feliz Navidad, prospero año'], ['y felicidad'], ['I wanna wish you']]).lines),
  pageTitle(page([['ĐƌŽƐƐƚŚĞhŶŝǀĞƌƐĞ', 16], ['words'], ['more words']]).lines),
  pageTitle(page([['OFGauld', 16], ['words'], ['more words']]).lines)], [null, null, null]);
// A book the report could split starts from its split; one it couldn't starts
// with every page a song.
const fromSplit = pickerStart(bookReport(book), book);
check('the picker starts from the report’s songs', [fromSplit.marks, fromSplit.titles[2].title], [['start', 'start', 'start', 'start'], 'Auld Lang Syne']);
const overBook = [overPage('One'), overPage('Two'), overPage('Three'), overPage('Four')];
const fromNothing = pickerStart(bookReport(overBook), overBook);
check('…and a book it couldn’t, with every page a song, titled from the page',
  [fromNothing.marks, songsFromMarks(fromNothing.marks, fromNothing.titles).map(s => s.title)],
  [['start', 'start', 'start', 'start'], ['One', 'Two', 'Three', 'Four']]);
// Farmers Market: chords above the lyrics, but a bookmark for every song.
const sheetOf = (title, words) => page([T(title), ['C        G       Am'], [`${words} in the morning`], ['F        C'], [`and ${words} at night`]]);
const marked = [sheetOf('Aloha Week Hula', 'hula'), page([['G     C'], ['more of it']]), sheetOf('Blue Hawaii', 'moon'), page([['Contents', 16], ['Aloha Week Hula 1']])];
const fromMarks = pickerStart(bookReport(marked, [
  { title: 'Aloha Week Hula', page: 1, top: null }, { title: 'Blue Hawaii', page: 3, top: null }, { title: 'Contents', page: 4, top: null }]), marked);
check('…or from its bookmarks, leaving the contents out', fromMarks.marks, ['start', 'same', 'start', 'skip']);

// "Beginning Ukulele Songbook": ten pages, chords above the lyrics, a song a
// page. Not one song, though it can't be split as charts.
const shortBook = [page([['Index', 16], ['1. Pearly Shells'], ['2. Edelweiss']]), overPage('Pearly Shells'), sheetOf('Edelweiss', 'blossom'), sheetOf('Tiny Bubbles', 'wine')];
check('a short PDF with songs on several pages is a book', isBook(bookReport(shortBook)), true);
check('…and the picker leaves its index out', pickerStart(bookReport(shortBook), shortBook).marks, ['skip', 'start', 'start', 'start']);
check('…one song over two pages is not', isBook(bookReport([overPage('Ripple'), page([['G     C'], ['more of it']])])), false);
check('…nor is one song with a picture page', isBook(bookReport([overPage('Ripple'), page([])])), false);

// Which pages read as charts, and the charts made of the songs picked.
const mixedBook = [
  page([['Ukulele Lady', 16], ['by Richard Whiting'], ['[C] I saw the splendor of the [A7] moonlight'], ['CHORUS', 18], ['[F] Ukulele lady, [C] like a lady']]),
  page([['[G] if you like a ukulele [C] lady'], ['[C] she\'ll be true to you']]),
  overPage('Pearly Shells'),
  page([['Happy Days', 12], ['(C) Sunday Monday (G) happy days'], ['(F) Tuesday Wednesday (C) happy days'], ['(G) Thursday Friday (C) happy days']]),
];
check('a page reads as a chart with chords in its lyrics, square or round', pageChances(mixedBook), [true, true, false, true]);
const picked = songsFromMarks(['start', 'same', 'start', 'start'], { 1: { title: 'Ukulele Lady' }, 3: { title: 'Pearly Shells' }, 4: { title: 'Happy Days' } });
const charts = pickedCharts(mixedBook, picked);
check('a picked song is one chart over its pages, title and writer off the top, a big CHORUS kept',
  [charts[0].artist, charts[0].text.split('\n')],
  ['Richard Whiting', ['[C] I saw the splendor of the [A7] moonlight', 'CHORUS', '[F] Ukulele lady, [C] like a lady', '', '[G] if you like a ukulele [C] lady', '[C] she\'ll be true to you']]);
check('…a page of chords over lyrics stays a PDF', charts[1], null);
check('…round brackets become square, and a title in lyric size comes off too',
  charts[2].text.split('\n')[0], '[C] Sunday Monday [G] happy days');
check('…and a song asked for as pages stays pages', pickedCharts(mixedBook, [{ ...picked[0], chart: false }]), [null]);

// Stewart Greenhill's book: two columns, the title over the artist in a bold
// font of their own, the chords drawn as shapes (so no chords in the text at
// all). Built from pdf.js items, as the import reads it.
const run = (str, x, y, width, height, fontName) => ({ str, transform: [1, 0, 0, 1, x, y], width, height, fontName });
const lyric = (str, x, y) => run(str, x, y, 150, 12, 'f2');
const sgPage = (title, artist) => ({ links: [], lines: linesFromItems([
  run(title, 72, 799, 167, 15, 'f1'), lyric(`Nothing’s gonna change ${title}`, 311, 797),
  run(artist, 113, 781, 85, 16, 'f1'), lyric(`Words are flowing out like ${title}`, 28, 739),
  lyric(`Endless rain into ${title}`, 28, 719), lyric(`They slither wildly as ${title}`, 28, 700),
]) });
const merged = sgPage('Across The Universe', 'The Beatles').lines[0];
check('two columns level with each other are one line, kept in pieces',
  [merged.text, merged.pieces.map(pc => pc.text), merged.font],
  ['Across The UniverseNothing’s gonna change Across The Universe', ['Across The Universe', 'Nothing’s gonna change Across The Universe'], 'f1']);
check('…a line in one column has no pieces',
  linesFromItems([run('Words are ', 28, 739, 60, 12, 'f2'), run('flowing', 89, 739, 40, 12, 'f2')])[0].pieces, undefined);
const sgBook = [
  ...[['Africa', 'Toto'], ['Act Yr Age', 'Bluejuice'], ['Atomic', 'Blondie'], ['Babooshka', 'Kate Bush'], ['Baker Street', 'Gerry Rafferty'],
    ['Blue Bayou', 'Roy Orbison'], ['Big Yellow Taxi', 'Joni Mitchell'], ['Bad Habits', 'Billy Field'], ['Aquarius', 'Galt Macdermot'], ['Anything Goes', 'Cole Porter']]
    .map(([t, a]) => sgPage(t, a)),
  { links: [], lines: linesFromItems([lyric('Once upon a time I was falling in love', 28, 797), lyric('Nothing I can do', 28, 777)]) },
  { links: [], lines: [] },
];
const sgStart = pickerStart(bookReport(sgBook), sgBook);
check('a book of titles over artists: the first heading line is the title, the next the artist',
  [sgStart.titles[1], sgStart.titles[2].title], [{ title: 'Africa', artist: 'Toto', key: '' }, 'Act Yr Age']);
check('…a page with no title, or no text, is the song before it carried over',
  sgStart.marks.slice(9), ['start', 'same', 'same']);

// Cutting: the pages asked for, in that order, and nothing else.
const src = await PDFDocument.create();
for (const w of [100, 200, 300]) src.addPage([w, 400]);
const cutter = await openBook(await src.save());
const out = await PDFDocument.load(await cutter.cut([3, 1]));
check('a song cut from a book has just its pages', [cutter.pageCount, out.getPages().map(pg => pg.getWidth())], [3, [300, 100]]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
