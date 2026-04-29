import { format } from 'date-fns';
import { PLANET_MAP } from '../data/planets';

/**
 * Build a lookup of calendar events keyed by 'yyyy-MM-dd'.
 *
 * Mirrors what the Graph view labels: aspect perfections plus sign changes
 * (ingresses). Each peak's `date` (or `realPeakDate` when the real perfection
 * falls just outside the chart window) is the moment the aspect goes exact.
 *
 * @param {Array} curves       - aspect curves (peaks contain perfection dates)
 * @param {Object} signChanges - { changes: Array<{date, planet, signSymbol, signName}>, ... }
 * @returns {Map<string, Array<Event>>}
 */
export function buildEventMap(curves, signChanges) {
  const map = new Map();

  // ── Aspect perfections ──
  if (curves) {
    for (const curve of curves) {
      if (!curve.peaks) continue;
      const transitP = PLANET_MAP[curve.transitPlanet];
      const targetP = PLANET_MAP[curve.target];
      if (!transitP || !targetP) continue;

      for (const peak of curve.peaks) {
        // Use realPeakDate when the actual perfection sits beyond the chart
        // window — that matches what the graph label shows.
        const date = peak.realPeakDate || peak.date;
        const key = format(date, 'yyyy-MM-dd');
        const event = {
          type: 'aspect',
          date,
          glyphs: `${transitP.symbol}${curve.aspect.symbol}${targetP.symbol}`,
          title: `${curve.transitPlanet} ${curve.aspect.name} ${curve.target}`,
          color: curve.color,
        };
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(event);
      }
    }
  }

  // ── Sign changes (ingresses) ──
  if (signChanges?.changes) {
    for (const sc of signChanges.changes) {
      const planetP = PLANET_MAP[sc.planet];
      if (!planetP) continue;
      const key = format(sc.date, 'yyyy-MM-dd');
      const event = {
        type: 'ingress',
        date: sc.date,
        glyphs: `${planetP.symbol}→${sc.signSymbol}`,
        title: `${sc.planet} enters ${sc.signName}`,
        color: planetP.color,
      };
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }
  }

  // ── Retrograde stations ──
  if (signChanges?.stations) {
    for (const st of signChanges.stations) {
      const planetP = PLANET_MAP[st.planet];
      if (!planetP) continue;
      const key = format(st.date, 'yyyy-MM-dd');
      const marker = st.type === 'retrograde' ? '℞' : 'D';
      const event = {
        type: 'station',
        date: st.date,
        glyphs: `${planetP.symbol} ${marker}`,
        title: `${st.planet} stations ${st.type}`,
        color: planetP.color,
      };
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }
  }

  // Sort events within each day by date (then aspect before ingress for stability)
  for (const events of map.values()) {
    events.sort((a, b) => {
      const dt = a.date - b.date;
      if (dt !== 0) return dt;
      return a.type === 'aspect' ? -1 : 1;
    });
  }

  return map;
}
