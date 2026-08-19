import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

// Floating "Update Cue" pill. App renders it only when an update is waiting and
// Present mode is inactive, so it never sits over the performance surface. On tap
// it applies the update (activates the new worker and reloads once); if the
// editor has unsaved work it first confirms, so a reload can't silently lose it.
export default function UpdateButton({ onApply, onDismiss, getDirty, onSave }) {
  const [confirm, setConfirm] = useState(false);

  function tap() {
    if (getDirty?.()) setConfirm(true);
    else onApply();
  }

  async function saveAndUpdate() {
    try { await onSave?.(); } finally { onApply(); }
  }

  return (
    <>
      <div
        className="fixed z-[45] flex items-center gap-1"
        style={{
          left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        }}
      >
        <button
          type="button"
          onClick={tap}
          className="flex items-center gap-2 h-11 pl-4 pr-5 rounded-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold shadow-xl transition-colors"
        >
          <RefreshCw size={18} strokeWidth={2.5} />
          Update Cue
        </button>
        <button
          type="button"
          aria-label="Dismiss update"
          onClick={onDismiss}
          className="h-11 w-9 flex items-center justify-center rounded-full bg-indigo-600/90 hover:bg-indigo-500 active:bg-indigo-700 text-white/90 shadow-xl transition-colors"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Unsaved changes</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Updating reloads Cue and discards unsaved edits in the current song. Save first?
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={saveAndUpdate}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
              >
                Save &amp; update
              </button>
              <button
                type="button"
                onClick={onApply}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Discard &amp; update
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="w-full py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
