import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Download, Upload, Pencil } from 'lucide-react';
import { UKULELE_CHORDS } from '../data/ukuleleChords.js';
import ChordDiagram from './ChordDiagram.jsx';
import { detectChords } from '../utils/chordDetect.js';
import { convertToBrackets } from '../utils/chordStyle.js';
import { transposeChord } from '../utils/transpose.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { saveFilePicker } from '../utils/filePicker.js';

const CUSTOM_KEY = 'cue_custom_chords';
const HIDDEN_KEY = 'cue_hidden_chords';

// Scale levels: index 0–4 → multiplier
const SCALES = [0.7, 0.85, 1.0, 1.3, 1.65];
// Base chord diagram SVG width at scale 1.0: padLeft*2 + strGap*3 = 20 + 30 = 50px
const DIAG_BASE_W = 50;

function loadCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; }
}
function saveCustom(c) { localStorage.setItem(CUSTOM_KEY, JSON.stringify(c)); }

function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
}
function saveHidden(set) { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); }
function builtinKey(chord) { return `${chord.name}:${chord.frets.join(',')}`; }

// ---- Add custom chord form -------------------------------------------------

// Accept both dash-separated ("0-0-0-3", "8-10-11-10") and compact ("0003") formats.
function parseFretStr(str) {
  const parts = str.includes('-')
    ? str.split('-')
    : str.padEnd(4, '0').slice(0, 4).split('');
  return parts.slice(0, 4).map(p => {
    const c = p.trim();
    if (c === 'X' || c === 'x') return -1;
    const n = parseInt(c, 10);
    return isNaN(n) ? 0 : n;
  });
}

function parseFingerStr(str) {
  if (!str.trim()) return null;
  const parts = str.includes('-')
    ? str.split('-')
    : str.padEnd(4, '0').slice(0, 4).split('');
  const arr = parts.slice(0, 4).map(p => {
    const n = parseInt(p.trim(), 10);
    return (n >= 1 && n <= 4) ? n : null;
  });
  return arr.some(Boolean) ? arr : null;
}

function isValidFretStr(raw) {
  if (raw.includes('-')) {
    const parts = raw.split('-');
    return parts.length === 4 && parts.every(p => /^([0-9]+|X)$/i.test(p.trim()));
  }
  return /^[0-9X]{4}$/.test(raw);
}

