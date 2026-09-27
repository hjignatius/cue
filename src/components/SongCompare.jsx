import { useMemo, useState } from 'react';
import { X, Trash2, SquarePen } from 'lucide-react';
import { convertToOver } from '../utils/chordStyle.js';
import { diffLines, countChanges } from '../utils/lineDiff.js';
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

export default function SongCompare({ songs, dark, setsBySongId, annotatedIds, onClose, onRename, onDelete }) {
  const isNarrow = useIsNarrow();
  const [leftId,  setLeftId]  = useState(songs[0]?.id);
  const [rightId, setRightId] = useState(songs[1]?.id);

  const left  = songs.find(s => s.id === leftId)  || songs[0];
  const right = songs.find(s => s.id === rightId) || songs[1];

  const { rows, approximate, changes } = useMemo(() => {
    const d = diffLines(convertToOver(left?.text || ''), convertToOver(right?.text || ''));
    return { ...d, changes: countChanges(d.rows) };
  }, [left?.text, right?.text]);

  if (!left || !right) return null;
  // A PDF song keeps its chart in the sheet, so there is no text to line up. Say so
  // rather than showing two empty panes.
  const pdfSide = left.type === 'pdf' || right.type === 'pdf';

  const bdr   = dark ? 'border-gray-700' : 'border-gray-200';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const ink   = dark ? 'text-gray-100' : 'text-gray-900';
  // Removed on the left, added on the right — one hue each, used consistently in
  // both layouts so the colour means the same thing however it is arranged.
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

  const lineCls = 'font-mono text-[11px] leading-snug whitespace-pre px-2 py-0.5 rounded';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border ${bdr} ${dark ? 'bg-gray-900' : 'bg-white'}`}
      >
        <div className={`flex items-start justify-between gap-3 px-5 py-3 border-b ${bdr}`}>
          <div className="min-w-0">
            <h2 className={`text-base font-semibold ${ink}`}>Compare copies</h2>
            <p className={`text-xs ${muted}`}>
              {changes === 0
                ? 'The words and chords are identical.'
                : `${changes} line${changes === 1 ? '' : 's'} differ.`}
              {' '}Shown as it will be played. The charts cannot be edited here — Rename and Delete are the only changes on offer.
              {approximate && ' Alignment is approximate on a song this long.'}
            </p>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="shrink-0 px-5 pt-4 pb-3 flex flex-col gap-3">
          {/* Which two, when there are more than two. */}
          <div className="grid gap-3" style={{ gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr' }}>
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
              <div className={`rounded-xl border ${bdr} overflow-hidden`}>
                {diffs.map(([label, get], i) => (
                  <div
                    key={label}
                    className={`grid text-xs ${i ? `border-t ${bdr}` : ''}`}
                    style={{ gridTemplateColumns: isNarrow ? '5rem 1fr 1fr' : '6rem 1fr 1fr' }}
                  >
                    <span className={`px-2 py-1.5 ${muted}`}>{label}</span>
                    <span className={`px-2 py-1.5 truncate ${gone}`}>{val(get, left) || '—'}</span>
                    <span className={`px-2 py-1.5 truncate ${added}`}>{val(get, right) || '—'}</span>
                  </div>
                ))}
              </div>
            );
          })()}

        </div>

        {/* THE CHARTS SCROLL, the rest does not. Long songs used to push the panes
            off the bottom and take the selectors and the details with them, so you
            lost sight of which two copies you were even looking at.

            ONE scroller for both columns, never two — they must move together or
            the alignment the diff exists for is gone. Horizontally too: chord lines
            are wide, and `pre` keeps a line intact rather than wrapping it, which
            would break the very alignment being read. */}
        <div className={`flex-1 min-h-0 overflow-auto border-t ${bdr}`}>
          {pdfSide ? (
            <p className={`text-xs px-5 py-4 ${muted}`}>
              One of these is a PDF lead sheet, so its chords live in the sheet rather than in text —
              there is nothing to line up. The details above still compare, and opening each song
              shows its sheet.
            </p>
          ) : (
          <div className="w-max min-w-full">
            {isNarrow ? (
              // Unified: two columns of chords do not fit a phone, so removals and
              // additions stack in one column instead.
              <div className="p-2 flex flex-col">
                {rows.map((r, i) => (
                  r.same
                    ? <span key={i} className={`${lineCls} ${muted}`}>{r.l || ' '}</span>
                    : <span key={i} className="flex flex-col">
                        {r.l !== null && <span className={`${lineCls} ${gone}`}>− {r.l || ' '}</span>}
                        {r.r !== null && <span className={`${lineCls} ${added}`}>+ {r.r || ' '}</span>}
                      </span>
                ))}
              </div>
            ) : (
              <div className="grid gap-x-4" style={{ gridTemplateColumns: 'max-content max-content' }}>
                {rows.map((r, i) => (
                  <div key={i} className="contents">
                    <span className={`${lineCls} ${r.same ? muted : r.l === null ? '' : gone}`}>{r.l ?? ' '}</span>
                    <span className={`${lineCls} ${r.same ? muted : r.r === null ? '' : added}`}>{r.r ?? ' '}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
