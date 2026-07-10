import { useEffect, useMemo, useRef, useState } from 'react';
import { Save, Search, X } from 'lucide-react';
import { useYouTube } from '../context/YouTubeContext.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import MetadataForm from '../components/MetadataForm.jsx';
import SongPreview from '../components/SongPreview.jsx';
import SongChordPanel from '../components/SongChordPanel.jsx';
import ResizeHandle from '../components/ResizeHandle.jsx';
import { saveSong, saveDraft } from '../utils/storage.js';
import { transposeText, KEY_NAMES, semitonesBetween } from '../utils/transpose.js';
import { detectKey } from '../utils/keyDetect.js';
import { detectChordStyle, convertToOver, convertToBrackets } from '../utils/chordStyle.js';
import { detectChords } from '../utils/chordDetect.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useResizePanel } from '../hooks/useResizePanel.js';
import { useIsNarrow } from '../hooks/useIsNarrow.js';

const DEFAULT_METADATA = { title: '', artist: '', key: '', tempo: '', duration: '', timeSig: '4/4' };

function autoSizeLevel(text) {
  const n = detectChords(convertToBrackets(text || '')).length;
  if (n <= 4)  return 4;
  if (n <= 8)  return 3;
  if (n <= 14) return 2;
  if (n <= 20) return 1;
  return 0;
}


