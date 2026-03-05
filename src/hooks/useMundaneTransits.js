import { useState, useEffect, useRef, useMemo } from 'react';
import { computeLongitudes, getLongitude } from '../api/ephemeris';
import { ASPECTS, computeAspectCurve, findPeaks, angularSeparation } from '../utils/aspects';
import { PLANET_MAP, SPEED_ORDER, NON_RETROGRADE_PLANETS } from '../data/planets';
import { detectSignChanges, ZODIAC_SIGNS } from '../data/zodiac';
import { detectStations, getRetrogradeCycleIngresses } from '../data/retrograde';
import { getChartType } from '../data/chartTypes';

// Module-level cache for computed longitudes (shared with other hooks)
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
 * Computes transit aspect curves for a stack of mundane charts.
 *
 * Architecturally identical to useNatalTransits, but merges positions
 * from ALL stacked charts into one tagged target set.  Each curve is
 * enriched with source chart metadata (name, type, relevance window).
 *
 * @param {Array} mundaneJobs - Transit job definitions
 * @param {Array} stackCharts - Array of chart objects with positions, angles, chartType, name
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {Object} orbSettings
 */
export function useMundaneTransits(mundaneJobs, stackCharts, startDate, endDate, orbSettings) {
  const [curves, setCurves] = useState([]);
  const [signChanges, setSignChanges] = useState({ changes: [], initialSigns: {}, eclipses: [], stations: [], retrogradePeriods: [] });
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const depsKey = useMemo(() => {
    if (!stackCharts || stackCharts.length === 0) return 'none';
    const jobStr = mundaneJobs
      .map(j => `${j.id}:${j.transitPlanet}:${(j.natalTargets || []).join(',')}:${j.aspects.join(',')}:${j.showSignChanges ?? false}:${j.showRetrogrades ?? false}`)
      .join('|');
    const dateStr = `${startDate?.toISOString()}_${endDate?.toISOString()}`;
    const orbStr = orbSettings ? JSON.stringify(orbSettings) : '';
    const chartStr = stackCharts.map(c => `${c.id}:${JSON.stringify(c.positions)}:${JSON.stringify(c.angles || {})}`).join('|');
    return `mundane_${jobStr}_${dateStr}_${orbStr}_${chartStr}`;
  }, [mundaneJobs, stackCharts, startDate, endDate, orbSettings]);

  useEffect(() => {
    if (!startDate || !endDate || mundaneJobs.length === 0 || !stackCharts || stackCharts.length === 0) {
      setCurves([]);
      setSignChanges({ changes: [], initialSigns: {}, eclipses: [], stations: [], retrogradePeriods: [] });
      return;
    }

    cancelledRef.current = false;
    setLoading(true);

    const rafId = requestAnimationFrame(() => {
      if (cancelledRef.current) return;

      // Build merged target set: all positions from all stacked charts,
      // tagged with their source chart info.
      // Structure: { targetKey: { lon, chartId, chartName, chartType, bodyId, planetDef } }
      const mergedTargets = [];
      for (const chart of stackCharts) {
        // Check if chart's relevance window overlaps the date range
        if (chart.relevanceEnd) {
          const relEnd = new Date(chart.relevanceEnd);
          if (relEnd < startDate) continue; // chart expired before our window
        }
        if (chart.relevanceStart) {
          const relStart = new Date(chart.relevanceStart);
          if (relStart > endDate) continue; // chart hasn't started yet
        }

        const positions = { ...(chart.positions || {}), ...(chart.angles || {}) };
        const chartType = getChartType(chart.chartType || 'natal');

        for (const [bodyId, lon] of Object.entries(positions)) {
          if (typeof lon !== 'number' || isNaN(lon)) continue;
          const planetDef = PLANET_MAP[bodyId];
          if (!planetDef) continue;

          mergedTargets.push({
            targetKey: `${chart.id}-${bodyId}`,
            lon,
            chartId: chart.id,
            chartName: chart.name,
            chartType: chart.chartType || 'natal',
            chartColor: chartType.color,
            bodyId,
            planetDef,
          });
        }
      }

      if (mergedTargets.length === 0) {
        setCurves([]);
        setSignChanges({ changes: [], initialSigns: {}, eclipses: [], stations: [], retrogradePeriods: [] });
        setLoading(false);
        return;
      }

      // Collect unique transit planet bodies
      const bodies = new Set();
      for (const job of mundaneJobs) {
        bodies.add(job.transitPlanet);
      }

      // Compute longitudes for transit planets
      const longitudes = {};
      for (const body of bodies) {
        longitudes[body] = getCachedLongitudes(body, startDate, endDate);
      }

      if (cancelledRef.current) return;

      // Compute aspect curves: for each job → each merged target → each aspect
      const result = [];
      for (const job of mundaneJobs) {
        const transitP = PLANET_MAP[job.transitPlanet];
        if (!transitP) continue;

        const jobAspects = (job.aspects || [])
          .map(name => ASPECT_MAP[name])
          .filter(Boolean);

        // Determine which targets this job should consider
        const jobTargetIds = job.natalTargets || null;

        for (const target of mergedTargets) {
          // If the job specifies target filters, apply them
          if (jobTargetIds && !jobTargetIds.includes(target.bodyId)) continue;

          // Don't transit a planet against itself from the same chart
          if (target.bodyId === job.transitPlanet) continue;

          // Create fixed longitude series for this target position
          const fixedSeries = longitudes[job.transitPlanet].map(pt => ({
            date: pt.date,
            longitude: target.lon,
          }));

          // Conjunction-only filtering for TrueNode
          const isNodePair = transitP.conjunctionOnly || target.planetDef.conjunctionOnly;
          const pairAspects = isNodePair
            ? jobAspects.filter(a => a.name === 'Conjunction')
            : jobAspects;

          // Longitude lookup closures
          const getLonA = (date) => getLongitude(job.transitPlanet, date);
          const getLonB = () => target.lon;

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

            // Enrich peaks
            const HALF_DAY = 12 * 60 * 60 * 1000;
            for (const peak of peaks) {
              const t = peak.date.getTime();
              const lonA_before = getLonA(new Date(t - HALF_DAY));
              const lonA_after = getLonA(new Date(t + HALF_DAY));
              let dA = lonA_after - lonA_before;
              if (dA > 180) dA -= 360;
              if (dA < -180) dA += 360;
              peak.transitRetrograde = dA < 0;
              peak.targetRetrograde = false;

              // Source chart info for display
              peak.sourceChartName = target.chartName;
              peak.sourceChartType = target.chartType;

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
                const devBeyond = isAtStart ? deviationAtT(t - dayMs) : deviationAtT(t + dayMs);
                if (devBeyond < devAtEdge) {
                  const PHI = (Math.sqrt(5) - 1) / 2;
                  let a = lo, b = hi;
                  let c = b - PHI * (b - a);
                  let d = a + PHI * (b - a);
                  for (let iter = 0; iter < 40; iter++) {
                    if (deviationAtT(c) < deviationAtT(d)) { b = d; } else { a = c; }
                    c = b - PHI * (b - a);
                    d = a + PHI * (b - a);
                  }
                  peak.realPeakDate = new Date((a + b) / 2);
                }
              }
            }

            // Use chart type color blended with transit planet color
            const color = blendColors(transitP.color, target.chartColor);

            // Row grouping: by transit planet (all chart targets for one transit planet share a row)
            const rowKey = `planet-${job.transitPlanet}`;
            const rowPlanet = job.transitPlanet;

            result.push({
              id: `${job.id}-mundane-${target.targetKey}-${aspect.name}`,
              jobId: job.id,
              transitPlanet: job.transitPlanet,
              target: target.bodyId,
              targetKey: target.targetKey,
              isNatal: true,
              isMundane: true,
              sourceChart: {
                id: target.chartId,
                name: target.chartName,
                chartType: target.chartType,
              },
              rowKey,
              rowPlanet,
              rowTargetPlanet: null,
              pairLabel: `${transitP.symbol}${aspect.symbol}${target.planetDef.symbol}`,
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
        const curveKey = `${c.transitPlanet}-${c.targetKey}-${c.aspect.name}`;
        if (seenCurves.has(curveKey)) continue;
        seenCurves.add(curveKey);
        deduped.push(c);
      }
      result.length = 0;
      result.push(...deduped);

      // Height ratio staggering
      const rowGroups = {};
      for (const c of result) {
        if (!rowGroups[c.rowKey]) rowGroups[c.rowKey] = [];
        rowGroups[c.rowKey].push(c);
      }

      const MAX_HEIGHT = 0.60;
      const MIN_HEIGHT = 0.18;

      for (const rowKey of Object.keys(rowGroups)) {
        const group = rowGroups[rowKey];
        const uniqueTargets = [...new Set(group.map(c => c.targetKey))];
        const speedIdx = (key) => {
          const bodyId = key.split('-').pop();
          const idx = SPEED_ORDER.indexOf(bodyId);
          return idx >= 0 ? idx : SPEED_ORDER.length + 1;
        };
        uniqueTargets.sort((a, b) => speedIdx(b) - speedIdx(a));

        const count = uniqueTargets.length;
        for (const c of group) {
          if (count <= 1) {
            c.heightRatio = MAX_HEIGHT;
          } else {
            const rank = uniqueTargets.indexOf(c.targetKey);
            c.heightRatio = MAX_HEIGHT - (rank / (count - 1)) * (MAX_HEIGHT - MIN_HEIGHT);
          }
        }
      }

      // Sign change detection
      const signChangeResults = [];
      const initialSigns = {};
      const seenSignPlanets = new Set();

      for (const job of mundaneJobs) {
        if (!job.showSignChanges) continue;
        if (seenSignPlanets.has(job.transitPlanet)) continue;
        seenSignPlanets.add(job.transitPlanet);

        const planetLongs = longitudes[job.transitPlanet];
        if (!planetLongs) continue;
        const getLon = (date) => getLongitude(job.transitPlanet, date);
        const { changes, initialSignIndex } = detectSignChanges(job.transitPlanet, planetLongs, getLon);

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

      // Retrograde station detection
      const stationResults = [];
      const retrogradePeriodResults = [];
      const seenRetroPlanets = new Set();

      for (const job of mundaneJobs) {
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

        if (!job.showSignChanges && !seenSignPlanets.has(job.transitPlanet)) {
          const { changes: allChanges } = detectSignChanges(job.transitPlanet, planetLongs, getLon);
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
      cancelAnimationFrame(rafId);
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
