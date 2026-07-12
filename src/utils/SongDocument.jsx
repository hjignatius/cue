import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { attachSectionLabels, splitAnnotations } from './chordPro.js';
import { transposeChord } from './transpose.js';
import { PdfChordDiagram } from './PdfChordDiagram.jsx';

const LABEL_COL = 56;
const PAGE_PAD_LEFT = 8;

function buildStyles(scale, chordColor = '#4f46e5') {
  const s = scale;
  return StyleSheet.create({
    page:           { paddingTop: 48, paddingRight: 48, paddingBottom: 48, paddingLeft: PAGE_PAD_LEFT, fontFamily: 'Helvetica', backgroundColor: '#ffffff' },
    header:         { marginBottom: 24 * s, borderBottomWidth: 1, borderBottomColor: '#cccccc', paddingBottom: 12 * s },
    title:          { fontSize: 22 * s, fontFamily: 'Helvetica-Bold', color: '#1a1a2e', marginBottom: 4 * s, textAlign: 'center' },
    artist:         { fontSize: 10 * s, color: '#555555', marginBottom: 2 * s, textAlign: 'center' },
    metaRow:        { flexDirection: 'row', marginTop: 3 * s, justifyContent: 'center' },
    meta:           { fontSize: 8 * s, color: '#888888', marginRight: 12 * s },
    bodyRow:        { flexDirection: 'row' },
    labelCol:       { width: LABEL_COL * s, paddingLeft: 2 * s, justifyContent: 'center', alignItems: 'flex-start' },
    labelText:      { fontSize: 7 * s, fontFamily: 'Helvetica-Bold', color: chordColor, textTransform: 'uppercase', letterSpacing: 0.5 },
    contentCol:     { flex: 1 },
    lineContainer:  { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 * s, backgroundColor: '#ffffff' },
    segment:        { flexDirection: 'column', backgroundColor: '#ffffff' },
    chordText:      { fontSize: 10 * s, fontFamily: 'Courier-Bold', color: chordColor, height: 12 * s },
    lyricText:      { fontSize: 12 * s, color: '#1a1a2e', fontFamily: 'Courier' },
    plainLyricLine: { fontSize: 12 * s, color: '#1a1a2e', fontFamily: 'Courier', marginBottom: 2 * s },
    markerText:     { color: chordColor, fontFamily: 'Courier-Bold' },
    emptyLine:      { marginBottom: 22 * s },
  });
}

function lyricRuns(text, styles) {
  return splitAnnotations(text).map((run, i) =>
    run.marker
      ? <Text key={i} style={styles.markerText}>{run.text}</Text>
      : <Text key={i}>{run.text}</Text>
  );
}

function ChordLine({ segments, semitones, styles }) {
  return (
    <View style={styles.lineContainer}>
      {segments.map((seg, i) => (
        <View key={i} style={styles.segment}>
          <Text style={styles.chordText}>
            {seg.chord ? (transposeChord(seg.chord, semitones) + ' ') : ' '}
          </Text>
          <Text style={styles.lyricText}>
            {seg.text ? lyricRuns(seg.text, styles) : ' '}
          </Text>
        </View>
      ))}
    </View>
  );
}

function BodyRow({ label, children, styles }) {
  return (
    <View style={styles.bodyRow}>
      <View style={styles.labelCol}>
        {label ? <Text style={styles.labelText}>{label}</Text> : null}
      </View>
      <View style={styles.contentCol}>{children}</View>
    </View>
  );
}

// Reusable song page — can be embedded in SongDocument or SetDocument
function SongPage({ metadata, parsedLines, semitones = 0, scale = 1, chordColor }) {
  const styles = buildStyles(scale, chordColor);
  const { title, artist, key } = metadata;
  const lines = attachSectionLabels(parsedLines);
  const displayKey = semitones && key ? transposeChord(key, semitones) : key;

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
          if (line.type === 'empty')     return <BodyRow key={i} label={null} styles={styles}><View style={styles.emptyLine} /></BodyRow>;
          if (line.type === 'directive') return null;
          if (line.type === 'chords')    return <BodyRow key={i} label={line.label} styles={styles}><ChordLine segments={line.segments} semitones={semitones} styles={styles} /></BodyRow>;
          return <BodyRow key={i} label={line.label} styles={styles}><Text style={styles.plainLyricLine}>{lyricRuns(line.segments?.[0]?.text || '', styles)}</Text></BodyRow>;
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
export function SongDocument({ metadata, parsedLines, semitones = 0, scale = 1, chordDiagrams, chordColor }) {
  return (
    <Document>
      <SongPage metadata={metadata} parsedLines={parsedLines} semitones={semitones} scale={scale} chordColor={chordColor} />
      {chordDiagrams?.length > 0 && <ChordReferencePage chords={chordDiagrams} />}
    </Document>
  );
}

// Multi-song PDF document for full-set export
export function SetDocument({ songs, chordDiagrams, chordColor }) {
  return (
    <Document>
      {songs.map((song, i) => (
        <SongPage key={i} metadata={song.metadata} parsedLines={song.parsedLines} semitones={song.semitones || 0} scale={1} chordColor={chordColor} />
      ))}
      {chordDiagrams?.length > 0 && <ChordReferencePage chords={chordDiagrams} />}
    </Document>
  );
}
