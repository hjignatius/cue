// Reading a song's details out of the chart itself — the free, exact half.
//
// Howard's real paste turned out to be ChordPro, not the loose website header I
// had assumed:
//
//   {t:Ain't It Funny How Time Slips Away}
//   {artist:Willie Nelson}
//   {key:D}
//   <a href="https://www.youtube.com/watch?v=…" …>https://www.youtube.com/watch?v=…</a>
//
// Every one of those is unambiguous. Asking a model to read them would be paying
// for a judgement nobody needs to make — so this runs first, and the model is
// asked only about what is left. A paste that is proper ChordPro costs nothing
// at all, because no request is sent.
//
// It also reports which LINES it took the values off, so the same offer that
// lifts a website header can take these out too. A directive left in the chart
// is printed and presented; the anchor tag is worse, because it is HTML.

import { timeSigOrEmpty } from './timeSig.js';
import { YOUTUBE_RE, DURATION_RE, TEMPO_RE } from './songMetadata.js';

// ChordPro names its directives twice: a long form and a short one. Cue read
// only the long forms, so {t:…} — the form most ChordPro files in the wild use —
// left the title unset AND the directive sitting in the body as a lyric.
export const DIRECTIVES = {
  t: 'title',        title: 'title',
  a: 'artist',       artist: 'artist',      st: 'artist',  subtitle: 'artist',
  k: 'key',          key: 'key',
  tempo: 'tempo',    bpm: 'tempo',
  duration: 'duration',  length: 'duration',
  time: 'timeSig',   timesig: 'timeSig',
};

export const DIRECTIVE_RE = /^\{\s*([A-Za-z_]+)\s*:\s*([\s\S]*?)\s*\}$/;

// A URL sitting in the text, whether bare or wrapped in an anchor tag. Charts
// copied out of a browser bring the markup with them.
const URL_IN_LINE = /https?:\/\/[^\s"'<>]+/;

function validate(field, value) {
  switch (field) {
    case 'timeSig':  return timeSigOrEmpty(value);
    case 'duration': return DURATION_RE.test(value) ? value : '';
    case 'tempo':    return TEMPO_RE.test(value) ? value : '';
    default:         return value;
  }
}

// Returns { fields, remove } — the values found, and the exact text of the lines
// they came off, for planLineRemoval to match the same way it matches a model's
// proposals. Only a line that is NOTHING BUT a consumed directive or a link is
// offered for removal; a directive Cue doesn't read ({c:}, {sos}, {soc}) is part
// of the song and is never touched.
export function readChartMetadata(text) {
  const fields = {};
  const remove = [];

  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const d = trimmed.match(DIRECTIVE_RE);
    if (d) {
      const field = DIRECTIVES[d[1].toLowerCase()];
      const value = d[2].trim();
      // An unknown directive, or an empty one like "{c: }", stays where it is.
      if (!field || !value) continue;
      const kept = validate(field, value);
      if (!kept) continue;                 // present but not what the field holds
      if (!fields[field]) fields[field] = kept;
      remove.push(trimmed);
      continue;
    }

    const link = youtubeLineInfo(trimmed);
    if (link) {
      if (!fields.youtubeUrl) fields.youtubeUrl = link.url;
      if (link.isOnly) remove.push(trimmed);
    }
  }

  return { fields, remove };
}

// The YouTube link on one line, if there is one.
//
// `isOnly` says the line carries NOTHING but that link and the markup around it,
// which is what makes it safe to take out: a URL mentioned inside a lyric is
// part of the lyric and must be read without being cut.
//
// Shared with parseCho, so a .cho file and a pasted song treat a link line the
// same way.
export function youtubeLineInfo(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;
  const url = trimmed.match(URL_IN_LINE)?.[0];
  if (!url || !YOUTUBE_RE.test(url)) return null;
  return { url, isOnly: isOnlyLink(trimmed, url) };
}

// True when the line carries nothing but the link and the markup around it.
function isOnlyLink(line, url) {
  const stripped = line
    .replace(/<\/?a\b[^>]*>/gi, '')   // the anchor tags themselves
    .split(url).join('')              // every copy of the URL (href AND text)
    .trim();
  return stripped === '';
}
