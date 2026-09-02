import { Svg, Line, Circle, Rect, View, Text } from '@react-pdf/renderer';

// Fixed geometry in PDF points — produces a diagram ~53pt wide x ~56pt tall
const G = {
  strGap:   11,
  fretGap:  11,
  dotR:     3.5,
  openR:    2.5,
  padH:     10,
  nutH:     2,
  strokeW:  0.7,
  fretRows: 4,
};

// SVG_W is per-render (depends on string count) — computed inside the component.
const NUT_Y  = G.openR * 2 + 3;  // space above nut for open-string indicators
const BODY_H = G.fretRows * G.fretGap;   // fixed body height (4-fret window)
const SVG_H  = NUT_Y + BODY_H + 4;
const BODY_BOTTOM = NUT_Y + BODY_H;

function sx(i) { return G.padH + i * G.strGap; }

const COL = {
  name:   '#000000',
  dot:    '#000000',
  open:   '#000000',
  nut:    '#1f2937',
  fret:   '#d1d5db',
  str:    '#9ca3af',
  pos:    '#6b7280',
};

export function PdfChordDiagram({ chord, color }) {
  const { name, frets } = chord;
  // PDF diagrams print black on white paper (chord name + dots + open markers).
  // The optional `color` override exists but callers leave it unset.
  const accent = color || COL.name;

  // String count from the voicing (4 uke/baritone, 6 guitar). SVG_W uses the same
  // formula as before, so a 4-string diagram is identical in width to today.
  const strings = frets.length;
  const SVG_W   = G.padH * 2 + G.strGap * (strings - 1);

  const validFrets = frets.filter(f => f > 0);
  const maxFret    = validFrets.length ? Math.max(...validFrets) : 0;
  const minFret    = validFrets.length ? Math.min(...validFrets) : 1;
  // Grow to 5 rows for a 5-fret span (capped), keeping BODY_H fixed by shrinking
  // the row gap — mirrors the on-screen ChordDiagram so print matches screen.
  const span       = validFrets.length ? maxFret - minFret + 1 : 4;
  const fretRows   = Math.min(5, Math.max(4, span));
  const rowGap     = BODY_H / fretRows;
  const startFret  = maxFret <= fretRows ? 1 : Math.max(minFret, maxFret - fretRows + 1);

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Chord name */}
      <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: accent, marginBottom: 1 }}>
        {name}
      </Text>

      {/* Fretboard row — position marker on the left, SVG on the right */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ width: 14, paddingTop: NUT_Y + rowGap * 0.35 }}>
          {startFret > 1 && (
            <Text style={{ fontSize: 5, fontFamily: 'Helvetica', color: COL.pos }}>
              {startFret}
            </Text>
          )}
        </View>

        <Svg width={SVG_W} height={SVG_H}>
          {/* Nut (thick) or top border (thin when position > 1) */}
          <Rect
            x={G.padH - 0.5}
            y={NUT_Y}
            width={G.strGap * (strings - 1) + 1}
            height={startFret === 1 ? G.nutH : 0.7}
            fill={COL.nut}
          />

          {/* Fret lines */}
          {Array.from({ length: fretRows }, (_, i) => i + 1).map(f => (
            <Line key={f}
              x1={G.padH} y1={NUT_Y + f * rowGap}
              x2={G.padH + G.strGap * (strings - 1)} y2={NUT_Y + f * rowGap}
              stroke={COL.fret} strokeWidth={G.strokeW}
            />
          ))}

          {/* String lines */}
          {Array.from({ length: strings }, (_, i) => (
            <Line key={i}
              x1={sx(i)} y1={NUT_Y}
              x2={sx(i)} y2={BODY_BOTTOM}
              stroke={COL.str} strokeWidth={G.strokeW}
            />
          ))}

          {/* Open circles, muted ×, fretted dots */}
          {frets.map((fret, i) => {
            const cx = sx(i);
            if (fret === 0) {
              return (
                <Circle key={i}
                  cx={cx} cy={NUT_Y - G.openR - 1}
                  r={G.openR}
                  fill="none" stroke={accent} strokeWidth={G.strokeW * 1.3}
                />
              );
            }
            if (fret === -1) {
              const cy = NUT_Y - G.openR - 1, r = G.openR * 0.75;
              return [
                <Line key={`${i}a`} x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} stroke={COL.str} strokeWidth={G.strokeW * 1.5} />,
                <Line key={`${i}b`} x1={cx + r} y1={cy - r} x2={cx - r} y2={cy + r} stroke={COL.str} strokeWidth={G.strokeW * 1.5} />,
              ];
            }
            const row = fret - startFret + 1;
            if (row < 1 || row > fretRows) return null;
            return (
              <Circle key={i}
                cx={cx} cy={NUT_Y + (row - 0.5) * rowGap}
                r={G.dotR} fill={accent}
              />
            );
          })}
        </Svg>
      </View>
    </View>
  );
}
