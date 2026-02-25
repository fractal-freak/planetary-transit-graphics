import { Body, GeoVector, Ecliptic, MakeTime } from 'astronomy-engine';
import { getTrueNodeLongitude, computeTrueNodeLongitudes } from '../data/trueNode';

/**
 * Maps our planet names to astronomy-engine Body enum values.
 */
const BODY_MAP = {
  Sun: Body.Sun,
  Moon: Body.Moon,
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
  Pluto: Body.Pluto,
};

/**
 * Returns the geocentric ecliptic longitude (0–360°) for a body at a given Date.
 */
export function getLongitude(bodyName, date) {
  // True Node uses custom Meeus ephemeris (not in astronomy-engine Body enum)
  if (bodyName === 'TrueNode') return getTrueNodeLongitude(date);

  const body = BODY_MAP[bodyName];
  if (body === undefined) throw new Error(`Unknown body: ${bodyName}`);

  const time = MakeTime(date);
  const geo = GeoVector(body, time, true); // true = aberration correction
  return Ecliptic(geo).elon;
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
  // True Node uses custom Meeus ephemeris
  if (bodyName === 'TrueNode') return computeTrueNodeLongitudes(startDate, endDate);

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
