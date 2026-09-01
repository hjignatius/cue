import { useEffect, useRef, useState } from 'react';

// A self-contained Ω button that opens a grid of the user's symbol palette and
// calls onInsert(char) for each tap. Insert-only (curation of the set lives in
// the editor's Ω palette). Used where those glyphs are otherwise hard to type —
// e.g. the Library search box on iPad, whose keyboard has no ° ♭ ↓ / etc.

// Ordered, de-duplicated code points from the stored palette string; whitespace
// dropped so the user can space symbols out for legibility without blank cells.
function parseSymbols(str) {
  const seen = new Set();
  const out = [];
  for (const ch of str || '') {
    if (/\s/.test(ch) || seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

export default function SymbolMenuButton({ symbols, onInsert, dark, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) { if (ref.current?.contains(e.target)) return; setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const list = parseSymbols(symbols);

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu" aria-expanded={open} aria-label="Insert symbol" title="Insert symbol"
        className={`h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
          open
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : dark ? 'border-gray-700 text-gray-300 hover:text-white' : 'border-gray-300 text-gray-600 hover:text-gray-900'
        }`}
      >
        Ω
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Insert symbol"
          className={`absolute right-0 top-full mt-1 z-40 w-64 rounded-xl border shadow-xl p-2 ${dark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}
          style={{ marginRight: 'env(safe-area-inset-right)' }}
        >
          {list.length ? (
            <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
              {list.map((ch, i) => (
                <button
                  key={ch + i}
                  type="button"
                  role="menuitem"
                  onClick={() => onInsert(ch)}
                  title={`Insert ${ch}`}
                  className={`h-8 flex items-center justify-center rounded text-lg leading-none ${dark ? 'hover:bg-gray-800 text-gray-100' : 'hover:bg-gray-100 text-gray-900'}`}
                >
                  {ch}
                </button>
              ))}
            </div>
          ) : (
            <p className={`px-1 py-2 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
              No symbols yet — add some in the editor's Ω palette.
            </p>
          )}
        </div>
      )}
    </span>
  );
}
