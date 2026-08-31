import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Save, Search, X, Pencil, RotateCcw, Tv, Undo2, Bold, Italic, Eraser, MoreHorizontal, ExternalLink, Sparkles, Globe, Wand2, ListPlus, Loader2, ArrowLeftRight, MessageCircleQuestion, Guitar } from 'lucide-react';
import { useYouTube } from '../context/YouTubeContext.jsx';
import { youtubeEmbedUrl } from '../utils/youtubeEmbed.js';
import MetadataForm from '../components/MetadataForm.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import SongPreview from '../components/SongPreview.jsx';
import SongChordPanel from '../components/SongChordPanel.jsx';
import ResizeHandle from '../components/ResizeHandle.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { useCompactChrome, usePhoneLandscape } from '../hooks/useCompactChrome.js';
import RoundButton, { ROUND_FILL_NIGHT, ROUND_FILL_DAY_CHROME, ROUND_FILL_ACTIVE, ROUND_SIZE_ACTION, ROUND_SIZE_COMPACT, TriangleLeft, TriangleRight } from '../components/RoundButton.jsx';
import { saveSong, saveDraft } from '../utils/storage.js';
import { loadAnnotation, deleteAnnotation } from '../utils/annotations.js';
import AnnotationCanvas from '../components/AnnotationCanvas.jsx';
import { KEY_NAMES, semitonesBetween, useFlatsForKey, transposeText, transposeChord } from '../utils/transpose.js';
import { detectChordStyle, convertToOver, convertToBrackets } from '../utils/chordStyle.js';
import { hasApiKey, findMusicOnline, cleanUpChart, fillSongDetails, askMusic, transposeAdvice, chordShapesFor } from '../lib/ai.js';
import ChordDiagram from '../components/ChordDiagram.jsx';
import { detectChords, normalizeChordName } from '../utils/chordDetect.js';
import { getActiveChords, getActiveTuning } from '../data/chordLibraries.js';
import { loadCustomChords, saveCustomChords } from '../utils/chordStorage.js';
import { isChordLine } from '../utils/visualImport.js';
import { usePrefs } from '../context/PrefsContext.jsx';
import { useResizePanel } from '../hooks/useResizePanel.js';
import { useIsNarrow } from '../hooks/useIsNarrow.js';

const DEFAULT_METADATA = { title: '', artist: '', key: '', tempo: '', duration: '', timeSig: '4/4' };

// The chord-library pref id ('ukulele_gcea' | 'baritone_dgbe' | 'guitar' | 'none')
// → a plain instrument word for the AI, so "find music online" can favour the
// user's instrument. 'none' falls back to guitar (the most common chord source).
function chordLibraryToInstrument(id) {
  if (id === 'ukulele_gcea') return 'ukulele';
  if (id === 'baritone_dgbe') return 'baritone ukulele';
  return 'guitar';
}

// Lyric-styling palette. Each color is a single hex that must read on BOTH the
// light Preview and the dark Present background, so these are mid-tone (~-600);
// yellow is deepened to stay legible on white. Matches the {c=#hex} markup.
const STYLE_COLORS = [
  { name: 'Red',    hex: '#dc2626' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Yellow', hex: '#ca8a04' },
  { name: 'Green',  hex: '#16a34a' },
  { name: 'Blue',   hex: '#2563eb' },
  { name: 'Purple', hex: '#9333ea' },
];

// Styling ops for the toolbar. Each toggles by checking the selection's own
// delimiters and returns { styled, ds, de }: the replacement text, plus the
// characters added(+)/removed(-) at the selection's START (ds) and END (de).
// ds/de let over-mode keep the chord line above aligned. Good enough for the
// common single-style case; combined styles may need a second tap.
const COLOR_SPAN = /^\{c=([^}]+)\}([\s\S]*)\{\/c\}$/;
// Each op returns { styled, edits }: the replacement for the selection, plus the
// chord-line edits to mirror — [relCol, delta] pairs where relCol is measured
// from the selection start and delta is spaces to insert(+)/remove(-). Applying
// the SAME shifts to the chord line above keeps chords over their words in the
// raw over-lyrics text (apply and clear are exact inverses).
function opBold(sel) {
  if (sel.startsWith('**') && sel.endsWith('**') && sel.length >= 4)
    return { styled: sel.slice(2, -2), edits: [[0, -2], [sel.length - 2, -2]] };
  return { styled: `**${sel}**`, edits: [[0, 2], [sel.length, 2]] };
}
function opItalic(sel) {
  if (sel.startsWith('*') && sel.endsWith('*') && !sel.startsWith('**') && !sel.endsWith('**') && sel.length >= 2)
    return { styled: sel.slice(1, -1), edits: [[0, -1], [sel.length - 1, -1]] };
  return { styled: `*${sel}*`, edits: [[0, 1], [sel.length, 1]] };
}
function opColor(sel, hex) {
  const m = COLOR_SPAN.exec(sel);
  if (m) {
    const oldPre = m[0].length - m[2].length - 4; // length of `{c=OLD}`
    if (m[1].trim() === hex) return { styled: m[2], edits: [[0, -oldPre], [sel.length - 4, -4]] }; // same → clear
    const newPre = `{c=${hex}}`.length;
    return { styled: `{c=${hex}}${m[2]}{/c}`, edits: newPre === oldPre ? [] : [[0, newPre - oldPre]] }; // recolor
  }
  return { styled: `{c=${hex}}${sel}{/c}`, edits: [[0, `{c=${hex}}`.length], [sel.length, 4]] };
}
function opClear(sel) {
  const m = COLOR_SPAN.exec(sel);
  if (!m) return { styled: sel, edits: [] };
  const oldPre = m[0].length - m[2].length - 4;
  return { styled: m[2], edits: [[0, -oldPre], [sel.length - 4, -4]] };
}

// Insert(+)/remove(-) `delta` space columns at `col`. Removal only eats spaces,
// never chord characters.
function editChordCol(s, col, delta) {
  if (delta > 0) {
    const p = s.length < col ? s.padEnd(col, ' ') : s;
    return p.slice(0, col) + ' '.repeat(delta) + p.slice(col);
  }
  if (delta < 0) {
    let n = -delta, out = '';
    for (let i = 0; i < s.length; i++) {
      if (i >= col && n > 0 && s[i] === ' ') { n--; continue; }
      out += s[i];
    }
    return out;
  }
  return s;
}
// Apply the chord-line edits (in original columns, offset by the selection start
// `a`) right-to-left so earlier columns stay valid as later ones shift.
function repadChordLine(chordLine, a, edits) {
  let s = chordLine;
  for (const [relCol, delta] of [...edits].sort((x, y) => y[0] - x[0])) {
    s = editChordCol(s, a + relCol, delta);
  }
  return s.replace(/[ \t]+$/, '');
}

// Apply a styling op to the source range [start,end], LINE BY LINE, on `text`.
// The parser is per-line, so markup must be balanced within each line — wrapping a
// whole multi-line block as one span would leave `{c=}` open on the first line and
// `{/c}` orphaned on the last, so each touched line's selected portion is styled
// independently. In Over-Lyrics mode (`over`), chord lines are skipped and each
// styled line's chord line above is re-padded by the same column shifts so chords
// stay over their words. Returns { text, selA, selB } (the rebuilt text and the
// new source range covering the styled span), or null if nothing changed.
function styleRange(text, op, hex, start, end, over) {
  const lines = text.split('\n');
  const lineStart = [];
  { let idx = 0; for (const ln of lines) { lineStart.push(idx); idx += ln.length + 1; } }

  let firstLine = -1, firstA = 0, lastLine = -1, lastEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const ls = lineStart[i], le = ls + lines[i].length;
    if (le <= start || ls >= end) continue;                 // line outside selection
    const a = Math.max(start, ls) - ls;
    const b = Math.min(end, le) - ls;
    if (b <= a) continue;                                    // nothing on this line
    if (over && isChordLine(lines[i])) continue;             // never style a chord line
    const seg = lines[i].slice(a, b);
    if (op !== 'clear' && !seg.trim()) continue;             // skip whitespace-only bits
    const { styled, edits } = op === 'bold'   ? opBold(seg)
                            : op === 'italic' ? opItalic(seg)
                            : op === 'color'  ? opColor(seg, hex)
                            : op === 'clear'  ? opClear(seg)
                            :                    { styled: seg, edits: [] };
    lines[i] = lines[i].slice(0, a) + styled + lines[i].slice(b);
    if (over && edits.length && i > 0 && isChordLine(lines[i - 1])) {
      lines[i - 1] = repadChordLine(lines[i - 1], a, edits);
    }
    if (firstLine === -1) { firstLine = i; firstA = a; }
    lastLine = i; lastEnd = a + styled.length;
  }
  if (firstLine === -1) return null;                         // nothing was styled

  const out = lines.join('\n');
  const newStart = []; { let idx = 0; for (const ln of lines) { newStart.push(idx); idx += ln.length + 1; } }
  return { text: out, selA: newStart[firstLine] + firstA, selB: newStart[lastLine] + lastEnd };
}

