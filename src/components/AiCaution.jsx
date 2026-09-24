import { Loader2 } from 'lucide-react';

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
export function AiWaiting({ label, dark }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <div className={`flex items-center gap-2 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        <Loader2 size={16} className="animate-spin" /> {label}
      </div>
      <AiCaution dark={dark} center />
    </div>
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
export function AiProgress({ label, detail, percent, dark }) {
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
          className="h-full bg-indigo-500 rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {detail && (
        <p className={`text-[11px] max-w-full truncate ${dark ? 'text-gray-500' : 'text-gray-400'}`} title={detail}>{detail}</p>
      )}
      <AiCaution dark={dark} center />
    </div>
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
