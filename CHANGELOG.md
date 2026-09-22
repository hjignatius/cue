# Changelog

All notable user-facing changes to Cue. The running version is shown under the
"Cue" title on the Library screen and is defined by `version` in `package.json`.

## v1.6.0 — 2026-09-22

- **Present's tools moved into the floating panel.** The fixed column of buttons
  down the left edge needed about 490px, and a phone in landscape has 400–440 —
  so the bottom tools fell off the screen. The panel now has a Controls / Tools
  selector at the top and holds both sets, and because it's draggable the tools
  can also be pulled clear of the dynamic island, which a fixed column never
  could. Exit stays pinned in the top-left corner: it's the only pointer route
  out of Present, so it never moves.
- **Lyrics and PDFs no longer run under the chord panel.** The content area now
  stops where the panel starts instead of being covered by it. A PDF had no
  horizontal scroll to give, so its right edge was simply hidden.
- **Opening the chord panel shrinks the type instead of re-wrapping it.** The
  column and the font scale together, so the characters-per-line count is
  unchanged and every line break stays where it was — the page just gets
  smaller. Annotations scale with it. On a phone in portrait there isn't room to
  split the screen, so the panel floats over the lyrics there as before.
- **Each song now gets a column as wide as it actually needs**, rather than a
  fixed 65 characters. A narrow song was being given a column two-thirds empty
  and capped at a smaller font than it had any need for; on an iPad a
  45-character song could only reach about font 24 and can now reach the full
  34. Wide songs are unchanged. Nothing re-wraps: the column is never narrower
  than the song's longest line.
- **Present from the Library now walks the library.** Next/Previous move through
  the list in the order and filter you're looking at, starting from the song you
  picked, the same way presenting from a setlist has always worked. Previously
  Present was handed that one song and the buttons did nothing.
- **Fixed: editing from Present could open the wrong song.** Every other route
  into the editor remounts it; this one didn't, so a still-mounted editor kept
  whatever song it first opened with. It was showing the earlier song *and* had
  that song's text loaded, so a save would have written it over the newer song.
- **The floating panel keeps its bottom row on screen.** Its edge margin now
  gives way when the panel is taller than the viewport allows, instead of
  holding position and letting the Save speed row hang off the bottom.

## v1.5.44 — 2026-09-22

- **The Library / Sets / Setlist pill sits further from the bottom edge**, clear
  of the iOS home-indicator bar. It had been relying on the safe-area inset for
  most of that gap, and the inset went to zero when the rotation bug was fixed
  in 1.5.43. The gap is now a fixed amount that doesn't depend on the insets, so
  it can't quietly collapse again. List padding moved with it, so the last row
  still clears the pill.

## v1.5.43 — 2026-09-22

- **Fixed: buttons didn't respond where you tapped them after rotating the
  phone.** On iOS 27, rotating the device left every control's touch area about
  one button away from where it was drawn — you had to press above or below it,
  depending on which way you'd turned the phone. Pinch-zooming cleared it until
  the next rotation. It affected the home-screen app on both Safari and Chrome;
  the same page in a normal browser tab was always fine.
  Cue was giving iOS two contradictory instructions about the strip of screen
  around the Dynamic Island, and iOS 27 resolved them inconsistently. Removed.
- A small visible consequence: the app no longer draws underneath the Dynamic
  Island and home indicator, so there's a narrow band along those edges in the
  app's own colour. A fair trade for buttons that work where you press them.

## v1.5.42 — 2026-09-21

- **A wrapped line is now indented**, so the continuation reads as the rest of
  the line above rather than as a new lyric line — the way a hymnal or a printed
  lead sheet does it. Easy to misread mid-song otherwise. Applies in Present and
  in exported PDFs, in both Over Lyrics and Brackets. A line that fits is
  untouched.

## v1.5.41 — 2026-09-21

- **Shared sets now open without a connection.** A set someone shared with you
  needed the network *every single time* — so at a venue with no signal, a set
  you'd opened twenty times simply wasn't there. Every time you open one it's
  now saved on your device. With no connection it opens straight away, with a
  banner saying which day's copy you're looking at and a **Retry** button for
  when the signal comes back. PDF lead sheets come through too, provided they
  finished downloading the first time.
