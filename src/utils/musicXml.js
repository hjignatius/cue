// MusicXML import — .musicxml / .xml, and .mxl (the same file zipped).
//
// MusicXML is sheet music: notes, rhythms, staves. Cue is a chord-and-lyric
// chart, so this takes the parts Cue understands and leaves the notes behind:
//
//   chord symbols  <harmony>, at the beat they fall on
//   lyrics         <lyric> syllables on the melody notes, joined back into words
//   tablature      notes on a TAB staff, by string and fret
//   details        title, composer, key, time signature, tempo
//
// What it can't know is where a LYRIC LINE ends — sheet music has no such
// thing. It breaks where the score starts a new system (<print new-system>),
// which is how the engraver laid the lines out; a score with no system breaks
// falls back to four bars a line. Stacked verses (verse 1 and 2 under the same
// notes) are written out one after the other. Repeats are left as written.
//
// Only score-partwise is read. score-timewise is rare and is reported, not
// guessed at.

import { unzipSync, strFromU8 } from 'fflate';
import { isChordLine } from './visualImport.js';
import { tabStringNames } from './blankTab.js';
import { convertToOver } from './chordStyle.js';

// ---- a small XML reader -----------------------------------------------------
// The browser has DOMParser and Node does not, and the checks run in Node. A
// MusicXML file is plain, well-formed XML, so a reader this size covers it and
// both places run the same code.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function parseXml(src) {
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const n = src.length;
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const lt = src.indexOf('<', i);
    const end = lt === -1 ? n : lt;
    if (end > i) stack[stack.length - 1].text += decode(src.slice(i, end));
    if (lt === -1) break;
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e === -1 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      stack[stack.length - 1].text += src.slice(lt + 9, e === -1 ? n : e);
      i = e === -1 ? n : e + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e === -1 ? n : e + 2; continue; }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset in [ ].
      let j = lt + 2, depth = 0;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    // A tag. Scan to its '>' outside quotes — attribute values may hold one.
    let j = lt + 1, q = null;
    for (; j < n; j++) {
      const c = src[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
    }
    const raw = src.slice(lt + 1, j);
    i = j + 1;
    if (raw[0] === '/') {
      const name = raw.slice(1).trim();
      // Pop to the matching open tag; tolerate a stray close.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      continue;
    }
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = body.match(/^[^\s/>]+/);
    if (!nameMatch) continue;
    const el = { name: nameMatch[0], attrs: {}, children: [], text: '' };
    for (const m of body.slice(nameMatch[0].length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      el.attrs[m[1]] = decode(m[2] ?? m[3] ?? '');
    }
    stack[stack.length - 1].children.push(el);
    if (!selfClosing) stack.push(el);
  }
  return root;
}

const kids = (el, name) => (el ? el.children.filter(c => c.name === name) : []);
const kid = (el, name) => (el ? el.children.find(c => c.name === name) : undefined);
const textOf = (el, name) => {
  const k = name ? kid(el, name) : el;
  return k ? k.text.trim() : '';
};
const numOf = (el, name, dflt = 0) => {
  const v = parseFloat(textOf(el, name));
  return Number.isFinite(v) ? v : dflt;
};

// ---- .mxl --------------------------------------------------------------------
// A zip whose META-INF/container.xml names the score inside it.

export function readMxl(bytes) {
  const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const container = files['META-INF/container.xml'];
  if (container) {
    const doc = parseXml(strFromU8(container));
    const find = (el) => {
      if (el.name === 'rootfile' && el.attrs['full-path']) return el.attrs['full-path'];
      for (const c of el.children) { const r = find(c); if (r) return r; }
      return null;
    };
    const path = find(doc);
    if (path && files[path]) return strFromU8(files[path]);
  }
  const name = Object.keys(files).find(p => !p.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(p));
  if (!name) throw new Error('No score found inside the .mxl file');
  return strFromU8(files[name]);
}

// ---- chord names -------------------------------------------------------------

