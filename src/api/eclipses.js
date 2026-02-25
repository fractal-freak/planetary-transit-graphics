/**
 * Eclipse event computation using astronomy-engine.
 *
 * Uses SearchLunarEclipse / NextLunarEclipse and
 * SearchGlobalSolarEclipse / NextGlobalSolarEclipse to find all
 * eclipses within a date range, enriched with zodiac sign data.
 */

import {
  SearchLunarEclipse,
  NextLunarEclipse,
  SearchGlobalSolarEclipse,
  NextGlobalSolarEclipse,
} from 'astronomy-engine';

import { getLongitude } from './ephemeris';
import { getSignIndex, ZODIAC_SIGNS } from '../data/zodiac';

/**
 * Compute all solar and lunar eclipses within a date range.
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array<{
 *   type: 'solar' | 'lunar',
 *   kind: 'total' | 'partial' | 'annular' | 'penumbral',
 *   date: Date,
 *   signIndex: number,
 *   signSymbol: string,
 *   signName: string,
 *   rowKey: string,
 * }>}
 */
export function computeEclipses(startDate, endDate) {
  const eclipses = [];

  // Start searching from 35 days before the window to ensure we don't
  // miss eclipses near the start boundary (SearchLunarEclipse/
  // SearchGlobalSolarEclipse find the first eclipse on or after the date,
  // so starting a bit early is safer than missing one).
  const searchStart = new Date(startDate.getTime() - 35 * 86400000);

  // ── Lunar eclipses ──
  // A lunar eclipse = Full Moon → the eclipse occurs where the MOON is,
  // not where the Sun is. Use Moon's longitude for the sign.
  let lunar = SearchLunarEclipse(searchStart);
  while (lunar.peak.date <= endDate) {
    if (lunar.peak.date >= startDate) {
      const moonLon = getLongitude('Moon', lunar.peak.date);
      const signIdx = getSignIndex(moonLon);
      const sign = ZODIAC_SIGNS[signIdx];
      eclipses.push({
        type: 'lunar',
        kind: lunar.kind,          // 'penumbral' | 'partial' | 'total'
        date: lunar.peak.date,
        signIndex: signIdx,
        signSymbol: sign.symbol,
        signName: sign.name,
        rowKey: 'planet-TrueNode',
      });
    }
    lunar = NextLunarEclipse(lunar.peak);
  }

  // ── Solar eclipses ──
  // A solar eclipse = New Moon → the eclipse occurs where the SUN (and Moon)
  // are conjunct. Sun's longitude is correct for the sign.
  let solar = SearchGlobalSolarEclipse(searchStart);
  while (solar.peak.date <= endDate) {
    if (solar.peak.date >= startDate) {
      const sunLon = getLongitude('Sun', solar.peak.date);
      const signIdx = getSignIndex(sunLon);
      const sign = ZODIAC_SIGNS[signIdx];
      eclipses.push({
        type: 'solar',
        kind: solar.kind,          // 'partial' | 'annular' | 'total'
        date: solar.peak.date,
        signIndex: signIdx,
        signSymbol: sign.symbol,
        signName: sign.name,
        rowKey: 'planet-TrueNode',
      });
    }
    solar = NextGlobalSolarEclipse(solar.peak);
  }

  // Sort chronologically
  eclipses.sort((a, b) => a.date - b.date);

  return eclipses;
}
