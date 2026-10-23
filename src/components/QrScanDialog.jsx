import { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { usePrefs } from '../context/PrefsContext.jsx';
import { readScannedCode } from '../utils/shareLink.js';

// Scan a set's QR code from inside Cue.
//
// WHY THIS EXISTS: pointing an iPhone or iPad's own camera at a share code opens
// the link in Safari, never in the Cue app on the Home Screen — and the two keep
// separate storage, so the set lands in the wrong Cue. Scanning from in here
// puts it straight into this one.
//
// One decoder everywhere (jsQR), not the BarcodeDetector some browsers have
// built in: Safari has none, and two code paths would mean two behaviours to
// test. Loaded only when this opens, so it costs nothing until it is used.
//
// The camera needs a secure address. The live site is one; a Wi-Fi address to
// a dev server is not, which is why this can only be tried on the live site.

// Frames are scaled down before decoding: a QR held up to the camera needs
// nowhere near full resolution, and decoding 4K frames would drain a phone.
const SCAN_MAX_PX = 640;
const SCAN_EVERY_MS = 120;
// How long "that's not a Cue share code" stays up before the camera tries
// again quietly. Without a pause it would re-announce the same menu every frame.
const NOT_OURS_MS = 2500;

function cameraErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "Cue isn't allowed to use the camera. Allow camera access for Cue in your device's settings (on an iPhone or iPad: Settings → Apps → Safari → Camera), then try again — or paste the link instead.";
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Paste the link instead.';
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it there and try again.';
  return "The camera couldn't be started. Paste the link instead.";
}

export default function QrScanDialog({ onToken, onClose }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';
  const videoRef = useRef(null);
  const [phase, setPhase] = useState('starting'); // starting | scanning | error
  const [errMsg, setErrMsg] = useState('');
  const [notice, setNotice] = useState('');
  // Mirror the preview for a front camera (a Mac), as every camera app does:
  // unmirrored, moving the phone left moves its image right and aiming is hard.
  const [mirrored, setMirrored] = useState(false);

  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let stream = null;
    let timer = null;
    let stopped = false;
    let quietUntil = 0;
    let lastRefused = '';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrMsg("This browser can't use the camera here. Paste the link instead.");
        setPhase('error');
        return;
      }
      try {
        const [jsQR, media] = await Promise.all([
          import('jsqr').then(m => m.default),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
        ]);
        stream = media;
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const facing = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
        setMirrored(facing === 'user' || (!facing && !/iPhone|iPad|Android/i.test(navigator.userAgent)));
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setPhase('scanning');
        tick(jsQR);
      } catch (err) {
        if (stopped) return;
        console.warn('Camera could not start:', err?.name, err?.message);
        setErrMsg(cameraErrorMessage(err));
        setPhase('error');
      }
    }

    function tick(jsQR) {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, SCAN_MAX_PX / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        canvas.width = w; canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          const read = readScannedCode(found.data);
          if (read.kind === 'share') { stopped = true; onTokenRef.current(read.token); return; }
          const now = Date.now();
          if (now >= quietUntil || found.data !== lastRefused) {
            lastRefused = found.data;
            quietUntil = now + NOT_OURS_MS;
            setNotice(read.kind === 'app'
              ? "That's the code for Cue itself, not for a set. Scan the code in a set's Share window."
              : "That isn't a Cue share code. Scan the code in a set's Share window.");
          }
        } else if (Date.now() >= quietUntil) {
          setNotice('');
        }
      }
      timer = setTimeout(() => tick(jsQR), SCAN_EVERY_MS);
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const muted = dark ? 'text-gray-400' : 'text-gray-500';

  return (
    // The backdrop does not dismiss: you are holding a device up to a screen,
    // and a stray thumb on the edge would close the camera mid-aim. Cancel and
    // the X are the way out.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className={`w-96 max-w-[92vw] max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl shadow-2xl flex flex-col ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className={`flex items-center justify-between px-6 pt-5 pb-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div>
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Scan a shared set</h2>
            <p className={`mt-0.5 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Point the camera at a set's QR code</p>
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
          {phase === 'error' ? (
            <p className="text-sm text-red-500">{errMsg}</p>
          ) : (
            <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-black">
              {/* playsInline and muted are what let iOS play a camera feed in
                  the page at all, instead of refusing or going full screen. */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
              />
              {/* A frame to aim at. Decoding reads the whole picture, so this is
                  a guide, not a limit. */}
              <div aria-hidden="true" className="absolute inset-[18%] rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
              {phase === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90 text-sm">
                  <Loader2 size={22} className="animate-spin" />
                  Starting the camera…
                </div>
              )}
            </div>
          )}

          {notice && phase === 'scanning' && (
            <p className="text-xs text-amber-600 dark:text-amber-400" role="status">{notice}</p>
          )}
          {phase !== 'error' && (
            <p className={`text-xs ${muted}`}>The set opens as soon as the code is read, and is added to Shared with me.</p>
          )}

          <button
            onClick={onClose}
            className={`w-full py-2.5 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
