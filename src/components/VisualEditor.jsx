import { Fragment, useMemo, useRef, useState } from 'react';
import { parseChordPro, splitAnnotations } from '../utils/chordPro.js';

// Serialize a parsed line back to ChordPro text.
function lineToText(line) {
  if (line.type === 'empty')     return '';
  if (line.type === 'comment')   return `# ${line.text}`;
  if (line.type === 'directive') return `{${line.key}: ${line.value}}`;
  if (line.type === 'lyrics')    return line.segments?.[0]?.text ?? '';
  if (line.type === 'chords') {
    return line.segments
      .map(seg => (seg.chord !== null ? `[${seg.chord}]` : '') + (seg.text ?? ''))
      .join('');
  }
  return '';
}

function LyricText({ text }) {
  return splitAnnotations(text).map((run, i) =>
    run.marker
      ? <span key={i} className="text-indigo-300 font-bold">{run.text}</span>
      : <Fragment key={i}>{run.text}</Fragment>
  );
}

// Inline text input that auto-sizes to its content.
function InlineTextInput({ value: initialValue, onCommit, onCancel, className, style }) {
  const [value, setValue] = useState(initialValue);

  function commit() { onCommit(value); }

  function handleKeyDown(e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') onCancel();
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      style={{
        width: `${Math.max((value.length || 1) + 2, 4)}ch`,
        fontFamily: 'monospace',
        fontSize: 15,
        ...style,
      }}
      className={`bg-gray-800 border-b-2 border-indigo-500 outline-none text-gray-100 leading-snug ${className ?? ''}`}
    />
  );
}

// ---- EditableChordLine ------------------------------------------------------
// Chords: double-click to edit.  Lyric text: single-click to edit.

