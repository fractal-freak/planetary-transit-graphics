/**
 * Retrograde station detection and period computation.
 *
 * Detects when a planet stations retrograde (velocity crosses zero going
 * negative) or stations direct (velocity crosses zero going positive).
 * Uses the same daily longitude samples cached by useTransits and refines
 * exact station times via binary search — same pattern as zodiac.js.
 */

import { getSignIndex, ZODIAC_SIGNS } from './zodiac';

/**
 * Compute velocity (degrees/day) between consecutive longitude samples.
 * Handles the 360°/0° wrap correctly.
 */
function computeVelocities(longitudes) {
  const velocities = [];
  for (let i = 1; i < longitudes.length; i++) {
    let delta = longitudes[i].longitude - longitudes[i - 1].longitude;
    // Normalize to [-180, 180] to handle the 0°/360° wrap
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    velocities.push({
      date: longitudes[i].date,
      prevDate: longitudes[i - 1].date,
      velocity: delta,  // degrees/day (positive = direct, negative = retrograde)
    });
  }
  return velocities;
}

/**
 * Compute velocity at an arbitrary date using getLon.
 * Uses a 2-hour window centered on the date for the derivative.
 */
function velocityAt(date, getLon) {
  const STEP = 3600000; // 1 hour
  const t = date.getTime();
  const lonBefore = getLon(new Date(t - STEP));
  const lonAfter = getLon(new Date(t + STEP));
  let vel = lonAfter - lonBefore;
  if (vel > 180) vel -= 360;
  if (vel < -180) vel += 360;
  return vel; // sign indicates direction; magnitude is proportional to degrees/2h
}

/**
 * Binary-search between two dates to find the exact moment velocity crosses zero.
 * For a station retrograde (direct→retrograde): velocity goes from positive to negative.
 * For a station direct (retrograde→direct): velocity goes from negative to positive.
 *
 * @param {Date} dateA — date where velocity has the "before" sign
 * @param {Date} dateB — date where velocity has the "after" sign
 * @param {'retrograde'|'direct'} stationType — which kind of station we're refining
 * @param {(date: Date) => number} getLon — exact longitude at arbitrary date
 * @returns {Date} refined station time (~1 hour precision)
 */
function refineStation(dateA, dateB, stationType, getLon) {
  let lo = dateA.getTime();
  let hi = dateB.getTime();

  for (let iter = 0; iter < 20; iter++) {
    const mid = Math.floor((lo + hi) / 2);
    const vel = velocityAt(new Date(mid), getLon);

    if (stationType === 'retrograde') {
      // We're searching for the transition from positive to negative velocity.
      // lo should be on the "still direct" side, hi on the "already retrograde" side.
      if (vel >= 0) {
        lo = mid; // still direct → station is later
      } else {
        hi = mid; // already retrograde → station is earlier
      }
    } else {
      // Station direct: transition from negative to positive velocity.
      if (vel < 0) {
        lo = mid; // still retrograde → station is later
      } else {
        hi = mid; // already direct → station is earlier
      }
    }
  }

  return new Date(Math.floor((lo + hi) / 2));
}

/**
 * Detect planetary stations (retrograde and direct) and compute retrograde periods.
 *
 * @param {string} planetId — planet identifier (e.g. 'Jupiter')
 * @param {Array<{date: Date, longitude: number}>} longitudes — daily samples
 * @param {(date: Date) => number} getLon — exact longitude at an arbitrary date
 * @param {Date} startDate — start of the date range
 * @param {Date} endDate — end of the date range
 * @returns {{ stations, retrogradePeriods, initiallyRetrograde }}
 */
