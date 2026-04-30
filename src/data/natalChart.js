import tzLookup from 'tz-lookup';
import { getLongitude, getHouseCusps } from '../api/ephemeris';
import { PLANETS } from './planets';
import { ZODIAC_SIGNS, getSignIndex } from './zodiac';

/**
 * Compute ecliptic longitudes for all planets at a given birth date/time.
 *
 * @param {Date} birthDateTime - JS Date combining date + time
 * @returns {Object} { Sun: 142.3, Moon: 287.1, ... }
 */
export function computeNatalPositions(birthDateTime) {
  const positions = {};
  for (const planet of PLANETS) {
    positions[planet.id] = getLongitude(planet.id, birthDateTime);
  }
  return positions;
}

/**
 * Compute the four natal chart angles (ASC, DSC, MC, IC) from birth time + location.
 *
 * Uses Swiss Ephemeris swe_houses() for high-precision angle computation.
 *
 * @param {Date} birthDateTime - JS Date combining date + time
 * @param {number} lat - geographic latitude in degrees (north positive)
 * @param {number} lng - geographic longitude in degrees (east positive)
 * @returns {{ Asc: number, Dsc: number, MC: number, IC: number }} ecliptic longitudes 0–360°
 */
export function computeNatalAngles(birthDateTime, lat, lng) {
  const houses = getHouseCusps(birthDateTime, lat, lng, 'P');
  return {
    Asc: houses.Asc,
    Dsc: houses.Dsc,
    MC: houses.MC,
    IC: houses.IC,
  };
}

/**
 * Combine a date string (YYYY-MM-DD) and time string (HH:MM) into a Date.
 *
 * If `lat`/`lng` are provided, the input is treated as local wall-clock time
 * at the birthplace and converted to the correct UTC instant using the
 * IANA timezone resolved from coordinates (handles DST, regional rules).
 *
 * Without coordinates, falls back to interpreting the input in the
 * browser's local timezone — this is wrong for any chart whose birthplace
 * differs from the device, but it's the best we can do without location
 * data (e.g. legacy charts saved before lat/lng were captured).
 */
export function combineDateAndTime(dateStr, timeStr, lat, lng) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = (timeStr || '12:00').split(':').map(Number);
  if (lat != null && lng != null) {
    return wallClockToUTC(year, month, day, hours, minutes, lat, lng);
  }
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}


/**
 * Convert (year, month, day, hours, minutes) wall-clock time at lat/lng to
 * the UTC Date instant. Resolves the birthplace's IANA timezone via
 * tz-lookup and uses Intl.DateTimeFormat to figure out the offset that
 * applies on that local date (handles DST and historical rules).
 *
 * Iterates twice to converge near DST boundaries where the offset depends
 * on the time itself.
 */
function wallClockToUTC(year, month, day, hours, minutes, lat, lng) {
  let timeZone;
  try {
    timeZone = tzLookup(lat, lng);
  } catch {
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }
  // Start by guessing UTC = wall-clock interpreted as UTC, then adjust.
  let guess = Date.UTC(year, month - 1, day, hours, minutes);
  for (let i = 0; i < 2; i++) {
    const offsetMs = tzOffsetAt(guess, timeZone);
    guess = Date.UTC(year, month - 1, day, hours, minutes) - offsetMs;
  }
  return new Date(guess);
}

/**
 * Return the offset from UTC (in milliseconds) for the given instant in
 * the named timezone. Positive for east of UTC.
 */
function tzOffsetAt(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t) => parseInt(parts.find(p => p.type === t).value, 10);
  let h = get('hour');
  if (h === 24) h = 0; // some locales render midnight as 24
  const localAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return localAsUTC - utcMs;
}

/**
 * Format a longitude as compact degree + sign symbol.
 * e.g. 44.5 → "14°♉"
 */
export function formatDegree(longitude) {
  const normalized = ((longitude % 360) + 360) % 360;
  const signIdx = getSignIndex(normalized);
  const degInSign = Math.floor(normalized % 30);
  return `${degInSign}°${ZODIAC_SIGNS[signIdx].symbol}`;
}

/**
 * Format a longitude as verbose position.
 * e.g. 44.5 → "14° Taurus 30'"
 */
export function formatPosition(longitude) {
  const normalized = ((longitude % 360) + 360) % 360;
  const signIdx = getSignIndex(normalized);
  const degInSign = normalized % 30;
  const deg = Math.floor(degInSign);
  const min = Math.floor((degInSign - deg) * 60);
  return `${deg}° ${ZODIAC_SIGNS[signIdx].name} ${min}'`;
}
