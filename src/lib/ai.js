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

import { timeSigOrEmpty } from '../utils/timeSig.js';

const KEY_STORAGE = 'cue:anthropic_key';
// ── Quality tiers ───────────────────────────────────────────────────────────
// The user picks INTENT ("Balanced", "Best"), never a model id. Two reasons this
// indirection earns its keep:
//   * A retired model is remapped in ONE row here. A stored raw model id whose
//     model is withdrawn would break every AI action until the user worked out
//     why.
//   * A tier is a CAPABILITY OBJECT, not a string. A model that rejects
//     `output_config.effort` (Haiku 4.5 does), or needs the older web-search
//     tool, or belongs to another provider entirely, becomes a new row rather
//     than edits at a dozen call sites.
//
// `supportsEffort` and `searchTool` are carried even though both current tiers
// agree on them — they're the fields the next tier will disagree about, and
// having callers read them now is what stops this becoming a second migration.
//
// NO "economy" tier yet, deliberately. Within Anthropic the cheap end is Haiku
// 4.5, which is exactly the model that rejects effort and needs the older search
// tool — a capability table built for a tier that a genuinely free provider
// would later demote. Economy arrives with that provider. See the Gemini note.
export const AI_TIERS = [
  {
    id: 'balanced',
    label: 'Balanced',
    model: 'claude-sonnet-5',
    blurb: 'Fast and capable, and far fewer "busy" errors. The right balance for most of Cue\'s tools.',
    supportsEffort: true,
    searchTool: 'web_search_20260209',
  },
  {
    id: 'best',
    label: 'Best',
    model: 'claude-opus-5',
    blurb: 'The most capable model — slower, and several times the cost per request. Worth it when an answer looks off.',
    supportsEffort: true,
    searchTool: 'web_search_20260209',
  },
];
export const DEFAULT_AI_TIER = 'balanced';

// PrefsContext owns this value; read straight from its blob rather than
// duplicating storage. ai.js is not a React module, so it can't use the context.
// Must match PREFS_KEY in context/PrefsContext.jsx.
const PREFS_KEY = 'cue_prefs';

export function tierById(id) {
  return AI_TIERS.find(t => t.id === id) || AI_TIERS.find(t => t.id === DEFAULT_AI_TIER);
}

// The user's chosen tier, validated. An unknown or retired id falls back to the
// default instead of stranding every AI action on a model that no longer exists.
export function getAiTier() {
  try {
    const id = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')?.aiTier;
    return AI_TIERS.some(t => t.id === id) ? id : DEFAULT_AI_TIER;
  } catch { return DEFAULT_AI_TIER; }
}

const currentTier = () => tierById(getAiTier());
const topTier = () => AI_TIERS[AI_TIERS.length - 1];

// The model a plain call uses, resolved at CALL time so changing the setting
// takes effect on the next action without a reload.
const MODEL = () => currentTier().model;

// "Try again — smarter" escalates one rung ABOVE the user's setting. Null when
// they're already at the top — the link must then disappear rather than re-run
// an identical request and bill them twice for the same answer.
export function escalatedModel() {
  const i = AI_TIERS.findIndex(t => t.id === getAiTier());
  return AI_TIERS[i + 1]?.model ?? null;
}
export function escalatedTierLabel() {
  const i = AI_TIERS.findIndex(t => t.id === getAiTier());
  return AI_TIERS[i + 1]?.label ?? null;
}
// Is there anywhere further to go from the model that actually ran? `undefined`
// means the call used the current tier's model.
export function canEscalate(usedModel) {
  return (usedModel || MODEL()) !== topTier().model;
}
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
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// Should a rejected `fetch` be retried? Both call paths already retried 429/529
// but gave up on a connection-level failure, even though that is the MORE
// transient of the two — a reused keep-alive connection the server has since
// closed surfaces as `TypeError: Failed to fetch` on the next request, which is
// why it showed up on a second identical request. A rejected fetch means no
// response arrived, so nothing was generated and (on the streaming path) nothing
// has streamed yet: re-sending is safe, and retrying connection errors is what
// the official Anthropic SDKs do by default.
//
// Not retried when the device is plainly offline — three attempts can't reach
// the network and only delay the accurate message by a few seconds.
function retryableNetworkFailure(attempt, maxAttempts, e) {
  if (isOffline() || attempt >= maxAttempts) return false;
  console.warn(`[ai] request to Anthropic failed before any response (attempt ${attempt}/${maxAttempts}) — retrying`, e);
  return true;
}

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

