import { format } from 'date-fns';
import { PLANET_MAP } from '../data/planets';

/**
 * Build a lookup of aspect perfection events keyed by 'yyyy-MM-dd'.
 *
 * Each curve's `peaks` array marks the moments an aspect goes exact.
 * Edge-cutoff peaks are skipped — those are window-boundary approximations,
 * not real perfections within the chart range.
 *
 * @param {Array} curves - aspect curves from useTransits / useNatalTransits / useMundaneTransits
 * @returns {Map<string, Array<Event>>}
 */
export function buildPerfectionMap(curves) {
  const map = new Map();
  if (!curves) return map;

  for (const curve of curves) {
    if (!curve.peaks) continue;
    const transitP = PLANET_MAP[curve.transitPlanet];
    const targetP = PLANET_MAP[curve.target];
    if (!transitP || !targetP) continue;

    for (const peak of curve.peaks) {
      if (peak.edgeCutoff) continue;

      const key = format(peak.date, 'yyyy-MM-dd');
      const event = {
        date: peak.date,
        transitPlanet: curve.transitPlanet,
        targetPlanet: curve.target,
        aspectName: curve.aspect.name,
        transitSymbol: transitP.symbol,
        aspectSymbol: curve.aspect.symbol,
        targetSymbol: targetP.symbol,
        color: curve.color,
      };

      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }
  }

  return map;
}
