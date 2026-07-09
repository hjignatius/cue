import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { UKULELE_CHORDS, CHORD_TYPES } from '../data/ukuleleChords.js';
import ChordDiagram from './ChordDiagram.jsx';

const CUSTOM_KEY = 'cue_custom_chords';

function loadCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; }
}

function saveCustom(chords) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(chords));
}

// ---- Add Custom Chord form --------------------------------------------------

function CustomChordForm({ onSave, onCancel }) {
  const [name,   setName]   = useState('');
  const [frets,  setFrets]  = useState(['', '', '', '']);
  const labels = ['G', 'C', 'E', 'A'];

  function setFret(i, val) {
    const num = val.replace(/\D/g, '').slice(0, 2);
    setFrets(prev => { const next = [...prev]; next[i] = num; return next; });
  }

  function handleSave(e) {
    e.preventDefault();
    const parsed = frets.map(f => parseInt(f, 10));
    if (!name.trim() || parsed.some(isNaN)) return;
    onSave({ name: name.trim(), type: 'custom', frets: parsed });
  }

  return (
    <form onSubmit={handleSave} className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-3 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Add custom chord</p>

      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Chord name (e.g. Csus2)"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
      />

      <div className="grid grid-cols-4 gap-2">
        {labels.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className="text-xs text-gray-500">{label}</span>
            <input
              value={frets[i]}
              onChange={e => setFret(i, e.target.value)}
              placeholder="0"
              inputMode="numeric"
              className="w-full text-center bg-gray-800 border border-gray-700 rounded-lg py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" className="flex-1 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors">Save chord</button>
        <button type="button" onClick={onCancel} className="flex-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">Cancel</button>
      </div>
    </form>
  );
}

// ---- Detail overlay for a single chord -------------------------------------

function ChordDetail({ chord, onClose, onSelect }) {
  return (
    <div className="flex flex-col items-center gap-3 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <div className="flex items-center justify-between w-full">
        <span className="text-sm font-semibold text-white">{chord.name}</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
          <X size={15} />
        </button>
      </div>
      <ChordDiagram chord={chord} size="large" />
      <div className="text-xs text-gray-500 font-mono">
        G:{chord.frets[0]}  C:{chord.frets[1]}  E:{chord.frets[2]}  A:{chord.frets[3]}
      </div>
      {onSelect && (
        <button
          onClick={() => { onSelect(chord); onClose(); }}
          className="w-full py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
        >
          Use {chord.name}
        </button>
      )}
    </div>
  );
}

// ---- Main ChordPicker -------------------------------------------------------

export default function ChordPicker({ onChordSelect }) {
  const [search,      setSearch]      = useState('');
  const [activeType,  setActiveType]  = useState('major');
  const [customChords, setCustomChords] = useState(loadCustom);
  const [addingCustom, setAddingCustom] = useState(false);
  const [detailChord,  setDetailChord]  = useState(null);

  const allChords = useMemo(
    () => [...UKULELE_CHORDS, ...customChords.map(c => ({ ...c, type: 'custom' }))],
    [customChords]
  );

  const displayed = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return allChords.filter(c => c.name.toLowerCase().includes(q));
    }
    return allChords.filter(c => c.type === activeType);
  }, [allChords, search, activeType]);

  function handleSaveCustom(chord) {
    const updated = [...customChords, chord];
    setCustomChords(updated);
    saveCustom(updated);
    setAddingCustom(false);
    setActiveType('custom');
  }

  function handleDeleteCustom(name) {
    const updated = customChords.filter(c => c.name !== name);
    setCustomChords(updated);
    saveCustom(updated);
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 select-none">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chords…"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Type tabs */}
      {!search && (
        <div className="px-3 pb-2 shrink-0">
          <div className="flex flex-wrap gap-1">
            {CHORD_TYPES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveType(key)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  activeType === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {label}
                {key === 'custom' && customChords.length > 0 && (
                  <span className="ml-1 text-indigo-300">{customChords.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detail overlay */}
      {detailChord && (
        <div className="px-3 pb-2 shrink-0">
          <ChordDetail
            chord={detailChord}
            onClose={() => setDetailChord(null)}
            onSelect={onChordSelect}
          />
        </div>
      )}

      {/* Add Custom form */}
      {addingCustom && !detailChord && (
        <div className="px-3 shrink-0">
          <CustomChordForm onSave={handleSaveCustom} onCancel={() => setAddingCustom(false)} />
        </div>
      )}

      {/* Chord grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* Add custom button */}
        {!addingCustom && (
          <button
            onClick={() => { setAddingCustom(true); setDetailChord(null); }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-400 transition-colors mb-3 mt-1"
          >
            <Plus size={12} /> Add custom chord
          </button>
        )}

        {displayed.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-6">No chords found</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {displayed.map(chord => (
            <div
              key={`${chord.type}-${chord.name}`}
              className="relative group cursor-pointer rounded-lg border border-gray-800 hover:border-indigo-700 bg-gray-900 hover:bg-gray-800 transition-colors flex flex-col items-center pt-1 pb-0.5"
              onClick={() => setDetailChord(detailChord?.name === chord.name ? null : chord)}
            >
              <ChordDiagram chord={chord} size="small" />

              {/* Delete button for custom chords */}
              {chord.type === 'custom' && (
                <button
                  className="absolute top-1 right-1 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  onClick={e => { e.stopPropagation(); handleDeleteCustom(chord.name); }}
                  title="Delete custom chord"
                >
                  <X size={10} />
                </button>
              )}

              {/* "Use" quick-action on hover (when callback provided) */}
              {onChordSelect && (
                <button
                  className="absolute inset-x-1 bottom-0.5 text-center text-indigo-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/90 rounded"
                  onClick={e => { e.stopPropagation(); onChordSelect(chord); }}
                >
                  use
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
