import { useState, useEffect, useRef, useMemo } from 'react';
import { computeLongitudes, getLongitude } from '../api/ephemeris';
import { computeEclipses } from '../api/eclipses';
import { ASPECTS, computeAspectCurve, findPeaks, angularSeparation } from '../utils/aspects';
import { PLANET_MAP, SPEED_ORDER, isFasterThan, NON_RETROGRADE_PLANETS } from '../data/planets';
import { detectSignChanges, ZODIAC_SIGNS } from '../data/zodiac';
import { detectStations, getRetrogradeCycleIngresses } from '../data/retrograde';

// Module-level cache for computed longitudes
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
 * Computes transit aspect curves from transit jobs.
 *
 * @param {Array<{id, transitPlanet, targets, aspects}>} transitJobs
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {{ curves: Array, loading: boolean }}
 *
 * Each curve in the output:
 * {
 *   id: 'jobId-Saturn-Conjunction',
 *   jobId: string,
 *   transitPlanet: 'Jupiter',
 *   target: 'Saturn',
 *   rowKey: 'planet-Jupiter' (slower targets share transit planet row) or 'planet-Venus' (faster target gets own row),
 *   rowPlanet: 'Jupiter' or 'Venus' — the planet whose glyph labels this row,
 *   rowTargetPlanet: null (single-glyph Y-axis: each row shows only its planet),
 *   pairLabel: '♃☌♄',
 *   aspect: { name, symbol, angle, orb },
 *   color: string,
 *   points: [{ date, intensity, separation }],
 *   peaks: [{ date, intensity, separation, index }],
 * }
 */
