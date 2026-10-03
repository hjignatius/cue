// Separate libraries, and the one thing that must never go wrong: Main is the
// database Cue has always used, under the name it has always used. If that is
// not exactly true, a device that opens Settings once finds its songs gone.
//
// Run: node scripts/libraryCheck.mjs
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  clear: () => mem.clear(),
  get length() { return mem.size; },
};

const lib = await import('../src/utils/library.js');
const { listLibraries, activeLibrary, createLibrary, dbNameFor, libSuffix, scopedKey, isMainLibrary, MAIN_LIBRARY } = lib;

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

// ---- Inert by default. This is the check that matters most.
check('starts in Main', activeLibrary(), MAIN_LIBRARY);
check('Main is the original database name', dbNameFor(), 'cue-db');
check('Main scopes no keys', scopedKey('cue:draft'), 'cue:draft');
check('Main adds no suffix', libSuffix(), '');
check('only Main exists at first', listLibraries(), [MAIN_LIBRARY]);
check('and isMainLibrary agrees', isMainLibrary(), true);

// ---- Creating
check('a library can be created', createLibrary('Test'), 'Test');
check('it is listed after Main', listLibraries(), [MAIN_LIBRARY, 'Test']);
check('the same name twice is refused', createLibrary('Test'), null);
check('so is Main', createLibrary(MAIN_LIBRARY), null);
check('so is an empty name', createLibrary('   '), null);

// ---- A second library is genuinely separate
check('its database is its own', dbNameFor('Test'), 'cue-db:Test');
check('and its keys are its own', libSuffix('Test'), '::Test');
check('two libraries never share a database name', dbNameFor(MAIN_LIBRARY) === dbNameFor('Test'), false);

// ---- Switching is remembered, and survives a deleted library
localStorage.setItem('cue:active_library', JSON.stringify('Test'));
check('the active library is remembered', activeLibrary(), 'Test');
check('its keys are scoped while it is active', scopedKey('cue:published_sets'), 'cue:published_sets::Test');
check('and it is not Main', isMainLibrary(), false);

localStorage.setItem('cue:libraries', JSON.stringify([]));
check('an active library that no longer exists falls back to Main', activeLibrary(), MAIN_LIBRARY);
check('and the fallback un-scopes the keys with it', scopedKey('cue:draft'), 'cue:draft');

// ---- Garbage in the list cannot break the list
localStorage.setItem('cue:libraries', JSON.stringify([null, 3, '', 'Good', MAIN_LIBRARY]));
check('rubbish entries are ignored', listLibraries(), [MAIN_LIBRARY, 'Good']);
localStorage.setItem('cue:libraries', 'not json at all');
check('unparseable storage falls back to Main alone', listLibraries(), [MAIN_LIBRARY]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
