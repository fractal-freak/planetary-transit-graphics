/**
 * True Lunar Node ephemeris using the Meeus algorithm.
 *
 * astronomy-engine doesn't include the lunar node as a Body, so we compute
 * the True North Node longitude from the standard Meeus formula (Ch. 47):
 *   Mean longitude Ω with periodic perturbation corrections.
 *
 * Accuracy: ±1.7° — sufficient for orb-based aspect detection.
 * The True Node oscillates around the Mean Node with a ~18.6-year cycle
 * and is retrograde most of the time (moving ~3°/month backwards).
 */

const DEG2RAD = Math.PI / 180;

// J2000.0 epoch as Unix ms
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0); // Jan 1.5, 2000 TT ≈ UTC

/**
 * Julian centuries since J2000.0 for a given Date.
 */
function julianCenturies(date) {
  const jd = 2451545.0 + (date.getTime() - J2000_MS) / 86400000;
  return (jd - 2451545.0) / 36525;
}

/**
 * Normalize angle to 0–360°.
 */
function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Mean elongation of the Moon from the Sun (D), degrees.
 * Meeus Ch. 47
 */
function meanElongation(T) {
  return norm360(297.8502042 + 445267.1115168 * T - 0.0016300 * T * T + T * T * T / 545868 - T * T * T * T / 113065000);
}

/**
 * Sun's mean anomaly (M☉), degrees.
 */
function sunMeanAnomaly(T) {
  return norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T * T * T / 24490000);
}

/**
 * Moon's mean anomaly (M☽), degrees.
 */
function moonMeanAnomaly(T) {
  return norm360(134.9634114 + 477198.8676313 * T + 0.0089970 * T * T + T * T * T / 69699 - T * T * T * T / 14712000);
}

/**
 * Moon's argument of latitude (F), degrees.
 */
function moonArgLatitude(T) {
  return norm360(93.2720993 + 483202.0175273 * T - 0.0034029 * T * T - T * T * T / 3526000 + T * T * T * T / 863310000);
}

/**
 * Mean longitude of the ascending node of the Moon (Ω), degrees.
 */
function meanNodeLongitude(T) {
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441 - T * T * T * T / 60616000);
}

/**
 * Compute the True North Node ecliptic longitude at a given Date.
 *
 * Uses the mean node Ω plus perturbation corrections from
 * Meeus "Astronomical Algorithms" Ch. 47.
 *
 * @param {Date} date
 * @returns {number} ecliptic longitude in degrees (0–360)
 */
export function getTrueNodeLongitude(date) {
  const T = julianCenturies(date);

  const omega = meanNodeLongitude(T);
  const D = meanElongation(T);
  const M = sunMeanAnomaly(T);
  const Mp = moonMeanAnomaly(T);
  const F = moonArgLatitude(T);

  // Perturbation corrections (Meeus Table 47.B, major terms)
  let correction = 0;
  correction += -1.4979 * Math.sin((2 * (D - F)) * DEG2RAD);
  correction += -0.1500 * Math.sin(M * DEG2RAD);
  correction += -0.1226 * Math.sin((2 * D) * DEG2RAD);
  correction +=  0.1176 * Math.sin((2 * F) * DEG2RAD);
  correction += -0.0801 * Math.sin((2 * (Mp - F)) * DEG2RAD);

  return norm360(omega + correction);
}

/**
 * Compute True North Node longitudes over a date range.
 * Returns array of { date: Date, longitude: number } — compatible with
 * the ephemeris.js computeLongitudes() output format.
 *
 * Always samples at 1-day intervals regardless of range length.
 * The node moves ~3°/month — daily resolution ensures accurate
 * sign change detection without missing any boundary crossings.
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array<{date: Date, longitude: number}>}
 */
export function computeTrueNodeLongitudes(startDate, endDate) {
  const stepMs = 86_400_000; // always 1 day

  const points = [];
  let t = startDate.getTime();
  const end = endDate.getTime();

  while (t <= end) {
    const d = new Date(t);
    points.push({ date: d, longitude: getTrueNodeLongitude(d) });
    t += stepMs;
  }

  // Ensure the very last point is exactly at endDate
  const lastT = points.length > 0 ? points[points.length - 1].date.getTime() : 0;
  if (lastT < end) {
    points.push({ date: new Date(end), longitude: getTrueNodeLongitude(new Date(end)) });
  }

  return points;
}
