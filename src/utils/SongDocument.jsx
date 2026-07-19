import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { attachSectionLabels, styleSegments } from './chordPro.js';
import { transposeChord } from './transpose.js';
import { PdfChordDiagram } from './PdfChordDiagram.jsx';

// Present-matched layout. Lyrics are 14pt Courier at a 65-character target width
// (the same LYRIC_TARGET_CHARS as Present), and section labels sit inline above
// each section — exactly as Present renders them — rather than in a left column.
// Dropping that column frees enough width that 65 chars fit an A4 page with
// symmetric, print-safe ~24pt side margins.
const A4_WIDTH_PT = 595.28;
const LYRIC_FONT = 14;
const CHORD_FONT = 12;         // ~0.85 × lyric, matching Present's over-lyrics chords
const LABEL_FONT = 8;          // ~0.6 × lyric, matching Present's section labels
const COURIER_ADVANCE = 0.6;   // monospace advance as a fraction of the em
const LYRIC_TARGET_CHARS = 65; // matches Present's LYRIC_TARGET_CHARS
// Side margins that leave exactly the target character width. floor() keeps the
// content a hair wider than 65 chars so a full 65-char line never wraps.
const PAGE_PAD_X = Math.floor((A4_WIDTH_PT - LYRIC_TARGET_CHARS * LYRIC_FONT * COURIER_ADVANCE) / 2);

function buildStyles(scale, chordColor = '#4f46e5') {
  const s = scale;
  return StyleSheet.create({
    page:           { paddingTop: 48, paddingRight: PAGE_PAD_X, paddingBottom: 48, paddingLeft: PAGE_PAD_X, fontFamily: 'Helvetica', backgroundColor: '#ffffff' },
    header:         { marginBottom: 24 * s, borderBottomWidth: 1, borderBottomColor: '#cccccc', paddingBottom: 12 * s },
    title:          { fontSize: 22 * s, fontFamily: 'Helvetica-Bold', color: '#1a1a2e', marginBottom: 4 * s, textAlign: 'center' },
    artist:         { fontSize: 10 * s, color: '#555555', marginBottom: 2 * s, textAlign: 'center' },
    metaRow:        { flexDirection: 'row', marginTop: 3 * s, justifyContent: 'center' },
    meta:           { fontSize: 8 * s, color: '#888888', marginRight: 12 * s },
    // Inline section label, above its section (Present-style). marginTop for the
    // section gap is applied per-line so the first line has none.
    sectionLabel:   { fontSize: LABEL_FONT * s, fontFamily: 'Helvetica-Bold', color: chordColor, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: LYRIC_FONT * 0.25 * s },
    lineContainer:  { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 * s, backgroundColor: '#ffffff' },
    segment:        { flexDirection: 'column', backgroundColor: '#ffffff' },
    chordText:      { fontSize: CHORD_FONT * s, fontFamily: 'Courier-Bold', color: chordColor, height: CHORD_FONT * 1.2 * s },
    lyricText:      { fontSize: LYRIC_FONT * s, color: '#1a1a2e', fontFamily: 'Courier' },
    plainLyricLine: { fontSize: LYRIC_FONT * s, color: '#1a1a2e', fontFamily: 'Courier', marginBottom: 2 * s },
    markerText:     { color: chordColor, fontFamily: 'Courier-Bold' },
    emptyLine:      { marginBottom: 22 * s },
  });
}

// Render pre-parsed styled runs as PDF Text spans. Repeat markers keep the
// accent style; user styles map to color + the Courier bold/oblique variants
// (no font registration needed — they're standard PDF fonts). Chords are on
// their own Text, so chord color is unaffected.
function StyledRunsPdf({ runs, styles }) {
  return (runs || []).map((r, i) => {
    if (r.marker) return <Text key={i} style={styles.markerText}>{r.text}</Text>;
    const fontFamily = r.bold && r.italic ? 'Courier-BoldOblique'
                     : r.bold            ? 'Courier-Bold'
                     : r.italic          ? 'Courier-Oblique'
                     :                      'Courier';
    return <Text key={i} style={r.color ? { fontFamily, color: r.color } : { fontFamily }}>{r.text}</Text>;
  });
}

