import { Search, XCircle } from 'lucide-react';

// The search box for a long list of songs or pages, in the book report and the
// page picker. Clearing it is a tap, for a finger on a touch keyboard.
export default function FindSong({ value, onChange, dark, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${dark ? 'text-gray-400' : 'text-gray-500'}`} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="Find a song" aria-label="Find a song" spellCheck={false}
        className={`w-full rounded-lg pl-8 pr-8 py-1.5 text-sm border focus:outline-none focus:border-indigo-500 ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear the search" className={`absolute right-0 top-0 h-full w-8 flex items-center justify-center ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          <XCircle size={15} />
        </button>
      )}
    </div>
  );
}

// A short list is quicker read than searched.
export const SEARCH_FROM = 12;