- Two things deliberately still need the network: a set the publisher has
  **unshared** shows as unavailable rather than reappearing from your device,
  and pulling updates needs the cloud by definition.

## v1.5.40 — 2026-09-21

- **Fixed: long lines could split a word in half.** When a line was too wide for
  the screen, Cue broke it wherever a *chord* happened to sit — and chords are
  written inside words all the time. A line like `It was a won[G]derful night`
  could come out as "It was a won" / "derful night". Lines now break **between
  words only**, with each chord kept welded to the syllable it sits above, so
  `won[G]derful` stays in one piece wherever the break lands.
- **Exported PDFs had the same fault and are fixed too** — they used the same
  layout, so printed set sheets could split words the same way.
- A stretch with no spaces in it that's wider than the screen still can't be
  broken anywhere; that one is unavoidable.

## v1.5.39 — 2026-09-21

- **The two order toggles are now sliding pills**, matching the panel switchers
  in the editor and the Library: the Setlist's **Custom / A–Z**, and the shared
  set's order toggle. Same control, same behaviour, wherever you meet it.
- In a shared set, **Original order** is now just **Original**.

## v1.5.38 — 2026-09-21

- **"Fill in song details" now shows what it would change, not just what it
  found.** If the song already has a Key of G and Cue suggests Am, the row reads
  **G → Am** rather than a bare *Am* you'd have to remember the old value to
  judge. Same for Title, Artist, Time signature, Tempo and Duration. A blank
  field still just shows the suggestion — filling a gap isn't a replacement —
  and a row that agrees with your song still reads **Matches**.
- **YouTube is the exception**, since two links either side of an arrow are
  unreadable at that width. A suggestion that would replace an existing link
  says **"replaces the current link"** underneath instead.

## v1.5.37 — 2026-09-21

- **Fixed: "Try again — smarter" stayed on screen after you'd saved.** Run an
  in-place AI tool like **Clean up formatting**, save the result, and the retry
  link kept sitting beside the **AI** button for the rest of the session — an
  offer to redo something you'd already accepted. Saving now clears it, along
  with the "review, then Save" status line, which has just been obeyed.
  **Revert** clears them too: the result the offer pointed at is gone either
  way.

## v1.5.36 — 2026-09-20

- **A shared set now tells you what to do, not what happened.** "· changes not
  sent" becomes **· SEND CHANGES**, and "· newer version in cloud" becomes
  **· GET NEWER** — both in bold capitals so they read at a glance.
- **Amber is gone.** It washed out badly on a bright screen; the send-changes
  label now uses the same strong colour as the set name, and **GET NEWER** stays
  red. They keep different colours deliberately: sending is your own work
  waiting, while getting is somebody else's work that could overwrite yours.
- **The set name no longer changes colour**, so indigo once again means only
  "this is the set you're working on" — an active set and an unsent one used to
  look the same.
- **The ⋮ menu points at the right item.** **Republish** turns bold when you
  have changes to send, and **Get latest from cloud** turns bold when the cloud
  is ahead, so the menu reads as a recommendation rather than six equal options.

## v1.5.35 — 2026-09-20

- **Choose which model the AI runs on.** Settings → AI has a new **Model**
  setting: **Balanced** (the default, unchanged from before) or **Best** — the
  most capable model, slower and several times the cost per request. Every AI
  action bills your own Anthropic account, so the trade is yours to make.
  Nothing changes unless you pick Best.
- **"Try again — smarter" now follows your setting.** It re-runs a single answer
  one step above whatever you've chosen. On **Best** there's nothing above it,
  so the link no longer appears at all — previously it would have re-run an
  identical request and charged you again for the same answer.
- The setting is named by what you want rather than by model name, so a model
  being retired can't strand it — and an unrecognised saved value quietly falls
  back to Balanced instead of breaking every AI action. A cheaper tier is
  planned for when Cue can offer a genuinely free one.

## v1.5.34 — 2026-09-20

- **Fixed: "Add missing chord shapes" claimed your chords were already covered
  when it had simply failed.** Ask it for a stretch of extended chords —
  `Cm11`, `Fm11`, `F#m7b5`, `A7#5#9` — and if the AI returned nothing, Cue said
  *"All set — nothing left to add"*, which reads as "those chords are fine" when
  it means the opposite. It now names the chords it couldn't voice, and the
  **Try again — smarter model** button appears in that state too. Previously
  that button only showed when shapes *had* been found, so the one case where
  escalating actually helps was the one case with no way forward.
