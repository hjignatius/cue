// Which version of a shared song Present plays, when you have more than the
// shared one to choose from: your copy of it, or a song of your own that only
// shares its title. A matching title never makes a song yours by itself (a
// friend's arrangement is a different song), so nothing here decides for you. It
// lists what you could play and remembers what you picked.
import { normalizeTitle } from './contentHash.js';
import { isMine } from './books.js';

// What is stored for a share, per share-song id: true for your copy of that song,
// or the id of another song you picked. Absent means the shared version. It was
// once a plain list of ids, each meaning your copy.
export function readPlayChoices(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (Array.isArray(parsed)) return Object.fromEntries(parsed.map(id => [id, true]));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

// Your songs with this song's title, other than `linkedId`: My Songs first, then
// the ones in books, so a common title doesn't bury what you'd reach for.
export function sameTitleSongs(shareSong, localSongs = [], linkedId = null) {
  const title = normalizeTitle(shareSong?.metadata?.title);
  if (!title) return [];
  return localSongs
    .filter(s => s.id !== linkedId && s.id !== shareSong.id && normalizeTitle(s.metadata?.title) === title)
    .sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || (a.metadata?.artist || '').localeCompare(b.metadata?.artist || ''));
}

// The song a stored choice means now, or null for the shared version. A picked
// song you have since deleted falls back to the shared one.
export function chosenSong(choice, linked, songsById) {
  if (!choice) return null;
  if (choice === true) return linked || null;
  return songsById.get(choice) || null;
}
