import { useEffect, useRef, useState } from 'react';
import { Check, Maximize2, Play, Plus } from 'lucide-react';
import { CloseCircle } from './CornerClose.jsx';
import SongPreview from './SongPreview.jsx';
import PdfPageStack from './PdfPageStack.jsx';
import AnnotationCanvas from './AnnotationCanvas.jsx';
import PdfAnnotationCanvas from './PdfAnnotationCanvas.jsx';
import BookChoice, { bookChoice } from './BookChoice.jsx';
import { normalizeTitle } from '../utils/contentHash.js';
import { loadPdfBlob } from '../utils/storage.js';
import { loadPdfjs, pageRotation } from '../utils/pdfjs.js';
import { pageTurn } from '../utils/pageTurns.js';

// Your copies of a shared song (Howard's design, 2026-11-10). It answers WHICH
// copy of yours goes with this shared song; the TV arrow on the row answers
// whether Present plays yours or the shared one, so the shared version is not
// one of the choices here. Two ways in:
//
//   copy    from + (nothing of yours yet): copy the shared song into My Songs
//           or a book, or use a song you already have with its title.
//   choose  from ?, = or ≠: your copy and your other versions. When the shared
//           song is newer than the copy you use, it says so first and asks:
//           copy it over yours, copy it as a second song, or keep using yours.
//           When it isn't newer but your copy of it differs (you changed it),
//           it offers to put the shared version back over yours.
//
// Each version has a small picture of the song, which opens large to read, ink
// included. Ink may sit a little off on a text song here (the preview isn't
// laid out quite as Present is), which is enough to see that it's there. No
// dimmed backdrop, as everywhere in Cue.
//
// `versions` are [{ song, label, standing }], your copy first; `standing` is
// copyStanding's answer for a copy of this song. `picked` is the one in use.
// `newer` is the picked copy's standing when the shared song is newer than it.

const THUMB_W = 72;  // CSS px, the size of the picture
const THUMB_H = 92;
const TEXT_W = 260;  // the width a song is laid out at before it is shrunk

// Preview lyrics are a fixed 15px, which is what lets ink drawn at another size
// scale to them. Read-only, the same as the editor's.
function preview(song, inked, dark) {
  return (
    <SongPreview text={song.text || ''} metadata={song.metadata || {}} displayMode={song.chordStyle || 'over'}
      displayKey={song.displayKey} chordPrefs={song.chordPrefs || {}} condensed={!!song.condensed}
      overlay={inked ? <AnnotationCanvas songId={song.id} annotating={false} dark={dark} readOnly fontPx={15} /> : null} />
  );
}

// A PDF's first page, drawn once at the picture's size. Fails to a blank page:
// the picture only helps you choose, so it must never get in the way of doing so.
function PdfThumb({ song, inked, dark }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false, doc = null, task = null;
    (async () => {
      try {
        const blob = await loadPdfBlob(song.id);
        if (!blob || cancelled) return;
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (cancelled) return;
        const page = await doc.getPage(1);
        if (cancelled) return;
        const rotation = pageRotation(page, (song.pdfRotate || 0) + pageTurn(song.pdfPageTurns, 1));
        const base = page.getViewport({ scale: 1, rotation });
        const viewport = page.getViewport({ scale: (THUMB_W / base.width) * (window.devicePixelRatio || 1) * 1.5, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
      } catch { /* the blank page stands */ }
    })();
    return () => {
      cancelled = true;
      try { task?.cancel(); } catch { /* ignore */ }
      try { doc?.destroy(); } catch { /* ignore */ }
    };
  }, [song.id, song.pdfRotate, song.pdfPageTurns]);
  return (
    <span className="relative block">
      <canvas ref={canvasRef} data-page="1" className="block w-full bg-white" />
      {inked && <PdfAnnotationCanvas songId={song.id} annotating={false} page={1} dark={dark} />}
    </span>
  );
}

function Thumb({ song, inked, dark, label, onBig }) {
  return (
    <button type="button" onClick={onBig} aria-label={`Show ${label} large`} title="Show it large"
      className={`relative shrink-0 overflow-hidden rounded-md border ${dark ? 'border-gray-600 bg-gray-950' : 'border-gray-300 bg-white'}`}
      style={{ width: THUMB_W, height: THUMB_H, WebkitTapHighlightColor: 'transparent' }}>
      {song.type === 'pdf' ? <PdfThumb song={song} inked={inked} dark={dark} /> : (
        <span className="absolute left-0 top-0 block pointer-events-none text-left origin-top-left"
          style={{ width: TEXT_W, height: THUMB_H * (TEXT_W / THUMB_W), transform: `scale(${THUMB_W / TEXT_W})` }} aria-hidden="true">
          {preview(song, inked, dark)}
        </span>
      )}
      <span className={`absolute right-0.5 bottom-0.5 flex items-center justify-center w-5 h-5 rounded ${dark ? 'bg-gray-800 text-gray-200' : 'bg-white/90 text-gray-700'} shadow-sm`}>
        <Maximize2 size={12} strokeWidth={2.5} />
      </span>
    </button>
  );
}

