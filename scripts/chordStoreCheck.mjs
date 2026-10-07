// Regression suite for the custom/hidden chord stores.
//
// The bug this exists for: the chord panel kept the custom library in React
// state from mount and wrote that snapshot back whole on every edit, so a shape
// saved in between — e.g. a Cdim7 added by the AI voicings tool while the panel
// was open — was silently erased by the next panel edit. It still showed on
// screen (the panel merges editor-added shapes in for display), so the loss only
// surfaced days later in a backup that was missing a chord the app had shown.
//
// Run: node scripts/chordStoreCheck.mjs

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => store.clear(),
};

const {
  loadCustomChords, saveCustomChords, mutateCustomChords,
  loadHiddenChords, saveHiddenChords, mutateHiddenChords,
} = await import('../src/utils/chordStorage.js');

const UKE = 'ukulele_gcea';
let pass = 0, fail = 0;

function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

const names = arr => arr.map(c => c.name);
const shape = (name, frets) => ({ name, type: 'custom', frets });

function reset(chords = []) {
  store.clear();
  saveCustomChords(UKE, chords);
}

// ---- 1. the reported failure -----------------------------------------------
// Panel renders (snapshot), the AI tool saves Cdim7, then the panel deletes an
// unrelated shape. Cdim7 must survive the panel's write.
reset([shape('C', [0, 0, 0, 3]), shape('G7', [0, 2, 1, 2])]);
const snapshot = loadCustomChords(UKE);                      // panel's render-time copy
mutateCustomChords(UKE, cur => [...cur, shape('Cdim7', [2, 3, 2, 3])]); // AI tool
mutateCustomChords(UKE, cur => cur.filter(c => c.name !== 'G7'));       // panel delete
check('AI-added shape survives a later panel delete', names(loadCustomChords(UKE)), ['C', 'Cdim7']);
check('the stale snapshot is genuinely stale', names(snapshot), ['C', 'G7']);

// The same panel edit written from the snapshot is what used to lose it.
reset([shape('C', [0, 0, 0, 3]), shape('G7', [0, 2, 1, 2])]);
const stale = loadCustomChords(UKE);
mutateCustomChords(UKE, cur => [...cur, shape('Cdim7', [2, 3, 2, 3])]);
saveCustomChords(UKE, stale.filter(c => c.name !== 'G7'));    // the old, broken write
check('snapshot write loses it (the bug, pinned)', names(loadCustomChords(UKE)), ['C']);

// ---- 2. add / edit / delete through the chokepoint --------------------------
reset([shape('C', [0, 0, 0, 3])]);
mutateCustomChords(UKE, cur => [...cur, shape('Am', [2, 0, 0, 0])]);
check('add appends', names(loadCustomChords(UKE)), ['C', 'Am']);

mutateCustomChords(UKE, cur => {
  const next = [...cur];
  const i = next.findIndex(c => c.name === 'Am' && c.frets.join(',') === '2,0,0,0');
  next[i] = shape('Am', [2, 4, 5, 3]);
  return next;
});
check('edit replaces in place, no duplicate row', loadCustomChords(UKE).filter(c => c.name === 'Am').map(c => c.frets.join('-')), ['2-4-5-3']);

mutateCustomChords(UKE, cur => cur.filter(c => !(c.name === 'Am' && c.frets.join(',') === '2,4,5,3')));
check('delete removes only the matching shape', names(loadCustomChords(UKE)), ['C']);

// ---- 3. idempotent add (both AI tools rely on it) --------------------------
reset([]);
const entry = shape('Cdim7', [2, 3, 2, 3]);
const same = c => c.name === entry.name && (c.frets || []).join(',') === entry.frets.join(',');
for (let i = 0; i < 3; i++) mutateCustomChords(UKE, cur => (cur.some(same) ? cur : [...cur, entry]));
check('adding the same shape twice is a no-op', loadCustomChords(UKE).length, 1);
// Same name, different voicing, is a different shape and must both be kept.
mutateCustomChords(UKE, cur => [...cur, shape('Cdim7', [5, 6, 5, 6])]);
check('same name + different frets both kept', loadCustomChords(UKE).map(c => c.frets.join('-')), ['2-3-2-3', '5-6-5-6']);

