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
    <li class="toc-h2">Sets Select Mode</li>
    <li class="toc-h2">Searching &amp; Sorting Sets</li>
    <li class="toc-h2">Importing a Set from HTML</li>
    <li class="toc-h2">The Setlist Column</li>
    <li class="toc-h1">5. The Editor</li>
    <li class="toc-h2">Metadata Bar</li>
    <li class="toc-h2">Text Editor &amp; Chord Formats</li>
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
    <li class="toc-h2">Ghost Overlay Controls</li>
    <li class="toc-h2">Annotations</li>
    <li class="toc-h2">Metronome</li>
    <li class="toc-h2">Auto-Scroll</li>
    <li class="toc-h2">Navigating a Set</li>
    <li class="toc-h2">Editing During Performance</li>
    <li class="toc-h1">8. Shared Sets</li>
    <li class="toc-h1">9. File Formats</li>
    <li class="toc-h1">10. Keyboard Shortcuts</li>
    <li class="toc-h1">11. Tips</li>
  </ul>
</div>

<!-- 1 -->
<h1>1. Overview</h1>
<p>Cue is a web-based chord and lyric app built for live performance. It stores songs in your browser and presents them full-screen on a TV or projector via screen mirroring. All songs and sets are stored locally on the device — no account is needed to create and perform songs.</p>
<p>Cue is designed to be fast to set up. Open it in Safari on an iPad, mirror to an Apple TV, and you are ready to go. An optional account lets you share sets with other Cue users via a private link — see <em>Shared Sets</em>.</p>
<p>Appearance preferences (theme, chord color) are controlled from the <strong>Settings</strong> panel, opened with the gear icon (⚙) in the top-right of the Library header. Settings persist in your browser and apply immediately across all views.</p>

<!-- 2 -->
<h1>2. Settings</h1>
<p>Tap the <strong>⚙ gear icon</strong> in the top-right of the Library header to open Settings. The same gear icon appears in the shared-set viewer. Settings are stored in your browser's local storage and apply globally — changes take effect immediately.</p>

<h2>Appearance</h2>
<table>
  <tr><th>Setting</th><th>Description</th></tr>
  <tr><td><strong>Theme</strong></td><td>Switch between <strong>Light</strong> and <strong>Dark</strong> mode. The theme applies to every view including the editor, Present mode, and the shared-set viewer.</td></tr>
  <tr><td><strong>Chord color</strong></td><td>Tap the color swatch to choose any color for chord names. Applied in the editor preview and Present mode. Default is black.</td></tr>
  <tr><td><strong>Chord label size</strong></td><td>Seven-step scale from −30% to +30% that adjusts the size of chord names above lyrics (<strong>Over Lyrics</strong> format only). The center step (0) is the default size. Has no effect on the Brackets format.</td></tr>
  <tr><td><strong>Accidentals</strong></td><td>Controls how transposed chords spell the five ambiguous notes (C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭). <strong>Auto</strong> (default) matches the View Key — flat keys use flats, sharp keys use sharps; <strong>Flats</strong> and <strong>Sharps</strong> force one spelling. Whatever the mode, every chord in a transposed song is spelled consistently (no sharp/flat mix). The stored chords are never changed — this affects display only.</td></tr>
</table>

<h2>Metronome</h2>
<table>
  <tr><th>Setting</th><th>Description</th></tr>
  <tr><td><strong>BPM tap mode</strong></td><td><strong>Sound</strong> — plays audio clicks when you tap the BPM button in Present mode. The downbeat of each measure is a higher pitch; other beats are lower. <strong>Visual</strong> — no sound; the top bar flashes once per beat instead.</td></tr>
</table>

<h2>Account</h2>
<p>The Account section appears only when cloud sharing is configured. Enter your email address to receive a magic sign-in link. Once signed in, your email is shown with a <strong>Sign out</strong> button. An account is needed only to <em>publish</em> a shared set link — viewing a shared link requires no account.</p>

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

