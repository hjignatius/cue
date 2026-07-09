// Normalise a string for matching: lower-case, collapse curly quotes/apostrophes
// to their straight equivalents, strip all remaining punctuation, collapse whitespace.
export function normalizeStr(str) {
  return (str || '')
    .replace(/[‘’‚‛′‵`]/g, "'")  // curly apostrophes → '
    .replace(/[“”„‟″‶]/g, '"')          // curly quotes → "
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')   // strip all punctuation (incl. now-normalised quotes)
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse an HTML file that contains a single song table with columns:
// Title, Artist, Key (Capo and any others are ignored).
// Returns { songs, setName } on success, or { error: string } on failure.
export function parseHtmlSet(html, filename) {
  const doc   = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return { error: 'No table found in this HTML file.' };

  // Locate header cells — prefer thead, fall back to first row
  const headerEls = table.querySelectorAll('thead tr:first-child th, thead tr:first-child td');
  const headers   = headerEls.length > 0
    ? Array.from(headerEls).map(el => el.textContent.trim().toLowerCase())
    : Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td'))
        .map(el => el.textContent.trim().toLowerCase());

  const col = {
    title:  headers.findIndex(h => h === 'title'),
    artist: headers.findIndex(h => h === 'artist'),
    key:    headers.findIndex(h => h === 'key'),
  };

  if (col.title === -1) return { error: 'No "Title" column found in the table.' };

  // Data rows: prefer tbody, otherwise all rows minus the header row
  const dataRows = table.querySelector('tbody')
    ? Array.from(table.querySelectorAll('tbody tr'))
    : Array.from(table.querySelectorAll('tr')).slice(1);

  const songs = dataRows
    .map(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      return {
        title:  cells[col.title]?.textContent?.trim()  ?? '',
        artist: col.artist !== -1 ? (cells[col.artist]?.textContent?.trim() ?? '') : '',
        key:    col.key    !== -1 ? (cells[col.key]?.textContent?.trim()    ?? '') : '',
      };
    })
    .filter(s => s.title.length > 0);

  if (songs.length === 0) return { error: 'No song rows found in the table.' };

  const setName = filename.replace(/\.html?$/i, '').trim() || 'Imported Set';
  return { songs, setName };
}

// Find the best library match for an imported row.
// Primary:   normalised title + normalised artist (when both sides have an artist).
// Fallback:  normalised title only.
// Returns the matching song object, or null.
export function matchSong(row, librarySongs) {
  const normTitle  = normalizeStr(row.title);
  const normArtist = normalizeStr(row.artist);
  if (!normTitle) return null;

  if (normArtist) {
    const withArtist = librarySongs.find(s =>
      normalizeStr(s.metadata?.title)  === normTitle &&
      normalizeStr(s.metadata?.artist) === normArtist
    );
    if (withArtist) return withArtist;
  }

  return librarySongs.find(s => normalizeStr(s.metadata?.title) === normTitle) ?? null;
}
