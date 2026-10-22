// The count-in click, and the context it plays on.
//
// On an iPad, plugging into a TV or unplugging from one parks the AudioContext
// in Safari's 'interrupted' state, which the metronome never checked for — so
// the count-in went silent until Cue was closed, while the button kept
// flashing. These drive playMetronome with a fake context through each state a
// real one can be found in, and check that every press ends up on a context
// that will make sound.
//
// Run: node scripts/metronomeCheck.mjs

let pass = 0, fail = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}\n      got:  ${g}\n      want: ${w}`);
}

// ---- a fake Web Audio ------------------------------------------------------
const made = [];
class FakeContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.closed = false;
    this.resumes = 0;
    this.scheduled = 0;
    this.destination = {};
    made.push(this);
  }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }
  createOscillator() {
    const ctx = this;
    return { frequency: {}, connect() {}, disconnect() {}, start() { ctx.scheduled++; }, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
  }
}

let wallMs = 10_000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => wallMs }, configurable: true });
globalThis.window = { AudioContext: FakeContext };

// Advance the wall clock and, for a healthy context, its audio clock with it.
function wait(ms, ctx, { clockRuns = true } = {}) {
  wallMs += ms;
  if (ctx && clockRuns && ctx.state === 'running') ctx.currentTime += ms / 1000;
}

const { playMetronome } = await import('../src/utils/metronome.js');
const current = () => made[made.length - 1];

// ---- 1. the first press ----------------------------------------------------
playMetronome(120, '4/4');
check('first press makes one context', made.length, 1);
check('and schedules two bars of 4/4', current().scheduled, 8);

// ---- 2. a healthy context is reused ---------------------------------------
let ctx = current();
wait(5000, ctx);
playMetronome(120, '4/4');
check('a running context is kept, not replaced', made.length, 1);
check('and the count-in lands on it', ctx.scheduled, 16);

// ---- 3. suspended: resumed, as it always was -------------------------------
wait(3000, ctx);
ctx.state = 'suspended';
playMetronome(120, '4/4');
check('suspended is resumed', ctx.resumes, 1);
check('suspended is not replaced', made.length, 1);

// ---- 4. interrupted: the TV case -------------------------------------------
wait(3000, ctx);
ctx.state = 'interrupted';
playMetronome(120, '4/4');
check('interrupted is replaced', made.length, 2);
check('the old context is closed, not leaked', ctx.closed, true);
check('the count-in plays on the new one', current().scheduled, 8);
check('the new one is running', current().state, 'running');

// ---- 5. closed --------------------------------------------------------------
ctx = current();
wait(3000, ctx);
ctx.state = 'closed';
playMetronome(100, '3/4');
check('closed is replaced', made.length, 3);
check('3/4 counts two bars of three', current().scheduled, 6);

// ---- 6. "running" but deaf: the clock stopped -----------------------------
ctx = current();
wait(4000, ctx, { clockRuns: false });   // state still says running
playMetronome(120, '4/4');
check('a running context whose clock stalled is replaced', made.length, 4);
check('and closed', ctx.closed, true);

// ---- 7. no false alarms -----------------------------------------------------
ctx = current();
wait(300, ctx, { clockRuns: false });    // too soon to judge
playMetronome(120, '4/4');
check('a quick second press never replaces', made.length, 4);

wait(5000, current());                   // clock keeps pace
playMetronome(120, '4/4');
check('a clock keeping pace is left alone', made.length, 4);

ctx = current();
wallMs += 4000; ctx.currentTime += 3.2;  // a little behind, still sounding
playMetronome(120, '4/4');
check('a clock running slightly slow is left alone', made.length, 4);

// ---- 8. nothing to play -----------------------------------------------------
const before = made.length;
playMetronome(0);
playMetronome(-5);
playMetronome('');
check('no tempo plays nothing and makes nothing', made.length, before);

globalThis.window = {};
const noAudio = await import('../src/utils/metronome.js?no-audio');
check('no Web Audio at all is survivable', (() => {
  try { noAudio.playMetronome(120); return 'ok'; } catch (e) { return e.message; }
})(), 'ok');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