- **And it should refuse far less often.** The instruction told it to omit any
  chord it couldn't voice — and on a 4-string ukulele an 11th chord has more
  notes than strings, so it took that option. It's now told what players
  actually do: drop the 5th, then the root or 9th, and keep the 3rd, 7th and any
  named alteration.

## v1.5.33 — 2026-09-20

- **AI is back for PDF songs — the parts of it that apply.** The AI menu was
  hidden entirely on a PDF lead sheet. The tools that *research* a song work
  perfectly well on one, because they go by its title and any chords you typed
  rather than by reading the sheet: **Fill in song details**, **Find music
  online**, **Add missing chord shapes**, **Strumming pattern** and **Ask about
  music** are all available now. The tools that *rewrite chart text* stay greyed
  out, since a PDF has none — **Clean up formatting**, **Detect structure** and
  **Condense** — and so does **Transposing advice**, whose suggestions are
  applied by transposing, which a PDF deliberately ignores.
- **Fill in song details can now work from just a title.** It used to refuse
  outright when there was no chart text, which is the normal state of a PDF
  song. It now identifies the song from its title instead, and researches the
  key as a fact about the recording rather than trying to read it off chords
  that aren't there. **Add missing chord shapes** still waits until you type
  some chords — there's nothing to look up before that.

## v1.5.32 — 2026-09-20

Settings had grown to six sections and eighteen controls, all permanently open.
This shortens it three ways.

- **Present's own settings now live in Present.** Controls fade delay, scroll
  start delay, count-in sound/visual and pedal paging (with page turn size and
  glide) moved to a **gear** in Present's tool tray — tap the wrench in the left
  gutter, then the gear. You can now set them while watching what they do,
  instead of guessing a glide in milliseconds from a settings screen. They are
  still global settings applying to every song; nothing you had set has changed.
- **Settings sections collapse, and show their values when shut.** Each row
  reads its own current setting — *Dark · Auto*, *GCEA Ukulele*, *Key saved ·
  Intermediate* — so the closed panel is still a complete picture of how Cue is
  set up, and you open a section only to change something. One opens at a time.
  Tapping a greyed-out **AI** button still lands you straight on the AI section.
- **Better grouping.** Chord instrument, colour and label size split out of
  Appearance into their own **Chords** section, and the single-row Exports and
  Cloud Account sections merged into **Data & Account**.

(v1.5.30 and v1.5.31 were withdrawn — the first broke Present, and this release
replaces both.)

## v1.5.29 — 2026-09-20

- **Fixed: "Fill in song details" looked like it had changed things it hadn't.**
  A suggestion that simply agreed with what your song already had was shown as
  greyed-out **Applied** — the same as one you'd actually applied. On a
  **Try again — smarter model** run this was especially misleading, because a
  better answer is more likely to land on the values you already have, so
  several rows would grey out at once and the whole dialog read as though it had
  quietly edited the song. It hadn't: nothing is ever written without tapping
  **Apply** or **Apply all**. Those rows now read **Matches**, meaning the song
  already has that value — which is the tool confirming your work, not changing
  it. The buttons below no longer claim **All applied** or **Done** for a run
  that changed nothing.

## v1.5.28 — 2026-09-19

- **Time signatures beyond 4/4 and 3/4.** The Tempo row's 4/4 ↔ 3/4 toggle is
  now a picker: **4/4, 3/4, 2/4, 2/2, 6/8, 9/8, 12/8, 5/4, 7/8**. A signature
  that came in from an imported file is shown as-is and left alone, instead of
  being flipped to 4/4 the first time you touched the control.
- **The count-in counts the pulse you feel.** Compound signatures group in
  threes, so **6/8 counts 2 to the bar, 9/8 counts 3, 12/8 counts 4** — twelve
  clicks would be no use to play to. In those signatures the Tempo you enter is
  that pulse, not the eighth note. 4/4 and 3/4 are unchanged.
