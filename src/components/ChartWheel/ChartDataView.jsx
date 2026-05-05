import { PLANETS, NATAL_ANGLES } from '../../data/planets';
import { ZODIAC_SIGNS, getSignIndex } from '../../data/zodiac';

/**
 * ChartDataView — tabular planet/angle longitudes for the picker preview.
 */
export default function ChartDataView({ chart }) {
  if (!chart) return null;

  const rows = [];
  for (const planet of PLANETS) {
    const lng = chart.positions?.[planet.id];
    if (lng == null) continue;
    rows.push({
      id: planet.id,
      symbol: planet.symbol,
      name: planet.name,
      color: planet.color,
      lng,
      kind: 'planet',
    });
  }
  for (const angle of NATAL_ANGLES) {
    const lng = chart.angles?.[angle.id];
    if (lng == null) continue;
    rows.push({
      id: angle.id,
      symbol: angle.symbol,
      name: angle.name,
      color: angle.color,
      lng,
      kind: 'angle',
    });
  }

  return (
    <div style={{ width: '100%', fontSize: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(row => {
            const signIdx = getSignIndex(row.lng);
            const sign = ZODIAC_SIGNS[signIdx];
            const inSign = row.lng - signIdx * 30;
            const deg = Math.floor(inSign);
            const min = Math.floor((inSign - deg) * 60);
            return (
              <tr
                key={row.id}
                style={{
                  borderBottom: '1px solid var(--border-soft)',
                  background: row.kind === 'angle' ? 'var(--bg-subtle)' : 'transparent',
                }}
              >
                <td style={{ padding: '6px 8px', width: '24px', color: row.color, fontSize: '15px', textAlign: 'center', fontFamily: '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", serif' }}>
                  {row.symbol}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--fg-strong)', fontWeight: 500 }}>
                  {row.name}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                  {String(deg).padStart(2, '0')}&deg;
                </td>
                <td style={{ padding: '6px 4px', width: '20px', textAlign: 'center', fontSize: '14px', fontFamily: '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", serif' }}>
                  {sign.symbol}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums', width: '40px' }}>
                  {String(min).padStart(2, '0')}&prime;
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
