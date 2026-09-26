import { Loader2, X } from 'lucide-react';

// One sentence, one place. Every AI surface hedges in the SAME words rather than
// each inventing its own — so the caution reads as a property of Cue's AI, not
// as a quirk of whichever dialog you happen to be in.
export const AI_CAUTION = 'AI can get things wrong — check anything that matters.';

// The waiting state for an AI dialog: what it's doing, plus the caution. The
// wait is dead time, so setting expectations here costs nothing and adds no
// clutter to the answer.
//
// It is NOT a substitute for the caution on the result. This disappears the
// moment the answer arrives — which is exactly when someone is deciding whether
// to trust it — so any result stating checkable facts carries AiCaution too.
export function AiWaiting({ label, dark, onCancel }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <div className={`flex items-center gap-2 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        <Loader2 size={16} className="animate-spin" /> {label}
      </div>
      <AiCaution dark={dark} center />
      <CancelLink onCancel={onCancel} dark={dark} />
    </div>
  );
}

// The way out of a wait. Present on every AI wait, because the alternative was
// the dialog's close box — which used to leave the request running and then let
// its result reopen the dialog on top of whatever came next.
function CancelLink({ onCancel, dark }) {
  if (!onCancel) return null;
  return (
    <button
      onClick={onCancel}
      className={`mt-1 text-xs font-medium underline-offset-2 hover:underline ${dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
    >
      Cancel
    </button>
  );
}

// The waiting state for an AI action that can say something real about its own
// progress. Same shape as AiWaiting — label, caution — with a bar between them.
//
// THE RULE: `percent` must be counted, never estimated. A bar that invents its
// own progress is worse than a spinner, because it sits at 95% while you decide
// whether the thing has hung. Every number reaching this component comes from an
// event that actually happened: a search started, a search returned, a field was
// written. It follows that the bar moves in visible jumps and sometimes pauses —
// that pause is information, and smoothing it away would be the lie.
//
// `detail` is the line under the bar (the search query, the field count). It is
// what tells you the lookup found YOUR song rather than something else.
// `percent={null}` means INDETERMINATE: the work has no countable denominator,
// so the bar sweeps instead of filling. Used by Find duplicates, whose reply is
// a list of however many groups exist — a numerator with nothing to divide by.
// A sweeping bar is the one honest way to draw that; a filling one would have to
// invent the total.
export function AiProgress({ label, detail, percent, dark, onCancel }) {
  const indeterminate = percent == null;
  return (
    <div className="flex flex-col items-center gap-2 py-6 w-full">
      <div className={`flex items-center gap-2 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        <Loader2 size={16} className="animate-spin" /> {label}
      </div>
      <div className={`w-full h-1.5 rounded-full overflow-hidden ${dark ? 'bg-gray-800' : 'bg-gray-200'}`}>
        {/* Transition the width only. The bar is driven by discrete events, so
            the ease is there to stop each jump reading as a glitch — not to
            imply movement between them. */}
        <div
          className={indeterminate
            ? 'h-full w-1/3 bg-indigo-500 rounded-full ai-sweep'
            : 'h-full bg-indigo-500 rounded-full transition-[width] duration-500 ease-out'}
          style={indeterminate ? undefined : { width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {detail && (
        <p className={`text-[11px] max-w-full truncate ${dark ? 'text-gray-500' : 'text-gray-400'}`} title={detail}>{detail}</p>
      )}
      <AiCaution dark={dark} center />
      <CancelLink onCancel={onCancel} dark={dark} />
    </div>
  );
}

// A bare progress bar for the editor TOOLBAR, where the in-place tools (Clean
// up, Detect structure) run. About half an inch long.
//
// No label, by request: the words that used to sit here ("Cleaning up…") were
// the widest thing in the row, and the row is where the buttons live. A bar
// that size says "working" as well as the words did and costs a fifth of the
// space. Same rule as AiProgress — `percent` is counted, never invented.
export function AiInlineProgress({ percent, dark, label = 'Working…', onCancel }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5">
      <span
        role="progressbar" aria-label={label}
        aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}
        className={`shrink-0 w-12 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-gray-700' : 'bg-gray-200'}`}
      >
        <span
          className="block h-full bg-indigo-500 rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </span>
      {/* Stop. The in-place tools rewrite the chart, so a wrong one caught early
          is worth far more than the seconds it saves — and running several in a
          row is exactly when the wrong one gets pressed.
          Small circle by request; the hit area is padded out to 28px around a
          14px glyph, because this is the control you reach for in a hurry and the
          toolbar cannot spare a full 44. */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          aria-label={`Cancel — ${label}`}
          title="Cancel"
          className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border transition-colors ${
            dark
              ? 'border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white'
              : 'border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-800'
          }`}
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

// The same caution beside a result. Small and muted on purpose: present for
// anyone weighing what's on screen, without shouting over the answer itself.
// `children` overrides the wording where a surface needs to say something more
// specific about what exactly is a guess.
export function AiCaution({ dark, center = false, children }) {
  return (
    <p className={`text-[11px] ${center ? 'text-center' : ''} ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
      {children || AI_CAUTION}
    </p>
  );
}
