# Cue

A ChordPro song sheet manager for musicians. Organize your songs into setlists, transpose on the fly, and perform in full-screen mode — all from the browser with no account required.

**Live app:** https://cue-app-nine-sigma.vercel.app

---

## Features

### Song Library
- Store unlimited songs in ChordPro format (`[Chord]` over lyrics or inline)
- Search by title or artist
- Sort by title, artist, key, or date added
- Filter by key — tap any key chip to show only songs in that key
- Single-tap a song to select it for batch export or delete
- Double-tap a song to open it in the editor

### Editor
- Full ChordPro editing with live chord preview
- **Chord display modes:** over-lyrics or inline brackets
- **View Key:** transpose the display without altering the saved text — choose any key and the chords render shifted in real time
- **Make Permanent:** writes the transposed chords back into the song text
- **Character ruler:** a passive scale above the text box — ticks every 5 columns, labels every 10, and a marked target width showing where Present wraps lyric lines. Long lines scroll horizontally rather than wrapping, and the ruler scrolls with them
- **Chord diagrams:** ukulele fingering diagrams (G C E A tuning) with adjustable size; supports a custom chord library
- **Tap Tempo:** tap a button in rhythm to set BPM; toggle 4/4 ↔ 3/4; preview with a metronome click
- **YouTube URL:** paste any YouTube link in the metadata bar; a YouTube button appears in the toolbar to open the embedded player in an overlay
- **Prev / Next navigation:** when a song is opened from the library list or a setlist, arrow buttons let you move between songs without going back to the library
- **Present** button launches full-screen performance mode for the current song or the full setlist

### Metadata fields
Title · Artist · Key · Tempo / BPM · Time Signature · Duration · YouTube URL

### Sets & Setlists
- Create named Sets (one per venue, event, or rehearsal)
- Drag songs within a set to reorder
- Active set loads into the Setlist panel; double-tap any song to open it
- Setlist highlight follows Prev/Next navigation in the editor
- **Present** from the setlist for a continuous full-screen show

### Present Mode
- Full-screen, distraction-free view of chord sheets
- Navigate between songs with on-screen arrows or keyboard left/right
- Edit button drops back into the editor at the current song; Save returns to presentation
- YouTube player available per song during performance

### Cloud Sync & Sharing
Optional, and off unless Supabase env vars are set. Everything above works with no account; an account is only needed to publish or pull. Sign in via **Settings → Account** (magic link — `signInWithOtp` with `shouldCreateUser: false`; accounts are provisioned in the Supabase dashboard, not by self-signup).

| Action | Control | Effect |
|---|---|---|
| **Publish** | ☁↑ on a set row | Upserts the set + its songs to the cloud (`sets`, `songs`, `set_songs`). Republish to sync later edits — an amber dot marks unpublished local changes |
| **Share** | 🔗 on a published set | Generates a private `/shared/:token` link (`crypto.randomUUID()`, 32 hex chars). Multiple links per set; each can be revoked individually |
| **Revoke** | Revoke in the Share dialog | Sets `revoked = true` on that token; the link stops resolving. Revoked links are hidden from the list |
| **Unpublish** | ☁✕ on a set row | Deletes the cloud set; `set_songs` and `set_shares` go via `ON DELETE CASCADE`, and orphaned songs are cleaned up. The local copy is untouched |
| **Pull** | ☁↓ on a set row, or in the Sets header | Brings your own cloud set back onto this device |

**Pull** matches on **set id and overwrites in place** — it's your set returning to another of your devices, deliberately unlike the shared viewer's *Copy to library*, which mints fresh ids because it's someone else's set. The Sets-header control lists your cloud sets (`listCloudSets`) for a device that has no local copy yet.

Scope of a pull: the set's name/order and the songs it references are overwritten by id; referenced songs missing locally are added; **songs outside the set are never touched** — it is never a library-wide replace. **Annotations survive** — ink lives in a separate IndexedDB store keyed by song id, and a pull only writes the `songs`/`sets` stores.

**Staleness guard** — before overwriting, Cue compares **per entity**, not in aggregate: the local set's `updatedAt` against the cloud set's `updated_at`, and each shared song id against its cloud counterpart. Aggregate max-vs-max would let a newer cloud *set row* mask an older cloud *song* and silently destroy a local edit. If anything local is newer it names it — *"This device has newer changes to: Blue Moon, Five Foot Two. Pulling will discard them. Continue?"* — and is **advisory**, not a block.

> The shared viewer (`/shared/:token`) is deliberately auth-free: it renders no sign-in affordance and passes `hideAccount` to the Settings panel. Annotations are never included in a shared set.

