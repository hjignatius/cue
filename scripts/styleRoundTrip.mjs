// Does styling lyrics in OVER-LYRICS mode leave every chord over its own word?
//
// The claim under test is not "it usually looks right". It is that apply and
// clear are exact inverses, and that a chord never moves to a different
// syllable — because in over-lyrics a chord's column IS which word it is sung
// on, and a chord that slides one word to the left is wrong in a way you may
// not notice until you are playing the song.
//
// Run: node scripts/styleRoundTrip.mjs
import { styleRange } from '../src/utils/styleText.js';
import { isChordLine } from '../src/utils/visualImport.js';
import { convertToBrackets } from '../src/utils/chordStyle.js';
import { parseChordPro, styleSegments } from '../src/utils/chordPro.js';

const SONGS = {
  'plain verse': [
    'G           D          Em         C',
    'Yesterday, all my troubles seemed so far away',
  ].join('\n'),
  'chords over mid-word': [
    'C        G      Am',
    'Wonderful tonight my love',
  ].join('\n'),
  'chord-only line above': [
    'Bbmaj7  Eb6',
    'Fm7     Bb7',
    'I love you more than words',
  ].join('\n'),
  // A song that ALREADY carries styling. Its chord line is padded past the
  // markup, which is what the editor itself produces — re-padding the chord line
  // by the inserted characters is the whole point of over-mode styling. A chord
  // parked in the middle of a {c=...} marker is a broken song before anything
  // here touches it, so it is not what this should be measuring.
  'already coloured': [
    '           G         C',
    '{c=#dc2626}Hello{/c} darkness my old friend',
  ].join('\n'),
  'two verses': [
    'G        D',
    'One two three four',
    '',
    'C        Em',
    'Five six seven eight',
  ].join('\n'),
};

// Where does each chord sit, in words? Column -> the index of the word it is
// over, on the lyric line beneath. This is the thing that must not change.
function chordWordMap(text) {
  const lines = text.split('\n');
  const map = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!isChordLine(lines[i])) continue;
    const lyric = lines[i + 1];
    // Only a chord line sitting over REAL WORDS has a word to be over. A chord
    // line above another chord line is its own thing and moves with the block.
    if (!lyric || !lyric.trim() || isChordLine(lyric)) continue;
    for (const c of lines[i].matchAll(/\S+/g)) {
      const upto = lyric.slice(0, c.index).replace(/\{c=[^}]+\}|\{\/c\}|\*\*|\*/g, '');
      map.push(`${c[0]}@word${upto.split(/\s+/).filter(Boolean).length + 1}`);
    }
  }
  return map.join(' ');
}

// A chord token must survive as ONE token. Splitting "Bb7" into "Bb 7" is worse
// than moving it: the song now names a chord that was never in it.
function chordTokens(text) {
  return text.split('\n').filter(isChordLine).map(l => l.trim().split(/\s+/).join(',')).join(' | ');
}

// ---- Are the fixtures themselves sound? -------------------------------------
//
// Twice now a failure was my test data rather than the code: a chord parked in
// the middle of a {c=...} marker, which is a broken song before anything touches
// it. Check the fixtures first, and say so plainly, so a bad song can never be
// read as a bad result.
{
  let bad = 0;
  for (const [name, song] of Object.entries(SONGS)) {
    const lines = song.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (!isChordLine(lines[i]) || isChordLine(lines[i + 1]) || !lines[i + 1].trim()) continue;
      const lyric = lines[i + 1];
      const spans = [...lyric.matchAll(/\{c=[^}]*\}|\{\/c\}|\*\*/g)].map(m => [m.index, m.index + m[0].length]);
      for (const c of lines[i].matchAll(/\S+/g)) {
        const inside = spans.find(([s0, e0]) => c.index > s0 && c.index < e0);
        if (inside) {
          console.log(`BAD FIXTURE  ${name}: chord "${c[0]}" at column ${c.index} sits inside the markup at ${inside[0]}-${inside[1]} of ${JSON.stringify(lyric)}`);
          bad++;
        }
      }
    }
  }
  if (bad) { console.log(`\n${bad} bad fixture(s) — fix the songs, not the code`); process.exit(1); }
}

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; return; }
  fail++;
  console.log(`FAIL  ${name}`);
  if (detail) console.log(detail.split('\n').map(l => '        ' + l).join('\n'));
};

