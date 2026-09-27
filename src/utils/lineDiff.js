// Line diff for comparing two copies of a song.
//
// Returns ALIGNED PAIRS — [{ l, r, same }] — rather than two independent lists.
// That is the whole point: both panes render from the same array, with a blank
// where one side has nothing, so line 40 on the left sits opposite line 40 on the
// right no matter how much was inserted above it. Two separately scrolled panes
// are not a comparison, they are two things to read.
//
// The same array also renders as a UNIFIED diff on a narrow screen: one column,
// the left line then the right line wherever they differ. Two columns of
// monospace chords do not fit a phone.
//
// WHY NOT LINE-BY-LINE: pairing line i with line i is one insertion away from
// useless — add a line near the top and every line after it reads as changed,
// which is exactly the case this is for. Hence a real longest-common-subsequence.
//
// AND WHY THE SECOND PASS: an LCS walk emits a changed block as every removal
// first, then every addition. Read as a list that is correct; shown in two
// columns it is useless — the old four lines sit opposite blank space, then the
// new two lines sit opposite blank space further down, and the two halves of one
// change never appear on the same row. pairChangedRuns puts them back together.

// Beyond this, the DP table stops being free: the cost is (n+1)*(m+1) 32-bit
// cells, so 1200 lines each is about 5.8MB. Songs run to a hundred lines or so;
// this is a guard against a pasted novel, not a real limit.
const MAX_LINES = 1200;

const splitLines = (t) => String(t ?? '').replace(/\r\n?/g, '\n').split('\n');

export function diffLines(leftText, rightText) {
  const a = splitLines(leftText);
  const b = splitLines(rightText);

  // Too big to align properly: fall back to positional pairing, which is wrong
  // in the presence of insertions but never worse than showing nothing.
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    const rows = [];
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      const l = k < a.length ? a[k] : null;
      const r = k < b.length ? b[k] : null;
      rows.push({ l, r, same: l === r });
    }
    return { rows, approximate: true };
  }

  const n = a.length, m = b.length;
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const walk = [];
  let i = 0, j = 0;
  const rows = walk;   // named for the loop below; paired before returning
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ l: a[i], r: b[j], same: true }); i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // Dropping a[i] keeps at least as much in common — so it is a removal.
      rows.push({ l: a[i], r: null, same: false }); i++;
    } else {
      rows.push({ l: null, r: b[j], same: false }); j++;
    }
  }
  while (i < n) rows.push({ l: a[i++], r: null, same: false });
  while (j < m) rows.push({ l: null, r: b[j++], same: false });

  return { rows: pairChangedRuns(walk), approximate: false };
}

// Put the two halves of a change on the same row.
//
// Take each run of consecutive changed rows and deal its removals and additions
// out side by side: old line 1 opposite new line 1, and so on. Where one side has
// more lines than the other the remainder pairs against blanks, which is honest —
// those lines really were added or removed outright.
//
// Order within the run does not matter, because the LCS can emit removals and
// additions interleaved; they are split by side and re-dealt.
function pairChangedRuns(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].same) { out.push(rows[i++]); continue; }
    const block = [];
    while (i < rows.length && !rows[i].same) block.push(rows[i++]);
    const dels = block.filter(r => r.r === null);
    const adds = block.filter(r => r.l === null);
    const pairs = Math.max(dels.length, adds.length);
    for (let k = 0; k < pairs; k++) {
      const l = dels[k]?.l ?? null;
      const r = adds[k]?.r ?? null;
      out.push({ l, r, same: false, minor: isSpacingOnly(l, r) });
    }
  }
  return out;
}

// Two lines that say the same thing with different spacing.
//
// WHY IT MATTERS: one copy typed with generous gaps and another typed tight are
// the same song, but an exact line comparison calls every single line changed and
// the whole chart lights up. With everything highlighted, nothing is — and the
// handful of lines that really did change are lost in it.
//
// WHITESPACE ONLY, deliberately. Not punctuation: stripping it would fold C# into
// C and quietly call two different chords the same line, which is precisely the
// difference someone opens this to find.
const collapse = (t) => String(t).replace(/\s+/g, ' ').trim();
function isSpacingOnly(l, r) {
  return l !== null && r !== null && l !== r && collapse(l) === collapse(r);
}

/**
 * Counts for the summary line: rows that really differ, and rows that differ only
 * in spacing, kept apart so the headline number means something.
 */
export function countChanges(rows) {
  let changed = 0, spacing = 0;
  for (const r of rows) {
    if (r.same) continue;
    if (r.minor) spacing++; else changed++;
  }
  return { changed, spacing };
}
