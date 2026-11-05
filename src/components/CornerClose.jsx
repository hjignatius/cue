import { X } from 'lucide-react';
import RoundButton, { GLASS, ROUND_SIZE_ACTION } from './RoundButton.jsx';

// The X that closes a window: the same glass circle as the way out of Present
// and the editor, so every window in Cue is left the same way. It sits in the
// window's heading row; `className` pulls it toward the corner, by however much
// that window's padding allows.
export function CloseCircle({ dark, label = 'Close', onClick, className = '' }) {
  const glass = GLASS(dark);
  return (
    <div className={`shrink-0 ${className}`}>
      <RoundButton size={ROUND_SIZE_ACTION} label={label} title={label} onActivate={onClick}
        glass fill={glass.fill} border={glass.border} color={glass.ink} touchAction="manipulation">
        <X size={22} strokeWidth={2.5} />
      </RoundButton>
    </div>
  );
}

// The same X pinned to the corner, for a window whose heading isn't a row: the
// import dialogs. The panel must be `relative`, and its heading must leave the
// corner free.
export default function CornerClose({ dark, label = 'Cancel', onClick }) {
  return <CloseCircle dark={dark} label={label} onClick={onClick} className="absolute top-2 right-2" />;
}
