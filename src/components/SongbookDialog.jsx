import { memo, useCallback, useMemo, useState } from 'react';

// The review list for a songbook PDF: every song Cue found, to tick or untick
// before anything is created. Opens straight away while the pages are still
// being read (`reading` carries real page counts), then fills in.
//
// A song already in the library — same title, by normalizeTitle — is marked and
// starts unticked, so importing the same book twice does not double it. So does
// an entry with no chords (a contents page a bookmark points at), and one whose
// chart is a picture can't be ticked at all: there is no text to import.
//
// A big book is thousands of rows, so each row is memoised: ticking one must
// not redraw the other 4,000.
//
// No dimmed backdrop, as with every dialog in Cue.
const SET_DEFAULT_MAX = 100;

export default function SongbookDialog({ dark, fileName, reading, songs, onImport, onKeepAsPage, onCancel }) {
  const [picked, setPicked] = useState(null);           // Set of indices, once songs arrive
  const [open, setOpen]     = useState(null);           // index whose chart is shown
  // A set is what you take to a gig. One holding a whole 4,000-song book is no
  // use for that and takes seconds to open, so past this many it starts off.
  const [makeSetChoice, setMakeSet] = useState(null);
  const makeSet = makeSetChoice ?? !(songs && songs.length > SET_DEFAULT_MAX);
  const [setName, setSetName] = useState(() => (fileName || '').replace(/\.pdf$/i, ''));

  const defaults = useMemo(
    () => new Set((songs || []).map((s, i) => (s.inLibrary || s.noChords || s.pictureOnly ? -1 : i)).filter(i => i >= 0)),
    [songs]);
  const chosen = picked ?? defaults;
  const toggle = useCallback((i) => setPicked(prev => {
    const next = new Set(prev ?? defaults);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  }), [defaults]);
  const all  = () => setPicked(new Set((songs || []).map((s, i) => (s.pictureOnly ? -1 : i)).filter(i => i >= 0)));
  const none = () => setPicked(new Set());

  const panel = dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200';
  const head  = dark ? 'text-white' : 'text-gray-900';
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const rule  = dark ? 'border-gray-800' : 'border-gray-100';
  const quiet = dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600';
  const n = chosen.size;
  const dupes = (songs || []).filter(s => s.inLibrary).length;
  const pictures = (songs || []).filter(s => s.pictureOnly).length;
  const saving = reading?.saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl p-5 flex flex-col gap-3 ${panel}`}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${head}`}>Songbook</h2>
          <p className={`text-sm ${muted} break-words`}>
            {songs
              ? <>Found <strong className={head}>{songs.length}</strong> song{songs.length === 1 ? '' : 's'} in “{fileName}”.{dupes ? ` ${dupes} already in your library ${dupes === 1 ? 'is' : 'are'} left unticked.` : ''}{pictures ? ` ${pictures} ${pictures === 1 ? 'is a picture' : 'are pictures'}, not text, and can’t be imported.` : ''}</>
              : saving ? <>Saving songs from “{fileName}”…</> : <>Reading “{fileName}”…</>}
          </p>
        </div>

        {!songs && (
          <div className="flex flex-col gap-1">
            <div className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <div className="h-full bg-indigo-600 transition-[width]" style={{ width: `${reading?.total ? (reading.done / reading.total) * 100 : 0}%` }} />
            </div>
            <p className={`text-xs ${muted}`}>{reading?.total ? `${saving ? 'Song' : 'Page'} ${reading.done} of ${reading.total}` : 'Opening…'}</p>
          </div>
        )}

        {songs && (
          <>
            <div className={`flex items-center gap-3 text-xs ${muted}`}>
              <button onClick={all} className="underline underline-offset-2">Tick all</button>
              <button onClick={none} className="underline underline-offset-2">Untick all</button>
              <span className="ml-auto">Tap a title to see its chart</span>
            </div>
            <ul className={`flex-1 min-h-0 overflow-y-auto border-y ${rule}`}>
              {songs.map((s, i) => (
                <SongRow key={i} i={i} song={s} ticked={chosen.has(i)} open={open === i}
                  onTick={toggle} onOpen={setOpen} head={head} muted={muted} rule={rule} dark={dark} />
              ))}
            </ul>

            <label className={`flex items-center gap-2 text-sm ${head}`}>
              <input type="checkbox" checked={makeSet} onChange={e => setMakeSet(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
              Put them in a new set
            </label>
            {makeSet && (
              <input value={setName} onChange={e => setSetName(e.target.value)} aria-label="Set name"
                className={`w-full rounded-lg px-3 py-2 text-sm border ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
            )}
          </>
        )}

        <div className="flex flex-col gap-2">
          {songs && (
            <button disabled={!n}
              onClick={() => onImport([...chosen].sort((a, b) => a - b), makeSet && setName.trim() ? setName.trim() : null)}
              className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors">
              Import {n} song{n === 1 ? '' : 's'}
            </button>
          )}
          {songs && (
            <button onClick={onKeepAsPage}
              className={`w-full py-2 text-sm font-medium rounded-xl transition-colors ${dark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
              Keep it as one PDF instead
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} className={`text-xs py-1 text-center transition-colors ${quiet}`}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}

const pages = (s) => (s.lastPage !== s.firstPage ? `pp. ${s.firstPage}–${s.lastPage}` : `p. ${s.firstPage}`);

// One song in the list. `onTick` and `onOpen` take the index, so the row's
// props stay the same from one render to the next unless the row itself changed.
const SongRow = memo(function SongRow({ i, song: s, ticked, open, onTick, onOpen, head, muted, rule, dark }) {
  const tag = s.pictureOnly ? 'Picture only' : s.inLibrary ? 'In library' : s.noChords ? 'No chords' : '';
  return (
    <li className={`border-b last:border-b-0 ${rule}`}>
      <div className="flex items-start gap-3 py-2">
        <input type="checkbox" checked={ticked} disabled={s.pictureOnly} onChange={() => onTick(i)}
          aria-label={`Import ${s.title}`} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600 disabled:opacity-30" />
        <button onClick={() => onOpen(o => (o === i ? null : i))} className="flex-1 min-w-0 text-left">
          <span className="flex items-baseline gap-2">
            <span className={`text-sm font-medium truncate ${s.pictureOnly ? muted : head}`}>{s.title}</span>
            {tag && <span className="ml-auto shrink-0 text-xs font-medium text-amber-600">{tag}</span>}
          </span>
          <span className={`block text-xs truncate ${muted}`}>
            {[s.artist, pages(s), s.youtubeUrl ? 'video' : ''].filter(Boolean).join(' · ')}
          </span>
        </button>
      </div>
      {open && s.text && (
        <pre className={`mb-2 ml-7 max-h-60 overflow-auto text-xs leading-snug whitespace-pre-wrap font-mono ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{s.text}</pre>
      )}
    </li>
  );
});
