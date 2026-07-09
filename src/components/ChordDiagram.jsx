// Renders an SVG ukulele chord diagram.
// frets = [G, C, E, A]  (4 strings, left to right)
// scale: multiplier on base dimensions (default 1.0)
// theme: 'dark' | 'light'

export default function ChordDiagram({ chord, scale = 1, theme = 'dark', chordColor }) {
  const { name, frets } = chord;

  // Base layout (at scale 1)
  const B = {
    strGap:  10,
    fretGap: 10,
    dotR:    3.5,
    openR:   2.5,
    padLeft: 10,
    padTop:  6,    // reduced — label zone now holds the extra space
    labelH:  22,   // tall enough to separate chord name from open circles
    fontSize: { label: 10, pos: 6, string: 5.5 },
    nut:     2.5,
    strokeW: 0.8,
  };

  const s        = scale;
  const strings  = 4;
  const fretRows = 4;
  const strGap   = B.strGap  * s;
  const fretGap  = B.fretGap * s;
  const dotR     = B.dotR    * s;
  const openR    = B.openR   * s;
  const padLeft  = B.padLeft * s;
  const padTop   = B.padTop  * s;
  const labelH   = B.labelH  * s;

  const w = padLeft * 2 + strGap * (strings - 1);
  const h = padTop + labelH + fretGap * fretRows + openR + 4 * s;

  const activeFrets = frets.filter(f => f > 0);
  const maxFret   = activeFrets.length ? Math.max(...activeFrets) : 0;
  const minFret   = activeFrets.length ? Math.min(...activeFrets) : 1;
  // Slide the 4-fret window up so both minFret and maxFret are visible.
  const startFret = maxFret <= fretRows ? 1 : Math.max(minFret, maxFret - fretRows + 1);
  const showPos   = startFret > 1;

  function strX(i) { return padLeft + i * strGap; }
  const nutY       = padTop + labelH;
  const bodyBottom = nutY + fretRows * fretGap;

  // Theme colours
  const dark = theme === 'dark';
  const accent = chordColor || (dark ? '#a5b4fc' : '#4f46e5');
  const col = {
    label:  accent,
    nut:    dark ? '#e2e8f0' : '#374151',
    fret:   dark ? '#374151' : '#cbd5e1',
    string: dark ? '#4b5563' : '#94a3b8',
    dot:    accent,
    open:   accent,
    pos:    dark ? '#94a3b8' : '#6b7280',
    strLbl: dark ? '#6b7280' : '#94a3b8',
  };

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`${name} chord diagram`}
      style={{ pointerEvents: 'none' }}
    >
      {/* Chord name — anchored one font-height below padTop so open circles
           (drawn just above the nut) never overlap the text */}
      <text x={w / 2} y={padTop + B.fontSize.label * s} textAnchor="middle"
        fontSize={B.fontSize.label * s} fontFamily="ui-monospace, monospace"
        fontWeight="600" fill={col.label}>{name}</text>

      {/* Nut or position marker */}
      {startFret === 1
        ? <rect x={padLeft - 1} y={nutY} width={strGap * (strings - 1) + 2} height={B.nut * s} fill={col.nut} rx="1" />
        : <text x={padLeft - 4 * s} y={nutY + fretGap * 0.7} textAnchor="end"
            fontSize={B.fontSize.pos * s} fontFamily="ui-monospace, monospace" fill={col.pos}>{startFret}</text>
      }

      {/* Position divider line when shifted */}
      {showPos && (
        <rect x={padLeft - 1} y={nutY} width={strGap * (strings - 1) + 2} height={1} fill={col.string} />
      )}

      {/* Fret lines */}
      {Array.from({ length: fretRows }, (_, i) => i + 1).map(f => (
        <line key={f}
          x1={padLeft} y1={nutY + f * fretGap}
          x2={padLeft + strGap * (strings - 1)} y2={nutY + f * fretGap}
          stroke={col.fret} strokeWidth={B.strokeW * s} />
      ))}

      {/* String lines */}
      {Array.from({ length: strings }, (_, i) => (
        <line key={i} x1={strX(i)} y1={nutY} x2={strX(i)} y2={bodyBottom}
          stroke={col.string} strokeWidth={B.strokeW * s} />
      ))}

      {/* Open circles, muted ×, and finger dots */}
      {frets.map((fret, i) => {
        if (fret === 0) {
          return <circle key={i} cx={strX(i)} cy={nutY - openR - 1.5 * s}
            r={openR} fill="none" stroke={col.open} strokeWidth={B.strokeW * s * 1.2} />;
        }
        if (fret === -1) {
          const cx = strX(i);
          const cy = nutY - openR - 1.5 * s;
          const r  = openR * 0.85;
          return (
            <g key={i}>
              <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} stroke={col.string} strokeWidth={B.strokeW * s * 1.5} strokeLinecap="round" />
              <line x1={cx + r} y1={cy - r} x2={cx - r} y2={cy + r} stroke={col.string} strokeWidth={B.strokeW * s * 1.5} strokeLinecap="round" />
            </g>
          );
        }
        const row = fret - startFret + 1;
        if (row < 1 || row > fretRows) return null;
        const cx = strX(i);
        const cy = nutY + (row - 0.5) * fretGap;
        const finger = chord.fingers?.[i];
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={dotR} fill={col.dot} />
            {finger ? (
              <text x={cx} y={cy + dotR * 0.38} textAnchor="middle"
                fontSize={dotR * 1.25} fontFamily="ui-sans-serif,sans-serif"
                fontWeight="700" fill="white" style={{ pointerEvents: 'none' }}>
                {finger}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* String labels G C E A */}
      {['G', 'C', 'E', 'A'].map((lbl, i) => (
        <text key={lbl} x={strX(i)} y={h - 1} textAnchor="middle"
          fontSize={B.fontSize.string * s} fontFamily="ui-sans-serif, sans-serif" fill={col.strLbl}>{lbl}</text>
      ))}
    </svg>
  );
}
