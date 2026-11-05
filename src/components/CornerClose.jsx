import { X } from 'lucide-react';

// The way out of an import dialog: an X in its top right corner, a finger's
// width to tap (in pixels, so the text-size setting can't shrink it). The
// dialog's panel must be `relative`, and its heading must leave the corner free.
export default function CornerClose({ dark, label = 'Cancel', onClick }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`absolute top-2 right-2 w-[44px] h-[44px] flex items-center justify-center rounded-lg transition-colors ${
        dark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}>
      <X size={22} />
    </button>
  );
}
