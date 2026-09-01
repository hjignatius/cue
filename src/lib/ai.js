// Cue's AI helpers — bring-your-own-key, called directly from the browser.
//
// The user saves their own Anthropic API key in Settings (stored on this device
// only). Every call goes straight to the Anthropic Messages API from the browser
// with that key — safe here precisely because it's the user's own key on their
// own machine, not a shared secret. No backend, no proxy: works on localhost and
// the deployed app alike. (A future public release would route through a server
// proxy holding one shared key; keep all AI access behind this module so that
// swap stays localized.)
//
// We call the REST endpoint with fetch rather than the Anthropic SDK on purpose:
// the SDK pulls Node-only credential code into the browser bundle (~hundreds of
// KB), and this app is an offline-first PWA where bundle size matters. Three
// small Messages calls don't need it.
//
// The key is deliberately NOT stored in PrefsContext — prefs are included in
// JSON/Backup exports, and a secret must never travel in those. It lives under
// its own localStorage key that nothing exports.

const KEY_STORAGE = 'cue:anthropic_key';
// Sonnet 5: fast, capable, far fewer "overloaded" errors than Opus, and cheaper —
// the right balance for Cue's find/clean-up/fill/advice/Q&A tasks. (Web search,
// streaming, and effort are all supported on this model.)
const MODEL = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export function getApiKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}
export function setApiKey(key) {
  try {
    const k = (key || '').trim();
    if (k) localStorage.setItem(KEY_STORAGE, k);
    else localStorage.removeItem(KEY_STORAGE);
  } catch { /* storage blocked — nothing to persist */ }
  // Same-tab notification so the editor's AI button can re-mute/-activate without
  // a reload (the native 'storage' event only fires in *other* tabs).
  try { window.dispatchEvent(new Event('cue:ai-key')); } catch { /* no window */ }
}
export function hasApiKey() { return getApiKey().length > 0; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Map a failed HTTP response to a friendly, code-tagged Error.
function httpError(status, data) {
  const msg =
    status === 401 ? 'That API key was rejected — check it in Settings.'
    : status === 529 ? 'Claude is busy right now — please try again in a moment.'
    : status === 429 ? 'Rate limited or out of credit — try again shortly.'
    : (data?.error?.message || `AI request failed (${status}).`);
  const err = new Error(msg);
  err.code = data?.error?.type || `http_${status}`;
  return err;
}

const REQUEST_HEADERS = (apiKey) => ({
  'content-type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': API_VERSION,
  'anthropic-dangerous-direct-browser-access': 'true',
});

// Streaming call. Invokes onText(accumulatedText) as text deltas arrive and
// returns the full text. Retries transient failures only before the stream
// starts. Used for free-text answers (Q&A) so the reply builds live instead of
// appearing all at once after a long wait.
async function streamClaude(body, onText) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('Add your Anthropic API key in Settings to use AI features.');
    err.code = 'no_key';
    throw err;
  }

  const MAX_ATTEMPTS = 3;
  const TIMEOUT_MS = 90000;   // hard cap per attempt, so a stall can't spin forever
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let res;
      try {
        res = await fetch(API_URL, {
          method: 'POST',
          headers: REQUEST_HEADERS(apiKey),
          body: JSON.stringify({ model: MODEL, ...body, stream: true }),
          signal: controller.signal,
        });
      } catch (e) {
        if (e?.name === 'AbortError') { const err = new Error('The answer timed out — try again.'); err.code = 'timeout'; throw err; }
        const err = new Error('Could not reach Anthropic — check your connection.');
        err.code = 'network';
        throw err;
      }

      if (!res.ok || !res.body) {
        let data = {};
        try { data = await res.json(); } catch { /* non-JSON */ }
        if ((res.status === 429 || res.status === 529) && attempt < MAX_ATTEMPTS) {
          await sleep(800 * attempt);
          continue;
        }
        throw httpError(res.status, data);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', acc = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();               // keep the trailing partial line
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith('data:')) continue;
            const payload = l.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let evt;
            try { evt = JSON.parse(payload); } catch { continue; }
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              acc += evt.delta.text;
              onText?.(acc);
            } else if (evt.type === 'error') {
              const err = new Error(evt.error?.message || 'The response was interrupted — try again.');
              err.code = evt.error?.type || 'stream';
              throw err;
            }
          }
        }
      } catch (e) {
        if (e?.name === 'AbortError') { const err = new Error('The answer timed out — try again.'); err.code = 'timeout'; throw err; }
        throw e;
      }
      return acc.trim();
    } finally {
      clearTimeout(timer);
    }
  }
}