<h2>Backup &amp; Restore</h2>
<p>Tap <strong>Backup</strong> in the top header to download a complete snapshot of your library. The backup file (<code>cue-backup-YYYY-MM-DD.json</code>) contains every song and every set in a single file.</p>
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

<h2>Select Mode</h2>
<p>Tap <strong>Select</strong> in the Library panel header to enter selection mode. Checkboxes appear on every song row. The action bar appears immediately below the song count with three buttons — all grayed out until at least one song is checked.</p>
<ul>
  <li>Tap a row or its checkbox to select / deselect that song</li>
  <li><strong>Select all</strong> / <strong>Deselect all</strong> toggle at the top of the list</li>
  <li><strong>Export ▾</strong> — exports selected songs. One song: download as ChordPro (<code>.cho</code>) or JSON. Multiple songs: download as a ZIP of <code>.cho</code> files or a JSON bundle.</li>
  <li><strong>Add to Set</strong> — adds all selected songs to the currently active set (the one highlighted in the Sets panel). The button is grayed out if no set is active; first tap a set in the Sets panel to make it active, then return to the Library and use Select mode.</li>
  <li><strong>Delete</strong> — permanently removes selected songs from the library and any sets they appear in</li>
</ul>
<p>Tap <strong>Done</strong> in the Library panel header to exit selection mode.</p>

<!-- 4 -->
<h1>4. Sets &amp; Setlist</h1>
<p>The <strong>Sets</strong> column (middle) lists all your sets. The <strong>Setlist</strong> column (right) shows the songs inside whichever set is currently selected.</p>

<h2>Creating &amp; Managing Sets</h2>
<p>Tap <strong>New Set</strong> in the Sets panel header, type a name, and press Enter or tap <strong>Create</strong>.</p>
<p>To add songs to a set: tap the set row to make it active (it highlights in indigo), then go to the Library panel, enter Select mode, check the songs you want, and tap <strong>Add to Set</strong>. The button shows the active set name in its tooltip and is grayed out if no set is selected.</p>
<p>Tap a set row to select it — its songs appear in the Setlist column. Tap it again to deselect.</p>
<p>To delete a set, tap the trash icon on its row. Songs stay in your library.</p>

<h2>Sets Select Mode</h2>
<p>Tap <strong>Select</strong> in the Sets panel header to enter selection mode. Checkboxes appear on every set row. A count bar below the search field shows how many sets are listed. The action bar appears immediately below the count — Export and Delete are grayed out until at least one set is checked.</p>
<ul>
  <li><strong>Select all</strong> / <strong>Deselect all</strong> — toggles selection of all visible sets (respects any active search filter)</li>
  <li><strong>Export</strong> — downloads all selected sets as a single JSON bundle (<code>cue-sets-YYYY-MM-DD.json</code>), including all songs referenced by those sets. The file can be re-imported via the main <strong>Import</strong> button.</li>
  <li><strong>Delete</strong> — permanently removes the selected sets; songs stay in your library</li>
</ul>
<p>Tap <strong>Done</strong> to exit selection mode.</p>

<h2>Searching &amp; Sorting Sets</h2>
<p>The Sets column header includes a <strong>search bar</strong> and a <strong>sort menu</strong>, matching the Library panel. Type in the search bar to filter sets by name as you type. Use the sort menu to order by:</p>
<ul>
  <li><strong>A–Z</strong> — alphabetical by set name</li>
  <li><strong>Newest</strong> — most recently created or updated first</li>
  <li><strong>Oldest</strong> — oldest first</li>
</ul>

<h2>Importing a Set from HTML</h2>
<p>If you have a setlist in an HTML file (for example, exported from a spreadsheet), you can import it directly. Tap the <strong>Import icon (↓)</strong> next to the <strong>+</strong> button in the Sets panel header to open the file picker, then select your <code>.html</code> or <code>.htm</code> file.</p>
<p>The HTML file must contain a <code>&lt;table&gt;</code> with at least a <strong>Title</strong> column header. <strong>Artist</strong> and <strong>Key</strong> columns are also recognised if present. All other columns are ignored.</p>
<p>Example table structure:</p>
<pre>&lt;table&gt;
  &lt;tr&gt;&lt;th&gt;Title&lt;/th&gt;&lt;th&gt;Artist&lt;/th&gt;&lt;th&gt;Key&lt;/th&gt;&lt;/tr&gt;
  &lt;tr&gt;&lt;td&gt;Here Comes the Sun&lt;/td&gt;&lt;td&gt;The Beatles&lt;/td&gt;&lt;td&gt;A&lt;/td&gt;&lt;/tr&gt;
  ...
