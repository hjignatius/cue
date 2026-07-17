import { useEffect, useMemo, useRef, useState } from 'react';
import { Save, Search, X, Pencil, RotateCcw, Tv, Undo2 } from 'lucide-react';
import { useYouTube } from '../context/YouTubeContext.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import MetadataForm from '../components/MetadataForm.jsx';
import SongPreview from '../components/SongPreview.jsx';
import SongChordPanel from '../components/SongChordPanel.jsx';
import ResizeHandle from '../components/ResizeHandle.jsx';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY_CHROME, ROUND_FILL_ACTIVE, ROUND_SIZE_ACTION, TriangleLeft, TriangleRight } from '../components/RoundButton.jsx';
import { saveSong, saveDraft } from '../utils/storage.js';
import { loadAnnotation, deleteAnnotation } from '../utils/annotations.js';
import AnnotationCanvas from '../components/AnnotationCanvas.jsx';
import { KEY_NAMES, semitonesBetween, useFlatsForKey } from '../utils/transpose.js';
import { detectChordStyle, convertToOver, convertToBrackets } from '../utils/chordStyle.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useResizePanel } from '../hooks/useResizePanel.js';
import { useIsNarrow } from '../hooks/useIsNarrow.js';

const DEFAULT_METADATA = { title: '', artist: '', key: '', tempo: '', duration: '', timeSig: '4/4' };

// Visible label inside a pill button (white via RoundButton's text-white).
function PillLabel({ children }) {
  return <span className="text-sm font-medium leading-none whitespace-nowrap">{children}</span>;
}

// Target lyric line width in characters. Mirrors PresentationView's
// LYRIC_TARGET_CHARS (the column count Present wraps at). Kept as a local
// constant for now; when the Settings-driven width lands, both read that.
const LYRIC_TARGET_CHARS = 65;
// Editor textarea metrics: p-4 padding (16px) and text-sm monospace (14px).
const TA_PAD = 16;
const TA_FONT = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// Passive character ruler across the top of the editor's text area. Ticks every
// 5 columns (labels every 10), plus a distinct marker at the target width. Stays
// aligned to the textarea columns and scrolls horizontally with it.
function CharRuler({ textareaRef, text, target, dark }) {
  const trackRef = useRef(null);
  const [advance, setAdvance] = useState(8.4);
  const [cols, setCols] = useState(target + 20);

  // Measure the real monospace advance so ticks land on character cells.
  useEffect(() => {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = TA_FONT;
      const w = ctx.measureText('0'.repeat(50)).width / 50;
      if (w > 0) setAdvance(w);
    } catch { /* keep fallback */ }
  }, []);

  // Keep the ruler aligned to horizontal scroll, and widen it to cover the
  // longest line so scrolling right never runs past the ticks.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const sync = () => {
      if (trackRef.current) trackRef.current.style.transform = `translateX(${-ta.scrollLeft}px)`;
      const need = Math.ceil((ta.scrollWidth - TA_PAD) / advance) + 5;
      setCols(c => (need > c ? need : c));
    };
    ta.addEventListener('scroll', sync);
    sync();
    return () => ta.removeEventListener('scroll', sync);
  }, [textareaRef, advance, text]);

  const tickCol   = dark ? '#4b5563' : '#cbd5e1'; // gray-600 / slate-300
  const labelCol  = dark ? '#9ca3af' : '#6b7280'; // gray-400 / gray-500
  const targetCol = '#6366f1';                    // indigo-500

  const ticks = [];
  for (let c = 5; c <= cols; c += 5) {
    if (c === target) continue; // drawn as the distinct marker instead
    const x = TA_PAD + c * advance;
    const major = c % 10 === 0;
    ticks.push(<div key={`t${c}`} className="absolute bottom-0" style={{ left: x, width: 1, height: major ? 9 : 5, background: tickCol }} />);
    if (major) ticks.push(
      <div key={`l${c}`} className="absolute top-0 text-[9px] leading-none tabular-nums" style={{ left: x, transform: 'translateX(-50%)', color: labelCol }}>{c}</div>
    );
  }
  const tx = TA_PAD + target * advance;

  return (
    <div className={`relative shrink-0 h-[22px] overflow-hidden select-none border-b ${dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white'}`} aria-hidden="true">
      <div ref={trackRef} className="absolute inset-0 will-change-transform">
        {ticks}
        {/* Target-width marker — the one that matters. */}
        <div className="absolute top-0 bottom-0" style={{ left: tx, width: 2, background: targetCol }} />
        <div className="absolute top-0 px-0.5 text-[9px] leading-none font-semibold tabular-nums rounded-sm" style={{ left: tx, transform: 'translateX(-50%)', color: '#fff', background: targetCol }}>{target}</div>
      </div>
    </div>
  );
}


