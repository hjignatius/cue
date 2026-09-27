import { useMemo, useState } from 'react';
import { X, Trash2, SquarePen } from 'lucide-react';
import { convertToOver } from '../utils/chordStyle.js';
import { stripStyling } from '../utils/chordPro.js';
import { diffLines, countChanges } from '../utils/lineDiff.js';
import { normalizeTitle } from '../utils/contentHash.js';
import { useIsNarrow } from '../hooks/useIsNarrow.js';

// Read-only side-by-side comparison of two copies of a song.
//
// TWO COPIES, never three. A three-way diff is a genuinely hard problem — it is
// what makes merge tools so unpleasant — and three panes of monospace chords are
// unreadable anyway. With more than two copies the panes get selectors instead,
// so switching pairing is a tap rather than closing and reopening: with three
// copies you will want A against B and then A against C.
//
// THE CATCH THIS IS BUILT AROUND: the two copies may be in different chord
// formats. Diffing Inline against Over-lyrics raw marks every single line as
// changed and tells you nothing, so both sides are put in the same format first.
// The comparison is about what the song SAYS, not how it happens to be written.
//
// THAT FORMAT IS OVER-LYRICS, the one you perform from. It was brackets, which was
// a defensible choice for a diff and the wrong thing to show a person: normalising
// is an implementation detail for alignment, and nobody should have to read
// [C]inline[G]markup to compare two songs. Over-lyrics costs more diff rows — a
// chord line and a lyric line each — and that is a gain, because a changed chord
// shows up on its own row above the words it belongs to.

// Accessors rather than metadata keys, because the last three are not in metadata
// and they matter most: they change what you HEAR. Two copies whose text matches
// exactly can still play differently if one is transposed or shows diagrams.
//
// Format earns its place for a quieter reason: the charts below are shown in the
// performed layout whatever each copy stores, so without this row a pair written
// in different formats looks mysteriously identical.
const FIELDS = [
  ['Title',     (s) => s.metadata?.title],
  ['Artist',    (s) => s.metadata?.artist],
  ['Key',       (s) => s.metadata?.key],
  ['Tempo',     (s) => s.metadata?.tempo],
  ['Time',      (s) => s.metadata?.timeSig],
  ['Length',    (s) => s.metadata?.duration],
  ['YouTube',   (s) => s.metadata?.youtubeUrl],
  ['Transpose', (s) => s.displayKey],
  ['Format',    (s) => (s.chordStyle === 'brackets' ? 'Inline' : 'Over')],
  ['Chords',    (s) => (s.embed ? 'Diagrams' : 'Names')],
];