- **"Fill in song details" now researches the time signature too**, alongside
  key, tempo and duration. If it isn't reasonably sure it leaves the field
  blank rather than falling back to 4/4 — a confident wrong metre is worse than
  none, since it's what the count-in plays.

## v1.5.27 — 2026-09-19

- **Cue now says plainly that AI can be wrong.** While an AI action is thinking,
  the waiting message carries a short caution, and the results that state
  something checkable carry it too — the songs found online, suggested chord
  shapes, songs to learn, the set-time estimate, and the duplicate groups (where
  a wrong match would have you delete a song you meant to keep). Worded the same
  everywhere, kept small, and left off the results that are plainly opinions —
  suggested set order, strumming, transposing advice.

## v1.5.26 — 2026-09-19

- **Fixed: editing a song didn't move its set under Newest.** Sorting the Sets
  list by **Newest** (or **Oldest**) ranked each set only by when the set itself
  was last changed — renamed, or songs added or removed. Editing a song's
  details and saving changed the *song*, so the set it belongs to stayed put,
  however recently you'd worked on it. Both sorts now rank a set by the most
  recent change to the set **or any song in it**, which is how Cue already
  decides a published set has "changes not sent".

## v1.5.25 — 2026-09-19

- **"Fill in song details" now asks first.** Choosing it opens a window showing
  what the song already has — Title, Artist, Key, Tempo, Duration and YouTube,
  with blanks marked *empty* — each with a tick box, all ticked to start.
  Untick anything you'd rather keep as it is and Cue looks up **only** what's
  ticked, then shows what it found for you to apply as before. Asking for just
  the Key no longer does a web search at all, since the key is read from the
  chords.
- Replaces the tick boxes added to the *results* in 1.5.24 — choosing up front
  means Cue never goes looking for something you didn't want in the first place.

## v1.5.24 — 2026-09-19

- **Choose which suggested details to apply.** Every row in **Fill in song
  details** now has a tick box, all ticked to start. Untick the ones you don't
  want — a YouTube link you'd rather pick yourself, say — and the button applies
  only what's left, naming the count (**Apply 4 selected**). Each row still has
  its own **Apply**, which stays the quickest way to take just one.
- The button beside it turns blue and reads **Done** as soon as nothing further
  will be applied — whether that's because everything is applied, or because
  what remains is unticked on purpose.

## v1.5.23 — 2026-09-19

- **AI tools now retry a dropped connection instead of giving up.** An AI
  request that failed to reach Anthropic at all — the "the request didn't
  complete (Failed to fetch)" message — was reported straight to you on the
  first try, even though Cue already retried Anthropic's own "busy" responses
  twice. A dropped connection is the more transient of the two, and is the
  likely reason this turned up on a second identical request: the reused
  connection had quietly been closed at the other end. Cue now retries these the
  same way, so most of them recover without you seeing anything. If you're
  offline it still says so straight away rather than retrying pointlessly.

## v1.5.22 — 2026-09-19