// Low-level call. Returns the parsed response JSON; throws a code-tagged Error.
// Retries transient busy/rate-limit responses (429, 529 "overloaded") a couple
// of times with backoff before giving up — these fail before any generation, so
// a retry costs nothing extra.
async function callClaude(body) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('Add your Anthropic API key in Settings to use AI features.');
    err.code = 'no_key';
    throw err;
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: REQUEST_HEADERS(apiKey),
        body: JSON.stringify({ model: MODEL, ...body }),
      });
    } catch {
      const err = new Error('Could not reach Anthropic — check your connection.');
      err.code = 'network';
      throw err;
    }

    if (res.ok) {
      try { return await res.json(); }
      catch {
        const err = new Error('Got an unreadable response — try again.');
        err.code = 'parse';
        throw err;
      }
    }

    let data = {};
    try { data = await res.json(); } catch { /* non-JSON */ }

    // Transient — wait and retry (unless this was the last attempt).
    if ((res.status === 429 || res.status === 529) && attempt < MAX_ATTEMPTS) {
      await sleep(800 * attempt);
      continue;
    }
    throw httpError(res.status, data);
  }
}

function textOf(data) {
  return (data?.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// Pull the first JSON value out of a model reply, tolerating stray prose or a
// ```json fence around it. Returns null if nothing parses.
function extractJson(s) {
  if (!s) return null;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const bodyStr = fence ? fence[1] : s;
  const start = bodyStr.search(/[[{]/);
  if (start === -1) return null;
  const open = bodyStr[start];
  const close = open === '[' ? ']' : '}';
  const end = bodyStr.lastIndexOf(close);
  if (end <= start) return null;
  try { return JSON.parse(bodyStr.slice(start, end + 1)); } catch { return null; }
}

// ── Clean up formatting ─────────────────────────────────────────────────────
// Reformat a pasted chart; never change chords, lyrics, or musical notation.
const CLEANUP_SYSTEM = `You clean up messy chord charts for a musician's app. You are given the raw text of ONE song's chart, often pasted from a website.

Your job is ONLY to tidy FORMATTING — whitespace, alignment, and obvious website clutter. Be conservative: when in doubt, leave it alone.

NEVER remove, change, or "correct" musical content or notation. Preserve every non-whitespace character unless it is clearly website furniture. In particular, KEEP these exactly — they are meaningful:
- slash chords and rhythm slashes ( / ), bar lines ( | ), repeats ( x2, %, :|| ||: ), "N.C.", parentheses, dashes/hyphens
- strum / picking marks ( ↓ ↑ → ← ) and chord-quality symbols ( ° + Δ ø ♭ ♯ b # sus add maj )
- section labels, capo notes, and of course the chords and lyrics themselves — verbatim.

DO:
- Keep the input's chord notation — chords-above-lyrics OR inline [brackets]; do not convert between them.
- In over-lyrics, align each chord directly above its syllable using spaces (never tabs).
- Put section labels (Intro, Verse, Chorus, Bridge, Outro, …) on their own line in Title Case.
- Remove ONLY clear website clutter: ads, "Tabs by", ratings, view counts, difficulty labels, capo-selector widgets, navigation text, decorative ASCII rule/box art, and stray line numbers; collapse 3+ blank lines to one; keep a single capo note near the top.

Output ONLY the cleaned chart text. No commentary, no explanation, no Markdown code fences.`;

export async function cleanUpChart(text, { symbols } = {}) {
  if (!text || !text.trim()) {
    const err = new Error('Nothing to clean up — the chart is empty.');
    err.code = 'empty';
    throw err;
  }
  // Feed the user's own symbol palette as an explicit keep-list, so their
  // acceptable characters are never stripped.
  const allow = (symbols || '').replace(/\s+/g, ' ').trim();
  const system = allow
    ? `${CLEANUP_SYSTEM}\n\nThe user's chart may also use these characters, which are MEANINGFUL — keep every one of them exactly: ${allow}`
    : CLEANUP_SYSTEM;

  const data = await callClaude({
    max_tokens: 8000,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: text }],
  });
  const out = textOf(data);
  const m = out.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : out).trim();
}

// ── Find music online ───────────────────────────────────────────────────────
// Web-search-grounded: returns real sites, favouring the user's instrument.
// Result: array of { name, url, note }.
export async function findMusicOnline({ title, artist, instrument }) {
  const inst = instrument
    ? instrument.charAt(0).toUpperCase() + instrument.slice(1)
    : 'Guitar';
  const song = [artist, title].filter(Boolean).join(' — ') || (title || 'this song');

  const system = `You help a musician find chords/tabs for a song online. The musician plays ${inst}, so strongly prefer sources with ${inst.toLowerCase()} chords or tabs where they exist, then general chord sites.

Do at most ONE or TWO web searches — you don't need to be exhaustive, just surface the best-known sources. Then respond with ONLY a JSON array (no prose, no code fence) of up to 5 objects:
[{"name": "site or page name", "url": "https://…", "note": "one short phrase on why it's useful (e.g. 'ukulele chords', 'accurate tab', 'video lesson')"}]
Only include URLs you actually found via search. Order best first. If you find nothing, return [].`;

  const data = await callClaude({
    max_tokens: 1500,
    output_config: { effort: 'low' },
    system,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }],
    messages: [{ role: 'user', content: `Find chord/tab sources for: ${song}` }],
  });
  const json = extractJson(textOf(data));
  const list = Array.isArray(json) ? json : [];
  return list
    .filter((r) => r && typeof r.url === 'string' && /^https?:\/\//.test(r.url))
    .slice(0, 6)
    .map((r) => ({ name: String(r.name || r.url), url: r.url, note: String(r.note || '') }));
}

