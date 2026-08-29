# Changelog

All notable user-facing changes to Cue. The running version is shown under the
"Cue" title on the Library screen and is defined by `version` in `package.json`.

## v1.0.9 — 2026-08-29

- **Fix: deleting a set works again.** The delete confirmation is now an in-app
  window instead of the system pop-up, which the installed app on iPad/iPhone
  was suppressing — so the delete silently did nothing. Deleting a set (and the
  unpublish-first step for a shared set) now completes as expected.

## v1.0.8 — 2026-08-29

- **Unpublish a shared set before deleting it.** Deleting a published (shared)
  set now opens a window explaining it must be unpublished first, with an
  **Unpublish** button right there — so deleting a set can't leave a live share
  link stranded. Unpublished sets delete as before.

## v1.0.7 — 2026-08-29

- **One share link per set.** Sharing a set now always shows a single link —
  creating it the first time and reusing it after — so a set can no longer
  accumulate multiple links. "Stop sharing" turns the link off (reversible);
  sharing again mints a fresh single link.

## v1.0.6 — 2026-08-28

- **Fix: "Add to Set" now always asks which set.** It previously could add
  songs to whichever set was active in the background rather than the one you
  meant — surfacing as a confusing "already in <other set>". Now it always opens
  the set picker, and both messages name the exact set you chose
  ("Added N songs to …" / "… is already in …").

## v1.0.5 — 2026-08-27

- **PDF lead-sheet songs.** Import a PDF (e.g. a jazz chart that can't be typed
  as ChordPro) as a song and present it fit-to-page, turning pages with the tap
  zones or a foot pedal. Songs now carry a per-song **Foot pedal turns**
  setting (Pages vs Songs). PDFs sync to your own devices; sharing PDFs with
  other users is coming next.
- **Page turn size** gains a **3/4** option — Full / 3/4 / 1/2 (was Full / Half).
- **Chords:** recognizes more spellings — `A7aug`/`aug` and `dim` after a
  degree, and the `+` / `°` symbols. Previously one such chord turned its whole
  chord line to plain text.
- **Fix:** creating a **New Set** now selects it, so adding a song right after
  no longer lands it in the previously-active set (which showed as a confusing
  "already in <other set>").

## v1.0.4 — 2026-08-25

- **Half-page turns in pedal paging mode.** A new **Page turn size** choice
  (Settings → Present: Full page / Half page) sets how far each Next / Previous
  press moves — a whole screen or half a screen. Half page reuses the same glide
  setting. Default is Full page.

## v1.0.3 — 2026-08-25

- **Smooth page turns in pedal paging mode.** Within-song page turns can now
  glide to the next screen instead of jumping. A **Page turn glide** slider
  (Settings → Present, 0–2000 ms, default 550) sets the speed — 0 is an instant
  jump. Crossing into a new song stays an instant cut, and two quick presses
  still advance two full screens.

## v1.0.2 — 2026-08-25

- **Page-turner pedal support.** Bluetooth page-turner pedals (which pair as
  keyboards) now drive Present mode with no setup — Next is → / ↓ / Page Down,
  Previous is ← / ↑ / Page Up, and a held pedal turns one page, not several.
- **Pedal paging mode** (Settings → Present, off by default). When on, Next /
  Previous page through the current song by a screenful (with a small overlap)
  instead of skipping songs, advancing to the next/previous song only at a
  song's bottom/top; auto-scroll is turned off in this mode. The mode also
  applies to the on-screen ◀ / ▶ and the keyboard, not just a pedal.
- **Share links** are safer against mistakes: Copy is a clear primary button,
  and Revoke sits apart and now takes a second confirming tap.
- **Shared-set header** shows the Cue app icon (tap to open Cue) in place of
  the plain "Cue" text.

## v1.0.1 — 2026-08-23

- **Settings — clearer labels.** The **Exports** section is now marked
  **(Chrome Only)**, since its save-to-folder option only exists in Chromium
  desktop browsers. **Account** is renamed **Cloud Account (Optional)** so it no
  longer implies an account is required to use Cue. **Accidentals** is renamed
  **Sharps / Flats** to match the buttons beneath it.
- **Documentation.** The in-app manual now covers the multi-instrument chord
  diagrams (Ukulele / Baritone / Guitar) and offline use / updates, and no
  longer references the removed auto-detect-key ("wand") feature.

## v1.0.0 — 2026-08-22

- First official release.
- **Multi-instrument chord diagrams** — choose Ukulele (GCEA), Baritone (DGBE),
  or Guitar (6-string EADGBE) in Settings, with a per-instrument custom chord
  library.
- Full ChordPro editing, View Key transposition, sets & setlists, Present mode,
  PDF/JSON/ChordPro export, optional cloud sharing, and offline support.
