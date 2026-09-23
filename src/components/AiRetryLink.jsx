// "Try again — smarter model", and what to say when there is no smarter model.
//
// THE BUG THIS EXISTS FOR: every caller used to gate this on `escalatedModel()`,
// which asks "is there a rung above the user's SETTING" — not "is there a rung
// above the model that actually answered". So escalating a result left the offer
// on screen: you pressed it, waited, and got the same answer from the same model,
// billed a second time. ai.js already had `canEscalate(usedModel)` for exactly
// this and only the in-place editor tools were using it.
//
// Pass the model that produced the result on screen. `undefined` means the call
// ran on the current tier's model, which is what a first pass does.
//
// When there is nothing above it, the offer is REPLACED by a line saying so
// rather than silently vanishing — a disappearing button reads as a glitch, and
// leaves you wondering whether there was something better you failed to press.
// Only after an escalation, though: on the top tier by setting there was never a
// link there to explain.

import { Sparkles } from 'lucide-react';
import { canEscalate, escalatedModel, escalatedTierLabel } from '../lib/ai.js';

export default function AiRetryLink({
  usedModel, onRetry, dark, variant = 'button',
  label = 'Try again — smarter model',
  atBestLabel = 'Best model — nothing smarter to try',
  title,
}) {
  if (canEscalate(usedModel)) {
    const cls = variant === 'link'
      ? 'shrink-0 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline'
      : `self-start flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          dark ? 'border-gray-700 text-gray-300 hover:text-white' : 'border-gray-300 text-gray-600 hover:text-gray-900'}`;
    return (
      <button
        onClick={() => onRetry(escalatedModel())}
        title={title ?? `Re-run on the ${escalatedTierLabel()} model — slower, and costs more`}
        className={cls}
      >
        <Sparkles size={13} /> {label}
      </button>
    );
  }
  if (!usedModel) return null;
  return (
    <span className={`self-start inline-flex items-center gap-1.5 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
      <Sparkles size={13} /> {atBestLabel}
    </span>
  );
}
