// SongPreview — renders a song's chords + lyrics.
//
// NOT an editor component. It is a SHARED renderer: the editor's preview pane is
// one caller, but PDF export and the shared-viewer paths use it too (see the
// `showMeta` default). Anything derived from the editor's pane geometry would
// follow it into print, where there is no pane.
//
// ── Deferred: "Preview as a mini Present" ───────────────────────────────────
// Idea: render this at Present's proportions so ink maps between the two views.
// Its own task. Two findings from the investigation, so the next person starts
// from them instead of rediscovering them:
//
//  1. Ink maps under PROPORTIONALITY, not identity. The stored scheme is already
//     width-normalised (nx is 0–1; screenY scales by currentWidth/captureWidth)
//     and tracks the font ratio to within 0.06% across fontPx 14–34 — it is built
//     for uniform rescaling. The blocker is CHARS-PER-LINE, not width: this view
//     wraps at ~44 chars in a 400px pane, Present always wraps at
//     LYRIC_TARGET_CHARS = 65. Different wrap points ⇒ different line counts ⇒
//     different vertical positions, which no uniform scale can fix. Fix the
//     character measure and the font follows (previewFont = paneWidth / (65*0.602));
//     fix the font alone and nothing works.
//  2. Because this is a shared renderer, any such design needs an explicit `scale`
//     prop with print and the shared viewer opting out — not a font quietly
//     derived from a pane width.
//
// A literal 65-char column is NOT viable here: it is 1192px at the default font
// against a pane that maxes out at 700, so the pane would scroll horizontally at
// every size and its resize would stop meaning anything.
// ────────────────────────────────────────────────────────────────────────────

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

          // Preview-only metadata (Key / BPM). Rendered OUTSIDE the overlay
          // wrapper so it can never shift annotation coordinates. Gated by
          // showMeta: the editor passes showMeta={false} (redundant with the
          // edit fields); the PDF export and other call sites keep it via the
          // default so only the editor's coordinate frame changes.
          //
          // The ARTIST used to live here for the same reason. It now sits INSIDE
          // the overlay wrapper, matching Present, where the artist was moved into
          // the lyric flow. That move shifts stored ink down by one artist line,
          // which is why annotation strokes carry a layout version: v1 strokes are
          // corrected at render, v2 are drawn against this layout. See
          // ANNOTATION_LAYOUT_VERSION in AnnotationCanvas.jsx. Key/BPM must stay
          // out here — anything added inside the wrapper moves the lyrics again.
          const metaBlock = showMeta && (metadata?.key || metadata?.tempo) ? (
            <div className={`mb-4 pb-3 border-b text-center ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
              {(metadata?.key || metadata?.tempo) && (
                <p className={`text-xs mt-1 ${dark ? 'text-gray-600' : 'text-gray-500'}`}>
                  {metadata.key && <>Key: <span className="text-indigo-400">{displayKey || metadata.key}</span></>}
                  {metadata.key && metadata.tempo && ' · '}
                  {metadata.tempo && <>{metadata.tempo} BPM</>}
                </p>
              )}
            </div>
          ) : null;

          // Overlay-wrapped content: song title + artist + lines.
          const content = (
            <>
              {metadata?.title && (
                <h2 className={`text-lg font-bold text-center mb-1 ${dark ? 'text-white' : 'text-gray-900'}`}>{metadata.title}</h2>
              )}
              {metadata?.artist && (
                <p className={`text-center mb-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: 15, lineHeight: 1.5 }}>{metadata.artist}</p>
              )}
              {!metadata?.artist && metadata?.title && <div className="mb-3" />}

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
                  // contentWrapRef — annotation coordinates depend on it. That is
                  // now title + ARTIST + song content. No preview-only elements
                  // inside: Key/BPM stay above, outside this wrapper. Adding
                  // anything else here moves the lyrics down and breaks stored
                  // ink again, which would need another layout version.
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