// ---- 4. mutate returns exactly what was stored -----------------------------
reset([]);
const returned = mutateCustomChords(UKE, () => [shape('F', [2, 0, 1, 0])]);
check('mutate returns the stored array', returned, loadCustomChords(UKE));

// ---- 5. instrument scoping -------------------------------------------------
reset([]);
mutateCustomChords(UKE, cur => [...cur, shape('Cdim7', [2, 3, 2, 3])]);
mutateCustomChords('guitar', cur => [...cur, shape('Cdim7', [-1, 3, 4, 2, 4, 2])]);
check('ukulele scope untouched by a guitar write', loadCustomChords(UKE).map(c => c.frets.length), [4]);
check('guitar scope holds its own', loadCustomChords('guitar').map(c => c.frets.length), [6]);
check('an unwritten scope reads empty', loadCustomChords('baritone'), []);

// ---- 6. legacy fallback still works ---------------------------------------
store.clear();
localStorage.setItem('cue_custom_chords', JSON.stringify([shape('C', [0, 0, 0, 3])]));
check('ukulele falls back to the legacy flat key', names(loadCustomChords(UKE)), ['C']);
check('other instruments do not', loadCustomChords('guitar'), []);
// A write creates the scoped key; the legacy key is left as a rollback copy.
mutateCustomChords(UKE, cur => [...cur, shape('Cdim7', [2, 3, 2, 3])]);
check('write lands in the scoped key', names(JSON.parse(localStorage.getItem('cue_custom_chords:ukulele_gcea'))), ['C', 'Cdim7']);
check('legacy key untouched', names(JSON.parse(localStorage.getItem('cue_custom_chords'))), ['C']);

// ---- 7. corrupt JSON reads as empty, not a crash --------------------------
store.clear();
localStorage.setItem('cue_custom_chords:ukulele_gcea', '{not json');
check('corrupt scoped value reads empty', loadCustomChords(UKE), []);

// ---- 8. hidden built-ins --------------------------------------------------
store.clear();
saveHiddenChords(UKE, ['C|0,0,0,3']);
const hiddenSnapshot = loadHiddenChords(UKE);
mutateHiddenChords(UKE, cur => [...cur, 'G7|0,2,1,2']);
mutateHiddenChords(UKE, cur => (cur.includes('F|2,0,1,0') ? cur : [...cur, 'F|2,0,1,0']));
check('hidden writes accumulate', loadHiddenChords(UKE), ['C|0,0,0,3', 'G7|0,2,1,2', 'F|2,0,1,0']);
check('hidden snapshot was stale too', hiddenSnapshot, ['C|0,0,0,3']);
mutateHiddenChords(UKE, cur => (cur.includes('G7|0,2,1,2') ? cur : [...cur, 'G7|0,2,1,2']));
check('hiding the same built-in twice is a no-op', loadHiddenChords(UKE).length, 3);


// ---- 9. tagged transfer: every instrument's library travels -----------------
//
// Before this, exports called loadCustomChords() with no argument, i.e. ukulele
// and only ukulele. A shape added on guitar was in no backup at all, and hidden
// built-ins travelled nowhere on any instrument.

const {
  chordLibrarySnapshot, hasTaggedChordLibraries, restoreChordLibraries,
  mergeTaggedSongCustoms, mergeCustomChords,
} = await import('../src/utils/fileIO.js');

const GTR = 'guitar';
const BAR = 'baritone_dgbe';
const gtrShape = (name, frets) => ({ name, type: 'custom', frets });

// A device with ukulele AND guitar customs, plus a hidden ukulele built-in.
store.clear();
saveCustomChords(UKE, [shape('Cdim7', [2, 3, 2, 3])]);
saveCustomChords(GTR, [gtrShape('Cdim7', [-1, 3, 4, 2, 4, 2])]);
saveHiddenChords(UKE, ['E7#9|1,2,1,2']);
const snap = chordLibrarySnapshot();

check('snapshot carries both instruments', Object.keys(snap.customChordsByInstrument).sort(), [GTR, UKE].sort());
check('snapshot carries hidden built-ins', snap.hiddenChordsByInstrument, { [UKE]: ['E7#9|1,2,1,2'] });
check('an unused instrument is left out', BAR in snap.customChordsByInstrument, false);
check('the tagged block is detected', hasTaggedChordLibraries(snap), true);

