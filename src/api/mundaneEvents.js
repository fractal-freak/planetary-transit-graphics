/**
 * Mundane event auto-computation.
 *
 * Finds the exact moments of key astrological events (ingresses,
 * conjunctions, lunations, eclipses) using binary search on Swiss
 * Ephemeris positions, then casts full chart data for those moments.
 */

import { getLongitude, getHouseCusps } from './ephemeris';
import { computeNatalPositions } from '../data/natalChart';
import { computeRelevanceWindow } from '../data/chartTypes';

/**
 * Binary search for the exact moment a planet crosses a target longitude.
 * Searches within [startMs, endMs] to find when getLongitude(body, date) ≈ targetLon.
 *
 * @param {string} body - Planet name
 * @param {number} targetLon - Target ecliptic longitude (degrees)
 * @param {number} startMs - Start of search window (epoch ms)
 * @param {number} endMs - End of search window (epoch ms)
 * @param {number} [tolerance=0.0001] - Degrees of acceptable error
 * @returns {Date} The moment of crossing
 */
function findCrossing(body, targetLon, startMs, endMs, tolerance = 0.0001) {
  // Normalize angle difference to [-180, 180]
  const angleDiff = (a, b) => {
    let d = a - b;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };

  let lo = startMs;
  let hi = endMs;
  let loLon = getLongitude(body, new Date(lo));
  let diff = angleDiff(loLon, targetLon);

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const midLon = getLongitude(body, new Date(mid));
    const midDiff = angleDiff(midLon, targetLon);

    if (Math.abs(midDiff) < tolerance) {
      return new Date(mid);
    }

    // Check which half the crossing is in
    // The crossing is between lo and mid if the sign of diff changes
    const loDiff = angleDiff(getLongitude(body, new Date(lo)), targetLon);
    if ((loDiff > 0 && midDiff < 0) || (loDiff < 0 && midDiff > 0)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return new Date((lo + hi) / 2);
}

/**
 * Find the exact moment a pair of planets reach minimum angular separation
 * (conjunction) within a search window.
 *
 * Uses golden-section search to minimize angular separation.
 *
 * @param {string} bodyA - First planet
 * @param {string} bodyB - Second planet
 * @param {number} startMs - Start of search window
 * @param {number} endMs - End of search window
 * @returns {Date}
 */
function findMinSeparation(bodyA, bodyB, startMs, endMs) {
  const separation = (ms) => {
    const d = new Date(ms);
    const lonA = getLongitude(bodyA, d);
    const lonB = getLongitude(bodyB, d);
    let diff = Math.abs(lonA - lonB);
    if (diff > 180) diff = 360 - diff;
    return diff;
  };

  const PHI = (Math.sqrt(5) - 1) / 2;
  let a = startMs;
  let b = endMs;
  let c = b - PHI * (b - a);
  let d = a + PHI * (b - a);

  for (let i = 0; i < 60; i++) {
    if (separation(c) < separation(d)) {
      b = d;
    } else {
      a = c;
    }
    c = b - PHI * (b - a);
    d = a + PHI * (b - a);
  }

  return new Date((a + b) / 2);
}

/**
 * Find the exact moment of the Aries Ingress for a given year.
 * This is when the Sun crosses 0° Aries (ecliptic longitude 0°).
 *
 * @param {number} year - The year to find the ingress for
 * @returns {Date}
 */
export function findAriesIngress(year) {
  // Sun crosses 0° Aries roughly March 20-21
  const start = new Date(Date.UTC(year, 2, 15)); // March 15
  const end = new Date(Date.UTC(year, 2, 25));   // March 25

  // Sample daily to find the day the Sun crosses 0°
  const DAY = 86400000;
  let crossStart = start.getTime();
  let crossEnd = end.getTime();

  for (let t = crossStart; t < crossEnd; t += DAY) {
    const lon = getLongitude('Sun', new Date(t));
    const nextLon = getLongitude('Sun', new Date(t + DAY));
    // Crossing happens when longitude wraps from ~359° to ~0°
    if (lon > 350 && nextLon < 10) {
      crossStart = t;
      crossEnd = t + DAY;
      break;
    }
  }

  return findCrossing('Sun', 0, crossStart, crossEnd);
}

/**
 * Find the exact Saturn-Jupiter conjunction(s) within a date range.
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Date[]} Array of conjunction moments
 */
export function findGreatConjunctions(startDate, endDate) {
  const conjunctions = [];
  const DAY = 86400000;
  const start = startDate.getTime();
  const end = endDate.getTime();

  // Sample at 30-day intervals to find windows where separation decreases
  let prevSep = Infinity;
  let inApproach = false;
  let approachStart = start;

  for (let t = start; t <= end; t += 30 * DAY) {
    const d = new Date(t);
    const satLon = getLongitude('Saturn', d);
    const jupLon = getLongitude('Jupiter', d);
    let sep = Math.abs(satLon - jupLon);
    if (sep > 180) sep = 360 - sep;

    if (sep < 15 && !inApproach) {
      inApproach = true;
      approachStart = t - 30 * DAY;
    }

    if (inApproach && sep > prevSep && prevSep < 5) {
      // We passed a minimum — refine it
      const exactDate = findMinSeparation('Saturn', 'Jupiter', approachStart, t);
      // Verify it's actually close enough to be a conjunction
      const satAtPeak = getLongitude('Saturn', exactDate);
      const jupAtPeak = getLongitude('Jupiter', exactDate);
      let finalSep = Math.abs(satAtPeak - jupAtPeak);
      if (finalSep > 180) finalSep = 360 - finalSep;
      if (finalSep < 2) {
        conjunctions.push(exactDate);
      }
      inApproach = false;
    }

    prevSep = sep;
  }

  return conjunctions;
}

/**
 * Find all New Moons and Full Moons within a date range.
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array<{ date: Date, type: 'new' | 'full' }>}
 */
export function findLunations(startDate, endDate) {
  const lunations = [];
  const DAY = 86400000;
  const start = startDate.getTime();
  const end = endDate.getTime();

  // Sun-Moon elongation: 0° = new moon, 180° = full moon
  function elongation(ms) {
    const d = new Date(ms);
    const sunLon = getLongitude('Sun', d);
    const moonLon = getLongitude('Moon', d);
    let e = moonLon - sunLon;
    if (e < 0) e += 360;
    return e; // 0-360°
  }

  // Sample at 1-day intervals to detect crossings of 0° and 180°
  let prevE = elongation(start);
  for (let t = start + DAY; t <= end; t += DAY) {
    const curE = elongation(t);

    // New Moon: elongation crosses 0° (wraps from ~350° to ~10°)
    if (prevE > 300 && curE < 60) {
      // Binary search for exact moment
      const exact = binarySearchElongation(t - DAY, t, 0);
      lunations.push({ date: exact, type: 'new' });
    }

    // Full Moon: elongation crosses 180°
    if (prevE < 180 && curE >= 180) {
      const exact = binarySearchElongation(t - DAY, t, 180);
      lunations.push({ date: exact, type: 'full' });
    }

    prevE = curE;
  }

  return lunations;
}

/**
 * Binary search for when Sun-Moon elongation equals target (0 or 180).
 */
function binarySearchElongation(loMs, hiMs, target) {
  for (let i = 0; i < 40; i++) {
    const mid = (loMs + hiMs) / 2;
    const d = new Date(mid);
    const sunLon = getLongitude('Sun', d);
    const moonLon = getLongitude('Moon', d);
    let e = moonLon - sunLon;
    if (e < 0) e += 360;

    if (target === 0) {
      // Looking for elongation = 0 (wrap from 360 to 0)
      if (e > 180) {
        loMs = mid; // elongation hasn't wrapped yet
      } else {
        hiMs = mid; // elongation already wrapped
      }
    } else {
      // Looking for elongation = 180
      if (e < 180) {
        loMs = mid;
      } else {
        hiMs = mid;
      }
    }
  }

  return new Date((loMs + hiMs) / 2);
}

/**
 * Cast a full chart for a given event moment and location.
 * Returns a chart data object ready for Firestore persistence.
 *
 * @param {Object} options
 * @param {Date} options.eventDate - The moment of the event
 * @param {number} options.lat - Geographic latitude
 * @param {number} options.lng - Geographic longitude
 * @param {string} options.locationName - Human-readable location name
 * @param {string} options.chartType - One of: 'natal', 'great_conjunction', 'aries_ingress', 'lunation', 'eclipse'
 * @param {string} options.name - Chart name
 * @param {string} [options.eventDescription] - Description of the event
 * @param {string} [options.houseSystem='P'] - House system code
 * @returns {Object} Chart data object
 */
export function castEventChart({
  eventDate,
  lat,
  lng,
  locationName,
  chartType,
  name,
  eventDescription = null,
  houseSystem = 'P',
}) {
  const positions = computeNatalPositions(eventDate);
  const houses = getHouseCusps(eventDate, lat, lng, houseSystem);
  const { relevanceStart, relevanceEnd } = computeRelevanceWindow(chartType, eventDate);

  // Format date/time strings for storage
  const birthDate = eventDate.toISOString().slice(0, 10);
  const hours = String(eventDate.getUTCHours()).padStart(2, '0');
  const minutes = String(eventDate.getUTCMinutes()).padStart(2, '0');
  const birthTime = `${hours}:${minutes}`;

  return {
    name: name || 'Untitled Chart',
    birthDate,
    birthTime,
    locationName: locationName || null,
    lat,
    lng,
    positions,
    angles: {
      Asc: houses.Asc,
      Dsc: houses.Dsc,
      MC: houses.MC,
      IC: houses.IC,
    },
    chartType,
    relevanceStart: relevanceStart ? relevanceStart.toISOString() : null,
    relevanceEnd: relevanceEnd ? relevanceEnd.toISOString() : null,
    houseCusps: houses.cusps,
    houseSystem,
    eventDescription,
  };
}
