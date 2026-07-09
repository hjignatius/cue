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
  strings:  4,
  fretRows: 4,
};

const SVG_W  = G.padH * 2 + G.strGap * (G.strings - 1);
const NUT_Y  = G.openR * 2 + 3;  // space above nut for open-string indicators
const SVG_H  = NUT_Y + G.fretRows * G.fretGap + 4;
const BODY_BOTTOM = NUT_Y + G.fretRows * G.fretGap;

function sx(i) { return G.padH + i * G.strGap; }

const COL = {
  name:   '#4f46e5',
  dot:    '#4f46e5',
  open:   '#4f46e5',
  nut:    '#1f2937',
  fret:   '#d1d5db',
  str:    '#9ca3af',
  pos:    '#6b7280',
  lbl:    '#b0b8c8',
};

export function PdfChordDiagram({ chord }) {
  const { name, frets } = chord;

  const validFrets = frets.filter(f => f > 0);
  const maxFret    = validFrets.length ? Math.max(...validFrets) : 0;
  const minFret    = validFrets.length ? Math.min(...validFrets) : 1;
  const startFret  = maxFret <= G.fretRows ? 1 : Math.max(minFret, maxFret - G.fretRows + 1);

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Chord name */}
      <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COL.name, marginBottom: 1 }}>
        {name}
      </Text>

      {/* Fretboard row — position marker on the left, SVG on the right */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ width: 14, paddingTop: NUT_Y + G.fretGap * 0.35 }}>
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
            width={G.strGap * (G.strings - 1) + 1}
            height={startFret === 1 ? G.nutH : 0.7}
            fill={COL.nut}
          />

          {/* Fret lines */}
          {[1, 2, 3, 4].map(f => (
            <Line key={f}
              x1={G.padH} y1={NUT_Y + f * G.fretGap}
              x2={G.padH + G.strGap * (G.strings - 1)} y2={NUT_Y + f * G.fretGap}
              stroke={COL.fret} strokeWidth={G.strokeW}
            />
          ))}

          {/* String lines */}
          {[0, 1, 2, 3].map(i => (
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
                  fill="none" stroke={COL.open} strokeWidth={G.strokeW * 1.3}
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
            if (row < 1 || row > G.fretRows) return null;
            return (
              <Circle key={i}
                cx={cx} cy={NUT_Y + (row - 0.5) * G.fretGap}
                r={G.dotR} fill={COL.dot}
              />
            );
          })}
        </Svg>
      </View>

      {/* String labels */}
      <Text style={{ fontSize: 5, fontFamily: 'Helvetica', color: COL.lbl, letterSpacing: 1.8, marginTop: 1 }}>
        G C E A
      </Text>
    </View>
  );
}
