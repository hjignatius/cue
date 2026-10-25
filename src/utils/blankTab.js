// A blank tab to fill in, inserted from the editor's Ω menu.
//
// One line per string, highest string on top as tab is read, each a name, a
// bar and a run of dashes. That is exactly what isTabLine looks for, so the
// block is kept as text and never mistaken for chords — and it stays so after
// frets are typed in, since the dash run only has to be four long somewhere.
//
// Repeated names are the guitar's two Es: the higher one is written in lower
// case ("e"), the usual way to tell them apart. Names are padded to one width
// so the bars line up whatever the tuning.

// With no instrument chosen ('none' has no strings) the tab is drawn for Cue's
// default, the GCEA ukulele.
const FALLBACK_TUNING = ['G', 'C', 'E', 'A'];
export const BLANK_TAB_DASHES = 16;

// Strings top to bottom as they appear in the tab, for the menu's label too.
export function tabStringNames(tuning) {
  const low = tuning?.length ? tuning : FALLBACK_TUNING;
  const top = [...low].reverse();
  return top.map((name, i) => top.indexOf(name) === i && top.lastIndexOf(name) !== i ? name.toLowerCase() : name);
}

export function blankTab(tuning, dashes = BLANK_TAB_DASHES) {
  const names = tabStringNames(tuning);
  const width = Math.max(...names.map(n => n.length));
  return names.map(n => `${n.padEnd(width)}|${'-'.repeat(dashes)}|`).join('\n');
}

// Put `block` into `text` in place of the selection start..end, on lines of its
// own: a newline is added before it if the cursor is mid-line, and after it if
// anything follows on that line, so a lyric is never split around the tab.
// Returns the new text and where the caret goes — the first dash of the top
// string, ready to type over.
export function insertBlock(text, start, end, block) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before === '' || before.endsWith('\n') ? '' : '\n';
  const trail = after === '' || after.startsWith('\n') ? '' : '\n';
  const next = before + lead + block + trail + after;
  const caret = before.length + lead.length + block.indexOf('|') + 1;
  return { text: next, caret };
}