// A failed `fetch` — the request never produced a response. Both call paths used
// to swallow the cause entirely (`catch {` with no binding) and report one fixed
// sentence, so a blocked request, a DNS failure, a dropped connection and a CORS
// rejection were indistinguishable after the fact and nothing was ever logged.
// Now the underlying error is logged and carried on `cause`, and being offline is
// named as such — matching describeCloudError's treatment of the cloud calls.
function networkError(e) {
  // The one line that makes this diagnosable from the console.
  console.error('[ai] request to Anthropic failed before any response', e);
  const offline = isOffline();
  const detail = e?.message || e?.name || '';
  // Kept short: this renders as one line in the editor toolbar. The full error
  // object is on the console line above for anyone diagnosing it.
  const err = new Error(
    offline
      ? "You're offline — reconnect and try again."
      : `Couldn't reach Anthropic — the request didn't complete${detail ? ` (${detail})` : ''}.`
  );
  err.code = offline ? 'offline' : 'network';
  err.cause = e;
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
//
// `onSearch` reports server-side web search as it happens: { started, done,
// query }. A non-streamed call cannot see any of this — the searches run inside
// the one request and only the finished answer comes back — which is why a
// progress indicator has to stream even when the caller wants JSON rather than
// live text.
async function streamClaude(body, onText, onSearch) {
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
          body: JSON.stringify({ model: MODEL(), ...body, stream: true }),
          signal: controller.signal,
        });
      } catch (e) {
        if (e?.name === 'AbortError') { const err = new Error('The answer timed out — try again.'); err.code = 'timeout'; throw err; }
        if (retryableNetworkFailure(attempt, MAX_ATTEMPTS, e)) { await sleep(800 * attempt); continue; }
        throw networkError(e);
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
      // A web search announces itself in two parts: a `server_tool_use` block
      // whose input (the query) arrives as partial JSON and is only complete at
      // its stop event, then a `web_search_tool_result` block when the results
      // land. Counting both is what makes the wait legible — "searching for X"
      // and then "got it" are different moments, and the gap between them is
      // most of the time spent.
      // Named for the search, not shortened: `done` is already the reader's
      // end-of-stream flag a few lines below.
      const toolInput = new Map();   // block index -> accumulated input JSON
      let searchesStarted = 0, searchesDone = 0, query = '';
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
            } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'server_tool_use') {
              toolInput.set(evt.index, '');
            } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta' && toolInput.has(evt.index)) {
              toolInput.set(evt.index, toolInput.get(evt.index) + (evt.delta.partial_json || ''));
            } else if (evt.type === 'content_block_stop' && toolInput.has(evt.index)) {
              // Input JSON is only parseable once the block closes. Keep the
              // previous query if this one is unreadable rather than blanking
              // a label that was telling the truth a moment ago.
              try { query = JSON.parse(toolInput.get(evt.index))?.query || query; } catch { /* partial */ }
              toolInput.delete(evt.index);
              searchesStarted++;
              onSearch?.({ started: searchesStarted, done: searchesDone, query });
            } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'web_search_tool_result') {
              searchesDone++;
              onSearch?.({ started: searchesStarted, done: searchesDone, query });
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
        body: JSON.stringify({ model: MODEL(), ...body }),
      });
    } catch (e) {
      if (retryableNetworkFailure(attempt, MAX_ATTEMPTS, e)) { await sleep(800 * attempt); continue; }
      throw networkError(e);
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

// ECHO_PROGRESS — progress for the two tools that hand the chart back.
//
// Clean up and Detect structure both return the SAME SONG: one retouches the
// formatting, the other inserts "# Label" lines. Neither adds or removes
// material. So the reply's finished length is within a few percent of the text
// that went in, and "characters back / characters sent" is a measure of real
// output against a real number — not a timer pretending to be progress.
//
// It is an approximation in one direction only: Detect structure's output is
// slightly LONGER than its input, so the fraction is clamped below 1 until the
// call actually returns. A bar that reaches the end and then waits is the one
// dishonest thing it could do, and this is the case where it would happen.
const echoProgress = (input, onProgress) => {
  if (!onProgress) return undefined;
  const expected = Math.max(1, (input || '').length);
  return (acc) => onProgress(Math.min(0.99, acc.length / expected));
};

// `onProgress(fraction)` is optional. See ECHO_PROGRESS below for what makes the
// fraction real rather than invented.
export async function cleanUpChart(text, { symbols, model, onProgress } = {}) {
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

  const out = await streamClaude({
    ...(model ? { model } : {}),
    max_tokens: 8000,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: text }],
  }, echoProgress(text, onProgress));
  const m = out.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : out).trim();
}

