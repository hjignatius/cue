// Which version of a shared song Present plays (Howard, 2026-11-10). Two
// questions, kept apart: WHICH COPY of yours is "yours" for this song — your
// copy of it, or a song of your own that only shares its title — and whether
// Present plays yours or the shared one, which is the TV arrow. A matching title
// never makes a song yours by itself (a friend's arrangement is a different
// song), so nothing here decides for you. It lists what you have and remembers
// what you picked.
import { contentHash, normalizeTitle } from './contentHash.js';
import { isMine } from './books.js';

// What is stored for a share, per share-song id: { pick, play, kept }.
//   pick  true for your copy of that song, or the id of another song of yours
//   play  'mine' or 'share': the way the TV arrow points
//   kept  the shared version's hash when you chose to keep yours over a newer
//         one, so the question isn't asked again until it changes again
// Once a plain list of ids, then { id: true | localId }, each meaning that song
// of yours, playing.
export function readPlayChoices(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    const old = (v) => (v === true || typeof v === 'string' ? { pick: v, play: 'mine' } : v);
    if (Array.isArray(parsed)) return Object.fromEntries(parsed.map(id => [id, { pick: true, play: 'mine' }]));
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).map(([id, v]) => [id, old(v)]).filter(([, v]) => v && typeof v === 'object'));
  } catch { return {}; }
}

// The other songs of yours you might play instead, leaving out `linkedId`: any
// with this title, however they got here, and any that came from this song or
// that it came from, even under a new title. My Songs first, then the ones in
// books, so a common title doesn't bury what you'd reach for.
export function otherVersions(shareSong, localSongs = [], linkedId = null) {
  const title = normalizeTitle(shareSong?.metadata?.title);
  const related = (s) => (title && normalizeTitle(s.metadata?.title) === title)
    || s.copiedFrom?.songId === shareSong.id
    || (shareSong.copiedFrom?.songId && s.id === shareSong.copiedFrom.songId);
  return localSongs
    .filter(s => s.id !== linkedId && s.id !== shareSong.id && related(s))
    .sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || (a.metadata?.artist || '').localeCompare(b.metadata?.artist || ''));
}

// The song a stored choice picked, or null. A picked song you have since
// deleted counts as no pick.
export function chosenSong(choice, linked, songsById) {
  const pick = choice?.pick;
  if (!pick) return null;
  if (pick === true) return linked || null;
  return songsById.get(pick) || null;
}

// The copy of yours that is "yours" for a shared song: the one you picked, or
// your copy of it when that is the only song of yours there is. null asks.
export function pickedCopy(choice, linked, others = [], songsById = new Map()) {
  return chosenSong(choice, linked, songsById) || (linked && !others.length ? linked : null);
}

// Which way the TV points: at yours only when there is a copy picked. Stored,
// or else at yours when it is the same as the shared one (nothing to lose and
// your ink to gain), and at the shared one when they differ, as before.
export function playsMine(choice, picked, same) {
  if (!picked) return false;
  return choice?.play ? choice.play === 'mine' : same;
}

// The dates can say who moved: the copy's copiedAt against when the publisher
// last saved the song and when you last saved yours. They are the two devices'
// own clocks, and a local save that changed nothing still counts as yours — but
// every mistake that makes lands on 'conflict', which asks rather than takes.
// `unsure` marks a difference neither date explains, so the wording can stop
// claiming you both changed it. For copies made before they carried a baseline.
const SAVED_WITH_THE_COPY_MS = 60_000;   // a copy's own save lands a moment after copiedAt
export function legacyCopyState(local, shareSong, same) {
  if (same) return { state: 'uptodate', unsure: false };
  const copied = Date.parse(local.copiedFrom?.copiedAt);
  const theirsAt = Date.parse(shareSong.updatedAt), yoursAt = Date.parse(local.updatedAt);
  if ([copied, theirsAt, yoursAt].some(Number.isNaN)) return { state: 'conflict', unsure: true };
  const theirs = theirsAt - copied > SAVED_WITH_THE_COPY_MS;
  const yours = yoursAt - copied > SAVED_WITH_THE_COPY_MS;
  if (theirs && !yours) return { state: 'update', unsure: false };
  if (yours && !theirs) return { state: 'uptodate', unsure: false };   // only you changed it, as with a baseline
  return { state: 'conflict', unsure: !(theirs && yours) };
}

// Where a copy stands against the shared song it came from: 'same', 'mine'
// (only you changed it), 'newer' (only the share did) or 'both' — or null for a
// song that didn't come from it.
//
// YOUR ORIGINAL counts too: a song with the shared song's own id is the one you
// published, or a restore of it — your own set opened through its link on
// another device. Howard changed Governors Jam V on the Mac, republished, and
// the iPad, holding the originals, had no way to take the new versions. With no
// baseline, the dates say which side moved: the shared one saved later is
// 'newer', otherwise it's 'mine'.
export function copyStanding(copy, shareSong) {
  if (!copy || !shareSong) return null;
  if (copy.id === shareSong.id) {
    if (contentHash(copy) === contentHash(shareSong)) return 'same';
    return Date.parse(shareSong.updatedAt) - Date.parse(copy.updatedAt) > SAVED_WITH_THE_COPY_MS ? 'newer' : 'mine';
  }
  if (copy.copiedFrom?.songId !== shareSong.id) return null;
  const incoming = contentHash(shareSong), here = contentHash(copy);
  const base = copy.copiedFrom.baseline;
  if (base == null) {
    const { state } = legacyCopyState(copy, shareSong, incoming === here);
    return state === 'update' ? 'newer' : state === 'conflict' ? 'both' : incoming === here ? 'same' : 'mine';
  }
  if (incoming === base) return here === base ? 'same' : 'mine';
  return here === base ? 'newer' : 'both';
}

// Whether the shared song is newer than the copy picked, and you haven't said
// to keep yours over this version of it.
export function newerThan(copy, shareSong, choice) {
  const standing = copyStanding(copy, shareSong);
  return (standing === 'newer' || standing === 'both') && choice?.kept !== contentHash(shareSong) ? standing : null;
}
