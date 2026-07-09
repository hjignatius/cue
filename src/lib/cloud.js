import { supabase } from './supabase.js';

// All Supabase cloud operations live here so the rest of the app stays decoupled.

// Publish a set (and all its songs) to the cloud.
// songs must be the resolved song objects (not just IDs).
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

// Fetch a shared set by token. Works without authentication (RLS security-definer RPC).
// Returns { set, songs } or null when the token is invalid/revoked.
export async function getSharedSet(shareToken) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('get_shared_set', { share_token: shareToken });
  if (error) throw error;
  return data ?? null;
}
