import { useEffect, useState } from 'react';
import { listCloudSets, pullSet, toIsoTs } from '../lib/cloud.js';
import { saveSong, saveSet, newestLocalAt } from '../utils/storage.js';
import { mergeCustomChords } from '../utils/fileIO.js';
import { usePrefs } from '../context/PrefsContext.jsx';

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

// Newest modification time across a fetched cloud set and its songs. Used to
// mark the pulled set in-sync afterwards — an aggregate question, like the
// publish "stale" dot. Reuses newestLocalAt by shaping the cloud rows into the
// local {updatedAt} field names rather than duplicating the rule.
function cloudNewestAt({ set, songs }) {
  return newestLocalAt(
    { updatedAt: toIsoTs(set?.updated_at) },
    (songs ?? []).map(r => ({ updatedAt: toIsoTs(r.updated_at) })),
  );
}

// What local work would this pull destroy? Deliberately per-entity, not an
// aggregate: comparing rollup-vs-rollup lets a newer cloud SET row mask an older
// cloud SONG, silently overwriting a real local edit. Each entity is compared
// against its own counterpart.
//
// Scope follows applyPulledSet, which overwrites every song in the payload by
// id: at risk = payload songs that also exist locally (whether or not the local
// set references them). Songs only in the payload are additions and destroy
// nothing; local songs absent from the payload are never written.
//
// Strict >: equal means in-sync.
export function localChangesAtRisk(localSet, localSongs, cloudPayload) {
  const localById = new Map((localSongs ?? []).map(s => [s.id, s]));
  const songs = [];
  for (const row of cloudPayload?.songs ?? []) {
    const local = localById.get(row.id);
    if (!local) continue; // added by the pull — nothing to lose
    if (toIsoTs(local.updatedAt) > toIsoTs(row.updated_at)) songs.push(local);
  }
  const setNewer = !!localSet
    && toIsoTs(localSet.updatedAt) > toIsoTs(cloudPayload?.set?.updated_at);
  return { setNewer, songs };
}

// Advisory predicate: would pulling discard newer local work?
export function isLocalNewerThanCloud(localSet, localSongs, cloudPayload) {
  const { setNewer, songs } = localChangesAtRisk(localSet, localSongs, cloudPayload);
  return setNewer || songs.length > 0;
}

// Names what's at risk, e.g. "Blue Moon, Five Foot Two".
function describeRisk({ setNewer, songs }) {
  const titles = songs.map(s => s.metadata?.title?.trim() || 'Untitled');
  const shown = titles.slice(0, 5);
  const extra = titles.length - shown.length;
  let list = shown.join(', ');
  if (extra > 0) list += `, +${extra} more`;
  if (list && setNewer) return `${list}, and this set's name or song order`;
  if (list) return list;
  return "this set's name or song order";
}

// Write a fetched cloud set into the local stores, through the storage.js API.
//
// Merge rule (deliberately unlike the shared viewer's "Copy to library", which
// mints fresh ids because it copies someone else's set): this is the user's own
// set returning to their own device, so it matches on id and overwrites in
// place. Songs the set references are overwritten by id or added; local songs it
// does not reference are left alone — the pull is scoped to this one set and is
// never a library-wide replace.
//
// The annotations store is never touched. Annotations are device-local and keyed
// by song id, and saveSong only writes the 'songs' store, so a song overwritten
// here keeps its annotations attached.
export async function applyPulledSet({ set, songs }, localSongIds) {
  let added = 0, overwritten = 0;
  const songIds = [];
  const incomingCustoms = [];

  for (const row of songs) {
    const c = row.content ?? {};
    if (Array.isArray(c.customChords)) incomingCustoms.push(...c.customChords);
    await saveSong({
      id: row.id,
      metadata: c.metadata,
      text: c.text,
      chordStyle: c.chordStyle,
      previewMode: c.previewMode,
      diagramScale: c.diagramScale,
      chordPrefs: c.chordPrefs,
      displayKey: c.displayKey,
      copiedFrom: c.copiedFrom,
      createdAt: toIsoTs(row.created_at),
      updatedAt: toIsoTs(row.updated_at),
    });
    if (localSongIds.has(row.id)) overwritten++; else added++;
    songIds.push(row.id);
  }

  // Merge any custom chord shapes the published songs carried, so this device can
  // render them (dedupes against the local library by name+frets).
  if (incomingCustoms.length) mergeCustomChords(incomingCustoms);

  // preserveTimestamps keeps the cloud's updated_at rather than stamping now(),
  // so the pulled copy reads as in-sync instead of instantly stale.
  await saveSet({
    id: set.id,
    name: set.name,
    songIds,
    sortMode: 'custom',
    createdAt: toIsoTs(set.created_at),
    updatedAt: toIsoTs(set.updated_at),
    preserveTimestamps: true,
  });

  return { added, overwritten };
}

