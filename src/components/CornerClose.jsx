import { X } from 'lucide-react';
import RoundButton, { GLASS, ROUND_SIZE_ACTION } from './RoundButton.jsx';

// The way out of an import dialog: an X in its top right corner, in the same
// glass circle as the way out of Present and the editor. The dialog's panel
// must be `relative`, and its heading must leave the corner free.
export default function CornerClose({ dark, label = 'Cancel', onClick }) {
  const glass = GLASS(dark);
  return (
    <div className="absolute top-2 right-2">
      <RoundButton size={ROUND_SIZE_ACTION} label={label} title={label} onActivate={onClick}
        glass fill={glass.fill} border={glass.border} color={glass.ink} touchAction="manipulation">
        <X size={22} strokeWidth={2.5} />
      </RoundButton>
    </div>
  );
}