// ── Detect structure ────────────────────────────────────────────────────────
// Infer a song's sections (Verse / Chorus / Bridge / …) and insert header lines,
// WITHOUT touching a single chord or word or changing the chord format. Labels
// are consistent (verses numbered, a recurring chorus named identically) so a
// later Condense recognises the repeats. Existing labels are respected.
const STRUCTURE_SYSTEM = `You label the sections of ONE song's chord chart for a musician's app. The chart is in the user's format — either chords ABOVE lyrics, OR inline [brackets]. You only ADD section headers; you change nothing else.

ABSOLUTE RULES:
- NEVER change, add, remove, re-spell, or move any chord or any lyric. Every existing character of the music survives verbatim.
- KEEP the existing chord format exactly. If it is chords-above-lyrics, do NOT convert to brackets, and vice-versa.
- The ONLY lines you add are section headers, written as "# Label" on their own line, in Title Case, with one blank line before each.

HOW TO LABEL:
- Identify the sections from repetition and lyric/chord patterns: Intro, Verse, Pre-Chorus, Chorus, Bridge, Instrumental/Solo, Outro/Tag.
- Number verses in order: "# Verse 1", "# Verse 2", … A section that recurs with the same words (the chorus) gets the SAME label every time — "# Chorus" — so repeats are recognisable.
- RESPECT labels already present: keep the user's own headers and their wording; only add headers to blocks that don't have one. Do not duplicate a header, and adding headers to an already-labelled song must be a no-op.
- Be conservative: if the structure isn't clear, or the song is too short to have sections, return it UNCHANGED rather than guessing.

Output ONLY the chart text with headers added. No commentary, no explanation, no Markdown code fences.`;

export async function detectStructure(text, { model, onProgress } = {}) {
  if (!text || !text.trim()) {
    const err = new Error('Nothing to label — the chart is empty.');
    err.code = 'empty';
    throw err;
  }
  const out = await streamClaude({
    ...(model ? { model } : {}),
    max_tokens: 8000,
    output_config: { effort: 'low' },
    system: STRUCTURE_SYSTEM,
    messages: [{ role: 'user', content: text }],
  }, echoProgress(text, onProgress));
  const m = out.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : out).trim();
}

// ── Condense (fit to page) ──────────────────────────────────────────────────
// Shrink a song to a compact lead-sheet so it fits one or two pages, WITHOUT
// altering a single chord or word. Input is already inline-bracket ChordPro
// (the caller converts over-lyrics → brackets deterministically first). The
// output uses Cue's own conventions: a section defined once under a `# Label`
// header and later referenced by the bare header; consecutive identical lines
// collapsed with an (xN) marker. Cue renders a condensed song verbatim, so these
// references stay short on the page — and expand again when condensed is off.
const CONDENSE_SYSTEM = `You compress a single song's chord chart into the most compact lead-sheet that still contains all of its music, for a musician's app. The input is ONE song in ChordPro inline-bracket format, e.g. [G]Amazing [D]grace.

ABSOLUTE RULES — breaking any of these ruins the song:
- NEVER change, add, remove, "correct", or re-spell any chord or any lyric. Every chord name and every word must survive verbatim.
- Keep the inline-bracket format. Do NOT convert to chords-over-lyrics.
- Only compress EXACT repeats. If two sections or lines differ by even one word, one chord, or an added tag/ending, they are NOT the same — leave both in full.
- Preserve the original top-to-bottom order of the music.

HOW TO COMPRESS (apply where it is safe):
1. Repeated sections (this is the most important rule — do it carefully). When a block of lines (its chords AND its lyrics) recurs later, keep the FIRST occurrence in full under a section header line written as "# Chorus" (or "# Verse 1", "# Bridge", … in Title Case). At EVERY later spot where that block recurred, you MUST leave the bare header line — "# Chorus" — by itself (no body). This one-line cue is what tells the performer to sing the chorus there.
   - NEVER delete a repeated section without leaving its "# Chorus" cue in its place. Removing a chorus and leaving nothing is WRONG — the singer would not know to sing it.
   - So the number of "# Chorus" markers in your output must equal the number of times the chorus appeared in the input (one full one + a bare cue for each repeat).
   - Spell the label identically every time, and define a section before referencing it.
2. Consecutive identical lines. When the same line repeats back-to-back, keep one copy and append a repeat marker: "(x2)", "(x3)", … at the end of the line.
3. Keep real section labels as "# Label" lines. Collapse 3+ blank lines to one.

Before you finish, re-check: does every place the chorus originally appeared still have a "# Chorus" line? If any is missing, add it back.

If the song has no exact repeats, return it essentially unchanged (it is already as short as it safely gets).

Output ONLY the condensed chart text. No commentary, no explanation, no Markdown code fences.`;

