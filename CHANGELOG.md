# Changelog

All notable user-facing changes to Cue. The running version is shown under the
"Cue" title on the Library screen and is defined by `version` in `package.json`.

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
