import { Check, Cloud, EqualNot, Plus } from 'lucide-react';
import { CloseCircle } from './CornerClose.jsx';
import { isMine } from '../utils/books.js';

// Which version of a shared song Present plays: the shared one, your copy of it,
// or a song of yours with the same title. Tapping one chooses it and closes the
// window, and the share remembers. No dimmed backdrop, as everywhere in Cue.
//
// `linked` is your copy of this song and `others` your same-title songs. `chosen`
// is the one that plays now, null for the shared version. onChoose gets the song
// picked, or null for the shared one. onCopy is there when copying makes sense.

const facts = (song) => [
  song.metadata?.artist,
  (song.displayKey || song.metadata?.key) && `Key: ${song.displayKey || song.metadata?.key}`,
  song.type === 'pdf' && 'PDF',
].filter(Boolean).join(' · ');

export default function VersionPicker({ dark, song, linked, linkedWord, others, chosen, bookNames, onChoose, onCopy, onClose }) {
  const head = dark ? 'text-white' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const word = (s) => (isMine(s) ? 'Your song' : `In “${bookNames.get(s.bookId) || 'a book'}”`);
  const rows = [
    { id: 'shared', icon: Cloud, label: 'Shared version', sub: facts(song), plays: !chosen, pick: null },
    ...(linked ? [{ id: linked.id, icon: EqualNot, label: linkedWord, sub: facts(linked), plays: chosen?.id === linked.id, pick: linked }] : []),
    ...others.map(s => ({ id: s.id, icon: EqualNot, label: word(s), sub: facts(s), plays: chosen?.id === s.id, pick: s })),
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div className={`w-[26rem] max-w-full max-h-[85dvh] flex flex-col gap-3 rounded-2xl shadow-2xl p-6 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-base font-semibold ${head}`}>Which version plays?</h2>
            <p className={`text-sm truncate mt-0.5 ${muted}`}>{song.metadata?.title || 'Untitled'}</p>
          </div>
          <CloseCircle dark={dark} onClick={onClose} className="-mt-3 -mr-4" />
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
          {rows.map(({ id, icon: Icon, label, sub, plays, pick }) => (
            <button key={id} type="button" onClick={() => onChoose(pick)} aria-pressed={plays}
              className={`flex items-center gap-3 w-full min-h-[3.5rem] px-3 py-2 rounded-xl text-left transition-colors ${plays
                ? `border-2 ${dark ? 'border-white bg-gray-800' : 'border-gray-900 bg-gray-50'}`
                : `border ${dark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}`}>
              <Icon size={20} strokeWidth={2.25} className={`shrink-0 ${plays ? head : muted}`} />
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-medium truncate ${head}`}>{label}</span>
                {sub && <span className={`block text-xs truncate mt-0.5 ${muted}`}>{sub}</span>}
              </span>
              {plays && <Check size={20} strokeWidth={2.5} className={`shrink-0 ${head}`} />}
            </button>
          ))}
        </div>

        {onCopy && (
          <button type="button" onClick={onCopy}
            className={`flex items-center justify-center gap-2 w-full h-11 text-sm font-medium rounded-xl border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
            <Plus size={18} /> Copy the shared version to my songs
          </button>
        )}
      </div>
    </div>
  );
}
