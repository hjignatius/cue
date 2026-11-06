import { useEffect, useState } from 'react';
import { dbWait } from '../utils/storage.js';

// What a copy of Cue says when another copy, in a different tab or window on the
// same device, stands between it and the library (storage.js, setDbWait).
// Mounted beside the routes so a shared-set page says it too. No backdrop: it
// only explains, and the Cue behind it is still the one to use.
export default function DbNotice() {
  const [wait, setWait] = useState(dbWait);
  useEffect(() => {
    const on = () => setWait(dbWait());
    window.addEventListener('cue:db-wait', on);
    on();   // a wait that began before this mounted
    return () => window.removeEventListener('cue:db-wait', on);
  }, []);
  if (!wait) return null;

  const blocked = wait === 'blocked';
  return (
    <div role="alert" className="fixed z-[60] inset-x-0 flex justify-center px-4"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 32px)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5 flex flex-col gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {blocked ? 'Finishing an update' : 'Cue was updated'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {blocked
              ? 'Cue is waiting for your library. If Cue is open in another tab or window, close it there, and this one carries on by itself.'
              : 'A newer Cue is waiting in another tab or window, and can’t open your library until this one reloads. Save anything you’re editing, then reload.'}
          </p>
        </div>
        {!blocked && (
          <button type="button" onClick={() => window.location.reload()}
            className="w-full min-h-11 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
            Reload
          </button>
        )}
      </div>
    </div>
  );
}