function CustomChordForm({ onSave, onCancel, theme, initialName = '', initialFretsStr = '', initialFingersStr = '' }) {
  const [name,       setName]       = useState(initialName);
  const [fretsStr,   setFretsStr]   = useState(initialFretsStr);
  const [fingersStr, setFingersStr] = useState(initialFingersStr);
  const dark = theme === 'dark';
  const { chordColor } = usePrefs();

  const previewFrets   = parseFretStr(fretsStr);
  const previewFingers = parseFingerStr(fingersStr);
  const previewChord   = { name: name || '?', frets: previewFrets, ...(previewFingers ? { fingers: previewFingers } : {}) };

  function handleSave(e) {
    e.preventDefault();
    if (!name.trim() || !isValidFretStr(fretsStr.toUpperCase())) return;
    const frets   = parseFretStr(fretsStr.toUpperCase());
    const fingers = parseFingerStr(fingersStr);
    onSave({ name: name.trim(), type: 'custom', frets, ...(fingers ? { fingers } : {}) });
  }

  const inp = `w-full border rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-indigo-500 ${dark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`;
  const lbl = `block text-xs font-medium mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`;
  const hint = `text-[10px] mt-0.5 ${dark ? 'text-gray-600' : 'text-gray-400'}`;

  return (
    <form onSubmit={handleSave} className={`border rounded-lg p-3 space-y-3 ${dark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
      {/* Live preview */}
      <div className="flex justify-center py-1">
        <ChordDiagram chord={previewChord} scale={1.3} theme={theme} chordColor={chordColor} />
      </div>

      <div>
        <label className={lbl}>Chord Name</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. C, G7, Dm" className={inp} />
      </div>

      <div>
        <label className={lbl}>Fret Numbers <span className={`font-normal ${dark ? 'text-gray-600' : 'text-gray-400'}`}>(G · C · E · A)</span></label>
        <input value={fretsStr}
          onChange={e => setFretsStr(e.target.value.toUpperCase().replace(/[^0-9X\-]/g, '').slice(0, 11))}
          placeholder="0-0-0-3" maxLength={11}
          className={inp} />
        <p className={hint}>0 = open · X = muted · use dashes between strings (e.g. 8-10-11-10)</p>
      </div>

      <div>
        <label className={lbl}>Finger Numbers <span className={`font-normal ${dark ? 'text-gray-600' : 'text-gray-400'}`}>(optional)</span></label>
        <input value={fingersStr}
          onChange={e => setFingersStr(e.target.value.replace(/[^0-4]/g, '').slice(0, 4))}
          placeholder="0000" maxLength={4}
          className={`${inp} tracking-[0.35em]`} />
        <p className={hint}>1=index · 2=middle · 3=ring · 4=pinky · 0=none</p>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={!name.trim() || !isValidFretStr(fretsStr.toUpperCase())}
          className="flex-1 py-3 pointer-fine:py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
          Save
        </button>
        <button type="button" onClick={onCancel}
          className={`flex-1 py-3 pointer-fine:py-2 text-sm rounded-lg transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---- SongChordPanel --------------------------------------------------------

export default function SongChordPanel({ text, semitones = 0, sizeLevel = 2, onSizeLevelChange, readonly = false, chordPrefs = {}, onChordPrefsChange }) {
  const { theme, chordColor } = usePrefs();
  const dark = theme === 'dark';

  const [customChords, setCustomChords] = useState(loadCustom);
  const [hiddenBuiltins, setHiddenBuiltins] = useState(loadHidden);
  const [addingCustom, setAddingCustom] = useState(null); // null = closed, string = open (pre-filled name)
  const [expandedChord, setExpandedChord] = useState(null); // name of chord whose picker is open
  const [editingChord, setEditingChord] = useState(null); // { originalName, originalFrets, isCustom, initialFretsStr, initialFingersStr }
  const [importFmtOpen, setImportFmtOpen] = useState(false);
  const [selectedChordName, setSelectedChordName] = useState(null); // chord highlighted for Edit

  // Detect chord names from source text, then transpose by semitones if a View Key is active.
  const detectedNames = useMemo(() => {
    const raw = detectChords(convertToBrackets(text));
    if (!semitones) return raw;
    const seen = new Set();
    return raw.map(name => transposeChord(name, semitones)).filter(name => {
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  }, [text, semitones]);

  const groups = useMemo(() =>
    detectedNames.map(name => ({
      name,
      shapes: [
        ...UKULELE_CHORDS.filter(c => c.name === name && !hiddenBuiltins.has(builtinKey(c))),
        ...customChords.filter(c => c.name === name),
      ],
    })),
    [detectedNames, customChords, hiddenBuiltins]
  );

  const scale   = SCALES[Math.max(0, Math.min(4, sizeLevel))];

  function selectShape(name, idx) {
    onChordPrefsChange?.({ ...chordPrefs, [name]: idx });
    setExpandedChord(null);
  }

  function handleSaveCustom(chord) {
    const updated = [...customChords, chord];
    setCustomChords(updated);
    saveCustom(updated);
    setAddingCustom(null);
  }

  function handleSaveEdited(chord) {
    const updated = [...customChords];
    if (editingChord?.isCustom) {
      const origKey = editingChord.originalFrets.join(',');
      const idx = updated.findIndex(c => c.name === editingChord.originalName && c.frets.join(',') === origKey);
      if (idx !== -1) updated[idx] = chord; else updated.push(chord);
    } else {
      updated.push(chord);
    }
    setCustomChords(updated);
    saveCustom(updated);
    setEditingChord(null);
  }

  function handleEditSelected() {
    if (!selectedChordName) return;
    const group = groups.find(g => g.name === selectedChordName);
    if (!group) return;
    if (group.shapes.length === 0) {
      setAddingCustom(selectedChordName);
      setExpandedChord(null);
      setImportFmtOpen(false);
      return;
    }
    const shapeIdx = Math.min(chordPrefs[selectedChordName] ?? 0, Math.max(0, group.shapes.length - 1));
    const shape = group.shapes[shapeIdx];
    const fretsStr = shape.frets.map(f => f === -1 ? 'X' : String(f)).join('-');
    const fingersStr = shape.fingers ? shape.fingers.join('') : '';
    setEditingChord({ originalName: selectedChordName, originalFrets: shape.frets, isCustom: shape.type === 'custom', initialFretsStr: fretsStr, initialFingersStr: fingersStr });
    setExpandedChord(null);
    setAddingCustom(null);
    setImportFmtOpen(false);
  }

  function handleDoubleClickChord(name, shapeIdx) {
    if (readonly) return;
    const group = groups.find(g => g.name === name);
    if (!group) return;
    const shape = group.shapes[shapeIdx];
    const fretsStr = shape.frets.map(f => f === -1 ? 'X' : String(f)).join('-');
    const fingersStr = shape.fingers ? shape.fingers.join('') : '';
    setEditingChord({ originalName: name, originalFrets: shape.frets, isCustom: shape.type === 'custom', initialFretsStr: fretsStr, initialFingersStr: fingersStr });
    setExpandedChord(null);
    setAddingCustom(null);
    setImportFmtOpen(false);
  }

  async function handleExportChordsCsv() {
    const allShapes = [...UKULELE_CHORDS, ...customChords];
    const rows = allShapes.map(c => {
      const frets   = c.frets.map(f => f === -1 ? 'X' : String(f)).join('-');
      const fingers = c.fingers ? c.fingers.join('') : '';
      return fingers ? `${c.name},${frets},${fingers}` : `${c.name},${frets}`;
    });
    const date = new Date().toISOString().slice(0, 10);
    await saveFilePicker(new Blob([rows.join('\n')], { type: 'text/csv' }), `cue-chords-${date}.csv`);
  }

  function handleDeleteBuiltin(chord) {
    const updated = new Set(hiddenBuiltins);
    updated.add(builtinKey(chord));
    setHiddenBuiltins(updated);
    saveHidden(updated);
  }

  function handleDeleteCustom(name, frets) {
    const key = frets.join(',');
    const updated = customChords.filter(c => !(c.name === name && c.frets.join(',') === key));
    setCustomChords(updated);
    saveCustom(updated);
    const next = { ...chordPrefs };
    delete next[name];
    onChordPrefsChange?.(next);
  }

  function handleImportCsv() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      document.body.removeChild(input);
      const file = input.files?.[0];
      if (!file) return;
      const lines = (await file.text()).split(/\r?\n/);
      const existing = [...customChords];
      let added = 0, skipped = 0, invalid = 0;

      for (const line of lines) {
        const cols = line.split(',');
        const name      = cols[0]?.trim() ?? '';
        const fretsRaw  = (cols[1]?.trim() ?? '').toUpperCase();
        const fingersRaw = (cols[2]?.trim() ?? '').replace(/-/g, '0');

        if (!name) continue; // blank line
        if (!isValidFretStr(fretsRaw)) {
          // Rows whose field 1 starts with A-G look like attempted chords — count invalid.
          // Other rows (e.g. header "Chord Name, Fret Numbers, …") are silently skipped.
          if (/^[A-Ga-g]/.test(name)) invalid++;
          continue;
        }

        const frets   = parseFretStr(fretsRaw);
        const fingers = parseFingerStr(fingersRaw);
        const key     = frets.join(',');

        if (existing.some(c => c.name === name && c.frets.join(',') === key)) {
          skipped++;
          continue;
        }

        existing.push({ name, type: 'custom', frets, ...(fingers ? { fingers } : {}) });
        added++;
      }

      setCustomChords(existing);
      saveCustom(existing);

      const summary = [`${added} shape${added !== 1 ? 's' : ''} added`];
      if (skipped) summary.push(`${skipped} skipped (already present)`);
      if (invalid) summary.push(`${invalid} invalid row${invalid !== 1 ? 's' : ''} skipped`);
      alert(`CSV import: ${summary.join(', ')}.`);
    };
    input.click();
  }

  function handleImportChords() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      document.body.removeChild(input);
      const file = input.files?.[0];
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); } catch { alert('Invalid JSON file.'); return; }
      if (data.type !== 'cue-chords' || !Array.isArray(data.chords)) {
        alert('This file is not a Cue chord library export.');
        return;
      }
      const existing = [...customChords];
      let added = 0, skipped = 0;
      for (const chord of data.chords) {
        const isDupe = existing.some(c => c.name === chord.name && c.frets.join(',') === chord.frets.join(','));
        if (isDupe) { skipped++; continue; }
        existing.push(chord);
        added++;
      }
      setCustomChords(existing);
      saveCustom(existing);
      alert(`Import complete: ${added} chord shape${added !== 1 ? 's' : ''} added, ${skipped} skipped (already present).`);
    };
    input.click();
  }

  const border  = dark ? 'border-gray-800' : 'border-gray-200';
  const mutedTx = dark ? 'text-gray-600'   : 'text-gray-400';
  const btnBase = `w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${dark ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}`;

  // If the expanded chord disappears from the song, close the picker.
  useEffect(() => {
    if (expandedChord !== null && !groups.some(g => g.name === expandedChord)) {
      setExpandedChord(null);
    }
  }, [groups, expandedChord]);

  // If the selected chord disappears (song/key changed), clear the selection.
  useEffect(() => {
    if (selectedChordName !== null && !groups.some(g => g.name === selectedChordName)) {
      setSelectedChordName(null);
    }
  }, [groups, selectedChordName]);

  // Resolve the group currently in picker mode (null = normal list).
  const pickerGroup = expandedChord !== null
    ? (groups.find(g => g.name === expandedChord) ?? null)
    : null;

  // ── Build inner content outside JSX to avoid IIFE quirks ─────────────────
  let innerContent;

  if (detectedNames.length === 0) {
    innerContent = (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-3 py-6">
        <p className={`text-xs text-center ${mutedTx}`}>No chords detected</p>
        {!readonly && (
          addingCustom !== null
            ? <div className="w-full px-2"><CustomChordForm key={addingCustom} theme={theme} initialName={addingCustom} onSave={handleSaveCustom} onCancel={() => setAddingCustom(null)} /></div>
            : <button onClick={() => setAddingCustom('')} className="text-xs text-indigo-600 hover:text-indigo-400 transition-colors">+ Add custom chord</button>
        )}
      </div>
    );
  } else if (pickerGroup !== null) {
    // ── PICKER MODE ──────────────────────────────────────────────────────────
    const pickerName  = pickerGroup.name;
    const pickerShapes = pickerGroup.shapes;
    const selectedIdx = Math.min(chordPrefs[pickerName] ?? 0, Math.max(0, pickerShapes.length - 1));

    innerContent = (
      <>
        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-2 border-b ${border} shrink-0`}>
          <span className={`text-sm font-mono font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{pickerName}</span>
          <button
            onClick={() => setExpandedChord(null)}
            className={`text-xs h-9 px-3 rounded-lg transition-colors ${dark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
          >
            ✕ Done
          </button>
        </div>

        {/* Voicings */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-wrap gap-2 items-start">
            {pickerShapes.map((shape, idx) => {
              const isSelected = selectedIdx === idx;
              const isCustom   = shape.type === 'custom';
              return (
                <div key={idx} className="relative group/s">
                  <div
                    onClick={() => selectShape(pickerName, idx)}
                    className={`cursor-pointer rounded-lg border p-0.5 transition-colors ${
                      isSelected
                        ? dark ? 'border-indigo-500 bg-indigo-950/50' : 'border-indigo-500 bg-white'
                        : dark ? 'border-gray-700 hover:border-gray-500 bg-gray-900/50' : 'border-gray-300 hover:border-gray-400 bg-white'
                    }`}
                  >
                    <ChordDiagram chord={shape} scale={scale} theme={theme} chordColor={chordColor} />
                  </div>
                  {!readonly && (
                    <button
                      onClick={() => isCustom ? handleDeleteCustom(pickerName, shape.frets) : handleDeleteBuiltin(shape)}
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border flex items-center justify-center opacity-0 group-hover/s:opacity-100 transition-opacity ${dark ? 'bg-gray-800 border-gray-700 text-gray-500 hover:text-red-400' : 'bg-white border-gray-300 text-gray-400 hover:text-red-500'}`}
                      title={isCustom ? 'Delete custom shape' : 'Hide built-in shape'}
                    >
                      <X size={9} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add voicing button */}
            {!readonly && addingCustom !== pickerName && (
              <button
                onClick={() => setAddingCustom(pickerName)}
                className={`border border-dashed rounded-lg p-1 text-center transition-colors cursor-pointer ${dark ? 'border-gray-700 hover:border-indigo-600 text-gray-600 hover:text-indigo-400' : 'border-gray-300 hover:border-indigo-400 text-gray-400 hover:text-indigo-600'}`}
                style={{ minWidth: `${Math.round(DIAG_BASE_W * scale)}px`, minHeight: '60px' }}
              >
                <Plus size={14} className="mx-auto mb-0.5" />
                <span className="text-[9px]">Add</span>
              </button>
            )}
          </div>

          {!readonly && addingCustom === pickerName && (
            <div className="mt-3">
              <CustomChordForm key={pickerName} theme={theme} initialName={pickerName} onSave={handleSaveCustom} onCancel={() => setAddingCustom(null)} />
            </div>
          )}
        </div>
      </>
    );
  } else {
    // ── NORMAL MODE ──────────────────────────────────────────────────────────
    innerContent = (
      <>
        {/* Size control */}
        {onSizeLevelChange && (
          <div className={`flex items-center justify-between px-2 py-1.5 border-b ${border} shrink-0`}>
            <span className={`text-[10px] uppercase tracking-wide ${mutedTx}`}>Size</span>
            <div className="flex items-center gap-1">
              <button className={btnBase} onClick={() => onSizeLevelChange(Math.max(0, sizeLevel - 1))} disabled={sizeLevel === 0}>−</button>
              <span className={`text-xs w-4 text-center ${mutedTx}`}>{sizeLevel + 1}</span>
              <button className={btnBase} onClick={() => onSizeLevelChange(Math.min(4, sizeLevel + 1))} disabled={sizeLevel === 4}>+</button>
            </div>
          </div>
        )}

        {/* Chord diagrams */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, ${Math.round(DIAG_BASE_W * scale)}px)` }}>
            {groups.map(({ name, shapes }) => {
              const selectedIdx = Math.min(chordPrefs[name] ?? 0, Math.max(0, shapes.length - 1));

              if (shapes.length === 0) {
                if (!readonly && addingCustom === name) {
                  return (
                    <div key={name} className="col-span-full">
                      <CustomChordForm key={name} theme={theme} initialName={name} onSave={handleSaveCustom} onCancel={() => setAddingCustom(null)} />
                    </div>
                  );
                }
                return (
                  <div
                    key={name}
                    onClick={!readonly ? () => setAddingCustom(name) : undefined}
                    title={!readonly ? `Add shape for ${name}` : undefined}
                    className={`border border-dashed rounded-lg p-1 text-center transition-colors ${
                      !readonly ? `cursor-pointer ${dark ? 'hover:border-indigo-600 hover:bg-indigo-950/40' : 'hover:border-indigo-400 hover:bg-indigo-50'}` : ''
                    } ${dark ? 'border-gray-800' : 'border-gray-300'}`}
                  >
                    <p className={`text-xs font-mono font-semibold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{name}</p>
                    <p className={`text-[9px] ${mutedTx}`}>{!readonly ? '+ add' : '?'}</p>
                  </div>
                );
              }

              const selectedShape = shapes[selectedIdx];
              const hasAlternates = shapes.length > 1;
              const isCustom      = selectedShape.type === 'custom';
              return (
                <div key={name} className="relative group">
                  <div
                    onClick={!readonly ? () => { setSelectedChordName(name); setExpandedChord(name); } : undefined}
                    onDoubleClick={!readonly ? (e) => { e.stopPropagation(); handleDoubleClickChord(name, selectedIdx); } : undefined}
                    className={!readonly ? `cursor-pointer rounded-lg border p-0.5 transition-colors ${
                      name === selectedChordName
                        ? 'border-indigo-500'
                        : dark ? 'border-transparent hover:border-indigo-600' : 'border-transparent hover:border-indigo-400'
                    }` : ''}
                    title={!readonly ? (hasAlternates ? `${shapes.length} voicings — click to pick · double-click to edit` : 'Click to manage voicings · double-click to edit') : undefined}
                  >
                    <ChordDiagram chord={selectedShape} scale={scale} theme={theme} chordColor={chordColor} />
                  </div>
                  {hasAlternates && (
                    <div className={`absolute bottom-1 right-1 text-[8px] leading-none px-0.5 rounded pointer-events-none ${dark ? 'text-gray-600 bg-gray-950' : 'text-gray-400 bg-white'}`}>
                      {selectedIdx + 1}/{shapes.length}
                    </div>
                  )}
                  {!readonly && (
                    <button
                      onClick={() => isCustom ? handleDeleteCustom(name, selectedShape.frets) : handleDeleteBuiltin(selectedShape)}
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${dark ? 'bg-gray-800 border-gray-700 text-gray-500 hover:text-red-400' : 'bg-white border-gray-300 text-gray-400 hover:text-red-500'}`}
                      title={isCustom ? 'Delete custom shape' : 'Hide built-in shape'}
                    >
                      <X size={9} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom bar */}
        {!readonly && (
          <div className={`shrink-0 border-t p-2 ${border}`}>
            {editingChord !== null
              ? <CustomChordForm
                  key={`edit-${editingChord.originalName}-${editingChord.originalFrets.join(',')}`}
                  theme={theme}
                  initialName={editingChord.originalName}
                  initialFretsStr={editingChord.initialFretsStr}
                  initialFingersStr={editingChord.initialFingersStr}
                  onSave={handleSaveEdited}
                  onCancel={() => setEditingChord(null)}
                />
              : addingCustom === ''
              ? <CustomChordForm key="" theme={theme} initialName="" onSave={handleSaveCustom} onCancel={() => setAddingCustom(null)} />
              : (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => { setAddingCustom(''); setEditingChord(null); }}
                    title="Add"
                    className={`w-11 h-11 pointer-fine:w-9 pointer-fine:h-9 flex items-center justify-center rounded-lg transition-colors ${dark ? 'text-gray-500 hover:text-indigo-400 hover:bg-gray-800' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'}`}>
                    <Plus size={18} />
                  </button>
                  <button
                    title={selectedChordName ? `Edit ${selectedChordName}` : 'Select a chord to edit'}
                    disabled={!selectedChordName}
                    onClick={handleEditSelected}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${dark ? 'text-gray-500 hover:text-indigo-400 hover:bg-gray-800' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'}`}>
                    <Pencil size={18} />
                  </button>
                  <div className="flex-1" />
                  <div className="relative">
                    <button onClick={() => setImportFmtOpen(v => !v)}
                      title="Import"
                      className={`w-11 h-11 pointer-fine:w-9 pointer-fine:h-9 flex items-center justify-center rounded-lg transition-colors ${dark ? 'text-gray-500 hover:text-indigo-400 hover:bg-gray-800' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'}`}>
                      <Download size={18} />
                    </button>
                    {importFmtOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setImportFmtOpen(false)} />
                        <div className={`absolute bottom-10 right-0 z-20 w-28 rounded-lg shadow-xl overflow-hidden border ${dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                          <button onClick={() => { handleImportCsv(); setImportFmtOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${dark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`}>CSV</button>
                          <button onClick={() => { handleImportChords(); setImportFmtOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${dark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`}>JSON</button>
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={handleExportChordsCsv} title="Export"
                    className={`w-11 h-11 pointer-fine:w-9 pointer-fine:h-9 flex items-center justify-center rounded-lg transition-colors ${dark ? 'text-gray-500 hover:text-indigo-400 hover:bg-gray-800' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'}`}>
                    <Upload size={18} />
                  </button>
                </div>
              )
            }
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {innerContent}
    </div>
  );
}