function when(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// The line that says what deleting this copy would cost — the same three facts,
// in the same order, as the duplicates list. Familiar by the time you get here.
function Facts({ song, sets, hasInk, dark }) {
  const created = when(song.createdAt);
  const edited  = when(song.updatedAt);
  const muted   = dark ? 'text-gray-400' : 'text-gray-500';
  return (
    <p className={`text-[11px] ${muted}`}>
      <span className={sets.length ? (dark ? 'font-medium text-gray-200' : 'font-medium text-gray-700') : ''}>
        {sets.length === 0 ? 'Not in any set' : `In ${sets.length} set${sets.length === 1 ? '' : 's'}: ${sets.join(', ')}`}
      </span>
      {hasInk && <span className="text-amber-600 dark:text-amber-400 font-medium"> · Has ink</span>}
      {created && <> · Created {created}</>}
      {edited && edited !== created && <> · Edited {edited}</>}
    </p>
  );
}

function Chart({ text, className }) {
  return (
    <div className={className}>
      {text.split('\n').map((line, i) => (
        <div
          key={i}
          className="whitespace-pre-wrap"
          // Hanging indent: a line too wide for the column continues indented, so
          // it reads as the rest of that line rather than as the next one. Same
          // idea Present uses when a chord row wraps on stage.
          style={{ paddingLeft: '1.5em', textIndent: '-1.5em' }}
        >
          {line || '\u00a0'}
        </div>
      ))}
    </div>
  );
}

export default function SongCompare({ songs, dark, setsBySongId, annotatedIds, onClose, onRename, onDelete }) {
  const isNarrow = useIsNarrow();
  const [leftId,  setLeftId]  = useState(songs[0]?.id);
  const [rightId, setRightId] = useState(songs[1]?.id);

  const left  = songs.find(s => s.id === leftId)  || songs[0];
  const right = songs.find(s => s.id === rightId) || songs[1];

  const { leftText, rightText, changed, spacing } = useMemo(() => {
    // Styling markup out BEFORE the format conversion, for two reasons. It is not
    // played — "{c=#9333ea}Winchester Cathedral{/c}" reads as coloured words on
    // stage, and as noise here. And convertToOver measures columns from the lyric
    // text, so leaving the tokens in would push every chord out of position over
    // the words it belongs to.
    const prep = (t) => convertToOver(stripStyling(t || ''));
    const lt = prep(left?.text);
    const rt = prep(right?.text);
    // The diff is used ONLY for the count in the header now. Nothing about the
    // layout depends on it, which is the point: see the panes below.
    const d = diffLines(lt, rt);
    return { leftText: lt, rightText: rt, ...countChanges(d.rows) };
  }, [left?.text, right?.text]);

  if (!left || !right) return null;
  // A PDF song keeps its chart in the sheet, so there is no text to line up. Say so
  // rather than showing two empty panes.
  const pdfSide = left.type === 'pdf' || right.type === 'pdf';

  const bdr   = dark ? 'border-gray-700' : 'border-gray-200';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const ink   = dark ? 'text-gray-100' : 'text-gray-900';
  // Left and right, one hue each. Used ONLY in the details table below — a handful
  // of rows where the tint says which side a value belongs to, since the columns
  // carry no headings. The charts are deliberately plain.
  const gone  = dark ? 'bg-red-500/15 text-red-200'     : 'bg-red-50 text-red-900';
  const added = dark ? 'bg-green-500/15 text-green-200' : 'bg-green-50 text-green-900';

  // A copy's label in the pane selector. They share a title — that is why they are
  // in this list — so the distinguishing facts do the naming.
  const labelFor = (s) => {
    const sets = setsBySongId.get(s.id) || [];
    const bits = [
      sets.length ? `in ${sets.length} set${sets.length === 1 ? '' : 's'}` : 'not in a set',
      annotatedIds.has(s.id) ? 'has ink' : null,
      when(s.createdAt) ? `created ${when(s.createdAt)}` : null,
    ].filter(Boolean);
    return bits.join(' · ');
  };

  const Selector = ({ value, onChange, other }) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full text-[11px] rounded-lg border px-2 py-1 ${bdr} ${dark ? 'bg-gray-900 text-gray-200' : 'bg-white text-gray-700'}`}
    >
      {songs.map(s => (
        <option key={s.id} value={s.id} disabled={s.id === other}>{labelFor(s)}</option>
      ))}
    </select>
  );

  const Actions = ({ song }) => (
    <span className="flex items-center gap-3">
      <button
        onClick={() => onRename(song)}
        className={`inline-flex items-center gap-1 text-xs font-medium hover:underline ${dark ? 'text-gray-300' : 'text-gray-600'}`}
      >
        <SquarePen size={13} /> Rename
      </button>
      <button
        onClick={() => onDelete(song.id)}
        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
      >
        <Trash2 size={13} /> Delete
      </button>
    </span>
  );

  const lineCls = 'font-mono text-[11px] leading-snug px-2 py-0.5 rounded';
  // Both chart columns get the width of the longest line in EITHER song, so they
  // are equal to each other rather than each hugging its own content — and a
  // minimum, not a fixed width, so when the songs are narrow the columns still
  // split the window in half and line up with everything above them. `ch` is exact
  // here because the charts are monospace. +1rem covers the cell's own px-2.
  // ONE geometry for the whole window: two halves, always. The charts used to
  // claim the width of their longest line, which pushed the pair past the panel
  // and turned reading into sideways scrolling. Now a line too long for its half
  // WRAPS inside it.
  //
  // That costs something real and it is worth naming: past the wrap point a chord
  // no longer sits over its word. Scrolling a two-column comparison sideways costs
  // more, and the wrapped remainder is indented so it reads as a continuation
  // rather than as a new line of the song.
  // Everything ABOVE the charts: plain halves. These live in the fixed part of the
  // window, so they must never claim a chart's minimum width — a wide song would
  // push them straight out of the panel. minmax(0,1fr) rather than 1fr so a long
  // YouTube URL truncates inside its half instead of stretching it.
  const cols = { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden ${bdr} ${dark ? 'bg-gray-900' : 'bg-white'}`}
      >
        <div className={`flex items-start justify-between gap-3 px-5 py-3 border-b ${bdr}`}>
          <div className="min-w-0">
            <h2 className={`text-base font-semibold ${ink}`}>Compare copies</h2>
            <p className={`text-xs ${muted}`}>
              {changed === 0 && spacing === 0
                ? 'The words and chords are identical.'
                : changed === 0
                  ? `Only spacing differs — ${spacing} line${spacing === 1 ? '' : 's'}, same words and chords.`
                  : `${changed} line${changed === 1 ? '' : 's'} differ${spacing ? `, plus ${spacing} that differ only in spacing` : ''}.`}
              {' '}Shown as it will be played. The charts cannot be edited here — Rename and Delete are the only changes on offer.
            </p>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="shrink-0 px-5 pt-4 pb-3 flex flex-col gap-3">
          {/* Which two, when there are more than two. */}
          <div className="grid gap-3" style={isNarrow ? { gridTemplateColumns: '1fr' } : cols}>
            {[[left, right, setLeftId], [right, left, setRightId]].map(([side, other, set], i) => (
              <div key={i} className={`rounded-xl border p-3 flex flex-col gap-2 ${bdr}`}>
                {songs.length > 2 && <Selector value={side.id} onChange={set} other={other.id} />}
                <p className={`text-sm font-medium ${ink} truncate`}>{side.metadata?.title || 'Untitled'}</p>
                <Facts song={side} sets={setsBySongId.get(side.id) || []} hasInk={annotatedIds.has(side.id)} dark={dark} />
                <Actions song={side} />
              </div>
            ))}
          </div>

          {/* Details. Divergence often lives here rather than in the chart — a key
              or a tempo — and it is far cheaper to show than a text diff. */}
          {(() => {
            const val = (get, s) => String(get(s) ?? '').trim();
            const diffs = FIELDS.filter(([, get]) => val(get, left) !== val(get, right));
            if (diffs.length === 0) {
              return <p className={`text-xs ${muted}`}>Every detail matches too — title, artist, key, tempo, time, length, video, transpose and chord format.</p>;
            }
            return (
              <div className="flex flex-col">
                {diffs.map(([label, get], i) => {
                  // A row flagged as different where both values LOOK identical is
                  // worse than no row — it reads as a bug. It is usually a curly
                  // apostrophe against a straight one, or a double space. Say so,
                  // because it also tells you the difference does not matter and
                  // either copy will do.
                  const lookalike =
                    normalizeTitle(val(get, left)) === normalizeTitle(val(get, right));
                  const cell = (v, tint) => (
                    <span className={`px-2 py-1.5 min-w-0 rounded ${tint}`}>
                      <span className={`block text-[10px] ${muted}`}>
                        {label}{lookalike && <span className="italic"> · punctuation or spacing only</span>}
                      </span>
                      <span className="block truncate">{v || '—'}</span>
                    </span>
                  );
                  return (
                    <div key={label} className={`grid gap-3 text-xs ${i ? 'mt-1.5' : ''}`} style={cols}>
                      {cell(val(get, left), gone)}
                      {cell(val(get, right), added)}
                    </div>
                  );
                })}
              </div>
            );
          })()}

        </div>

        {/* THE CHARTS SCROLL, the rest does not. Long songs used to push the panes
            off the bottom and take the selectors and the details with them, so you
            lost sight of which two copies you were even looking at.

            PLAIN TEXT, no highlighting. It marked every differing line, and on two
            copies of a pub standard typed out separately that is almost every line
            — a wall of colour that said "these are different", which you already
            knew. Howard's answer: a column on the left, a column on the right, and
            he will see it himself. He is right; the reader is better at this than
            the marker was.

            The alignment stays, because it costs nothing to look at and is what
            puts the same verse opposite itself. A blank on one side is a line the
            other side does not have.

            ONE scroller for both columns, never two — they must move together —
            and horizontally as well, with `pre` rather than `pre-wrap`, since a
            wrapped chord line is a line whose chords no longer sit over their
            words. That is also why there is no separate narrow layout: on a phone
            you scroll sideways, rather than reading some other arrangement. */}
        <div className={`flex-1 min-h-0 overflow-y-auto border-t ${bdr}`}>
          {pdfSide ? (
            <p className={`text-xs px-5 py-4 ${muted}`}>
              One of these is a PDF lead sheet, so its chords live in the sheet rather than in text —
              there is nothing to line up. The details above still compare, and opening each song
              shows its sheet.
            </p>
          ) : (
            <div className="px-5 py-3">
              {/* EACH SONG IS ONE BLOCK, not a row of paired cells.
                  The rows were aligned, which meant blank lines pushed in wherever
                  one side had something the other did not — and that reads as the
                  comparison pointing at things, which is what Howard did not want.
                  Worse, a grid lays out row by row, so SELECTING BOTH COLUMNS AND
                  COPYING gave left line, right line, left line, right line, all the
                  way down. Two blocks copy as one song then the other, which is
                  what anyone would expect. */}
              <div className="grid gap-3" style={cols}>
                <Chart text={leftText} className={`${lineCls} ${muted}`} />
                <Chart text={rightText} className={`${lineCls} ${muted} pl-3 border-l ${bdr}`} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
