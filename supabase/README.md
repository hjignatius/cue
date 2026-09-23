# Supabase — what Cue uses, and what a new table needs

Cue's cloud features (publishing a set, pulling it to another device, and the
shared-set viewer) sit on one Supabase project. Everything here is **optional at
runtime** — Cue works fully offline with no account, and the cloud paths are
skipped when no key is configured.

## Tables

Four, all in `public`. Rows are keyed by Cue's own ids, so a row and the local
IndexedDB record are the same object by id.

| Table | Columns Cue reads or writes | Role |
|---|---|---|
| `songs` | `id`, `owner_id`, `title`, `content` (jsonb), `created_at`, `updated_at` | One row per synced song. `content` is the whole Cue-native song, with `ownerId` stamped in so a shared viewer can build the Storage path `{owner}/{songId}.pdf` for a PDF song's bytes. |
| `sets` | `id`, `owner_id`, `name`, `created_at`, `updated_at` | One row per published set. |
| `set_songs` | `set_id`, `song_id`, `position` | Join table holding a set's order. Rewritten wholesale on publish (delete by `set_id`, then insert). |
| `set_shares` | `token`, `set_id`, `revoked`, `created_at` | Share links. Revoking sets `revoked = true` rather than deleting, so an old link reports itself as revoked instead of 404-ing. |

**The shared viewer does not read these tables directly.** It calls the database
function `get_shared_set(share_token)` via `supabase.rpc(...)` — see
`loadSharedSet` in [`src/lib/cloud.js`](../src/lib/cloud.js). So an anonymous
visitor needs `execute` on that function, not `select` on the tables.

## Storage

PDF bytes live in the private `song-pdfs` bucket at `{owner}/{songId}.pdf`, not
in the tables. The two SQL files beside this README are its RLS policies and are
the only schema here that IS in version control:

- `stage2-shared-pdf-read.sql` — lets a shared viewer read a published set's PDF
  bytes. Owner-only read/write is untouched.
- `owner-delete-pdf-policy.sql` — lets an owner delete their own PDF objects.

Both are run once by hand in the dashboard's SQL editor.

## Adding a table — required from 2026-10-30

Supabase stopped automatically granting Data API access to new tables in
`public`. The four tables above were created before the change and keep their
grants, so **nothing in Cue is affected**. But any table added from now on is
invisible to `supabase-js` until it is granted explicitly, and the symptom is a
`permission denied` error rather than anything that reads as a missing grant.

Run this in the same step that creates the table:

```sql
grant select
  on public.your_table
  to anon;

grant select, insert, update, delete
  on public.your_table
  to authenticated;

grant select, insert, update, delete
  on public.your_table
  to service_role;
```

Drop the `anon` grant unless an anonymous visitor genuinely needs to read the
table directly. Cue's own anonymous path is the `get_shared_set` RPC, so a new
table serving shared viewers more likely wants `grant execute` on a function
than `select` to `anon`.

Grants are not RLS. A granted table is reachable by the API; RLS still decides
which rows. Both are needed.

## Known gap

The table definitions are **not in this repo** — they were created by hand in
the dashboard, and only the Storage policies above were ever written down. The
table above is reconstructed from the queries in `src/lib/cloud.js` and names
only the columns Cue touches; there may be others, and the types and constraints
are not recorded anywhere outside the dashboard.

That has been survivable because the schema is small and stable, but it means a
fresh Supabase project cannot be rebuilt from this repo — and after 2026-10-30,
rebuilding it by hand would need the grants above added manually too. Capturing
the real schema as SQL is the fix if the cloud side ever grows.
