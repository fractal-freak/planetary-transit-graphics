/**
 * Swiss Ephemeris WASM singleton.
 *
 * Initializes the WebAssembly module once and exposes the instance
 * for synchronous use throughout the app.  Call `initSwissEph()` at
 * app startup (before any component renders) and then use `getSwe()`
 * to obtain the ready instance.
 */

import SwissEph from 'swisseph-wasm';

let _swe = null;
let _initPromise = null;

/**
 * Initialize the Swiss Ephemeris WASM module.
 * Safe to call multiple times — subsequent calls return the same promise.
 */
export function initSwissEph() {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    _swe = new SwissEph();
    await _swe.initSwissEph();
    return _swe;
  })();

  return _initPromise;
}

/**
 * Returns the initialized SwissEph instance.
 * Throws if called before `initSwissEph()` resolves.
 */
export function getSwe() {
  if (!_swe) throw new Error('Swiss Ephemeris not initialized — call initSwissEph() first');
  return _swe;
}

/**
 * Check whether the WASM module is ready.
 */
export function isSweReady() {
  return _swe !== null;
}

/**
 * Convert a JavaScript Date (treated as UTC) to a Julian Day Number.
 */
export function dateToJd(date) {
  const swe = getSwe();
  return swe.julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1, // julday expects 1-12
    date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
  );
}

/**
 * Convert a Julian Day Number back to a JavaScript Date (UTC).
 */
export function jdToDate(jd) {
  const swe = getSwe();
  const { year, month, day, hour } = swe.revjul(jd, swe.SE_GREG_CAL);
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  const s = Math.floor(((hour - h) * 60 - m) * 60);
  return new Date(Date.UTC(year, month - 1, day, h, m, s));
}