export default function EditorView({ song, onBack, onSaved, onPresent, onReturn, setlistSongs, setlistIdx, onSetlistNavigate }) {
  const { theme, chordColor, updatePref } = usePrefs();
  const dark = theme === 'dark';
  const isNarrow = useIsNarrow();

  const [text, setText]         = useState(song?.text || '');
  const [metadata, setMetadata] = useState({ ...DEFAULT_METADATA, ...(song?.metadata || {}) });
  const [songId, setSongId]     = useState(song?.id || null);

  const [displayMode, setDisplayMode] = useState(() => {
    if (song?.chordStyle) return song.chordStyle;
    return detectChordStyle(song?.text || '') || 'over';
  });

  // previewFormat: how the preview panel renders (may differ from editor text format)
  // linkedRef: while true, changing either toggle changes both (first-open mirror behavior)
  const [previewFormat, setPreviewFormat] = useState(() =>
    song?.previewMode || (song?.chordStyle ?? (detectChordStyle(song?.text || '') || 'over'))
  );
  const linkedRef = useRef(!song?.previewMode);

  const [sizeLevel, setSizeLevel]           = useState(song?.diagramScale !== undefined ? song.diagramScale : autoSizeLevel(song?.text));
  const [chordPrefs, setChordPrefs]         = useState(song?.chordPrefs ?? {});
  const [showPreview, setShowPreview]       = useState(true);
  const [showChordPanel, setShowChordPanel] = useState(true);
  const [narrowTab, setNarrowTab]           = useState('editor');
  const [displayKey, setDisplayKey]     = useState(song?.displayKey || '');
  const [isDirty, setIsDirty]           = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [showFR, setShowFR]           = useState(false);
  const [pendingNav, setPendingNav]   = useState(null); // new setlist index to navigate to
  const { openPlayer } = useYouTube();
  const [findText, setFindText]     = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [previewWidth, previewHandleProps] = useResizePanel(400, 200, 700, 'cue:editor_preview_px');
  const [chordsWidth,  chordsHandleProps]  = useResizePanel(208, 150, 450, 'cue:editor_chords_px');

  const hydrated      = useRef(false);
  const textareaRef   = useRef(null);
  const findInputRef  = useRef(null);

  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    saveDraft({ songId, text, metadata, chordStyle: displayMode, previewMode: previewFormat, diagramScale: sizeLevel, chordPrefs, displayKey });
  }, [text, metadata, displayMode, previewFormat, sizeLevel, chordPrefs]);

  async function handleSave() {
    const id = await saveSong({ id: songId, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: sizeLevel, chordPrefs, displayKey });
    setSongId(id);
    setIsDirty(false);
    onSaved?.({ id, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: sizeLevel, chordPrefs, displayKey });
  }

  function handleMakePermanent() {
    if (!displayKey || displayKey === metadata.key) return;
    const semitones = semitonesBetween(metadata.key, displayKey);
    setText(transposeText(text, semitones));
    setMetadata(m => ({ ...m, key: displayKey }));
    setDisplayKey('');
    setIsDirty(true);
  }

  function toggleEditorFormat() {
    const newFmt = displayMode === 'over' ? 'brackets' : 'over';
    const cur = detectChordStyle(text);
    if (newFmt === 'over' && cur === 'brackets') setText(convertToOver(text));
    else if (newFmt === 'brackets' && cur === 'over') setText(convertToBrackets(text));
    setDisplayMode(newFmt);
    if (linkedRef.current) { setPreviewFormat(newFmt); linkedRef.current = false; }
    setIsDirty(true);
  }

  function togglePreviewFormat() {
    const newFmt = previewFormat === 'over' ? 'brackets' : 'over';
    if (linkedRef.current) {
      const cur = detectChordStyle(text);
      if (newFmt === 'over' && cur === 'brackets') setText(convertToOver(text));
      else if (newFmt === 'brackets' && cur === 'over') setText(convertToBrackets(text));
      setDisplayMode(newFmt);
      linkedRef.current = false;
    }
    setPreviewFormat(newFmt);
    setIsDirty(true);
  }

  function openFR() {
    if (isNarrow) setNarrowTab('editor');
    setShowFR(true);
    const ta = textareaRef.current;
    if (ta) {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (sel) setFindText(sel);
    }
    requestAnimationFrame(() => findInputRef.current?.focus());
  }

  function closeFR() {
    setShowFR(false);
    textareaRef.current?.focus();
  }

  function expandEscapes(s) {
    return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  function findNext(fromPos) {
    const ta = textareaRef.current;
    if (!ta || !findText) return -1;
    const ef    = expandEscapes(findText);
    const start = fromPos ?? ta.selectionEnd ?? 0;
    const idx   = text.indexOf(ef, start);
    const found = idx !== -1 ? idx : text.indexOf(ef);
    if (found === -1) return -1;
    ta.focus();
    ta.setSelectionRange(found, found + ef.length);
    return found;
  }

  function handleFindNext() { findNext(); }

  function handleReplaceOne() {
    const ta = textareaRef.current;
    if (!ta || !findText) return;
    const ef  = expandEscapes(findText);
    const er  = expandEscapes(replaceText);
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel === ef) {
      const before = text.slice(0, ta.selectionStart);
      const after  = text.slice(ta.selectionEnd);
      const next   = before + er + after;
      setText(next);
      setIsDirty(true);
      const nextPos = ta.selectionStart + er.length;
      requestAnimationFrame(() => { findNext(nextPos); });
    } else {
      findNext();
    }
  }

  function handleReplaceAll() {
    if (!findText) return;
    const ef = expandEscapes(findText);
    const er = expandEscapes(replaceText);
    if (text.split(ef).length - 1 === 0) return;
    setText(text.split(ef).join(er));
    setIsDirty(true);
  }

  const matchCount = findText ? (text.split(expandEscapes(findText)).length - 1) : 0;

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); openFR(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [text]);

  const effectiveDisplayKey = displayKey || metadata.key || '';

  const rootBg    = dark ? 'bg-gray-950 text-white'      : 'bg-gray-50 text-gray-900';
  const border    = dark ? 'border-gray-800'              : 'border-gray-200';
  const mutedText = dark ? 'text-gray-600'                : 'text-gray-400';
  const btnBorder = dark ? 'border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white'
                         : 'border-gray-300 hover:border-gray-500 text-gray-600 hover:text-gray-900';

  // Shared JSX blocks --------------------------------------------------------

  const frBar = showFR && (
    <div className={`flex items-center gap-2 px-3 py-2 border-b ${border} ${dark ? 'bg-gray-900' : 'bg-gray-100'} shrink-0 flex-wrap`}>
      <input
        ref={findInputRef}
        value={findText}
        onChange={e => setFindText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') closeFR(); if (e.key === 'Enter') handleFindNext(); }}
        placeholder="Find"
        className={`border rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 w-36 ${dark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
      />
      <input
        value={replaceText}
        onChange={e => setReplaceText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') closeFR(); if (e.key === 'Enter') handleReplaceOne(); }}
        placeholder="Replace"
        className={`border rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 w-36 ${dark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
      />
      <button onClick={handleFindNext}  className={`px-2 py-1 text-xs rounded transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}>Find next</button>
      <button onClick={handleReplaceOne} className={`px-2 py-1 text-xs rounded transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}>Replace</button>
      <button onClick={handleReplaceAll} className="px-2 py-1 text-xs bg-indigo-700 hover:bg-indigo-600 text-white rounded transition-colors">Replace all</button>
      {findText && (
        <span className={`text-xs ${mutedText}`}>{matchCount} {matchCount === 1 ? 'match' : 'matches'}</span>
      )}
      <span className={`text-xs ${mutedText} hidden sm:inline`} title="Use \n for newline, \t for tab">\n = newline · \t = tab</span>
      <button onClick={closeFR} className={`ml-auto text-xs transition-colors ${mutedText} hover:text-gray-900 dark:hover:text-gray-300`}>✕</button>
    </div>
  );

  const textarea = (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={e => { setText(e.target.value); setIsDirty(true); }}
      onKeyDown={e => { if (e.key === 'Escape' && showFR) closeFR(); }}
      spellCheck={false}
      placeholder="Paste chords-over-lyrics or ChordPro text here…"
      className={`flex-1 resize-none font-mono text-sm p-4 outline-none leading-relaxed ${dark ? 'bg-gray-950 text-gray-100 placeholder-gray-800' : 'bg-white text-gray-900 placeholder-gray-400'}`}
    />
  );

  const chordSemitones = semitonesBetween(metadata.key, effectiveDisplayKey);

  const chordPanel = (
    <SongChordPanel
      text={text}
      semitones={chordSemitones}
      sizeLevel={sizeLevel}
      onSizeLevelChange={level => { setSizeLevel(level); setIsDirty(true); }}
      readonly={false}
      chordPrefs={chordPrefs}
      onChordPrefsChange={prefs => { setChordPrefs(prefs); setIsDirty(true); }}
    />
  );

  const inSetlist = setlistSongs && setlistSongs.length > 0 && setlistIdx != null;
  const hasPrev   = inSetlist && setlistIdx > 0;
  const hasNext   = inSetlist && setlistIdx < setlistSongs.length - 1;

  function requestNav(newIdx) {
    if (isDirty) { setPendingNav(newIdx); }
    else { onSetlistNavigate?.(newIdx); }
  }

  const navConfirm = pendingNav !== null && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Save Changes?</h2>
          <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>You have unsaved changes. Save before navigating?</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { handleSave(); setPendingNav(null); onSetlistNavigate?.(pendingNav); }}
            className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
          >Save</button>
          <button
            onClick={() => { const n = pendingNav; setPendingNav(null); onSetlistNavigate?.(n); }}
            className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >Discard</button>
        </div>
        <button
          onClick={() => setPendingNav(null)}
          className={`text-xs text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
        >Keep editing</button>
      </div>
    </div>
  );

  const backConfirm = showBackConfirm && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Save Changes?</h2>
          <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>You have unsaved changes. Do you want to save before leaving?</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { handleSave(); setShowBackConfirm(false); onBack(); }}
            className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => { setShowBackConfirm(false); onBack(); }}
            className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Discard
          </button>
        </div>
        <button
          onClick={() => setShowBackConfirm(false)}
          className={`text-xs text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Keep editing
        </button>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------

  return (
    <div className={`h-dvh ${rootBg} flex flex-col`}>
      {/* Header */}
      <header className={`px-4 py-3 border-b ${border} flex items-center gap-3 shrink-0`}>
        <input
          value={metadata.title}
          onChange={e => { setMetadata(m => ({ ...m, title: e.target.value })); setIsDirty(true); }}
          placeholder="Song title"
          className={`flex-1 bg-transparent text-lg font-bold outline-none min-w-0 ${dark ? 'text-white placeholder-gray-700' : 'text-gray-900 placeholder-gray-400'}`}
        />

        <div className="flex items-center gap-2 shrink-0">
          {inSetlist && (
            <>
              <button
                onClick={() => hasPrev && requestNav(setlistIdx - 1)}
                disabled={!hasPrev}
                className={`px-2 py-1.5 text-sm border rounded-lg transition-colors ${hasPrev ? btnBorder : `border-transparent ${mutedText} cursor-not-allowed`}`}
                title="Previous song"
              >← Prev</button>
              <span className={`text-xs ${mutedText}`}>{setlistIdx + 1}/{setlistSongs.length}</span>
              <button
                onClick={() => hasNext && requestNav(setlistIdx + 1)}
                disabled={!hasNext}
                className={`px-2 py-1.5 text-sm border rounded-lg transition-colors ${hasNext ? btnBorder : `border-transparent ${mutedText} cursor-not-allowed`}`}
                title="Next song"
              >Next →</button>
            </>
          )}
          {(() => {
            const hasYT = !!youtubeEmbedUrl(metadata.youtubeUrl);
            return (
              <button
                onClick={() => hasYT && openPlayer(metadata.youtubeUrl, metadata.title)}
                disabled={!hasYT}
                title={hasYT ? 'Play YouTube' : 'No YouTube URL saved'}
                className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${hasYT ? `${btnBorder} text-red-500 dark:text-red-400 hover:text-red-400` : `border-transparent ${mutedText} cursor-not-allowed opacity-40`}`}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
              </button>
            );
          })()}
          {onReturn ? (
            <button
              onClick={() => onReturn({ id: songId, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: sizeLevel, chordPrefs, displayKey })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${btnBorder}`}
            >
              ↩ Return to Performance
            </button>
          ) : (
            <button
              onClick={() => onPresent?.([{ id: songId, metadata, text, chordStyle: previewFormat, displayKey }], 0)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${btnBorder}`}
            >
              ▶ Present
            </button>
          )}

          <button
            onClick={() => updatePref('theme', dark ? 'light' : 'dark')}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${btnBorder}`}
            title="Toggle theme"
          >
            {dark ? '☀' : '☾'}
          </button>

          <button
            onClick={() => isDirty ? setShowBackConfirm(true) : onBack()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors shrink-0"
            title="Back to Library"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Metadata form */}
      <MetadataForm
        metadata={metadata}
        onChange={m => { setMetadata(m); setIsDirty(true); }}
        onDetectKey={() => detectKey(convertToBrackets(text))}
      />

      {/* Toolbar */}
      <div className={`px-4 py-2 border-b ${border} ${dark ? 'bg-gray-950' : 'bg-gray-50'} flex flex-wrap items-center gap-3 shrink-0`}>

        {/* View Key */}
        <div className="flex items-center gap-2">
          <span className={`text-xs ${mutedText}`}>View key:</span>
          <select
            value={displayKey}
            onChange={e => { setDisplayKey(e.target.value); setIsDirty(true); }}
            className={`border focus:border-indigo-500 outline-none text-sm rounded px-2 py-0.5 cursor-pointer ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="">{metadata.key || '—'}</option>
            {KEY_NAMES.filter(n => n !== metadata.key).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {displayKey && displayKey !== metadata.key && (
            <button
              onClick={handleMakePermanent}
              className={`text-xs px-2 py-0.5 border rounded transition-colors ${dark ? 'border-indigo-700 text-indigo-400 hover:bg-indigo-900' : 'border-indigo-400 text-indigo-600 hover:bg-indigo-50'}`}
            >
              Make permanent
            </button>
          )}
        </div>

        {/* Chord Color */}
        <div className="flex items-center gap-1.5">
          <span className={`text-xs ${mutedText}`}>Chord:</span>
          <input
            type="color"
            value={chordColor}
            onChange={e => updatePref('chordColor', e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
            title="Chord color"
          />
        </div>

        {/* Find */}
        <button
          onClick={showFR ? closeFR : openFR}
          className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md font-medium border transition-colors ${
            showFR
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : dark ? 'border-gray-700 text-gray-400 hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'
          }`}
          title="Find & Replace (Cmd+F)"
        >
          {showFR ? 'Done' : <><Search size={11} /> Find</>}
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md font-medium border transition-colors ${
            isDirty
              ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500'
              : dark ? 'border-gray-700 text-gray-600 cursor-not-allowed' : 'border-gray-300 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Save size={11} /> Save
        </button>

        {/* Format toggles: [Editor Format] → [Preview Format] */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleEditorFormat}
            className={`px-3 py-1 text-xs rounded-md font-medium border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900'}`}
            title="Editor text format — click to convert"
          >
            {displayMode === 'over' ? 'Over Lyrics' : 'Brackets'}
          </button>
          <span className={`text-xs px-0.5 ${mutedText}`}>→</span>
          <button
            onClick={togglePreviewFormat}
            className={`px-3 py-1 text-xs rounded-md font-medium border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900'}`}
            title="Preview display format — click to change"
          >
            {previewFormat === 'over' ? 'Over Lyrics' : 'Brackets'}
          </button>
        </div>

        {/* Spacer pushes Preview + Chords to the right */}
        <div className="flex-1" />

        {/* Narrow: tab pills — Wide: Preview + Chords toggles */}
        {isNarrow ? (
          <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${dark ? 'bg-gray-800' : 'bg-gray-200'}`}>
            {[['editor', 'Text'], ['preview', 'Preview'], ['chords', 'Chords']].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setNarrowTab(tab)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  narrowTab === tab
                    ? 'bg-indigo-600 text-white'
                    : dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >{label}</button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(v => !v)}
              className={`px-3 py-1 text-xs rounded-md font-medium border transition-colors ${
                showPreview
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : dark ? 'border-gray-700 text-gray-400 hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'
              }`}
              title="Toggle preview panel"
            >
              Preview
            </button>
            <button
              onClick={() => setShowChordPanel(v => !v)}
              className={`px-3 py-1 text-xs rounded-md font-medium border transition-colors ${
                showChordPanel
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : dark ? 'border-gray-700 text-gray-400 hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'
              }`}
              title="Toggle chord diagram panel"
            >
              Chords
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {isNarrow ? (
          /* ── Narrow (iPad / phone): one panel at a time ── */
          <>
            {/* Text editor — always mounted (preserves cursor/scroll); hidden via CSS when inactive */}
            <div className={`flex-col min-w-0 min-h-0 flex-1 overflow-hidden ${narrowTab === 'editor' ? 'flex' : 'hidden'}`}>
              <div className={`px-3 py-1.5 border-b ${border} shrink-0 flex items-center`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Text</span>
              </div>
              {frBar}
              {textarea}
            </div>

            {narrowTab === 'preview' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <SongPreview text={text} metadata={metadata} displayMode={previewFormat} displayKey={effectiveDisplayKey} />
              </div>
            )}

            {narrowTab === 'chords' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className={`px-3 py-1.5 border-b ${border} shrink-0`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Chords</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  {chordPanel}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── Wide (desktop): resizable side-by-side panels ── */
          <>
            {/* Text editor */}
            <div className="flex flex-col min-w-0 min-h-0 flex-1 overflow-hidden">
              <div className={`px-3 py-1.5 border-b ${border} shrink-0 flex items-center`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Text</span>
              </div>
              {frBar}
              {textarea}
            </div>

            {/* Handle: editor / preview (or editor / chords when preview hidden) */}
            {showPreview
              ? <ResizeHandle handleProps={previewHandleProps} dark={dark} />
              : showChordPanel
                ? <ResizeHandle handleProps={chordsHandleProps} dark={dark} />
                : null
            }

            {/* Preview panel */}
            {showPreview && (
              <div className="shrink-0 min-h-0 p-4 overflow-y-auto" style={{ width: previewWidth }}>
                <SongPreview text={text} metadata={metadata} displayMode={previewFormat} displayKey={effectiveDisplayKey} />
              </div>
            )}

            {/* Handle: preview / chords */}
            {showPreview && showChordPanel && (
              <ResizeHandle handleProps={chordsHandleProps} dark={dark} />
            )}

            {/* Chord reference panel */}
            {showChordPanel && (
              <div className={`shrink-0 flex flex-col overflow-hidden border-l ${border}`} style={{ width: chordsWidth }}>
                <div className={`px-3 py-1.5 border-b ${border} shrink-0`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Chords</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  {chordPanel}
                </div>
              </div>
            )}
          </>
        )}

        {/* Unsaved changes confirmation — fixed overlay, visible in all layouts */}
        {backConfirm}
        {navConfirm}
      </div>

    </div>
  );
}