function EditableChordLine({ lineIdx, segments, onUpdateChord, onUpdateText }) {
  const [editChordSeg, setEditChordSeg] = useState(null);
  const [editTextSeg,  setEditTextSeg]  = useState(null);

  function commitChord(val) {
    onUpdateChord(lineIdx, editChordSeg, val.trim());
    setEditChordSeg(null);
  }

  function commitText(val) {
    onUpdateText(lineIdx, editTextSeg, val);
    setEditTextSeg(null);
  }

  return (
    <div className="flex flex-wrap font-mono mb-2" style={{ lineHeight: 1 }}>
      {segments.map((seg, segIdx) => (
        <div key={segIdx} className="flex flex-col" style={{ whiteSpace: 'pre' }}>
          {/* ── Chord row ── */}
          <div style={{ minHeight: '1.4em', fontSize: 13 }}>
            {seg.chord !== null ? (
              editChordSeg === segIdx ? (
                <InlineTextInput
                  value={seg.chord}
                  onCommit={commitChord}
                  onCancel={() => setEditChordSeg(null)}
                  className="text-indigo-300 font-bold text-xs w-14"
                  style={{ fontSize: 13 }}
                />
              ) : (
                <span
                  className="text-indigo-400 font-bold cursor-pointer hover:text-indigo-200 hover:bg-gray-800 rounded px-0.5 transition-colors select-none"
                  onDoubleClick={() => setEditChordSeg(segIdx)}
                  title="Double-click to edit chord"
                >
                  {seg.chord}{' '}
                </span>
              )
            ) : (
              <span className="opacity-0 select-none">·</span>
            )}
          </div>

          {/* ── Lyric text row ── */}
          <div style={{ fontSize: 15 }}>
            {editTextSeg === segIdx ? (
              <InlineTextInput
                value={seg.text ?? ''}
                onCommit={commitText}
                onCancel={() => setEditTextSeg(null)}
              />
            ) : (
              <span
                className="text-gray-100 leading-snug cursor-text hover:bg-gray-800/50 rounded-sm transition-colors"
                onClick={() => setEditTextSeg(segIdx)}
                title="Click to edit text"
              >
                {seg.text ? <LyricText text={seg.text} /> : ' '}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- EditableLyricsLine -----------------------------------------------------
// Pure-lyric lines (no chords): click anywhere to edit the whole line.

function EditableLyricsLine({ lineIdx, text, onUpdateText }) {
  const [editing, setEditing] = useState(false);

  function commit(val) {
    onUpdateText(lineIdx, 0, val);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="font-mono mb-1" style={{ fontSize: 15 }}>
        <input
          autoFocus
          defaultValue={text}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commit(e.target.value); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-full bg-gray-800 border-b-2 border-indigo-500 outline-none text-gray-100 font-mono leading-relaxed"
          style={{ fontSize: 15 }}
        />
      </div>
    );
  }

  return (
    <p
      className="font-mono text-gray-100 leading-relaxed mb-1 cursor-text hover:bg-gray-800/40 rounded-sm transition-colors px-0.5"
      style={{ fontSize: 15 }}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {text ? <LyricText text={text} /> : ' '}
    </p>
  );
}

// ---- EditableSectionLabel ---------------------------------------------------

function EditableSectionLabel({ lineIdx, text, onUpdateLabel }) {
  const [editing, setEditing] = useState(false);

  function commit(val) {
    onUpdateLabel(lineIdx, val.trim());
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={text}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); commit(e.target.value); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className="text-indigo-400 text-xs font-bold uppercase tracking-wider bg-gray-800 border-b border-indigo-500 outline-none mt-5 mb-1.5 w-full"
      />
    );
  }

  return (
    <p
      className="text-indigo-500 text-xs font-bold uppercase tracking-wider mt-5 mb-1.5 cursor-text hover:text-indigo-300 transition-colors"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit section label"
    >
      {text}
    </p>
  );
}

// ---- Search & Replace -------------------------------------------------------

function SearchReplace({ onReplace }) {
  const [find, setFind]       = useState('');
  const [replace, setReplace] = useState('');
  const [open, setOpen]       = useState(false);

  function handleReplace() {
    if (!find.trim()) return;
    onReplace(find.trim(), replace.trim());
    setFind(''); setReplace('');
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-gray-600 hover:text-gray-400 transition-colors px-2 py-1">
        Find & Replace chord
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gray-900 border border-gray-700 rounded-lg">
      <input autoFocus value={find} onChange={e => setFind(e.target.value)} placeholder="Chord (e.g. Dm)" className="bg-transparent text-xs text-white outline-none placeholder-gray-600 w-24" />
      <span className="text-gray-600 text-xs">→</span>
      <input value={replace} onChange={e => setReplace(e.target.value)} placeholder="Replace with" onKeyDown={e => { if (e.key === 'Enter') handleReplace(); if (e.key === 'Escape') setOpen(false); }} className="bg-transparent text-xs text-white outline-none placeholder-gray-600 w-24" />
      <button onClick={handleReplace} className="text-xs px-2 py-0.5 bg-indigo-700 hover:bg-indigo-600 rounded text-white transition-colors">Replace all</button>
      <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-300 text-xs">✕</button>
    </div>
  );
}

// ---- Visual Editor ----------------------------------------------------------

export default function VisualEditor({ text, metadata, onChange }) {
  const rawLines = useMemo(() => parseChordPro(text || ''), [text]);

  function applyLineChange(lineIdx, updatedLine) {
    const lines = rawLines.map((l, i) => i === lineIdx ? updatedLine : l);
    onChange(lines.map(lineToText).join('\n'));
  }

  function updateChord(lineIdx, segIdx, newChord) {
    const line = rawLines[lineIdx];
    if (line?.type !== 'chords') return;
    const segs = line.segments.map((seg, si) =>
      si === segIdx ? { ...seg, chord: newChord === '' ? null : newChord } : seg
    );
    applyLineChange(lineIdx, { ...line, segments: segs });
  }

  function updateText(lineIdx, segIdx, newText) {
    const line = rawLines[lineIdx];
    if (!line) return;
    if (line.type === 'chords') {
      const segs = line.segments.map((seg, si) => si === segIdx ? { ...seg, text: newText } : seg);
      applyLineChange(lineIdx, { ...line, segments: segs });
    } else if (line.type === 'lyrics') {
      applyLineChange(lineIdx, { ...line, segments: [{ chord: null, text: newText }] });
    }
  }

  function updateLabel(lineIdx, newText) {
    const line = rawLines[lineIdx];
    if (line?.type !== 'comment') return;
    applyLineChange(lineIdx, { ...line, text: newText });
  }

  function handleReplaceAll(find, replace) {
    const lines = rawLines.map(line => {
      if (line.type !== 'chords') return line;
      const segs = line.segments.map(seg =>
        seg.chord === find ? { ...seg, chord: replace || null } : seg
      );
      return { ...line, segments: segs };
    });
    onChange(lines.map(lineToText).join('\n'));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-1.5 border-b border-gray-800 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Visual — click lyrics to edit · double-click chords
          {metadata?.key && <span className="ml-2 text-indigo-700">(key: {metadata.key})</span>}
        </span>
        <SearchReplace onReplace={handleReplaceAll} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {!text?.trim() && (
          <p className="text-gray-700 text-sm italic text-center mt-8">
            Add content in ChordPro mode first, then edit visually here.
          </p>
        )}

        {rawLines.map((line, i) => {
          if (line.type === 'empty')     return <div key={i} className="h-4" />;
          if (line.type === 'directive') return null;
          if (line.type === 'comment')   return <EditableSectionLabel  key={i} lineIdx={i} text={line.text}              onUpdateLabel={updateLabel} />;
          if (line.type === 'chords')    return <EditableChordLine     key={i} lineIdx={i} segments={line.segments}       onUpdateChord={updateChord} onUpdateText={updateText} />;
          if (line.type === 'lyrics')    return <EditableLyricsLine    key={i} lineIdx={i} text={line.segments?.[0]?.text ?? ''} onUpdateText={updateText} />;
          return null;
        })}
      </div>
    </div>
  );
}