// ── Fill in song details ────────────────────────────────────────────────────
// Read the chart and suggest metadata. Returns
// { title, artist, key, tempo, duration, youtubeUrl } — any field may be '' when
// it can't be established. key comes from the chords; tempo/duration/youtube are
// web-search-grounded best guesses for the known recording (the YouTube URL is
// only kept if it's a real link the model found, never a hallucinated video id).
const YT_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)/i;

export async function fillSongDetails(text, hint = {}) {
  if (!text || !text.trim()) {
    const err = new Error('Nothing to read — the chart is empty.');
    err.code = 'empty';
    throw err;
  }
  const known = [hint.title && `title "${hint.title}"`, hint.artist && `artist "${hint.artist}"`]
    .filter(Boolean).join(', ');

  const system = `You read a chord chart and fill in metadata for a musician's app.${known ? ` The user already set: ${known}.` : ''}

Identify the song, then use web search to confirm details about the best-known/original recording. Respond with ONLY a JSON object (no prose, no code fence):
{"title": "", "artist": "", "key": "", "tempo": "", "duration": "", "youtubeUrl": ""}
Rules:
- title / artist: the song's real title and performer. Use the chart plus what you know; "" if genuinely unsure.
- key: infer the most likely key from the CHORDS in the chart (e.g. "G", "Em", "Bb"). Minor keys end in "m". "" if ambiguous.
- tempo: approximate BPM of the well-known recording, as a plain integer string (e.g. "72"). "" if you don't know.
- duration: length of that recording as M:SS (e.g. "4:05"). "" if you don't know.
- youtubeUrl: a REAL YouTube watch URL for the official/most-popular version that you actually found via search (https://www.youtube.com/watch?v=… or https://youtu.be/…). NEVER guess or invent a video id — if you did not find a real link, use "".
Everything except key is a best guess about the recording; when unsure, prefer "".`;

  const data = await callClaude({
    max_tokens: 1200,
    output_config: { effort: 'low' },
    system,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }],
    messages: [{ role: 'user', content: text.slice(0, 8000) }],
  });
  const j = extractJson(textOf(data)) || {};
  const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const tempo = str(j.tempo).match(/\d{2,3}/)?.[0] || '';       // integer BPM only
  const duration = /^\d{1,2}:\d{2}$/.test(str(j.duration)) ? str(j.duration) : '';
  const youtubeUrl = YT_RE.test(str(j.youtubeUrl)) ? str(j.youtubeUrl) : '';   // real YT link only
  return {
    title: str(j.title),
    artist: str(j.artist),
    key: str(j.key),
    tempo,
    duration,
    youtubeUrl,
  };
}

