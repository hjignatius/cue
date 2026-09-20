import { useEffect } from 'react';
import { X } from 'lucide-react';
import { usePrefs, PRESENT_NO_FADE } from '../context/PrefsContext.jsx';

// The settings that only make sense while presenting, reachable from inside
// Present rather than from the global Settings panel.
//
// They moved here because you cannot judge any of them from a settings screen —
// a page-turn glide in milliseconds, a fade delay, a scroll lead-in are all
// things you set by watching them happen. Keeping them global also made the
// Settings panel a third longer for controls a player touches once.
//
// These are still GLOBAL preferences (the same PrefsContext keys as before), not
// per-song: changing one here changes it for every song.
export default function PresentSettings({ onClose }) {
  const {
    theme, metronomeMode, presentIdleSec, scrollStartDelaySec,
    pedalPaging, pageGlideMs, pageSize, updatePref,
  } = usePrefs();
  const dark = theme === 'dark';

  const border = dark ? 'border-gray-700' : 'border-gray-200';
  const label  = dark ? 'text-white' : 'text-gray-900';
  const muted  = dark ? 'text-gray-400' : 'text-gray-500';

  const noFade = presentIdleSec === PRESENT_NO_FADE;
  const idleSec = noFade ? 3 : (presentIdleSec ?? 3);
  const scrollDelaySec = scrollStartDelaySec ?? 0;
  const glideMs = Math.max(0, Math.min(2000, pageGlideMs ?? 550));

  // Escape closes THIS, not Present. Capture phase so it wins over Present's own
  // window handler, which would otherwise end the performance behind the sheet.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const seg = (active) => `flex-1 py-2.5 pointer-fine:py-2 text-sm tabular-nums transition-colors ${
    active ? 'bg-indigo-600 text-white' : `${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
  }`;
  const wide = (active) => `w-full py-2.5 pointer-fine:py-2 rounded-lg border text-sm transition-colors ${
    active ? 'bg-indigo-600 text-white border-indigo-600'
           : `${border} ${muted} ${dark ? 'hover:text-white hover:bg-gray-800' : 'hover:text-gray-900 hover:bg-gray-50'}`
  }`;

  return (
    // z-50: above PresentControls (z-40) and the gutter (z-35), so nothing on the
    // stage can be tapped by accident while this is open.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-5 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={`text-base font-semibold ${label}`}>Present settings</h2>
            <p className={`text-xs mt-0.5 ${muted}`}>These apply to every song.</p>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`} aria-label="Close"><X size={18} /></button>
        </div>

        {/* Controls fade */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={`text-sm ${label}`}>Controls fade delay</span>
            <span className={`text-sm tabular-nums ${muted}`}>{noFade ? 'Never' : idleSec === 0 ? 'Immediate' : `${idleSec}s`}</span>
          </div>
          <div className={`flex rounded-lg border ${border} overflow-hidden ${noFade ? 'opacity-40' : ''}`}>
            {[0, 1, 2, 3, 4, 5].map((n, i) => (
              <button key={n} onClick={() => updatePref('presentIdleSec', n)}
                className={`${seg(!noFade && idleSec === n)} ${i > 0 ? `border-l ${border}` : ''}`}>{n}</button>
            ))}
          </div>
          <button onClick={() => updatePref('presentIdleSec', noFade ? 3 : PRESENT_NO_FADE)} className={wide(noFade)}>
            Keep controls up (practice mode)
          </button>
          <p className={`text-xs ${muted}`}>Seconds before the Present controls fade and collapse. 0 hides them right away. Practice mode keeps them up the whole time.</p>
        </div>

        {/* Scroll lead-in */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={`text-sm ${label}`}>Scroll start delay</span>
            <span className={`text-sm tabular-nums ${muted}`}>{scrollDelaySec === 0 ? 'None' : `${scrollDelaySec}s`}</span>
          </div>
          <div className={`flex rounded-lg border ${border} overflow-hidden`}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n, i) => (
              <button key={n} onClick={() => updatePref('scrollStartDelaySec', n)}
                className={`${seg(scrollDelaySec === n)} ${i > 0 ? `border-l ${border}` : ''}`}>{n}</button>
            ))}
          </div>
          <p className={`text-xs ${muted}`}>Seconds to wait after pressing the scroll button before scrolling starts.</p>
        </div>

        {/* Count-in style — a Present concern, and too small to have earned its
            own heading in the global panel. */}
        <div className="flex flex-col gap-2">
          <span className={`text-sm ${label}`}>Count-in</span>
          <div className={`flex rounded-lg border ${border} overflow-hidden`}>
            {[['sound', '♪ Sound'], ['silent', '⚡ Visual']].map(([val, text], i) => (
              <button key={val} onClick={() => updatePref('metronomeMode', val)}
                className={`${seg(metronomeMode === val)} ${i === 1 ? `border-l ${border}` : ''}`}>{text}</button>
            ))}
          </div>
          <p className={`text-xs ${muted}`}>Whether the count-in clicks out loud or flashes the button.</p>
        </div>

        {/* Pedal paging + its sub-settings */}
        <div className="flex flex-col gap-2">
          <span className={`text-sm ${label}`}>Pedal paging mode</span>
          <button onClick={() => updatePref('pedalPaging', !pedalPaging)} className={wide(pedalPaging)}>
            {pedalPaging ? 'On' : 'Off'}
          </button>
          <p className={`text-xs ${muted}`}>Next/Previous page through the current song by one screen instead of skipping songs; at a song's end they move to the next/previous song. Auto-scroll is turned off in this mode.</p>

          {pedalPaging && (
            <div className={`flex flex-col gap-2 mt-1 pl-3 border-l-2 ${border}`}>
              <span className={`text-sm ${label}`}>Page turn size</span>
              <div className={`flex rounded-lg border ${border} overflow-hidden`}>
                {[['full', 'Full'], ['threequarters', '3/4'], ['half', '1/2']].map(([val, text], i) => (
                  <button key={val} onClick={() => updatePref('pageSize', val)}
                    className={`${seg((pageSize ?? 'full') === val)} ${i > 0 ? `border-l ${border}` : ''}`}>{text}</button>
                ))}
              </div>
              <p className={`text-xs ${muted}`}>How far each Next / Previous press moves — a full screen, three quarters, or half a screen.</p>

              <div className="flex items-center justify-between mt-1">
                <span className={`text-sm ${label}`}>Page turn glide</span>
                <span className={`text-sm tabular-nums ${muted}`}>{glideMs === 0 ? 'Instant' : `${glideMs} ms`}</span>
              </div>
              <input
                type="range" min="0" max="2000" step="50" value={glideMs}
                onChange={e => updatePref('pageGlideMs', Number(e.target.value))}
                aria-label="Page turn glide duration in milliseconds"
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className={`text-xs ${muted}`}>How long a page turn takes to glide to the next screen. 0 is an instant jump; higher is a slower, smoother glide.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