### Export
| Command | Output | Contents |
|---|---|---|
| Export Song (.cho) | `.cho` ChordPro file | Single song |
| Export Song (.json) | `.json` bundle | Song with all metadata and settings |
| Export Songs (.zip) | `.zip` of `.cho` files | Selected songs |
| Export Songs (.json) | `.json` bundle | Selected songs |
| Export Set (.json) | `.json` bundle | Set + all its songs + custom chords |
| Export Sets (.json) | `.json` bundle | All sets + songs + custom chords |
| Export Setlist (.csv) | `.csv` | Title, Artist, Key — one row per song |
| Export PDF | `.pdf` | Formatted chord sheet via @react-pdf/renderer |
| Backup | `.json` backup | All songs + sets + custom chords |

All export functions read fresh data from IndexedDB at export time, so recently saved changes (including YouTube URLs) are always included.

### Import
- **ChordPro files** (`.cho`, `.chopro`, `.txt`) — parses `{title:}`, `{artist:}`, `{key:}`, `{tempo:}`, `{duration:}`, `{timesig:}` directives
- **Song JSON** (`.json`, type `cue-song`) — single song with conflict prompt (overwrite / duplicate / skip)
- **Set JSON** (`.json`, type `cue-set`) — set + songs + custom chords; always imports as new entries
- **Multi-set JSON** (`.json`, type `cue-sets`) — multiple sets + songs + custom chords; prompts to **skip duplicates** (reuse existing songs by title match) or **allow duplicates** (import everything as new)
- **Backup JSON** (`.json`, type `cue-backup`) — prompts to replace library (preserves original UUIDs and timestamps) or merge: merge resolves conflicts by UUID, keeping the copy with the newer `updatedAt`; shows a summary of added / updated / unchanged records
- Multi-file import: select multiple files at once; each is processed in turn

### Onboarding Tour
A 7-step spotlight tour runs on first launch, covering the library, import, sets, setlist, and editor features. Dismissed once and never shown again (stored in `localStorage`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 8 |
| Styling | TailwindCSS 4 |
| Storage | IndexedDB via `idb` |
| PDF | `@react-pdf/renderer` v4 |
| Icons | `lucide-react` |
| Zip export | `fflate` |
| Deploy | Vercel |

### Platform-adaptive UI

Cue uses CSS pointer/hover media queries — not user-agent sniffing — to serve appropriate sizing for each input type:

| Tailwind variant | CSS | Behaviour |
|---|---|---|
| `pointer-coarse:` | `@media (pointer: coarse)` | Touch primary (phone, iPad without Pencil): 44 px+ targets, no hover reliance |
| `pointer-fine:` | `@media (pointer: fine)` | Mouse/trackpad: denser toolbar sizing (h-8/h-9), hover states meaningful |

**Convention:** write the base class at touch size (44 px), add a `pointer-fine:` shrink for desktop density.  Any button hidden by `opacity-0 group-hover:opacity-100` must also carry `pointer-coarse:opacity-100` so it remains reachable on touch.

Variants are defined in [`src/index.css`](src/index.css).

### Storage layout
| Store | Key | Contents |
|---|---|---|
| IndexedDB `songs` | song id | `{ id, metadata, text, chordStyle, diagramScale, chordPrefs, displayKey, createdAt, updatedAt }` |
| IndexedDB `sets` | set id | `{ id, name, songIds[], sortMode, createdAt, updatedAt }` |
| IndexedDB `annotations` | song id | Device-local ink strokes. **Never** exported, published, or shared; survives a cloud pull overwriting its song |
| `localStorage` | `cue_custom_chords` | Custom ukulele chord fingerings |
| `localStorage` | `cue:schema_version` | Current schema version (integer) |
| `localStorage` | `cue:onboarding_done` | Flag — tour has been seen |
| `localStorage` | `cue_prefs` | Theme and other user preferences |
| `localStorage` | `cue:draft` | In-progress editor text, written on every keystroke |
| `localStorage` | `cue:published_sets` | `{ [setId]: isoTimestamp }` — last publish/pull per set; drives the amber "unpublished changes" dot |
| `localStorage` | `cue:shared_with_me` | Bookmarked `/shared/:token` links (viewer side) |
| `sessionStorage` | `cue:setlist_selected_id` | Highlighted song in Setlist panel |
| `sessionStorage` | `cue:lib_highlighted_id` | Highlighted song in Library panel |

### Schema versioning & migrations

The current schema version is **2**. Migrations run automatically on app load, guarded by `cue:schema_version` in `localStorage`.

| Version | Change |
|---|---|
| 1 | Initial IndexedDB schema; songs and sets identified by `crypto.randomUUID()` IDs; sets reference songs by UUID in `songIds[]` |
| 2 | Added `createdAt` / `updatedAt` ISO-8601 timestamps to every song and set. Existing records are stamped at migration time using the legacy `savedAt` field where available. Backup exports include `schemaVersion`; backup merge resolves conflicts by UUID, keeping whichever copy has the newer `updatedAt`. |

---

## Development

```bash
npm install
npm run dev       # start dev server
npm run build     # production build → dist/
vercel --prod     # deploy to production
```