export default function PullSetDialog({ setId = null, localSets, localSongs, userId, onPulled, onClose }) {
  const { theme } = usePrefs();
  const dark = theme === 'dark';

  // picker | loading | confirm | running | success | error
  const [phase, setPhase]   = useState(setId ? 'loading' : 'picker');
  const [errMsg, setErrMsg] = useState('');
  const [cloudSets, setCloudSets] = useState([]);
  const [fetched, setFetched]     = useState(null);   // { set, songs }
  const [summary, setSummary]     = useState(null);

  useEffect(() => {
    if (setId) fetchSet(setId);
    else loadPicker();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPicker() {
    setPhase('picker');
    setErrMsg('');
    try {
      setCloudSets(await listCloudSets(userId));
    } catch (err) {
      setErrMsg(err.message || 'Failed to load cloud sets.');
      setPhase('error');
    }
  }

  async function fetchSet(id) {
    setPhase('loading');
    setErrMsg('');
    try {
      const data = await pullSet(id, userId);
      if (!data) {
        setErrMsg('That set is no longer in the cloud.');
        setPhase('error');
        return;
      }
      setFetched(data);
      setPhase('confirm');
    } catch (err) {
      setErrMsg(err.message || 'Failed to fetch the set.');
      setPhase('error');
    }
  }

  async function run() {
    setPhase('running');
    setErrMsg('');
    try {
      const localSongIds = new Set(localSongs.map(s => s.id));
      const result = await applyPulledSet(fetched, localSongIds);
      setSummary(result);
      // Mark the set as in-sync as of what we just wrote, so the publish "stale"
      // dot stays off until the next local edit.
      onPulled?.(fetched.set.id, cloudNewest);
      setPhase('success');
    } catch (err) {
      setErrMsg(err.message || 'Pull failed. Please try again.');
      setPhase('error');
    }
  }

  // ---- Staleness guard — advisory only; the user can proceed ------------------
  const localSet     = fetched ? localSets.find(s => s.id === fetched.set.id) : null;
  const cloudNewest  = fetched ? cloudNewestAt(fetched) : '';
  const localIsNewer = fetched ? isLocalNewerThanCloud(localSet, localSongs, fetched) : false;
  const riskText     = localIsNewer ? describeRisk(localChangesAtRisk(localSet, localSongs, fetched)) : '';

  const h2    = `text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`;
  const sub   = `text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const em    = `font-medium ${dark ? 'text-gray-200' : 'text-gray-800'}`;
  const panel = `w-80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`;
  const wide  = `w-96 max-h-[80vh] flex flex-col rounded-2xl shadow-2xl ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`;
  const btnIndigo = `w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors`;
  const btnAmber  = `w-full py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-colors`;
  const btnGhost  = `text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`;

  const dismissable = phase !== 'running';

  // Picker gets its own wider panel
  if (phase === 'picker') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className={wide} onClick={e => e.stopPropagation()}>
          <div className={`px-6 pt-5 pb-4 shrink-0 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h2 className={h2}>Pull a set from the cloud</h2>
            <p className={`text-xs mt-0.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
              Overwrites the local copy if you already have one.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}
            {cloudSets.length === 0 ? (
              <p className={`text-sm text-center py-6 ${sub}`}>No sets in the cloud yet.</p>
            ) : (
              cloudSets.map(cs => (
                <button
                  key={cs.id}
                  onClick={() => fetchSet(cs.id)}
                  className={`w-full text-left rounded-xl p-3 border transition-colors ${dark ? 'border-gray-700 bg-gray-800/50 hover:border-indigo-600' : 'border-gray-200 bg-gray-50 hover:border-indigo-400'}`}
                >
                  <p className={`text-sm font-medium truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{cs.name}</p>
                  <p className={`text-[10px] mt-1 ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
                    Updated {fmtDate(cs.updated_at)}
                    {localSets.some(s => s.id === cs.id) ? ' · already on this device' : ''}
                  </p>
                </button>
              ))
            )}
          </div>
          <div className={`px-6 py-4 shrink-0 border-t ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <button onClick={onClose} className={btnGhost}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={dismissable ? onClose : undefined}
    >
      <div className={panel} onClick={e => e.stopPropagation()}>
        {phase === 'loading' && (
          <div className="text-center py-2"><p className={sub}>Fetching from cloud…</p></div>
        )}

        {phase === 'confirm' && fetched && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className={h2}>{localSet ? 'Overwrite local set?' : 'Add set to this device?'}</h2>
              <p className={sub}>
                <span className={em}>"{fetched.set.name}"</span>{' '}
                {localSet
                  ? <>will be replaced with the cloud copy ({fetched.songs.length} {fetched.songs.length === 1 ? 'song' : 'songs'}). Songs outside this set are not affected.</>
                  : <>will be added with {fetched.songs.length} {fetched.songs.length === 1 ? 'song' : 'songs'}.</>}
              </p>
            </div>
            {localIsNewer && (
              <div className={`rounded-xl p-3 text-xs ${dark ? 'bg-amber-950/40 border border-amber-800/60 text-amber-200' : 'bg-amber-50 border border-amber-300 text-amber-800'}`}>
                This device has newer changes to: <span className="font-medium">{riskText}</span>. Pulling will discard them. Continue?
              </div>
            )}
            <div className="flex flex-col gap-2">
              <button onClick={run} className={localIsNewer ? btnAmber : btnIndigo}>
                {localIsNewer ? 'Pull anyway' : localSet ? 'Overwrite local copy' : 'Add to device'}
              </button>
              <button onClick={onClose} className={btnGhost}>Cancel</button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <div className="text-center py-2"><p className={sub}>Pulling…</p></div>
        )}

        {phase === 'success' && summary && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className={h2}>Pulled</h2>
              <p className={sub}>
                <span className={em}>"{fetched.set.name}"</span> is up to date on this device.
                <span className="block mt-1">
                  {[
                    summary.overwritten ? `${summary.overwritten} song${summary.overwritten > 1 ? 's' : ''} updated` : null,
                    summary.added ? `${summary.added} added` : null,
                  ].filter(Boolean).join(', ') || 'No songs in this set.'}
                </span>
              </p>
            </div>
            <button onClick={onClose} className={btnIndigo}>Done</button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className={h2}>Pull failed</h2>
              <p className={sub}>{errMsg}</p>
            </div>
            <div className="flex flex-col gap-2">
              {fetched && <button onClick={run} className={btnIndigo}>Try again</button>}
              <button onClick={onClose} className={btnGhost}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
