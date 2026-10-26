// MusicXML import: chords, lyrics, tab and details out of a score.
//
// The scores here are built by hand, small enough to read, each shaped like
// what MuseScore writes: harmony before the note it sits on, lyric syllables
// marked begin/middle/end, stacked verses numbered 1 and 2, a TAB staff with
// its tuning in staff-details, and system breaks as <print new-system>.
//
// Run: node scripts/musicXmlCheck.mjs
import { zipSync, strToU8 } from 'fflate';
import { parseMusicXml, readMxl, harmonyName, parseXml } from '../src/utils/musicXml.js';
import { isTabLine, isChordLine } from '../src/utils/visualImport.js';
import { convertToBrackets } from '../src/utils/chordStyle.js';
import { detectChords } from '../src/utils/chordDetect.js';

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

// ---- builders ------------------------------------------------------------------
const harmony = (step, kind, { alter, text, offset, bass, degrees = [] } = {}) =>
  `<harmony><root><root-step>${step}</root-step>${alter ? `<root-alter>${alter}</root-alter>` : ''}</root>` +
  `<kind${text != null ? ` text="${text}"` : ''}>${kind}</kind>` +
  (bass ? `<bass><bass-step>${bass}</bass-step></bass>` : '') +
  degrees.map(([v, a, t]) => `<degree><degree-value>${v}</degree-value><degree-alter>${a}</degree-alter><degree-type>${t}</degree-type></degree>`).join('') +
  (offset ? `<offset>${offset}</offset>` : '') + `</harmony>`;
const lyric = (n, syl, text) => `<lyric number="${n}"><syllabic>${syl}</syllabic><text>${text}</text></lyric>`;
const note = (lyrics = '', dur = 1) => `<note><pitch><step>G</step><octave>4</octave></pitch><duration>${dur}</duration><type>quarter</type>${lyrics}</note>`;
const rest = (dur = 1) => `<note><rest/><duration>${dur}</duration></note>`;
const tabNote = (string, fret, { chord = false, dur = 1 } = {}) =>
  `<note>${chord ? '<chord/>' : ''}<pitch><step>C</step><octave>3</octave></pitch><duration>${dur}</duration>` +
  `<notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations></note>`;
