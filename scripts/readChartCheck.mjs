// Reading a song's details out of the chart, without asking a model.
//
// From Howard's real paste: ChordPro directives, including the SHORT forms that
// Cue used to ignore, and a YouTube link wrapped in an anchor tag by the browser
// it was copied from.
//
// Run: node scripts/readChartCheck.mjs

import { readChartMetadata } from '../src/utils/readChart.js';

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

const WILLIE = [
  "{t:Ain't It Funny How Time Slips Away}",
  '{artist:Willie Nelson}',
  '{key:D}',
  '<a href="https://www.youtube.com/watch?v=iZaZqx9v3dU" target="_blank">https://www.youtube.com/watch?v=iZaZqx9v3dU</a>',
  '{c: }',
  '[D]',
  '[D] Well hello there, ',
  "[G] My, it's been a long long [D] time [A] ",
  '{sos}',
  '[D] Well hello there, ',
  '{eos}',
].join('\n');

// ---- 1. his actual paste ---------------------------------------------------
const got = readChartMetadata(WILLIE);
check('every field is read with no model at all', got.fields, {
  title: "Ain't It Funny How Time Slips Away",
  artist: 'Willie Nelson',
  key: 'D',
  youtubeUrl: 'https://www.youtube.com/watch?v=iZaZqx9v3dU',
});
check('and the four lines they came off are offered', got.remove, [
  "{t:Ain't It Funny How Time Slips Away}",
  '{artist:Willie Nelson}',
  '{key:D}',
  '<a href="https://www.youtube.com/watch?v=iZaZqx9v3dU" target="_blank">https://www.youtube.com/watch?v=iZaZqx9v3dU</a>',
]);

// ---- 2. structural directives are part of the song -------------------------
// {c:} spacers, {sos}/{eos} chorus marks, anything Cue does not read.
for (const line of ['{c: }', '{c: Slowly}', '{sos}', '{eos}', '{soc}', '{comment: twice}', '{define: X}']) {
  check(`left alone: ${line}`, readChartMetadata(line).remove, []);
}

// ---- 3. both ChordPro spellings ------------------------------------------
check('short forms', readChartMetadata('{t:T}\n{a:A}\n{k:G}').fields, { title: 'T', artist: 'A', key: 'G' });
check('long forms',  readChartMetadata('{title:T}\n{artist:A}\n{key:G}').fields, { title: 'T', artist: 'A', key: 'G' });
check('subtitle counts as artist', readChartMetadata('{st:A}').fields, { artist: 'A' });
check('spacing and case are tolerated', readChartMetadata('{ Title : T }\n{ARTIST: A}').fields, { title: 'T', artist: 'A' });
check('the first of a repeated directive wins', readChartMetadata('{t:First}\n{t:Second}').fields.title, 'First');

// ---- 4. values are checked, same as everywhere else ------------------------
check('a real time signature', readChartMetadata('{time:6/8}').fields, { timeSig: '6/8' });
check('a duration in the time signature is refused', readChartMetadata('{time:2:24}').fields, {});
check('...and the line is then NOT offered for removal', readChartMetadata('{time:2:24}').remove, []);
check('a tempo', readChartMetadata('{tempo:96}').fields, { tempo: '96' });
check('prose where a tempo belongs is refused', readChartMetadata('{tempo:moderato}').fields, {});
check('an empty directive is not a value', readChartMetadata('{artist: }').fields, {});

// ---- 5. links --------------------------------------------------------------
check('a bare link on its own line', readChartMetadata('https://youtu.be/abc').fields.youtubeUrl, 'https://youtu.be/abc');
check('...is offered for removal', readChartMetadata('https://youtu.be/abc').remove, ['https://youtu.be/abc']);
check('an anchor tag', readChartMetadata('<a href="https://youtu.be/abc">https://youtu.be/abc</a>').fields.youtubeUrl, 'https://youtu.be/abc');
check('a non-YouTube link is ignored', readChartMetadata('https://tabs.example.com/song').fields, {});
// A link inside a lyric is part of the lyric — read it, but never cut the line.
const inLyric = 'Find it at https://youtu.be/abc tonight';
check('a link inside a line is still read', readChartMetadata(inLyric).fields.youtubeUrl, 'https://youtu.be/abc');
check('...but that line is NOT offered', readChartMetadata(inLyric).remove, []);

// ---- 6. nothing to find ----------------------------------------------------
check('a plain chart yields nothing', readChartMetadata('C  Am\nwords here'), { fields: {}, remove: [] });
check('empty text', readChartMetadata(''), { fields: {}, remove: [] });
check('no text', readChartMetadata(), { fields: {}, remove: [] });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