// ── Chord shapes (fill the library's gaps) ──────────────────────────────────
// Given chord NAMES with no diagram, return playable voicings for the instrument
// as { name, frets: [ints] } (frets: 0 open, -1 muted, >0 fret). Length matches
// the tuning. Invalid/unplayable entries are dropped.
export async function chordShapesFor(names, { instrument = 'ukulele', tuning = ['G', 'C', 'E', 'A'], level } = {}) {
  const list = [...new Set((names || []).map((n) => (n || '').trim()).filter(Boolean))];
  if (list.length === 0) return [];
  const n = tuning.length;

  const system = `You are a chord-library assistant for a ${instrument} app. The instrument has ${n} strings tuned ${tuning.join('-')} (as written below, that string order, low to high). ${levelLine(level)}
For each chord name given, provide ONE common, easy-to-play ${instrument} voicing near the nut. Respond with ONLY a JSON array (no prose, no code fence):
[{"name": "<chord name exactly as given>", "frets": [${tuning.map(() => 'n').join(', ')}]}]
- "frets" has exactly ${n} integers, one per string in the tuning order above: 0 = open string, a positive number = that fret, -1 = muted/not played.
- Prefer the easiest standard shape in a low position. Real, playable fingerings only — never invent an impossible shape.
- Include every requested chord you can voice; omit any you genuinely cannot.`;

  const data = await callClaude({
    max_tokens: 1500,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: `Chords: ${list.join(', ')}` }],
  });
  const arr = extractJson(textOf(data));
  if (!Array.isArray(arr)) return [];
  return arr.map((o) => {
    const name = typeof o?.name === 'string' ? o.name.trim() : '';
    const frets = Array.isArray(o?.frets) ? o.frets.map((f) => Number(f)) : null;
    if (!name || !frets || frets.length !== n) return null;
    if (frets.some((f) => !Number.isInteger(f) || f < -1 || f > 15)) return null;
    return { name, frets };
  }).filter(Boolean);
}

// ── Setlist: suggested order ────────────────────────────────────────────────
// items: [{ title, artist, key, tempo }] in current order. Returns
// { order: [1-based permutation], summary }.
export async function suggestSetOrder(items) {
  const n = (items || []).length;
  if (n === 0) return { order: [], summary: '' };
  const list = items.map((s, i) => {
    const meta = [s.key && `key ${s.key}`, s.tempo && `${s.tempo} bpm`].filter(Boolean).join(', ');
    return `${i + 1}. ${s.title || 'Untitled'}${s.artist ? ` — ${s.artist}` : ''}${meta ? ` (${meta})` : ''}`;
  }).join('\n');

  const system = `You are a setlist advisor for a live musician. Given a numbered list of songs (with key and tempo where known), propose a strong playing order: a confident opener, good energy flow and pacing, smooth key/tempo transitions, ballads well placed, and a satisfying closer.
Respond with ONLY a JSON object (no prose, no code fence):
{"order": [numbers], "summary": "1-2 sentences on the shape of the set"}
"order" must be a permutation of the song numbers 1..${n} — every number exactly once — in the new playing sequence.`;

  const data = await callClaude({
    max_tokens: 800,
    output_config: { effort: 'medium' },
    system,
    messages: [{ role: 'user', content: list }],
  });
  const j = extractJson(textOf(data)) || {};
  let order = Array.isArray(j.order) ? j.order.map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= n) : [];
  order = [...new Set(order)];
  if (order.length !== n) order = Array.from({ length: n }, (_, i) => i + 1); // not a full permutation → identity
  return { order, summary: typeof j.summary === 'string' ? j.summary.trim() : '' };
}

