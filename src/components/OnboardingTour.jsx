import { useEffect, useState } from 'react';

const PAD = 10;
const TOOLTIP_W = 288;

const STEPS = [
  {
    selector: null,
    title: 'Welcome to Cue!',
    body: "Let's take a quick look around. You can skip this tour at any time.",
  },
  {
    selector: '[data-onboard="songs-panel"]',
    title: 'Your Song Library',
    body: 'All your songs live here. Double-tap a song to open it in the editor. Single-tap to select songs for batch export or delete. Search, sort, or filter by key at the top.',
  },
  {
    selector: '[data-onboard="new-song-btn"]',
    title: 'Create a New Song',
    body: 'Tap here to write a new song from scratch using ChordPro format.',
  },
  {
    selector: '[data-onboard="import-btn"]',
    title: 'Import Songs',
    body: 'Import ChordPro files (.cho, .txt), individual song JSON files, set bundles, or full Cue backups. When importing a set file, you\'ll be asked whether to skip or allow duplicate songs.',
  },
  {
    selector: '[data-onboard="sets-panel"]',
    title: 'Sets',
    body: 'Organize songs into named Sets — one per venue, event, or rehearsal. Tap a Set to load it into the Setlist. Long-press a Set to export it as a portable JSON file.',
  },
  {
    selector: '[data-onboard="setlist-panel"]',
    title: 'Setlist',
    body: 'Your active setlist appears here. Double-tap any song to open it in the editor. Drag songs to reorder. Tap Present to enter full-screen performance mode.',
  },
  {
    selector: null,
    title: 'Inside the Editor',
    body: 'The wand icon next to Key auto-detects the key from your chords. Add a YouTube URL in the metadata bar to pull up the track while you play. When opened from a list, use the Prev/Next arrows to navigate without going back.',
  },
];

function getRect(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function tooltipPosition(rect) {
  if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const approxH = 180;
  const gap = 14;

  let top = rect.bottom + gap;
  if (top + approxH > vh - 16) top = rect.top - approxH - gap;
  top = Math.max(12, Math.min(top, vh - approxH - 12));

  let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  left = Math.max(12, Math.min(left, vw - TOOLTIP_W - 12));

  return { top: `${top}px`, left: `${left}px` };
}

export default function OnboardingTour({ onDone }) {
  const [step, setStep] = useState(0);
  const [rect, setRect]   = useState(null);

  const current = STEPS[step];

  useEffect(() => {
    setRect(getRect(current.selector));
  }, [step, current.selector]);

  function advance() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else onDone();
  }

  function back() {
    if (step > 0) setStep(s => s - 1);
  }

  const highlightStyle = rect
    ? {
        position: 'fixed',
        top:    rect.top    - PAD,
        left:   rect.left   - PAD,
        width:  rect.width  + PAD * 2,
        height: rect.height + PAD * 2,
        borderRadius: 10,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
        border: '2px solid rgba(99,102,241,0.7)',
        zIndex: 9998,
        pointerEvents: 'none',
      }
    : null;

  return (
    <div
      className="fixed inset-0 z-[9997]"
      style={rect ? {} : { background: 'rgba(0,0,0,0.65)' }}
    >
      {highlightStyle && <div style={highlightStyle} />}

      <div
        className="fixed z-[9999] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 border border-gray-100 dark:border-gray-700"
        style={{ width: TOOLTIP_W, ...tooltipPosition(rect) }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-indigo-400 font-medium mb-0.5">
              {step + 1} of {STEPS.length}
            </p>
            <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-snug">
              {current.title}
            </h3>
          </div>
          <button
            onClick={onDone}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 mt-0.5 transition-colors"
          >
            Skip
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed -mt-1">
          {current.body}
        </p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${i === step ? 'w-4 h-1.5 bg-indigo-500' : 'w-1.5 h-1.5 bg-gray-300 dark:bg-gray-600'}`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={back}
              className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={advance}
            className="flex-1 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors"
          >
            {step < STEPS.length - 1 ? 'Next' : 'Get started'}
          </button>
        </div>
      </div>
    </div>
  );
}
