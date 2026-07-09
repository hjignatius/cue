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
- **Auto-detect key:** tap the wand icon next to the Key field to score your chords against all 24 major/minor keys and auto-fill (or show top candidates when ambiguous)
- **Chord diagrams:** guitar fingering diagrams with adjustable size; supports a custom chord library
- **Tap Tempo:** tap a button in rhythm to set BPM; toggle 4/4 ↔ 3/4; preview with a metronome click
- **YouTube URL:** paste any YouTube link in the metadata bar; a YouTube button appears in the toolbar to open the embedded player in an overlay
- **Prev / Next navigation:** when a song is opened from the library list or a setlist, arrow buttons let you move between songs without going back to the library
- **Present** button launches full-screen performance mode for the current song or the full setlist

### Metadata fields
Title · Artist · Key (with auto-detect) · Tempo / BPM · Time Signature · Duration · YouTube URL

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
- **Backup JSON** (`.json`, type `cue-backup`) — prompts to replace library or merge alongside existing data
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

### Storage layout
| Store | Key | Contents |
|---|---|---|
| IndexedDB `songs` | song id | `{ id, metadata, text, chordStyle, diagramScale, chordPrefs, displayKey, savedAt }` |
| IndexedDB `sets` | set id | `{ id, name, songIds[], sortMode, savedAt }` |
| `localStorage` | `cue_custom_chords` | Custom guitar chord fingerings |
| `localStorage` | `cue:onboarding_done` | Flag — tour has been seen |
| `localStorage` | `cue_prefs` | Theme and other user preferences |
| `sessionStorage` | `cue:setlist_selected_id` | Highlighted song in Setlist panel |
| `sessionStorage` | `cue:lib_highlighted_id` | Highlighted song in Library panel |

---

## Development

```bash
npm install
npm run dev       # start dev server
npm run build     # production build → dist/
vercel --prod     # deploy to production
```
