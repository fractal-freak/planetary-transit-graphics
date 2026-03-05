/**
 * Cross-chart aspect computation.
 *
 * Given N charts (each with pre-computed positions), computes all
 * pairwise aspects between planets/points across different charts.
 *
 * This is pure trigonometry on stored longitudes — no ephemeris calls.
 * For 5 charts with 15 points each, that's ~5,625 calculations (trivial).
 */

import { ASPECTS, angularSeparation, isHardAspect } from './aspects';
import { PLANET_MAP } from '../data/planets';

/**
 * @typedef {Object} CrossChartAspect
 * @property {Object} chartA - { id, name, chartType }
 * @property {Object} chartB - { id, name, chartType }
 * @property {string} bodyA - Planet/point ID from chart A
 * @property {string} bodyB - Planet/point ID from chart B
 * @property {Object} aspect - { name, symbol, angle }
 * @property {number} orb - Degrees from exact (always positive)
 * @property {number} lonA - Ecliptic longitude of bodyA
 * @property {number} lonB - Ecliptic longitude of bodyB
 * @property {string} label - Display label e.g. "♄☌MC"
 */

/**
 * Compute all cross-chart aspects between the given charts.
 *
 * @param {Array<Object>} charts - Array of chart objects, each with:
 *   { id, name, chartType, positions: { Sun: 142.3, ... }, angles: { Asc: 30.5, ... } }
 * @param {Object} [options]
 * @param {string[]} [options.aspectTypes] - Filter to specific aspect names (default: all)
 * @param {boolean} [options.hardOnly=false] - Only include hard aspects (conjunction, square, opposition)
 * @param {number} [options.maxOrb=8] - Maximum orb to include
 * @param {Object} [options.orbOverrides] - Per-aspect orb overrides { Conjunction: 10, Square: 8, ... }
 * @returns {CrossChartAspect[]} Sorted by orb tightness (tightest first)
 */
export function computeCrossChartAspects(charts, options = {}) {
  const {
    aspectTypes = null,
    hardOnly = false,
    maxOrb = 8,
    orbOverrides = {},
  } = options;

  // Filter aspects
  let aspects = ASPECTS;
  if (hardOnly) {
    aspects = aspects.filter(a => isHardAspect(a.angle));
  }
  if (aspectTypes) {
    const typeSet = new Set(aspectTypes);
    aspects = aspects.filter(a => typeSet.has(a.name));
  }

  const results = [];

  // For each pair of charts (A, B) where A index < B index (avoid duplicates)
  for (let i = 0; i < charts.length; i++) {
    for (let j = i + 1; j < charts.length; j++) {
      const chartA = charts[i];
      const chartB = charts[j];

      // Merge positions + angles into one lookup per chart
      const pointsA = getAllPoints(chartA);
      const pointsB = getAllPoints(chartB);

      // For each pair of bodies across the two charts
      for (const [bodyIdA, lonA] of pointsA) {
        for (const [bodyIdB, lonB] of pointsB) {
          const pA = PLANET_MAP[bodyIdA];
          const pB = PLANET_MAP[bodyIdB];

          // Conjunction-only filtering for nodes
          const isNodePair = pA?.conjunctionOnly || pB?.conjunctionOnly;

          for (const aspect of aspects) {
            if (isNodePair && aspect.name !== 'Conjunction') continue;

            const orb = orbOverrides[aspect.name] ?? maxOrb;
            const sep = angularSeparation(lonA, lonB);
            const deviation = Math.abs(sep - aspect.angle);

            if (deviation <= orb) {
              const symbolA = pA?.symbol || bodyIdA;
              const symbolB = pB?.symbol || bodyIdB;

              results.push({
                chartA: { id: chartA.id, name: chartA.name, chartType: chartA.chartType },
                chartB: { id: chartB.id, name: chartB.name, chartType: chartB.chartType },
                bodyA: bodyIdA,
                bodyB: bodyIdB,
                aspect: { name: aspect.name, symbol: aspect.symbol, angle: aspect.angle },
                orb: Math.round(deviation * 100) / 100,
                lonA,
                lonB,
                label: `${symbolA}${aspect.symbol}${symbolB}`,
              });
            }
          }
        }
      }
    }
  }

  // Sort by orb tightness
  results.sort((a, b) => a.orb - b.orb);

  return results;
}

/**
 * Extract all chartable points (planets + angles) from a chart.
 * Returns array of [bodyId, longitude] pairs.
 */
function getAllPoints(chart) {
  const points = [];

  // Planet positions
  if (chart.positions) {
    for (const [bodyId, lon] of Object.entries(chart.positions)) {
      if (typeof lon === 'number' && !isNaN(lon)) {
        points.push([bodyId, lon]);
      }
    }
  }

  // Chart angles
  if (chart.angles) {
    for (const [angleId, lon] of Object.entries(chart.angles)) {
      if (typeof lon === 'number' && !isNaN(lon)) {
        points.push([angleId, lon]);
      }
    }
  }

  return points;
}

/**
 * Compute cross-chart aspects and group by chart pair.
 * Returns a Map<string, CrossChartAspect[]> keyed by "chartA.id_chartB.id".
 */
export function groupAspectsByChartPair(aspects) {
  const groups = new Map();
  for (const aspect of aspects) {
    const key = `${aspect.chartA.id}_${aspect.chartB.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(aspect);
  }
  return groups;
}

/**
 * Filter aspects to only those involving a specific chart.
 */
export function filterAspectsByChart(aspects, chartId) {
  return aspects.filter(a => a.chartA.id === chartId || a.chartB.id === chartId);
}

/**
 * Get a summary of the most significant aspects (tightest orbs).
 */
export function getTopAspects(aspects, limit = 10) {
  return aspects.slice(0, limit); // Already sorted by orb
}
