function manualHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cue — User Manual</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #1a1a1a;
    background: #fff;
    padding: 36px 48px;
    max-width: 760px;
    margin: 0 auto;
  }

  /* Cover */
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 220px;
    border-bottom: 2px solid #6366f1;
    padding-bottom: 28px;
    margin-bottom: 36px;
  }
  .cover-title { font-size: 40px; font-weight: 800; color: #6366f1; letter-spacing: -1px; }
  .cover-sub   { font-size: 18px; color: #555; margin-top: 6px; }
  .cover-meta  { font-size: 12px; color: #888; margin-top: 18px; }

  /* Headings */
  h1 { font-size: 22px; font-weight: 700; color: #111; border-bottom: 1.5px solid #e5e7eb;
       padding-bottom: 6px; margin: 32px 0 14px; page-break-after: avoid; }
  h2 { font-size: 15px; font-weight: 700; color: #374151; margin: 22px 0 8px; page-break-after: avoid; }
  h3 { font-size: 13px; font-weight: 600; color: #4b5563; margin: 16px 0 6px; page-break-after: avoid; }

  /* Body */
  p  { margin-bottom: 9px; }
  ul, ol { margin: 8px 0 10px 20px; }
  li { margin-bottom: 4px; }
  strong { font-weight: 600; }

  /* Inline code */
  code {
    font-family: 'Menlo', 'Courier New', monospace;
    font-size: 11.5px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 3px;
    padding: 1px 4px;
    color: #1a1a1a;
  }

  /* Code blocks */
  pre {
    background: #f8f9fa;
    border: 1px solid #e5e7eb;
    border-left: 3px solid #6366f1;
    border-radius: 4px;
    padding: 12px 14px;
    font-family: 'Menlo', 'Courier New', monospace;
    font-size: 11.5px;
    line-height: 1.55;
    overflow: auto;
    margin: 10px 0 14px;
    page-break-inside: avoid;
  }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; page-break-inside: avoid; font-size: 12.5px; }
  th { background: #f3f4f6; font-weight: 600; text-align: left; padding: 7px 10px;
       border: 1px solid #d1d5db; }
  td { padding: 6px 10px; border: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }

  /* Tip callout */
  .tip {
    background: #eff6ff;
    border-left: 3px solid #3b82f6;
    border-radius: 4px;
    padding: 10px 14px;
    margin: 10px 0 16px;
    font-size: 12.5px;
    page-break-inside: avoid;
  }
  .tip strong { color: #1d4ed8; }

  /* Save-as-PDF hint (screen only) */
  .save-hint {
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 28px;
    font-size: 12.5px;
    color: #3730a3;
  }
  .save-hint strong { color: #312e81; }

  /* TOC */
  .toc { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;
         padding: 18px 22px; margin-bottom: 32px; page-break-inside: avoid; }
  .toc-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 10px; }
  .toc ul { list-style: none; margin: 0; padding: 0; }
  .toc li { padding: 2px 0; }
  .toc .toc-h1 { font-weight: 600; margin-top: 6px; }
  .toc .toc-h2 { padding-left: 16px; color: #6b7280; font-size: 12px; }

  /* Print — the manual opens as its own standalone document, so there is no app
     chrome or viewport-locked (100vh / overflow) ancestor to escape here. These
     rules are defensive (in case this markup is ever embedded) and set page
     hygiene so the document flows cleanly across pages. */
  @page { margin: 1.6cm; }
  @media print {
    /* Never let any wrapper trap the flow inside a single screen-height box. */
    html, body { height: auto !important; max-height: none !important; overflow: visible !important; }
    body { padding: 0; max-width: 100%; color: #1a1a1a; background: #fff; }

    /* Keep chosen colors (indigo headings, code/table shading) in the PDF. */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    /* Screen-only chrome must not print. */
    .save-hint { display: none !important; }

    /* Start each major section on a fresh page; keep headings with their body. */
    h1 { page-break-before: always; break-before: page; }
    h1:first-of-type { page-break-before: avoid; break-before: avoid; }
    h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
    .cover { page-break-after: always; break-after: page; }
    .toc   { page-break-after: always; break-after: page; }
    tr, li { page-break-inside: avoid; break-inside: avoid; }
  }

</style>
</head>
<body>
<!-- COVER -->
<div class="cover">
  <div class="cover-title">Cue</div>
  <div class="cover-sub">User Manual</div>
  <div class="cover-meta">Chord &amp; Lyric App for Live Performance</div>
</div>

<!-- SAVE HINT (screen only) -->
<div class="save-hint">
  <strong>To save this manual as a PDF:</strong> open your browser's Print command (<strong>Cmd/Ctrl&nbsp;+&nbsp;P</strong>) and choose <strong>Save as PDF</strong> as the destination. The manual flows across multiple pages.
</div>

<!-- TOC -->
<div class="toc">
  <div class="toc-title">Contents</div>
  <ul>
    <li class="toc-h1">1. Overview</li>
    <li class="toc-h2">Offline Use &amp; Updates</li>
    <li class="toc-h1">2. Settings</li>
    <li class="toc-h2">Appearance</li>
    <li class="toc-h2">Metronome</li>
    <li class="toc-h2">Account</li>
    <li class="toc-h1">3. The Library</li>
    <li class="toc-h2">Song List, Search &amp; Filter</li>
    <li class="toc-h2">Backup &amp; Restore</li>
    <li class="toc-h2">Importing Songs</li>
    <li class="toc-h2">Select Mode</li>
    <li class="toc-h1">4. Sets &amp; Setlist</li>
    <li class="toc-h2">Creating &amp; Managing Sets</li>
    <li class="toc-h2">Adding Songs to a Set</li>
    <li class="toc-h2">Sets Select Mode</li>
    <li class="toc-h2">Searching &amp; Sorting Sets</li>
    <li class="toc-h2">The Setlist Column</li>
    <li class="toc-h1">5. The Editor</li>
    <li class="toc-h2">Metadata Bar</li>
    <li class="toc-h2">Text Editor &amp; Chord Formats</li>
    <li class="toc-h2">Styling Lyrics</li>
    <li class="toc-h2">Toolbar Controls</li>
    <li class="toc-h2">Annotation Overlay</li>
    <li class="toc-h2">Find &amp; Replace</li>
    <li class="toc-h2">Saving &amp; Exporting</li>
    <li class="toc-h2">PDF Export &amp; Chord Charts</li>
    <li class="toc-h1">6. Chord Diagram Sidebar</li>
    <li class="toc-h2">Adding Custom Chord Shapes</li>
    <li class="toc-h2">Exporting &amp; Importing Custom Chords</li>
    <li class="toc-h1">7. Present Mode</li>
    <li class="toc-h2">Top Bar Controls</li>
    <li class="toc-h2">The Floating Control Panel</li>
    <li class="toc-h2">Annotations</li>
    <li class="toc-h2">Count-In</li>
    <li class="toc-h2">Auto-Scroll</li>
    <li class="toc-h2">Navigating a Set</li>
    <li class="toc-h2">Page-Turner Pedals</li>
    <li class="toc-h2">Editing During Performance</li>
    <li class="toc-h1">8. AI Assistant</li>
    <li class="toc-h2">Setting Up (Your API Key)</li>
    <li class="toc-h2">In the Editor</li>
    <li class="toc-h2">In the Setlist</li>
    <li class="toc-h2">Cost &amp; Privacy</li>
    <li class="toc-h1">9. Shared Sets &amp; Cloud Sync</li>
    <li class="toc-h1">10. File Formats</li>
    <li class="toc-h1">11. Keyboard Shortcuts</li>
    <li class="toc-h1">12. Tips</li>
  </ul>
</div>

<!-- 1 -->
<h1>1. Overview</h1>
<p>Cue is a web-based chord and lyric app built for live performance. It stores songs in your browser and presents them full-screen on a TV or projector via screen mirroring. All songs and sets are stored locally on the device — no account is needed to create and perform songs.</p>
<p>Cue is designed to be fast to set up. Open it in Safari on an iPad, mirror to an Apple TV, and you are ready to go. An optional account lets you share sets with other Cue users via a private link — see <em>Shared Sets</em>.</p>
<p>Appearance preferences (theme, chord color) are controlled from the <strong>Settings</strong> panel, opened with the gear icon (⚙) in the top-right of the Library header. Settings persist in your browser and apply immediately across all views.</p>

<h2>Offline Use &amp; Updates</h2>
<p>After you have opened Cue online once, it keeps a copy of itself on the device and <strong>runs without an internet connection</strong> — your songs and sets live in the browser, so they open and edit offline too. (Publishing and viewing <em>shared</em> sets still needs a connection, since those live in the cloud.)</p>
<p>Because Cue caches itself for offline use, a new version does not always appear the instant it is released. Cue checks for an update <strong>each time you open or reload it</strong> while online, and again <strong>whenever you bring it back to the foreground</strong> (reopened from the background). When a newer version is ready, an <strong>Update Cue</strong> button appears — tap it to reload into the latest version. Until you tap it, Cue keeps running the copy you already have, so an update never interrupts a performance.</p>

<!-- 2 -->
<h1>2. Settings</h1>
<p>Tap the <strong>⚙ gear icon</strong> in the top-right of the Library header to open Settings. The same gear icon appears in the shared-set viewer. Settings are stored in your browser's local storage and apply globally — changes take effect immediately.</p>

<h2>Appearance</h2>
<table>
  <tr><th>Setting</th><th>Description</th></tr>
  <tr><td><strong>Theme</strong></td><td>Switch between <strong>Light</strong> and <strong>Dark</strong> mode. The theme applies to every view including the editor, Present mode, and the shared-set viewer.</td></tr>
  <tr><td><strong>Chord color</strong></td><td>Tap the color swatch to choose any color for chord names. Applied in the editor preview and Present mode. Default is black.</td></tr>
  <tr><td><strong>Chord label size</strong></td><td>Seven-step scale from −30% to +30% that adjusts the size of chord names above lyrics (<strong>Over Lyrics</strong> format only). The center step (0) is the default size. Has no effect on the Brackets format.</td></tr>
  <tr><td><strong>Sharps / Flats</strong></td><td>Controls how transposed chords spell the five ambiguous notes (C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭). <strong>Auto</strong> (default) matches the View Key — flat keys use flats, sharp keys use sharps; <strong>Flats</strong> and <strong>Sharps</strong> force one spelling. Whatever the mode, every chord in a transposed song is spelled consistently (no sharp/flat mix). The stored chords are never changed — this affects display only.</td></tr>
  <tr><td><strong>Chord instrument</strong></td><td>Chooses which instrument's fingering diagrams the Chords panel and PDF chord charts show: <strong>GCEA Ukulele</strong> (default), <strong>DGBE Baritone</strong>, <strong>Guitar</strong> (6-string, E A D G B E), or <strong>None</strong> to hide chord diagrams entirely. Chord <em>names</em> are the same across instruments — only the fingering changes. Your preferred voicing and any custom shapes are remembered <em>per instrument</em>, so switching instruments never disturbs another instrument's choices.</td></tr>
</table>

<h2>Metronome</h2>
<table>
  <tr><th>Setting</th><th>Description</th></tr>
  <tr><td><strong>BPM tap mode</strong></td><td><strong>Sound</strong> — plays audio clicks when you tap the BPM button in Present mode. The downbeat of each measure is a higher pitch; other beats are lower. <strong>Visual</strong> — no sound; the top bar flashes once per beat instead.</td></tr>
</table>

<h2>Account</h2>
<p>The Account section appears only when cloud sharing is configured. Enter your email address and Cue emails you a numeric code; type it into the app to sign in. The email also contains a sign-in link, which works on desktop — but on an iPhone or iPad with Cue installed to the Home Screen, use the code. A tapped link always opens in Safari, and the session it creates lives in Safari's storage, not the installed app's, so the app would still show you as signed out. Once signed in, your email is shown with a <strong>Sign out</strong> button. An account is needed only to <em>publish</em> a shared set link — viewing a shared link requires no account.</p>

<!-- 3 -->
<h1>3. The Library</h1>
<p>The Library is the home screen. It is divided into three columns: <strong>Library</strong> (songs), <strong>Sets</strong>, and <strong>Setlist</strong>.</p>

<h2>Song List &amp; Search</h2>
<p>The <strong>Library</strong> column on the left lists all your songs. Use the <strong>search bar</strong> to filter by title, artist, or key. Use the <strong>sort menu</strong> to order by:</p>
<ul>
  <li><strong>A–Z</strong> — alphabetical by title</li>
  <li><strong>Newest / Oldest</strong> — by save date</li>
  <li><strong>By Artist</strong> — groups songs under artist names; tap an artist name to see only their songs</li>
  <li><strong>By Key</strong> — groups songs under their key; tap a key name to see only songs in that key</li>
</ul>
<p><strong>Double-tap</strong> any song row to open it in the editor. Single-tap to select it for batch operations in Select mode. Tap <strong>New Song</strong> in the Library panel header to create a blank song.</p>
<p>Tap any <strong>key chip</strong> in the count bar (visible after sorting or filtering by key) to filter the list to songs in that key. A <strong>Clear key</strong> button appears to remove the filter.</p>
<p><strong>Which key the Library shows:</strong> the key beside each song title — and the key used for search, the <em>By Key</em> sort, and the key filter — is the song's <strong>View Key</strong> (the key you actually perform it in). If a song has no View Key set, its written key is used instead. So a song written in C but set to play in G shows, sorts, and is found as <strong>G</strong>. Hover the key to see the original written key when the two differ.</p>

<h2>Backup &amp; Restore</h2>
<p>Tap <strong>Backup</strong> in the top header to download a complete snapshot of your library. The backup file (<code>cue-backup-YYYY-MM-DD.json</code>) contains every song and every set in a single file — including the bytes of any <strong>PDF</strong> lead sheets, so a restore brings the PDFs back too.</p>
<p>To restore, tap <strong>Import</strong> and select a backup file. Cue asks how to handle the import:</p>
<ul>
  <li><strong>Replace library</strong> — clears all current songs and sets, then loads the backup exactly as it was. Use this when moving to a new device or doing a clean restore.</li>
  <li><strong>Merge into library</strong> — adds all songs and sets from the backup alongside what you already have. No existing data is removed; duplicate titles will appear as separate entries.</li>
</ul>
<div class="tip"><strong>Tip:</strong> Keep a dated backup before major changes or when moving to a new device. A backup file can be stored in iCloud Drive, Dropbox, or emailed to yourself for safekeeping.</div>

<h2>Importing Songs</h2>
<p>Tap <strong>Import</strong> in the top header to bring in songs from files. Supported formats:</p>
<ul>
  <li><code>.cho</code> / <code>.chopro</code> — standard ChordPro format</li>
  <li><code>.json</code> — a Cue JSON bundle (single song or full set)</li>
  <li><code>.txt</code> — plain ChordPro text saved with a .txt extension</li>
  <li><code>.pdf</code> — a PDF lead sheet, imported as a <strong>PDF song</strong> (see <em>The Editor → PDF Songs</em>)</li>
</ul>
<p>When importing a JSON set bundle, Cue brings in the set and all its songs in a single step.</p>
<p>You can select multiple files in the picker and Cue imports them all in sequence.</p>
<h3>Conflict Detection</h3>
<p>When importing a single song whose title matches one already in your library, Cue pauses and asks what to do:</p>
<ul>
  <li><strong>Overwrite existing</strong> — replaces the library version with the imported one</li>
  <li><strong>Import as duplicate</strong> — adds the imported song as a new entry alongside the existing one</li>
  <li><strong>Skip this file</strong> — discards the import and moves on to the next file</li>
</ul>
<div class="tip"><strong>Note:</strong> Conflict detection applies to individual song files (<code>.cho</code>, <code>.txt</code>, and single-song JSON bundles). When importing a <strong>multi-set JSON</strong> (<code>cue-sets</code> type), Cue asks whether to <strong>Skip duplicates</strong> (reuse existing songs that match by title, avoiding copies) or <strong>Allow duplicates</strong> (import all songs as new entries). Backup files prompt separately with Replace or Merge options.</div>

<h2>Selecting Songs</h2>
<p>Every song row has a <strong>checkbox</strong> at its left — always visible, with no "Select" mode to turn on. Tick any box and the action bar (just below the search row) lights up. Tapping a row's <em>body</em> (not the checkbox) still just highlights it, and its <strong>⋮</strong> menu carries the per-song actions (Edit, Present, Duplicate).</p>
<ul>
  <li>Tick a checkbox to select / deselect a song. The <strong>select-all checkbox</strong> on the action bar ticks or clears every listed song — so you can search or filter first (for example sort <strong>By Artist</strong> and open one artist) and then select-all to grab that whole group. "<strong>N selected · ✕</strong>" beside it shows the count and clears the selection.</li>
  <li><strong>Export ▾</strong> (in the header, beside <strong>New Song</strong>) — one song: ChordPro (<code>.cho</code>) or JSON; multiple: a ZIP of <code>.cho</code> files or a JSON bundle. Where your device can share a file (iPad, Android tablet, and most phones), a <strong>Share… (email .json)</strong> option also appears — it opens the share sheet so you can pick Mail and email the <code>.json</code> as an attachment.</li>
  <li><strong>Add to Set</strong> (on the right of the action bar) — adds the selected songs to a set (see <em>Adding Songs to a Set</em> below). If a set is active in the Sets panel the songs go straight into it; otherwise a dialog opens to create or pick one.</li>
  <li><strong>Delete</strong> — permanently removes the selected songs from the library and any sets they appear in.</li>
</ul>
<p>The <strong>Checked</strong> option in the sort menu floats ticked songs to the top as you select — handy for reviewing a large selection.</p>

<!-- 4 -->
<h1>4. Sets &amp; Setlist</h1>
<p>The <strong>Sets</strong> column (middle) lists all your sets. The <strong>Setlist</strong> column (right) shows the songs inside whichever set is currently selected.</p>

<h2>Creating &amp; Managing Sets</h2>
<p>Tap <strong>New Set</strong> in the Sets panel header, type a name, and press Enter or tap <strong>Create</strong>. You can also create a set on the fly while adding songs — see below.</p>

<h2>Adding Songs to a Set</h2>
<p>Adding songs is driven from the <strong>Library</strong> panel:</p>
<ol>
  <li>Check the songs you want (every row has a checkbox). The <strong>select-all checkbox</strong> checks every song currently listed — so you can search or filter first (for example sort <strong>By Artist</strong> and open one artist, or type an artist's name in the search bar) and then select-all to grab that whole group.</li>
  <li>Tap <strong>Add to Set</strong> on the right of the action bar.</li>
  <li>If a set is already selected in the Sets panel (highlighted in indigo), the songs are added straight to it. If no set is selected, a dialog opens: type a name and tap <strong>Create</strong> to make a new set from your selection, or tap an existing set in the list to add them there.</li>
</ol>
<p>Songs already in the target set are skipped, and Cue confirms how many were added. A song can live in any number of sets — adding it to a set never removes it from the library or from other sets.</p>
<p>Tap a set row to select it — its songs appear in the Setlist column. Tap it again to deselect.</p>
<p>To <strong>duplicate</strong> a set, tap the copy icon on its row. Cue creates a new set with the same songs under a <em>"(2)"</em> name — the songs are shared, not copied, so nothing is added to your library. The duplicate is a fresh local set: it is <em>not</em> published, even if the original was, so you can edit it and publish it separately when ready.</p>
<p>To delete a set, check its box and tap <strong>Delete</strong> (see <em>Selecting Sets</em> below). Songs stay in your library.</p>

<h2>Selecting Sets</h2>
<p>Like the Library, every set row has an always-visible <strong>checkbox</strong>. Tapping a set's <em>body</em> still <em>activates</em> it (its songs show in the Setlist, and it becomes the target for "Add to Set"); the checkbox is only for multi-select, so a set can be both active and checked. The action bar's Export and Delete light up once at least one set is checked.</p>
<ul>
  <li><strong>Select-all checkbox</strong> — ticks / clears all listed sets (respects any active search filter); "<strong>N selected · ✕</strong>" shows the count and clears it.</li>
  <li><strong>Export ▾</strong> (in the header, beside <strong>New Set</strong>) — one set or many as PDF, PDF + Chord Charts, a JSON bundle, or (single set) a Setlist <code>.csv</code>. Where your device can share a file, <strong>Share… (email .json)</strong> also appears to email the bundle as an attachment.</li>
  <li><strong>Delete</strong> (on the right of the action bar) — permanently removes the selected sets; songs stay in your library.</li>
</ul>

<h2>Searching &amp; Sorting Sets</h2>
<p>The Sets column header includes a <strong>search bar</strong> and a <strong>sort menu</strong>, matching the Library panel. Type in the search bar to filter sets by name as you type. Use the sort menu to order by:</p>
<ul>
  <li><strong>A–Z</strong> — alphabetical by set name</li>
  <li><strong>Newest</strong> — most recently created or updated first</li>
  <li><strong>Oldest</strong> — oldest first</li>
  <li><strong>Shared</strong> — only sets you've published (they carry a share link)</li>
  <li><strong>Checked</strong> — floats the sets you've ticked to the top, live as you select</li>
</ul>

<h2>The Setlist Column</h2>
<p>With a set selected, the Setlist column shows its songs. From here you can:</p>
<ul>
  <li><strong>Drag songs</strong> to reorder them using the grip handle on the left, with touch or mouse (Custom sort mode)</li>
  <li><strong>Sort A–Z</strong> — permanently sorts the set alphabetically</li>
  <li><strong>Tap any song row</strong> — selects that song (highlighted in indigo). Tap the same row again to deselect it.</li>
  <li><strong>Double-tap any song row</strong> — opens it directly in the editor. The setlist highlight follows Prev/Next navigation in the editor.</li>
  <li><strong>Present</strong> — launches Present mode starting at the selected song and continues forward through the rest of the set. Grayed out until a song is selected.</li>
  <li><strong>✎ Edit</strong> — opens the selected song in the Editor. When you return, the Library restores the same set, setlist, and selected song exactly as you left them. Grayed out until a song is selected.</li>
  <li><strong>Export ▾</strong> — export the set as: <strong>PDF</strong> (all songs as consecutive pages), <strong>PDF + Chord Charts</strong> (same, with one deduplicated chord reference page at the end), <strong>JSON bundle</strong>, or <strong>Setlist (.csv)</strong> — a comma-separated file with Title, Artist, and Key columns, one song per row</li>
  <li><strong>Trash icon</strong> — removes a song from the set without deleting it from the library</li>
</ul>

<!-- 5 -->
<h1>5. The Editor</h1>
<p>Tap a song in the Library to open it. Tap <strong>New Song</strong> in the Library panel header to start a blank song.</p>

<h2>Metadata Bar</h2>
<p>Below the header, a row of fields describes the song:</p>
<table>
  <tr><th>Field</th><th>Description</th></tr>
  <tr><td><strong>Artist</strong></td><td>Artist or band name</td></tr>
  <tr><td><strong>Key</strong></td><td>Source key — choose from 24 options covering all major and minor keys. This is the key the song is written in; use <strong>Transpose</strong> (in the toolbar) to shift the display to a different key without changing the saved text.</td></tr>
  <tr><td><strong>Tempo (BPM)</strong></td><td>Beats per minute</td></tr>
  <tr><td><strong>Tap</strong></td><td>Tap repeatedly in rhythm to measure BPM automatically</td></tr>
  <tr><td><strong>▶</strong></td><td>Plays 8 beats of audio to preview the current tempo and time signature</td></tr>
  <tr><td><strong>4/4 / 3/4</strong></td><td>Time signature for this song — stored with the song and used by the metronome in Present mode</td></tr>
  <tr><td><strong>Duration (M:SS)</strong></td><td>Song length (e.g. <code>3:30</code>) — used by auto-scroll in Present mode</td></tr>
  <tr><td><strong>Display</strong> (<strong>Full Page</strong> / <strong>FP</strong> on phones)</td><td>Off (default) = the song scrolls in Present. On = it shows as discrete full pages that fit the screen, turned one at a time. Applies to both text and PDF songs.</td></tr>
  <tr><td><strong>YouTube URL</strong></td><td>Paste any YouTube link (watch URL, short youtu.be link, or playlist link). A YouTube button appears in the editor and Present mode toolbars to open the video in an overlay player while you play along.</td></tr>
</table>
<p>The song <strong>title</strong> is edited in the large field at the top of the editor header.</p>

<h2>Text Editor &amp; Chord Formats</h2>
<p>The main area is a plain-text editor. Cue supports two chord formats:</p>
<h3>Over-lyrics</h3>
<p>Chords sit on a dedicated line above the lyrics they belong to:</p>
<pre>G          Em         C          D
Here comes the sun, little darlin</pre>

<h3>Brackets</h3>
<p>Chords are embedded inline within the lyric line:</p>
<pre>[G]Here comes the [Em]sun, [C]little [D]darlin</pre>

<p>A single <strong>Format</strong> button in the toolbar switches the whole song between the two — it converts the text and sets the preview/Present to match (on the compact phone toolbar it reads <strong>OL</strong> / <strong>B</strong>). When you <strong>paste</strong> a song into an empty editor, Cue auto-senses which format it's in and sets the button for you; an empty editor shows "<strong>Sense Chords</strong>" until there's something to detect.</p>

<h3>Imbed — chords as diagrams</h3>
<p>Boxed next to <strong>Format</strong> is an <strong>Imbed</strong> toggle (available in <strong>Over Lyrics</strong> only). Turn it on and, instead of chord <em>names</em> above the lyrics, Cue shows each chord's <em>diagram</em> — a small fingering grid — right where the chord falls, in the style of a printed uke sheet. It's a <strong>per-song</strong> setting saved with the song, and it carries into <strong>Present</strong> (where the diagrams scale up with the font) and into a <strong>single-song PDF export</strong>. It uses your instrument's library, honouring any custom shapes and the voicing you've picked for each chord in the chord panel; a chord with no shape falls back to its name. Imbed is a <strong>wide-screen</strong> feature (Mac, PC, iPad, tablets) — it's hidden on phones, where the diagrams wouldn't fit.</p>

<h2>Styling Lyrics</h2>
<p>You can color words and make them <strong>bold</strong> or <em>italic</em>. Styling applies to <em>lyrics only</em> — chords keep the single chord color set in Settings.</p>
<p>There are two styling toolbars, and both work the same way — <strong>select some text first, then tap a control:</strong></p>
<ul>
  <li><strong>B</strong> — bold, <strong>I</strong> — italic (each is a toggle: tap again on the same selection to remove it)</li>
  <li><strong>Six color swatches</strong> — red, orange, yellow, green, blue, purple. Tapping the swatch that already matches the selection <em>clears</em> its color.</li>
  <li><strong>Eraser</strong> — removes color from the selection.</li>
</ul>
<h3>Where the toolbars are</h3>
<ul>
  <li><strong>Text pane</strong> — the toolbar in the header of the text editor. Available in <em>both</em> chord formats.</li>
  <li><strong>Preview pane</strong> — a matching toolbar in the header of the live preview, so you can select the <em>rendered</em> lyrics and style them without touching the raw markup. It appears only when the editor is in <strong>Brackets</strong> format. (After you apply a style in the preview the selection clears, so to combine — say bold <em>and</em> a color — reselect between taps.)</li>
</ul>
<h3>How styling is stored</h3>
<p>Styling is saved as small markers inside the lyric text itself, which is why you'll see them in the text editor:</p>
<pre>**bold**   *italic*   {c=#dc2626}colored{/c}</pre>
<p>Because the markers live with the words, your styling survives switching between Over-lyrics and Brackets, and renders everywhere the song appears — the preview, Present mode, exported PDFs, and shared sets. The markers are only visible in the raw text editor.</p>
<div class="tip"><strong>Note:</strong> ChordPro (<code>.cho</code>) export strips these markers so other apps see clean lyrics — the exported file keeps your chords and words but not the colors or bold/italic. Cue's own JSON and Backup exports keep the styling, since they re-import into Cue. See <em>File Formats</em>.</div>

<h2>Toolbar Controls</h2>
<table>
  <tr><th>Control</th><th>What it does</th></tr>
  <tr><td><strong>Transpose</strong></td><td>Sets a saved <em>display key</em> for the song. The preview, Present mode, and the exported set PDF all render transposed to this key, without ever changing the source text or the song's real key. The Library also treats it as the song's key — it is what the key badge shows and what search, the <em>By Key</em> sort, and the key filter use. Saved with the song; choose the top option (the song's own key) to render untransposed. (This was called "View Key".)</td></tr>
  <tr><td><strong>Transpose source</strong></td><td>Bakes the current Transpose <em>into</em> the text: it rewrites the chords to the transposed key, makes that the song's Key, and clears the Transpose lens. Enabled only when a transpose is active; recoverable via <strong>Revert</strong> until you Save.</td></tr>
  <tr><td><strong>Format</strong> (<strong>OL/B</strong>)</td><td>Switches the song between Over-lyrics and Brackets (see above), for both the text and the preview.</td></tr>
  <tr><td><strong>Preview</strong></td><td>Toggles the live preview panel that renders the song with chords above lyrics.</td></tr>
  <tr><td><strong>Chords</strong></td><td>Toggles the chord diagram sidebar.</td></tr>
  <tr><td><strong>✎ Ink</strong></td><td>Shows or hides ink annotations drawn in Present mode, overlaid on the preview (read-only here). Only appears when the song has saved annotations. A <strong>Clear ink</strong> button beside it deletes them — see <em>Annotation Overlay</em> below.</td></tr>
  <tr><td><strong>Present</strong></td><td>Launches the current song in full-screen Present mode. When you arrive here via the <strong>Edit</strong> button in Present mode, this button changes to <strong>↩ Return to Performance</strong> — see <em>Editing During Performance</em> below.</td></tr>
  <tr><td><strong>← Prev / Next →</strong></td><td>Moves to the previous or next song. Appears when the editor is opened via the <strong>✎ Edit</strong> button in the Setlist column, the <strong>Edit</strong> button in Present mode, or by double-tapping a song in the Library or Setlist panel. Navigation order follows the list you opened from (or the set you were presenting). If there are unsaved changes, a confirmation dialog appears before navigating.</td></tr>
  <tr><td><strong>YouTube</strong></td><td>Opens the song's YouTube URL in an overlay player. Only shown when a YouTube URL is saved in the metadata bar. The button is grayed out if no URL is set.</td></tr>
  <tr><td><strong>✕</strong></td><td>Returns to the Library. If there are unsaved changes, a confirmation dialog appears first.</td></tr>
</table>
<div class="tip"><strong>Tip:</strong> Theme and chord color are set in the <strong>Settings</strong> panel (⚙ gear icon in the Library header) and apply globally — you do not need to change them per song.</div>
<p><strong>On a phone,</strong> the header and toolbar buttons collapse to icons to save room — <strong>Present</strong> (TV), <strong>Find</strong> (magnifier), <strong>Save</strong> (disk) and <strong>Revert</strong> (circle-arrow) — and the <strong>Format</strong> toggle moves onto the compact toolbar as <strong>OL/B</strong>.</p>

<h2>PDF Songs</h2>
<p>Import a PDF lead sheet (see <em>Importing Songs</em>) and it becomes a <strong>PDF song</strong>. The metadata bar still applies — give it a Title, Artist, Key, Tempo and so on — and the <strong>Display</strong> toggle chooses how it shows in Present (scroll through its pages, or Full Page). You don't edit the PDF's contents, but you can:</p>
<ul>
  <li><strong>Add chord diagrams.</strong> Type the chords the song uses into the text box (e.g. <code>[G] [C] [D] [Em]</code>) and their diagrams appear in the chord sidebar and over the sheet in Present, toggled on/off like any song. Because a PDF can't be transposed, its diagrams always render at the key you type — Transpose is disabled for PDFs.</li>
  <li><strong>Annotate it in Present</strong> (see below), and share it in a published set (see <em>Shared Sets</em>).</li>
</ul>

<h2>Annotation Overlay</h2>
<p>Ink drawn over a song in <strong>Present mode</strong> can be reviewed in the editor. When a song has saved annotations, an <strong>✎ Ink</strong> button appears in the toolbar:</p>
<ul>
  <li><strong>Ink</strong> — overlays the saved ink on the preview panel. The overlay is read-only here; drawing is done in Present mode. Tap again to hide it.</li>
  <li><strong>Clear ink</strong> — deletes all annotations for the song. A <em>Clear ink?</em> confirmation appears first; once cleared, both buttons disappear.</li>
</ul>
<p>The ink is drawn on the preview, so keep the <strong>Preview</strong> panel visible to see it.</p>

<h2>Find &amp; Replace</h2>
<p>Tap the <strong>Find</strong> button in the toolbar, or press <strong>Cmd+F</strong> (Mac) / <strong>Ctrl+F</strong> (PC), to open the Find &amp; Replace bar. The button highlights indigo while the bar is open. Buttons: <em>Find next</em>, <em>Replace</em> (one at a time), and <em>Replace all</em>. Press <strong>Escape</strong>, tap ✕, or tap <strong>Find</strong> again to close.</p>
<p>To search for special characters, use these escape sequences in either field:</p>
<ul>
  <li><code>\n</code> — newline (end of line)</li>
  <li><code>\t</code> — tab character</li>
</ul>
<p>For example, to remove blank lines you could replace <code>\n\n</code> with <code>\n</code>.</p>

<h2>Saving &amp; Exporting</h2>
<p>The <strong>Save</strong> button is grayed out until you make a change. Once any field is edited — lyrics, chords, title, artist, key, tempo, duration, or time signature — Save activates and turns indigo.</p>
<p>To return to the Library, tap the <strong>✕ button</strong> in the top-right corner of the editor header. If there are unsaved changes, a dialog appears with three choices:</p>
<ul>
  <li><strong>Save</strong> — saves your changes and returns to the library</li>
  <li><strong>Discard</strong> — drops changes and returns to the library</li>
  <li><strong>Keep editing</strong> — closes the dialog and stays in the editor</li>
</ul>
<p>To export a single song, enter <strong>Select mode</strong> in the Library panel, check the song, and use <strong>Export ▾</strong> to download it as ChordPro (<code>.cho</code>) or JSON. PDF export is available for full sets via the Setlist column.</p>

<h2>PDF Export &amp; Chord Charts</h2>
<p>PDF export is available from <strong>Export ▾</strong> in the <strong>Setlist column</strong>. Select a set, then choose from the Export menu:</p>
<ul>
  <li><strong>PDF</strong> — all songs in the set as consecutive A4 pages, each with title, artist, key, tempo, and chord/lyric content.</li>
  <li><strong>PDF + Chord Charts</strong> — same as above, plus a single <em>Chord Reference</em> page at the end listing every unique chord across the entire set as a fretboard diagram, drawn for the instrument chosen in <strong>Settings → Chord instrument</strong> (Ukulele, Baritone, or Guitar). Diagrams respect your preferred voicings and any custom chord shapes you have defined.</li>
  <li><strong>JSON bundle</strong> — the set and all its songs in one portable file.</li>
  <li><strong>Setlist</strong> — a plain-text numbered list of song titles, suitable for printing or sharing.</li>
</ul>
<div class="tip"><strong>Tip:</strong> The exported set PDF honors each song's View Key — every song prints in its saved display key, matching Present mode. Songs with no View Key set print in their written key. The stored chords are never changed either way.</div>
<p><strong>Imbed in the PDF:</strong> a single song exported to PDF with <strong>Imbed</strong> on (see <em>The Editor → Imbed</em>) prints its chord <em>diagrams</em> above the lyrics instead of names. PDFs are always <strong>black &amp; white</strong>. (Set PDFs don't inline the diagrams yet — they use the Chord Reference page.)</p>

<!-- 6 -->
<h1>6. Chord Diagram Sidebar</h1>
<p>The <strong>Chords</strong> panel (toggle in the toolbar) shows a chord diagram for every chord detected in the current song, drawn for the instrument chosen in <strong>Settings → Chord instrument</strong> — Ukulele or Baritone (4 strings) or Guitar (6 strings). Setting the instrument to <strong>None</strong> hides the panel entirely.</p>
<ul>
  <li>Use <strong>−</strong> / <strong>+</strong> at the top to scale diagrams smaller or larger (5 size levels)</li>
  <li>When a chord has multiple voicings, all options are shown — tap one to select it as the preferred shape for that chord name. The preferred voicing is remembered per instrument.</li>
</ul>

<h2>Adding Custom Chord Shapes</h2>
<p>Scroll to the bottom of the Chords panel and tap <strong>Add</strong>. A form appears with a live preview that updates as you type.</p>
<table>
  <tr><th>Field</th><th>Description</th></tr>
  <tr><td><strong>Chord Name</strong></td><td>The label shown above the diagram (e.g. <code>G</code>, <code>Dm7</code>, <code>Bb</code>)</td></tr>
  <tr><td><strong>Fret Numbers</strong></td><td>One fret position per string, in string order, separated by dashes — <strong>4 values</strong> for a ukulele or baritone (G · C · E · A / D · G · B · E) or <strong>6</strong> for a guitar (E · A · D · G · B · E). Use <code>0</code> for open, <code>X</code> for muted, and any number for a fret position. Example: <code>0-0-0-3</code> (ukulele) or <code>X-3-2-0-1-0</code> (guitar C).</td></tr>
  <tr><td><strong>Finger Numbers</strong></td><td>Optional fingering in the same string order (no dashes needed) — 4 or 6 digits to match the frets. Use <code>1</code>=index, <code>2</code>=middle, <code>3</code>=ring, <code>4</code>=pinky, <code>0</code>=none</td></tr>
</table>
<p>Tap <strong>Save</strong> to add the shape. To edit an existing custom shape, <strong>double-click</strong> its diagram in the Chords panel — the form opens pre-filled with that chord's data. To delete a custom shape, hover over its diagram and tap the <strong>×</strong> badge in the top-right corner.</p>

<h2>Exporting &amp; Importing Custom Chords</h2>
<p>Custom chord shapes are stored locally on the device. Use the buttons in the Chords panel footer to move them between devices or share them.</p>
<ul>
  <li><strong>Import ▾</strong> — opens a format picker. Choose <strong>CSV</strong> to import from a spreadsheet-friendly file, or <strong>JSON</strong> to import from a previously exported Cue chord library. Cue merges incoming shapes into your existing library — exact duplicates are silently skipped. A summary confirms how many shapes were added.</li>
  <li><strong>Export ▾</strong> — opens a format picker. Choose <strong>JSON</strong> to save your chord library as <code>cue-chords-YYYY-MM-DD.json</code>, or <strong>CSV</strong> to save as a comma-separated file. The Export button is grayed out when no custom shapes are defined.</li>
  <li><strong>Starter ↑</strong> — downloads the full set of built-in chord shapes as a CSV file. Use it as a starting point or template when building your own custom chord library.</li>
</ul>
<h3>CSV Format</h3>
<p>Each row in the CSV file represents one chord shape: <code>Name,Frets,Fingers</code>. The Fingers column is optional.</p>
<pre>C,0-0-0-3,0001
G,0-2-3-2,0213
Bb,8-10-11-10,1243</pre>
<p>Frets are dash-separated numbers in string order — 4 values for ukulele/baritone (e.g. G · C · E · A), 6 for guitar (E · A · D · G · B · E). Use <code>0</code> for open, <code>X</code> for muted. Fingers are optional (no dashes): 1=index, 2=middle, 3=ring, 4=pinky. Custom shapes belong to the active <strong>Chord instrument</strong> — export/import while that instrument is selected.</p>
<div class="tip"><strong>Tip:</strong> Download the <strong>Starter</strong> CSV to see the built-in chord shapes in spreadsheet form. Edit them in any spreadsheet app and import your changes back into Cue. Export to iCloud Drive or email to yourself before switching devices.</div>

<!-- 7 -->
<h1>7. Present Mode</h1>
<p>Present mode is full-screen. It is designed to be mirrored to a TV or projector while you perform.</p>

<p>Text size, song navigation, count-in and auto-scroll all live on the <em>floating control panel</em> described below. The top bar holds everything else.</p>

<h2>Top Bar Controls</h2>
<table>
  <tr><th>Control</th><th>Action</th></tr>
  <tr><td><strong>Chords</strong></td><td>Toggles the chord diagram sidebar</td></tr>
  <tr><td><strong>✎ Annotate</strong></td><td>Toggles annotation mode so you can draw over the song with a finger, mouse, or stylus. A floating tool strip appears — see <em>Annotations</em> below. An Apple Pencil always draws even when this is off. Hidden on the shared-set viewer.</td></tr>
  <tr><td><strong>YouTube</strong></td><td>Opens the song's YouTube URL in an overlay player. Shown in red when a URL is saved; grayed out otherwise.</td></tr>
  <tr><td><strong>Edit</strong></td><td>Opens the current song in the editor — see <em>Editing During Performance</em> below. Hidden on shared-set viewer.</td></tr>
  <tr><td><strong>✕</strong></td><td>Exits Present mode (also <code>Escape</code> on keyboard)</td></tr>
</table>

<h2>The Floating Control Panel</h2>
<p>A panel of large round buttons floats over the song, in the lower-right corner by default. It is sized for a fingertip on stage — no hunting for small toolbar buttons mid-song.</p>
<table>
  <tr><th>Button</th><th>Action</th></tr>
  <tr><td><strong>A− / A+</strong></td><td>Shrink or enlarge the lyric text. Your size is remembered when you leave and re-enter Present mode. Dimmed at the smallest and largest sizes.</td></tr>
  <tr><td><strong>◀ / ▶</strong></td><td>Previous / next song. Dimmed at the first and last song of the set, and when presenting a single song.</td></tr>
  <tr><td><strong>Metronome (count-in)</strong></td><td>Plays a two-bar count-in — 8 beats in 4/4, 6 beats in 3/4 — then stops. It is a count-in, not a running metronome. Dimmed when the song has no tempo set. Sound or Visual is chosen in <strong>Settings → Metronome</strong>.</td></tr>
  <tr><td><strong>↓ / ❚❚</strong></td><td>Starts auto-scroll; turns into a pause button and lights up while running.</td></tr>
</table>

<h3>Moving, hiding and fading</h3>
<ul>
  <li><strong>Drag it anywhere.</strong> Press and drag from any part of the panel — including the buttons. A tap is never mistaken for a drag. Its position is saved on this device and stays on-screen if you rotate or resize.</li>
  <li><strong>Collapse it.</strong> The small chevron at the top shrinks the panel to a single round pill. Tap the pill to bring it back. Collapsed or expanded is remembered.</li>
  <li><strong>It fades when idle.</strong> After about 4 seconds without input the panel dims so it does not compete with the lyrics. Any touch brings it straight back to full strength.</li>
</ul>
<p>The keyboard shortcuts still work too: <code>+</code> / <code>−</code> for text size, the arrow keys (or Page Up / Page Down) for songs, and <code>space</code> for auto-scroll. A page-turner pedal uses these same keys — see <em>Page-Turner Pedals</em>.</p>
<div class="tip"><strong>Note:</strong> On a narrow screen the chord sidebar opens as a panel over the song and covers the floating controls. Close it with its <strong>✕</strong> — or the <strong>Chords</strong> button in the top bar — to reach them again.</div>

<h2>Annotations</h2>
<p>Tap the <strong>✎ pencil</strong> button in the top bar to draw over the song. A floating tool strip appears at the bottom of the screen with these tools:</p>
<table>
  <tr><th>Tool</th><th>What it does</th></tr>
  <tr><td><strong>Red / Blue pen</strong></td><td>Draw freehand ink in red or blue.</td></tr>
  <tr><td><strong>Highlighter</strong></td><td>Draw a translucent yellow highlight over lyrics or chords.</td></tr>
  <tr><td><strong>Eraser</strong></td><td>Tap any stroke to remove that whole stroke.</td></tr>
  <tr><td><strong>Undo</strong></td><td>Removes the last stroke drawn.</td></tr>
  <tr><td><strong>Clear</strong></td><td>Removes all ink for the current song, after a confirmation.</td></tr>
</table>
<p>An <strong>Apple Pencil</strong> (or other stylus) always draws, even when annotation mode is off — so you can jot a quick note with the pencil and still tap with a finger to navigate. The floating control panel stays put while you draw; drag it aside or collapse it if it sits over the part of the song you want to mark up.</p>
<p>Ink is saved automatically per song and scales with the content as you resize or change the font size — this works over <strong>PDF lead sheets</strong> too, where marks are anchored to the page so they line up whether the PDF is scrolling or in Full Page. To review a text song's ink later without entering Present mode, open it in the editor and tap <strong>Ink</strong> — see <em>The Editor → Annotation Overlay</em>.</p>
<div class="tip"><strong>Note:</strong> Annotations are stored only on this device and are tied to the song. They are never included in PDF exports, JSON bundles, backups, or shared-set links — a shared set shows no ink to its viewers.</div>

<h2>Count-In</h2>
<p>Tap the <strong>metronome</strong> button on the floating panel to hear or see a two-bar count-in. It plays a fixed number of beats and stops on its own — it does not keep running. The mode is set in <strong>Settings → Metronome → BPM tap mode</strong>:</p>
<ul>
  <li><strong>Sound</strong> — plays audio clicks. The downbeat of each measure is a higher pitch; other beats are lower.</li>
  <li><strong>Visual</strong> — no sound. The top bar flashes white (dark theme) or black (light theme) once per beat. Downbeats flash at full intensity; other beats flash softer.</li>
</ul>
<p>Tempo and time signature are read directly from the song — 4/4 counts 8 beats across 2 measures, 3/4 counts 6 beats across 2 measures. Set them in the editor and they are used automatically when presenting. With no tempo set, the button is dimmed.</p>

<h2>Auto-Scroll</h2>
<p>Tap the <strong>↓</strong> button on the floating panel — or press <code>space</code> — to start scrolling. The button becomes <strong>❚❚</strong> while running.</p>
<ul>
  <li><strong>With Duration set</strong> — Cue scrolls at exactly the pace needed to reach the bottom as the song ends.</li>
  <li><strong>Without Duration</strong> — a slow fixed speed is used instead. Set a Duration on the song for pacing that matches the music.</li>
</ul>
<p><strong>Adjust the pace live.</strong> The <strong>F</strong> and <strong>S</strong> buttons speed up / slow the scroll by about 20% per press; a brief <strong>"Scroll 120%"</strong> readout shows the current pace. The bottom row shows the resulting play time — on your own song, once you've changed the pace it becomes a <strong>"Save M:SS"</strong> button that bakes that timing into the song's Duration; otherwise it just shows the time (shared songs included).</p>
<p><strong>Pause leaves you where you are.</strong> Tapping <strong>❚❚</strong> stops the scroll in place, and tapping <strong>↓</strong> again picks up from that same spot — it never jumps back to the top. To restart from somewhere else, scroll the lyrics there yourself and start again. Moving to another song does reset to the top.</p>

<div class="tip"><strong>Screen wake lock:</strong> Cue requests a screen wake lock when entering Present mode so the display does not dim or sleep during a performance.</div>

<h2>Navigating a Set</h2>
<p>When presenting a set, use the <strong>◀</strong> and <strong>▶</strong> buttons on the floating control panel to move between songs. They dim at the first and last song. You can also use the keyboard arrow keys (<code>←</code> <code>↑</code> / <code>→</code> <code>↓</code>), Page Up / Page Down, or a page-turner pedal — see <em>Page-Turner Pedals</em> below.</p>
<p><strong>Starting from any song:</strong> select a song in the Setlist column by tapping its row, then tap <strong>Present</strong>. Presentation starts from that song and continues forward through the rest of the set.</p>

<h2>Page-Turner Pedals &amp; How Songs Advance</h2>
<p>A Bluetooth page-turner pedal pairs with an iPad as a keyboard, so it works in Present mode with no setup — each press sends a key Cue already listens for. Cue maps <strong>Next</strong> to <code>→</code>, <code>↓</code>, or <code>Page Down</code>, and <strong>Previous</strong> to <code>←</code>, <code>↑</code>, or <code>Page Up</code>. The on-screen ◀ / ▶ and the arrow keys do the same, and a held pedal turns one page, not several. What Next / Previous <em>do</em> is set two ways:</p>
<h3>Full Page — per song</h3>
<p>Turn on <strong>Display → Full Page</strong> for a song (in the editor's metadata bar) and Present shows it as discrete full pages that fit the screen. Next turns a whole page; at the last page it rolls on to the next song. This is the natural fit for a multi-page <strong>PDF</strong> lead sheet. (A one-screen text song set to Full Page simply advances to the next song.)</p>
<h3>Foot pedal advances by — global (Settings → Present)</h3>
<p>For songs that <em>aren't</em> Full Page (ordinary scrolling songs, text or PDF), this one global setting decides what the pedal / ◀ ▶ / keys do:</p>
<ul>
  <li><strong>Songs</strong> (default) — Next / Previous jump song-to-song; you read each song by scrolling, and auto-scroll is available.</li>
  <li><strong>Screen</strong> — Next moves down the current song by about one screen (keeping a line or two of overlap so you don't lose your place); Previous moves back up. At the bottom it rolls to the next song, at the top to the previous — no wrap-around. Auto-scroll is off in this mode.</li>
</ul>
<p>In <strong>Screen</strong> mode two extra controls appear under the same Settings section: <strong>Page turn size</strong> (full / three-quarter / half screen) and <strong>Page turn glide</strong> (0–2000&nbsp;ms — 0 jumps instantly, higher glides smoothly; default 550&nbsp;ms). Crossing into a new song is always an instant cut.</p>
<div class="tip"><strong>Note:</strong> A <strong>Full Page</strong> song always turns whole pages regardless of the Screen/Songs setting. The global setting applies to the on-screen ◀ / ▶ and the keyboard too, not just a pedal. Leave it on <strong>Songs</strong> for the usual scroll-and-skip behavior.</div>

<h2>Editing During Performance</h2>
<p>Tap <strong>Edit</strong> in the top bar to open the current song directly in the editor without leaving your performance session. Present mode closes and the editor opens with the song ready to edit.</p>
<p>While in this edit session, the <strong>Present</strong> button in the editor header changes to <strong>↩ Return to Performance</strong>. Tap it to go straight back to Present mode — the song content updates immediately to reflect any changes you made, with no save required.</p>
<p>When you edit from a set, the editor also shows <strong>← Prev / Next →</strong> buttons so you can move through the other songs in the set and edit them too, without leaving the editor. Return to Performance resumes on whichever song you are editing.</p>
<p>If you tap <strong>✕ Library</strong> instead, the performance session ends. The <strong>↩ Return to Performance</strong> button reverts to the normal <strong>Present</strong> button and you would need to restart the presentation from the Sets panel.</p>
<div class="tip"><strong>Tip:</strong> Use this to fix a wrong chord or lyric mid-rehearsal without interrupting the flow. Edits are reflected immediately when you return — save the song separately when you are ready to make the change permanent.</div>

<!-- 8 -->
<h1>8. AI Assistant</h1>
<p>Cue has an optional <strong>AI</strong> assistant that helps with the fiddly parts of preparing songs and sets. It's powered by Claude and is entirely opt-in: it does nothing until you add your own Anthropic API key, and it only ever acts on <em>your</em> songs — it never fetches or reproduces copyrighted charts.</p>

<h2>Setting Up (Your API Key)</h2>
<p>The AI features run on your own <strong>Anthropic API key</strong>, which you provide in <strong>Settings → AI</strong>:</p>
<ol>
  <li>Create a key at <strong>console.anthropic.com → API Keys</strong> (a plain API key — you don't need Workload Identity Federation). This is a pay-as-you-go account, separate from any Claude subscription.</li>
  <li>Paste it into <strong>Settings → AI → Anthropic API key</strong> and tap <strong>Save key</strong>.</li>
</ol>
<p>The key is stored <strong>only on this device</strong> — it is never sent to Cue's servers, never included in your exports or backups, and never shared with anyone you send a set to. Treat it like a password; if it ever leaks, delete it in the Console and make a new one. A <strong>Remove key</strong> button clears it from this device.</p>
<p>The same section has a <strong>Playing level</strong> — <strong>Beginner / Intermediate / Advanced / Pro</strong> — which tailors how AI answers are pitched (beginners get more explanation and easier options; pros get terse expert replies).</p>
<div class="tip"><strong>Note:</strong> Until a key is saved, the <strong>AI</strong> button is greyed out. Tapping it then just points you to this setup. No AI runs, and nothing is charged, without a key.</div>

<h2>In the Editor</h2>
<p>With a key saved, an <strong>AI</strong> button appears in the editor toolbar. It opens a menu of actions for the current song:</p>
<table>
  <tr><th>Action</th><th>What it does</th></tr>
  <tr><td><strong>Find music online</strong></td><td>Searches the web for chord/tab sources for the song, favouring your instrument (e.g. ukulele sites). Returns a list of real links to open — Cue never copies the charts; you decide what to use.</td></tr>
  <tr><td><strong>Clean up formatting</strong></td><td>Tidies a messy pasted chart — fixes chord alignment and strips website clutter — <em>without changing any chord, lyric, or musical mark</em> (slash chords, strum arrows, bar lines, and your Ω symbols are all preserved). Review and Save as usual.</td></tr>
  <tr><td><strong>Detect structure</strong></td><td>Labels the song's sections — <strong>Verse 1, Chorus, Bridge</strong>, … — by inserting header lines, <em>without changing any chord or lyric</em> and without altering your chord format. It keeps labels you already added and only fills in the gaps; a short or already-labelled song is left as is. Review and Save.</td></tr>
  <tr><td><strong>Condense (fit to page)</strong></td><td>Shrinks a long song toward one or two pages: converts to compact inline brackets, keeps a repeated chorus once and references it later, and collapses back-to-back identical lines with an <code>(x2)</code> marker — <em>never changing a chord or word</em>. The song then displays in this compact form; <strong>Expand</strong> (which appears once a song is condensed) writes it back out in full.</td></tr>
  <tr><td><strong>Fill in song details</strong></td><td>Reads the chart and suggests Title, Artist, Key (from the chords), plus Tempo, Duration and a real YouTube link (web-searched). Apply each suggestion you want — nothing changes until you do.</td></tr>
  <tr><td><strong>Add missing chord shapes</strong></td><td>Finds chords in the song that have no diagram for your instrument, proposes a voicing for each, and shows it as a <em>rendered diagram</em> to review before it's added to your custom chord library.</td></tr>
  <tr><td><strong>Transposing advice</strong></td><td>Suggests easier keys and capo positions for your instrument, with a one-tap <strong>Apply</strong> that sets Cue's Transpose. Capo tips are advice only.</td></tr>
  <tr><td><strong>Strumming pattern</strong></td><td>One tap suggests a strumming (or picking) pattern for the song, as text — <code>D</code> down, <code>U</code> up, <code>x</code> mute, <code>-</code> rest — matched to the song's time signature, tempo and your instrument and level. Opens in the Ask pop-up.</td></tr>
  <tr><td><strong>Ask about music…</strong></td><td>A pop-up where you type any music question (playing, theory, a chord shape, a strumming pattern) and the answer streams back. It's aware of the current song and your Playing level. Ask as many as you like. When an answer looks off, <strong>Try again — smarter model</strong> re-runs it on the more capable (slower, pricier) model.</td></tr>
</table>
<p><strong>Try again — smarter model:</strong> AI answers run on a fast, economical model by default. When a result looks wrong, a <strong>Try again — smarter model</strong> button re-runs it on a more capable model (slower and a bit pricier) — available on <em>Ask</em>, <em>Strumming pattern</em>, <em>Transposing advice</em>, <em>Fill in song details</em>, and <em>Add missing chord shapes</em>.</p>

<h2>In the Setlist</h2>
<p>The Setlist column's status bar (beside the Gap/estimate) has its own <strong>AI</strong> button with two actions:</p>
<ul>
  <li><strong>Suggest set order</strong> — proposes a running order that flows well (opener, pacing, key transitions, closer), shown in a pop-up with a short rationale and an <strong>Apply</strong> button that reorders the set.</li>
  <li><strong>Estimate set time</strong> — reasons like a gigging musician: fills in lengths for songs without a Duration, estimates the between-song gap time as a range, suggests a break and setup/finish time, and gives a total with practical notes. <strong>Save song estimates</strong> writes the filled-in durations into the songs so the always-on estimate stays accurate.</li>
</ul>

<h2>Cost &amp; Privacy</h2>
<p>Each AI action makes one request to Anthropic billed to <em>your</em> API account — typically a fraction of a cent; the web-search actions (Find, Fill) cost a little more. You control the spend, and you can set a monthly budget cap in the Anthropic Console. AI needs an internet connection; the rest of Cue works offline as always. The content you send (your chart, song titles) goes to Anthropic to produce the answer and nowhere else.</p>

<!-- 9 -->
<h1>9. Shared Sets &amp; Cloud Sync</h1>
<p>You can share a set with anyone using a private link — they can view the songs and present them without needing a Cue account. If you sign in, you can also pull your own published sets back down onto your other devices.</p>

<h2>Publishing a Shared Set</h2>
<p>Sharing takes two steps: <strong>publish</strong> the set to the cloud, then <strong>generate a link</strong> to it. Publishing on its own does not create a link — nothing is shared until you generate one. You must be signed in (via Settings → Account) for both.</p>
<table>
  <tr><th>Icon</th><th>Step</th><th>What it does</th></tr>
  <tr><td><strong>☁↑ Publish</strong></td><td>1. Upload</td><td>Copies the set and its songs to the cloud. Use <strong>Republish</strong> later to send edits. When this device has edits you have not sent yet, the set's name turns amber and its row reads "· changes not sent".</td></tr>
  <tr><td><strong>🔗 Share</strong></td><td>2. Link</td><td>Appears once a set is published. Opens the Share dialog with the set's <strong>single link</strong> — Cue keeps one link per set (created the first time, reused after), so just copy it. <strong>Stop sharing</strong> in the dialog revokes the link; the set stays, and sharing again mints a fresh one.</td></tr>
  <tr><td><strong>☁✕ Stop Sharing Set</strong></td><td>Remove</td><td>Deletes the set from the cloud, kills its link, and cleans up any shared PDF files. Your local copy is not affected.</td></tr>
</table>
<p>The link stays live until you stop sharing or unpublish the set. Recipients see the set in a read-only viewer — they cannot edit songs or see your full library. Republishing an already-shared set updates what the link shows; it does not invalidate it. <strong>PDF lead sheets in a shared set now come through to recipients</strong> — they render in the viewer and travel with a "Copy to library".</p>

<h2>Pulling a Set to Another Device</h2>
<p>Publishing sends a set <em>up</em> to the cloud. Pulling brings it back <em>down</em> onto another device you own — the same set, not a copy. Use it to carry a set from your desktop to the iPad you perform from. You must be signed in on both devices with the same account.</p>
<table>
  <tr><th>Control</th><th>Where</th><th>What it does</th></tr>
  <tr><td><strong>Get latest from cloud</strong> (cloud with a down arrow)</td><td>In a set row's ⋮ menu</td><td>Pulls that set's cloud copy onto this device, replacing the local one.</td></tr>
  <tr><td><strong>☁ Pull icon</strong></td><td>In the <strong>Sets</strong> column header</td><td>Lists all your cloud sets so you can choose one. Use this on a new device that does not have the set yet.</td></tr>
</table>
<p>A pull is scoped to the one set you choose. Precisely what changes:</p>
<ul>
  <li><strong>The set</strong> — its name and song order are replaced with the cloud copy's.</li>
  <li><strong>Songs in that set</strong> — replaced with the cloud copy. Songs the set references that are missing on this device are added.</li>
  <li><strong>Everything else</strong> — untouched. Songs outside the pulled set are never modified, even if they sit in other sets. A pull is never a whole-library replace.</li>
</ul>
<div class="tip"><strong>Note:</strong> Your annotations stay put. Ink is stored per song on this device, so a song replaced by a pull keeps the drawings you made on it.</div>

<h2>The Pull Warning</h2>
<p>If this device holds edits that are <em>newer</em> than the cloud copy, pulling would overwrite them. Cue checks before writing anything and names what is at risk:</p>
<pre>This device has newer changes to: Blue Moon, Five Foot Two.
Pulling will discard them. Continue?</pre>
<p>The check is per song, not a single date on the set — so a set that looks recent in the cloud cannot hide one song that is older there than here. It is a warning, not a block: if you know the cloud copy is the one you want, tap <strong>Pull anyway</strong>. To keep the local edits instead, cancel and <strong>Publish</strong> first, then pull.</p>
<div class="tip"><strong>Tip:</strong> An amber set name (and "· changes not sent" on its row) means this device has changes you have not published yet. Publish before pulling on another device, or those changes will be the ones at risk.</div>

<h2>Pull vs. Copy to Library</h2>
<p>These look similar and are not the same. <strong>Pull</strong> is for <em>your own</em> set returning to <em>your own</em> device: it matches the set and songs by their identity and overwrites them in place, so the set stays one set across your devices. <strong>Copy to library</strong> (in the shared-set viewer) is for <em>someone else's</em> set: it always creates brand-new songs so it can never overwrite anything of yours, and prompts you when a title already exists.</p>

<h2>Viewing a Shared Set</h2>
<p>Open the shared link on any device. On a fresh open a small <strong>landing screen</strong> appears first so the recipient can choose:</p>
<ul>
  <li><strong>Continue to set</strong> — opens the set here in the browser to follow along.</li>
  <li><strong>Copy code</strong> — copies the set's code so they can save it in their own Cue: paste it into <strong>Sets → "Paste a share link"</strong> and tap Open (which also bookmarks it under <em>Shared with me</em> automatically). The landing screen is skipped on repeat visits and for sets you've already bookmarked.</li>
</ul>
<p>In the viewer you can:</p>
<ul>
  <li><strong>Present All</strong> — launches Present mode from the first song, or from any song you tap <strong>Present</strong> on. PDF lead sheets render just as they do in your own library.</li>
  <li><strong>Key</strong> — each song shows the key it plays in; you can transpose it for yourself (stored locally, never sent to the server).</li>
  <li><strong>Copy to library</strong> — copy an individual song or the whole set (including any PDFs) into your local Cue. Once you've copied the set, this button reflects its status: <strong>Up to date</strong> when your copies match the share, or <strong>Update</strong> when the publisher has changed it — Update opens a per-song list (Update / Skip changed songs, Add / Skip new ones), refreshes your copies in place, and re-syncs the set order, without touching songs you made yourself. A song you've edited locally is flagged and never overwritten unless you choose Update.</li>
  <li><strong>Bookmark</strong> — save the link to a <em>Shared with me</em> list for quick access later.</li>
  <li><strong>⚙ Settings</strong> — theme, chord color, and chord label size, applied immediately.</li>
  <li><strong>Open Cue</strong> — go to the main Cue app.</li>
</ul>
<div class="tip"><strong>Note:</strong> Viewing a shared set is entirely read-only. Nothing the viewer does (key changes, bookmarks, copies) is written back to the shared set or the publisher's account.</div>

<!-- 10 -->
<h1>10. File Formats</h1>

<h2>ChordPro (.cho / .chopro)</h2>
<p>The standard ChordPro format. Cue reads and writes these directives at the top of the file:</p>
<pre>{title: Here Comes the Sun}
{artist: The Beatles}
{key: A}
{tempo: 129}
{duration: 3:06}
{timesig: 3/4}</pre>
<p>The <code>{timesig:}</code> directive is only written when the song is in 3/4 — 4/4 is the default and is omitted to keep files compatible with other apps.</p>
<p>Over-lyrics songs are converted to inline brackets on export (ChordPro is a bracket format). Any lyric styling you added in Cue is stripped, so the <code>.cho</code> contains clean chords and lyrics that any ChordPro reader can open — see <em>Styling Lyrics</em>. To keep styling, use a JSON or Backup export instead.</p>

<h2>JSON Bundle (.json)</h2>
<p>Cue's portable format. A <strong>song bundle</strong> contains one song with all its metadata:</p>
<pre>{ "type": "cue-song", "version": 1, "song": { ... } }</pre>
<p>A <strong>set bundle</strong> contains the set order plus all its songs:</p>
<pre>{ "type": "cue-set", "version": 1, "set": { ... }, "songs": [ ... ] }</pre>
<p>Import a set bundle to restore the entire set and all songs in one step — useful for moving to a new device or sharing a gig setlist.</p>

<h2>Backup File (.json)</h2>
<p>A full library export created by the <strong>Backup</strong> button:</p>
<pre>{ "type": "cue-backup", "version": 1, "exportedAt": "...", "songs": [ ... ], "sets": [ ... ] }</pre>
<p>Import a backup file via <strong>Import</strong> to restore all songs and sets in one step.</p>

<h2>Chord Library Export (.json / .csv)</h2>
<p>A snapshot of all custom chord shapes, created by <strong>Export ▾</strong> in the Chords panel. The JSON format:</p>
<pre>{ "type": "cue-chords", "version": 1, "chords": [ ... ] }</pre>
<p>The CSV format has one shape per row: <code>Name,Frets,Fingers</code> (Fingers optional). Import either format via <strong>Import ▾</strong> in the Chords panel footer. Song and set imports (via the main header Import button) do not accept chord library files — use the Chords panel Import button instead.</p>

<!-- 11 -->
<h1>11. Keyboard Shortcuts</h1>
<table>
  <tr><th>Key</th><th>Action</th></tr>
  <tr><td><code>Cmd / Ctrl + F</code></td><td>Open Find &amp; Replace in the editor (also available via the <strong>Find</strong> toolbar button)</td></tr>
  <tr><td><code>Space</code></td><td>Start / pause auto-scroll in Present mode (inactive in Pedal paging mode)</td></tr>
  <tr><td><code>← / ↑ / Page Up</code></td><td>Present mode: previous song — or page up within the song in Pedal paging mode. Also sent by a page-turner pedal.</td></tr>
  <tr><td><code>→ / ↓ / Page Down</code></td><td>Present mode: next song — or page down within the song in Pedal paging mode. Also sent by a page-turner pedal.</td></tr>
  <tr><td><code>+ / =</code></td><td>Increase font size in Present mode</td></tr>
  <tr><td><code>−</code></td><td>Decrease font size in Present mode</td></tr>
  <tr><td><code>Escape</code></td><td>Exit Present mode / close Find bar</td></tr>
</table>

<!-- 12 -->
<h1>12. Tips</h1>
<ul>
  <li><strong>Transpose without rewriting</strong> — set the song’s written key in the metadata bar, then use <strong>View Key</strong> in the editor toolbar to display it in any other key. The chords render shifted in real time and the saved text is untouched, so you can perform in a singer-friendly key without altering the original.</li>
  <li><strong>Theme and chord color</strong> — open Settings (⚙ gear in the Library header) to switch between Light and Dark mode and to choose a chord color. These settings apply everywhere including Present mode and the shared-set viewer.</li>
  <li><strong>Chord label size</strong> — use the Chord label size control in Settings to make chord names above lyrics larger or smaller. This is useful if your display is small or if you are mirroring to a screen from a distance.</li>
  <li><strong>YouTube URL</strong> — paste a YouTube link into the metadata bar to keep a reference track alongside the song. Tap the YouTube button in the editor or Present mode toolbar to open it in an overlay player. Useful for learning a song or playing along during rehearsal. The button is grayed out when no URL is set.</li>
  <li><strong>Non-destructive key changes</strong> — use View Key in the editor to render a song in a different key for you or your bandmates. It changes only how the song displays in the preview, Present mode, and the exported set PDF, never the stored chords, and is saved per song so it reopens the same way.</li>
  <li><strong>3/4 songs</strong> — tap the <strong>4/4</strong> button in the Tempo row to switch to <strong>3/4</strong>. Save the song. The metronome and flash mode will automatically use 6 beats when you present it.</li>
  <li><strong>Floating controls in Present mode</strong> — text size, song navigation, count-in and auto-scroll sit on a draggable panel of large round buttons. Drag it wherever suits your stage setup; it fades when idle and wakes on any touch. Collapse it to a single pill if you want the screen clear.</li>
  <li><strong>Starting a set at any song</strong> — tap a song row in the Setlist column to select it (highlighted in indigo), then tap <strong>Present</strong>. Presentation starts from that song and continues forward; the set does not restart from the top.</li>
  <li><strong>iPad editing space</strong> — use the <strong>Preview</strong> and <strong>Chords</strong> toggle buttons to hide panels and give the text editor more room.</li>
  <li><strong>Set PDF with chord charts</strong> — select the set in the Sets panel, then tap <strong>Export ▾ → PDF + Chord Charts</strong> in the Setlist column. Every song becomes a page, and a single chord reference page listing all unique chords across the set is added at the end — useful as a printed reference for rehearsals.</li>
  <li><strong>Exporting a full set as JSON</strong> — select the set, tap <strong>Export ▾ → JSON bundle</strong> in the Setlist column. This creates one file containing the set order plus all the songs, which you can import on another device or keep as a backup.</li>
  <li><strong>Exporting multiple sets</strong> — use Select mode in the Sets panel, check the sets you want, and tap <strong>Export</strong>. All selected sets and their songs are bundled into a single JSON file.</li>
  <li><strong>Custom chord shapes</strong> — define the shape once, and it is available any time that chord name appears in any song. Custom shapes appear at the top of the voicing options. Use <strong>Export</strong> and <strong>Import</strong> in the Chords panel footer to move your shapes to another device.</li>
</ul>

</body>
</html>`;
}

export function openManualPDF() {
  const html = manualHTML();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => {
      URL.revokeObjectURL(url);
    });
  } else {
    URL.revokeObjectURL(url);
  }
}