&lt;/table&gt;</pre>
<p>Cue names the new set after the filename (minus the extension) and fuzzy-matches each row against your song library by title and artist. Matched songs are added to the set; unmatched rows are skipped without interrupting the import.</p>
<p>After importing, a summary appears showing how many songs were matched and listing any titles that were not found in your library. If the filename matches an existing set name, Cue appends <em>(2)</em>, <em>(3)</em>, etc. to keep both.</p>
<div class="tip"><strong>Tip:</strong> The import matches on normalised title and artist — punctuation, capitalisation, and curly quotes are ignored. If a song isn't matched, check that its title in Cue matches exactly what's in the HTML file.</div>

<h2>The Setlist Column</h2>
<p>With a set selected, the Setlist column shows its songs. From here you can:</p>
<ul>
  <li><strong>Drag songs</strong> to reorder them using the grip handle on the left, with touch or mouse (Custom sort mode)</li>
  <li><strong>Sort A–Z</strong> — permanently sorts the set alphabetically</li>
  <li><strong>Tap any song row</strong> — selects that song (highlighted in indigo). Tap the same row again to deselect it.</li>
  <li><strong>Double-tap any song row</strong> — opens it directly in the editor. The setlist highlight follows Prev/Next navigation in the editor.</li>
  <li><strong>▶ Present</strong> — launches Present mode starting at the selected song and continues forward through the rest of the set. Grayed out until a song is selected.</li>
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
  <tr><td><strong>Key</strong></td><td>Source key — 24 options covering all major and minor keys. Tap the <strong>wand icon</strong> (✦) next to the Key field to auto-detect the key from chords in the song. If the result is unambiguous (≥90% match), the key fills in automatically; otherwise a popover shows the top candidates to choose from.</td></tr>
  <tr><td><strong>Tempo (BPM)</strong></td><td>Beats per minute</td></tr>
  <tr><td><strong>Tap</strong></td><td>Tap repeatedly in rhythm to measure BPM automatically</td></tr>
  <tr><td><strong>▶</strong></td><td>Plays 8 beats of audio to preview the current tempo and time signature</td></tr>
  <tr><td><strong>4/4 / 3/4</strong></td><td>Time signature for this song — stored with the song and used by the metronome in Present mode</td></tr>
  <tr><td><strong>Duration (M:SS)</strong></td><td>Song length (e.g. <code>3:30</code>) — used by auto-scroll in Present mode</td></tr>
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

<p>Use the <strong>Over lyrics</strong> / <strong>[Brackets]</strong> toggle buttons in the toolbar to switch between formats. Cue converts the text automatically when you switch.</p>