export function detectStations(planetId, longitudes, getLon, startDate, endDate) {
  if (!longitudes || longitudes.length < 3) {
    return { stations: [], retrogradePeriods: [], initiallyRetrograde: false };
  }

  const velocities = computeVelocities(longitudes);

  // Determine if the planet is retrograde at the start of the range
  const initiallyRetrograde = velocityAt(startDate, getLon) < 0;

  // Find zero-crossings in velocity
  const rawStations = [];
  for (let i = 1; i < velocities.length; i++) {
    const prevVel = velocities[i - 1].velocity;
    const currVel = velocities[i].velocity;

    if (prevVel >= 0 && currVel < 0) {
      // Direct → retrograde: station retrograde
      const refinedDate = refineStation(
        velocities[i - 1].date,
        velocities[i].date,
        'retrograde',
        getLon,
      );
      const signIdx = getSignIndex(getLon(refinedDate));
      const sign = ZODIAC_SIGNS[signIdx];
      rawStations.push({
        date: refinedDate,
        planet: planetId,
        type: 'retrograde',
        signIndex: signIdx,
        signSymbol: sign.symbol,
        signName: sign.name,
        rowKey: `planet-${planetId}`,
      });
    } else if (prevVel < 0 && currVel >= 0) {
      // Retrograde → direct: station direct
      const refinedDate = refineStation(
        velocities[i - 1].date,
        velocities[i].date,
        'direct',
        getLon,
      );
      const signIdx = getSignIndex(getLon(refinedDate));
      const sign = ZODIAC_SIGNS[signIdx];
      rawStations.push({
        date: refinedDate,
        planet: planetId,
        type: 'direct',
        signIndex: signIdx,
        signSymbol: sign.symbol,
        signName: sign.name,
        rowKey: `planet-${planetId}`,
      });
    }
  }

  // Sort stations chronologically
  rawStations.sort((a, b) => a.date - b.date);

  // Build retrograde periods from station pairs
  const retrogradePeriods = [];
  let retroStart = initiallyRetrograde ? startDate : null;

  for (const st of rawStations) {
    if (st.type === 'retrograde') {
      retroStart = st.date;
    } else if (st.type === 'direct' && retroStart != null) {
      retrogradePeriods.push({
        startDate: retroStart,
        endDate: st.date,
        planet: planetId,
        rowKey: `planet-${planetId}`,
      });
      retroStart = null;
    }
  }

  // If the range ends while still retrograde, close with endDate
  if (retroStart != null) {
    retrogradePeriods.push({
      startDate: retroStart,
      endDate,
      planet: planetId,
      rowKey: `planet-${planetId}`,
    });
  }

  return { stations: rawStations, retrogradePeriods, initiallyRetrograde };
}

/**
 * Filter sign changes to only those relevant to retrograde cycles.
 * Used when showRetrogrades=ON but showSignChanges=OFF.
 *
 * Includes:
 *  - The last ingress before each station retrograde (entry into the retrograde sign)
 *  - Any ingress that occurs during a retrograde period (between Rx and D stations)
 *  - The first forward ingress after each D station (the "clean exit" sign)
 *
 * @param {Array} allSignChanges — all sign changes for the planet
 * @param {Array} retrogradePeriods — retrograde periods for the planet
 * @param {string} planet — planet ID to filter for
 * @param {Array} [stations] — station events (used to find ingress before Rx)
 * @returns {Array} filtered sign changes
 */
export function getRetrogradeCycleIngresses(allSignChanges, retrogradePeriods, planet, stations = []) {
  const planetChanges = allSignChanges.filter(sc => sc.planet === planet);
  const planetPeriods = retrogradePeriods.filter(rp => rp.planet === planet);
  const planetStations = stations.filter(s => s.planet === planet);

  if (planetPeriods.length === 0) return [];

  const result = new Set();

  for (const period of planetPeriods) {
    const rpStart = period.startDate.getTime();
    const rpEnd = period.endDate.getTime();

    // Include the last ingress before the station retrograde.
    // This is the ingress into the sign where the planet stations Rx.
    let lastBefore = null;
    for (const sc of planetChanges) {
      const scTime = sc.date.getTime();
      if (scTime < rpStart) {
        if (!lastBefore || scTime > lastBefore.date.getTime()) {
          lastBefore = sc;
        }
      }
    }
    if (lastBefore) {
      result.add(lastBefore);
    }

    // Include all ingresses during the retrograde period
    for (const sc of planetChanges) {
      const scTime = sc.date.getTime();
      if (scTime >= rpStart && scTime <= rpEnd) {
        result.add(sc);
      }
    }

    // Include the first forward ingress after station direct
    let firstAfter = null;
    for (const sc of planetChanges) {
      const scTime = sc.date.getTime();
      if (scTime > rpEnd) {
        if (!firstAfter || scTime < firstAfter.date.getTime()) {
          firstAfter = sc;
        }
      }
    }
    if (firstAfter) {
      result.add(firstAfter);
    }
  }

  return [...result].sort((a, b) => a.date - b.date);
}
