// Ukulele chord fingerings verified against ukutabs.com
// frets = [G string, C string, E string, A string]
// 0 = open string, number = fret position

export const UKULELE_CHORDS = [
  // ── Major ──────────────────────────────────────────────────────────────────
  { name: 'C',  type: 'major', frets: [0, 0, 0, 3] },
  { name: 'C#', type: 'major', frets: [1, 1, 1, 4] },
  { name: 'Db', type: 'major', frets: [1, 1, 1, 4] },
  { name: 'D',  type: 'major', frets: [2, 2, 2, 0] },
  { name: 'D#', type: 'major', frets: [3, 3, 3, 1] },
  { name: 'Eb', type: 'major', frets: [3, 3, 3, 1] },
  { name: 'E',  type: 'major', frets: [4, 4, 4, 2] },
  { name: 'F',  type: 'major', frets: [2, 0, 1, 0] },
  { name: 'F#', type: 'major', frets: [3, 1, 2, 1] },
  { name: 'Gb', type: 'major', frets: [3, 1, 2, 1] },
  { name: 'G',  type: 'major', frets: [0, 2, 3, 2] },
  { name: 'G#', type: 'major', frets: [5, 3, 4, 3] },
  { name: 'Ab', type: 'major', frets: [5, 3, 4, 3] },
  { name: 'A',  type: 'major', frets: [2, 1, 0, 0] },
  { name: 'A#', type: 'major', frets: [3, 2, 1, 1] },
  { name: 'Bb', type: 'major', frets: [3, 2, 1, 1] },
  { name: 'B',  type: 'major', frets: [4, 3, 2, 2] },

  // ── Minor ──────────────────────────────────────────────────────────────────
  { name: 'Cm',  type: 'minor', frets: [0, 3, 3, 3] },
  { name: 'C#m', type: 'minor', frets: [1, 1, 0, 4] },
  { name: 'Dbm', type: 'minor', frets: [1, 1, 0, 4] },
  { name: 'Dm',  type: 'minor', frets: [2, 2, 1, 0] },
  { name: 'D#m', type: 'minor', frets: [3, 3, 2, 1] },
  { name: 'Ebm', type: 'minor', frets: [3, 3, 2, 1] },
  { name: 'Em',  type: 'minor', frets: [0, 4, 3, 2] },
  { name: 'Fm',  type: 'minor', frets: [1, 0, 1, 3] },
  { name: 'F#m', type: 'minor', frets: [2, 1, 2, 0] },
  { name: 'Gbm', type: 'minor', frets: [2, 1, 2, 0] },
  { name: 'Gm',  type: 'minor', frets: [0, 2, 3, 1] },
  { name: 'G#m', type: 'minor', frets: [4, 3, 4, 2] },
  { name: 'Abm', type: 'minor', frets: [4, 3, 4, 2] },
  { name: 'Am',  type: 'minor', frets: [2, 0, 0, 0] },
  { name: 'A#m', type: 'minor', frets: [3, 1, 1, 1] },
  { name: 'Bbm', type: 'minor', frets: [3, 1, 1, 1] },
  { name: 'Bm',  type: 'minor', frets: [4, 2, 2, 2] },

  // ── Dominant 7th ───────────────────────────────────────────────────────────
  { name: 'C7',  type: 'dom7', frets: [0, 0, 0, 1] },
  { name: 'C#7', type: 'dom7', frets: [1, 1, 1, 2] },
  { name: 'Db7', type: 'dom7', frets: [1, 1, 1, 2] },
  { name: 'D7',  type: 'dom7', frets: [2, 2, 2, 3] },
  { name: 'D#7', type: 'dom7', frets: [3, 3, 3, 4] },
  { name: 'Eb7', type: 'dom7', frets: [3, 3, 3, 4] },
  { name: 'E7',  type: 'dom7', frets: [1, 2, 0, 2] },
  { name: 'F7',  type: 'dom7', frets: [2, 3, 1, 0] },
  { name: 'F#7', type: 'dom7', frets: [3, 4, 2, 1] },
  { name: 'Gb7', type: 'dom7', frets: [3, 4, 2, 1] },
  { name: 'G7',  type: 'dom7', frets: [0, 2, 1, 2] },
  { name: 'G#7', type: 'dom7', frets: [1, 3, 2, 3] },
  { name: 'Ab7', type: 'dom7', frets: [1, 3, 2, 3] },
  { name: 'A7',  type: 'dom7', frets: [0, 1, 0, 0] },
  { name: 'A#7', type: 'dom7', frets: [1, 2, 1, 1] },
  { name: 'Bb7', type: 'dom7', frets: [1, 2, 1, 1] },
  { name: 'B7',  type: 'dom7', frets: [2, 3, 2, 2] },

  // ── Major 7th ──────────────────────────────────────────────────────────────
  { name: 'Cmaj7',  type: 'maj7', frets: [0, 0, 0, 2] },
  { name: 'C#maj7', type: 'maj7', frets: [1, 1, 1, 3] },
  { name: 'Dbmaj7', type: 'maj7', frets: [1, 1, 1, 3] },
  { name: 'Dmaj7',  type: 'maj7', frets: [2, 2, 2, 4] },
  { name: 'D#maj7', type: 'maj7', frets: [3, 3, 3, 5] },
  { name: 'Ebmaj7', type: 'maj7', frets: [3, 3, 3, 5] },
  { name: 'Emaj7',  type: 'maj7', frets: [1, 3, 0, 2] },
  { name: 'Fmaj7',  type: 'maj7', frets: [2, 4, 1, 0] },
  { name: 'F#maj7', type: 'maj7', frets: [3, 5, 2, 1] },
  { name: 'Gbmaj7', type: 'maj7', frets: [3, 5, 2, 1] },
  { name: 'Gmaj7',  type: 'maj7', frets: [0, 2, 2, 2] },
  { name: 'G#maj7', type: 'maj7', frets: [1, 3, 3, 3] },
  { name: 'Abmaj7', type: 'maj7', frets: [1, 3, 3, 3] },
  { name: 'Amaj7',  type: 'maj7', frets: [1, 1, 0, 0] },
  { name: 'A#maj7', type: 'maj7', frets: [2, 2, 1, 1] },
  { name: 'Bbmaj7', type: 'maj7', frets: [2, 2, 1, 1] },
  { name: 'Bmaj7',  type: 'maj7', frets: [3, 3, 2, 2] },

  // ── Minor 7th ──────────────────────────────────────────────────────────────
  { name: 'Cm7',  type: 'min7', frets: [3, 3, 3, 3] },
  { name: 'C#m7', type: 'min7', frets: [4, 4, 4, 4] },
  { name: 'Dbm7', type: 'min7', frets: [4, 4, 4, 4] },
  { name: 'Dm7',  type: 'min7', frets: [2, 2, 1, 3] },
  { name: 'D#m7', type: 'min7', frets: [3, 3, 2, 4] },
  { name: 'Ebm7', type: 'min7', frets: [3, 3, 2, 4] },
  { name: 'Em7',  type: 'min7', frets: [0, 2, 0, 2] },
  { name: 'Fm7',  type: 'min7', frets: [1, 3, 1, 3] },
  { name: 'F#m7', type: 'min7', frets: [2, 4, 2, 4] },
  { name: 'Gbm7', type: 'min7', frets: [2, 4, 2, 4] },
  { name: 'Gm7',  type: 'min7', frets: [0, 2, 1, 1] },
  { name: 'G#m7', type: 'min7', frets: [1, 3, 2, 2] },
  { name: 'Abm7', type: 'min7', frets: [1, 3, 2, 2] },
  { name: 'Am7',  type: 'min7', frets: [0, 0, 0, 0] },
  { name: 'A#m7', type: 'min7', frets: [1, 1, 1, 1] },
  { name: 'Bbm7', type: 'min7', frets: [1, 1, 1, 1] },
  { name: 'Bm7',  type: 'min7', frets: [2, 2, 2, 2] },

  // ── Half-diminished (m7b5) ─────────────────────────────────────────────────
  { name: 'Cm7b5',  type: 'm7b5', frets: [3, 3, 2, 3] },
  { name: 'C#m7b5', type: 'm7b5', frets: [0, 1, 0, 2] },
  { name: 'Dbm7b5', type: 'm7b5', frets: [0, 1, 0, 2] },
  { name: 'Dm7b5',  type: 'm7b5', frets: [1, 2, 1, 3] },
  { name: 'D#m7b5', type: 'm7b5', frets: [2, 3, 2, 4] },
  { name: 'Ebm7b5', type: 'm7b5', frets: [2, 3, 2, 4] },
  { name: 'Em7b5',  type: 'm7b5', frets: [0, 2, 0, 1] },
  { name: 'Fm7b5',  type: 'm7b5', frets: [1, 3, 1, 2] },
  { name: 'F#m7b5', type: 'm7b5', frets: [2, 4, 2, 3] },
  { name: 'Gbm7b5', type: 'm7b5', frets: [2, 4, 2, 3] },
  { name: 'Gm7b5',  type: 'm7b5', frets: [0, 1, 1, 1] },
  { name: 'G#m7b5', type: 'm7b5', frets: [1, 2, 2, 2] },
  { name: 'Abm7b5', type: 'm7b5', frets: [1, 2, 2, 2] },
  { name: 'Am7b5',  type: 'm7b5', frets: [2, 3, 3, 3] },
  { name: 'A#m7b5', type: 'm7b5', frets: [3, 4, 4, 4] },
  { name: 'Bbm7b5', type: 'm7b5', frets: [3, 4, 4, 4] },
  { name: 'Bm7b5',  type: 'm7b5', frets: [2, 2, 1, 2] },

  // ── Dominant 9th ───────────────────────────────────────────────────────────
  { name: 'C9',  type: 'dom9', frets: [0, 2, 0, 1] },
  { name: 'C#9', type: 'dom9', frets: [1, 3, 1, 2] },
  { name: 'Db9', type: 'dom9', frets: [1, 3, 1, 2] },
  { name: 'D9',  type: 'dom9', frets: [2, 0, 2, 0] },
  { name: 'D#9', type: 'dom9', frets: [0, 3, 1, 4] },
  { name: 'Eb9', type: 'dom9', frets: [0, 3, 1, 4] },
  { name: 'E9',  type: 'dom9', frets: [1, 4, 2, 5] },
  { name: 'F9',  type: 'dom9', frets: [2, 3, 3, 0] },
  { name: 'F#9', type: 'dom9', frets: [3, 4, 4, 1] },
  { name: 'Gb9', type: 'dom9', frets: [3, 4, 4, 1] },
  { name: 'G9',  type: 'dom9', frets: [0, 2, 1, 0] },
  { name: 'G#9', type: 'dom9', frets: [1, 3, 2, 1] },
  { name: 'Ab9', type: 'dom9', frets: [1, 3, 2, 1] },
  { name: 'A9',  type: 'dom9', frets: [0, 1, 0, 2] },
  { name: 'A#9', type: 'dom9', frets: [1, 2, 1, 3] },
  { name: 'Bb9', type: 'dom9', frets: [1, 2, 1, 3] },
  { name: 'B9',  type: 'dom9', frets: [2, 3, 2, 4] },

  // ── Sus2 ───────────────────────────────────────────────────────────────────
  { name: 'Csus2',  type: 'sus2', frets: [0, 2, 3, 3] },
  { name: 'C#sus2', type: 'sus2', frets: [1, 3, 4, 4] },
  { name: 'Dbsus2', type: 'sus2', frets: [1, 3, 4, 4] },
  { name: 'Dsus2',  type: 'sus2', frets: [2, 2, 0, 0] },
  { name: 'D#sus2', type: 'sus2', frets: [3, 3, 1, 1] },
  { name: 'Ebsus2', type: 'sus2', frets: [3, 3, 1, 1] },
  { name: 'Esus2',  type: 'sus2', frets: [4, 4, 2, 2] },
  { name: 'Fsus2',  type: 'sus2', frets: [0, 0, 1, 3] },
  { name: 'F#sus2', type: 'sus2', frets: [1, 1, 2, 4] },
  { name: 'Gbsus2', type: 'sus2', frets: [1, 1, 2, 4] },
  { name: 'Gsus2',  type: 'sus2', frets: [0, 2, 3, 0] },
  { name: 'G#sus2', type: 'sus2', frets: [1, 3, 4, 1] },
  { name: 'Absus2', type: 'sus2', frets: [1, 3, 4, 1] },
  { name: 'Asus2',  type: 'sus2', frets: [4, 4, 0, 0] },
  { name: 'A#sus2', type: 'sus2', frets: [3, 0, 1, 1] },
  { name: 'Bbsus2', type: 'sus2', frets: [3, 0, 1, 1] },
  { name: 'Bsus2',  type: 'sus2', frets: [4, 1, 2, 2] },

  // ── Sus4 ───────────────────────────────────────────────────────────────────
  { name: 'Csus4',  type: 'sus4', frets: [0, 0, 1, 3] },
  { name: 'C#sus4', type: 'sus4', frets: [1, 1, 2, 4] },
  { name: 'Dbsus4', type: 'sus4', frets: [1, 1, 2, 4] },
  { name: 'Dsus4',  type: 'sus4', frets: [0, 2, 3, 0] },
  { name: 'D#sus4', type: 'sus4', frets: [1, 3, 4, 1] },
  { name: 'Ebsus4', type: 'sus4', frets: [1, 3, 4, 1] },
  { name: 'Esus4',  type: 'sus4', frets: [2, 4, 5, 2] },
  { name: 'Fsus4',  type: 'sus4', frets: [3, 0, 1, 1] },
  { name: 'F#sus4', type: 'sus4', frets: [4, 1, 2, 2] },
  { name: 'Gbsus4', type: 'sus4', frets: [4, 1, 2, 2] },
  { name: 'Gsus4',  type: 'sus4', frets: [0, 2, 3, 3] },
  { name: 'G#sus4', type: 'sus4', frets: [1, 3, 4, 4] },
  { name: 'Absus4', type: 'sus4', frets: [1, 3, 4, 4] },
  { name: 'Asus4',  type: 'sus4', frets: [2, 2, 0, 0] },
  { name: 'A#sus4', type: 'sus4', frets: [3, 3, 1, 1] },
  { name: 'Bbsus4', type: 'sus4', frets: [3, 3, 1, 1] },
  { name: 'Bsus4',  type: 'sus4', frets: [4, 4, 2, 2] },

  // ── 7sus4 ──────────────────────────────────────────────────────────────────
  { name: 'C7sus4',  type: '7sus4', frets: [0, 0, 1, 1] },
  { name: 'C#7sus4', type: '7sus4', frets: [1, 1, 2, 2] },
  { name: 'Db7sus4', type: '7sus4', frets: [1, 1, 2, 2] },
  { name: 'D7sus4',  type: '7sus4', frets: [2, 2, 3, 3] },
  { name: 'D#7sus4', type: '7sus4', frets: [3, 3, 4, 4] },
  { name: 'Eb7sus4', type: '7sus4', frets: [3, 3, 4, 4] },
  { name: 'E7sus4',  type: '7sus4', frets: [2, 2, 0, 2] },
  { name: 'F7sus4',  type: '7sus4', frets: [3, 3, 1, 3] },
  { name: 'F#7sus4', type: '7sus4', frets: [4, 4, 2, 4] },
  { name: 'Gb7sus4', type: '7sus4', frets: [4, 4, 2, 4] },
  { name: 'G7sus4',  type: '7sus4', frets: [0, 2, 1, 3] },
  { name: 'G#7sus4', type: '7sus4', frets: [1, 3, 2, 4] },
  { name: 'Ab7sus4', type: '7sus4', frets: [1, 3, 2, 4] },
  { name: 'A7sus4',  type: '7sus4', frets: [0, 2, 0, 0] },
  { name: 'A#7sus4', type: '7sus4', frets: [1, 3, 1, 1] },
  { name: 'Bb7sus4', type: '7sus4', frets: [1, 3, 1, 1] },
  { name: 'B7sus4',  type: '7sus4', frets: [4, 4, 2, 0] },

  // ── Augmented ──────────────────────────────────────────────────────────────
  { name: 'Caug',  type: 'aug', frets: [1, 0, 0, 3] },
  { name: 'C#aug', type: 'aug', frets: [2, 1, 1, 4] },
  { name: 'Dbaug', type: 'aug', frets: [2, 1, 1, 4] },
  { name: 'Daug',  type: 'aug', frets: [3, 2, 2, 1] },
  { name: 'D#aug', type: 'aug', frets: [0, 3, 3, 2] },
  { name: 'Ebaug', type: 'aug', frets: [0, 3, 3, 2] },
  { name: 'Eaug',  type: 'aug', frets: [1, 0, 0, 3] },
  { name: 'Faug',  type: 'aug', frets: [2, 1, 1, 0] },
  { name: 'F#aug', type: 'aug', frets: [3, 2, 2, 1] },
  { name: 'Gbaug', type: 'aug', frets: [3, 2, 2, 1] },
  { name: 'Gaug',  type: 'aug', frets: [0, 3, 3, 2] },
  { name: 'G#aug', type: 'aug', frets: [1, 0, 0, 3] },
  { name: 'Abaug', type: 'aug', frets: [1, 0, 0, 3] },
  { name: 'Aaug',  type: 'aug', frets: [2, 1, 1, 0] },
  { name: 'A#aug', type: 'aug', frets: [3, 2, 2, 1] },
  { name: 'Bbaug', type: 'aug', frets: [3, 2, 2, 1] },
  { name: 'Baug',  type: 'aug', frets: [0, 3, 3, 2] },

  // ── Diminished ─────────────────────────────────────────────────────────────
  { name: 'Cdim',  type: 'dim', frets: [2, 3, 2, 3] },
  { name: 'C#dim', type: 'dim', frets: [3, 4, 3, 4] },
  { name: 'Dbdim', type: 'dim', frets: [3, 4, 3, 4] },
  { name: 'Ddim',  type: 'dim', frets: [1, 2, 1, 2] },
  { name: 'D#dim', type: 'dim', frets: [2, 3, 2, 3] },
  { name: 'Ebdim', type: 'dim', frets: [2, 3, 2, 3] },
  { name: 'Edim',  type: 'dim', frets: [3, 4, 3, 4] },
  { name: 'Fdim',  type: 'dim', frets: [1, 2, 4, 2] },
  { name: 'F#dim', type: 'dim', frets: [2, 3, 5, 3] },
  { name: 'Gbdim', type: 'dim', frets: [2, 3, 5, 3] },
  { name: 'Gdim',  type: 'dim', frets: [0, 1, 3, 1] },
  { name: 'G#dim', type: 'dim', frets: [1, 2, 4, 2] },
  { name: 'Abdim', type: 'dim', frets: [1, 2, 4, 2] },
  { name: 'Adim',  type: 'dim', frets: [2, 3, 2, 3] },
  { name: 'A#dim', type: 'dim', frets: [3, 4, 3, 4] },
  { name: 'Bbdim', type: 'dim', frets: [3, 4, 3, 4] },
  { name: 'Bdim',  type: 'dim', frets: [1, 2, 1, 2] },

  // ── 6th ────────────────────────────────────────────────────────────────────
  { name: 'C6',  type: '6th', frets: [0, 0, 0, 0] },
  { name: 'C#6', type: '6th', frets: [1, 1, 1, 1] },
  { name: 'Db6', type: '6th', frets: [1, 1, 1, 1] },
  { name: 'D6',  type: '6th', frets: [2, 2, 2, 2] },
  { name: 'D#6', type: '6th', frets: [3, 3, 3, 3] },
  { name: 'Eb6', type: '6th', frets: [3, 3, 3, 3] },
  { name: 'E6',  type: '6th', frets: [1, 1, 0, 2] },
  { name: 'F6',  type: '6th', frets: [2, 2, 1, 3] },
  { name: 'F#6', type: '6th', frets: [3, 3, 2, 4] },
  { name: 'Gb6', type: '6th', frets: [3, 3, 2, 4] },
  { name: 'G6',  type: '6th', frets: [0, 2, 0, 2] },
  { name: 'G#6', type: '6th', frets: [1, 3, 1, 3] },
  { name: 'Ab6', type: '6th', frets: [1, 3, 1, 3] },
  { name: 'A6',  type: '6th', frets: [2, 4, 2, 4] },
  { name: 'A#6', type: '6th', frets: [0, 2, 1, 1] },
  { name: 'Bb6', type: '6th', frets: [0, 2, 1, 1] },
  { name: 'B6',  type: '6th', frets: [1, 3, 2, 2] },

  // ── Altered dominants and colour chords ────────────────────────────────────
  //
  // DERIVED, NOT RECALLED, and added because the ukulele library did not have
  // them while baritone and guitar did: a chart writing E7-9 found no shape at
  // all. scripts/generateChords.mjs enumerates every fingering on the neck,
  // keeps the ones whose notes are right, and ranks what is left by how hard it
  // is to hold — a ranking calibrated against the 170 shipped shapes it could be
  // checked against, where its first pick agreed 134 times and was in its top
  // five 165 times.
  //
  // So these are right on the NOTES by construction, which is not the same as
  // feeling good under the hand. The comment on each line is what it sounds.

  // ── 7b9 ────────────────────────────────────────────────────────────────────
  // Rootless, as this chord is voiced everywhere on four strings: five notes do
  // not fit, and the 3rd, b7 and b9 are what make the sound. Each is a
  // diminished 7th shape, which is what a rootless 7b9 is.
  { name: 'C7b9',   type: 'dom7',    frets: [0, 1, 0, 1] },  // G C# E A#
  { name: 'C#7b9',  type: 'dom7',    frets: [1, 2, 1, 2] },  // G# D F B  (3 fingers)
  { name: 'Db7b9',  type: 'dom7',    frets: [1, 2, 1, 2] },  // G# D F B  (3 fingers)
  { name: 'D7b9',   type: 'dom7',    frets: [2, 3, 2, 3] },  // A D# F# C  (3 fingers)
  { name: 'D#7b9',  type: 'dom7',    frets: [0, 1, 0, 1] },  // G C# E A#
  { name: 'Eb7b9',  type: 'dom7',    frets: [0, 1, 0, 1] },  // G C# E A#
  { name: 'E7b9',   type: 'dom7',    frets: [1, 2, 1, 2] },  // G# D F B  (3 fingers)
  { name: 'F7b9',   type: 'dom7',    frets: [2, 3, 2, 3] },  // A D# F# C  (3 fingers)
  { name: 'F#7b9',  type: 'dom7',    frets: [0, 1, 0, 1] },  // G C# E A#
  { name: 'Gb7b9',  type: 'dom7',    frets: [0, 1, 0, 1] },  // G C# E A#
  { name: 'G7b9',   type: 'dom7',    frets: [1, 2, 1, 2] },  // G# D F B  (3 fingers)
  { name: 'G#7b9',  type: 'dom7',    frets: [1, 0, 2, 0] },  // G# C F# A
  { name: 'Ab7b9',  type: 'dom7',    frets: [1, 0, 2, 0] },  // G# C F# A
  { name: 'A7b9',   type: 'dom7',    frets: [0, 1, 0, 1] },  // G C# E A#
  { name: 'A#7b9',  type: 'dom7',    frets: [1, 2, 1, 2] },  // G# D F B  (3 fingers)
  { name: 'Bb7b9',  type: 'dom7',    frets: [1, 2, 1, 2] },  // G# D F B  (3 fingers)
  { name: 'B7b9',   type: 'dom7',    frets: [2, 3, 2, 3] },  // A D# F# C  (3 fingers)

  // ── 7#5 ────────────────────────────────────────────────────────────────────
  { name: 'C7#5',   type: 'dom7',    frets: [1, 0, 0, 1] },  // G# C E A#
  { name: 'C#7#5',  type: 'dom7',    frets: [2, 1, 1, 2] },  // A C# F B  (3 fingers)
  { name: 'Db7#5',  type: 'dom7',    frets: [2, 1, 1, 2] },  // A C# F B  (3 fingers)
  { name: 'D7#5',   type: 'dom7',    frets: [3, 2, 2, 3] },  // A# D F# C  (3 fingers)
  { name: 'D#7#5',  type: 'dom7',    frets: [4, 3, 3, 4] },  // B D# G C#  (3 fingers)
  { name: 'Eb7#5',  type: 'dom7',    frets: [4, 3, 3, 4] },  // B D# G C#  (3 fingers)
  { name: 'E7#5',   type: 'dom7',    frets: [1, 2, 0, 3] },  // G# D E C  (3 fingers)
  { name: 'F7#5',   type: 'dom7',    frets: [6, 5, 5, 6] },  // C# F A D#  (3 fingers)
  { name: 'F#7#5',  type: 'dom7',    frets: [7, 6, 6, 7] },  // D F# A# E  (3 fingers)
  { name: 'Gb7#5',  type: 'dom7',    frets: [7, 6, 6, 7] },  // D F# A# E  (3 fingers)
  { name: 'G7#5',   type: 'dom7',    frets: [0, 3, 1, 2] },  // G D# F B  (3 fingers)
  { name: 'G#7#5',  type: 'dom7',    frets: [1, 4, 2, 3] },  // G# E F# C  (4 fingers)
  { name: 'Ab7#5',  type: 'dom7',    frets: [1, 4, 2, 3] },  // G# E F# C  (4 fingers)
  { name: 'A7#5',   type: 'dom7',    frets: [0, 1, 1, 0] },  // G C# F A
  { name: 'A#7#5',  type: 'dom7',    frets: [1, 2, 2, 1] },  // G# D F# A#  (3 fingers)
  { name: 'Bb7#5',  type: 'dom7',    frets: [1, 2, 2, 1] },  // G# D F# A#  (3 fingers)
  { name: 'B7#5',   type: 'dom7',    frets: [4, 3, 3, 0] },  // B D# G A

  // ── Minor 6th ──────────────────────────────────────────────────────────────
  { name: 'Cm6',    type: '6th',     frets: [5, 3, 3, 0] },  // C D# G A
  { name: 'C#m6',   type: '6th',     frets: [1, 1, 0, 1] },  // G# C# E A#
  { name: 'Dbm6',   type: '6th',     frets: [1, 1, 0, 1] },  // G# C# E A#
  { name: 'Dm6',    type: '6th',     frets: [2, 2, 1, 2] },  // A D F B  (4 fingers)
  { name: 'D#m6',   type: '6th',     frets: [3, 3, 2, 3] },  // A# D# F# C  (4 fingers)
  { name: 'Ebm6',   type: '6th',     frets: [3, 3, 2, 3] },  // A# D# F# C  (4 fingers)
  { name: 'Em6',    type: '6th',     frets: [0, 1, 0, 2] },  // G C# E B
  { name: 'Fm6',    type: '6th',     frets: [1, 2, 1, 3] },  // G# D F C  (3 fingers)
  { name: 'F#m6',   type: '6th',     frets: [2, 3, 2, 0] },  // A D# F# A
  { name: 'Gbm6',   type: '6th',     frets: [2, 3, 2, 0] },  // A D# F# A
  { name: 'Gm6',    type: '6th',     frets: [0, 2, 0, 1] },  // G D E A#
  { name: 'G#m6',   type: '6th',     frets: [1, 3, 1, 2] },  // G# D# F B  (3 fingers)
  { name: 'Abm6',   type: '6th',     frets: [1, 3, 1, 2] },  // G# D# F B  (3 fingers)
  { name: 'Am6',    type: '6th',     frets: [2, 0, 2, 0] },  // A C F# A
  { name: 'A#m6',   type: '6th',     frets: [0, 1, 1, 1] },  // G C# F A#
  { name: 'Bbm6',   type: '6th',     frets: [0, 1, 1, 1] },  // G C# F A#
  { name: 'Bm6',    type: '6th',     frets: [1, 2, 2, 2] },  // G# D F# B  (4 fingers)

  // ── add9 ───────────────────────────────────────────────────────────────────
  { name: 'Cadd9',  type: 'major',   frets: [0, 0, 0, 5] },  // G C E D
  { name: 'C#add9', type: 'major',   frets: [1, 3, 1, 4] },  // G# D# F C#  (3 fingers)
  { name: 'Dbadd9', type: 'major',   frets: [1, 3, 1, 4] },  // G# D# F C#  (3 fingers)
  { name: 'Dadd9',  type: 'major',   frets: [7, 6, 0, 0] },  // D F# E A
  { name: 'D#add9', type: 'major',   frets: [0, 3, 1, 1] },  // G D# F A#
  { name: 'Ebadd9', type: 'major',   frets: [0, 3, 1, 1] },  // G D# F A#
  { name: 'Eadd9',  type: 'major',   frets: [1, 4, 2, 2] },  // G# E F# B  (4 fingers)
  { name: 'Fadd9',  type: 'major',   frets: [0, 0, 1, 0] },  // G C F A
  { name: 'F#add9', type: 'major',   frets: [1, 1, 2, 1] },  // G# C# F# A#
  { name: 'Gbadd9', type: 'major',   frets: [1, 1, 2, 1] },  // G# C# F# A#
  { name: 'Gadd9',  type: 'major',   frets: [2, 2, 3, 2] },  // A D G B
  { name: 'G#add9', type: 'major',   frets: [3, 3, 4, 3] },  // A# D# G# C
  { name: 'Abadd9', type: 'major',   frets: [3, 3, 4, 3] },  // A# D# G# C
  { name: 'Aadd9',  type: 'major',   frets: [2, 1, 0, 2] },  // A C# E B  (3 fingers)
  { name: 'A#add9', type: 'major',   frets: [3, 2, 1, 3] },  // A# D F C  (4 fingers)
  { name: 'Bbadd9', type: 'major',   frets: [3, 2, 1, 3] },  // A# D F C  (4 fingers)
  { name: 'Badd9',  type: 'major',   frets: [4, 3, 2, 4] },  // B D# F# C#  (4 fingers)

];

export const CHORD_TYPES = [
  { key: 'major', label: 'Major' },
  { key: 'minor', label: 'Minor' },
  { key: 'dom7',  label: '7th' },
  { key: 'maj7',  label: 'maj7' },
  { key: 'min7',  label: 'm7' },
  { key: 'm7b5',  label: 'm7♭5' },
  { key: 'dom9',  label: '9th' },
  { key: 'sus2',  label: 'sus2' },
  { key: 'sus4',  label: 'sus4' },
  { key: '7sus4', label: '7sus4' },
  { key: 'aug',   label: 'aug' },
  { key: 'dim',   label: 'dim' },
  { key: '6th',   label: '6th' },
  { key: 'custom', label: 'Custom' },
];
