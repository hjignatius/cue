import { useEffect, useRef, useState } from 'react';
import { Check, Maximize2, Plus } from 'lucide-react';
import { CloseCircle } from './CornerClose.jsx';
import SongPreview from './SongPreview.jsx';
import PdfPageStack from './PdfPageStack.jsx';
import AnnotationCanvas from './AnnotationCanvas.jsx';
import PdfAnnotationCanvas from './PdfAnnotationCanvas.jsx';
import { isMine } from '../utils/books.js';
import { normalizeTitle } from '../utils/contentHash.js';
import { loadPdfBlob } from '../utils/storage.js';
import { loadPdfjs, pageRotation } from '../utils/pdfjs.js';
import { pageTurn } from '../utils/pageTurns.js';

// Which version of a shared song Present plays: the shared one, your copy of it,
// or another version of yours. Each has a small picture of the song itself, which
// opens large to read, ink included. Ink may sit a little off on a text song here
// (the preview isn't laid out quite as Present is), which is enough to see that
// it's there. Tapping a row chooses it and closes the window, and the share
// remembers. No dimmed backdrop, as everywhere in Cue.
//
// `linked` is your copy of this song and `others` your other versions. `chosen`
// is the one that plays now, null for the shared version. onChoose gets the song
// picked, or null for the shared one. onCopy is there when copying makes sense.
// `inkedIds` is the songs with ink on them.

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

export default function VersionPicker({ dark, song, linked, linkedWord, others, chosen, bookNames, inkedIds, onChoose, onCopy, onClose }) {
  const [big, setBig] = useState(null); // the row shown large
  const head = dark ? 'text-white' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const word = (s) => `${isMine(s) ? 'Your song' : `In “${bookNames.get(s.bookId) || 'a book'}”`}${inkedIds.has(s.id) ? ', with your ink' : ''}`;
  const inked = (s) => s !== song && inkedIds.has(s.id);
  const facts = (s) => [
    normalizeTitle(s.metadata?.title) !== normalizeTitle(song.metadata?.title) && s.metadata?.title,
    s.metadata?.artist,
    (s.displayKey || s.metadata?.key) && `Key: ${s.displayKey || s.metadata?.key}`,
    s.type === 'pdf' && 'PDF',
  ].filter(Boolean).join(' · ');
  const rows = [
    { id: 'shared', version: song, label: 'Shared version', plays: !chosen, pick: null },
    ...(linked ? [{ id: linked.id, version: linked, label: linkedWord, plays: chosen?.id === linked.id, pick: linked }] : []),
    ...others.map(s => ({ id: s.id, version: s, label: word(s), plays: chosen?.id === s.id, pick: s })),
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div className={`max-w-full flex flex-col gap-3 rounded-2xl shadow-2xl p-6 ${big ? 'w-[40rem] h-[85dvh]' : 'w-[26rem] max-h-[85dvh]'} ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-base font-semibold truncate ${head}`}>{big ? big.label : 'Which version plays?'}</h2>
            <p className={`text-sm truncate mt-0.5 ${muted}`}>{big ? facts(big.version) || (song.metadata?.title || 'Untitled') : song.metadata?.title || 'Untitled'}</p>
          </div>
          <CloseCircle dark={dark} label={big ? 'Back to the versions' : 'Close'} onClick={big ? () => setBig(null) : onClose} className="-mt-3 -mr-4" />
        </div>

        {big ? (
          <>
            <div className={`relative flex-1 min-h-0 overflow-y-auto rounded-lg border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
              {big.version.type === 'pdf' ? (
                <div className="relative">
                  <PdfPageStack songId={big.version.id} turn={big.version.pdfRotate} pageTurns={big.version.pdfPageTurns} dark={dark} />
                  {inked(big.version) && <PdfAnnotationCanvas songId={big.version.id} annotating={false} dark={dark} />}
                </div>
              ) : <div className="h-full">{preview(big.version, inked(big.version), dark)}</div>}
            </div>
            <button type="button" onClick={() => onChoose(big.pick)}
              className="w-full h-11 shrink-0 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors">
              {big.plays ? 'This one plays' : 'Play this one'}
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
              {rows.map((row) => (
                <div key={row.id} className={`flex items-stretch gap-3 p-2 rounded-xl transition-colors ${row.plays
                  ? `border-2 ${dark ? 'border-white bg-gray-800' : 'border-gray-900 bg-gray-50'}`
                  : `border ${dark ? 'border-gray-700' : 'border-gray-300'}`}`}>
                  <Thumb song={row.version} inked={inked(row.version)} dark={dark} label={row.label} onBig={() => setBig(row)} />
                  <button type="button" onClick={() => onChoose(row.pick)} aria-pressed={row.plays}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left bg-transparent" style={{ WebkitTapHighlightColor: 'transparent' }}>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-medium ${head}`}>{row.label}</span>
                      {facts(row.version) && <span className={`block text-xs mt-0.5 ${muted}`}>{facts(row.version)}</span>}
                    </span>
                    {row.plays && <Check size={20} strokeWidth={2.5} className={`shrink-0 ${head}`} />}
                  </button>
                </div>
              ))}
            </div>

            {onCopy && (
              <button type="button" onClick={onCopy}
                className={`flex items-center justify-center gap-2 w-full h-11 shrink-0 text-sm font-medium rounded-xl border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
                <Plus size={18} /> Copy the shared version to my songs
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