<h2>Toolbar Controls</h2>
<table>
  <tr><th>Control</th><th>What it does</th></tr>
  <tr><td><strong>View Key</strong></td><td>Sets a saved <em>display key</em> for the song. The preview, Present mode, and the exported set PDF all render transposed to this key, without ever changing the source text or the song's real key. Your choice is saved with the song, so it reopens the same way; choose the top option (the song's own key) to render untransposed.</td></tr>
  <tr><td><strong>Preview</strong></td><td>Toggles the live preview panel that renders the song with chords above lyrics.</td></tr>
  <tr><td><strong>Chords</strong></td><td>Toggles the chord diagram sidebar.</td></tr>
  <tr><td><strong>✎ Ink</strong></td><td>Shows or hides ink annotations drawn in Present mode, overlaid on the preview (read-only here). Only appears when the song has saved annotations. A <strong>Clear ink</strong> button beside it deletes them — see <em>Annotation Overlay</em> below.</td></tr>
  <tr><td><strong>▶ Present</strong></td><td>Launches the current song in full-screen Present mode. When you arrive here via the <strong>Edit</strong> button in Present mode, this button changes to <strong>↩ Return to Performance</strong> — see <em>Editing During Performance</em> below.</td></tr>
  <tr><td><strong>← Prev / Next →</strong></td><td>Moves to the previous or next song. Appears when the editor is opened via the <strong>✎ Edit</strong> button in the Setlist column, the <strong>Edit</strong> button in Present mode, or by double-tapping a song in the Library or Setlist panel. Navigation order follows the list you opened from (or the set you were presenting). If there are unsaved changes, a confirmation dialog appears before navigating.</td></tr>
  <tr><td><strong>YouTube</strong></td><td>Opens the song's YouTube URL in an overlay player. Only shown when a YouTube URL is saved in the metadata bar. The button is grayed out if no URL is set.</td></tr>
  <tr><td><strong>✕</strong></td><td>Returns to the Library. If there are unsaved changes, a confirmation dialog appears first.</td></tr>
</table>
<div class="tip"><strong>Tip:</strong> Theme and chord color are set in the <strong>Settings</strong> panel (⚙ gear icon in the Library header) and apply globally — you do not need to change them per song.</div>

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
  <li><strong>PDF + Chord Charts</strong> — same as above, plus a single <em>Chord Reference</em> page at the end listing every unique chord across the entire set as a ukulele fretboard diagram (G C E A tuning, 5 diagrams per row). Diagrams respect your preferred voicings and any custom chord shapes you have defined.</li>
  <li><strong>JSON bundle</strong> — the set and all its songs in one portable file.</li>
  <li><strong>Setlist</strong> — a plain-text numbered list of song titles, suitable for printing or sharing.</li>
</ul>
<div class="tip"><strong>Tip:</strong> The exported set PDF honors each song's View Key — every song prints in its saved display key, matching Present mode. Songs with no View Key set print in their written key. The stored chords are never changed either way.</div>

<!-- 6 -->
<h1>6. Chord Diagram Sidebar</h1>
<p>The <strong>Chords</strong> panel (toggle in the toolbar) shows a ukulele chord diagram for every chord detected in the current song.</p>
<ul>
  <li>Use <strong>−</strong> / <strong>+</strong> at the top to scale diagrams smaller or larger (5 size levels)</li>
  <li>When a chord has multiple voicings, all options are shown — tap one to select it as the preferred shape for that chord name</li>
</ul>

<h2>Adding Custom Chord Shapes</h2>
<p>Scroll to the bottom of the Chords panel and tap <strong>Add</strong>. A form appears with a live preview that updates as you type.</p>
<table>
  <tr><th>Field</th><th>Description</th></tr>
  <tr><td><strong>Chord Name</strong></td><td>The label shown above the diagram (e.g. <code>G</code>, <code>Dm7</code>, <code>Bb</code>)</td></tr>
  <tr><td><strong>Fret Numbers</strong></td><td>Fret positions for strings G · C · E · A, separated by dashes. Use <code>0</code> for open, <code>X</code> for muted, and any number for fret position. Example: <code>0-0-0-3</code> or <code>8-10-11-10</code> for higher positions.</td></tr>
  <tr><td><strong>Finger Numbers</strong></td><td>Optional fingering for G · C · E · A order (no dashes needed). Use <code>1</code>=index, <code>2</code>=middle, <code>3</code>=ring, <code>4</code>=pinky, <code>0</code>=none</td></tr>
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
<p>Frets are dash-separated numbers in G · C · E · A string order. Use <code>0</code> for open, <code>X</code> for muted. Fingers are optional (no dashes): 1=index, 2=middle, 3=ring, 4=pinky.</p>
<div class="tip"><strong>Tip:</strong> Download the <strong>Starter</strong> CSV to see the built-in chord shapes in spreadsheet form. Edit them in any spreadsheet app and import your changes back into Cue. Export to iCloud Drive or email to yourself before switching devices.</div>

