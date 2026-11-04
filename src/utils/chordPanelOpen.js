// Whether Present's chord panel is open for the song on screen.
//
// The panel lists the chord names typed into a song's text, so a song with none
// has nothing to put in it: just "No chords detected", in a column taken from
// the lyrics or the PDF page. Most often that's a PDF with its chords printed on
// the page, where the diagrams would have been a repeat anyway.
//
// So such a song keeps the panel closed, unless C is pressed on it. That press
// is for that song only and leaves showChords alone: a song with no chords
// neither opens nor closes the panel for the rest of the set.

import { detectChords } from './chordDetect.js';
import { convertToBrackets } from './chordStyle.js';

// The same reading the panel makes of the text, so the two can't disagree about
// which songs have nothing to list.
export function songHasChords(text) {
  return detectChords(convertToBrackets(text || '')).length > 0;
}

export function chordPanelOpen({ hasChords, showChords, openedForThisSong }) {
  return hasChords ? showChords : openedForThisSong;
}
