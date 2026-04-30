import { useState, useEffect, useRef, useMemo } from 'react';
import { computeLongitudes, getLongitude } from '../api/ephemeris';
import { ASPECTS, computeAspectCurve, findPeaks, angularSeparation } from '../utils/aspects';
import { PLANET_MAP, SPEED_ORDER, NON_RETROGRADE_PLANETS } from '../data/planets';
import { detectSignChanges, ZODIAC_SIGNS } from '../data/zodiac';
import { detectStations, getRetrogradeCycleIngresses } from '../data/retrograde';

// Module-level cache for computed longitudes (shared with useTransits)
const longitudeCache = new Map();

function cacheKey(body, start, end) {
  return `${body}_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`;
}

function getCachedLongitudes(body, start, end) {
  const key = cacheKey(body, start, end);
  if (longitudeCache.has(key)) return longitudeCache.get(key);
  const result = computeLongitudes(body, start, end);
  longitudeCache.set(key, result);
  return result;
}

const ASPECT_MAP = Object.fromEntries(ASPECTS.map(a => [a.name, a]));

/**
 * Computes natal transit aspect curves.
 *
 * Identical pipeline to useTransits, but instead of computing aspects between
 * two moving planets, computes aspects between a transiting planet and a FIXED
 * natal position.
 *
 * Each natal target is a constant ecliptic longitude from natalChart.positions.
 * computeAspectCurve() works unchanged — the "target" longitude series is just
 * the same value repeated for every date.
 *
 * @param {Array} natalJobs - [{ id, transitPlanet, natalTargets, aspects, showRetrogrades }]
 * @param {Object|null} natalChart - { positions: { Sun: 142.3, Moon: 287.1, ... } }
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {Object} orbSettings
 */