<!-- 7 -->
<h1>7. Present Mode</h1>
<p>Present mode is full-screen. It is designed to be mirrored to a TV or projector while you perform.</p>

<h2>Top Bar Controls</h2>
<table>
  <tr><th>Control</th><th>Action</th></tr>
  <tr><td><strong>♩ {BPM}</strong></td><td>Triggers the metronome (8 beats for 4/4, 6 beats for 3/4). The metronome mode (Sound or Visual) is set in the <strong>Settings</strong> panel.</td></tr>
  <tr><td><strong>▶ {duration} / ❚❚</strong></td><td>Starts or pauses auto-scroll. When a duration is set, the button shows the song length (e.g. <code>▶ 3:30</code>). Without a duration it shows <code>▶ Scroll</code>.</td></tr>
  <tr><td><strong>1× / 2× / 3× / 4×</strong></td><td>Scroll speed multiplier — always visible. In duration mode, 1× scrolls at the exact pace needed to finish by the end of the song; higher values scroll proportionally faster. Without a duration set, cycles through a set of fixed speeds.</td></tr>
  <tr><td><strong>Chords</strong></td><td>Toggles the chord diagram sidebar</td></tr>
  <tr><td><strong>✎ Annotate</strong></td><td>Toggles annotation mode so you can draw over the song with a finger, mouse, or stylus. A floating tool strip appears — see <em>Annotations</em> below. An Apple Pencil always draws even when this is off. Hidden on the shared-set viewer.</td></tr>
  <tr><td><strong>YouTube</strong></td><td>Opens the song's YouTube URL in an overlay player. Shown in red when a URL is saved; grayed out otherwise.</td></tr>
  <tr><td><strong>Edit</strong></td><td>Opens the current song in the editor — see <em>Editing During Performance</em> below. Hidden on shared-set viewer.</td></tr>
  <tr><td><strong>✕</strong></td><td>Exits Present mode (also <code>Escape</code> on keyboard)</td></tr>
</table>

<h2>Ghost Overlay Controls</h2>
<p>Three semi-transparent controls are overlaid on the song content. They are visible at low opacity when active and fade to nearly invisible after 4 seconds of inactivity. Tap or touch anywhere on the content to wake them.</p>
<table>
  <tr><th>Control</th><th>Location</th><th>Action</th></tr>
  <tr><td><strong>‹ (left chevron)</strong></td><td>Full-height strip on the left edge</td><td>Go to the previous song. Only shown when presenting a set. Bounces gently if already at the first song.</td></tr>
  <tr><td><strong>› (right chevron)</strong></td><td>Full-height strip on the right edge</td><td>Go to the next song. Only shown when presenting a set. Bounces gently if already at the last song.</td></tr>
  <tr><td><strong>A− / A+</strong></td><td>Upper area of the content, right of center</td><td>Shrink or enlarge the text. Saved and restored across sessions — your size is remembered when you leave and re-enter Present mode.</td></tr>
</table>
<p>Vertical scrolling works normally through all ghost zones — only a tap (not a drag) triggers the control. The keyboard shortcuts <code>+</code> / <code>−</code> and <code>←</code> / <code>→</code> also control font size and navigation respectively.</p>

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
<p>An <strong>Apple Pencil</strong> (or other stylus) always draws, even when annotation mode is off — so you can jot a quick note with the pencil and still tap with a finger to navigate. While annotation mode is on, the Prev/Next edge chevrons are suppressed to prevent accidental navigation while drawing.</p>
<p>Ink is saved automatically per song and scales with the text as you resize or change the font size. To review a song's ink later without entering Present mode, open it in the editor and tap <strong>Ink</strong> — see <em>The Editor → Annotation Overlay</em>.</p>
<div class="tip"><strong>Note:</strong> Annotations are stored only on this device and are tied to the song. They are never included in PDF exports, JSON bundles, backups, or shared-set links — a shared set shows no ink to its viewers.</div>