// ── Setlist: estimate set time ──────────────────────────────────────────────
// Reasons like a gigging musician: fills unknown song lengths, estimates gap
// (dead-air) time as a range, decides on a break and top/tail time, and gives
// practical notes. items: [{ n, title, artist, seconds }] (seconds 0 = unknown).
// Returns { songs:[{n,duration}], gapsLowMin, gapsHighMin, breakMin, topTailMin, notes }.
export async function estimateSetTime(items) {
  const n = (items || []).length;
  if (n === 0) return null;
  const list = items.map((s) => {
    const dur = s.seconds > 0 ? `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')}` : '?';
    return `${s.n}. ${s.title || 'Untitled'}${s.artist ? ` — ${s.artist}` : ''} [${dur}]`;
  }).join('\n');

  const system = `You estimate how long a live set will take, like an experienced gigging musician. You are given a numbered song list; each song shows its duration in [brackets], or [?] if unknown.
- For any [?] song, estimate a typical performance length.
- There are ${n} songs, so ${Math.max(0, n - 1)} gaps between them (tuning, page turns, a word about the song). Estimate the TOTAL gap time as a low–high minute range.
- Decide whether a break makes sense for a set this size and how many minutes it should be (0 if none).
- Add a few minutes to get started and finish up (top and tail).
Respond with ONLY a JSON object (no prose, no code fence):
{"songs":[{"n":<number>,"duration":"M:SS"}],"gapsLowMin":<int>,"gapsHighMin":<int>,"breakMin":<int>,"topTailMin":<int>,"notes":"2-3 short sentences of practical advice: where the time leverage is, break placement/length, pacing"}
"songs" must include ONLY the songs shown as [?]. All minute fields are integers.`;

  const data = await callClaude({
    max_tokens: 1200,
    output_config: { effort: 'medium' },
    system,
    messages: [{ role: 'user', content: list }],
  });
  const j = extractJson(textOf(data)) || {};
  const int = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 0 ? x : 0; };
  const songs = Array.isArray(j.songs)
    ? j.songs.map((o) => ({ n: Number(o?.n), duration: typeof o?.duration === 'string' && /^\d{1,2}:\d{2}$/.test(o.duration.trim()) ? o.duration.trim() : '' })).filter((o) => Number.isInteger(o.n) && o.duration)
    : [];
  const gapsLowMin = int(j.gapsLowMin);
  return {
    songs,
    gapsLowMin,
    gapsHighMin: Math.max(int(j.gapsHighMin), gapsLowMin),
    breakMin: int(j.breakMin),
    topTailMin: int(j.topTailMin),
    notes: typeof j.notes === 'string' ? j.notes.trim() : '',
  };
}

// How each playing level shapes the AI's tone. Fed into Q&A and transposing
// advice so the same question lands right for the player.
const LEVEL_GUIDE = {
  beginner: 'The player is a BEGINNER. Explain simply, avoid jargon (or define it), prefer easy open chords and simple options, and keep it encouraging.',
  intermediate: 'The player is INTERMEDIATE. Assume they know basic chords and terms; be practical and concise.',
  advanced: 'The player is ADVANCED. You can use standard theory terms freely and suggest richer voicings; keep it tight.',
  pro: 'The player is a PRO. Be terse and expert — assume full command of theory, no hand-holding.',
};
function levelLine(level) { return LEVEL_GUIDE[level] || LEVEL_GUIDE.intermediate; }