const KIND = {
  major: '', minor: 'm', augmented: 'aug', diminished: 'dim',
  dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
  'diminished-seventh': 'dim7', 'augmented-seventh': 'aug7',
  'half-diminished': 'm7b5', 'major-minor': 'mmaj7',
  'major-sixth': '6', 'minor-sixth': 'm6',
  'dominant-ninth': '9', 'major-ninth': 'maj9', 'minor-ninth': 'm9',
  'dominant-11th': '11', 'major-11th': 'maj11', 'minor-11th': 'm11',
  'dominant-13th': '13', 'major-13th': 'maj13', 'minor-13th': 'm13',
  'suspended-second': 'sus2', 'suspended-fourth': 'sus4', power: '5',
};

const accidental = (alter) => (alter > 0 ? '#'.repeat(Math.round(alter)) : alter < 0 ? 'b'.repeat(Math.round(-alter)) : '');

function stepOf(el, stepName, alterName) {
  const step = textOf(el, stepName);
  return step ? step.toUpperCase() + accidental(numOf(el, alterName)) : '';
}

// The chord as Cue would spell it. The engraver's own spelling (kind's text
// attribute — what was typed into MuseScore) wins when Cue reads it as a chord;
// otherwise it is built from the kind and its added/altered degrees.
export function harmonyName(h) {
  const kindEl = kid(h, 'kind');
  const kind = kindEl ? kindEl.text.trim() : '';
  if (kind === 'none') return 'N.C.';
  const rootEl = kid(h, 'root');
  const root = stepOf(rootEl, 'root-step', 'root-alter');
  if (!root) return '';
  const bassEl = kid(h, 'bass');
  const bass = bassEl ? '/' + stepOf(bassEl, 'bass-step', 'bass-alter') : '';

  const typed = kindEl?.attrs.text;
  if (typed != null && typed !== '') {
    const candidate = root + typed + bass;
    if (isChordLine(candidate)) return candidate;
  }

  let quality = KIND[kind] ?? '';
  let extra = '';
  for (const d of kids(h, 'degree')) {
    const value = textOf(d, 'degree-value');
    const alter = numOf(d, 'degree-alter');
    const type = textOf(d, 'degree-type');
    if (!value) continue;
    // A seventh or ninth added to a sus chord reads as 7sus4 / 9sus4.
    if (type === 'add' && alter === 0 && /^sus[24]$/.test(quality) && (value === '7' || value === '9')) {
      quality = value + quality;
    } else if (type === 'add') extra += (alter ? accidental(alter) : 'add') + value;
    else if (type === 'alter') extra += accidental(alter) + value;
    else if (type === 'subtract') extra += 'no' + value;
  }
  return root + quality + extra + bass;
}

