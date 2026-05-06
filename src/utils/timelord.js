/**
 * Annual profections / time lord computation.
 *
 * Each year of life advances the profected house by one sign starting from
 * the Asc sign (or any user-chosen sign). The time lord (lord of the year)
 * is the traditional ruler of the profected sign. Boundaries fall on the
 * native's birthday — the time lord shifts every birthday, not on Jan 1.
 */

import { getSignIndex } from '../data/zodiac';

const TRADITIONAL_RULERS = [
  'Mars',     // 0 Aries
  'Venus',    // 1 Taurus
  'Mercury',  // 2 Gemini
  'Moon',     // 3 Cancer
  'Sun',      // 4 Leo
  'Mercury',  // 5 Virgo
  'Venus',    // 6 Libra
  'Mars',     // 7 Scorpio
  'Jupiter',  // 8 Sagittarius
  'Saturn',   // 9 Capricorn
  'Saturn',   // 10 Aquarius
  'Jupiter',  // 11 Pisces
];

export function getTraditionalRuler(signIndex) {
  return TRADITIONAL_RULERS[((signIndex % 12) + 12) % 12];
}

/**
 * Years elapsed since the native's last birthday on or before `now`.
 * Returns 0 if `now` falls before the native turns 1.
 */
export function profectionAge(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/**
 * Compute the time lord active on `now` for a chart with the given
 * birth date, profecting from `startSignIndex` (0 = Aries, 11 = Pisces).
 */
export function getTimeLord(birthDate, startSignIndex, now = new Date()) {
  const age = profectionAge(birthDate, now);
  if (age == null || startSignIndex == null) return null;
  const profectedSign = ((startSignIndex + age) % 12 + 12) % 12;
  const profectedHouse = (age % 12) + 1;
  const planetId = getTraditionalRuler(profectedSign);
  const birth = new Date(birthDate);
  const yearStart = new Date(birth);
  yearStart.setFullYear(birth.getFullYear() + age);
  const yearEnd = new Date(birth);
  yearEnd.setFullYear(birth.getFullYear() + age + 1);
  return { planetId, profectedSign, profectedHouse, age, yearStart, yearEnd };
}

/**
 * Time lord active on each day in [startDate, endDate). Useful for the
 * dynamic-target job type (later phase).
 */
export function getTimeLordSegments(birthDate, startSignIndex, startDate, endDate) {
  if (!birthDate || startSignIndex == null) return [];
  const segments = [];
  let cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor < end) {
    const tl = getTimeLord(birthDate, startSignIndex, cursor);
    if (!tl) break;
    const segEnd = tl.yearEnd < end ? tl.yearEnd : end;
    segments.push({ ...tl, from: new Date(cursor), to: new Date(segEnd) });
    cursor = new Date(segEnd);
  }
  return segments;
}

/**
 * Resolve the user-selected start sign for a chart's profections.
 * `'asc'` (or unset) uses the chart's Asc sign.
 */
export function resolveStartSign(natalChart, startSign) {
  if (startSign != null && startSign !== 'asc') {
    const n = Number(startSign);
    if (Number.isFinite(n)) return ((n % 12) + 12) % 12;
  }
  if (natalChart?.angles?.Asc == null) return null;
  return getSignIndex(natalChart.angles.Asc);
}
