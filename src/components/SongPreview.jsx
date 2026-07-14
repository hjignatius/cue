import { Fragment, useMemo } from 'react';
import { parseChordPro, expandSections, attachSectionLabels, splitAnnotations } from '../utils/chordPro.js';
import { transposeChord, semitonesBetween, useFlatsForKey } from '../utils/transpose.js';
import { convertToBrackets } from '../utils/chordStyle.js';
import { usePrefs } from '../context/PrefsContext.jsx';

function LyricText({ text }) {
  return splitAnnotations(text).map((run, i) =>
    run.marker
      ? <span key={i} className="font-bold text-indigo-400 dark:text-indigo-300">{run.text}</span>
      : <Fragment key={i}>{run.text}</Fragment>
  );
}

function OverLyricsLine({ segments, semitones, chordColor, chordFontSize = 13, useFlats }) {
  return (
    <div className="flex flex-wrap font-mono mb-1" style={{ lineHeight: 1 }}>
      {segments.map((seg, i) => {
        const displayed = seg.chord ? transposeChord(seg.chord, semitones, useFlats) : null;
        return (
          <div key={i} className="flex flex-col" style={{ whiteSpace: 'pre' }}>
            <span
              className="font-bold leading-tight cursor-default select-none"
              style={{ color: displayed ? chordColor : 'transparent', fontSize: chordFontSize, minHeight: '1.2em' }}
            >
              {displayed ? displayed + ' ' : ' '}
            </span>
            <span className="text-gray-900 dark:text-white leading-snug" style={{ fontSize: 15 }}>
              {seg.text ? <LyricText text={seg.text} /> : ' '}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BracketsLine({ segments, semitones, chordColor, useFlats }) {
  return (
    <p className="font-mono leading-relaxed mb-1 text-gray-900 dark:text-white" style={{ fontSize: 15 }}>
      {segments.map((seg, i) => {
        const displayed = seg.chord ? transposeChord(seg.chord, semitones, useFlats) : null;
        return (
          <span key={i}>
            {displayed && (
              <span className="cursor-default select-none" style={{ color: chordColor }}>
                [{displayed}]
              </span>
            )}
            {seg.text ? <LyricText text={seg.text} /> : null}
          </span>
        );
      })}
    </p>
  );
}

export default function SongPreview({ text, metadata, displayMode = 'over', displayKey, overlay, showMeta = true }) {
  const { theme, chordColor, chordLabelScale, accidentals } = usePrefs();
  const dark = theme === 'dark';
  const chordFontSize = 13 * (1 + chordLabelScale / 100);
  const semitones = semitonesBetween(metadata?.key, displayKey);
  // Spelling of transposed accidentals: auto follows the View Key (displayKey).
  const useFlats = useFlatsForKey(accidentals, displayKey);
  // Always convert to ChordPro brackets before parsing — safe for all input
  // formats since convertToBrackets leaves already-bracketed text unchanged.
  // This handles mixed over-lyrics/ChordPro text without rendering gaps.
  const parseText = useMemo(() => convertToBrackets(text || ''), [text]);

  const lines = useMemo(() => {
    const parsed = parseChordPro(parseText);
    return attachSectionLabels(expandSections(parsed));
  }, [parseText]);

  const isEmpty = !text?.trim();

  return (
    <div className={`flex flex-col h-full rounded-lg overflow-hidden ${dark ? 'bg-gray-900' : 'bg-white border border-gray-200'}`}>
      {/* Preview header */}
      <div className={`px-3 py-2 border-b flex items-center justify-between shrink-0 ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Preview</span>
        {displayKey && displayKey !== metadata?.key && (
          <span className="text-xs text-indigo-400 font-mono">
            {metadata?.key || '?'} → {displayKey}
          </span>
        )}
      </div>

      {/* Content — when an overlay canvas is provided, the overlay wrapper below
          gains `position: relative; min-h-full` so the canvas (position:absolute
          inset:0) is anchored below the PREVIEW header and scrolls with lyrics.
          Without an overlay the wrapper is omitted to avoid spurious blank space. */}
      <div className="flex-1 overflow-y-auto p-4">
        {(() => {
          if (isEmpty) {
            return (
              <p className={`text-sm text-center mt-8 italic ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
                Start typing to see a preview…
              </p>
            );
          }

          // Preview-only metadata (Artist / Key / BPM). Rendered OUTSIDE the
          // overlay wrapper so it can never shift annotation coordinates —
          // Present mode shows none of this in its scroll content. Gated by
          // showMeta: the editor passes showMeta={false} (redundant with the
          // edit fields); the PDF export and other call sites keep it via the
          // default so only the editor's coordinate frame changes.
          const metaBlock = showMeta && (metadata?.artist || metadata?.key || metadata?.tempo) ? (
            <div className={`mb-4 pb-3 border-b text-center ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
              {metadata.artist && (
                <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{metadata.artist}</p>
              )}
              {(metadata?.key || metadata?.tempo) && (
                <p className={`text-xs mt-1 ${dark ? 'text-gray-600' : 'text-gray-500'}`}>
                  {metadata.key && <>Key: <span className="text-indigo-400">{displayKey || metadata.key}</span></>}
                  {metadata.key && metadata.tempo && ' · '}
                  {metadata.tempo && <>{metadata.tempo} BPM</>}
                </p>
              )}
            </div>
          ) : null;

          // Overlay-wrapped content: song title + lines only.
          const content = (
            <>
              {metadata?.title && (
                <h2 className={`text-lg font-bold text-center mb-4 ${dark ? 'text-white' : 'text-gray-900'}`}>{metadata.title}</h2>
              )}

              {/* Lines */}
              {lines.map((line, i) => {
                const label = line.label ? (
                  <p key={`lbl-${i}`} className="text-xs font-bold text-indigo-500 uppercase tracking-wider mt-4 mb-1">
                    {line.label}
                  </p>
                ) : null;

                let lineContent = null;
                if (line.type === 'empty') {
                  lineContent = <div className="h-3" />;
                } else if (line.type === 'directive' || line.type === 'comment') {
                  return null;
                } else if (line.type === 'chords') {
                  lineContent = displayMode === 'over'
                    ? <OverLyricsLine segments={line.segments} semitones={semitones} chordColor={chordColor} chordFontSize={chordFontSize} useFlats={useFlats} />
                    : <BracketsLine segments={line.segments} semitones={semitones} chordColor={chordColor} useFlats={useFlats} />;
                } else {
                  lineContent = (
                    <p className={`font-mono leading-relaxed mb-1 ${dark ? 'text-white' : 'text-gray-900'}`} style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>
                      <LyricText text={line.segments?.[0]?.text || ''} />
                    </p>
                  );
                }

                return (
                  <Fragment key={i}>
                    {label}
                    {lineContent}
                  </Fragment>
                );
              })}
            </>
          );

          return (
            <>
              {metaBlock}
              {overlay != null
                ? (
                  // Overlay wrapper. Must structurally match PresentationView's
                  // contentWrapRef (title + song content only) — annotation
                  // coordinates depend on it. No preview-only elements inside.
                  <div className="relative min-h-full">{content}{overlay}</div>
                )
                : content}
            </>
          );
        })()}
      </div>

    </div>
  );
}
