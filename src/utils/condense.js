// Deterministic song condense / expand — NO AI, so it's reliable and instant
// (exact-repeat detection is mechanical; the model was inconsistent at it).
//
// Condense: collapse each EXACT-repeat block (e.g. a chorus) to a one-line
// "(Chorus)" cue after its first full occurrence, so the performer still sees
// where to sing it — and collapse back-to-back identical lines to an "(xN)"
// marker. Expand reverses it, writing the cues back out in full.
//
// Blocks are separated by blank lines. Works on inline-bracket text (the caller
// converts over-lyrics → brackets first). Chords and lyrics are never altered —
// only whole identical blocks are moved/relabelled.

function splitBlocks(text) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') { if (cur.length) { blocks.push(cur); cur = []; } }
    else cur.push(l);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

const blockKey = b => b.map(l => l.trim()).join('\n');
const headerOf = b => { const m = b[0]?.trim().match(/^#\s*(.+)$/); return m ? m[1].trim() : null; };

// Collapse runs of identical adjacent lines within a block into "line (xN)".
function collapseAdjacent(lines) {
  const out = [];
  for (let i = 0; i < lines.length; ) {
    let n = 1;
    while (i + n < lines.length && lines[i + n].trim() !== '' && lines[i + n].trim() === lines[i].trim()) n++;
    out.push(n > 1 ? `${lines[i]} (x${n})` : lines[i]);
    i += n;
  }
  return out;
}

export function condenseStructure(text) {
  const blocks = splitBlocks(text);
  // Count multi-line blocks (2+ lines) to find true repeats.
  const counts = new Map();
  for (const b of blocks) if (b.length >= 2) { const k = blockKey(b); counts.set(k, (counts.get(k) || 0) + 1); }
  // Order repeated blocks by first appearance; give each a label.
  const order = [];
  for (const b of blocks) { const k = blockKey(b); if (b.length >= 2 && counts.get(k) >= 2 && !order.includes(k)) order.push(k); }
  const label = new Map();
  order.forEach((k, i) => label.set(k, i === 0 ? 'Chorus' : `Chorus ${i + 1}`));

  const out = [];
  const defined = new Set();
  for (const b of blocks) {
    const k = blockKey(b);
    if (label.has(k)) {
      // If the block already carries its own "# Header", keep that as the label.
      const own = headerOf(b);
      const lab = own || label.get(k);
      if (!defined.has(k)) {
        defined.add(k);
        // Definition: keep the full block once, headed by "# Label" (add one if
        // the block didn't already have a header).
        if (own) out.push(...collapseAdjacent(b), '');
        else out.push(`# ${lab}`, ...collapseAdjacent(b), '');
      } else {
        out.push(`(${lab})`, '');           // later occurrence → one-line cue
      }
    } else {
      out.push(...collapseAdjacent(b), '');
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

export function expandStructure(text) {
  const blocks = splitBlocks(text);
  // Map label -> body (a "# Label" block's lines after the header).
  const bodyFor = new Map();
  for (const b of blocks) {
    const lab = headerOf(b);
    if (lab && b.length >= 2) bodyFor.set(lab, b.slice(1));
  }
  const cueRe = /^\(([^)]+)\)$/;
  const out = [];
  for (const b of blocks) {
    if (b.length === 1) {
      const m = b[0].trim().match(cueRe);
      if (m && bodyFor.has(m[1].trim())) { out.push(`# ${m[1].trim()}`, ...bodyFor.get(m[1].trim()), ''); continue; }
    }
    out.push(...b, '');
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

// True when a condensed song has any "(Label)" cue that expandStructure can
// re-inflate — lets the editor show Expand only when it will do something.
export function hasCondensedCues(text) {
  return splitBlocks(text).some(b => b.length === 1 && /^\([^)]+\)$/.test(b[0].trim()));
}