function ChordLine({ segments, semitones, useFlats, styles }) {
  return (
    <View style={styles.lineContainer}>
      {styleSegments(segments).map((seg, i) => (
        <View key={i} style={styles.segment}>
          <Text style={styles.chordText}>
            {seg.chord ? (transposeChord(seg.chord, semitones, useFlats) + ' ') : ' '}
          </Text>
          <Text style={styles.lyricText}>
            {seg.text ? <StyledRunsPdf runs={seg.styledRuns} styles={styles} /> : ' '}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Reusable song page — can be embedded in SongDocument or SetDocument
function SongPage({ metadata, parsedLines, semitones = 0, useFlats = false, scale = 1, chordColor }) {
  const styles = buildStyles(scale, chordColor);
  const { title, artist, key } = metadata;
  const lines = attachSectionLabels(parsedLines);
  const displayKey = semitones && key ? transposeChord(key, semitones, useFlats) : key;

  return (
    <Page size="A4" style={styles.page}>
      {(title || artist || key || metadata.tempo) ? (
        <View style={styles.header}>
          {title  ? <Text style={styles.title}>{title}</Text>  : null}
          {artist ? <Text style={styles.artist}>{artist}</Text> : null}
          {(displayKey || metadata.tempo) ? (
            <View style={styles.metaRow}>
              {displayKey     ? <Text style={styles.meta}>Key: {displayKey}</Text>           : null}
              {metadata.tempo ? <Text style={styles.meta}>Tempo: {metadata.tempo} BPM</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View>
        {lines.map((line, i) => {
          // Section label inline above its line (Present-style); the section gap
          // (marginTop) is omitted on the very first line.
          const label = line.label
            ? <Text style={{ ...styles.sectionLabel, marginTop: i === 0 ? 0 : LYRIC_FONT * scale }}>{line.label}</Text>
            : null;
          if (line.type === 'empty')     return <View key={i}>{label}<View style={styles.emptyLine} /></View>;
          if (line.type === 'directive') return label ? <View key={i}>{label}</View> : null;
          if (line.type === 'chords')    return <View key={i}>{label}<ChordLine segments={line.segments} semitones={semitones} useFlats={useFlats} styles={styles} /></View>;
          return <View key={i}>{label}<Text style={styles.plainLyricLine}><StyledRunsPdf runs={styleSegments(line.segments)[0]?.styledRuns} styles={styles} /></Text></View>;
        })}
      </View>
    </Page>
  );
}

// One chord reference page appended after song content
function ChordReferencePage({ chords }) {
  return (
    <Page size="A4" style={{ padding: 48, fontFamily: 'Helvetica', backgroundColor: '#ffffff' }}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: '#cccccc', paddingBottom: 10, marginBottom: 20 }}>
        <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1a1a2e' }}>Chord Reference</Text>
        <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 3 }}>Ukulele — G C E A tuning</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {chords.map((chord, i) => (
          <View key={i} style={{ width: '20%', alignItems: 'center', marginBottom: 18, paddingHorizontal: 4 }}>
            <PdfChordDiagram chord={chord} />
          </View>
        ))}
      </View>
    </Page>
  );
}

// Single-song PDF document
export function SongDocument({ metadata, parsedLines, semitones = 0, useFlats = false, scale = 1, chordDiagrams, chordColor }) {
  return (
    <Document>
      <SongPage metadata={metadata} parsedLines={parsedLines} semitones={semitones} useFlats={useFlats} scale={scale} chordColor={chordColor} />
      {chordDiagrams?.length > 0 && <ChordReferencePage chords={chordDiagrams} />}
    </Document>
  );
}

// Multi-song PDF document for full-set export
export function SetDocument({ songs, chordDiagrams, chordColor }) {
  return (
    <Document>
      {songs.map((song, i) => (
        <SongPage key={i} metadata={song.metadata} parsedLines={song.parsedLines} semitones={song.semitones || 0} useFlats={song.useFlats} scale={1} chordColor={chordColor} />
      ))}
      {chordDiagrams?.length > 0 && <ChordReferencePage chords={chordDiagrams} />}
    </Document>
  );
}