export async function condenseChart(text, { model } = {}) {
  if (!text || !text.trim()) {
    const err = new Error('Nothing to condense — the chart is empty.');
    err.code = 'empty';
    throw err;
  }
  const data = await callClaude({
    ...(model ? { model } : {}),
    max_tokens: 8000,
    output_config: { effort: 'low' },
    system: CONDENSE_SYSTEM,
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

// ── Find duplicate songs ────────────────────────────────────────────────────
// Scan the library for entries that are the SAME song saved more than once —
// including alternate spellings/titles, "(Live)"/"(Acoustic)" variants, and
// featured-artist or typo differences — without flagging genuinely different
// songs that merely share a title word. Pure reasoning, no web search.
// `songs` is [{ id, metadata }]. Result: array of { reason, songs:[songObj…] }.
export async function findDuplicateSongs({ songs = [], model } = {}) {
  const list = songs.slice(0, 400).map((s, i) => ({
    n: i + 1,
    title: s.metadata?.title || 'Untitled',
    artist: s.metadata?.artist || '',
    key: s.metadata?.key || '',
  }));
  if (list.length < 2) return [];

  const system = `You find duplicate songs in a musician's library. You are given a numbered list of songs. Identify GROUPS of entries that are the SAME song saved more than once.

Count as the same song: identical titles; alternate spellings, punctuation, or capitalisation; "(Live)", "(Acoustic)", "(Remastered)" and similar variants of the same recording; featured-artist differences; and obvious typos.
Do NOT group songs that are merely by the same artist, or that just share a word in the title — they must genuinely be the same composition.

Respond with ONLY a JSON array (no prose, no code fence) of groups, each group having 2 or more entries:
[{"reason":"short why they match, e.g. 'same song, live vs studio'","songs":[<numbers>]}]
If there are no duplicates, return [].`;

  const data = await callClaude({
    ...(model ? { model } : {}),
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: JSON.stringify(list) }],
  });
  const json = extractJson(textOf(data));
  const groups = Array.isArray(json) ? json : [];
  return groups
    .map((g) => ({
      reason: String(g?.reason || '').trim(),
      songs: (Array.isArray(g?.songs) ? g.songs : [])
        .map((n) => songs[Number(n) - 1])
        .filter(Boolean),
    }))
    .filter((g) => g.songs.length >= 2);
}

// ── Suggest songs to learn ──────────────────────────────────────────────────
// Personal recommendations: real songs to learn next, matched to the player's
// instrument, skill level, and taste (explicit genres/artists AND the songs
// already in their library). Web-search grounded so the songs and their chord
// sources are real, and deduped against what they already have.
// Result: array of { title, artist, why, difficulty, url }.
export async function suggestSongsToLearn({ instrument, level, genres = [], artists = '', haveTitles = [], model } = {}) {
  const inst = instrument
    ? instrument.charAt(0).toUpperCase() + instrument.slice(1)
    : 'Guitar';
  const genreLine = genres.length ? genres.join(', ') : '(not specified — infer their taste from the library below)';
  const artistLine = (artists || '').trim() || '(none given)';
  // Cap the library sample so the prompt stays lean; it's for taste + dedup.
  const have = haveTitles.slice(0, 60);
  const haveBlock = have.length
    ? `Songs already in their library — use these to gauge taste, and do NOT recommend any of them:\n${have.map(t => `- ${t}`).join('\n')}`
    : 'Their library is empty, so lean on the stated genres/artists.';

  const system = `You recommend songs for a musician to learn next. They play ${inst} at a ${level || 'intermediate'} level. Suggest real, well-known songs that suit their instrument, skill level, and taste.

Genres they like: ${genreLine}
Favorite artists: ${artistLine}

${haveBlock}

Do at most TWO or THREE web searches to ground your picks in real songs and to find one chord/tab source per song (prefer ${inst.toLowerCase()} sources). Pick songs that genuinely fit their level — not too trivial, not out of reach — and spread across their taste. Then respond with ONLY a JSON array (no prose, no code fence) of up to 8 objects:
[{"title":"…","artist":"…","why":"one short phrase on why it fits them","difficulty":"a 2-4 word note relative to their level, e.g. 'easy — 4 chords' or 'a stretch'","url":"https://… a real chord/tab page you found"}]
Only include songs you are confident are real, and URLs you actually found via search. Never repeat a song from their library. If you can't find good matches, return [].`;

  const data = await callClaude({
    ...(model ? { model } : {}),
    max_tokens: 2500,
    output_config: { effort: 'low' },
    system,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
    messages: [{ role: 'user', content: `Suggest ${inst} songs for me to learn.` }],
  });
  const json = extractJson(textOf(data));
  const arr = Array.isArray(json) ? json : [];
  return arr
    .filter((r) => r && (r.title || r.artist))
    .slice(0, 8)
    .map((r) => ({
      title: String(r.title || '').trim(),
      artist: String(r.artist || '').trim(),
      why: String(r.why || '').trim(),
      difficulty: String(r.difficulty || '').trim(),
      url: typeof r.url === 'string' && /^https?:\/\//.test(r.url) ? r.url : '',
    }));
}

// ── Suggest songs that fit THIS set ─────────────────────────────────────────
// The set-scoped sibling of suggestSongsToLearn. Same return shape, so both feed
// the same dialog — but the brief is different in kind: "songs to learn" asks
// what suits the PLAYER, this asks what would sit well beside the songs already
// in a set. Taste prefs still go in, but as a tiebreaker under the set's own
// character rather than as the main signal.
export async function suggestSongsForSet({
  instrument, level, genres = [], artists = '', setName = '', setSongs = [], haveTitles = [], model,
} = {}) {
  const inst = instrument
    ? instrument.charAt(0).toUpperCase() + instrument.slice(1)
    : 'Guitar';
  // Key and tempo go in where the song has them: they say more about whether a
  // suggestion will sit next to these than the titles alone do.
  const inSet = setSongs.slice(0, 40).map((s) => {
    const name = [s.artist, s.title].filter(Boolean).join(' — ') || s.title || 'Untitled';
    const extra = [s.key && `key ${s.key}`, s.tempo && `${s.tempo} bpm`].filter(Boolean).join(', ');
    return extra ? `- ${name} (${extra})` : `- ${name}`;
  }).join('\n');
  if (!inSet) return [];

  const genreLine = genres.length ? genres.join(', ') : '(not specified — go by the set)';
  const artistLine = (artists || '').trim() || '(none given)';
  // Dedup list: only present when "Personalize from my library" is on, so the
  // caller's privacy choice decides whether the library leaves the device.
  const have = haveTitles.slice(0, 60);
  const haveBlock = have.length
    ? `Also already in their library — do NOT recommend any of these either:\n${have.map(t => `- ${t}`).join('\n')}`
    : '';

  const system = `You suggest songs that would fit an existing setlist. The musician plays ${inst} at a ${level || 'intermediate'} level.

The set${setName ? ` is called "${setName}" and` : ''} currently holds:
${inSet}

Work out what this set IS — its genre, era, energy, mood, and roughly where it sits in key and tempo — and suggest songs that would sit naturally beside these. Match the set first; their general taste below is only a tiebreaker between otherwise equal picks.

Genres they like: ${genreLine}
Favorite artists: ${artistLine}

Never suggest a song already in the set above.
${haveBlock}

Do at most TWO or THREE web searches to ground your picks in real songs and to find one chord/tab source per song (prefer ${inst.toLowerCase()} sources). Then respond with ONLY a JSON array (no prose, no code fence) of up to 8 objects:
[{"title":"…","artist":"…","why":"one short phrase on why it fits THIS set — name what it shares with the songs above","difficulty":"a 2-4 word note relative to their level","url":"https://… a real chord/tab page you found"}]
Only include songs you are confident are real, and URLs you actually found via search. If nothing fits well, return [].`;

  const data = await callClaude({
    ...(model ? { model } : {}),
    max_tokens: 2500,
    output_config: { effort: 'low' },
    system,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
    messages: [{ role: 'user', content: `Suggest songs that would fit this set.` }],
  });
  const json = extractJson(textOf(data));
  const arr = Array.isArray(json) ? json : [];
  return arr
    .filter((r) => r && (r.title || r.artist))
    .slice(0, 8)
    .map((r) => ({
      title: String(r.title || '').trim(),
      artist: String(r.artist || '').trim(),
      why: String(r.why || '').trim(),
      difficulty: String(r.difficulty || '').trim(),
      url: typeof r.url === 'string' && /^https?:\/\//.test(r.url) ? r.url : '',
    }));
}

// ── Fill in song details ────────────────────────────────────────────────────
// Read the chart and suggest metadata. Returns
// { title, artist, key, tempo, duration, youtubeUrl } — any field may be '' when
// it can't be established. key comes from the chords; tempo/duration/youtube are
// web-search-grounded best guesses for the known recording (the YouTube URL is
// only kept if it's a real link the model found, never a hallucinated video id).
const YT_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)/i;

