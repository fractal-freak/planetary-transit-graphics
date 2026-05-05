// Classic eclipse glyph used by the Lunations control: a sun circle outline
// with a moon crescent inside. Pure SVG geometry — no mask — so it renders
// cleanly at any size.
export default function SolarEclipseGlyph({ size = 16 }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.42;
  const rMoon = R * 0.68;
  const offset = rMoon * 0.55;
  const sw = 1;

  const c1 = cx + rMoon / 2 - offset / 4;
  const c2 = c1 + offset;
  const xInt = (c1 + c2) / 2;
  const yOff = Math.sqrt(rMoon * rMoon - (offset * offset) / 4);

  const crescentPath = [
    `M${xInt} ${cy - yOff}`,
    `A${rMoon} ${rMoon} 0 1 0 ${xInt} ${cy + yOff}`,
    `A${rMoon} ${rMoon} 0 0 0 ${xInt} ${cy - yOff}`,
    `Z`,
  ].join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      shapeRendering="geometricPrecision"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor" strokeWidth={sw} />
      <path d={crescentPath} fill="currentColor" />
    </svg>
  );
}