// Every selection that covers whole words on a lyric line — including the
// "rounded outward to a whole run" shape the Preview produces.
function selections(text) {
  const out = [];
  const lines = text.split('\n');
  let base = 0;
  for (const ln of lines) {
    if (ln && !/^\s*[A-G][#b]?(maj|min|m|sus|dim|aug|add)?\d*(\/[A-G][#b]?)?(\s+\S+)*\s*$/.test(ln)) {
      for (const w of ln.matchAll(/\S+/g)) {
        out.push([base + w.index, base + w.index + w[0].length, `"${w[0]}"`]);
      }
      // whole line, the coarsest thing a drag can produce
      out.push([base, base + ln.length, 'whole line']);
    }
    base += ln.length + 1;
  }
  return out;
}

for (const [songName, song] of Object.entries(SONGS)) {
  const before = chordWordMap(song);
  for (const [a, b, what] of selections(song)) {
    for (const op of ['bold', 'italic', 'color']) {
      const applied = styleRange(song, op, '#2563eb', a, b, true);
      if (!applied) continue;
      const after = chordWordMap(applied.text);
      check(`${songName} · ${op} ${what} · chords keep their words`, before === after,
        `before: ${before}\nafter:  ${after}\ntext:\n${applied.text}`);
      check(`${songName} · ${op} ${what} · no chord is split in two`,
        chordTokens(song) === chordTokens(applied.text),
        `before: ${chordTokens(song)}\nafter:  ${chordTokens(applied.text)}\ntext:\n${applied.text}`);

      // Apply the same op again over the new range: bold/italic toggle off,
      // colour re-colours. Only the toggling pair can round-trip to the source.
      if (op === 'bold' || op === 'italic') {
        const undone = styleRange(applied.text, op, '#2563eb', applied.selA, applied.selB, true);
        check(`${songName} · ${op} ${what} · apply then undo is byte-identical`,
          undone && undone.text === song,
          undone ? `got:\n${undone.text}\nwant:\n${song}` : 'second apply returned null');
      }
    }
  }
}

// ---- What the renderer will actually draw -----------------------------------
//
// The text can be right and the screen still wrong. Over-lyrics draws one column
// per segment, and an empty cell draws a single space so a chord with no lyric
// under it keeps its column — so a segment that is nothing but markup becomes a
// one-character column and shifts the line, chord row and all.
//
// Howard found it the way you only can by using it: "if the first character of a
// string has a chord over it, changing the color or format moves the whole line
// by one character."
const columns = (text) =>
  parseChordPro(convertToBrackets(text))
    .filter(l => l.type === 'chords')
    .map(l => styleSegments(l.segments).map(sg => `${sg.chord || ''}/${sg.styledRuns.map(r => r.text).join('')}`).join('|'))
    .join(' ~ ');

for (const [songName, song] of Object.entries(SONGS)) {
  const before = columns(song);
  for (const [a, b, what] of selections(song)) {
    for (const op of ['bold', 'italic', 'color']) {
      const applied = styleRange(song, op, '#2563eb', a, b, true);
      if (!applied) continue;
      check(`${songName} · ${op} ${what} · draws the same columns`, before === columns(applied.text),
        `before: ${before}\nafter:  ${columns(applied.text)}\ntext:\n${applied.text}`);
    }
  }
}

// ---- Toggling the way the PREVIEW does --------------------------------------
//
// The checks above toggle using the range styleRange hands back, which covers the
// markup it just inserted. The Preview cannot do that: it re-derives the range
// from the rendered runs, and the markers are not rendered — so it asks to
// un-style the WORD while the `**` or `{c=...}` sit just outside.
//
// That is how Howard met it: "the eraser is intermittent for both the text and
// preview sides." It worked whenever the selection happened to include the
// markers, and pressing bold twice on one word gave ****Hello**** rather than
// plain text.
for (const [songName, song] of Object.entries(SONGS)) {
  for (const [a, b, what] of selections(song)) {
    const word = song.slice(a, b);
    if (!word.trim() || /\{|\*/.test(word)) continue;   // already-styled fixtures aside
    for (const op of ['bold', 'italic']) {
      const on = styleRange(song, op, null, a, b, true);
      if (!on) continue;
      // Find the same word again and ask to toggle it off, markers excluded.
      const at = on.text.indexOf(word, Math.max(0, a - 12));
      if (at < 0) { check(`${songName} · ${op} ${what} · word survives styling`, false, on.text); continue; }
      const off = styleRange(on.text, op, null, at, at + word.length, true);
      check(`${songName} · ${op} ${what} · toggles off from a Preview-shaped range`,
        off && off.text === song,
        off ? `got:\n${off.text}\nwant:\n${song}` : 'toggling off returned null');
    }
    // Colour, then erase.
    const col = styleRange(song, 'color', '#2563eb', a, b, true);
    if (!col) continue;
    const at = col.text.indexOf(word, Math.max(0, a - 12));
    if (at < 0) { check(`${songName} · color ${what} · word survives colouring`, false, col.text); continue; }
    const cleared = styleRange(col.text, 'clear', null, at, at + word.length, true);
    check(`${songName} · erase ${what} · returns the song byte-identical`,
      cleared && cleared.text === song,
      cleared ? `got:\n${cleared.text}\nwant:\n${song}` : 'clear returned null');
  }
}

// ---- Markup stays flat and balanced ----------------------------------------
//
// Nesting is what made the eraser peel one layer per press. A colour applied over
// a row that already held a coloured word used to produce
// {c=#16a34a}Hello {c=#dc2626}darkness{/c} my{/c} old friend, and no single press
// could clear that. So: after any op, every line's markers must be balanced and
// must never nest, and one erase must always finish the job.
function markupFaults(text) {
  const bad = [];
  text.split('\n').forEach((line, n) => {
    let depth = 0, max = 0, i = 0, bold = 0;
    while (i < line.length) {
      if (line.startsWith('**', i)) { bold++; i += 2; continue; }
      const m = /^\{c=[^}]*\}/.exec(line.slice(i));
      if (m) { depth++; max = Math.max(max, depth); i += m[0].length; continue; }
      if (line.startsWith('{/c}', i)) { depth--; i += 4; continue; }
      i++;
    }
    if (depth !== 0) bad.push(`line ${n}: ${depth > 0 ? 'unclosed' : 'orphan'} {c=} (${depth})`);
    if (max > 1) bad.push(`line ${n}: colour nested ${max} deep`);
    if (bold % 2) bad.push(`line ${n}: odd number of ** (${bold})`);
  });
  return bad;
}

// Offsets must be recomputed after every edit: the text grows, so a range taken
// from the ORIGINAL song points somewhere else once markup has been inserted.
// (My first version of this check reused them and reported failures that were the
// test's fault, not the code's.)
const lineBoundsAround = (text, needle) => {
  const at = text.indexOf(needle);
  if (at < 0) return null;
  const from = text.lastIndexOf('\n', at) + 1;
  const to = text.indexOf('\n', at);
  return [from, to < 0 ? text.length : to];
};

for (const [songName, song] of Object.entries(SONGS)) {
  for (const [a, b, what] of selections(song)) {
    const word = song.slice(a, b);
    if (!word.trim() || /\{|\*/.test(word)) continue;
    // Colour the word, then colour the WHOLE ROW in a second colour over the top,
    // then erase the row once. Howard's sequence: "I changed one row to green then
    // made some other changes and came back to erase the green."
    const first = styleRange(song, 'color', '#dc2626', a, b, true);
    if (!first) continue;
    const row = lineBoundsAround(first.text, word);
    if (!row) { check(`${songName} · ${what} · word survives colouring`, false, first.text); continue; }
    const wide = styleRange(first.text, 'color', '#16a34a', row[0], row[1], true) || first;

    const faults = markupFaults(wide.text);
    check(`${songName} · recolour ${what} · markup stays flat and balanced`, faults.length === 0,
      `${faults.join('; ')}\ntext:\n${wide.text}`);

    const row2 = lineBoundsAround(wide.text, word);
    const erased = row2 && styleRange(wide.text, 'clear', null, row2[0], row2[1], true);
    const rowAfter = erased && lineBoundsAround(erased.text, word);
    check(`${songName} · erase ${what} · one press removes every colour`,
      erased && rowAfter && !/\{c=|\{\/c\}/.test(erased.text.slice(rowAfter[0], rowAfter[1])),
      erased ? `still coloured:\n${erased.text}` : 'clear returned null');
    check(`${songName} · erase ${what} · and leaves the row's own markup sound`,
      erased ? markupFaults(erased.text).length === 0 : false,
      erased ? `${markupFaults(erased.text).join('; ')}\n${erased.text}` : '');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