// The fields this tool can fill, in the order they're offered. Exported so the
// editor's pick-what-to-check dialog and the prompt below are built from ONE
// list — a field added here shows up in both, and the labels can't drift apart.
export const FILL_FIELDS = [
  { field: 'title',      label: 'Title' },
  { field: 'artist',     label: 'Artist' },
  { field: 'key',        label: 'Key' },
  { field: 'timeSig',    label: 'Time signature' },
  { field: 'tempo',      label: 'Tempo (BPM)' },
  { field: 'duration',   label: 'Duration' },
  { field: 'youtubeUrl', label: 'YouTube' },
];
const ALL_FILL = FILL_FIELDS.map(f => f.field);

const FILL_RULES = {
  title:      '- title: the song\'s real title. Use the chart plus what you know; "" if genuinely unsure.',
  artist:     '- artist: the performer of the best-known/original recording; "" if genuinely unsure.',
  key:        '- key: infer the most likely key from the CHORDS in the chart (e.g. "G", "Em", "Bb"). Minor keys end in "m". "" if ambiguous.',
  // Used instead of `key` when there is no chart text to read the chords from.
  keyNoChart: '- key: the key of the best-known/original recording (e.g. "G", "Em", "Bb"). Minor keys end in "m". There is no chart to read, so this is a fact about the recording — "" if you are not reasonably sure.',
  timeSig:    '- timeSig: the metre of that recording as "beats/value" (e.g. "4/4", "3/4", "6/8", "12/8"). Most popular songs are 4/4; waltzes are 3/4; many folk, blues and worship songs are 6/8 or 12/8. Say "" rather than defaulting to "4/4" when you are not reasonably sure.',
  tempo:      '- tempo: approximate BPM of the well-known recording, as a plain integer string (e.g. "72"). "" if you don\'t know.',
  duration:   '- duration: length of that recording as M:SS (e.g. "4:05"). "" if you don\'t know.',
  // A video id is an opaque 11-character string: it cannot be reasoned out, only
  // copied. So the rule names the search to run and insists the URL come back
  // verbatim from a result. The refusal clause stays — an invented id passes the
  // regex check below and lands the user on a dead video, which is worse than an
  // empty field.
  youtubeUrl: '- youtubeUrl: run a search of your own for this ONE field — query `"<artist>" "<title>" site:youtube.com` (add "official video" or "official audio" if that returns nothing) — and copy a watch URL VERBATIM out of the results (https://www.youtube.com/watch?v=… or https://youtu.be/…). Do not reconstruct or remember a video id: if no search result gave you one, use "". A wrong id is worse than no link.',
};
// Only `key` is derived from the chart itself; everything else is a fact about a
// recording that has to be looked up. Asking for key alone therefore needs no
// web search at all — skip the tool rather than pay for a search nobody wanted.
const NEEDS_SEARCH = new Set(['title', 'artist', 'timeSig', 'tempo', 'duration', 'youtubeUrl']);

