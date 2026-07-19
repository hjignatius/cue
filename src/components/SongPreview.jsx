// SongPreview — renders a song's chords + lyrics for the EDITOR's preview pane.
//
// Editor-only. Verified (not assumed — a prior comment here wrongly called this a
// shared renderer feeding print): the sole importer is EditorView, two call sites.
// PDF export renders SongDocument.jsx (@react-pdf/renderer); the shared viewer
// renders PresentationView. Neither touches this file. So nothing here follows
// into print, and pane-derived sizing would affect the editor and nowhere else.
//
// Fixed font (15px) that reflows at the pane width. This does NOT match Present,
// which renders at a user font in a fixed 65-character column. The two are only
// styled to RESEMBLE each other (see the title/artist treatment below), so
// entering Present is not jarring — but line breaks and vertical positions differ.
//
// ── Deferred: "Preview as a mini Present" (its own task) ────────────────────
// Making the two share a layout so annotations map between them is feasible but
// out of scope. Findings from the investigation, corrected against measurement so
// the next person starts from facts:
//
//  1. Wrap parity is achievable. Present's over-lyrics wrap is exactly
//     font-invariant — measured: the same long line breaks at the same segment at
//     fontPx 14/22/34, because its text area is precisely 65 * advance * fontPx.
//     A Preview using the same flex-wrap mechanism (it already does) at a font
//     derived from the pane, in a 65-char-wide text area, breaks identically. The
//     earlier "chars-per-line can't be reconciled by any uniform scale" was wrong.
//     Derive the advance from the same canvas measure lyricColumnWidth uses; do
//     not hardcode 0.602 (real advance ~0.6023).
//  2. Vertical parity is the actual work. Every vertical metric here is FIXED
//     (font 15, chord 13, labels text-xs/mt-4/mb-1, empty h-3, over-lyrics mb-1);
//     every one in Present is proportional to fontPx. Ink maps only once these are
//     made proportional too — i.e. once this renders like SongBody. The cheapest
//     faithful version is to EXTRACT SongBody and render it here, not to retrofit
//     these metrics one by one.
//  3. Safe, not expensive. The editor's overlay is AnnotationCanvas readOnly, so
//     ink is never CAPTURED here — only displayed. A layout change needs no new
//     ANNOTATION_LAYOUT_VERSION; strokes captured in Present would simply start
//     displaying in register. The real user-visible cost is the readability floor:
//     a pane-derived font only reaches Present's minimum (14px) at a ~580px pane,
//     so a readable scale model needs the pane min raised from 200 to ~500.
// ────────────────────────────────────────────────────────────────────────────

import { Fragment, useMemo } from 'react';
import { parseChordPro, expandSections, attachSectionLabels, styleSegments } from '../utils/chordPro.js';
import { transposeChord, semitonesBetween, useFlatsForKey } from '../utils/transpose.js';
import { convertToBrackets } from '../utils/chordStyle.js';
import { usePrefs } from '../context/PrefsContext.jsx';

// Render pre-parsed styled runs. Repeat markers keep the accent color; other
// runs apply the user's bold/italic/color. Chords are rendered separately, so
// their color is unaffected.
function StyledRuns({ runs }) {
  return (runs || []).map((r, i) =>
    r.marker
      ? <span key={i} className="font-bold text-indigo-400 dark:text-indigo-300">{r.text}</span>
      : <span
          key={i}
          style={{ fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? 'italic' : undefined, color: r.color || undefined }}
        >{r.text}</span>
  );
}

function OverLyricsLine({ segments, semitones, chordColor, chordFontSize = 13, useFlats }) {
  return (
    <div className="flex flex-wrap font-mono mb-1" style={{ lineHeight: 1 }}>
      {styleSegments(segments).map((seg, i) => {
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
              {seg.text ? <StyledRuns runs={seg.styledRuns} /> : ' '}
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
      {styleSegments(segments).map((seg, i) => {
        const displayed = seg.chord ? transposeChord(seg.chord, semitones, useFlats) : null;
        return (
          <span key={i}>
            {displayed && (
              <span className="cursor-default select-none" style={{ color: chordColor }}>
                [{displayed}]
              </span>
            )}
            {seg.text ? <StyledRuns runs={seg.styledRuns} /> : null}
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
          // showMeta, which the editor (the only caller) passes false, since the
          // edit fields already show Key/BPM. The default is true only for any
          // future caller; there is no PDF/print path through this file.
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
          //
          // Title/artist are styled to RESEMBLE Present's info block (mono,
          // left-aligned, title 1.4x the body like Present's fontPx * 1.4), so
          // stepping into Present is not jarring. This is cosmetic only: Preview
          // stays at fixed 15px reflowing to the pane, so line breaks and vertical
          // positions still differ from Present and ink does NOT map between the
          // two. Ink mapping needs the full scale model (see the header note); the
          // restyle deliberately does not attempt it.
          const content = (
            <>
              {(metadata?.title || metadata?.artist) && (
                <div className="mb-4">
                  {metadata?.title && (
                    <h2 className={`font-mono font-bold ${dark ? 'text-white' : 'text-gray-900'}`} style={{ fontSize: 15 * 1.4, lineHeight: 1.2 }}>{metadata.title}</h2>
                  )}
                  {metadata?.artist && (
                    <p className={`font-mono ${dark ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontSize: 15, lineHeight: 1.5 }}>{metadata.artist}</p>
                  )}
                </div>
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
                      <StyledRuns runs={styleSegments(line.segments)[0]?.styledRuns} />
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