// Visible label inside a pill button (white via RoundButton's text-white).
function PillLabel({ children }) {
  return <span className="text-sm font-medium leading-none whitespace-nowrap">{children}</span>;
}

// Anchored popover for the compact toolbar's overflow actions. Hand-built (no
// menu library): focus enters on open, Up/Down cycle the items, Escape and an
// outside press close it, and the caller returns focus to the trigger. Items are
// whatever the caller renders with role="menuitem", so conditional entries never
// leave a gap — the arrow keys just walk what is actually present.
function OverflowMenu({ open, onClose, children, dark }) {
  const menuRef = useRef(null);
  // { above, maxH } — resolved from the anchor's position before first paint.
  const [pos, setPos] = useState(null);

  // Placement. iPhone landscape puts the toolbar past the vertical midpoint, so
  // a menu that always drops downward runs off the bottom; when there is more
  // room above the trigger than below, it opens upward instead. Either way the
  // height is clamped to the room on the chosen side so a long menu scrolls
  // rather than escaping the viewport.
  //
  // Measured against visualViewport, not innerHeight, so the on-screen keyboard
  // (which shrinks the visual viewport without changing innerHeight) re-runs
  // this and re-clamps.
  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    const anchor = el?.parentElement;
    if (!el || !anchor) return;

    const GAP = 4;     // matches the mt-1 / mb-1 offset
    const MARGIN = 8;  // never flush against the viewport edge

    const measure = () => {
      const vv = window.visualViewport;
      const vTop = vv?.offsetTop ?? 0;
      const vH = vv?.height ?? window.innerHeight;
      const a = anchor.getBoundingClientRect();
      const below = vTop + vH - a.bottom - GAP - MARGIN;
      const above = a.top - vTop - GAP - MARGIN;
      const wanted = el.scrollHeight;
      const flip = below < wanted && above > below;
      setPos({ above: flip, maxH: Math.max(96, Math.round(flip ? above : below)) });
    };

    measure();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      // The trigger has its own toggle; ignore presses that land on it so a tap
      // there closes rather than immediately reopening.
      if (menuRef.current?.parentElement?.contains(e.target)) return;
      onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [])];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? (i + 1) % items.length
        : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      className={`absolute right-0 ${pos?.above ? 'bottom-full mb-1' : 'top-full mt-1'} z-40 min-w-[14rem] rounded-xl border shadow-xl overflow-y-auto ${
        dark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      }`}
      style={{
        // Never render under the notch/home indicator or the rounded corner.
        marginRight: 'env(safe-area-inset-right)',
        // env() is folded in here rather than in the JS measurement because the
        // insets are only knowable to CSS.
        maxHeight: pos
          ? `calc(${pos.maxH}px - env(safe-area-inset-${pos.above ? 'top' : 'bottom'}))`
          : undefined,
      }}
    >
      {children}
    </div>
  );
}

// Ordered, de-duplicated symbols from the stored palette string — one entry per
// code point (for..of iterates code points, so surrogate-pair glyphs stay whole)
// with whitespace dropped, so the user can space their symbols out for legibility
// in the edit field without those spaces becoming grid cells.
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

