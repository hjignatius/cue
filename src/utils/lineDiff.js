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

  const rows = [];
  let i = 0, j = 0;
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

  return { rows, approximate: false };
}

/** How many aligned rows differ — for "12 differences" without walking it twice. */
export function countChanges(rows) {
  return rows.reduce((n, r) => n + (r.same ? 0 : 1), 0);
}
