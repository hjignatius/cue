-- Cue's Supabase schema — RECONSTRUCTED, NOT AUTHORITATIVE.
--
-- ============================================================================
-- READ THIS BEFORE RUNNING ANY OF IT
--
-- The live schema was created by hand in the Supabase dashboard and has never
-- been in version control. This file is rebuilt from the queries in
-- src/lib/cloud.js: it names the columns Cue actually reads and writes, and
-- guesses their types. There may be columns Cue never touches, constraints and
-- defaults that are not here, and RLS policies that differ from the ones below.
--
-- So this is DOCUMENTATION — the shape of what Cue expects — and a starting
-- point if the project ever has to be rebuilt. It is not a migration, and
-- running it against the live project is not what it is for.
--
-- TO MAKE IT AUTHORITATIVE, paste these into the dashboard's SQL editor and
-- replace the guesses below with what comes back:
--
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--    order by table_name, ordinal_position;
--
--   select tablename, policyname, cmd, roles, qual, with_check
--     from pg_policies where schemaname = 'public' order by tablename;
--
--   select p.proname, pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'get_shared_set';
--
-- GRANTS ARE NOW REQUIRED. Since 2026-10-30 Supabase no longer grants Data API
-- access to new tables in `public` automatically. The four tables below were
-- created before that and keep their grants, so nothing in Cue is affected —
-- but anything rebuilt from this file needs the grants that follow each table,
-- or supabase-js gets `permission denied` rather than anything that reads as a
-- missing grant. See README.md.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- songs — one row per synced song.
--
-- `content` is the whole Cue-native song as JSON, with `ownerId` stamped in so
-- a shared viewer can build the Storage path {owner}/{songId}.pdf for a PDF
-- song's bytes. saveSong drops that field on any pull or copy.
-- ---------------------------------------------------------------------------
create table if not exists public.songs (
  id          uuid primary key,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Untitled',
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.songs enable row level security;

-- Inferred from cloud.js: every songs query filters on owner_id, and the
-- anonymous shared-viewer path goes through get_shared_set() instead.
create policy "owner reads own songs"   on public.songs for select using (auth.uid() = owner_id);
create policy "owner writes own songs"  on public.songs for insert with check (auth.uid() = owner_id);
create policy "owner updates own songs" on public.songs for update using (auth.uid() = owner_id);
create policy "owner deletes own songs" on public.songs for delete using (auth.uid() = owner_id);

grant select, insert, update, delete on public.songs to authenticated;
grant select, insert, update, delete on public.songs to service_role;
-- No `anon` grant: an anonymous visitor reaches shared content through the
-- get_shared_set RPC, never by selecting from this table.

-- ---------------------------------------------------------------------------
-- sets — one row per published set.
-- ---------------------------------------------------------------------------
create table if not exists public.sets (
  id          uuid primary key,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.sets enable row level security;

create policy "owner reads own sets"   on public.sets for select using (auth.uid() = owner_id);
create policy "owner writes own sets"  on public.sets for insert with check (auth.uid() = owner_id);
create policy "owner updates own sets" on public.sets for update using (auth.uid() = owner_id);
create policy "owner deletes own sets" on public.sets for delete using (auth.uid() = owner_id);

grant select, insert, update, delete on public.sets to authenticated;
grant select, insert, update, delete on public.sets to service_role;

-- ---------------------------------------------------------------------------
-- set_songs — a set's order. Rewritten wholesale on publish: delete by set_id,
-- then insert, which is what keeps `position` contiguous.
-- ---------------------------------------------------------------------------
create table if not exists public.set_songs (
  set_id    uuid not null references public.sets (id) on delete cascade,
  song_id   uuid not null references public.songs (id) on delete cascade,
  position  integer not null,
  primary key (set_id, song_id)
);

alter table public.set_songs enable row level security;

-- Membership is owned through its set: this table has no owner_id of its own.
create policy "owner manages own set_songs" on public.set_songs for all
  using (exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid()));

grant select, insert, update, delete on public.set_songs to authenticated;
grant select, insert, update, delete on public.set_songs to service_role;

-- ---------------------------------------------------------------------------
-- set_shares — share links.
--
-- Revoking sets `revoked = true` rather than deleting the row, so an old link
-- can report itself as revoked instead of 404-ing. One set may have several
-- rows; getShareToken takes the OLDEST unrevoked one, which is what keeps a
-- set's share code stable across republishes.
-- ---------------------------------------------------------------------------
create table if not exists public.set_shares (
  token       text primary key,
  set_id      uuid not null references public.sets (id) on delete cascade,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.set_shares enable row level security;

create policy "owner manages own set_shares" on public.set_shares for all
  using (exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sets s where s.id = set_id and s.owner_id = auth.uid()));

grant select, insert, update, delete on public.set_shares to authenticated;
grant select, insert, update, delete on public.set_shares to service_role;

-- ---------------------------------------------------------------------------
-- get_shared_set(share_token) — the anonymous read path.
--
-- THE BODY IS NOT RECORDED ANYWHERE IN THIS REPO. What is known from the
-- caller (getSharedSet in src/lib/cloud.js) is its name, its single text
-- argument, and that it returns { set, songs } as JSON, or null for a token
-- that is invalid or revoked.
--
-- It must be SECURITY DEFINER: that is the whole point of it. An anonymous
-- visitor has no select grant on the tables above, so the function reads them
-- on the caller's behalf and returns only the one set the token names.
--
-- Recover the real definition with the pg_get_functiondef query at the top of
-- this file before relying on the sketch below.
--
--   create or replace function public.get_shared_set(share_token text)
--     returns jsonb language plpgsql security definer set search_path = public as $$
--     ... find the unrevoked share, then its set and that set's songs in
--         position order, and return them as { set, songs } ...
--   $$;
--
-- grant execute on function public.get_shared_set(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
--
-- PDF bytes live in the private `song-pdfs` bucket at {owner}/{songId}.pdf, not
-- in these tables. Its policies ARE in version control, beside this file:
--   stage2-shared-pdf-read.sql   — a shared viewer reads a published set's PDFs
--   owner-delete-pdf-policy.sql  — an owner deletes their own PDF objects
-- ---------------------------------------------------------------------------