export function useNatalTransits(natalJobs, natalChart, startDate, endDate, orbSettings) {
  const [curves, setCurves] = useState([]);
  const [signChanges, setSignChanges] = useState({ changes: [], initialSigns: {}, eclipses: [], stations: [], retrogradePeriods: [] });
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const depsKey = useMemo(() => {
    if (!natalChart) return 'none';
    const jobStr = natalJobs
      .map(j => `${j.id}:${j.transitPlanet}:${(j.natalTargets || []).join(',')}:${j.aspects.join(',')}:${j.showSignChanges ?? false}:${j.showRetrogrades ?? false}`)
      .join('|');
    const dateStr = `${startDate?.toISOString()}_${endDate?.toISOString()}`;
    const orbStr = orbSettings ? JSON.stringify(orbSettings) : '';
    const chartStr = JSON.stringify(natalChart.positions);
    const anglesStr = natalChart.angles ? JSON.stringify(natalChart.angles) : '';
    return `natal_${jobStr}_${dateStr}_${orbStr}_${chartStr}_${anglesStr}`;
  }, [natalJobs, natalChart, startDate, endDate, orbSettings]);

  useEffect(() => {
    if (!startDate || !endDate || natalJobs.length === 0 || !natalChart?.positions) {
      setCurves([]);
      setSignChanges({ changes: [], initialSigns: {}, eclipses: [], stations: [], retrogradePeriods: [] });
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);

    // Schedule on a macrotask so the effect cleanup of any prior run has a
    // chance to settle. setTimeout(0) is more reliable than rAF in React 19
    // strict-mode double-mount, where rAF can be cancelled before firing.
    const timeoutId = setTimeout(() => {
      if (cancelledRef.current) return;

      // Merge planet positions + chart angles into one lookup
      const positions = { ...natalChart.positions, ...(natalChart.angles || {}) };

      // Collect unique transit planet bodies
      const bodies = new Set();
      for (const job of natalJobs) {
        bodies.add(job.transitPlanet);
      }

      // Compute longitudes for transit planets only (natal positions are fixed)
      const longitudes = {};
      for (const body of bodies) {
        longitudes[body] = getCachedLongitudes(body, startDate, endDate);
      }

      if (cancelledRef.current) return;

      // Compute aspect curves: for each job → each natal target → each aspect
      const result = [];
      for (const job of natalJobs) {
        const transitP = PLANET_MAP[job.transitPlanet];
        if (!transitP) continue;

        const jobAspects = job.aspects
          .map(name => ASPECT_MAP[name])
          .filter(Boolean);

        for (const natalTargetId of (job.natalTargets || [])) {
          const natalLon = positions[natalTargetId];
          if (natalLon == null) continue;

          const natalP = PLANET_MAP[natalTargetId];
          if (!natalP) continue;

          // Create fixed longitude series for the natal position
          const fixedSeries = longitudes[job.transitPlanet].map(pt => ({
            date: pt.date,
            longitude: natalLon,
          }));

          // Conjunction-only filtering for TrueNode
          const isNodePair = transitP.conjunctionOnly || natalP.conjunctionOnly;
          const pairAspects = isNodePair
            ? jobAspects.filter(a => a.name === 'Conjunction')
            : jobAspects;

          // Lookup closures: transit planet is dynamic, natal is constant
          const getLonA = (date) => getLongitude(job.transitPlanet, date);
          const getLonB = () => natalLon;

          for (const aspect of pairAspects) {
            const orb = orbSettings?.[job.transitPlanet] || 8;

            const points = computeAspectCurve(
              longitudes[job.transitPlanet],
              fixedSeries,
              aspect.angle,
              orb,
              getLonA,
              getLonB,
            );

            const hasActivity = points.some(p => p.intensity > 0);
            if (!hasActivity) continue;

            const peaks = findPeaks(points);

            // Enrich peaks with retrograde info (transit planet only — natal planet doesn't move)
            const HALF_DAY = 12 * 60 * 60 * 1000;
            for (const peak of peaks) {
              const t = peak.date.getTime();
              const lonA_before = getLonA(new Date(t - HALF_DAY));
              const lonA_after = getLonA(new Date(t + HALF_DAY));
              let dA = lonA_after - lonA_before;
              if (dA > 180) dA -= 360;
              if (dA < -180) dA += 360;
              peak.transitRetrograde = dA < 0;
              peak.targetRetrograde = false; // natal planet never moves

              // Edge-cutoff detection
              const dayMs = 86400000;
              const isAtStart = Math.abs(t - startDate.getTime()) < dayMs * 1.5;
              const isAtEnd = Math.abs(t - endDate.getTime()) < dayMs * 1.5;
              if (isAtStart || isAtEnd) {
                peak.edgeCutoff = true;

                const searchExtent = dayMs * 90;
                const deviationAtT = (ms) => {
                  const d = new Date(ms);
                  const sep = angularSeparation(getLonA(d), getLonB(d));
                  return Math.abs(sep - aspect.angle);
                };

                let lo, hi;
                if (isAtStart) {
                  lo = startDate.getTime() - searchExtent;
                  hi = startDate.getTime() + dayMs * 7;
                } else {
                  lo = endDate.getTime() - dayMs * 7;
                  hi = endDate.getTime() + searchExtent;
                }

                const devAtEdge = deviationAtT(t);
                const devBeyond = isAtStart
                  ? deviationAtT(t - dayMs)
                  : deviationAtT(t + dayMs);

                if (devBeyond < devAtEdge) {
                  const PHI = (Math.sqrt(5) - 1) / 2;
                  let a = lo, b = hi;
                  let c = b - PHI * (b - a);
                  let d = a + PHI * (b - a);
                  for (let iter = 0; iter < 40; iter++) {
                    if (deviationAtT(c) < deviationAtT(d)) {
                      b = d;
                    } else {
                      a = c;
                    }
                    c = b - PHI * (b - a);
                    d = a + PHI * (b - a);
                  }
                  peak.realPeakDate = new Date((a + b) / 2);
                }
              }
            }

            const color = blendColors(transitP.color, natalP.color);

            // Row grouping: in natal mode, rows are grouped by TRANSIT planet
            // (all natal aspects for a given transiting planet on one row)
            const rowKey = `planet-${job.transitPlanet}`;
            const rowPlanet = job.transitPlanet;

            result.push({
              id: `${job.id}-natal-${natalTargetId}-${aspect.name}`,
              jobId: job.id,
              transitPlanet: job.transitPlanet,
              target: natalTargetId,
              isNatal: true,
              rowKey,
              rowPlanet,
              rowTargetPlanet: null,
              pairLabel: `${transitP.symbol}${aspect.symbol}${natalP.symbol}`,
              aspect,
              color,
              points,
              peaks,
            });
          }
        }
      }

      // Deduplicate
      const seenCurves = new Set();
      const deduped = [];
      for (const c of result) {
        const curveKey = `${c.transitPlanet}-natal-${c.target}-${c.aspect.name}`;
        if (seenCurves.has(curveKey)) continue;
        seenCurves.add(curveKey);
        deduped.push(c);
      }
      result.length = 0;
      result.push(...deduped);

      // Height ratio staggering: rank natal targets by speed within each row
      const rowGroups = {};
      for (const c of result) {
        if (!rowGroups[c.rowKey]) rowGroups[c.rowKey] = [];
        rowGroups[c.rowKey].push(c);
      }

      const MAX_HEIGHT = 0.60;
      const MIN_HEIGHT = 0.18;

      for (const rowKey of Object.keys(rowGroups)) {
        const group = rowGroups[rowKey];
        const uniqueTargets = [...new Set(group.map(c => c.target))];
        // Sort by speed: slowest natal target gets tallest curve.
        // Angles (Asc, Dsc, MC, IC) are not in SPEED_ORDER — treat as
        // "infinitely slow" (fixed points) so they get the tallest height ratio.
        const speedIdx = (id) => {
          const idx = SPEED_ORDER.indexOf(id);
          return idx >= 0 ? idx : SPEED_ORDER.length + 1; // angles sort after all planets
        };
        uniqueTargets.sort((a, b) => speedIdx(b) - speedIdx(a));

        const count = uniqueTargets.length;
        for (const c of group) {
          if (count <= 1) {
            c.heightRatio = MAX_HEIGHT;
          } else {
            const rank = uniqueTargets.indexOf(c.target);
            c.heightRatio = MAX_HEIGHT - (rank / (count - 1)) * (MAX_HEIGHT - MIN_HEIGHT);
          }
        }
      }

      // ── Sign change detection for transit planets ──
      const signChangeResults = [];
      const initialSigns = {};
      const seenSignPlanets = new Set();

      for (const job of natalJobs) {
        if (!job.showSignChanges) continue;
        if (seenSignPlanets.has(job.transitPlanet)) continue;
        seenSignPlanets.add(job.transitPlanet);

        const planetLongs = longitudes[job.transitPlanet];
        if (!planetLongs) continue;
        const getLon = (date) => getLongitude(job.transitPlanet, date);
        const { changes, initialSignIndex } = detectSignChanges(
          job.transitPlanet, planetLongs, getLon
        );

        // For TrueNode: enrich with South Node's opposite sign
        if (job.transitPlanet === 'TrueNode') {
          for (const sc of changes) {
            const southIdx = (sc.signIndex + 6) % 12;
            const southSign = ZODIAC_SIGNS[southIdx];
            sc.southSignIndex = southIdx;
            sc.southSignSymbol = southSign.symbol;
            sc.southSignName = southSign.name;
          }
        }

        signChangeResults.push(...changes);
        initialSigns[`planet-${job.transitPlanet}`] = initialSignIndex;
      }

      // ── Retrograde station detection for transit planets ──
      const stationResults = [];
      const retrogradePeriodResults = [];
      const seenRetroPlanets = new Set();

      for (const job of natalJobs) {
        if (!job.showRetrogrades) continue;
        if (NON_RETROGRADE_PLANETS.has(job.transitPlanet)) continue;
        if (seenRetroPlanets.has(job.transitPlanet)) continue;
        seenRetroPlanets.add(job.transitPlanet);

        const planetLongs = longitudes[job.transitPlanet];
        if (!planetLongs) continue;
        const getLon = (date) => getLongitude(job.transitPlanet, date);
        const { stations, retrogradePeriods: periods } = detectStations(
          job.transitPlanet, planetLongs, getLon, startDate, endDate
        );
        stationResults.push(...stations);
        retrogradePeriodResults.push(...periods);

        // Smart ingress injection: if showRetrogrades is ON but showSignChanges is OFF,
        // compute all sign changes for this planet and filter to retrograde-cycle ones.
        if (!job.showSignChanges && !seenSignPlanets.has(job.transitPlanet)) {
          const { changes: allChanges } = detectSignChanges(
            job.transitPlanet, planetLongs, getLon
          );
          const filtered = getRetrogradeCycleIngresses(allChanges, periods, job.transitPlanet, stations);
          signChangeResults.push(...filtered);
        }
      }

      if (!cancelledRef.current) {
        setCurves(result);
        setSignChanges({
          changes: signChangeResults,
          initialSigns,
          eclipses: [],
          stations: stationResults,
          retrogradePeriods: retrogradePeriodResults,
        });
        setLoading(false);
      }
    });

    return () => {
      cancelledRef.current = true;
      clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  return { curves, signChanges, loading };
}

/**
 * Simple hex color blend (average RGB channels).
 */
function blendColors(hexA, hexB) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const r = Math.round((a[0] + b[0]) / 2);
  const g = Math.round((a[1] + b[1]) / 2);
  const bl = Math.round((a[2] + b[2]) / 2);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
