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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
