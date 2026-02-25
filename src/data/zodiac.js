/**
 * Zodiac sign definitions and sign-change detection.
 *
 * Each sign spans exactly 30° of ecliptic longitude:
 *   0–30° Aries, 30–60° Taurus, …, 330–360° Pisces.
 */

export const ZODIAC_SIGNS = [
  { index: 0,  name: 'Aries',       symbol: '\u2648' },  // ♈
  { index: 1,  name: 'Taurus',      symbol: '\u2649' },  // ♉
  { index: 2,  name: 'Gemini',      symbol: '\u264A' },  // ♊
  { index: 3,  name: 'Cancer',      symbol: '\u264B' },  // ♋
  { index: 4,  name: 'Leo',         symbol: '\u264C' },  // ♌
  { index: 5,  name: 'Virgo',       symbol: '\u264D' },  // ♍
  { index: 6,  name: 'Libra',       symbol: '\u264E' },  // ♎
  { index: 7,  name: 'Scorpio',     symbol: '\u264F' },  // ♏
  { index: 8,  name: 'Sagittarius', symbol: '\u2650' },  // ♐
  { index: 9,  name: 'Capricorn',   symbol: '\u2651' },  // ♑
  { index: 10, name: 'Aquarius',    symbol: '\u2652' },  // ♒
  { index: 11, name: 'Pisces',      symbol: '\u2653' },  // ♓
];

/** Convert ecliptic longitude (0–360) to sign index (0–11). */
export function getSignIndex(longitude) {
  return Math.floor(((longitude % 360) + 360) % 360 / 30) % 12;
}

/**
 * Element RGB values by zodiac element.
 * signIndex % 4 maps to element: 0=Fire, 1=Earth, 2=Air, 3=Water.
 */
const ELEMENT_RGB = [
  [200, 60, 60],   // 0 = Fire  — red
  [60, 150, 60],   // 1 = Earth — green
  [190, 170, 40],  // 2 = Air   — yellow
  [50, 100, 200],  // 3 = Water — blue
];

/** Get the element color as rgba string for a given sign index + alpha. */
export function getElementColor(signIndex, alpha = 0.45) {
  const [r, g, b] = ELEMENT_RGB[signIndex % 4];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Get raw [r, g, b] for a given sign index. */
export function getElementRGB(signIndex) {
  return ELEMENT_RGB[signIndex % 4];
}

/**
 * Detect zodiac sign boundary crossings from a longitude time-series.
 *
 * @param {string} planetId  — planet identifier (e.g. 'Jupiter')
 * @param {Array<{date: Date, longitude: number}>} longitudes — daily samples
 * @param {(date: Date) => number} getLon — exact longitude at an arbitrary date
 * @returns {{ changes: Array<{date, planet, signIndex, signSymbol, signName, rowKey}>, initialSignIndex: number }}
 */
export function detectSignChanges(planetId, longitudes, getLon) {
  if (!longitudes || longitudes.length < 2) return { changes: [], initialSignIndex: 0 };

  const initialSignIndex = getSignIndex(longitudes[0].longitude);
  const changes = [];
  let prevSign = initialSignIndex;

  for (let i = 1; i < longitudes.length; i++) {
    const currSign = getSignIndex(longitudes[i].longitude);
    if (currSign !== prevSign) {
      // Refine exact crossing via binary search
      const exactDate = refineCrossing(
        longitudes[i - 1].date,
        longitudes[i].date,
        prevSign,
        getLon,
      );
      const sign = ZODIAC_SIGNS[currSign];
      changes.push({
        date: exactDate,
        planet: planetId,
        signIndex: currSign,
        signSymbol: sign.symbol,
        signName: sign.name,
        rowKey: `planet-${planetId}`,
      });
      prevSign = currSign;
    }
  }

  return { changes, initialSignIndex };
}

/**
 * Binary-search between two sample dates to find the moment the sign changes.
 * Converges to ~1-hour precision in ≤20 iterations.
 */
function refineCrossing(dateA, dateB, prevSignIndex, getLon) {
  let lo = dateA.getTime();
  let hi = dateB.getTime();

  for (let iter = 0; iter < 20; iter++) {
    const mid = Math.floor((lo + hi) / 2);
    const midSign = getSignIndex(getLon(new Date(mid)));
    if (midSign === prevSignIndex) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return new Date(hi);
}