<h2>Metronome</h2>
<p>Tap <strong>♩ {BPM}</strong> to trigger the metronome. The mode is set in <strong>Settings → Metronome → BPM tap mode</strong>:</p>
<ul>
  <li><strong>Sound</strong> — plays audio clicks. The downbeat of each measure is a higher pitch; other beats are lower.</li>
  <li><strong>Visual</strong> — no sound. The top bar flashes white (dark theme) or black (light theme) once per beat. Downbeats flash at full intensity; other beats flash softer.</li>
</ul>
<p>The time signature is read directly from the song — 4/4 plays 8 beats across 2 measures, 3/4 plays 6 beats across 2 measures. Set the time signature in the editor and it is automatically used when presenting.</p>

<h2>Auto-Scroll</h2>
<p>Tap <strong>▶</strong> to start scrolling. The <strong>1× / 2× / 3× / 4×</strong> button controls scroll speed and is always visible in the top bar.</p>
<ul>
  <li><strong>With Duration set</strong> — Cue calculates the exact speed needed to finish the song right as you reach the bottom. At 1×, scrolling takes exactly the song's duration. At 2×, it finishes in half the time; 3× in a third, and so on.</li>
  <li><strong>Without Duration</strong> — the multiplier cycles through a set of fixed speeds from slow to fast.</li>
</ul>
<p>The scroll resets to the top each time you start it.</p>

<div class="tip"><strong>Screen wake lock:</strong> Cue requests a screen wake lock when entering Present mode so the display does not dim or sleep during a performance.</div>

<h2>Navigating a Set</h2>
<p>When presenting a set, semi-transparent <strong>‹</strong> and <strong>›</strong> chevrons appear on the left and right edges of the content area. Tap the left edge to go back one song; tap the right edge to go forward. You can also use the keyboard arrow keys or Page Up / Page Down.</p>
<p><strong>Starting from any song:</strong> select a song in the Setlist column by tapping its row, then tap <strong>▶ Present</strong>. Presentation starts from that song and continues forward through the rest of the set.</p>

<h2>Editing During Performance</h2>
<p>Tap <strong>Edit</strong> in the top bar to open the current song directly in the editor without leaving your performance session. Present mode closes and the editor opens with the song ready to edit.</p>
<p>While in this edit session, the <strong>▶ Present</strong> button in the editor header changes to <strong>↩ Return to Performance</strong>. Tap it to go straight back to Present mode — the song content updates immediately to reflect any changes you made, with no save required.</p>
<p>When you edit from a set, the editor also shows <strong>← Prev / Next →</strong> buttons so you can move through the other songs in the set and edit them too, without leaving the editor. Return to Performance resumes on whichever song you are editing.</p>
<p>If you tap <strong>✕ Library</strong> instead, the performance session ends. The <strong>↩ Return to Performance</strong> button reverts to the normal <strong>▶ Present</strong> button and you would need to restart the presentation from the Sets panel.</p>
<div class="tip"><strong>Tip:</strong> Use this to fix a wrong chord or lyric mid-rehearsal without interrupting the flow. Edits are reflected immediately when you return — save the song separately when you are ready to make the change permanent.</div>

<!-- 8 -->
<h1>8. Shared Sets</h1>
<p>You can share a set with anyone using a private link — they can view the songs and present them without needing a Cue account.</p>

<h2>Publishing a Shared Set</h2>
<p>In the Sets column, tap the <strong>share icon</strong> on a set row to open the Publish dialog. You must be signed in (via Settings → Account) to publish. Once published, a private link is generated that you can copy and share.</p>
<p>The link stays live until you revoke it. Recipients see the set in a read-only viewer — they cannot edit songs or see your full library. If you update the set after publishing, tap the share icon again to republish with the latest content.</p>

<h2>Viewing a Shared Set</h2>
<p>Open the shared link on any device. The viewer shows the set name and song list. From the viewer you can:</p>
<ul>
  <li><strong>▶ Present All</strong> — launches Present mode starting from the first song, or from any song you tap <strong>▶</strong> on in the list</li>
  <li><strong>View Key</strong> — transpose the display for any individual song (stored locally, never sent to the server)</li>
  <li><strong>Copy to library</strong> — copy an individual song or the entire set to your local Cue library</li>
  <li><strong>Bookmark</strong> — save the shared link to a <em>Shared with me</em> list in your local Cue install for quick access later</li>
  <li><strong>⚙ Settings</strong> — open the Settings panel to change theme, chord color, and chord label size. Changes apply immediately to the viewer and persist across sessions.</li>
  <li><strong>Open Cue</strong> — navigate to the main Cue app</li>
