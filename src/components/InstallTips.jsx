// How to put Cue on a device as an app — one line per kind of device.
//
// Shown to two different readers: in Get Cue, to the person holding Cue, who is
// talking someone else through it; on a shared set's landing screen, to the
// recipient themselves. So it names the device rather than saying "your", and
// stays generic about Apple's menus, which move between iOS versions.
const TIPS = [
  ['iPhone or iPad', 'open the link in Safari, tap Share, then Add to Home Screen.'],
  ['Mac', 'in Safari choose File → Add to Dock; in Chrome, the install icon at the right of the address bar.'],
  ['Android', 'in Chrome, open the ⋮ menu and choose Add to Home screen or Install app.'],
  ['Windows', 'in Chrome or Edge, the install icon at the right of the address bar.'],
];

export default function InstallTips({ dark }) {
  const label = dark ? 'text-gray-200' : 'text-gray-800';
  const body  = dark ? 'text-gray-400' : 'text-gray-500';
  return (
    <ul className="flex flex-col gap-1.5">
      {TIPS.map(([device, how]) => (
        <li key={device} className={`text-xs leading-snug ${body}`}>
          <span className={`font-medium ${label}`}>{device}:</span> {how}
        </li>
      ))}
    </ul>
  );
}