// Insert-a-character palette anchored under the Text toolbar's Ω button. The grid
// is derived from `symbols` (click a glyph to insert at the cursor); the field
// below is the palette itself — type or paste to curate, delete to remove. Stays
// open after an insert so a run of arrows can be entered in one go; Escape or an
// outside press closes it.
function SymbolMenu({ open, onClose, symbols, onInsert, onChange, dark }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      // Ignore the trigger (its own onClick toggles) so a tap there closes.
      if (ref.current?.parentElement?.contains(e.target)) return;
      onClose();
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const list = parseSymbols(symbols);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Insert symbol"
      className={`absolute right-0 top-full mt-1 z-40 w-64 rounded-xl border shadow-xl p-2 ${
        dark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      }`}
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
              className={`h-8 flex items-center justify-center rounded text-lg leading-none ${
                dark ? 'hover:bg-gray-800 text-gray-100' : 'hover:bg-gray-100 text-gray-900'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      ) : (
        <p className={`px-1 py-2 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
          No symbols yet — add some below.
        </p>
      )}
      <div className={`mt-2 pt-2 border-t ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
        <label className={`block text-[11px] mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Your symbols — type or paste, then click one above
        </label>
        {/* stopPropagation on mousedown so the styleBar's selection-preserving
            preventDefault doesn't block this field from taking focus. */}
        <input
          value={symbols}
          onChange={e => onChange(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          spellCheck={false}
          placeholder="↑ ↓ ← → …"
          className={`w-full px-2 py-1.5 text-lg rounded border outline-none focus:border-indigo-500 ${
            dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
          }`}
        />
      </div>
    </div>
  );
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


export default function EditorView({ song, onBack, onSaved, onPresent, onReturn, setlistSongs, setlistIdx, onSetlistNavigate, annotationStamp = 0, editorApi }) {
  const { theme, chordColor, chordDiagramSize, accidentals, symbols, instrument, aiLevel, updatePref } = usePrefs();
  // 'none' turns chord diagrams off entirely: no panel, no toggle, no Chords tab.
  const chordsAvailable = instrument !== 'none';
  const dark = theme === 'dark';
  const isNarrow = useIsNarrow();

  const [text, setText]         = useState(song?.text || '');
  const [metadata, setMetadata] = useState({ ...DEFAULT_METADATA, ...(song?.metadata || {}) });
  const [songId, setSongId]     = useState(song?.id || null);
  // Per-song foot-pedal behavior (top-level song field, not metadata). A new
  // song seeds from the prior global preference; type rides through unchanged so
  // editing a pdf song keeps it a pdf.
  const songType = song?.type || 'text';
  // Per-song Full Page mode (top-level song field, not metadata). Off by default:
  // continuous scroll. On: discrete full pages. Applies to text and pdf alike.
  const [fullPage, setFullPage] = useState(song?.fullPage === true);

  const [displayMode, setDisplayMode] = useState(() => {
    if (song?.chordStyle) return song.chordStyle;
    return detectChordStyle(song?.text || '') || 'over';
  });

  // previewFormat: how the preview/Present renders. Kept equal to displayMode now
  // (one Format control drives both); seeded the same way for older songs.
  const [previewFormat, setPreviewFormat] = useState(() =>
    song?.previewMode || (song?.chordStyle ?? (detectChordStyle(song?.text || '') || 'over'))
  );

  const [chordPrefs, setChordPrefs]         = useState(song?.chordPrefs ?? {});
  const [showPreview, setShowPreview]       = useState(true);
  const [showChordPanel, setShowChordPanel] = useState(true);
  // Effective chord-panel visibility: the user toggle AND chords being available.
  const chordsOn = showChordPanel && chordsAvailable;
  const [narrowTab, setNarrowTab]           = useState('editor');
  // Phone portrait (width) or phone landscape (height) — the editor chrome
  // collapses in both. iPad and desktop are unaffected.
  const compactChrome = useCompactChrome();
  const phoneLandscape = usePhoneLandscape();
  // Show one panel at a time (with the full-width selector) ONLY on a portrait
  // phone, where there is no room for more. Everywhere else — phone landscape,
  // iPad (either orientation), desktop — uses the side-by-side layout with the
  // Preview On / Chords On toggles; iPad portrait is tight but the toggles let
  // the user reclaim space by turning panels off.
  const oneAtATime = compactChrome && !phoneLandscape;
  // Format toggle (OL/B) sits inline on the compact toolbar at every phone width
  // now that Find/Save/Revert are icon-only and free up the room — so it's no
  // longer tucked in the overflow menu (which then appears only for annotations).
  const formatsInline = compactChrome;
  // Shared by the in-toolbar (sm) and compact (lg) renderings of the selector.
  const panelOptions = [
    { id: 'text',    label: 'Text' },
    { id: 'preview', label: 'Preview' },
    ...(chordsAvailable ? [{ id: 'chords', label: 'Chords' }] : []),
  ];
  const setPanelFromOption = (id) => setNarrowTab(id === 'text' ? 'editor' : id);
  // If chords get turned off (instrument → none) while the narrow Chords tab is
  // active, fall back to the editor so no blank panel is shown.
  useEffect(() => {
    if (!chordsAvailable && narrowTab === 'chords') setNarrowTab('editor');
  }, [chordsAvailable, narrowTab]);

  // Compact-toolbar overflow menu. The anchor wraps the trigger so focus can be
  // returned to it on close (RoundButton renders its own button).
  const [menuOpen, setMenuOpen] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const menuAnchorRef = useRef(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuAnchorRef.current?.querySelector('button')?.focus();
  }, []);
  // Run a menu action and dismiss, without stealing focus back to the trigger
  // when the action itself moves focus (Find) or opens a dialog (Revert).
  const runFromMenu = (fn) => { setMenuOpen(false); fn(); };
  const runFromAiMenu = (fn) => { setAiMenuOpen(false); fn(); };
  // Text-labelled rows, matching the enclosed/text-first direction of this work.
  const menuItem = `w-full flex items-center gap-2 px-3 py-3 text-sm text-left cursor-pointer outline-none ${
    dark ? 'text-gray-200 hover:bg-gray-800 focus:bg-gray-800' : 'text-gray-800 hover:bg-gray-100 focus:bg-gray-100'
  }`;
  const dangerItem = dark ? 'text-red-400' : 'text-red-600';
  const [displayKey, setDisplayKey]     = useState(song?.displayKey || '');
  const [isDirty, setIsDirty]           = useState(false);
  // AI menu + actions. `aiReady` tracks whether a key is saved (kept fresh via
  // the cue:ai-key event so saving in Settings lights the button up live).
  // `aiBusy` names the in-flight action; `aiMsg` is a transient status line.
  const [aiMenuOpen, setAiMenuOpen]     = useState(false);
  const [aiReady, setAiReady]           = useState(() => hasApiKey());
  const [aiBusy, setAiBusy]             = useState('');   // '' | 'clean' | 'find' | 'fill'
  const [aiMsg, setAiMsg]               = useState('');
  const [findResult, setFindResult]     = useState(null); // null | { loading, error, items }
  const [fillResult, setFillResult]     = useState(null); // null | { loading, error, suggest }
  const [adviceResult, setAdviceResult] = useState(null); // null | { loading, error, data }
  const [chordResult, setChordResult]   = useState(null); // null | { loading, error, shapes:[{name,frets}], missing:[names] }
  const [addedChords, setAddedChords]   = useState([]);   // shapes added this session, shown live in the panel
  const [askOpen, setAskOpen]           = useState(false);
  const [askQuestion, setAskQuestion]   = useState('');
  const [askAnswer, setAskAnswer]       = useState('');
  const [asking, setAsking]             = useState(false);
  const [askError, setAskError]         = useState('');
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const aiAnchorRef                     = useRef(null);
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
  const pastedRef     = useRef(false); // set by onPaste so the next change auto-senses format
  const previewRef    = useRef(null); // wraps SongPreview; scoped [data-src] lookup for Preview styling
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
    fullPage,
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
    const id = await saveSong({ id: songId, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: chordDiagramSize, chordPrefs, displayKey, type: songType, fullPage });
    setSongId(id);
    setIsDirty(false);
    baselineRef.current = snapshotState(); // Revert target becomes the just-saved state
    onSaved?.({ id, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: chordDiagramSize, chordPrefs, displayKey, type: songType, fullPage });
  }

  // Publish { isDirty, save } so App's "Update Cue" button can detect unsaved work
  // and optionally save it before reloading. No deps → always the latest closure;
  // cleared on unmount so it reads falsy anywhere outside the editor.
  useEffect(() => {
    if (!editorApi) return undefined;
    editorApi.current = { isDirty, save: handleSave };
    return () => { editorApi.current = null; };
  });

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
    if (b.fullPage !== undefined) setFullPage(b.fullPage);
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

  // ONE control sets both the editor text format and the preview/Present format
  // (they always match now). Converts the source text to the chosen format.
  function toggleFormat() {
    const newFmt = displayMode === 'over' ? 'brackets' : 'over';
    const cur = detectChordStyle(text);
    if (newFmt === 'over' && cur === 'brackets') setText(convertToOver(text));
    else if (newFmt === 'brackets' && cur === 'over') setText(convertToBrackets(text));
    setDisplayMode(newFmt);
    setPreviewFormat(newFmt);
    setIsDirty(true);
  }

  // Auto-sense the chord format from pasted / first-entered content and set both
  // formats to match. Runs on paste and when content first appears; a later manual
  // toggle wins. No-op until the text has a detectable chord style.
  function senseFormat(nextText) {
    const detected = detectChordStyle(nextText);
    if (!detected) return;
    setDisplayMode(detected);
    setPreviewFormat(detected);
  }

  // Keep the AI button's muted/active state in sync when the key is saved or
  // removed in Settings (same tab → custom event; other tabs → storage event).
  useEffect(() => {
    const refresh = () => setAiReady(hasApiKey());
    window.addEventListener('cue:ai-key', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('cue:ai-key', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  function flashAi(msg, ms = 6000) {
    setAiMsg(msg);
    clearTimeout(flashAi._t);
    flashAi._t = setTimeout(() => setAiMsg(''), ms);
  }

  // Clean up formatting (AI) — reformat the pasted chart in place, then re-sense
  // the format. The model is told never to change chords or lyrics.
  async function runCleanup() {
    if (aiBusy || text.trim() === '') return;
    setAiBusy('clean');
    setAiMsg('Cleaning up…');
    try {
      const cleaned = await cleanUpChart(text);
      if (cleaned && cleaned !== text) {
        setText(cleaned);
        senseFormat(cleaned);
        setIsDirty(true);
        flashAi('Cleaned up — review, then Save.');
      } else {
        flashAi('Already tidy.');
      }
    } catch (e) {
      flashAi(e?.message || 'Clean up failed.');
    } finally {
      setAiBusy('');
    }
  }

  // Find music online (AI + web search) — opens a results dialog. Instrument-aware
  // via the user's chord-library setting.
  async function runFind() {
    if (aiBusy) return;
    setAiBusy('find');
    setFindResult({ loading: true, error: '', items: [] });
    try {
      const items = await findMusicOnline({
        title: metadata.title,
        artist: metadata.artist,
        instrument: chordLibraryToInstrument(instrument),
      });
      setFindResult({ loading: false, error: '', items });
    } catch (e) {
      setFindResult({ loading: false, error: e?.message || 'Search failed.', items: [] });
    } finally {
      setAiBusy('');
    }
  }

  // Fill in song details (AI) — reads the chart, opens a dialog of suggestions
  // the user can apply field-by-field.
  async function runFill() {
    if (aiBusy || text.trim() === '') return;
    setAiBusy('fill');
    setFillResult({ loading: true, error: '', suggest: null });
    try {
      const suggest = await fillSongDetails(text, { title: metadata.title, artist: metadata.artist });
      setFillResult({ loading: false, error: '', suggest });
    } catch (e) {
      setFillResult({ loading: false, error: e?.message || 'Could not read details.', suggest: null });
    } finally {
      setAiBusy('');
    }
  }

  function applyDetail(field, value) {
    setMetadata(m => ({ ...m, [field]: value }));
    setIsDirty(true);
  }

  // Shared song context for the level-aware AI actions.
  function songContext() {
    return {
      title: metadata.title,
      artist: metadata.artist,
      key: metadata.key,
      instrument: chordLibraryToInstrument(instrument),
      level: aiLevel,
      chart: text,
    };
  }

  // Transposing advice (AI) — song/instrument/level-aware key + capo guidance.
  async function runAdvice() {
    if (aiBusy) return;
    setAiBusy('advice');
    setAdviceResult({ loading: true, error: '', data: null });
    try {
      const data = await transposeAdvice(songContext());
      setAdviceResult({ loading: false, error: '', data });
    } catch (e) {
      setAdviceResult({ loading: false, error: e?.message || 'Advice failed.', data: null });
    } finally {
      setAiBusy('');
    }
  }

  // Apply a suggested key via the existing Transpose display lens.
  function applySuggestedKey(k) {
    if (!KEY_NAMES.includes(k)) return;
    setDisplayKey(k === metadata.key ? '' : k);
    setIsDirty(true);
    flashAi(`Transpose set to ${k}.`);
    setAdviceResult(null);
  }

  // Ask about music (AI) — free-form Q&A, seeded with the current song + level.
  async function submitAsk() {
    const q = askQuestion.trim();
    if (asking || !q) return;
    setAsking(true);
    setAskError('');
    setAskAnswer('');
    try {
      // Stream: the answer fills in live as it arrives.
      await askMusic(q, songContext(), (partial) => setAskAnswer(partial));
    } catch (e) {
      setAskError(e?.message || 'Question failed.');
    } finally {
      setAsking(false);
    }
  }

  // Chord names in the song that have no diagram for the current instrument —
  // mirrors how the chord panel resolves names (detect → transpose to the view
  // key), then keeps only those absent from both the built-in and custom sets.
  function missingChordNames() {
    if (instrument === 'none') return [];
    const builtin = new Set(getActiveChords(instrument).map(c => c.name));
    const custom = new Set([...loadCustomChords(instrument), ...addedChords].map(c => c.name));
    const seen = new Set();
    const out = [];
    for (const raw of detectChords(convertToBrackets(text))) {
      const name = normalizeChordName(transposeChord(raw, chordSemitones, chordUseFlats));
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (!builtin.has(name) && !custom.has(name)) out.push(name);
    }
    return out;
  }

  // Add missing chord shapes (AI) — find undefined chords, fetch voicings, and
  // open a review dialog. Nothing is saved until the user approves each.
  async function runChordShapes() {
    if (aiBusy) return;
    const missing = missingChordNames();
    if (missing.length === 0) { flashAi('Every chord already has a diagram.'); return; }
    setAiBusy('chords');
    setChordResult({ loading: true, error: '', shapes: [], missing });
    try {
      const shapes = await chordShapesFor(missing, {
        instrument: chordLibraryToInstrument(instrument),
        tuning: getActiveTuning(instrument),
        level: aiLevel,
      });
      setChordResult({ loading: false, error: '', shapes, missing });
    } catch (e) {
      setChordResult({ loading: false, error: e?.message || 'Could not fetch chord shapes.', shapes: [], missing });
    } finally {
      setAiBusy('');
    }
  }

  // Add one reviewed shape to the instrument's custom library (persisted) and to
  // the live panel; drop it from the review list.
  function addChordShape(shape) {
    const entry = { name: shape.name, type: 'custom', frets: shape.frets };
    const existing = loadCustomChords(instrument);
    if (!existing.some(c => c.name === entry.name && (c.frets || []).join(',') === entry.frets.join(','))) {
      saveCustomChords(instrument, [...existing, entry]);
    }
    setAddedChords(prev => prev.some(c => c.name === entry.name && c.frets.join(',') === entry.frets.join(',')) ? prev : [...prev, entry]);
    setChordResult(r => r ? { ...r, shapes: r.shapes.filter(s => s !== shape) } : r);
  }

  // Bake the current Transpose into the source: rewrite the chords to the
  // Transpose (view) key, make that the song's real key, and clear the lens.
  // Destructive to the source text — recoverable via Revert until Save.
  function transposeSource() {
    const semis = semitonesBetween(metadata.key, displayKey);
    if (!displayKey || semis === 0) return;
    const bracketed = convertToBrackets(text);
    const transposed = transposeText(bracketed, semis, chordUseFlats);
    setText(displayMode === 'over' ? convertToOver(transposed) : transposed);
    setMetadata(m => ({ ...m, key: displayKey }));
    setDisplayKey('');
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

  // Insert a string at the Text pane's cursor, replacing any selection, and place
  // the caret after it. The textarea keeps its selection even while blurred (e.g.
  // when the symbol field had focus), so this is correct whether or not the
  // textarea is focused when a palette glyph is clicked.
  function insertText(str) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? text.length;
    const end   = ta.selectionEnd ?? text.length;
    const next  = text.slice(0, start) + str + text.slice(end);
    setText(next);
    setIsDirty(true);
    const pos = start + str.length;
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos); });
  }

  // Apply a lyric-styling op to the Text pane's current selection, then re-select
  // the styled span. No-op without a selection. (The line-by-line + over-mode
  // repad logic lives in the shared styleRange.)
  function applyStyle(op, hex) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (start === end) { ta.focus(); return; }
    const res = styleRange(text, op, hex, start, end, displayMode === 'over');
    if (!res) { ta.focus(); return; }
    setText(res.text);
    setIsDirty(true);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(res.selA, res.selB); });
  }

  // Apply a styling op to the PREVIEW's current text selection. Each rendered
  // lyric run carries data-src = its absolute offset in the raw text (see
  // parseStyledRuns), and offset-within-a-run == source offset, so the DOM
  // selection maps straight to a source range. Only enabled when the editor
  // format is Brackets: then the raw text IS bracket-format, so SongPreview's
  // convertToBrackets(text) is identity and data-src indexes the raw text.
  // (In Over source the preview is parsed from a converted string, so offsets
  // wouldn't point at the raw text — that's a later phase.) Chords are inline
  // [C] tokens here, so no chord-line repad is needed.
  function applyStyleFromPreview(op, hex) {
    const root = previewRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;

    let lo = Infinity, hi = -Infinity;
    root.querySelectorAll('[data-src]').forEach(span => {
      if (!sel.containsNode(span, true)) return;             // not in the selection
      const base = +span.dataset.src;
      const len = span.textContent.length;
      let s = base, e = base + len;                          // default: whole run
      if (span.contains(range.startContainer)) s = base + range.startOffset;
      if (span.contains(range.endContainer))   e = base + range.endOffset;
      lo = Math.min(lo, s); hi = Math.max(hi, e);
    });
    if (lo === Infinity || hi <= lo) return;

    const res = styleRange(text, op, hex, lo, hi, false);
    if (!res) return;
    setText(res.text);
    setIsDirty(true);
    // The Preview DOM is rebuilt on setText; the browser collapses the old
    // selection. v1 leaves it collapsed — reselect to combine styles.
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
      onChange={e => {
        const next = e.target.value;
        const wasEmpty = text.trim() === '';
        setText(next); setIsDirty(true);
        // Sense the chord format on a paste, or when content first appears.
        if (pastedRef.current || (wasEmpty && next.trim() !== '')) { senseFormat(next); pastedRef.current = false; }
      }}
      onPaste={() => { pastedRef.current = true; }}
      onKeyDown={e => { if (e.key === 'Escape' && showFR) closeFR(); }}
      spellCheck={false}
      wrap="off"
      placeholder="Paste chords-over-lyrics or ChordPro text here…"
      className={`flex-1 resize-none font-mono text-sm p-4 outline-none leading-relaxed whitespace-pre overflow-auto ${dark ? 'bg-gray-950 text-gray-100 placeholder-gray-800' : 'bg-white text-gray-900 placeholder-gray-400'}`}
    />
  );

  // Transpose is locked OFF for a PDF: its chords are entered to match the fixed
  // printed sheet, so the diagrams render at that key (View Key must not move them).
  const chordSemitones = songType === 'pdf' ? 0 : semitonesBetween(metadata.key, effectiveDisplayKey);
  // Accidental spelling for transposed diagram labels — auto follows the Transpose key.
  const chordUseFlats = useFlatsForKey(accidentals, effectiveDisplayKey);

  // Format control label: an empty editor invites a paste ("Sense Chords"); once
  // there is content it names the current (auto-sensed) format.
  const isEmptyText = text.trim() === '';
  const formatName  = displayMode === 'over' ? 'Over Lyrics' : 'Brackets';
  const formatShort = displayMode === 'over' ? 'OL' : 'B';
  // The Transpose lens is active (non-zero) → "Transpose source" can bake it in.
  const transposeActive = !!displayKey && semitonesBetween(metadata.key, displayKey) !== 0;

  // Lyric-styling toolbar, shown in the Text pane header. onMouseDown-preventDefault
  // keeps the textarea's selection alive when a button is clicked.
  const styleBtn = 'w-7 h-7 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0';
  const styleBar = (
    <div className="flex items-center gap-1 ml-auto" onMouseDown={e => e.preventDefault()}>
      <button onClick={() => applyStyle('bold')}   title="Bold (**text**)"   className={styleBtn}><Bold size={15} /></button>
      <button onClick={() => applyStyle('italic')} title="Italic (*text*)"   className={styleBtn}><Italic size={15} /></button>
      {/* Insert-symbol palette (Ω is the conventional special-character glyph) */}
      <span className="relative inline-flex shrink-0">
        <button
          type="button"
          onClick={() => setSymbolOpen(v => !v)}
          title="Insert symbol"
          aria-haspopup="menu"
          aria-expanded={symbolOpen}
          className={`${styleBtn} font-serif text-[15px] leading-none ${symbolOpen ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
        >Ω</button>
        <SymbolMenu
          open={symbolOpen}
          onClose={() => setSymbolOpen(false)}
          symbols={symbols}
          onInsert={insertText}
          onChange={v => updatePref('symbols', v)}
          dark={dark}
        />
      </span>
      <span className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5 shrink-0" />
      {STYLE_COLORS.map(c => (
        <button
          key={c.hex}
          onClick={() => applyStyle('color', c.hex)}
          title={c.name}
          className="w-5 h-5 rounded-full shrink-0 border border-black/10 dark:border-white/20 hover:scale-110 transition-transform"
          style={{ backgroundColor: c.hex }}
        />
      ))}
      <button onClick={() => applyStyle('clear')} title="Clear color" className={styleBtn}><Eraser size={14} /></button>
    </div>
  );

  // The same toolbar, over the Preview: select rendered lyrics and style them.
  // onMouseDown-preventDefault keeps the DOM text selection alive on click. Only
  // rendered when the editor format is Brackets (see applyStyleFromPreview).
  const previewStyleBar = displayMode === 'brackets' ? (
    <div className="flex items-center gap-1" onMouseDown={e => e.preventDefault()}>
      <button onClick={() => applyStyleFromPreview('bold')}   title="Bold"   className={styleBtn}><Bold size={15} /></button>
      <button onClick={() => applyStyleFromPreview('italic')} title="Italic" className={styleBtn}><Italic size={15} /></button>
      <span className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5 shrink-0" />
      {STYLE_COLORS.map(c => (
        <button
          key={c.hex}
          onClick={() => applyStyleFromPreview('color', c.hex)}
          title={c.name}
          className="w-5 h-5 rounded-full shrink-0 border border-black/10 dark:border-white/20 hover:scale-110 transition-transform"
          style={{ backgroundColor: c.hex }}
        />
      ))}
      <button onClick={() => applyStyleFromPreview('clear')} title="Clear color" className={styleBtn}><Eraser size={14} /></button>
    </div>
  ) : null;

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
      extraCustomChords={addedChords}
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

  // Find music online — results dialog (web-search-grounded links).
  const findDialog = findResult && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setFindResult(null)}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Find music online</h2>
            <p className={`text-xs ${mutedText}`}>
              {metadata.title ? <>Sources for <span className="font-medium">{metadata.title}</span>{metadata.artist ? <> · {metadata.artist}</> : null}, favouring {chordLibraryToInstrument(instrument)}.</> : 'Add a title in the metadata bar for better results.'}
            </p>
          </div>
          <button onClick={() => setFindResult(null)} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`} aria-label="Close"><X size={18} /></button>
        </div>
        {findResult.loading && (
          <div className={`flex items-center gap-2 text-sm py-6 justify-center ${mutedText}`}>
            <Loader2 size={16} className="animate-spin" /> Searching the web…
          </div>
        )}
        {!findResult.loading && findResult.error && (
          <p className="text-sm text-red-500">{findResult.error}</p>
        )}
        {!findResult.loading && !findResult.error && findResult.items.length === 0 && (
          <p className={`text-sm ${mutedText}`}>No sources found. Try adding the title and artist, then search again.</p>
        )}
        {!findResult.loading && findResult.items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {findResult.items.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                  className={`flex items-start gap-2 p-3 rounded-xl border transition-colors ${dark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <ExternalLink size={15} className={`mt-0.5 shrink-0 ${mutedText}`} />
                  <span className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{r.name}</span>
                    {r.note && <span className={`text-xs ${mutedText}`}>{r.note}</span>}
                    <span className={`text-[11px] truncate ${dark ? 'text-indigo-400' : 'text-indigo-600'}`}>{r.url}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className={`text-[11px] ${mutedText}`}>Links open in a new tab. Cue doesn't copy the charts — you decide what to use.</p>
      </div>
    </div>
  );

  // Fill in song details — suggestion dialog, applied field by field.
  const fillDialog = fillResult && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setFillResult(null)}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Fill in song details</h2>
          <button onClick={() => setFillResult(null)} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`} aria-label="Close"><X size={18} /></button>
        </div>
        {fillResult.loading && (
          <div className={`flex items-center gap-2 text-sm py-6 justify-center ${mutedText}`}>
            <Loader2 size={16} className="animate-spin" /> Reading the chart…
          </div>
        )}
        {!fillResult.loading && fillResult.error && (
          <p className="text-sm text-red-500">{fillResult.error}</p>
        )}
        {!fillResult.loading && fillResult.suggest && (() => {
          const s = fillResult.suggest;
          const rows = [
            { field: 'title', label: 'Title', value: s.title },
            { field: 'artist', label: 'Artist', value: s.artist },
            { field: 'key', label: 'Key', value: s.key },
            { field: 'tempo', label: 'Tempo (BPM)', value: s.tempo },
            { field: 'duration', label: 'Duration', value: s.duration },
            { field: 'youtubeUrl', label: 'YouTube', value: s.youtubeUrl },
          ].filter(r => r.value);
          if (rows.length === 0) return <p className={`text-sm ${mutedText}`}>Couldn't work out any details for this song. The key is read from the chords; the rest depends on identifying the song.</p>;
          return (<>
            <p className={`text-xs ${mutedText}`}>Suggestions for this song. Apply the ones you want — nothing changes until you do. Tempo, duration and the video are best guesses for the well-known recording, so double-check them.</p>
            <ul className="flex flex-col gap-2">
              {rows.map(r => (
                <li key={r.field} className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className="flex flex-col min-w-0">
                    <span className={`text-[11px] uppercase tracking-wide ${mutedText}`}>{r.label}</span>
                    <span className={`text-sm truncate ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{r.value}</span>
                  </span>
                  <button
                    onClick={() => applyDetail(r.field, r.value)}
                    disabled={metadata[r.field] === r.value}
                    className={`shrink-0 px-3 py-1.5 text-xs rounded-lg border transition-colors ${metadata[r.field] === r.value ? (dark ? 'border-gray-700 text-gray-600' : 'border-gray-200 text-gray-400') : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500'}`}
                  >
                    {metadata[r.field] === r.value ? 'Applied' : 'Apply'}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => rows.forEach(r => applyDetail(r.field, r.value))}
                className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                Apply all
              </button>
              <button
                onClick={() => setFillResult(null)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                Close
              </button>
            </div>
          </>);
        })()}
      </div>
    </div>
  );

  // Transposing advice — key suggestions (one-tap Apply → Transpose) + capo tips.
  const adviceDialog = adviceResult && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAdviceResult(null)}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Transposing advice</h2>
            <p className={`text-xs ${mutedText}`}>For {chordLibraryToInstrument(instrument)} · {aiLevel} level{metadata.key ? <> · currently in {metadata.key}</> : null}</p>
          </div>
          <button onClick={() => setAdviceResult(null)} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`} aria-label="Close"><X size={18} /></button>
        </div>
        {adviceResult.loading && (
          <div className={`flex items-center gap-2 text-sm py-6 justify-center ${mutedText}`}>
            <Loader2 size={16} className="animate-spin" /> Working out your options…
          </div>
        )}
        {!adviceResult.loading && adviceResult.error && (
          <p className="text-sm text-red-500">{adviceResult.error}</p>
        )}
        {!adviceResult.loading && adviceResult.data && (() => {
          const d = adviceResult.data;
          const nothing = !d.summary && d.keys.length === 0 && d.capo.length === 0;
          if (nothing) return <p className={`text-sm ${mutedText}`}>No advice came back — try adding the chords to the chart first.</p>;
          return (<>
            {d.summary && <p className={`text-sm ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{d.summary}</p>}
            {d.keys.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className={`text-[11px] uppercase tracking-wide ${mutedText}`}>Keys to try</span>
                {d.keys.map((k, i) => (
                  <div key={i} className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <span className="flex flex-col min-w-0">
                      <span className={`text-sm font-medium ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{k.key}</span>
                      {k.why && <span className={`text-xs ${mutedText}`}>{k.why}</span>}
                    </span>
                    {KEY_NAMES.includes(k.key) && (
                      <button onClick={() => applySuggestedKey(k.key)} className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 border border-indigo-600 text-white hover:bg-indigo-500 transition-colors">Apply</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {d.capo.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className={`text-[11px] uppercase tracking-wide ${mutedText}`}>Capo</span>
                {d.capo.map((c, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <span className={`text-sm font-medium ${dark ? 'text-gray-100' : 'text-gray-900'}`}>Capo {c.fret}{c.shapes ? <> · play {c.shapes} shapes</> : null}</span>
                    {c.why && <p className={`text-xs mt-0.5 ${mutedText}`}>{c.why}</p>}
                  </div>
                ))}
              </div>
            )}
            <p className={`text-[11px] ${mutedText}`}>Apply sets Cue's Transpose (display only) — it doesn't change your saved text. Capo tips are just advice.</p>
          </>);
        })()}
      </div>
    </div>
  );

  // Ask about music — question box + answer; ask as many as you like.
  const askDialog = askOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAskOpen(false)}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-3 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Ask about music</h2>
            <p className={`text-xs ${mutedText}`}>Answers at {aiLevel} level, aware of this song. Playing, theory, chords, technique.</p>
          </div>
          <button onClick={() => setAskOpen(false)} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`} aria-label="Close"><X size={18} /></button>
        </div>
        <textarea
          value={askQuestion}
          onChange={e => setAskQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAsk(); } }}
          placeholder="e.g. What's an easy strumming pattern for this? How do I play Bm on ukulele?"
          rows={3}
          autoComplete="off" data-1p-ignore data-lpignore="true"
          className={`w-full px-3 py-2.5 text-sm rounded-lg border outline-none focus:border-indigo-500 resize-y ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
        />
        <button
          onClick={submitAsk}
          disabled={asking || !askQuestion.trim()}
          className={`py-2.5 text-sm font-medium rounded-xl transition-colors ${asking || !askQuestion.trim() ? (dark ? 'bg-gray-800 text-gray-600' : 'bg-gray-100 text-gray-400') : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
        >
          {asking ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Thinking…</span> : 'Ask'}
        </button>
        {askError && <p className="text-sm text-red-500">{askError}</p>}
        {askAnswer && !askError && (
          <div className={`text-sm whitespace-pre-wrap rounded-xl border p-3 ${dark ? 'border-gray-700 text-gray-200 bg-gray-800/50' : 'border-gray-200 text-gray-800 bg-gray-50'}`}>{askAnswer}</div>
        )}
      </div>
    </div>
  );

  // Add missing chord shapes — review each proposed voicing as a rendered
  // diagram before it's saved to the custom library.
  const chordDialog = chordResult && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setChordResult(null)}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>Add missing chord shapes</h2>
            <p className={`text-xs ${mutedText}`}>Undefined chords: {chordResult.missing.join(', ')}</p>
          </div>
          <button onClick={() => setChordResult(null)} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`} aria-label="Close"><X size={18} /></button>
        </div>
        {chordResult.loading && (
          <div className={`flex items-center gap-2 text-sm py-6 justify-center ${mutedText}`}>
            <Loader2 size={16} className="animate-spin" /> Working out the shapes…
          </div>
        )}
        {!chordResult.loading && chordResult.error && (
          <p className="text-sm text-red-500">{chordResult.error}</p>
        )}
        {!chordResult.loading && !chordResult.error && chordResult.shapes.length === 0 && (
          <p className={`text-sm ${mutedText}`}>All set — nothing left to add.</p>
        )}
        {!chordResult.loading && chordResult.shapes.length > 0 && (<>
          <p className={`text-xs ${mutedText}`}>Check each shape, then add it to your {chordLibraryToInstrument(instrument)} library. You can edit or delete any custom chord later in the chord panel.</p>
          <ul className="flex flex-col gap-2">
            {chordResult.shapes.map((shape, i) => (
              <li key={i} className={`flex items-center gap-3 p-2 rounded-xl border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="shrink-0"><ChordDiagram chord={shape} scale={1} theme={dark ? 'dark' : 'light'} chordColor={chordColor} /></div>
                <span className="flex-1 min-w-0">
                  <span className={`text-sm font-medium font-mono ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{shape.name}</span>
                  <span className={`block text-xs ${mutedText}`}>{shape.frets.map(f => f === -1 ? '×' : f).join(' · ')}</span>
                </span>
                <button onClick={() => addChordShape(shape)} className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 border border-indigo-600 text-white hover:bg-indigo-500 transition-colors">Add</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={() => { chordResult.shapes.forEach(addChordShape); }}
              className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
            >
              Add all
            </button>
            <button
              onClick={() => setChordResult(null)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              Close
            </button>
          </div>
        </>)}
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
                {/* Red brand mark (editor-header override). Present keeps its
                    white currentColor because it sits over lyrics; here the mark's
                    red aids recognition. RoundButton's opacity still dims it when
                    disabled. #ff0033 reads on both the slate and night fills. */}
                <svg viewBox="0 0 24 24" width="22" height="22" fill="#ff0033" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
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
              onActivate={() => onReturn({ id: songId, metadata, text, chordStyle: displayMode, previewMode: previewFormat, diagramScale: chordDiagramSize, chordPrefs, displayKey, type: songType, fullPage })}
            >
              <Undo2 size={22} strokeWidth={2} />
            </RoundButton>
          ) : (
            <RoundButton
              size={ROUND_SIZE_ACTION} pill={!isNarrow}
              label="Present" title="Present"
              fill={headerFill}
              onActivate={() => onPresent?.([{ id: songId, metadata, text, chordStyle: previewFormat, displayKey, chordPrefs, type: songType, fullPage }], 0)}
            >
              <Tv size={22} strokeWidth={2} />{!isNarrow && <PillLabel>Present</PillLabel>}
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
        fullPage={fullPage}
        onFullPageChange={v => { setFullPage(v); setIsDirty(true); }}
      />

      {/* Toolbar */}
      {/* py-1 in compact chrome: the overflow trigger pads its hit area to the
          44px minimum, which is 8px taller than the h-9 pills it replaces. The
          tighter padding absorbs that so the row is no taller than before. */}
      <div className={`px-4 ${compactChrome ? 'py-1 gap-1' : 'py-2 gap-3'} border-b ${border} ${dark ? 'bg-gray-950' : 'bg-gray-50'} flex items-center shrink-0 ${compactChrome ? 'flex-nowrap' : 'flex-wrap'}`}>

        {/* Compact chrome keeps only Save + the overflow trigger in this row;
            everything else moves into the menu below. */}
        {!compactChrome && (<>
        {/* Transpose — a saved, display-only lens. Sets the song's displayKey so
            Preview/Present render transposed; never rewrites the source text or
            the real key (metadata.key) until "Transpose source". Persists on Save. */}
        <div className="flex items-center gap-2">
          <span className={`text-xs ${mutedText}`}>Transpose:</span>
          <select
            value={displayKey}
            onChange={e => { setDisplayKey(e.target.value); setIsDirty(true); }}
            title="Transpose the displayed chords to another key (a display lens; the source text is unchanged until you use Transpose source)"
            // Height matches the neighbouring buttons (h-9); other styling is the
            // select's own (not the button size).
            className={`h-9 px-2 text-sm rounded border focus:border-indigo-500 outline-none cursor-pointer ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="">{metadata.key || '—'}</option>
            {KEY_NAMES.filter(n => n !== metadata.key).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {/* Transpose source — bake the current transpose into the text and make
              it the song's key. Enabled only when a transpose is active. */}
          <button
            onClick={transposeSource}
            disabled={!transposeActive}
            title="Rewrite the song's chords to the Transpose key and make it the song's key (recoverable via Revert until you Save)"
            className={`flex items-center gap-1 ${toolCtl} ${
              transposeActive
                ? dark ? 'border-gray-700 text-gray-300 hover:text-white' : 'border-gray-300 text-gray-600 hover:text-gray-900'
                : dark ? 'border-gray-700 text-gray-600 cursor-not-allowed' : 'border-gray-300 text-gray-400 cursor-not-allowed'
            }`}
          >
            Transpose source
          </button>
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

        </>)}

        {/* Save — always visible outside compact; the compact cluster below
            renders its own Save in the requested VK · Find · Save · Revert order. */}
        {!compactChrome && (
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
        )}

        {/* Compact chrome line: VK · Find · Save · Revert, plus the OL/B format
            toggles when there is room (landscape). Portrait keeps the toggles in
            the overflow menu. */}
        {compactChrome && (<>
          {/* Transpose — labelled "Tr", showing the current view key. */}
          <label className={`flex items-center gap-1 shrink-0 text-xs ${mutedText}`}>
            <span>Tr</span>
            <select
              value={displayKey}
              onChange={e => { setDisplayKey(e.target.value); setIsDirty(true); }}
              title="Transpose"
              aria-label="Transpose"
              className={`h-9 px-1.5 text-xs rounded-lg border focus:border-indigo-500 outline-none cursor-pointer ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            >
              <option value="">{metadata.key || '—'}</option>
              {KEY_NAMES.filter(n => n !== metadata.key).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            onClick={showFR ? closeFR : openFR}
            className={`flex items-center gap-1 ${toolCtl} ${
              showFR
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : dark ? 'border-gray-700 text-gray-400 hover:text-white' : 'border-gray-300 text-gray-500 hover:text-gray-900'
            }`}
            title={showFR ? 'Close Find' : 'Find & Replace (Cmd+F)'}
          >
            {showFR ? <X size={14} /> : <Search size={14} />}
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            title="Save"
            className={`flex items-center gap-1 ${toolCtl} ${
              isDirty
                ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500'
                : dark ? 'border-gray-700 text-gray-600 cursor-not-allowed' : 'border-gray-300 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Save size={14} />
          </button>
          <button
            onClick={() => setShowRevertConfirm(true)}
            disabled={!isDirty}
            title="Revert — discard changes since last save"
            className={`flex items-center gap-1 ${toolCtl} ${
              isDirty
                ? dark ? 'border-gray-700 text-gray-300 hover:text-white' : 'border-gray-300 text-gray-600 hover:text-gray-900'
                : dark ? 'border-gray-700 text-gray-600 cursor-not-allowed' : 'border-gray-300 text-gray-400 cursor-not-allowed'
            }`}
          >
            <RotateCcw size={14} />
          </button>
          {/* One Format toggle inline (landscape only) — sets editor + preview. */}
          {formatsInline && (
            <button
              onClick={toggleFormat}
              title="Chord format for the text and preview — click to convert. Pasting a song auto-senses this."
              className={`${toolCtl} shrink-0 ${dark ? 'border-gray-700 text-gray-300 hover:text-white' : 'border-gray-300 text-gray-600 hover:text-gray-900'}`}
            >
              {isEmptyText ? 'Sense' : formatShort}
            </button>
          )}
        </>)}

        {!compactChrome && (<>
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

        {/* Format — one control for both editor text and preview/Present. Empty
            editor shows "Sense Chords"; a paste auto-senses and names the format. */}
        <button
          onClick={toggleFormat}
          className={`h-9 px-3 text-xs rounded-lg font-medium border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900'}`}
          title="Chord format for the text and preview — click to convert between Over Lyrics and Brackets. Pasting a song auto-senses this."
        >
          {isEmptyText ? 'Sense Chords' : formatName}
        </button>

        {/* AI menu (text songs only): find music online, clean up formatting,
            fill in song details. Muted until a key is saved in Settings; tapping
            it while muted opens the setup so touch users aren't stranded. */}
        {songType !== 'pdf' && (
          <span ref={aiAnchorRef} className="relative inline-flex shrink-0">
            <button
              onClick={() => { setAiReady(hasApiKey()); setAiMenuOpen(o => !o); }}
              aria-haspopup="menu" aria-expanded={aiMenuOpen}
              title={aiReady ? 'AI — find music, clean up, fill in details' : 'AI — add your Anthropic key in Settings to enable'}
              className={`flex items-center gap-1 ${toolCtl} ${
                aiReady
                  ? dark ? 'border-gray-700 text-gray-200 hover:text-white' : 'border-gray-300 text-gray-700 hover:text-gray-900'
                  : dark ? 'border-gray-800 text-gray-600' : 'border-gray-200 text-gray-400'
              }`}
            >
              {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI
            </button>
            <OverflowMenu open={aiMenuOpen} onClose={() => setAiMenuOpen(false)} dark={dark}>
              {aiReady ? (<>
                <button type="button" role="menuitem" tabIndex={-1} className={menuItem}
                  onClick={() => runFromAiMenu(runFind)}>
                  <Globe size={15} className="opacity-70" /> Find music online
                </button>
                <button type="button" role="menuitem" tabIndex={-1} disabled={isEmptyText}
                  className={`${menuItem} disabled:opacity-40 disabled:cursor-not-allowed`}
                  onClick={() => runFromAiMenu(runCleanup)}>
                  <Wand2 size={15} className="opacity-70" /> Clean up formatting
                </button>
                <button type="button" role="menuitem" tabIndex={-1} disabled={isEmptyText}
                  className={`${menuItem} disabled:opacity-40 disabled:cursor-not-allowed`}
                  onClick={() => runFromAiMenu(runFill)}>
                  <ListPlus size={15} className="opacity-70" /> Fill in song details
                </button>
                {instrument !== 'none' && (
                  <button type="button" role="menuitem" tabIndex={-1} disabled={isEmptyText}
                    className={`${menuItem} disabled:opacity-40 disabled:cursor-not-allowed`}
                    onClick={() => runFromAiMenu(runChordShapes)}>
                    <Guitar size={15} className="opacity-70" /> Add missing chord shapes
                  </button>
                )}
                <button type="button" role="menuitem" tabIndex={-1}
                  className={menuItem}
                  onClick={() => runFromAiMenu(runAdvice)}>
                  <ArrowLeftRight size={15} className="opacity-70" /> Transposing advice
                </button>
                <button type="button" role="menuitem" tabIndex={-1}
                  className={menuItem}
                  onClick={() => runFromAiMenu(() => { setAskError(''); setAskOpen(true); })}>
                  <MessageCircleQuestion size={15} className="opacity-70" /> Ask about music…
                </button>
                <div className={`border-t ${border} my-1`} />
                <button type="button" role="menuitem" tabIndex={-1} className={`${menuItem} ${mutedText}`}
                  onClick={() => runFromAiMenu(() => setAiSettingsOpen(true))}>
                  Set up AI…
                </button>
              </>) : (<>
                <div className={`px-3 pt-3 pb-2 text-xs ${mutedText}`}>Add your Anthropic API key to turn on AI.</div>
                <button type="button" role="menuitem" tabIndex={-1} className={menuItem}
                  onClick={() => runFromAiMenu(() => setAiSettingsOpen(true))}>
                  <Sparkles size={15} className="opacity-70" /> Set up AI…
                </button>
              </>)}
            </OverflowMenu>
          </span>
        )}
        {aiMsg && <span className={`text-xs ${mutedText}`}>{aiMsg}</span>}

        </>)}

        {/* Spacer pushes Preview + Chords to the right */}
        <div className="flex-1" />

        {/* Panel controls: the Preview On / Chords On toggles, shown everywhere
            the side-by-side layout is used. A portrait phone is the only place
            that shows nothing here — it uses the full-width Text/Preview/Chords
            selector row below the toolbar instead. */}
        {!oneAtATime && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Round-button language: state-carrying pills — indigo when on,
                neutral grey when off. */}
            <RoundButton
              size={ROUND_SIZE_COMPACT} pill
              label={showPreview ? 'Preview On' : 'Preview Off'}
              title="Toggle preview panel"
              fill={headerFill} active={showPreview}
              onActivate={() => setShowPreview(v => !v)}
            >
              <span className="text-xs font-medium leading-none whitespace-nowrap">{showPreview ? 'Preview On' : 'Preview Off'}</span>
            </RoundButton>
            {chordsAvailable && (
            <RoundButton
              size={ROUND_SIZE_COMPACT} pill
              label={showChordPanel ? 'Chords On' : 'Chords Off'}
              title="Toggle chord diagram panel"
              fill={headerFill} active={showChordPanel}
              onActivate={() => setShowChordPanel(v => !v)}
            >
              <span className="text-xs font-medium leading-none whitespace-nowrap">{showChordPanel ? 'Chords On' : 'Chords Off'}</span>
            </RoundButton>
            )}
          </div>
        )}

        {/* Overflow menu — compact only, and only when it holds something:
            portrait keeps the format toggles here; the ink controls appear only
            with annotations. In landscape the formats move onto the row, so with
            no annotations there is nothing left and the trigger is omitted. */}
        {compactChrome && (!formatsInline || hasAnnotation) && (
          <span ref={menuAnchorRef} className="relative inline-flex shrink-0">
            <RoundButton
              size={32}
              label="More actions"
              title="More actions"
              fill={headerFill}
              active={menuOpen}
              ariaHasPopup="menu"
              ariaExpanded={menuOpen}
              onActivate={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            >
              <MoreHorizontal size={18} />
            </RoundButton>

            <OverflowMenu open={menuOpen} onClose={closeMenu} dark={dark}>
              {/* One Format item lives here only in portrait; landscape shows it
                  inline on the toolbar row. */}
              {!formatsInline && (
                <button type="button" role="menuitem" tabIndex={-1} className={`${menuItem} justify-between`}
                  onClick={() => runFromMenu(toggleFormat)}>
                  <span>Format</span>
                  <span className={mutedText}>{isEmptyText ? 'Sense Chords' : formatName}</span>
                </button>
              )}

              {/* Transpose source — bake the current transpose into the text. */}
              {transposeActive && (
                <button type="button" role="menuitem" tabIndex={-1} className={menuItem}
                  onClick={() => runFromMenu(transposeSource)}>
                  <span>Transpose source</span>
                </button>
              )}

              {hasAnnotation && (
                <button type="button" role="menuitem" tabIndex={-1} className={menuItem}
                  onClick={() => runFromMenu(() => setShowAnnotations(v => !v))}>
                  <Pencil size={14} className="opacity-60" /> {showAnnotations ? 'Hide ink' : 'Show ink'}
                </button>
              )}

              {/* Separator only when both a group above it and Clear ink exist,
                  so it never orphans. */}
              {hasAnnotation && (
                <>
                  {!formatsInline && <div className={`my-1 border-t ${border}`} role="separator" />}
                  <button type="button" role="menuitem" tabIndex={-1} className={`${menuItem} ${dangerItem}`}
                    onClick={() => runFromMenu(() => {
                      // The inline Yes/No confirm lives in the full toolbar, which
                      // is hidden here, so confirm natively as the app does elsewhere.
                      if (confirm('Delete all ink annotations for this song?')) handleClearAnnotations();
                    })}>
                    <X size={14} className="opacity-60" /> Clear ink
                  </button>
                </>
              )}
            </OverflowMenu>
          </span>
        )}
      </div>

      {/* Portrait phone: the panel selector gets its own full-width row directly
          below the toolbar, at the 44px touch size. Landscape phones drop it —
          they use the Preview/Chords toggles and the side-by-side layout. */}
      {compactChrome && !phoneLandscape && (
        // Centered compact pill, sized to its labels — matching the Library /
        // Sets / Setlist selector rather than stretching the full editor width.
        <div className={`px-4 pb-2 border-b ${border} ${dark ? 'bg-gray-950' : 'bg-gray-50'} shrink-0 flex justify-center`}>
          <SegmentedControl
            ariaLabel="Editor panel"
            options={panelOptions}
            value={narrowTab === 'editor' ? 'text' : narrowTab}
            onChange={setPanelFromOption}
            size="lg"
            fullWidth={false}
            segmentPadX={18}
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {oneAtATime ? (
          /* ── One panel at a time (portrait phone / narrow iPad) ── */
          <>
            {/* Text editor — always mounted (preserves cursor/scroll); hidden via CSS when inactive */}
            <div className={`flex-col min-w-0 min-h-0 flex-1 overflow-hidden ${narrowTab === 'editor' ? 'flex' : 'hidden'}`}>
              <div className={`px-3 py-1.5 border-b ${border} shrink-0 flex items-center gap-2`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Text</span>
                {styleBar}
              </div>
              {frBar}
              <CharRuler textareaRef={textareaRef} text={text} target={LYRIC_TARGET_CHARS} dark={dark} />
              {textarea}
            </div>

            {narrowTab === 'preview' && (
              <div ref={previewRef} className="flex-1 min-h-0 overflow-y-auto p-4">
                <SongPreview
                  text={text}
                  metadata={metadata}
                  displayMode={previewFormat}
                  displayKey={effectiveDisplayKey}
                  showMeta={false}
                  headerRight={previewStyleBar}
                  overlay={showAnnotations && hasAnnotation && songId ? (
                    <AnnotationCanvas
                      key={`editor-annot-narrow-${songId}`}
                      songId={songId}
                      annotating={false}
                      dark={dark}
                      readOnly
                      // Preview lyrics render at a fixed 15px; pass it as the render
                      // font so ink drawn in Present scales by the font ratio
                      // (renderFontPx/captureFontPx) and lines up here, as in Present.
                      fontPx={15}
                      onHasStrokes={has => setHasAnnotation(has)}
                    />
                  ) : null}
                />
              </div>
            )}

            {chordsAvailable && narrowTab === 'chords' && (
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
              <div className={`px-3 py-1.5 border-b ${border} shrink-0 flex items-center gap-2`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Text</span>
                {styleBar}
              </div>
              {frBar}
              <CharRuler textareaRef={textareaRef} text={text} target={LYRIC_TARGET_CHARS} dark={dark} />
              {textarea}
            </div>

            {/* Handle: editor / preview (or editor / chords when preview hidden) */}
            {showPreview
              ? <ResizeHandle handleProps={previewHandleProps} dark={dark} />
              : chordsOn
                ? <ResizeHandle handleProps={chordsHandleProps} dark={dark} />
                : null
            }

            {/* Preview panel */}
            {showPreview && (
              <div ref={previewRef} className="shrink-0 min-h-0 p-4 overflow-y-auto" style={{ width: previewWidth }}>
                <SongPreview
                  text={text}
                  metadata={metadata}
                  displayMode={previewFormat}
                  displayKey={effectiveDisplayKey}
                  showMeta={false}
                  headerRight={previewStyleBar}
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
                      // Preview lyrics render at a fixed 15px; pass it as the render
                      // font so ink drawn in Present scales by the font ratio
                      // (renderFontPx/captureFontPx) and lines up here, as in Present.
                      fontPx={15}
                      onHasStrokes={has => setHasAnnotation(has)}
                    />
                  ) : null}
                />
              </div>
            )}

            {/* Handle: preview / chords */}
            {showPreview && chordsOn && (
              <ResizeHandle handleProps={chordsHandleProps} dark={dark} />
            )}

            {/* Chord reference panel */}
            {chordsOn && (
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
        {findDialog}
        {fillDialog}
        {adviceDialog}
        {askDialog}
        {chordDialog}
      </div>

      {/* AI setup — the same Settings panel, opened in place from the AI menu so
          the key can be entered without leaving the editor. */}
      <SettingsPanel open={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />
    </div>
  );
}