- **"Fill in song details" now shows when there's nothing left to apply.**
  After **Apply all**, that button stayed bright blue as though it still had
  work to do. It now reads **All applied** and greys out — the same way each
  individual **Apply** button already became **Applied** — and the button beside
  it turns blue and reads **Done**, since closing is the only thing left. (It
  stays **Close** until then: leaving early doesn't apply anything.) Edit one of
  the fields afterwards and **Apply all** comes back.

## v1.5.21 — 2026-09-19

- **AI errors now say what actually went wrong.** When an AI tool couldn't reach
  Anthropic, Cue always showed the same sentence — "check your connection" —
  whether you were offline, the request was blocked, or the connection dropped.
  The real reason was thrown away and never recorded. Being offline is now named
  as such, the message carries the underlying reason, and the full error is
  written to the browser console so a recurring problem can actually be traced.
- **Fixed: AI errors were invisible on a phone.** The status line was hidden on
  narrow screens, so a failed AI action simply stopped with nothing on screen.
  It now shows in both layouts.

## v1.5.20 — 2026-09-18

- **Fixed: the white highlight on the panel switcher didn't line up with its
  label.** On the iPhone editor (**Text / Preview / Chords**) and the
  Library / Sets / Setlist pill, the sliding white highlight sat up to 16px off
  the word it was meant to be behind, and could hang past the end of the track.
  The segments were each sizing to their own label — "Library" is wider than
  "Sets" — while the highlight always moved in exact thirds. All segments are
  now equal width, so the highlight lands on its label every time. The pill is
  a little wider as a result, since every segment now matches the longest word.

## v1.5.19 — 2026-09-16

- **QR code for a share link.** The Share dialog has a new **Show QR code**
  button under the link. Anyone in the room can point a phone camera at it to
  open the set, instead of you reading a link out loud. The code is generated
  on your device — nothing is sent anywhere to make it — and it works offline.
  It stays black-on-white even in dark mode, because that is what phone
  cameras can reliably read.
- **Save the QR code as a PDF.** Under the code is a **Save as PDF** button: a
  one-page sheet with the set name, a large code, and the link written out
  underneath. Print it and prop it on a stand or pin it up, instead of holding
  a screen out for people to scan.

## v1.5.18 — 2026-09-11

- **Fixed: Present showed nothing for a PDF you had just loaded.** Loading a
  PDF in the editor and tapping **Present** before saving gave a blank sheet —
  Present reads the file from the song's saved copy, and there wasn't one yet.
  Present now saves the song first, so the sheet is there.
- **Fixed: a false "didn't upload" warning.** Saving a PDF loaded in the editor
  put an amber cloud icon on the Library row, claiming the file had failed to
  reach the cloud — on a song that had never been shared at all. The warning is
  gone; a replaced PDF still re-uploads the next time you publish the set.
  (A song already showing the icon clears it once you publish the set it's in,
  or if you load the PDF again with **⋯ → Replace PDF**.)

## v1.5.17 — 2026-09-11

- **PDF lead sheets now travel in song and set exports.** Exporting (or
  sharing) a song or a set as **JSON** used to write out the PDF song's title
  and nothing else — the sheet itself stayed behind, so the file landed on the
  other device as a blank song. The PDF now rides along inside the file, the
  way it already did in a full **Backup**. Those exports are correspondingly
  larger. Bundles from earlier versions still import as before.
- **Fixed: importing a song or set bundle dropped its settings.** A PDF song
  came back as an empty text song, and **Full Page**, **Imbed**, condensed
  layout and the foot-pedal setting were lost. They now survive the round trip.
- **Start a PDF song from New Song.** A blank new song offers **Load PDF** under
  the placeholder text: pick a file and it becomes a PDF song, with the sheet
  shown in the preview panel and the title filled in from the filename. No need
  to go out to **Import** and come back. The button disappears once you start
  typing.
- **Replace PDF.** A PDF song's **⋯** menu can now swap in a different file —
  a rescan, or a cleaner copy — keeping the song's title, chords, set
  membership and ink. Both this and **Load PDF** take effect on **Save**, so
  **Revert** undoes a file picked by mistake.

## v1.5.16 — 2026-09-08

- **Fixed: Delete did nothing in the installed iOS app.** Deleting songs — one
  from the duplicates list, or a whole checked batch — asked for confirmation
  through the browser's own pop-up, which the installed iOS app silently
  refuses to show. The delete then never ran and nothing on screen explained
  why. Deleting now asks in a normal Cue window, so it works everywhere.
  **Clear ink** in the editor's overflow menu had the same problem and is
  fixed the same way.
- Cancelling a delete from **Find duplicates** now leaves the song in the list,
  instead of removing the row while keeping the song.

## v1.5.15 — 2026-09-05

- **Ask about music is ready for the next question.** The question box now
  clears once you ask (and whenever you reopen Ask from the menu), so a preset
  like **Strumming pattern** no longer leaves its long request sitting in the
  box with no room to type something else.

## v1.5.14 — 2026-09-05

- **Section labels (Verse, Chorus, Bridge…) now match the lyric text size** in
  Preview, Present, and PDF, instead of rendering smaller. They stay bold and
  uppercase, just full size.

## v1.5.13 — 2026-09-05

- **Fixed: adjacent chords fusing in Over-Lyrics.** Two chords with no lyric
  between them — `[C][G]` — used to run together as `CG` on the chord line when
  a song was shown in Over-Lyrics. They now keep a space (`C G`), on both
  lyric and chord-only lines, while normally-spaced chords are unchanged.

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
