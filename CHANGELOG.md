# Changelog

All notable user-facing changes to Cue. The running version is shown under the
"Cue" title on the Library screen and is defined by `version` in `package.json`.

## v1.5.12 — 2026-09-05

- **Fixed: "N.C." (No Chord) turning into a C chord.** When a no-chord marker
  (`N.C.`, `NC`, `(nc)`, and the like) shared a chord line with real chords,
  converting chords-above-lyrics to brackets split it and kept only the "C",
  leaving a bogus C chord. These markers are now preserved intact.

## v1.5.11 — 2026-09-05

- **Condense is now reliable and instant — and always keeps the chorus cue.**
  The repeat-collapsing is done in code instead of by the AI, so it no longer
  varies run to run. It keeps a repeated chorus once and marks each later repeat
  with a one-line **(Chorus)** cue (so you always know to sing it), collapses
  back-to-back identical lines with **(x2)**, and only touches *exact* repeats —
  never changing a chord or word. **Expand** writes every cue back out in full.
  (Collapses sections that are separated by blank lines.)

## v1.5.10 — 2026-09-05

- **Condense keeps every chorus cue.** When Condense collapses a repeated
  chorus, it now reliably leaves a one-line **Chorus** marker at each spot it
  recurs — so the performer still sees where to sing it, instead of the repeats
  vanishing. (Strengthened the instructions so a run can't silently drop them.)
- **"Try again — smarter" now works on the in-place tools too.** After **Clean
  up formatting**, **Detect structure**, or **Condense**, an escalate link
  appears next to the status message that re-runs it on the more capable model.
  Handy when a fast-model pass isn't quite right — the in-place tools previously
  had no way to escalate.

## v1.5.9 — 2026-09-04

- **Fixed: Present's duration readout could be minutes off, and differ between
  devices.** The auto-scroll speed tweak (F/S) was saved per-device and applied
  to the duration shown at the bottom of Present, so a device where you'd nudged
  the speed showed a drifted time (the same song read differently on your Mac vs
  iPad). Speed now always starts neutral per song, so the readout matches the
  song's own duration; commit a lasting pace per song with **Save M:SS** as before.
- **Library AI menu.** The Library header's **AI** button now opens a menu with
  **Suggest songs to learn** and **Find duplicates** (finds the same song saved
  twice — spelling/variant aware — with a per-song Delete). Music taste and a
  **Personalize from my library** switch live in Settings → AI. Removed the
  symbol picker from the song-search box (it belongs in the editor).

## v1.5.8 — 2026-09-04

- **Suggest songs to learn.** A new **Suggest** button in the Library header
  recommends real songs to learn next — matched to your instrument, your Playing
  level, and your music taste, and skipping songs already in your library. Each
  pick shows why it fits, a difficulty note, and a link to a real chord source.
- **Music taste in Settings.** A new **Music taste** section (Settings → AI) —
  tap genre chips (Rock, Country, Bluegrass, …) and optionally list favourite
  artists. All optional; with nothing set, suggestions lean on your library.

## v1.5.7 — 2026-09-04

- **New AI tools for song structure.**
  - **Condense (fit to page)** shrinks a long song toward one or two pages —
    converts to compact inline brackets, keeps a repeated chorus once and
    references it later, and collapses back-to-back identical lines with an
    `(x2)` marker, without changing a chord or word. The song then displays in
    this compact form; **Expand** (appears once condensed) writes it back in full.
  - **Detect structure** labels the sections (Verse 1, Chorus, Bridge, …) by
    inserting header lines — never touching a chord or lyric, never changing your
    chord format, and keeping any labels you already added.
  - Both sit in the AI menu, after Clean up formatting.

## v1.5.6 — 2026-09-03

- **Plainer sharing words + a clearer "unsent changes" signal.** The set menu's
  cryptic **Overwrite** is now **Get latest from cloud** (it pulls the cloud copy
  down onto this device), and **Unpublish** is now **Stop Sharing Set**. The tiny
  colour-dots and their legend are gone: a shared set now says its status in
  words on its row — `· Shared`, amber `· changes not sent` (with an amber set
  name) when you have edits you haven't republished, or red `· newer version in
  cloud` when another device is ahead.

## v1.5.5 — 2026-09-03

- **The "from a share" dot turns amber once you've edited your copy.** A song you
  copied from a shared set shows a green link dot; edit it and the dot goes amber,
  so you can tell at a glance which of your shared copies you've personalised.

## v1.5.4 — 2026-09-03

- **Sort a shared set A–Z too.** The shared-set window now has the same
  **Original order / A–Z** toggle as your own setlists — handy for finding a
  song in a big shared collection. It's view-only: it changes how the list and
  Present are ordered here, never the publisher's set.

## v1.5.3 — 2026-09-03

- **Switch a set between its own order and A–Z — without losing your order.**
  Sorting a set alphabetically is now a non-destructive *view*: your hand-built
  order (handy for a big "collection" like every Beatles song) is kept, and
  tapping **Custom** restores it exactly. Previously A–Z overwrote the order for
  good.
- **Shared sets: you choose the version to play.** The follow-along control now
  reads **Following Shared Set** (default — plays the publisher's version of every
  song) or **Including Songs You Edited** (plays your own versions where you have
  them). A song's amber Present circle marks *"you have your own version of this
  one"*; the toggle decides which actually plays, so tapping a song no longer
  forces your copy.

## v1.5.2 — 2026-09-03

- **Follow along with your own copies — now it works, and it's obvious.** Editing a
  song you'd copied from a share used to quietly sever its tie to the original, so
  Present would fall back to the publisher's version even when you asked for yours.
  That link is now kept through every edit. The old checkbox is now an **amber
  "Follow along with your copy"** button, and in the song list any song you've
  edited shows an **amber Present** circle — tap it to play *your* edited, annotated
  version full-screen (even without flipping the whole-set toggle). Songs you
  haven't changed stay on the shared version.

## v1.5.1 — 2026-09-03

- **Kinder behaviour when the network is down.** Cloud actions no longer hang on a
  stalled connection (the shared-set open and the pull/share reads now time out),
  and when something can't reach the cloud you get a plain message — "You appear
  to be offline. Reconnect to the internet and try again." — instead of a spinner
  or a vague error. The rest of Cue (library, editor, Present, your saved songs
  and sets) keeps working offline as before.
- **Update from a share always writes the current sheet.** When you Update a PDF
  song, Cue re-fetches the latest PDF before saving it (falling back to the cached
  copy if you're offline), so an updated lead sheet is never stale.

## v1.5.0 — 2026-09-03

- **Update copies from a shared set.** Once you've copied a shared set, the
  **Copy** button becomes a status: **Up to date** when your copies match the
  share, or **Update** when the publisher has changed it since. **Update** opens a
  per-song list where you choose **Update / Skip** for changed songs and
  **Add / Skip** for new ones, then refreshes your copies **in place** and
  reconciles the set's song order — without ever touching songs you made
  yourself. A content **baseline** captured at copy time distinguishes the
  publisher's edits from your own, so a song you've edited is flagged and never
  overwritten without warning (choose Skip to keep yours).

## v1.4.3 — 2026-09-03

- **Present panel — clearer, snappier controls.**
  - **F / S** (scroll faster/slower) now swing **±20%** per press (was ±10%), and a
    brief **"Scroll 120%"** readout floats above the panel so the change is visible.
  - **Reliable tap feedback:** A−/A+, Prev/Next and F/S now flash on tap (driven
    from the click, so it registers on iPad where CSS `:active` didn't). A−/A+
    also show a **"Text 30px"** readout.
  - **Count-in** now pulses once per beat across the two-bar count (using the
    song's tempo/time signature), so it reads as a deliberate count, not a flicker.
  - **Bottom row** replaces the clipped "Duration …" with **"Save M:SS"** (own song,
    speed changed) or just the time — and shared songs show the time too.

## v1.4.2 — 2026-09-02

- **"Try again — smarter model" on more AI actions.** The on-demand Opus retry now
  also appears on **Transposing advice**, **Fill in song details**, and **Add
  missing chord shapes** — the judgment/accuracy-heavy actions where a stronger
  model most helps. Clean-up and Find keep the fast default only.

## v1.4.1 — 2026-09-02

- **AI: Strumming pattern.** A one-tap action in the AI menu suggests a strumming
  (or picking) pattern for the song as text (D/U/x/-), matched to the time
  signature, tempo, instrument and your playing level.
- **AI: "Try again — smarter model."** When an Ask/Strumming answer looks off, a
  button re-runs it on the more capable model (Opus) — on demand only, so the
  everyday default stays the fast, cheaper model.

## v1.4.0 — 2026-09-02

- **Chords as diagrams ("Imbed").** A per-song **Imbed** toggle — boxed with the
  Format button, Over-Lyrics only — replaces the chord *names* above the lyrics
  with their chord *diagrams* (Doctor-Uke style). It shows in the editor
  **Preview**, in **Present** (diagrams scale with the font), and in **single-song
  PDF export**. Wide screens only (Mac/PC/iPad/tablet). Undefined chords fall back
  to the name; custom shapes and each chord's selected voicing are honored
  everywhere.
- **Readable chord color.** A default black chord color now renders **white on a
  dark theme** (and white → black on light) so chords and diagrams never disappear
  into the background — across the editor, both chord panels, and Present. PDFs
  print **black & white**.
- **Fix:** embedded diagrams now use your **custom** shapes and chosen voicings,
  not just the built-ins; and PDF page breaks no longer split a diagram line
  across two pages.

## v1.3.2 — 2026-09-01

- **AI "Clean up formatting" preserves musical notation.** It no longer strips
  slash chords / rhythm slashes (`/`), strum arrows (`↓ ↑`), bar lines, repeats,
  and other marks — and it's fed your **Ω symbol palette** as an explicit
  keep-list, so your acceptable characters always survive. It now only removes
  obvious website clutter and leaves content alone.
- **Ω symbol palette on Library search.** An **Ω** button beside the song search
  lets you insert palette characters (`° ♭ ↓ /` …) straight into a search — no
  more copy-pasting them from a song, which was the only way on iPad.

## v1.3.0 — 2026-08-31

- **AI assistant (optional, bring-your-own-key).** A new **AI** menu in the editor
  and a matching button on the setlist, powered by Claude. It's opt-in: add your
  own Anthropic API key in **Settings → AI** (stored only on this device, never in
  exports/backups), pick a **Playing level** (Beginner–Pro), and the greyed AI
  button lights up. Editor actions: **Find music online** (instrument-aware web
  search for chord sources), **Clean up formatting** (tidies a pasted chart
  without changing chords/lyrics), **Fill in song details** (title/artist/key/
  tempo/duration + a real YouTube link), **Add missing chord shapes** (proposes
  voicings for undefined chords, shown as diagrams, added to your custom library
  on approval), **Transposing advice** (key/capo suggestions with one-tap Apply),
  and **Ask about music…** (a streaming Q&A pop-up). Setlist actions: **Suggest
  set order** (with Apply) and **Estimate set time** (a reasoned breakdown —
  music, gaps, break, top/tail — that fills unknown song lengths). Runs on your
  own API account; nothing runs or is charged without a key.

## v1.2.11 — 2026-08-31

- **Email a song or set.** New **Share… (email .json)** option in the Library and
  Sets export menus. On iPad, Android tablets, Windows Chrome and Mac Safari it
  opens the share sheet so you can pick Mail — the `.json` is attached and the
  subject filled in. On browsers that can't share a file it stays hidden and the
  plain `.json` download is used instead.

## v1.2.10 — 2026-08-31

- **Faster updates.** Cue now re-checks for a new version whenever it returns to
  the foreground (reopened from the background / window refocused), so the
  "Update Cue" prompt appears promptly instead of possibly waiting up to a day.

## v1.2.9 — 2026-08-31

- In a shared set, each song's key is now labelled simply **"Key"** (was "View
  key") — the key you play it in.

## v1.2.8 — 2026-08-31

- **Pasting a share code saves it.** Opening a set from Sets → "Paste a share
  link" now bookmarks it automatically under **Shared with me** and takes you
  straight in — no separate bookmark step.

## v1.2.5–v1.2.7 — 2026-08-30

- **Shared-link landing screen.** Opening a share link now first offers **Continue
  to set** (follow along in the browser) or the set's **code with Copy** (to save
  it in your own Cue). Skipped once you've continued or bookmarked it.
- **Roomier editor on phones.** Present, Find, Save and Revert collapse to icons,
  Display shows "FP", and the format toggle sits inline on the compact toolbar.

## v1.2.3–v1.2.4 — 2026-08-30

- **New selection UX.** The "Select" mode is gone — every song and set row has a
  checkbox that's always visible, with a select-all checkbox and an "N selected"
  clear. Row taps keep their old job (highlight / open the ⋮ menu, or activate a
  set). Export moved up beside New Song / New Set; a new **Checked** sort floats
  ticked rows to the top.

## v1.2.0–v1.2.2 — 2026-08-30

- **Share PDFs across people.** A shared set's PDF lead sheets now come through to
  whoever opens the link (and copying the set brings the PDFs into their library),
  not just to your own other devices. Publishing re-uploads any missing bytes,
  unpublishing cleans them up, and PDFs work in Safari Private Browsing.

## v1.1.0 — 2026-08-30

- **Scrollable PDFs + Full Page mode.** A per-song **Full Page** toggle: off (the
  default) scrolls; on shows discrete full pages. PDFs can scroll like text songs.
- **Chords for PDFs.** Type the chords used into a PDF song and its chord diagrams
  appear (toggle on/off); the diagrams stay at the printed key.
- **Annotate PDFs.** The ink overlay now works over PDF lead sheets in Present.
- **Pedal mode is a global setting.** "Foot pedal advances by Screen / Songs"
  lives in Settings; the per-song **Full Page** toggle handles page turns.
- **Editor rework.** "View Key" is now **Transpose**; the two format buttons
  merged into one **Format** control that also auto-senses on paste; **Transpose
  source** bakes the transpose into the text.
- **PDF-safe backups.** Backup/Restore now includes PDF bytes.

## v1.0.10 — 2026-08-29

- **Fix: deleting a set works again.** A coding error introduced with the
  unpublish-before-delete step (v1.0.8) made the Delete button do nothing for
  every set. Deleting sets — published or not — now works as expected.

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