export function useTransits(transitJobs, startDate, endDate, orbSettings) {
  const [curves, setCurves] = useState([]);
  const [signChanges, setSignChanges] = useState({ changes: [], initialSigns: {}, eclipses: [], stations: [], retrogradePeriods: [] });
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const depsKey = useMemo(() => {
    const jobStr = transitJobs
      .map(j => `${j.id}:${j.transitPlanet}:${j.targets.join(',')}:${j.aspects.join(',')}:${j.showSignChanges ?? false}:${j.showRetrogrades ?? false}`)
      .join('|');
    const dateStr = `${startDate?.toISOString()}_${endDate?.toISOString()}`;
    const orbStr = orbSettings ? JSON.stringify(orbSettings) : '';
    return `${jobStr}_${dateStr}_${orbStr}`;
  }, [transitJobs, startDate, endDate, orbSettings]);

  useEffect(() => {
    if (!startDate || !endDate || transitJobs.length === 0) {
      setCurves([]);
      setSignChanges({ changes: [], initialSigns: {}, eclipses: [], stations: [], retrogradePeriods: [] });
      return;
    }

    cancelledRef.current = false;
    setLoading(true);

    // Defer to a macrotask so the prior effect's cleanup settles. setTimeout
    // is more reliable than rAF in React 19 strict-mode double-mount, where
    // rAF can be cancelled before firing.
    const timeoutId = setTimeout(() => {
      if (cancelledRef.current) return;

      // Collect unique bodies needed across all jobs
      // (include transit planet even if targets is empty — needed for sign changes)
      const bodies = new Set();
      for (const job of transitJobs) {
        bodies.add(job.transitPlanet);
        for (const target of job.targets) {
          bodies.add(target);
        }
      }

      // Compute longitudes for all unique bodies
      const longitudes = {};
      for (const body of bodies) {
        longitudes[body] = getCachedLongitudes(body, startDate, endDate);
      }

      if (cancelledRef.current) return;

      // Compute aspect curves: for each job → each target → each aspect
      const result = [];
      for (const job of transitJobs) {
        const transitP = PLANET_MAP[job.transitPlanet];
        if (!transitP) continue;

        // Resolve aspect definitions for this job
        const jobAspects = job.aspects
          .map(name => ASPECT_MAP[name])
          .filter(Boolean);

        for (const targetId of job.targets) {
          const targetP = PLANET_MAP[targetId];
          if (!targetP) continue;

          // Conjunction-only filtering: if either planet is TrueNode,
          // only conjunctions are valid (nodes don't make other aspects)
          const isNodePair = transitP.conjunctionOnly || targetP.conjunctionOnly;
          const pairAspects = isNodePair
            ? jobAspects.filter(a => a.name === 'Conjunction')
            : jobAspects;

          // Create longitude lookup closures for sub-daily refinement
          const getLonA = (date) => getLongitude(job.transitPlanet, date);
          const getLonB = (date) => getLongitude(targetId, date);

          for (const aspect of pairAspects) {
            // Resolve orb from per-planet settings (transit planet's orb governs)
            const orb = orbSettings?.[job.transitPlanet] || 8;

            const points = computeAspectCurve(
              longitudes[job.transitPlanet],
              longitudes[targetId],
              aspect.angle,
              orb,
              getLonA,
              getLonB,
            );

            // Skip curves that never activate
            const hasActivity = points.some(p => p.intensity > 0);
            if (!hasActivity) continue;

            const peaks = findPeaks(points);

            // Enrich peaks with retrograde info for label display.
            // A planet is retrograde when its ecliptic longitude is decreasing.
            const HALF_DAY = 12 * 60 * 60 * 1000;
            for (const peak of peaks) {
              const t = peak.date.getTime();
              const lonA_before = getLonA(new Date(t - HALF_DAY));
              const lonA_after  = getLonA(new Date(t + HALF_DAY));
              const lonB_before = getLonB(new Date(t - HALF_DAY));
              const lonB_after  = getLonB(new Date(t + HALF_DAY));
              // Handle 360→0 wrap: if the difference is > 180, the planet
              // crossed the 0° boundary — adjust sign accordingly.
              let dA = lonA_after - lonA_before;
              if (dA > 180) dA -= 360;
              if (dA < -180) dA += 360;
              let dB = lonB_after - lonB_before;
              if (dB > 180) dB -= 360;
              if (dB < -180) dB += 360;
              peak.transitRetrograde = dA < 0;
              peak.targetRetrograde = dB < 0;

              // Mark edge-cutoff peaks: if the peak is at the very start
              // or end of the date range, the real peak may be outside the
              // chart window — don't show a misleading near-miss label.
              // Also find the REAL peak date beyond the window for accurate labels.
              const dayMs = 86400000;
              const isAtStart = Math.abs(t - startDate.getTime()) < dayMs * 1.5;
              const isAtEnd = Math.abs(t - endDate.getTime()) < dayMs * 1.5;
              if (isAtStart || isAtEnd) {
                peak.edgeCutoff = true;

                // Find the actual peak date by searching beyond the window.
                // Golden-section search minimizes deviation (= distance from exact aspect).
                const searchExtent = dayMs * 90; // look up to ~3 months beyond window
                const deviationAtT = (ms) => {
                  const d = new Date(ms);
                  const sep = angularSeparation(getLonA(d), getLonB(d));
                  return Math.abs(sep - aspect.angle);
                };

                let lo, hi;
                if (isAtStart) {
                  lo = startDate.getTime() - searchExtent;
                  hi = startDate.getTime() + dayMs * 7; // include a week into the window
                } else {
                  lo = endDate.getTime() - dayMs * 7;
                  hi = endDate.getTime() + searchExtent;
                }

                // Only search if deviation is still decreasing toward the boundary
                // (i.e. the real peak is likely outside the window)
                const devAtEdge = deviationAtT(t);
                const devBeyond = isAtStart
                  ? deviationAtT(t - dayMs)
                  : deviationAtT(t + dayMs);

                if (devBeyond < devAtEdge) {
                  // Golden-section search to find minimum deviation
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

            const color = blendColors(transitP.color, targetP.color);

            // Determine row grouping (planet-scoped, not job-scoped):
            // - Slower targets share the transit planet's row (e.g. all Jupiter curves on one row)
            // - Faster targets get their own row keyed by the faster planet
            // Each row is labeled with a single planet glyph — the row's "owner".
            // This means curves from different jobs merge onto the same row if they share a planet.
            const targetIsFaster = isFasterThan(targetId, job.transitPlanet);
            const rowKey = targetIsFaster
              ? `planet-${targetId}`            // planet-scoped row for faster planet
              : `planet-${job.transitPlanet}`;   // planet-scoped row for transit planet
            const rowPlanet = targetIsFaster ? targetId : job.transitPlanet;
            const rowTargetPlanet = null; // single-glyph Y-axis: each row shows only its planet

            result.push({
              id: `${job.id}-${targetId}-${aspect.name}`,
              jobId: job.id,
              transitPlanet: job.transitPlanet,
              target: targetId,
              rowKey,
              rowPlanet,
              rowTargetPlanet,
              pairLabel: `${transitP.symbol}${aspect.symbol}${targetP.symbol}`,
              aspect,
              color,
              points,
              peaks,
            });
          }
        }
      }

      // Deduplicate: if multiple jobs produce the same planet-pair + aspect
      // curve (e.g. two jobs both tracking Jupiter↔Saturn conjunction), keep
      // only the first one to avoid drawing identical overlapping curves.
      const seenCurves = new Set();
      const deduped = [];
      for (const c of result) {
        const curveKey = `${c.transitPlanet}-${c.target}-${c.aspect.name}`;
        if (seenCurves.has(curveKey)) continue;
        seenCurves.add(curveKey);
        deduped.push(c);
      }
      result.length = 0;
      result.push(...deduped);

      // Compute per-curve heightRatio so overlapping curves in the same row
      // are staggered: slower targets get taller curves, faster targets shorter.
      // Group curves by rowKey, then rank by target speed within each row.
      const rowGroups = {};
      for (const c of result) {
        if (!rowGroups[c.rowKey]) rowGroups[c.rowKey] = [];
        rowGroups[c.rowKey].push(c);
      }

      const MAX_HEIGHT = 0.60;
      const MIN_HEIGHT = 0.18;

      for (const rowKey of Object.keys(rowGroups)) {
        const group = rowGroups[rowKey];
        // Collect unique targets in this row, sorted slowest first
        const uniqueTargets = [...new Set(group.map(c => c.target))];
        uniqueTargets.sort((a, b) => SPEED_ORDER.indexOf(b) - SPEED_ORDER.indexOf(a));

        const count = uniqueTargets.length;
        for (const c of group) {
          if (count <= 1) {
            c.heightRatio = MAX_HEIGHT;
          } else {
            const rank = uniqueTargets.indexOf(c.target); // 0 = slowest
            c.heightRatio = MAX_HEIGHT - (rank / (count - 1)) * (MAX_HEIGHT - MIN_HEIGHT);
          }
        }
      }

      // ── Sign change detection ──
      const signChangeResults = [];
      const initialSigns = {};  // rowKey → initial sign index at startDate
      const seenPlanets = new Set();
      for (const job of transitJobs) {
        if (!job.showSignChanges) continue;
        // Deduplicate: only compute once per transit planet
        if (seenPlanets.has(job.transitPlanet)) continue;
        seenPlanets.add(job.transitPlanet);

        const planetLongs = longitudes[job.transitPlanet];
        if (!planetLongs) continue;
        const getLon = (date) => getLongitude(job.transitPlanet, date);
        const { changes, initialSignIndex } = detectSignChanges(job.transitPlanet, planetLongs, getLon);

        // For TrueNode: enrich each sign change with the South Node's opposite sign
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

      // ── Eclipse computation (for TrueNode / Eclipses row) ──
      // Independent of showSignChanges — controlled by the per-job
      // showEclipses toggle (defaulted on for backward compat).
      let eclipseEvents = [];
      const eclipsesRequested = transitJobs.some(
        j => j.transitPlanet === 'TrueNode' && (j.showEclipses ?? true),
      );
      if (eclipsesRequested) {
        eclipseEvents = computeEclipses(startDate, endDate);
      }

      // ── Retrograde station detection ──
      const stationResults = [];
      const retrogradePeriodResults = [];
      const seenRetroPlanets = new Set();
      for (const job of transitJobs) {
        if (!job.showRetrogrades) continue;
        if (NON_RETROGRADE_PLANETS.has(job.transitPlanet)) continue;
        // Deduplicate: only compute once per transit planet
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
        // Do NOT set initialSigns — sign colors only appear when showSignChanges is ON.
        if (!job.showSignChanges && !seenPlanets.has(job.transitPlanet)) {
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
          eclipses: eclipseEvents,
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