// ---- key, from the circle of fifths ------------------------------------------
// Spelled from Cue's own key list, so the editor's picker shows it: Cb and Gb
// major arrive as B and F#, as that list has them.
const MAJOR_KEYS = ['B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const MINOR_KEYS = ['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
function keyName(keyEl) {
  const fifths = Math.round(numOf(keyEl, 'fifths', NaN));
  if (!Number.isFinite(fifths) || fifths < -7 || fifths > 7) return '';
  return (textOf(keyEl, 'mode') === 'minor' ? MINOR_KEYS : MAJOR_KEYS)[fifths + 7];
}

// Section words worth carrying over as a label when they appear as a direction.
const SECTION_WORD = /^(intro|verse|pre-?chorus|chorus|refrain|bridge|solo|instrumental|interlude|break|outro|coda|tag|ending)\b/i;

// ---- walking the score -------------------------------------------------------

function readPart(part) {
  const measures = [];
  let divisions = 1;
  // Per staff: is it tablature, and if so its tuning, lowest string first.
  const tabStaves = {};
  for (const [mi, m] of kids(part, 'measure').entries()) {
    const out = { harmonies: [], syllables: [], tabNotes: [], newSystem: false, label: null, attrs: {} };
    let pos = 0, lastOnset = 0;
    for (const el of m.children) {
      switch (el.name) {
        case 'print':
          if (el.attrs['new-system'] === 'yes' || el.attrs['new-page'] === 'yes') out.newSystem = true;
          break;
        case 'attributes': {
          if (kid(el, 'divisions')) divisions = numOf(el, 'divisions', 1) || 1;
          if (kid(el, 'key') && out.attrs.key == null) out.attrs.key = keyName(kid(el, 'key'));
          const time = kid(el, 'time');
          if (time && out.attrs.time == null && kid(time, 'beats')) out.attrs.time = `${textOf(time, 'beats')}/${textOf(time, 'beat-type')}`;
          for (const clef of kids(el, 'clef')) {
            const staff = clef.attrs.number || '1';
            if (textOf(clef, 'sign') === 'TAB') tabStaves[staff] = tabStaves[staff] || { tuning: [] };
          }
          for (const sd of kids(el, 'staff-details')) {
            const staff = sd.attrs.number || '1';
            const tunings = kids(sd, 'staff-tuning');
            if (!tunings.length) continue;
            const tuning = [];
            for (const t of tunings) tuning[(parseInt(t.attrs.line, 10) || 1) - 1] = stepOf(t, 'tuning-step', 'tuning-alter');
            tabStaves[staff] = { tuning: tuning.filter(Boolean) };
          }
          break;
        }
        case 'harmony': {
          if (el.attrs['print-object'] === 'no') break;
          const name = harmonyName(el);
          if (name) out.harmonies.push({ onset: pos + numOf(el, 'offset') / divisions, name });
          break;
        }
        case 'direction': {
          for (const dt of kids(el, 'direction-type')) {
            const words = [...kids(dt, 'rehearsal'), ...kids(dt, 'words')].map(w => w.text.trim()).filter(Boolean);
            for (const w of words) if (!out.label && SECTION_WORD.test(w)) out.label = w.replace(/[:.]$/, '');
            const metro = kid(dt, 'metronome');
            if (metro && out.attrs.tempo == null && kid(metro, 'per-minute')) out.attrs.tempo = numOf(metro, 'per-minute');
          }
          const sound = kid(el, 'sound');
          if (sound?.attrs.tempo && out.attrs.tempo == null) out.attrs.tempo = parseFloat(sound.attrs.tempo);
          break;
        }
        case 'sound':
          if (el.attrs.tempo && out.attrs.tempo == null) out.attrs.tempo = parseFloat(el.attrs.tempo);
          break;
        // Positions are kept in quarter notes, not the part's own divisions, so a
        // chord in one part lines up with a syllable in another.
        case 'backup': pos -= numOf(el, 'duration') / divisions; break;
        case 'forward': pos += numOf(el, 'duration') / divisions; break;
        case 'note': {
          const isChordTone = !!kid(el, 'chord');
          const grace = !!kid(el, 'grace') || !!kid(el, 'cue');
          const onset = isChordTone ? lastOnset : pos;
          if (!isChordTone) lastOnset = pos;
          const staff = textOf(el, 'staff') || '1';
          for (const ly of kids(el, 'lyric')) {
            const text = kids(ly, 'text').map(t => t.text.trim()).filter(Boolean).join(' ');
            if (!text) continue;   // an extend-only lyric: a held syllable
            out.syllables.push({ onset, staff, verse: ly.attrs.number || '1', text, syllabic: textOf(ly, 'syllabic') || 'single' });
          }
          const tech = kid(kid(el, 'notations'), 'technical');
          if (tech && kid(tech, 'string') && kid(tech, 'fret') && !kid(el, 'rest')) {
            const tiedOn = kids(el, 'tie').some(t => t.attrs.type === 'stop') && !kids(el, 'tie').some(t => t.attrs.type === 'start');
            if (!tiedOn) out.tabNotes.push({ onset, staff, string: parseInt(textOf(tech, 'string'), 10), fret: textOf(tech, 'fret') });
          }
          if (!isChordTone && !grace) pos += numOf(el, 'duration') / divisions;
          break;
        }
        default: break;
      }
    }
    measures[mi] = out;
  }
  return { measures, tabStaves };
}

// Join a line's chords and syllables into ChordPro brackets for one verse.
function lineText(measureIdxs, measuresOf, lyricMeasures, verse) {
  const events = [];
  for (const mi of measureIdxs) {
    for (const h of measuresOf(mi)) events.push({ mi, onset: h.onset, order: 0, chord: h.name });
    for (const s of (lyricMeasures[mi]?.syllables || [])) {
      if (s.verse === verse) events.push({ mi, onset: s.onset, order: 1, syl: s });
    }
  }
  events.sort((a, b) => a.mi - b.mi || a.onset - b.onset || a.order - b.order);
  let out = '';
  let prev = null;   // { end, name } of the last chord written
  for (const e of events) {
    if (e.chord) {
      // Two chords with no words between them (a change on a rest or a held
      // note) need room for the first one's name, or chords-over-lyrics draws
      // the second a column off its word.
      if (prev && /^\s*$/.test(out.slice(prev.end))) {
        const gap = out.length - prev.end;
        if (gap < prev.name.length + 1) out += ' '.repeat(prev.name.length + 1 - gap);
      }
      out += `[${e.chord}]`;
      prev = { end: out.length, name: e.chord };
    } else {
      out += e.syl.text;
      if (e.syl.syllabic === 'single' || e.syl.syllabic === 'end') out += ' ';
    }
  }
  return out.trim();
}

// A tab block for one line's measures: one text line per string, highest on
// top, one column per onset, a bar between measures.
function tabBlock(measureIdxs, tabMeasures, staff, tuning) {
  const notes = measureIdxs.map(mi => (tabMeasures[mi]?.tabNotes || []).filter(t => t.staff === staff));
  if (!notes.some(n => n.length)) return null;
  const count = tuning.length || Math.max(...notes.flat().map(t => t.string), 0);
  if (!count) return null;
  const names = tuning.length === count
    ? tabStringNames(tuning)
    : Array.from({ length: count }, (_, k) => String(k + 1));
  const width = Math.max(...names.map(s => s.length));
  const rows = names.map(nm => nm.padEnd(width) + '|');
  for (const measureNotes of notes) {
    const onsets = [...new Set(measureNotes.map(t => t.onset))].sort((a, b) => a - b);
    const segs = Array.from({ length: count }, () => '-');
    for (const on of onsets) {
      const here = measureNotes.filter(t => t.onset === on);
      const w = Math.max(...here.map(t => t.fret.length));
      for (let s = 0; s < count; s++) {
        const note = here.find(t => t.string === s + 1);
        segs[s] += (note ? note.fret : '').padEnd(w, '-') + '-';
      }
    }
    // An empty bar still gets room, so a rest reads as a rest.
    for (let s = 0; s < count; s++) rows[s] += (onsets.length ? segs[s] : '--------') + '|';
  }
  // Every line needs a run of four dashes to be tab to Cue (isTabLine). Without
  // one, a string with no notes in a short bar — "A|---|" — reads as the chord
  // A. When any line lacks it, every line gets room before its last bar, so the
  // columns stay lined up.
  if (rows.some(r => !/-{4,}/.test(r))) return rows.map(r => r.slice(0, -1) + '---|').join('\n');
  return rows.join('\n');
}

// MusicXML text → { metadata, text }. Throws with a readable message when the
// file isn't a score Cue can read.
export function parseMusicXml(xml, { filename = '' } = {}) {
  const doc = parseXml(xml);
  const score = doc.children.find(c => c.name === 'score-partwise' || c.name === 'score-timewise');
  if (!score) throw new Error('This file is not a MusicXML score.');
  if (score.name === 'score-timewise') throw new Error('This MusicXML file is laid out time-wise, which Cue cannot read. Export it from your notation program again as a standard (part-wise) MusicXML file.');

  const parts = kids(score, 'part').map(readPart);
  if (!parts.length) throw new Error('This MusicXML score has no parts.');
  const measureCount = Math.max(...parts.map(p => p.measures.length));

  // Chords from every part, once each — a lead sheet usually carries them on
  // the melody, an arrangement may repeat them on the accompaniment.
  const chordsAt = (mi) => {
    const seen = new Set();
    const out = [];
    for (const p of parts) for (const h of (p.measures[mi]?.harmonies || [])) {
      const k = `${h.onset}|${h.name}`;
      if (!seen.has(k)) { seen.add(k); out.push(h); }
    }
    return out.sort((a, b) => a.onset - b.onset);
  };
  // Lyrics from the part that sings the most.
  const sylCount = (p) => p.measures.reduce((n, m) => n + (m?.syllables.length || 0), 0);
  const lyricPart = parts.reduce((best, p) => (sylCount(p) > sylCount(best) ? p : best), parts[0]);
  const lyricMeasures = lyricPart.measures;
  const tabs = [];
  for (const p of parts) for (const [staff, info] of Object.entries(p.tabStaves)) tabs.push({ part: p, staff, tuning: info.tuning });

  // Lines: a new system starts one, and so does a section label. With no
  // system breaks anywhere, four bars a line.
  const firstVal = (key) => {
    for (let mi = 0; mi < measureCount; mi++) for (const p of parts) {
      const v = p.measures[mi]?.attrs[key];
      if (v != null && v !== '') return v;
    }
    return null;
  };
  const breaks = new Set([0]);
  const labels = {};
  let anySystem = false;
  for (let mi = 0; mi < measureCount; mi++) {
    for (const p of parts) {
      const m = p.measures[mi];
      if (!m) continue;
      if (m.newSystem && mi > 0) { breaks.add(mi); anySystem = true; }
      if (m.label && !labels[mi]) { labels[mi] = m.label; breaks.add(mi); }
    }
  }
  if (!anySystem) for (let mi = 4; mi < measureCount; mi += 4) breaks.add(mi);
  const starts = [...breaks].filter(mi => mi < measureCount).sort((a, b) => a - b);
  const lines = starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : measureCount;
    const idxs = Array.from({ length: end - s }, (_, j) => s + j);
    const verses = [...new Set(idxs.flatMap(mi => (lyricMeasures[mi]?.syllables || []).map(x => x.verse)))]
      .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    return { idxs, verses, label: labels[s] || null };
  });

  // Runs of consecutive lines sharing the same verses. A run sung to two
  // verses is written out twice, verse 1 then verse 2, the way a chart reads.
  const out = [];
  const pushBlank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
  let k = 0;
  while (k < lines.length) {
    const key = lines[k].verses.join(',');
    let e = k + 1;
    while (e < lines.length && lines[e].verses.join(',') === key && !lines[e].label) e++;
    const run = lines.slice(k, e);
    const passes = run[0].verses.length ? run[0].verses : [null];
    for (const [pi, verse] of passes.entries()) {
      pushBlank();
      for (const [li, line] of run.entries()) {
        if (line.label && pi === 0 && li === 0) out.push(line.label);
        const text = verse == null
          ? line.idxs.flatMap(mi => chordsAt(mi).map(h => `[${h.name}]`)).join(' ')
          : lineText(line.idxs, chordsAt, lyricMeasures, verse);
        if (text) out.push(text);
        // Tab rides with the first pass only; it is the same music each time.
        if (pi === 0) for (const t of tabs) {
          const block = tabBlock(line.idxs, t.part.measures, t.staff, t.tuning);
          if (block) out.push(block);
        }
      }
    }
    k = e;
  }
  const brackets = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!brackets) throw new Error('Found no chords, lyrics or tab in this MusicXML file.');

  // ---- details ----
  const work = kid(score, 'work');
  const ident = kid(score, 'identification');
  const creators = kids(ident, 'creator');
  const creator = (type) => creators.find(c => c.attrs.type === type)?.text.trim() || '';
  const credits = kids(score, 'credit');
  const creditOf = (type) => {
    const c = credits.find(cr => kids(cr, 'credit-type').some(t => t.text.trim() === type));
    return c ? kids(c, 'credit-words').map(w => w.text.trim()).join(' ').trim() : '';
  };
  const title = textOf(work, 'work-title') || textOf(score, 'movement-title') || creditOf('title')
    || filename.replace(/\.(mxl|musicxml|xml)$/i, '') || 'Untitled';
  const tempo = firstVal('tempo');
  const metadata = {
    title,
    artist: creator('composer') || creditOf('composer') || creator('lyricist') || '',
    key: firstVal('key') || '',
    tempo: tempo ? String(Math.round(tempo)) : '',
    timeSig: firstVal('time') || '',
    duration: '',
    youtubeUrl: '',
  };
  return { metadata, text: convertToOver(brackets) };
}

// A file the user picked → { metadata, text }, or null when it isn't MusicXML
// (so the caller can try it as something else).
export async function musicXmlFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.mxl')) {
    return parseMusicXml(readMxl(new Uint8Array(await file.arrayBuffer())), { filename: file.name });
  }
  if (name.endsWith('.musicxml') || name.endsWith('.xml')) {
    const xml = await file.text();
    if (name.endsWith('.xml') && !/<score-(partwise|timewise)[\s>]/.test(xml)) return null;
    return parseMusicXml(xml, { filename: file.name });
  }
  return null;
}
