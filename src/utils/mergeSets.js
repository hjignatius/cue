// Merging one set into another.
//
// Two sets at a time, deliberately. "The other set's songs go on the end" has no
// visible answer for three or more: the selection is a Set, so its order is the
// order the boxes were ticked — invisible, and not the order shown on screen.
// Merging twice gives the same result and shows you each step.
//
// The TARGET survives. It keeps its id — and so its share link — its name unless
// you rename it, its songs, and their order. The source set is neither changed
// nor deleted; nothing is removed from the library either way.

// The songs the target ends up with: its own first, in their own order, then the
// source's that it does not already have.
//
// A song already in the target is refused rather than repeated. That keeps the
// position it already had (so a merge can never reorder what the target held),
// and it is not really optional: songIds is rendered by song id, so a repeat
// would collide on React keys and break drag-reorder.
export function mergedSongIds(targetSongIds = [], sourceSongIds = []) {
  const have = new Set(targetSongIds);
  const out = [...targetSongIds];
  for (const id of sourceSongIds) {
    // `have` grows as we go, so a song the SOURCE lists twice still arrives
    // once. A filter against the target alone would let that pair through and
    // put two rows with the same key in the merged set.
    if (!id || have.has(id)) continue;
    have.add(id);
    out.push(id);
  }
  return out;
}

// What the confirm step promises: how many songs arrive, how many are refused.
// Stated in real numbers because there is no undo — unpicking a merge you did
// not mean is deleting songs one at a time.
export function mergeCounts(targetSongIds = [], sourceSongIds = []) {
  const have = new Set(targetSongIds);
  let added = 0, skipped = 0;
  for (const id of sourceSongIds) {
    if (!id) continue;
    if (have.has(id)) skipped++; else { added++; have.add(id); }
  }
  return { added, skipped };
}

// Which set to offer as the one that survives.
//
// Publication follows a set's ID, never its name, so merging INTO the published
// set is what keeps its share link alive and serving the combined set — where a
// new set merely BEARING its name would leave the link on the old, now stale
// one. So when exactly one of the two is published, that is the default. When
// both are, or neither is, there is no reason to prefer either and the first is
// offered; the choice is the user's in every case.
export function defaultMergeTargetId(sets = [], isPublished = () => false) {
  if (!sets.length) return null;
  const published = sets.filter(s => isPublished(s.id));
  return (published.length === 1 ? published[0] : sets[0]).id;
}