const BEHIND = { newer: 'older than the shared one', both: 'changed, and older than the shared one' };

export default function VersionPicker({
  dark, mode, song, versions = [], picked, newer = null, inkedIds, records = [], startingBook,
  onPick, onCopy, onCopyOver, onCopySecond, onKeep, onReplaceAll, onClose,
}) {
  const [big, setBig] = useState(null); // the row shown large
  const [book, setBook] = useState(startingBook);
  const head = dark ? 'text-white' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const primary = 'flex items-center justify-center gap-2 w-full h-11 shrink-0 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-full transition-colors';
  const secondary = `flex items-center justify-center gap-2 w-full h-11 shrink-0 text-sm font-medium rounded-full border transition-colors ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  const quiet = `text-xs py-1 text-center transition-colors ${dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`;
  const inked = (s) => s !== song && inkedIds.has(s.id);
  const facts = (s) => [
    normalizeTitle(s.metadata?.title) !== normalizeTitle(song.metadata?.title) && s.metadata?.title,
    s.metadata?.artist,
    (s.displayKey || s.metadata?.key) && `Key: ${s.displayKey || s.metadata?.key}`,
    s.type === 'pdf' && 'PDF',
  ].filter(Boolean).join(' · ');
  const title = song.metadata?.title || 'Untitled';
  const copying = mode === 'copy';
  // Copies of this song the shared one is newer than: the untouched ones are
  // replaced together; ones you changed are left for you to do one at a time.
  const untouched = versions.filter(v => v.standing === 'newer').length;
  const changedToo = versions.filter(v => v.standing === 'both').length;
  const rows = versions.map(v => ({ ...v, id: v.song.id, plays: picked?.id === v.song.id }));
  const sharedRow = { id: 'shared', song, label: newer ? 'The shared version, newer' : 'The shared version', shared: true };
  // A copy of this song you changed, when the share hasn't moved: you may want
  // the shared version back over it (Howard, 2026-11-10).
  const mineChanged = !newer && versions.find(v => v.song.id === picked?.id)?.standing === 'mine';
  // Every other copy of this song that differs from the shared one can have it
  // copied over, one at a time.
  const overThisOne = (row) => (row.standing === 'mine' || BEHIND[row.standing]) && !(row.plays && (newer || mineChanged))
    && (row.standing === 'mine' || untouched + changedToo > 1);

  const versionRow = (row) => (
    <div key={row.id} className={`flex items-stretch gap-3 p-2 rounded-xl transition-colors ${row.plays
      ? `border-2 ${dark ? 'border-white bg-gray-800' : 'border-gray-900 bg-gray-50'}`
      : `border ${dark ? 'border-gray-700' : 'border-gray-300'}`}`}>
      <Thumb song={row.song} inked={inked(row.song)} dark={dark} label={row.label} onBig={() => setBig(row)} />
      <div className="flex flex-col flex-1 min-w-0">
        <button type="button" onClick={() => onPick(row.song)} aria-pressed={row.plays}
          className="flex items-center gap-2 flex-1 min-w-0 text-left bg-transparent" style={{ WebkitTapHighlightColor: 'transparent' }}>
          <span className="flex-1 min-w-0">
            <span className={`block text-sm font-medium ${head}`}>{row.label}</span>
            {facts(row.song) && <span className={`block text-xs mt-0.5 ${muted}`}>{facts(row.song)}</span>}
            {BEHIND[row.standing] && <span className="block text-xs mt-0.5 text-blue-600 dark:text-blue-400">{BEHIND[row.standing]}</span>}
          </span>
          {row.plays && <Check size={20} strokeWidth={2.5} className={`shrink-0 ${head}`} />}
        </button>
        {overThisOne(row) && (
          <button type="button" onClick={() => onCopyOver(row.song)} className={`self-start ${quiet}`}>
            {row.standing === 'mine' ? 'Copy the shared version over this one' : 'Copy the newest over this one'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div className={`max-w-full flex flex-col gap-3 rounded-2xl shadow-2xl p-6 ${big ? 'w-[40rem] h-[85dvh]' : 'w-[26rem] max-h-[85dvh]'} ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-base font-semibold truncate ${head}`}>{big ? big.label : copying ? 'Copy this song' : newer ? 'The shared version is newer' : 'Which copy of yours?'}</h2>
            <p className={`text-sm truncate mt-0.5 ${muted}`}>{big ? facts(big.song) || title : title}</p>
          </div>
          <CloseCircle dark={dark} label={big ? 'Back' : 'Close'} onClick={big ? () => setBig(null) : onClose} className="-mt-3 -mr-4" />
        </div>

        {big ? (
          <>
            <div className={`relative flex-1 min-h-0 overflow-y-auto rounded-lg border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
              {big.song.type === 'pdf' ? (
                <div className="relative">
                  <PdfPageStack songId={big.song.id} turn={big.song.pdfRotate} pageTurns={big.song.pdfPageTurns} dark={dark} />
                  {inked(big.song) && <PdfAnnotationCanvas songId={big.song.id} annotating={false} dark={dark} />}
                </div>
              ) : <div className="h-full">{preview(big.song, inked(big.song), dark)}</div>}
            </div>
            {!big.shared && (
              <button type="button" onClick={() => onPick(big.song)} className={primary}>
                <Play size={18} /> {big.plays ? 'This one is yours' : 'Use this one'}
              </button>
            )}
          </>
        ) : copying ? (
          <>
            <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
              <div className={`flex items-stretch gap-3 p-2 rounded-xl border ${dark ? 'border-gray-700' : 'border-gray-300'}`}>
                <Thumb song={song} inked={false} dark={dark} label={sharedRow.label} onBig={() => setBig(sharedRow)} />
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  <span className={`text-sm font-medium ${head}`}>The shared version</span>
                  <BookChoice dark={dark} records={records} value={book} onChange={setBook} one />
                  <span className={`text-xs ${muted}`}>{book?.on ? 'It stays out of My songs until you use it.' : 'It goes into My songs.'}</span>
                </div>
              </div>
              <button type="button" disabled={book?.on && !bookChoice(book)} onClick={() => onCopy(bookChoice(book))} className={primary}>
                <Plus size={18} /> Copy it
              </button>
              {rows.length > 0 && (
                <>
                  <p className={`text-sm mt-2 ${head}`}>Or use one you already have</p>
                  {rows.map(versionRow)}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
            {newer && (
              <div className={`flex flex-col gap-2 p-3 rounded-xl border border-blue-500 ${dark ? 'bg-blue-950/30' : 'bg-blue-50'}`}>
                <div className="flex items-stretch gap-3">
                  <Thumb song={song} inked={false} dark={dark} label={sharedRow.label} onBig={() => setBig(sharedRow)} />
                  <p className={`text-sm ${head}`}>
                    {!picked ? `The shared version has changed since you copied it, and you have ${versions.length} versions of this song.`
                      : newer === 'both'
                      ? 'The shared version has changed since you copied it, and so has yours. Copying it over yours loses your changes; your ink stays.'
                      : 'The shared version has changed since you copied it. Copying it over yours keeps your ink.'}
                  </p>
                </div>
                {picked && <button type="button" onClick={() => onCopyOver(picked)} className={newer === 'both' ? secondary : primary}>Copy it over yours</button>}
                {picked && <button type="button" onClick={onCopySecond} className={secondary}>Copy it as a second song</button>}
                {untouched > (picked ? 1 : 0) && (
                  <button type="button" onClick={onReplaceAll} className={picked ? quiet : primary}>
                    {untouched === 1 ? 'Copy it over the copy you haven’t changed' : `Replace all ${untouched} copies you haven’t changed`}{changedToo ? ` (${changedToo} you changed stay as they are)` : ''}
                  </button>
                )}
                <button type="button" onClick={onKeep} className={newer === 'both' && picked ? primary : secondary}>{picked ? 'Keep using yours' : 'Keep them as they are'}</button>
              </div>
            )}
            {mineChanged && (
              <div className={`flex flex-col gap-2 p-3 rounded-xl border ${dark ? 'border-gray-700' : 'border-gray-300'}`}>
                <div className="flex items-stretch gap-3">
                  <Thumb song={song} inked={false} dark={dark} label={sharedRow.label} onBig={() => setBig(sharedRow)} />
                  <p className={`text-sm ${head}`}>You changed your copy, so it differs from the shared version. Copying the shared version over yours loses your changes; your ink stays.</p>
                </div>
                <button type="button" onClick={() => onCopyOver(picked)} className={secondary}>Copy the shared version over yours</button>
              </div>
            )}
            {rows.map(versionRow)}
          </div>
        )}
      </div>
    </div>
  );
}
