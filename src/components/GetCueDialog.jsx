import { useEffect } from 'react';
import { X } from 'lucide-react';
import { usePrefs } from '../context/PrefsContext.jsx';
import LinkQrPanel from './LinkQrPanel.jsx';
import InstallTips from './InstallTips.jsx';
import { appUrl } from '../utils/shareLink.js';
import { dismissOnOutside } from '../utils/overlayDismiss.js';

// "Get Cue" — the link to Cue itself, with no set attached, for someone who
// asks to try it. Opened by tapping the Cue title in the Library header.
//
// The QR code is open from the start, unlike in Share: here it is the point —
// the usual case is someone in the room pointing a phone at your screen — and
// the install tips sit under it so you can talk them through making it an app
// rather than leaving it in a browser tab.
export default function GetCueDialog({ onClose }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';
  const url = appUrl();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panel = `w-96 max-w-[92vw] max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl shadow-2xl flex flex-col ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`;
  const muted = `text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" {...dismissOnOutside(onClose)}>
      <div className={panel} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-6 pt-5 pb-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div>
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Get Cue</h2>
            <p className={`mt-0.5 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>The link to Cue itself — no set attached</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`p-1.5 rounded-lg transition-colors ${dark ? 'text-gray-500 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <p className={muted}>Anyone can open Cue from this link and start their own library. No account is needed.</p>
          <LinkQrPanel
            url={url}
            dark={dark}
            qrOpen
            qrTitle="QR code for the link to Cue"
            qrCaption="Point a phone camera at this to open Cue."
            pdfTitle="Cue"
            pdfSubtitle="Scan to open Cue"
            pdfFoot="Open it, then add it to your Home Screen or Dock to use it as an app."
            shareTitle="Cue"
            shareText="Cue — chords and lyrics for live performance. Open it, then add it to your Home Screen."
          />
          <div className={`flex flex-col gap-2 border-t pt-4 ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <p className={`text-sm font-medium ${dark ? 'text-gray-200' : 'text-gray-800'}`}>Then make it an app</p>
            <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Cue works in a browser tab, but added as an app it gets its own icon, opens full screen and works offline.</p>
            <InstallTips dark={dark} />
          </div>
        </div>
      </div>
    </div>
  );
}