const score = (head, parts) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">${head}
<part-list>${parts.map((_, i) => `<score-part id="P${i + 1}"><part-name>Part ${i + 1}</part-name></score-part>`).join('')}</part-list>
${parts.map((m, i) => `<part id="P${i + 1}">${m.map((x, j) => `<measure number="${j + 1}">${x}</measure>`).join('')}</part>`).join('\n')}
</score-partwise>`;

const ATTRS = `<attributes><divisions>1</divisions><key><fifths>1</fifths><mode>major</mode></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`;
const UKE_TAB_ATTRS = `<attributes><divisions>1</divisions><clef><sign>TAB</sign></clef><staff-details><staff-lines>4</staff-lines>` +
  ['G', 'C', 'E', 'A'].map((s, i) => `<staff-tuning line="${i + 1}"><tuning-step>${s}</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>`).join('') +
  `</staff-details></attributes>`;

// ---- 1. a lead sheet: two stacked verses, then a chorus -----------------------
const LEAD = score(
  `<work><work-title>Hello Song</work-title></work><identification><creator type="composer">Pat Writer</creator></identification>`,
  [[
    ATTRS + `<direction><direction-type><words>Verse</words></direction-type><sound tempo="96"/></direction>` +
      harmony('G', 'major') + note(lyric(1, 'begin', 'Hel') + lyric(2, 'begin', 'Good')) +
      note(lyric(1, 'end', 'lo') + lyric(2, 'end', 'bye')) +
      harmony('C', 'major') + note(lyric(1, 'single', 'there') + lyric(2, 'single', 'now')),
    harmony('D', 'dominant') + note(lyric(1, 'single', 'friend') + lyric(2, 'single', 'pal')) + rest() + rest(),
    `<print new-system="yes"/><direction><direction-type><rehearsal>Chorus</rehearsal></direction-type></direction>` +
      harmony('E', 'minor') + note(lyric(1, 'single', 'Sing')) + note(lyric(1, 'begin', 'a')) +
      harmony('C', 'major') + note(lyric(1, 'end', 'long')),
    harmony('D', 'major') + note(lyric(1, 'single', 'now')) + rest() + rest(),
  ]],
);
const lead = parseMusicXml(LEAD);
check('title', lead.metadata.title, 'Hello Song');
check('composer goes to artist', lead.metadata.artist, 'Pat Writer');
check('key from one sharp, major', lead.metadata.key, 'G');
check('time signature', lead.metadata.timeSig, '3/4');
check('tempo from <sound>', lead.metadata.tempo, '96');
const leadBr = convertToBrackets(lead.text);
check('lead sheet in brackets', leadBr, [
  'Verse',
  '[G]Hello [C]there [D7]friend',
  '',
  '[G]Goodbye [C]now [D7]pal',
  '',
  'Chorus',
  '[Em]Sing a[C]long [D]now',
].join('\n'));
check('chords found', detectChords(leadBr), ['G', 'C', 'D7', 'Em', 'D']);
check('stored as chords over lyrics', /^G\s+C\s+D7$/m.test(lead.text), true);

// ---- 2. no system breaks: four bars a line -------------------------------------
const bars = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? ATTRS : '') + harmony('ABCDEFG'[i % 7], 'major') + note(lyric(1, 'single', `w${i + 1}`)) + rest() + rest());
const plain = convertToBrackets(parseMusicXml(score('', [bars(6)])).text);
check('four bars a line without system breaks', plain, '[A]w1 [B]w2 [C]w3 [D]w4\n[E]w5 [F]w6');

// ---- 3. an instrumental line, and a chord between words ------------------------
const INSTR = score('', [[
  ATTRS + harmony('G', 'major') + rest() + harmony('C', 'major') + rest() + harmony('D', 'major') + rest(),
  `<print new-system="yes"/>` + harmony('G', 'major') + note(lyric(1, 'single', 'Words')) + rest() + harmony('C', 'major', { offset: 0 }) + note(lyric(1, 'single', 'here')),
]]);
check('chords with no words become a chord line', convertToBrackets(parseMusicXml(INSTR).text), '[G] [C] [D]\n\n[G]Words [C]here');

// A change on a rest, with no word under it: room for its name, so the next
// chord stays over its own word in chords-over-lyrics.
const REST = score('', [[ATTRS + harmony('G', 'major') + note(lyric(1, 'single', 'Sing')) + harmony('A', 'minor-seventh') + rest() + harmony('D', 'major') + note(lyric(1, 'single', 'now'))]]);
const restText = parseMusicXml(REST).text;
check('chord on a rest leaves room', convertToBrackets(restText), '[G]Sing [Am7]    [D]now');
check('and the next chord sits over its word', restText.split('\n')[1].indexOf('now'), restText.split('\n')[0].indexOf('D'));

// Parts counting time in different units still line up: chords in a part at
// 4 divisions a beat, lyrics in one at 1.
const D4 = `<attributes><divisions>4</divisions></attributes>`;
const twoParts = score('', [
  [ATTRS + note(lyric(1, 'single', 'one')) + note(lyric(1, 'single', 'two')) + note(lyric(1, 'single', 'three'))],
  [D4 + harmony('G', 'major') + `<note><rest/><duration>4</duration></note>` + harmony('C', 'major') + `<note><rest/><duration>8</duration></note>`],
]);
check('chords and lyrics from parts with different divisions', convertToBrackets(parseMusicXml(twoParts).text), '[G]one [C]two three');

// ---- 4. chord spellings ---------------------------------------------------------
const H = (xml) => harmonyName(parseXml(xml).children[0]);
check('minor seventh', H(harmony('A', 'minor-seventh')), 'Am7');
check('flat root', H(harmony('B', 'major', { alter: -1 })), 'Bb');
check('slash chord', H(harmony('C', 'major', { bass: 'G' })), 'C/G');
check('half-diminished', H(harmony('B', 'half-diminished')), 'Bm7b5');
check('sus4 with an added 7 reads 7sus4', H(harmony('D', 'suspended-fourth', { degrees: [[7, 0, 'add']] })), 'D7sus4');
check('altered ninth', H(harmony('G', 'dominant', { degrees: [[9, -1, 'alter']] })), 'G7b9');
check('add9', H(harmony('C', 'major', { degrees: [[9, 0, 'add']] })), 'Cadd9');
check('the typed spelling wins when Cue reads it', H(harmony('C', 'major-seventh', { text: 'maj7' })), 'Cmaj7');
check('a typed spelling Cue cannot read falls back', H(harmony('C', 'major-seventh', { text: 'Δ7' })), 'Cmaj7');
check('no chord', H(`<harmony><root><root-step>C</root-step></root><kind>none</kind></harmony>`), 'N.C.');
check('every built name is a chord to Cue',
  ['minor-seventh', 'dominant', 'major-seventh', 'half-diminished', 'diminished-seventh', 'suspended-fourth', 'major-sixth', 'dominant-ninth', 'augmented', 'power']
    .map(k => H(harmony('F', k, { alter: 1 }))).every(isChordLine), true);

// ---- 5. tab ------------------------------------------------------------------------
const TAB = score('<work><work-title>Riff</work-title></work>', [
  [ATTRS + harmony('C', 'major') + note(lyric(1, 'single', 'Play')) + rest() + rest(), harmony('G', 'major') + note(lyric(1, 'single', 'on')) + rest() + rest()],
  [UKE_TAB_ATTRS + tabNote(3, 0) + tabNote(2, 0) + tabNote(1, 3), tabNote(4, 0) + tabNote(3, 2, { chord: true }) + tabNote(2, 3, { chord: true }) + tabNote(1, 2, { chord: true }) + rest(2)],
]);
const tab = parseMusicXml(TAB);
const tabLines = tab.text.split('\n').filter(l => /^[A-Ga-g]\|/.test(l));
check('tab: one line per string, highest on top', tabLines.map(l => l[0]), ['A', 'E', 'C', 'G']);
check('tab: frets in their columns', tabLines, [
  'A|-----3-|-2----|',
  'E|---0---|-3----|',
  'C|-0-----|-2----|',
  'G|-------|-0----|',
]);
check('tab: every line is tab to Cue', tabLines.every(isTabLine), true);
check('tab: no line reads as a chord', tabLines.some(isChordLine), false);
// One short bar on its own: "A|-2-|" has no run of four, and an empty string
// "G|---|" would read as the chord G. Padded so both are tab.
const short = parseMusicXml(score('', [[UKE_TAB_ATTRS + tabNote(1, 2)]])).text.split('\n');
check('short bar padded to tab', short, ['A|-2----|', 'E|------|', 'C|------|', 'G|------|']);
check('short bar: every line is tab', short.every(isTabLine), true);
check('tab: the chords around it are still found', detectChords(convertToBrackets(tab.text)), ['C', 'G']);

// Guitar: six strings, the high E written "e".
const GTR_ATTRS = `<attributes><divisions>1</divisions><clef><sign>TAB</sign></clef><staff-details><staff-lines>6</staff-lines>` +
  ['E', 'A', 'D', 'G', 'B', 'E'].map((s, i) => `<staff-tuning line="${i + 1}"><tuning-step>${s}</tuning-step></staff-tuning>`).join('') + `</staff-details></attributes>`;
const gtr = parseMusicXml(score('', [[GTR_ATTRS + tabNote(1, 12) + tabNote(6, 0)]]));
check('guitar tab: names, two-digit fret padded', gtr.text.split('\n'), [
  'e|-12------|', 'B|---------|', 'G|---------|', 'D|---------|', 'A|---------|', 'E|----0----|',
]);
check('guitar tab: every line is tab', gtr.text.split('\n').every(isTabLine), true);

// ---- 6. .mxl -------------------------------------------------------------------------
const container = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="score/song.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`;
const mxl = zipSync({ 'META-INF/container.xml': strToU8(container), 'score/song.musicxml': strToU8(LEAD) });
check('mxl: the score named in container.xml', parseMusicXml(readMxl(mxl)).metadata.title, 'Hello Song');
const bare = zipSync({ 'other.musicxml': strToU8(LEAD) });
check('mxl without a container still finds the score', parseMusicXml(readMxl(bare)).metadata.title, 'Hello Song');

// ---- 7. what it refuses ----------------------------------------------------------------
const err = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
check('timewise is reported', /time-wise/.test(err(() => parseMusicXml('<score-timewise/>'))), true);
check('not a score', err(() => parseMusicXml('<html></html>')), 'This file is not a MusicXML score.');
check('nothing Cue can use', err(() => parseMusicXml(score('', [[ATTRS + note() + note()]]))), 'Found no chords, lyrics or tab in this MusicXML file.');
check('title falls back to the file name', parseMusicXml(score('', [[ATTRS + harmony('G', 'major') + note()]]), { filename: 'My Tune.mxl' }).metadata.title, 'My Tune');

// ---- 8. the XML reader -------------------------------------------------------------------
const x = parseXml(`<a b="1 &gt; 0" c='q'>x &amp; y<!-- no --><d/><![CDATA[<raw>]]></a>`).children[0];
check('xml: attributes, entities', [x.attrs.b, x.attrs.c], ['1 > 0', 'q']);
check('xml: text with comments and CDATA', x.text, 'x & y<raw>');
check('xml: self-closing child', x.children.map(c => c.name), ['d']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
