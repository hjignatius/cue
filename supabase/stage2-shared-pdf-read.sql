-- Stage 2: let a SHARED viewer read a published set's PDF bytes.
--
-- Run this ONCE in the Supabase dashboard (SQL editor). It ADDS read access on
-- the private `song-pdfs` bucket; owner-only read/write is untouched.
--
-- WHY a SECURITY DEFINER function (not an inline subquery): a Storage RLS policy
-- is evaluated AS THE VIEWER (anon). A shared viewer can't read set_songs /
-- set_shares directly (their RLS is owner-scoped — that's why get_shared_set is
-- also SECURITY DEFINER), so an inline subquery returns nothing and the policy
-- denies every read (surfacing as "Object not found"). The definer function
-- below runs with owner privileges, so the membership check actually sees the
-- rows. Access is still gated: only songs in a set with a non-revoked share
-- token pass, and unpublishing revokes it.

-- 1. Membership check: is this song in a set that still has a live share link?
create or replace function public.is_song_in_shared_set(p_song_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from set_songs ss
    join set_shares sh on sh.set_id = ss.set_id
    where sh.revoked = false
      and ss.song_id::text = p_song_id
  );
$$;

grant execute on function public.is_song_in_shared_set(text) to anon, authenticated;

-- 2. The Storage read policy calls the definer function. The object key is
--    {owner_id}/{songId}.pdf, so storage.filename(name) = "{songId}.pdf".
drop policy if exists "read pdfs of shared sets" on storage.objects;

create policy "read pdfs of shared sets"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'song-pdfs'
    and public.is_song_in_shared_set(
      regexp_replace(storage.filename(name), '\.pdf$', '')
    )
  );

-- To remove later:
--   drop policy "read pdfs of shared sets" on storage.objects;
--   drop function public.is_song_in_shared_set(text);
