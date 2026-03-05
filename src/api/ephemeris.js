import { getSwe, dateToJd } from './swisseph';

/**
 * Maps our planet names to Swiss Ephemeris body constants.
 * Constants are numeric (SE_SUN = 0, SE_MOON = 1, etc.) and
 * are accessed from the SwissEph instance.
 */
const SE_BODY_MAP = {
  Sun: 0,       // SE_SUN
  Moon: 1,      // SE_MOON
  Mercury: 2,   // SE_MERCURY
  Venus: 3,     // SE_VENUS
  Mars: 4,      // SE_MARS
  Jupiter: 5,   // SE_JUPITER
  Saturn: 6,    // SE_SATURN
  Uranus: 7,    // SE_URANUS
  Neptune: 8,   // SE_NEPTUNE
  Pluto: 9,     // SE_PLUTO
  TrueNode: 11, // SE_TRUE_NODE
};

/**
 * Returns the geocentric ecliptic longitude (0–360°) for a body at a given Date.
 *
 * Uses Swiss Ephemeris WASM (±0.001 arcsecond accuracy).
 * The WASM module must be initialized before calling this function.
 */
export function getLongitude(bodyName, date) {
  const seBody = SE_BODY_MAP[bodyName];
  if (seBody === undefined) throw new Error(`Unknown body: ${bodyName}`);

  const swe = getSwe();
  const jd = dateToJd(date);
  const result = swe.calc_ut(jd, seBody, swe.SEFLG_SWIEPH | swe.SEFLG_SPEED);
  return result[0]; // ecliptic longitude in degrees
}

/**
 * Computes ecliptic longitudes for a single body over a date range.
 * Returns array of { date: Date, longitude: number }.
 *
 * Always samples at 1-day intervals regardless of range length.
 * Even 10 years (~3650 samples) computes in <50 ms, and daily
 * resolution is essential for catching fast-body aspects (Moon
 * moves ~13°/day; an 8° orb window lasts only ~30 hours).
 */
export function computeLongitudes(bodyName, startDate, endDate) {
  const stepMs = 86_400_000; // always 1 day

  const points = [];
  let t = startDate.getTime();
  const end = endDate.getTime();

  while (t <= end) {
    const d = new Date(t);
    points.push({ date: d, longitude: getLongitude(bodyName, d) });
    t += stepMs;
  }

  // Ensure the very last point is exactly at endDate so curves extend
  // to the chart edge (the stepped loop may stop short).
  const lastT = points.length > 0 ? points[points.length - 1].date.getTime() : 0;
  if (lastT < end) {
    points.push({ date: new Date(end), longitude: getLongitude(bodyName, new Date(end)) });
  }

  return points;
}

/**
 * Computes longitudes for multiple bodies in one pass.
 * Returns { [bodyName]: [{date, longitude}...] }
 */
export function computeAllLongitudes(bodyNames, startDate, endDate) {
  const result = {};
  for (const name of bodyNames) {
    result[name] = computeLongitudes(name, startDate, endDate);
  }
  return result;
}

/**
 * Compute house cusps and angles for a given time and location.
 *
 * @param {Date} date - The moment to compute for (treated as UTC)
 * @param {number} lat - Geographic latitude (north positive)
 * @param {number} lng - Geographic longitude (east positive)
 * @param {string} [system='P'] - House system code ('P'=Placidus, 'K'=Koch, 'W'=Whole Sign, etc.)
 * @returns {{ cusps: number[], Asc: number, MC: number, Dsc: number, IC: number, Vertex: number }}
 */
export function getHouseCusps(date, lat, lng, system = 'P') {
  const swe = getSwe();
  const jd = dateToJd(date);
  const result = swe.houses(jd, lat, lng, system);

  return {
    cusps: Array.from(result.cusps).slice(1), // cusps[0] is unused; return 1–12 as indices 0–11
    Asc: result.ascmc[0],
    MC: result.ascmc[1],
    Dsc: (result.ascmc[0] + 180) % 360,
    IC: (result.ascmc[1] + 180) % 360,
    Vertex: result.ascmc[3],
  };
}
