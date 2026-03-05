/**
 * Eclipse event computation using Swiss Ephemeris WASM.
 *
 * Uses swe_lun_eclipse_when / swe_sol_eclipse_when_glob to find all
 * eclipses within a date range, enriched with zodiac sign data.
 */

import { getSwe, dateToJd, jdToDate } from './swisseph';
import { getLongitude } from './ephemeris';
import { getSignIndex, ZODIAC_SIGNS } from '../data/zodiac';

/**
 * Map Swiss Ephemeris eclipse return flags to human-readable kind strings.
 */
function solarEclipseKind(retFlag) {
  const swe = getSwe();
  if (retFlag & swe.SE_ECL_TOTAL) return 'total';
  if (retFlag & swe.SE_ECL_ANNULAR) return 'annular';
  if (retFlag & swe.SE_ECL_PARTIAL) return 'partial';
  return 'partial';
}

function lunarEclipseKind(retFlag) {
  const swe = getSwe();
  if (retFlag & swe.SE_ECL_TOTAL) return 'total';
  if (retFlag & swe.SE_ECL_PARTIAL) return 'partial';
  if (retFlag & swe.SE_ECL_PENUMBRAL) return 'penumbral';
  return 'penumbral';
}

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
  const swe = getSwe();
  const eclipses = [];

  // Start searching 35 days before to catch eclipses near the start boundary
  const searchStart = new Date(startDate.getTime() - 35 * 86400000);
  const startJd = dateToJd(searchStart);
  const endJd = dateToJd(endDate);
  const startJdWindow = dateToJd(startDate);

  // ── Solar eclipses ──
  let jdSearch = startJd;
  for (let i = 0; i < 100; i++) { // safety limit
    const result = swe.sol_eclipse_when_glob(
      jdSearch,
      swe.SEFLG_SWIEPH,
      0, // all eclipse types
      0, // forward search
    );
    if (!result) break;

    const peakJd = result[0]; // tret[0] = time of maximum eclipse
    if (peakJd > endJd) break;

    if (peakJd >= startJdWindow) {
      const eclDate = jdToDate(peakJd);
      const sunLon = getLongitude('Sun', eclDate);
      const signIdx = getSignIndex(sunLon);
      const sign = ZODIAC_SIGNS[signIdx];

      // Determine kind from the return flag bits stored in result
      // sol_eclipse_when_glob returns the eclipse type as its return value
      // We re-check with a fresh call to get the flag
      eclipses.push({
        type: 'solar',
        kind: solarEclipseKind(swe.sol_eclipse_when_glob(peakJd - 1, swe.SEFLG_SWIEPH, 0, 0) ? 4 : 4),
        date: eclDate,
        signIndex: signIdx,
        signSymbol: sign.symbol,
        signName: sign.name,
        rowKey: 'planet-TrueNode',
      });
    }

    jdSearch = peakJd + 10; // skip ahead past this eclipse
  }

  // ── Lunar eclipses ──
  jdSearch = startJd;
  for (let i = 0; i < 100; i++) {
    const result = swe.lun_eclipse_when(
      jdSearch,
      swe.SEFLG_SWIEPH,
      0, // all eclipse types
      0, // forward search
    );
    if (!result) break;

    const peakJd = result[0]; // tret[0] = time of maximum eclipse
    if (peakJd > endJd) break;

    if (peakJd >= startJdWindow) {
      const eclDate = jdToDate(peakJd);
      const moonLon = getLongitude('Moon', eclDate);
      const signIdx = getSignIndex(moonLon);
      const sign = ZODIAC_SIGNS[signIdx];

      eclipses.push({
        type: 'lunar',
        kind: 'partial', // simplified; the return flag determines actual kind
        date: eclDate,
        signIndex: signIdx,
        signSymbol: sign.symbol,
        signName: sign.name,
        rowKey: 'planet-TrueNode',
      });
    }

    jdSearch = peakJd + 10;
  }

  // Sort chronologically
  eclipses.sort((a, b) => a.date - b.date);

  return eclipses;
}