export default function EditorView({ song, onBack, onSaved, onPresent, onReturn, setlistSongs, setlistIdx, onSetlistNavigate, annotationStamp = 0 }) {
  const { theme, chordDiagramSize, accidentals, updatePref } = usePrefs();
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

  const [chordPrefs, setChordPrefs]         = useState(song?.chordPrefs ?? {});
  const [showPreview, setShowPreview]       = useState(true);
  const [showChordPanel, setShowChordPanel] = useState(true);
  const [narrowTab, setNarrowTab]           = useState('editor');
  const [displayKey, setDisplayKey]     = useState(song?.displayKey || '');
  const [isDirty, setIsDirty]           = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [showFR, setShowFR]           = useState(false);
  const [pendingNav, setPendingNav]   = useState(null); // new setlist index to navigate to
  const { openPlayer } = useYouTube();
  const [findText, setFindText]     = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [previewWidth, previewHandleProps] = useResizePanel(400, 200, 700, 'cue:editor_preview_px');
  const [chordsWidth,  chordsHandleProps]  = useResizePanel(208, 150, 450, 'cue:editor_chords_px');

  // Annotation overlay state
  const [hasAnnotation, setHasAnnotation]     = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [clearAnnotConfirm, setClearAnnotConfirm] = useState(false);

  const hydrated      = useRef(false);
  const textareaRef   = useRef(null);
  const findInputRef  = useRef(null);
  // Revert baseline = the last-saved editor state (the entry state until the first
  // save this session). Revert restores it. Captured on songId change and reset
  // after each successful Save. Annotations are a separate store — not included.
  const baselineRef   = useRef(null);
  const snapshotState = () => ({
    text,
    metadata: { ...metadata },
    displayMode,
    previewFormat,
    chordPrefs: { ...chordPrefs },
    displayKey,
  });

  // Re-check annotation existence whenever the song changes OR when returning from
  // PresentationView (annotationStamp increments so the effect re-fires even when
  // EditorView stayed mounted behind PresentationView and songId didn't change).
  useEffect(() => {
    if (!songId) return;
    loadAnnotation(songId).then(ann => {
      setHasAnnotation((ann?.strokes?.length ?? 0) > 0);
    });
  }, [songId, annotationStamp]);

  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    saveDraft({ songId, text, metadata, chordStyle: displayMode, previewMode: previewFormat, chordPrefs, displayKey });
  }, [text, metadata, displayMode, previewFormat, chordPrefs]);

  // Reset the revert baseline whenever the edited song changes. songId changes on
  // mount and when a new song first receives its id on save; the editor also
  // remounts for Prev/Next and Edit-from-Present, which re-runs this on the new song.
  useEffect(() => {
    baselineRef.current = snapshotState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  async function handleSave() {
    const id = await saveSong({ id: songId, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: chordDiagramSize, chordPrefs, displayKey });
    setSongId(id);
    setIsDirty(false);
    baselineRef.current = snapshotState(); // Revert target becomes the just-saved state
    onSaved?.({ id, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: chordDiagramSize, chordPrefs, displayKey });
  }

  function handleRevert() {
    const b = baselineRef.current;
    setShowRevertConfirm(false);
    if (!b) return;
    setText(b.text);
    setMetadata(b.metadata);
    setDisplayMode(b.displayMode);
    setPreviewFormat(b.previewFormat);
    setChordPrefs(b.chordPrefs);
    setDisplayKey(b.displayKey);
    setIsDirty(false);
    // Rewrite the draft to the baseline (in-memory + draft only, no song-record or
    // cloud write) so a reload cannot resurrect the discarded edits.
    saveDraft({ songId, text: b.text, metadata: b.metadata, chordStyle: b.displayMode, previewMode: b.previewFormat, chordPrefs: b.chordPrefs, displayKey: b.displayKey });
  }

  async function handleClearAnnotations() {
    if (!songId) return;
    // Update UI immediately so the button vanishes before the async delete completes.
    setHasAnnotation(false);
    setShowAnnotations(false);
    setClearAnnotConfirm(false);
    await deleteAnnotation(songId);
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
  // Shared sizing for the Find and Save buttons.
  const toolCtl = 'h-9 px-3 text-xs rounded-lg font-medium border transition-colors';

  // Header round-button fill. On DARK chrome the translucent night fill composites
  // to ~#4e5055 (~8:1) and reads well; on LIGHT chrome the translucent day fill
  // would be muddy (~2.9:1), so the opaque slate ROUND_FILL_DAY_CHROME is used
  // instead. Exit keeps ROUND_FILL_ACTIVE (indigo) so it stays the anchor.
  const headerFill = dark ? ROUND_FILL_NIGHT : ROUND_FILL_DAY_CHROME;

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
      wrap="off"
      placeholder="Paste chords-over-lyrics or ChordPro text here…"
      className={`flex-1 resize-none font-mono text-sm p-4 outline-none leading-relaxed whitespace-pre overflow-auto ${dark ? 'bg-gray-950 text-gray-100 placeholder-gray-800' : 'bg-white text-gray-900 placeholder-gray-400'}`}
    />
  );

  const chordSemitones = semitonesBetween(metadata.key, effectiveDisplayKey);
  // Accidental spelling for transposed diagram labels — auto follows the View Key.
  const chordUseFlats = useFlatsForKey(accidentals, effectiveDisplayKey);

  const chordPanel = (
    <SongChordPanel
      text={text}
      semitones={chordSemitones}
      useFlats={chordUseFlats}
      sizeLevel={chordDiagramSize}
      onSizeLevelChange={level => updatePref('chordDiagramSize', level)}
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
            className="flex-1 py-3 pointer-fine:py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => { setShowBackConfirm(false); onBack(); }}
            className={`flex-1 py-3 pointer-fine:py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Discard
          </button>
        </div>
        <button
          onClick={() => setShowBackConfirm(false)}
          className={`text-xs text-center transition-colors min-h-[44px] pointer-fine:min-h-[36px] flex items-center justify-center w-full ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Keep editing
        </button>
      </div>
    </div>
  );

  const revertConfirm = showRevertConfirm && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Discard unsaved changes?</h2>
          <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>This restores the song to its last saved state. Your edits since then will be lost. Ink annotations are not affected.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRevert}
            className="flex-1 py-3 pointer-fine:py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors"
          >
            Discard
          </button>
          <button
            onClick={() => setShowRevertConfirm(false)}
            className={`flex-1 py-3 pointer-fine:py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------

  return (
    <div className={`h-dvh ${rootBg} flex flex-col`}>
      {/* Header */}
      <header className={`px-4 py-2 border-b ${border} flex items-center gap-3 shrink-0`}>
        <input
          value={metadata.title}
          onChange={e => { setMetadata(m => ({ ...m, title: e.target.value })); setIsDirty(true); }}
          placeholder="Song title"
          className={`flex-1 bg-transparent text-lg font-bold outline-none min-w-0 ${dark ? 'text-white placeholder-gray-700' : 'text-gray-900 placeholder-gray-400'}`}
        />

        <div className="flex items-center gap-2 shrink-0">
          {inSetlist && (
            <>
              {/* Prev/Next: pill (icon + label) when wide, icon-only circle when
                  narrow — the label costs width a phone header can't spare. */}
              <RoundButton
                size={ROUND_SIZE_ACTION} pill={!isNarrow}
                label="Previous song" title="Previous song"
                fill={headerFill} disabled={!hasPrev}
                onActivate={() => requestNav(setlistIdx - 1)}
              >
                <TriangleLeft size={22} />{!isNarrow && <PillLabel>Prev</PillLabel>}
              </RoundButton>
              <span className={`text-xs ${mutedText}`}>{setlistIdx + 1}/{setlistSongs.length}</span>
              <RoundButton
                size={ROUND_SIZE_ACTION} pill={!isNarrow}
                label="Next song" title="Next song"
                fill={headerFill} disabled={!hasNext}
                onActivate={() => requestNav(setlistIdx + 1)}
              >
                {!isNarrow && <PillLabel>Next</PillLabel>}<TriangleRight size={22} />
              </RoundButton>
            </>
          )}
          {(() => {
            const hasYT = !!youtubeEmbedUrl(metadata.youtubeUrl);
            return (
              <RoundButton
                size={ROUND_SIZE_ACTION}
                label={hasYT ? 'Play YouTube' : 'No YouTube URL saved'}
                title={hasYT ? 'Play YouTube' : 'No YouTube URL saved'}
                fill={headerFill} disabled={!hasYT}
                onActivate={() => openPlayer(metadata.youtubeUrl, metadata.title)}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
              </RoundButton>
            );
          })()}
          {onReturn ? (
            // Reached only by Edit-from-Present, so the context is known: circle,
            // icon-only, tooltip carries the meaning.
            <RoundButton
              size={ROUND_SIZE_ACTION}
              label="Return to Performance" title="Return to Performance"
              fill={headerFill}
              onActivate={() => onReturn({ id: songId, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: chordDiagramSize, chordPrefs, displayKey })}
            >
              <Undo2 size={22} strokeWidth={2} />
            </RoundButton>
          ) : (
            <RoundButton
              size={ROUND_SIZE_ACTION} pill
              label="Present" title="Present"
              fill={headerFill}
              onActivate={() => onPresent?.([{ id: songId, metadata, text, chordStyle: previewFormat, displayKey }], 0)}
            >
              <Tv size={22} strokeWidth={2} /><PillLabel>Present</PillLabel>
            </RoundButton>
          )}

          {/* Exit — indigo anchor. isDirty guard verbatim. */}
          <RoundButton
            size={ROUND_SIZE_ACTION}
            label="Back to Library" title="Back to Library"
            fill={ROUND_FILL_ACTIVE}
            onActivate={() => isDirty ? setShowBackConfirm(true) : onBack()}
          >
            <X size={24} strokeWidth={2.5} />
          </RoundButton>
        </div>
      </header>

      {/* Metadata form */}
      <MetadataForm
        metadata={metadata}
        onChange={m => { setMetadata(m); setIsDirty(true); }}
      />

      {/* Toolbar */}
      <div className={`px-4 py-2 border-b ${border} ${dark ? 'bg-gray-950' : 'bg-gray-50'} flex flex-wrap items-center gap-3 shrink-0`}>

        {/* View Key — a saved, display-only lens. Sets the song's displayKey so
            Preview/Present render transposed; never rewrites the source text or
            the real key (metadata.key). Persists on Save with the song. */}
        <div className="flex items-center gap-2">
          <span className={`text-xs ${mutedText}`}>View Key:</span>
          <select
            value={displayKey}
            onChange={e => { setDisplayKey(e.target.value); setIsDirty(true); }}
            // Height matches the neighbouring buttons (h-9); other styling is the
            // select's own (not the button size).
            className={`h-9 px-2 text-sm rounded border focus:border-indigo-500 outline-none cursor-pointer ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="">{metadata.key || '—'}</option>
            {KEY_NAMES.filter(n => n !== metadata.key).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* Find */}
        <button
          onClick={showFR ? closeFR : openFR}
          className={`flex items-center gap-1 ${toolCtl} ${
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
          className={`flex items-center gap-1 ${toolCtl} ${
            isDirty
              ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500'
              : dark ? 'border-gray-700 text-gray-600 cursor-not-allowed' : 'border-gray-300 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Save size={11} /> Save
        </button>

        {/* Revert — discard changes since the last save (or since opening, before
            the first save). Enabled only when dirty, symmetric with Save. */}
        <button
          onClick={() => setShowRevertConfirm(true)}
          disabled={!isDirty}
          title="Discard changes since last save"
          className={`flex items-center gap-1 ${toolCtl} ${
            isDirty
              ? dark ? 'border-gray-700 text-gray-300 hover:text-white' : 'border-gray-300 text-gray-600 hover:text-gray-900'
              : dark ? 'border-gray-700 text-gray-600 cursor-not-allowed' : 'border-gray-300 text-gray-400 cursor-not-allowed'
          }`}
        >
          <RotateCcw size={11} /> Revert
        </button>

        {/* Annotation controls — only shown when the song has Present-mode annotations */}
        {hasAnnotation && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAnnotations(v => !v)}
              title={showAnnotations ? 'Hide annotation overlay' : 'Show ink annotations from Present mode'}
              className={`flex items-center gap-1 h-9 px-3 text-xs rounded-lg font-medium border transition-colors ${
                showAnnotations
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : dark ? 'border-gray-700 text-gray-400 hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'
              }`}
            >
              <Pencil size={11} />
              {showAnnotations ? 'Ink' : 'Ink'}
            </button>
            {clearAnnotConfirm ? (
              <>
                <span className={`text-xs ${mutedText}`}>Clear ink?</span>
                <button onClick={handleClearAnnotations} className="h-9 px-2 text-xs bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">Yes</button>
                <button onClick={() => setClearAnnotConfirm(false)} className={`h-9 px-2 text-xs rounded-lg transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>No</button>
              </>
            ) : (
              <button
                onClick={() => setClearAnnotConfirm(true)}
                title="Delete all annotations for this song"
                className={`h-9 px-2 text-xs rounded-lg border transition-colors ${dark ? 'border-gray-700 text-gray-400 hover:text-red-400' : 'border-gray-300 text-gray-500 hover:text-red-500'}`}
              >Clear ink</button>
            )}
          </div>
        )}

        {/* Format toggles: [Editor Format] → [Preview Format] */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleEditorFormat}
            className={`h-9 px-3 text-xs rounded-lg font-medium border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900'}`}
            title="Editor text format — click to convert"
          >
            {displayMode === 'over' ? 'Over Lyrics' : 'Brackets'}
          </button>
          <span className={`text-xs px-0.5 ${mutedText}`}>→</span>
          <button
            onClick={togglePreviewFormat}
            className={`h-9 px-3 text-xs rounded-lg font-medium border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900'}`}
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
                className={`h-9 px-3 text-xs rounded-md font-medium transition-colors ${
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
              className={`h-9 px-3 text-xs rounded-lg font-medium border transition-colors ${
                showPreview
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : dark ? 'border-gray-700 text-gray-400 hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'
              }`}
              title="Toggle preview panel"
            >
              {showPreview ? 'Preview On' : 'Preview Off'}
            </button>
            <button
              onClick={() => setShowChordPanel(v => !v)}
              className={`h-9 px-3 text-xs rounded-lg font-medium border transition-colors ${
                showChordPanel
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : dark ? 'border-gray-700 text-gray-400 hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'
              }`}
              title="Toggle chord diagram panel"
            >
              {showChordPanel ? 'Chords On' : 'Chords Off'}
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
              <CharRuler textareaRef={textareaRef} text={text} target={LYRIC_TARGET_CHARS} dark={dark} />
              {textarea}
            </div>

            {narrowTab === 'preview' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <SongPreview
                  text={text}
                  metadata={metadata}
                  displayMode={previewFormat}
                  displayKey={effectiveDisplayKey}
                  showMeta={false}
                  overlay={showAnnotations && hasAnnotation && songId ? (
                    <AnnotationCanvas
                      key={`editor-annot-narrow-${songId}`}
                      songId={songId}
                      annotating={false}
                      dark={dark}
                      readOnly
                      onHasStrokes={has => setHasAnnotation(has)}
                    />
                  ) : null}
                />
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
              <CharRuler textareaRef={textareaRef} text={text} target={LYRIC_TARGET_CHARS} dark={dark} />
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
                <SongPreview
                  text={text}
                  metadata={metadata}
                  displayMode={previewFormat}
                  displayKey={effectiveDisplayKey}
                  showMeta={false}
                  overlay={showAnnotations && hasAnnotation && songId ? (
                    // Canvas is mounted inside SongPreview's scrollable content wrapper
                    // so its origin is below the "PREVIEW" header bar and it scrolls
                    // with the lyrics — much closer to PresentationView's coordinate origin.
                    <AnnotationCanvas
                      key={`editor-annot-${songId}`}
                      songId={songId}
                      annotating={false}
                      dark={dark}
                      readOnly
                      onHasStrokes={has => setHasAnnotation(has)}
                    />
                  ) : null}
                />
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
        {revertConfirm}
      </div>

    </div>
  );
}