// `onStage` is optional and purely cosmetic: it reports { phase, ... } as the
// request runs — 'search' while the web is being consulted, 'writing' as the
// answer is produced — so the dialog can show progress instead of a spinner.
// Nothing about the result depends on it.
export async function fillSongDetails(text, hint = {}, model, fields = ALL_FILL, onStage) {
  const chart = (text || '').trim();
  // The user's existing title/artist always go in as CONTEXT even when they
  // weren't ticked — they're how the song gets identified at all.
  const known = [hint.title && `title "${hint.title}"`, hint.artist && `artist "${hint.artist}"`]
    .filter(Boolean).join(', ');
  // A PDF lead sheet keeps its chart in the image, so there may be no text to
  // read — but a title is still enough to identify the song and research the
  // rest. Only refuse when there's neither.
  if (!chart && !known) {
    const err = new Error('Nothing to go on — add a title, or some chords, first.');
    err.code = 'empty';
    throw err;
  }
  // Only what was asked for. An unknown name can't widen the request.
  const want = ALL_FILL.filter(f => fields.includes(f));
  if (want.length === 0) {
    const err = new Error('Nothing selected to look up.');
    err.code = 'empty';
    throw err;
  }
  // With no chart, `key` stops being readable off the chords and becomes another
  // fact about the recording — so it needs the web search the others do.
  const search = want.some(f => NEEDS_SEARCH.has(f)) || (!chart && want.includes('key'));
  // Two searches covered the whole request, so a YouTube lookup competed with
  // tempo, duration and time signature and usually lost — the field came back
  // empty about 60% of the time on a first pass. The video needs a search of
  // its own, so buy one when it is asked for. Named rather than inlined because
  // the progress bar needs it as a denominator.
  const budget = want.includes('youtubeUrl') ? 4 : 2;
  const template = `{${want.map(f => `"${f}": ""`).join(', ')}}`;
  const rule = (f) => (f === 'key' && !chart) ? FILL_RULES.keyNoChart : FILL_RULES[f];

  const system = `${chart
    ? "You read a chord chart and fill in metadata for a musician's app."
    : "You fill in metadata for a musician's app. This song is a PDF lead sheet, so there is NO chart text to read — identify it from the title and artist below."
  }${known ? ` The user already set: ${known}.` : ''}

${search ? 'Identify the song, then use web search to confirm details about the best-known/original recording. ' : ''}The user asked you to work out ONLY these fields: ${want.join(', ')}. Respond with ONLY a JSON object (no prose, no code fence) containing exactly those keys:
${template}
Rules:
${want.map(rule).join('\n')}
When unsure, prefer "". Do not include any key that is not listed above.`;

  // Streamed rather than fetched whole. The answer is the same single JSON
  // object either way — what streaming buys is the ability to SEE the wait:
  // which searches ran and how much has been written. This is the slowest AI
  // action in Cue and the only one that searches, so it is the one where a
  // silent spinner is hardest to tell apart from a hang.
  const raw = await streamClaude({
    ...(model ? { model } : {}),
    max_tokens: 1200,
    output_config: { effort: 'low' },
    system,
    ...(search ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: budget }] } : {}),
    // With no chart there's nothing to paste, so name the song instead — the
    // Messages API still needs a user turn.
    messages: [{ role: 'user', content: chart ? chart.slice(0, 8000) : `The song is: ${known}.` }],
  },
  // Write progress is counted, not estimated: the reply is a JSON object with a
  // known set of keys, so the keys that have appeared so far are exactly how far
  // through it is.
  onStage ? (acc) => onStage({ phase: 'writing', wrote: want.filter(f => acc.includes(`"${f}"`)).length, of: want.length }) : undefined,
  onStage ? (s) => onStage({ phase: 'search', ...s, budget }) : undefined);

  const j = extractJson(raw) || {};
  const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const tempo = str(j.tempo).match(/\d{2,3}/)?.[0] || '';       // integer BPM only
  const duration = /^\d{1,2}:\d{2}$/.test(str(j.duration)) ? str(j.duration) : '';
  const youtubeUrl = YT_RE.test(str(j.youtubeUrl)) ? str(j.youtubeUrl) : '';   // real YT link only
  // Everything the caller didn't ask for stays '' even if the model volunteered
  // it, so an unticked field can never reach the suggestions list.
  // timeSigOrEmpty, not normalizeTimeSig: an unparseable answer must come back
  // '' and drop out of the suggestions, never as a default-looking "4/4".
  const all = { title: str(j.title), artist: str(j.artist), key: str(j.key), timeSig: timeSigOrEmpty(str(j.timeSig)), tempo, duration, youtubeUrl };
  const out = {};
  for (const f of ALL_FILL) out[f] = want.includes(f) ? all[f] : '';
  return out;
}