</ul>
<div class="tip"><strong>Note:</strong> Viewing a shared set is entirely read-only. Nothing the viewer does (key changes, bookmarks, copies) is written back to the shared set or the publisher's account.</div>

<!-- 9 -->
<h1>9. File Formats</h1>

<h2>ChordPro (.cho / .chopro)</h2>
<p>The standard ChordPro format. Cue reads and writes these directives at the top of the file:</p>
<pre>{title: Here Comes the Sun}
{artist: The Beatles}
{key: A}
{tempo: 129}
{duration: 3:06}
{timesig: 3/4}</pre>
<p>The <code>{timesig:}</code> directive is only written when the song is in 3/4 — 4/4 is the default and is omitted to keep files compatible with other apps.</p>

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

<!-- 10 -->
<h1>10. Keyboard Shortcuts</h1>
<table>
  <tr><th>Key</th><th>Action</th></tr>
  <tr><td><code>Cmd / Ctrl + F</code></td><td>Open Find &amp; Replace in the editor (also available via the <strong>Find</strong> toolbar button)</td></tr>
  <tr><td><code>Space</code></td><td>Start / pause auto-scroll in Present mode</td></tr>
  <tr><td><code>← / Page Up</code></td><td>Previous song (Present mode, sets only)</td></tr>
  <tr><td><code>→ / Page Down</code></td><td>Next song (Present mode, sets only)</td></tr>
  <tr><td><code>+ / =</code></td><td>Increase font size in Present mode</td></tr>
  <tr><td><code>−</code></td><td>Decrease font size in Present mode</td></tr>
  <tr><td><code>Escape</code></td><td>Exit Present mode / close Find bar</td></tr>
</table>

<!-- 11 -->
<h1>11. Tips</h1>
<ul>
  <li><strong>Auto-detect key</strong> — tap the wand icon next to the Key field in the metadata bar to score all chords in the song against every major and minor key. If the result is clear (≥90% match), the key fills in automatically. If the song is ambiguous, a small popover lets you pick from the top candidates with their match percentage shown.</li>
  <li><strong>Theme and chord color</strong> — open Settings (⚙ gear in the Library header) to switch between Light and Dark mode and to choose a chord color. These settings apply everywhere including Present mode and the shared-set viewer.</li>
  <li><strong>Chord label size</strong> — use the Chord label size control in Settings to make chord names above lyrics larger or smaller. This is useful if your display is small or if you are mirroring to a screen from a distance.</li>
  <li><strong>YouTube URL</strong> — paste a YouTube link into the metadata bar to keep a reference track alongside the song. Tap the YouTube button in the editor or Present mode toolbar to open it in an overlay player. Useful for learning a song or playing along during rehearsal. The button is grayed out when no URL is set.</li>
  <li><strong>Non-destructive key changes</strong> — use View Key in the editor to render a song in a different key for you or your bandmates. It changes only how the song displays in the preview, Present mode, and the exported set PDF, never the stored chords, and is saved per song so it reopens the same way.</li>
  <li><strong>3/4 songs</strong> — tap the <strong>4/4</strong> button in the Tempo row to switch to <strong>3/4</strong>. Save the song. The metronome and flash mode will automatically use 6 beats when you present it.</li>
  <li><strong>Ghost controls in Present mode</strong> — the A−/A+ text-size buttons and the Prev/Next chevrons are ghost overlays that fade after 4 seconds. Tap anywhere on the content to wake them. They won't interfere with vertical scrolling.</li>
  <li><strong>Starting a set at any song</strong> — tap a song row in the Setlist column to select it (highlighted in indigo), then tap <strong>▶ Present</strong>. Presentation starts from that song and continues forward; the set does not restart from the top.</li>
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
