import { getLongitude } from '../api/ephemeris';
import { SiderealTime, MakeTime } from 'astronomy-engine';
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
 * Requires geographic latitude and longitude.  Uses astronomy-engine's
 * SiderealTime() for GAST, then derives Local Sidereal Time → RAMC,
 * and applies standard trigonometric formulas for the Midheaven and Ascendant.
 *
 * @param {Date} birthDateTime - JS Date combining date + time
 * @param {number} lat - geographic latitude in degrees (north positive)
 * @param {number} lng - geographic longitude in degrees (east positive)
 * @returns {{ Asc: number, Dsc: number, MC: number, IC: number }} ecliptic longitudes 0–360°
 */
export function computeNatalAngles(birthDateTime, lat, lng) {
  const time = MakeTime(birthDateTime);

  // Greenwich Apparent Sidereal Time in hours
  const gast = SiderealTime(time);

  // Local Sidereal Time (east longitude positive)
  let lst = gast + lng / 15;
  lst = ((lst % 24) + 24) % 24;

  // Right Ascension of the Medium Coeli in degrees
  const ramc = lst * 15;

  // Obliquity of the ecliptic (IAU formula, mean obliquity)
  const jc = time.tt / 36525; // Julian centuries from J2000.0
  const oblDeg =
    23.4392911 - 0.0130042 * jc - 1.64e-7 * jc * jc + 5.04e-7 * jc * jc * jc;

  const DEG = Math.PI / 180;
  const e = oblDeg * DEG;
  const r = ramc * DEG;
  const phi = lat * DEG;

  // MC (Midheaven) ecliptic longitude
  let mc = Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(e));
  mc = ((mc / DEG) + 360) % 360;

  // ASC (Ascendant) ecliptic longitude
  let asc = Math.atan2(
    -Math.cos(r),
    Math.sin(e) * Math.tan(phi) + Math.cos(e) * Math.sin(r),
  );
  asc = ((asc / DEG) + 360) % 360;

  return {
    Asc: asc,
    Dsc: (asc + 180) % 360,
    MC: mc,
    IC: (mc + 180) % 360,
  };
}

/**
 * Combine a date string (YYYY-MM-DD) and time string (HH:MM) into a Date.
 * Treats input as local time (since we don't have timezone yet).
 */
export function combineDateAndTime(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = (timeStr || '12:00').split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
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