// ── Chord shapes (fill the library's gaps) ──────────────────────────────────
// Given chord NAMES with no diagram, return playable voicings for the instrument
// as { name, frets: [ints] } (frets: 0 open, -1 muted, >0 fret). Length matches
// the tuning. Invalid/unplayable entries are dropped.
export async function chordShapesFor(names, { instrument = 'ukulele', tuning = ['G', 'C', 'E', 'A'], level, model } = {}) {
  const list = [...new Set((names || []).map((n) => (n || '').trim()).filter(Boolean))];
  if (list.length === 0) return [];
  const n = tuning.length;

  const system = `You are a chord-library assistant for a ${instrument} app. The instrument has ${n} strings tuned ${tuning.join('-')} (as written below, that string order, low to high). ${levelLine(level)}
For each chord name given, provide ONE common, easy-to-play ${instrument} voicing near the nut. Respond with ONLY a JSON array (no prose, no code fence):
[{"name": "<chord name exactly as given>", "frets": [${tuning.map(() => 'n').join(', ')}]}]
- "frets" has exactly ${n} integers, one per string in the tuning order above: 0 = open string, a positive number = that fret, -1 = muted/not played.
- Prefer the easiest standard shape in a low position. Real, playable fingerings only — never invent an impossible shape.
- With ${n} strings you often have FEWER strings than an extended or altered chord has notes (11ths, 13ths, 7#5#9 and the like). That is normal and is NOT a reason to refuse: voice them as players actually do, dropping the least essential tones — the 5th first, then the root or 9th — while keeping what defines the chord (the 3rd, the 7th, and any named alteration).
- Omit a chord only if you truly cannot produce a playable approximation. Returning nothing for a chord a player could finger is a failure.`;

  const data = await callClaude({
    ...(model ? { model } : {}),
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
export async function askMusic(question, ctx = {}, onText, model) {
  if (!question || !question.trim()) {
    const err = new Error('Type a question first.');
    err.code = 'empty';
    throw err;
  }
  const { title, artist, key, tempo, timeSig, instrument, level, chart } = ctx;
  const songBits = [
    title && `Title: ${title}`,
    artist && `Artist: ${artist}`,
    key && `Key: ${key}`,
    tempo && `Tempo: ${tempo} BPM`,
    timeSig && `Time signature: ${timeSig}`,
    instrument && `Instrument: ${instrument}`,
  ].filter(Boolean).join(' · ');

  const system = `You are a knowledgeable, friendly music assistant inside a musician's chord/lyric app. Answer questions about playing, theory, chords, technique, songs and performance. ${levelLine(level)}
Stay on music; if asked something off-topic, gently steer back. Be concise — a few short paragraphs or a tight list, no preamble. Plain text (you may use "-" bullets); no Markdown headers or code fences.

For chord shapes / fingerings, answer in TEXT as fret numbers per string, one shape per line — for ukulele use string order g-C-E-A (e.g. "Dm9: 5 5 5 5"), for guitar six numbers low-to-high E-A-D-G-B-e with x for muted. Offer one or two common, easy shapes. NEVER draw ASCII chord diagrams, fretboard grids, or tab art — they render badly here and are slow; describe shapes in words/numbers only.

For a strumming (or picking) pattern, give it as TEXT: D = downstroke, U = upstroke, x = muted/chuck, - = rest, aligned under the beat counts and matched to the time signature. Example (4/4): "D - D U - U D U" over "1 & 2 & 3 & 4 &". Add one short line on the feel/tempo, and a simpler pattern if the player is a beginner. No tab art.${songBits ? `\n\nThe user is currently working on a song — use this only if the question relates to it:\n${songBits}${chart ? `\n\nChart:\n${chart.slice(0, 4000)}` : ''}` : ''}`;

  // Thinking off + low effort so the first words appear fast (a chord-shape
  // question otherwise triggers a long silent "thinking" phase). Stream so the
  // answer builds live in the popup. `model` overrides the default (used by
  // "Try again — smarter model").
  return streamClaude({
    ...(model ? { model } : {}),
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
// `onProgress(fraction)` is optional. Unlike the two echo tools there is no
// input to measure against here, so the fraction counts the three top-level keys
// of the reply's known shape as each one appears. Coarse — three steps — but
// each step is a thing that really arrived, and the spinner beside it carries
// the time in between.
export async function transposeAdvice(ctx = {}, model, onProgress) {
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

  const ADVICE_KEYS = ['summary', 'keys', 'capo'];
  const raw = await streamClaude({
    ...(model ? { model } : {}),
    max_tokens: 1200,
    output_config: { effort: 'medium' },
    system,
    messages: [{ role: 'user', content: userText }],
  }, onProgress ? (acc) => onProgress(ADVICE_KEYS.filter(k => acc.includes(`"${k}"`)).length / ADVICE_KEYS.length) : undefined);
  const j = extractJson(raw) || {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    summary: s(j.summary),
    keys: Array.isArray(j.keys) ? j.keys.filter(k => k && s(k.key)).map(k => ({ key: s(k.key), why: s(k.why) })).slice(0, 4) : [],
    capo: Array.isArray(j.capo) ? j.capo.filter(c => c && Number.isFinite(+c.fret)).map(c => ({ fret: +c.fret, shapes: s(c.shapes), why: s(c.why) })).slice(0, 4) : [],
  };
}
