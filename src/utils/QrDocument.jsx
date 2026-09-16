import { Document, Page, Text, View, Svg, Path, G, StyleSheet } from '@react-pdf/renderer';
import { registerPdfFonts, FONT_SANS, FONT_MONO } from './pdfFonts.js';
import { qrPath, QUIET_ZONE } from './qr.js';

registerPdfFonts();

// A one-page A4 sheet carrying a set's share link as a QR code — meant to be
// printed and propped on a stand or a table, so a room full of people can scan
// it. Drawn as vector (not a rasterised image), so it stays sharp at any print
// size and scans as well on paper as on screen.
const PAGE_PAD = 56;
// 320pt ≈ 11.3cm square. Big enough to scan from across a room, and still leaves
// room for the caption and the typed link below it on the page.
const QR_SIZE     = 320;

const styles = StyleSheet.create({
  page:    { paddingTop: 72, paddingBottom: PAGE_PAD, paddingLeft: PAGE_PAD, paddingRight: PAGE_PAD,
             fontFamily: FONT_SANS, backgroundColor: '#ffffff', alignItems: 'center' },
  title:   { fontSize: 22, fontFamily: FONT_SANS, fontWeight: 'bold', color: '#1a1a2e', textAlign: 'center' },
  kicker:  { fontSize: 11, color: '#666666', textAlign: 'center', marginTop: 6, marginBottom: 28 },
  // The code sits on its own white plate with a hairline edge, so it reads as a
  // deliberate object on the page rather than floating ink.
  plate:   { padding: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dddddd', borderRadius: 6 },
  caption: { fontSize: 12, color: '#1a1a2e', textAlign: 'center', marginTop: 28 },
  // The link in full, for anyone whose camera won't cooperate. Mono so the
  // token's characters are unambiguous when typed by hand.
  url:     { fontSize: 9, fontFamily: FONT_MONO, color: '#555555', textAlign: 'center', marginTop: 10 },
  foot:    { fontSize: 8, color: '#999999', textAlign: 'center', marginTop: 'auto' },
});

export function QrDocument({ title, url, subtitle }) {
  const model = qrPath(url);
  const box = model ? model.count + QUIET_ZONE * 2 : 0;

  return (
    <Document title={title ? `${title} — share link` : 'Cue share link'}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title || 'Shared set'}</Text>
        <Text style={styles.kicker}>{subtitle || 'Scan to open this set in Cue'}</Text>

        {model && (
          <View style={styles.plate}>
            <Svg width={QR_SIZE} height={QR_SIZE} viewBox={`0 0 ${box} ${box}`}>
              <G transform={`translate(${QUIET_ZONE},${QUIET_ZONE})`}>
                <Path d={model.path} fill="#000000" />
              </G>
            </Svg>
          </View>
        )}

        <Text style={styles.caption}>Point a phone camera at the code, or open the link:</Text>
        <Text style={styles.url}>{url}</Text>

        <Text style={styles.foot}>Anyone with this link can view the set and copy its songs into their own Cue.</Text>
      </Page>
    </Document>
  );
}
