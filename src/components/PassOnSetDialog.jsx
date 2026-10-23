import { useEffect } from 'react';
import { X } from 'lucide-react';
import { usePrefs } from '../context/PrefsContext.jsx';
import LinkQrPanel from './LinkQrPanel.jsx';
import { shareUrl } from '../utils/shareLink.js';
import { dismissOnOutside } from '../utils/overlayDismiss.js';

// Pass on a set someone shared with you: its link, Copy, and the same link as a
// QR code. Share set's twin for a set that is not yours — so there is no Stop
// sharing here, and nothing is fetched: the bookmark already holds the token.
//
// Replaces the row's copy button, which copied the link at once with no window.
// That left no way to hand the set on in person, which is most of the time:
// someone at the jam asks for it and a code on the screen beats spelling a link.
export default function PassOnSetDialog({ share, onClose }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';
  const name = share.setName || 'Shared set';
  const url = shareUrl(share.token);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panel = `w-96 max-w-[92vw] max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl shadow-2xl flex flex-col ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" {...dismissOnOutside(onClose)}>
      <div className={panel} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-6 pt-5 pb-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div className="min-w-0">
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Pass this set on</h2>
            <p className={`mt-0.5 text-xs truncate ${dark ? 'text-gray-500' : 'text-gray-400'}`}>"{name}"</p>
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
          <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Someone shared this set with you. Anyone you pass the link to sees the same set — and if its owner stops sharing it, the link stops working for everyone.
          </p>
          <LinkQrPanel
            url={url}
            dark={dark}
            qrTitle={`QR code for the "${name}" share link`}
            qrCaption="Scan this from inside Cue — Sets → Shared with me → the scan button — to add the set straight to it."
            pdfTitle={name}
            shareTitle={`Cue set: ${name}`}
            shareText={`"${name}" — a set shared from Cue.`}
          />
        </div>
      </div>
    </div>
  );
}