// ── Ask about music (Q&A) ───────────────────────────────────────────────────
// Free-form music question, optionally about the current song. Returns answer
// text. No web search — general musical knowledge, tailored to the player level.
export async function askMusic(question, ctx = {}, onText) {
  if (!question || !question.trim()) {
    const err = new Error('Type a question first.');
    err.code = 'empty';
    throw err;
  }
  const { title, artist, key, instrument, level, chart } = ctx;
  const songBits = [
    title && `Title: ${title}`,
    artist && `Artist: ${artist}`,
    key && `Key: ${key}`,
    instrument && `Instrument: ${instrument}`,
  ].filter(Boolean).join(' · ');

  const system = `You are a knowledgeable, friendly music assistant inside a musician's chord/lyric app. Answer questions about playing, theory, chords, technique, songs and performance. ${levelLine(level)}
Stay on music; if asked something off-topic, gently steer back. Be concise — a few short paragraphs or a tight list, no preamble. Plain text (you may use "-" bullets); no Markdown headers or code fences.

For chord shapes / fingerings, answer in TEXT as fret numbers per string, one shape per line — for ukulele use string order g-C-E-A (e.g. "Dm9: 5 5 5 5"), for guitar six numbers low-to-high E-A-D-G-B-e with x for muted. Offer one or two common, easy shapes. NEVER draw ASCII chord diagrams, fretboard grids, or tab art — they render badly here and are slow; describe shapes in words/numbers only.${songBits ? `\n\nThe user is currently working on a song — use this only if the question relates to it:\n${songBits}${chart ? `\n\nChart:\n${chart.slice(0, 4000)}` : ''}` : ''}`;

  // Thinking off + low effort so the first words appear fast (a chord-shape
  // question otherwise triggers a long silent "thinking" phase). Stream so the
  // answer builds live in the popup.
  return streamClaude({
    max_tokens: 1000,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: question.trim() }],
  }, onText);
}

// ── Transposing advice ──────────────────────────────────────────────────────
// Song- and instrument-aware key/capo guidance. Returns
// { summary, keys: [{key, why}], capo: [{fret, shapes, why}] }.
export async function transposeAdvice(ctx = {}) {
  const { title, artist, key, instrument, level, chart } = ctx;
  const inst = instrument || 'guitar';

  const system = `You give practical transposing and capo advice for a musician in a chord app. The player plays ${inst}. ${levelLine(level)}

Given the song and its chords, suggest the best keys to play it in (easier shapes for ${inst}, or better for a typical singing range) and useful capo positions. Respond with ONLY a JSON object (no prose, no code fence):
{"summary": "1-2 sentences of the headline advice",
 "keys": [{"key": "C", "why": "short reason"}],
 "capo": [{"fret": 3, "shapes": "G", "why": "short reason — play G-shape chords with a capo on 3 to sound in Bb"}]}
Rules:
- "key" values must be standard names (C, G, D, A, E, F, Bb, Eb, Am, Em, …); minor keys end in "m". Give 1-3 realistic options, best first. Omit the key the song is already in unless there's a reason to keep it.
- capo: 0-3 suggestions with fret (integer 1-9) and the chord SHAPES to play; [] if none help.
- Keep every "why" short. Ground it in the actual chords of THIS song.`;

  const userText = [
    title && `Song: ${title}${artist ? ` — ${artist}` : ''}`,
    key && `Current key: ${key}`,
    chart && `Chart:\n${chart.slice(0, 4000)}`,
  ].filter(Boolean).join('\n\n') || 'Advise on a song (no chart provided).';

  const data = await callClaude({
    max_tokens: 1200,
    output_config: { effort: 'medium' },
    system,
    messages: [{ role: 'user', content: userText }],
  });
  const j = extractJson(textOf(data)) || {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    summary: s(j.summary),
    keys: Array.isArray(j.keys) ? j.keys.filter(k => k && s(k.key)).map(k => ({ key: s(k.key), why: s(k.why) })).slice(0, 4) : [],
    capo: Array.isArray(j.capo) ? j.capo.filter(c => c && Number.isFinite(+c.fret)).map(c => ({ fret: +c.fret, shapes: s(c.shapes), why: s(c.why) })).slice(0, 4) : [],
  };
}
