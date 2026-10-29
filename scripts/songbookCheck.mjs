// Splitting a songbook PDF into songs.
//
// The pages here are built by hand in the shape pdfText's linesFromItems gives
// back, from what the first real book ("DUS modified.pdf") measured: 16pt
// titles, 12pt lyrics, a 10pt footer on every page. Each case is one of the
// ways a book can be laid out.
//
// Run: node scripts/songbookCheck.mjs
import { splitSongbook } from '../src/utils/songbook.js';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
