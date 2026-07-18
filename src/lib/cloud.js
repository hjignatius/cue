import { supabase } from './supabase.js';

// All Supabase cloud operations live here so the rest of the app stays decoupled.
//
// ANNOTATION SAFETY: ink annotations are stored in the separate 'annotations'
// IndexedDB store and are NEVER included in song objects (see annotations.js).
// The content column below serialises song objects from the 'songs' store only,
// so annotation data can never reach the cloud through this path.

// Publish a set (and all its songs) to the cloud.
// songs must be the resolved song objects (not just IDs).
// Return the subset of `ids` that already exist in the cloud owned by a
// DIFFERENT user. publishSet upserts songs with onConflict:'id'; a foreign id
// turns the upsert into an UPDATE that the songs RLS USING policy
// (auth.uid() = owner_id) rejects ("new row violates row-level security
// policy"). Callers re-id these locally before publishing so they INSERT as the
// current user's own rows. Song ids are global but ownership is per-user, so an
// id copied/imported from another user must be replaced before it can publish.
export async function foreignOwnedSongIds(ids, userId) {
  if (!supabase || !ids?.length) return new Set();
  const { data, error } = await supabase.from('songs').select('id, owner_id').in('id', ids);
  if (error) throw error;
  return new Set((data ?? []).filter(r => r.owner_id !== userId).map(r => r.id));
}

export async function publishSet(set, songs, userId) {
  if (!supabase) throw new Error('Supabase not configured');

  // a. Upsert songs
  if (songs.length > 0) {
    const now = new Date().toISOString();
    const songRows = songs.map(s => ({
      id:         s.id,
      owner_id:   userId,
      title:      s.metadata?.title || 'Untitled',
      content:    s,                                  // full Cue-native JSON
      created_at: s.createdAt || now,
      updated_at: s.updatedAt || now,
    }));
    const { error } = await supabase.from('songs').upsert(songRows, { onConflict: 'id' });
    if (error) throw error;
  }

  // b. Upsert set
  const now = new Date().toISOString();
  const { error: setErr } = await supabase.from('sets').upsert({
    id:         set.id,
    owner_id:   userId,
    name:       set.name,
    created_at: set.createdAt || now,
    updated_at: set.updatedAt || now,
  }, { onConflict: 'id' });
  if (setErr) throw setErr;

  // c. Replace set_songs (delete then insert preserves correct ordering)
  const { error: delErr } = await supabase.from('set_songs').delete().eq('set_id', set.id);
  if (delErr) throw delErr;

  if (songs.length > 0) {
    const rows = songs.map((s, i) => ({ set_id: set.id, song_id: s.id, position: i }));
    const { error: insErr } = await supabase.from('set_songs').insert(rows);
    if (insErr) throw insErr;
  }
}

// Return all share tokens for a set (active and revoked), newest first.
export async function getShareTokens(setId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('set_shares')
    .select('token, created_at, revoked')
    .eq('set_id', setId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Create a new share token for a set. Returns the token string.
export async function createShareToken(setId) {
  if (!supabase) throw new Error('Supabase not configured');
  const token = crypto.randomUUID().replace(/-/g, '');
  const { error } = await supabase
    .from('set_shares')
    .insert({ token, set_id: setId, revoked: false });
  if (error) throw error;
  return token;
}

// Revoke a share token (sets revoked = true; does not delete the row).
export async function revokeShareToken(token) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('set_shares')
    .update({ revoked: true })
    .eq('token', token);
  if (error) throw error;
}

// Remove a set from the cloud and clean up orphaned songs.
// set_songs and set_shares are removed automatically by ON DELETE CASCADE.
// Orphaned songs = user's songs no longer referenced by any set_songs row.
export async function unpublishSet(setId, userId) {
  if (!supabase) throw new Error('Supabase not configured');

  // Delete the set row — CASCADE handles set_songs and set_shares
  const { error: setErr } = await supabase
    .from('sets')
    .delete()
    .eq('id', setId)
    .eq('owner_id', userId);
  if (setErr) throw setErr;

  // Find all songs owned by this user
  const { data: songRows, error: fetchErr } = await supabase
    .from('songs')
    .select('id')
    .eq('owner_id', userId);
  if (fetchErr) throw fetchErr;
  if (!songRows || songRows.length === 0) return;

  const userSongIds = songRows.map(r => r.id);

  // Of those, find which are still referenced in any set_songs row
  // (the CASCADE above already removed rows for the deleted set)
  const { data: stillReferenced, error: refErr } = await supabase
    .from('set_songs')
    .select('song_id')
    .in('song_id', userSongIds);
  if (refErr) throw refErr;

  const referencedIds = new Set((stillReferenced ?? []).map(r => r.song_id));
  const orphanIds = userSongIds.filter(id => !referencedIds.has(id));

  if (orphanIds.length > 0) {
    const { error: delErr } = await supabase
      .from('songs')
      .delete()
      .in('id', orphanIds);
    if (delErr) throw delErr;
  }
}

// List the signed-in user's cloud sets, newest first. Feeds the pull picker on a
// device that has no local copy yet.
export async function listCloudSets(userId) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('sets')
    .select('id, name, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Fetch one cloud set and its songs, ordered by set_songs.position.
// Returns { set, songs } — songs are raw rows whose `content` holds the full
// Cue-native song object — or null when the set doesn't exist / isn't owned.
//
// Pure cloud read: this writes nothing locally. The caller applies the result
// through the storage.js API, which keeps the annotations store untouched.
export async function pullSet(setId, userId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: setRow, error: setErr } = await supabase
    .from('sets')
    .select('id, name, created_at, updated_at')
    .eq('id', setId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (setErr) throw setErr;
  if (!setRow) return null;

  const { data: links, error: linkErr } = await supabase
    .from('set_songs')
    .select('song_id, position')
    .eq('set_id', setId)
    .order('position', { ascending: true });
  if (linkErr) throw linkErr;

  const songIds = (links ?? []).map(l => l.song_id);
  let songs = [];
  if (songIds.length > 0) {
    const { data: songRows, error: songErr } = await supabase
      .from('songs')
      .select('id, content, created_at, updated_at')
      .in('id', songIds);
    if (songErr) throw songErr;
    // Re-order to match set_songs.position — .in() does not preserve order.
    const byId = new Map((songRows ?? []).map(r => [r.id, r]));
    songs = songIds.map(id => byId.get(id)).filter(Boolean);
  }

  return { set: setRow, songs };
}

// Fetch a shared set by token. Works without authentication (RLS security-definer RPC).
// Returns { set, songs } or null when the token is invalid/revoked.
export async function getSharedSet(shareToken) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('get_shared_set', { share_token: shareToken });
  if (error) throw error;
  return data ?? null;
}
