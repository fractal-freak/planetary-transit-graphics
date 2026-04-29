/**
 * Eclipse event computation using Swiss Ephemeris WASM.
 *
 * Uses swe_lun_eclipse_when / swe_sol_eclipse_when_glob to find all
 * eclipses within a date range, enriched with zodiac sign data.
 *
 * Note: the swisseph-wasm wrappers for these two functions pass args
 * in the wrong order (backward before tret), so we call ccall directly
 * with the correct order matching the C signature:
 *   swe_sol_eclipse_when_glob(tjd_start, ifl, ifltype, tret, backward, serr)
 *   swe_lun_eclipse_when(tjd_start, ifl, ifltype, tret, backward, serr)
 */

import { getSwe, dateToJd, jdToDate } from './swisseph';
import { getLongitude } from './ephemeris';
import { getSignIndex, ZODIAC_SIGNS } from '../data/zodiac';

/** Call swe_sol_eclipse_when_glob with the correct argument order. */
function solEclipseWhenGlob(swe, tjdStart, flags, eclipseType, backward) {
  const M = swe.SweModule;
  const tretPtr = M._malloc(10 * Float64Array.BYTES_PER_ELEMENT);
  const serrPtr = M._malloc(256);
  try {
    const ret = M.ccall(
      'swe_sol_eclipse_when_glob',
      'number',
      ['number', 'number', 'number', 'pointer', 'number', 'pointer'],
      [tjdStart, flags, eclipseType, tretPtr, backward, serrPtr],
    );
    if (ret < 0) return null;
    const view = new Float64Array(M.HEAPF64.buffer, tretPtr, 10);
    return { ret, tret: Array.from(view) };
  } finally {
    M._free(tretPtr);
    M._free(serrPtr);
  }
}

/** Call swe_lun_eclipse_when with the correct argument order. */
function lunEclipseWhen(swe, tjdStart, flags, eclipseType, backward) {
  const M = swe.SweModule;
  const tretPtr = M._malloc(10 * Float64Array.BYTES_PER_ELEMENT);
  const serrPtr = M._malloc(256);
  try {
    const ret = M.ccall(
      'swe_lun_eclipse_when',
      'number',
      ['number', 'number', 'number', 'pointer', 'number', 'pointer'],
      [tjdStart, flags, eclipseType, tretPtr, backward, serrPtr],
    );
    if (ret < 0) return null;
    const view = new Float64Array(M.HEAPF64.buffer, tretPtr, 10);
    return { ret, tret: Array.from(view) };
  } finally {
    M._free(tretPtr);
    M._free(serrPtr);
  }
}

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
    const result = solEclipseWhenGlob(swe, jdSearch, swe.SEFLG_SWIEPH, 0, 0);
    if (!result) break;

    const peakJd = result.tret[0]; // tret[0] = time of maximum eclipse
    if (!Number.isFinite(peakJd) || peakJd <= jdSearch) break;
    if (peakJd > endJd) break;

    if (peakJd >= startJdWindow) {
      const eclDate = jdToDate(peakJd);
      const sunLon = getLongitude('Sun', eclDate);
      const signIdx = getSignIndex(sunLon);
      const sign = ZODIAC_SIGNS[signIdx];

      eclipses.push({
        type: 'solar',
        kind: solarEclipseKind(result.ret),
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
    const result = lunEclipseWhen(swe, jdSearch, swe.SEFLG_SWIEPH, 0, 0);
    if (!result) break;

    const peakJd = result.tret[0]; // tret[0] = time of maximum eclipse
    if (!Number.isFinite(peakJd) || peakJd <= jdSearch) break;
    if (peakJd > endJd) break;

    if (peakJd >= startJdWindow) {
      const eclDate = jdToDate(peakJd);
      const moonLon = getLongitude('Moon', eclDate);
      const signIdx = getSignIndex(moonLon);
      const sign = ZODIAC_SIGNS[signIdx];

      eclipses.push({
        type: 'lunar',
        kind: lunarEclipseKind(result.ret),
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
