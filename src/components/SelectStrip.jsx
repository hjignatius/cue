import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { GLASS } from './RoundButton.jsx';
import { cutRange, growDown, growUp, selectLine, selectSection } from '../utils/textSelect.js';

// Selecting, copying and pasting in the Text pane without Apple's drag handles,
// on a touch screen (useTouchDevice). A chart is short lines close together,
// where the handles are hard to place, and on an iPad with a mouse the system's
// menu can lose the selection altogether. So: tap in a chorus, Section, Copy,
// tap where it goes, Paste.
//
//   Line  Section  All   select at the caret
//   ▲ ▼                  take in one more line that way
//   Copy  Cut  Paste     without the system's menu
//
// Selecting needs the text box focused or it doesn't show, so the first tap can
// bring up the keyboard. Paste asks the system for the clipboard, and iOS shows
// its own small Paste bubble to confirm: that one can't be avoided.
//
// Changes go through execCommand rather than setting the text, so that Undo
// still works; onChange then sees them as typing.

const Sep = () => <span className="w-px h-5 bg-gray-300 dark:bg-gray-700 shrink-0" />;

// Bring a selection's moving edge into the part of the box that can be seen,
// which on a phone stops at the keyboard and the floating controls.
function reveal(ta, pos, covered) {
  const css = getComputedStyle(ta);
  const lh = parseFloat(css.lineHeight) || 22;
  const y = parseFloat(css.paddingTop) + (ta.value.slice(0, pos).split('\n').length - 1) * lh;
  const box = ta.getBoundingClientRect();
  const vv = window.visualViewport;
  const bottom = vv ? Math.min(box.bottom, vv.offsetTop + vv.height) : box.bottom;
  const shown = Math.max(lh, bottom - box.top - covered);
  if (y < ta.scrollTop) ta.scrollTop = y;
  else if (y + lh > ta.scrollTop + shown) ta.scrollTop = y + lh - shown;
}

function replaceSelection(ta, words) {
  ta.focus();
  const done = words ? document.execCommand('insertText', false, words) : document.execCommand('delete');
  if (done) return;
  ta.setRangeText(words, ta.selectionStart, ta.selectionEnd, 'end');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

async function copyWords(words) {
  try {
    await navigator.clipboard.writeText(words);
    return true;
  } catch {
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

export default function SelectStrip({ textareaRef, dark, floating = false, covered = 0, onPaste }) {
  const [hasSelection, setHasSelection] = useState(false);
  const [said, setSaid] = useState(null);     // { key, word }, shown briefly on the button
  const saidTimer = useRef(null);

  useEffect(() => {
    const ta = textareaRef.current;
    const on = () => setHasSelection(!!ta && ta.selectionStart !== ta.selectionEnd);
    on();
    document.addEventListener('selectionchange', on);
    ta?.addEventListener('select', on);
    return () => {
      document.removeEventListener('selectionchange', on);
      ta?.removeEventListener('select', on);
    };
  }, [textareaRef]);
  useEffect(() => () => clearTimeout(saidTimer.current), []);

  const say = useCallback((key, word) => {
    setSaid({ key, word });
    clearTimeout(saidTimer.current);
    saidTimer.current = setTimeout(() => setSaid(null), 1200);
  }, []);

  const select = (pick, edge) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const [start, end] = pick(ta.value, ta.selectionStart, ta.selectionEnd);
    ta.focus();
    ta.setSelectionRange(start, end);
    reveal(ta, edge === 'end' ? end : start, covered);
    setHasSelection(start !== end);
  };

  const copy = async () => {
    const ta = textareaRef.current;
    if (!ta) return false;
    const done = await copyWords(ta.value.slice(ta.selectionStart, ta.selectionEnd));
    say('copy', done ? 'Copied' : 'Can’t copy');
    return done;
  };

  const cut = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const [start, end] = [ta.selectionStart, ta.selectionEnd];
    if (!await copyWords(ta.value.slice(start, end))) { say('cut', 'Can’t cut'); return; }
    ta.focus();
    ta.setSelectionRange(...cutRange(ta.value, start, end));
    replaceSelection(ta, '');
    say('cut', 'Cut');
  };

  const paste = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    let words;
    try { words = await navigator.clipboard.readText(); }
    catch { say('paste', 'Can’t paste'); return; }   // refused, or the bubble dismissed
    if (!words) return;
    onPaste?.();
    replaceSelection(ta, words);
  };

  const glass = GLASS(dark);
  // Tighter on a phone, where all eight have to fit across the screen.
  const button = `h-11 ${floating ? 'px-1.5' : 'px-2.5'} flex items-center justify-center shrink-0 rounded-lg text-sm font-medium whitespace-nowrap select-none disabled:opacity-30 transition-colors ${
    dark ? 'text-gray-200 active:bg-gray-700' : 'text-gray-700 active:bg-gray-200'}`;
  const word = (key, plain) => (said?.key === key ? said.word : plain);

  const row = (
    <>
      <button type="button" className={button} onClick={() => select((t, s) => selectLine(t, s))}>Line</button>
      <button type="button" className={button} onClick={() => select((t, s) => selectSection(t, s))}>Section</button>
      <button type="button" className={button} onClick={() => select(t => [0, t.length])}>All</button>
      <Sep />
      <button type="button" className={button} aria-label="Select one more line up" onClick={() => select(growUp)}><ChevronUp size={20} /></button>
      <button type="button" className={button} aria-label="Select one more line down" onClick={() => select(growDown, 'end')}><ChevronDown size={20} /></button>
      <Sep />
      {/* Room for "Copied", so Cut and Paste don't move out from under a finger. */}
      <button type="button" className={`${button} ${floating ? 'min-w-[3.5rem]' : 'min-w-[4.25rem]'}`} disabled={!hasSelection} onClick={copy}>{word('copy', 'Copy')}</button>
      <button type="button" className={`${button} min-w-[2.75rem]`} disabled={!hasSelection} onClick={cut}>{word('cut', 'Cut')}</button>
      <button type="button" className={button} onClick={paste}>{word('paste', 'Paste')}</button>
    </>
  );

  // preventDefault keeps the selection and the keyboard while a button is tapped.
  if (floating) {
    return (
      <div role="toolbar" aria-label="Select text" onMouseDown={e => e.preventDefault()}
        className="flex items-center max-w-full overflow-x-auto px-1 rounded-2xl border shadow-lg backdrop-blur-md"
        style={{ background: glass.fill, borderColor: glass.border }}>
        {row}
      </div>
    );
  }
  return (
    <div role="toolbar" aria-label="Select text" onMouseDown={e => e.preventDefault()}
      className={`flex items-center gap-0.5 px-2 border-b shrink-0 overflow-x-auto ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
      <span className={`text-xs font-semibold uppercase tracking-wide mr-1 shrink-0 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Select</span>
      {row}
    </div>
  );
}
