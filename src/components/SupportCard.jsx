import { useState } from 'react';
import { Check, Copy, Heart, Mail, QrCode as QrCodeIcon } from 'lucide-react';
import QrCode from './QrCode.jsx';

// The foot of Settings: support Cue, or tell us what would make it better. It
// sits outside the collapsible sections so it is on screen as soon as Settings
// opens. Both are outbound links: Cue takes no payment, runs no payment code
// and stores nothing.
//
// The buttons come first, because a code can't be scanned by the device showing
// it. The QR codes are for reaching a phone from a Mac or an iPad: to pay where
// PayPal or a card is handy, or to email from a device with no mail set up. For
// that same reason the address is written out, with a Copy button.
//
// "Support", not "Donate" — the reasoning here was once overstated. What IS
// charity-only is the reduced charity fee rate and PayPal Giving Fund. The
// Donate BUTTON appears open to an ordinary account: ozbcoz (Jim's Ukulele
// Songbook, one person and no charity) has a PayPal donation page with the
// amount box, the monthly tick and the card option. Not verified for Howard's
// account, and PayPal's terms vary by country. If he makes one, its link
// replaces SUPPORT_URL here and nothing else changes.
//
// https even though the paypal.me link is usually quoted as http: it redirects
// either way, and there is no reason to make the first hop plaintext.

const SUPPORT_URL = 'https://paypal.me/howardignatius';
const ADDRESS = 'usecueapp@gmail.com';
const MAIL_URL = `mailto:${ADDRESS}?subject=${encodeURIComponent(`Cue suggestion (v${import.meta.env.VITE_APP_VERSION})`)}`;

const QR_PX = 176;
const CODES = {
  support: { value: SUPPORT_URL, title: 'QR code to support Cue', caption: 'Scan with your phone to support Cue' },
  mail: { value: MAIL_URL, title: 'QR code to email a suggestion', caption: 'Scan with your phone to send a suggestion' },
};

export default function SupportCard({ dark }) {
  const [code, setCode] = useState(null); // 'support' | 'mail' while one is showing
  const [copy, setCopy] = useState('idle'); // idle | copied | failed

  function copyAddress() {
    const done = () => { setCopy('copied'); setTimeout(() => setCopy('idle'), 2000); };
    if (!navigator.clipboard?.writeText) { setCopy('failed'); return; }
    navigator.clipboard.writeText(ADDRESS).then(done, () => setCopy('failed'));
  }

  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const button = 'flex-1 min-w-0 h-11 flex items-center justify-center gap-2 text-sm font-medium rounded-full transition-colors';
  const outline = `border ${dark ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  const qrButton = (id) => {
    const on = code === id;
    return (
      <button type="button" onClick={() => setCode(on ? null : id)} aria-pressed={on}
        aria-label={`${on ? 'Hide' : 'Show'} ${CODES[id].title}`} title={on ? 'Hide QR code' : 'Show QR code'}
        className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
          on ? 'bg-indigo-600 text-white' : outline}`}>
        <QrCodeIcon size={20} />
      </button>
    );
  };

  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-3 ${dark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <p className={`text-xs ${muted}`}>
        Cue is free and always will be. Support it if it earns its keep, and tell us what would make it better.
      </p>

      <div className="flex items-center gap-2">
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className={`${button} bg-indigo-600 hover:bg-indigo-500 text-white`}>
          <Heart size={18} /> Support Cue
        </a>
        {qrButton('support')}
      </div>

      <div className="flex items-center gap-2">
        <a href={MAIL_URL} className={`${button} ${outline}`}>
          <Mail size={18} /> Send a suggestion
        </a>
        {qrButton('mail')}
      </div>

      <div className="flex items-center gap-2">
        <span className={`flex-1 min-w-0 truncate select-text text-xs ${muted}`}>{ADDRESS}</span>
        <button type="button" onClick={copyAddress}
          className={`shrink-0 h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors ${
            copy === 'copied'
              ? (dark ? 'text-green-400' : 'text-green-600')
              : (dark ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-200')}`}>
          {copy === 'copied' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
        </button>
      </div>
      {copy === 'failed' && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Couldn't reach the clipboard. Select the address to copy it.</p>
      )}

      {code && (
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <div className="rounded-lg overflow-hidden">
            <QrCode value={CODES[code].value} size={QR_PX} title={CODES[code].title} />
          </div>
          <p className={`text-xs text-center ${muted}`}>{CODES[code].caption}</p>
        </div>
      )}
    </div>
  );
}