// THE HEADLINE: restore onto a bare device and the guitar shape is there.
store.clear();
const restored = restoreChordLibraries(snap, 'merge');
check('guitar custom survives a backup/restore', loadCustomChords(GTR).map(c => c.frets.length), [6]);
check('ukulele custom survives too', names(loadCustomChords(UKE)), ['Cdim7']);
check('hidden built-in survives', loadHiddenChords(UKE), ['E7#9|1,2,1,2']);
check('restore reports what it added', restored.customs, { [UKE]: 1, [GTR]: 1 });

// Merging the same file twice adds nothing a second time.
const again = restoreChordLibraries(snap, 'merge');
check('a second restore is a no-op', again.customs, { [UKE]: 0, [GTR]: 0 });
check('no duplicate guitar rows', loadCustomChords(GTR).length, 1);
check('no duplicate hidden entries', loadHiddenChords(UKE).length, 1);

// ---- 10. old untagged files restore exactly as they did ---------------------
const legacyBackup = { type: 'cue-backup', version: 3, customChords: [shape('C', [0, 0, 0, 3])] };
check('an untagged backup has no tagged block', hasTaggedChordLibraries(legacyBackup), false);
store.clear();
check('restoreChordLibraries declines it', restoreChordLibraries(legacyBackup, 'merge'), null);
check('...and touches nothing, so the caller can fall back', loadCustomChords(UKE), []);
mergeCustomChords(legacyBackup.customChords);          // the fallback path
check('the flat path still lands in ukulele', names(loadCustomChords(UKE)), ['C']);
check('and nowhere else', loadCustomChords(GTR), []);

// ---- 11. replace mode touches only the scopes the file carries -------------
store.clear();
saveCustomChords(UKE, [shape('C', [0, 0, 0, 3])]);
saveCustomChords(GTR, [gtrShape('G', [3, 2, 0, 0, 0, 3])]);
restoreChordLibraries({ customChordsByInstrument: { [UKE]: [shape('Am', [2, 0, 0, 0])] } }, 'replace');
check('replace overwrites the scope in the file', names(loadCustomChords(UKE)), ['Am']);
check('a scope absent from the file is left alone', names(loadCustomChords(GTR)), ['G']);

// ---- 12. a malformed block is ignored, not thrown --------------------------
store.clear();
restoreChordLibraries({
  customChordsByInstrument: { [UKE]: [{ name: 'X' }, { frets: [0, 0, 0, 0] }, shape('F', [2, 0, 1, 0])], [GTR]: 'nope' },
  hiddenChordsByInstrument: { [UKE]: [null, 7, 'F|2,0,1,0'] },
}, 'merge');
check('entries missing a name or frets are dropped', names(loadCustomChords(UKE)), ['F']);
check('a non-array scope is ignored', loadCustomChords(GTR), []);
check('non-string hidden keys are dropped', loadHiddenChords(UKE), ['F|2,0,1,0']);
check('an unknown instrument id is ignored', restoreChordLibraries({ customChordsByInstrument: { kazoo: [shape('C', [0])] } }, 'merge').customs, {});

// ---- 13. pulled songs land in the instrument they were published for -------
store.clear();
mergeTaggedSongCustoms([
  { customChords: [gtrShape('Cdim7', [-1, 3, 4, 2, 4, 2])], customChordsInstrument: GTR },
  { customChords: [shape('Cdim7', [2, 3, 2, 3])], customChordsInstrument: UKE },
  { customChords: [shape('Am', [2, 0, 0, 0])] },                      // untagged = ukulele, as before
  { customChords: [shape('F', [2, 0, 1, 0])], customChordsInstrument: 'kazoo' }, // unknown = ukulele
]);
check('a guitar publisher fills the guitar scope', loadCustomChords(GTR).map(c => c.frets.length), [6]);
check('ukulele gets its own, plus untagged and unknown', names(loadCustomChords(UKE)), ['Cdim7', 'Am', 'F']);
check('nothing leaks into baritone', loadCustomChords(BAR), []);
store.clear();
check('songs carrying no shapes add nothing', mergeTaggedSongCustoms([{}, { customChords: [] }]), 0);


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
