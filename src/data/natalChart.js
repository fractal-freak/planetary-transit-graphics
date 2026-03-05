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
