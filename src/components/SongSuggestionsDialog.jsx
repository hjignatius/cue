// Results dialog for the two song-recommendation tools: "Suggest songs to learn"
// (library-wide, in the Library header) and "Suggest songs for this set" (scoped
// to a setlist, in the Setlist AI menu).
//
// One component rather than two copies, because the two differ only in their
// wording: same result shape, same card, same caution, same escalate offer. The
// copies are how AiRetryLink's bug got made six times over, and this markup is
// fifty lines rather than five.
//
// Discovery only, in both cases. Cue never copies a chart — each pick links out
// to a real source and the player imports what they like.

import { Sparkles, X, ExternalLink } from 'lucide-react';
import { AiProgress, AiCaution } from './AiCaution.jsx';
import { stageProgress } from '../utils/aiStage.js';
import AiRetryLink from './AiRetryLink.jsx';

export default function SongSuggestionsDialog({
  open, onClose, dark, border,
  heading, waitingLabel, emptyText, footerNote,
  busy, error, results, usedModel, onRetry, stage,
  retryLabel = 'Try again — smarter',
}) {
  if (!open) return null;
  const has = !busy && results && results.length > 0;
  return (
    <div
      /* No scrim: these suggest songs to sit beside what is already on the
         screen behind, and dimming it hides the thing being judged. */
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className={`w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-2xl ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-3 border-b ${border}`}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-500" />
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{heading}</h2>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {busy ? (() => {
            const p = stageProgress(stage, { idleLabel: waitingLabel, writeLabel: 'Picking songs…', unit: 'song' });
            return <AiProgress label={p.label} detail={p.detail} percent={stage?.pct ?? p.percent} dark={dark} />;
          })() : error ? (
            <div className="py-6 text-center">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button onClick={() => onRetry()} className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2">Try again</button>
            </div>
          ) : (results && results.length === 0) ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
          ) : (<>
            <AiCaution dark={dark}>AI can get things wrong — check a song is what you expect before learning it, and that the link goes where it says.</AiCaution>
            {(results || []).map((s, i) => (
              <div key={i} className={`rounded-xl border p-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-medium ${dark ? 'text-white' : 'text-gray-900'}`}>{s.title || 'Untitled'}</p>
                    {s.artist && <p className="text-sm text-gray-500 dark:text-gray-400">{s.artist}</p>}
                  </div>
                  {s.difficulty && <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">{s.difficulty}</span>}
                </div>
                {s.why && <p className="text-sm mt-1.5 text-gray-600 dark:text-gray-300">{s.why}</p>}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                    <ExternalLink size={12} /> Find chords
                  </a>
                )}
              </div>
            ))}
          </>)}
        </div>

        {has && (
          <div className={`px-5 py-3 border-t ${border} flex items-center justify-between gap-2`}>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{footerNote}</p>
            <AiRetryLink usedModel={usedModel} onRetry={onRetry} dark={dark} variant="link" label={retryLabel} />
          </div>
        )}
      </div>
    </div>
  );
}
