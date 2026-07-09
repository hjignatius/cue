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

// Fetch a shared set by token. Works without authentication (RLS security-definer RPC).
// Returns { set, songs } or null when the token is invalid/revoked.
export async function getSharedSet(shareToken) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('get_shared_set', { share_token: shareToken });
  if (error) throw error;
  return data ?? null;
}
