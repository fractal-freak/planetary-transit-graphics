/**
 * Astrological aspect definitions and computation.
 *
 * An aspect is a specific angular relationship between two planets.
 * Intensity = 1 at exact aspect, falls to 0 at the edge of the orb.
 */

export const ASPECTS = [
  { name: 'Conjunction', symbol: '☌', angle: 0,   orb: 10, defaultEnabled: true },
  { name: 'Opposition',  symbol: '☍', angle: 180, orb: 10, defaultEnabled: true },
  { name: 'Trine',       symbol: '△', angle: 120, orb: 8,  defaultEnabled: true },
  { name: 'Square',      symbol: '□', angle: 90,  orb: 8,  defaultEnabled: true },
  { name: 'Sextile',     symbol: '⚹', angle: 60,  orb: 6,  defaultEnabled: true },
];

export const ASPECT_MAP = Object.fromEntries(ASPECTS.map(a => [a.name, a]));

// Hard aspects: tense/dynamic angles. Soft aspects: harmonious/flowing.
const HARD_ASPECT_ANGLES = new Set([0, 90, 180]);
export function isHardAspect(aspectAngle) {
  return HARD_ASPECT_ANGLES.has(aspectAngle);
}

/**
 * Compute the shortest angular separation between two ecliptic longitudes.
 * Result is always 0–180°.
 */
export function angularSeparation(lonA, lonB) {
  let diff = Math.abs(lonA - lonB) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Compute intensity of a specific aspect between two longitudes.
 * Returns 0–1 (1 = exact, 0 = outside orb).
 */
export function aspectIntensity(lonA, lonB, aspectAngle, orb) {
  const sep = angularSeparation(lonA, lonB);
  const deviation = Math.abs(sep - aspectAngle);
  if (deviation >= orb) return 0;
  // Linear falloff — sharp triangular peak from 1 (exact) to 0 (edge of orb)
  return 1 - deviation / orb;
}

/**
 * Compute an aspect intensity curve over time for a planet pair.
 * Uses the pre-computed daily longitude series, then refines with sub-daily
 * samples near peaks so every curve gets a consistent sharp triangular tip.
 *
 * @param {Array<{date, longitude}>} longA - longitude series for planet A
 * @param {Array<{date, longitude}>} longB - longitude series for planet B
 * @param {number} aspectAngle - target angle (0, 60, 90, 120, 180)
 * @param {number} orb - orb tolerance in degrees
 * @param {function} getLonA - (date) => longitude for planet A (for refinement)
 * @param {function} getLonB - (date) => longitude for planet B (for refinement)
 * @returns {Array<{date, intensity, separation}>}
 */
export function computeAspectCurve(longA, longB, aspectAngle, orb, getLonA, getLonB) {
  const len = Math.min(longA.length, longB.length);
  const raw = [];

  for (let i = 0; i < len; i++) {
    const sep = angularSeparation(longA[i].longitude, longB[i].longitude);
    const deviation = Math.abs(sep - aspectAngle);
    const intensity = deviation >= orb ? 0 : 1 - deviation / orb;
    raw.push({
      date: longA[i].date,
      intensity,
      separation: sep,
      deviation,
    });
  }

  if (!getLonA || !getLonB) {
    return raw.map(d => ({ date: d.date, intensity: d.intensity, separation: d.separation }));
  }

  // Helper: compute intensity at an arbitrary date
  function sampleAt(date) {
    const lonA = getLonA(date);
    const lonB = getLonB(date);
    const sep = angularSeparation(lonA, lonB);
    const deviation = Math.abs(sep - aspectAngle);
    const intensity = deviation >= orb ? 0 : 1 - deviation / orb;
    return { date, intensity, separation: sep, deviation };
  }

  // ── Detect missed fast-body activations ──
  // When a fast body (e.g. Moon at ~13°/day) completes an aspect entirely
  // between two daily samples, both samples read intensity=0 and the event
  // is invisible. Fix: scan for consecutive zero pairs where the separation
  // crosses near the aspect angle, then inject sub-daily samples.
  const SUB_STEPS = 8; // subdivide gaps into 8 (~3-hour steps for 1-day gap)
  const injected = [];
  for (let i = 0; i < raw.length - 1; i++) {
    injected.push(raw[i]);
    // Only check gaps where both endpoints are inactive
    if (raw[i].intensity > 0 || raw[i + 1].intensity > 0) continue;
    // Quick heuristic: check if the aspect angle lies between the two separations
    // (meaning the aspect was crossed during this gap)
    const sepA = raw[i].separation;
    const sepB = raw[i + 1].separation;
    const minSep = Math.min(sepA, sepB);
    const maxSep = Math.max(sepA, sepB);
    const crossesAspect = (minSep <= aspectAngle + orb && maxSep >= aspectAngle - orb)
      && (Math.abs(sepA - aspectAngle) < 20 || Math.abs(sepB - aspectAngle) < 20);
    if (!crossesAspect) continue;
    // Inject sub-daily samples to catch the hidden activation
    const tStart = raw[i].date.getTime();
    const tEnd = raw[i + 1].date.getTime();
    const subStep = (tEnd - tStart) / SUB_STEPS;
    for (let s = 1; s < SUB_STEPS; s++) {
      const subDate = new Date(tStart + s * subStep);
      const sample = sampleAt(subDate);
      injected.push(sample);
    }
  }
  if (raw.length > 0) injected.push(raw[raw.length - 1]);
  // Replace raw with the potentially augmented array
  raw.length = 0;
  raw.push(...injected);

  // ── Find activations: contiguous runs of intensity > 0 ──
  const activations = [];
  let actStart = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].intensity > 0 && actStart === -1) actStart = i;
    if ((raw[i].intensity <= 0 || i === raw.length - 1) && actStart !== -1) {
      const endIdx = raw[i].intensity > 0 ? i : i - 1;
      activations.push({ startIdx: actStart, endIdx });
      actStart = -1;
    }
  }

  // ── Helper: compute deviation (distance from exact aspect) at a time ──
  function deviationAt(t) {
    const lonA = getLonA(new Date(t));
    const lonB = getLonB(new Date(t));
    const sep = angularSeparation(lonA, lonB);
    return Math.abs(sep - aspectAngle);
  }

  // ── For each activation, find peaks by minimizing deviation ──
  // The peak is the moment the angular separation is closest to the exact
  // aspect angle — the day the aspect completes or comes closest to
  // completing. This is the astrologically meaningful moment.
  //
  // Method: scan daily samples for local minima in deviation, then use
  // golden-section search over the full valley to find the precise moment.
  const refinedPeaks = [];

  for (const act of activations) {
    // Find local minima in deviation within this activation.
    // A local min is any sample whose deviation <= both neighbours.
    for (let i = act.startIdx; i <= act.endIdx; i++) {
      const dev = raw[i].deviation;
      const prevDev = i > 0 ? raw[i - 1].deviation : Infinity;
      const nextDev = i < raw.length - 1 ? raw[i + 1].deviation : Infinity;
      if (dev <= prevDev && dev <= nextDev) {
        // Expand window to cover the full valley (where deviation is falling
        // toward this minimum), so slow-planet plateaus are fully captured.
        let lo = i;
        while (lo > act.startIdx && raw[lo - 1].deviation >= raw[lo].deviation) lo--;
        let hi = i;
        while (hi < act.endIdx && raw[hi + 1].deviation >= raw[hi].deviation) hi++;

        // Search window: one sample beyond the valley edges
        const tLo = (lo > 0 ? raw[lo - 1] : raw[lo]).date.getTime();
        const tHi = (hi < raw.length - 1 ? raw[hi + 1] : raw[hi]).date.getTime();

        // Golden-section search to minimize deviation (find closest approach)
        const PHI = (Math.sqrt(5) - 1) / 2;
        let a = tLo, b = tHi;
        let c = b - PHI * (b - a);
        let d = a + PHI * (b - a);
        for (let iter = 0; iter < 40; iter++) {
          if (deviationAt(c) < deviationAt(d)) {
            b = d;
          } else {
            a = c;
          }
          c = b - PHI * (b - a);
          d = a + PHI * (b - a);
        }
        const peakSample = sampleAt(new Date((a + b) / 2));
        refinedPeaks.push({ peakSample, time: peakSample.date.getTime() });
      }
    }
  }

  // Build the output curve: emit all raw samples, inserting refined peaks
  // at the correct chronological positions.
  //
  // A refined peak may fall slightly before OR after its nearest raw sample
  // (e.g. raw at 05:00, peak at 08:45).  When the two are within 6 hours we
  // emit only the refined peak (higher accuracy) and skip the raw sample.
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const curve = [];
  let peakIdx = 0;

  for (let i = 0; i < raw.length; i++) {
    const t = raw[i].date.getTime();

    // Insert any refined peaks that fall before or at this raw sample
    while (peakIdx < refinedPeaks.length && refinedPeaks[peakIdx].time <= t) {
      const pk = refinedPeaks[peakIdx];
      // Skip if too close to the previous emitted sample (avoid duplication)
      if (curve.length === 0 || Math.abs(pk.time - curve[curve.length - 1].date.getTime()) > SIX_HOURS) {
        curve.push(pk.peakSample);
      }
      peakIdx++;
      // Skip this raw sample if it's within 6 hours of the inserted peak
      if (Math.abs(t - refinedPeaks[peakIdx - 1].time) < SIX_HOURS) {
        raw[i]._skip = true;
      }
    }

    // Check if the NEXT unconsumed refined peak is within 6 hours AFTER this
    // raw sample.  If so, replace this raw sample with the refined peak
    // (prevents the peak from being deduped away at the next raw sample).
    if (!raw[i]._skip && peakIdx < refinedPeaks.length) {
      const nextPk = refinedPeaks[peakIdx];
      if (Math.abs(nextPk.time - t) < SIX_HOURS) {
        // Emit the refined peak instead of this raw sample
        curve.push(nextPk.peakSample);
        peakIdx++;
        raw[i]._skip = true;
      }
    }

    if (!raw[i]._skip) {
      curve.push({ date: raw[i].date, intensity: raw[i].intensity, separation: raw[i].separation, deviation: raw[i].deviation });
    }
  }

  // Insert any remaining peaks after the last raw sample
  while (peakIdx < refinedPeaks.length) {
    curve.push(refinedPeaks[peakIdx].peakSample);
    peakIdx++;
  }

  // ── Strip non-peak daily samples from SHORT active regions ──
  // Fast-moving bodies (Moon) create activations lasting only 2–4 days;
  // daily samples at arbitrary day-boundaries produce visible bends in
  // what should be a clean triangle.  For these short activations we keep
  // only: zeros + refined peaks → clean straight lines.
  //
  // Slow-planet pairs (Jupiter-Saturn, etc.) produce activations spanning
  // weeks or months.  Their daily samples carry meaningful shape info
  // (plateaus, gradual ramps) and should be preserved.
  const STRIP_THRESHOLD_MS = 7 * 86400000; // 7 days

  // Build a set of activation time-ranges for quick lookup
  const activationRanges = activations.map(act => ({
    start: raw[act.startIdx].date.getTime(),
    end:   raw[act.endIdx].date.getTime(),
    duration: raw[act.endIdx].date.getTime() - raw[act.startIdx].date.getTime(),
  }));

  const peakTimes = new Set(refinedPeaks.map(p => p.time));
  const firstTime = raw[0].date.getTime();
  const lastTime = raw[raw.length - 1].date.getTime();
  const cleaned = [];
  for (let i = 0; i < curve.length; i++) {
    const pt = curve[i];
    const t = pt.date.getTime();
    // Always keep points at chart edges (anchor lines to boundaries)
    if (t <= firstTime || t >= lastTime) { cleaned.push(pt); continue; }
    if (pt.intensity <= 0) { cleaned.push(pt); continue; }
    if (peakTimes.has(t)) { cleaned.push(pt); continue; }
    // For active samples: only strip if the activation is short
    const inLongActivation = activationRanges.some(
      r => t >= r.start && t <= r.end && r.duration > STRIP_THRESHOLD_MS
    );
    if (inLongActivation) { cleaned.push(pt); continue; }
    // Skip short-activation non-peak active samples
  }

  // ── Inject onset/offset shoulders for narrow peaks ──
  // After stripping, fast-body activations may be a single peak point
  // flanked by daily zeros.  At compressed time-scales (12-month view)
  // these render as invisible 1-2 px hairlines.  We inject the precise
  // onset and offset times (where intensity first/last exceeds 0) so
  // the triangle has a visible base representing the true activation window.
  const final = [];
  for (let i = 0; i < cleaned.length; i++) {
    const pt = cleaned[i];
    if (pt.intensity > 0 && peakTimes.has(pt.date.getTime())) {
      const prev = i > 0 ? cleaned[i - 1] : null;
      const next = i < cleaned.length - 1 ? cleaned[i + 1] : null;
      const prevIsZero = prev && prev.intensity <= 0;
      const nextIsZero = next && next.intensity <= 0;

      // Inject onset: binary-search between prev (zero) and peak to find
      // the moment intensity first crosses above 0
      if (prevIsZero) {
        let lo = prev.date.getTime(), hi = pt.date.getTime();
        for (let iter = 0; iter < 20; iter++) {
          const mid = (lo + hi) / 2;
          const s = sampleAt(new Date(mid));
          if (s.intensity > 0) hi = mid; else lo = mid;
        }
        const onset = sampleAt(new Date(lo));
        onset.intensity = 0; // clamp to zero for clean triangle base
        // Only inject if onset is meaningfully before the peak (>30 min)
        if (pt.date.getTime() - lo > 30 * 60 * 1000) {
          final.push(onset);
        }
      }

      final.push(pt);

      // Inject offset: binary-search between peak and next (zero)
      if (nextIsZero) {
        let lo = pt.date.getTime(), hi = next.date.getTime();
        for (let iter = 0; iter < 20; iter++) {
          const mid = (lo + hi) / 2;
          const s = sampleAt(new Date(mid));
          if (s.intensity > 0) lo = mid; else hi = mid;
        }
        const offset = sampleAt(new Date(hi));
        offset.intensity = 0; // clamp to zero for clean triangle base
        // Only inject if offset is meaningfully after the peak (>30 min)
        if (hi - pt.date.getTime() > 30 * 60 * 1000) {
          final.push(offset);
        }
      }
    } else {
      final.push(pt);
    }
  }

  // ── Inject precise onset/offset for ALL zero-crossings ──
  // The above onset/offset injection only covers stripped peaks flanked
  // by zeros.  Longer activations preserve daily samples, so the last
  // non-zero sample may sit at a very low intensity (e.g. 0.05) with
  // the next sample at zero — on a compressed 2-year timescale this
  // creates an abrupt visual cutoff.  Fix: for every adjacent pair
  // where one is zero and the other non-zero, inject a precise
  // zero-crossing point via binary search.
  const THIRTY_MIN = 30 * 60 * 1000;
  const withShoulders = [];
  for (let i = 0; i < final.length; i++) {
    const pt = final[i];
    const prev = i > 0 ? final[i - 1] : null;

    // Check for zero→non-zero transition (onset)
    if (prev && prev.intensity <= 0 && pt.intensity > 0) {
      // Only inject if there isn't already a zero shoulder nearby
      const gap = pt.date.getTime() - prev.date.getTime();
      if (gap > THIRTY_MIN * 2) {
        let lo = prev.date.getTime(), hi = pt.date.getTime();
        for (let iter = 0; iter < 20; iter++) {
          const mid = (lo + hi) / 2;
          const s = sampleAt(new Date(mid));
          if (s.intensity > 0) hi = mid; else lo = mid;
        }
        // Only inject if meaningfully different from prev
        if (lo - prev.date.getTime() > THIRTY_MIN) {
          const onset = sampleAt(new Date(lo));
          onset.intensity = 0;
          withShoulders.push(onset);
        }
      }
    }

    withShoulders.push(pt);

    // Check for non-zero→zero transition (offset)
    const next = i < final.length - 1 ? final[i + 1] : null;
    if (next && pt.intensity > 0 && next.intensity <= 0) {
      const gap = next.date.getTime() - pt.date.getTime();
      if (gap > THIRTY_MIN * 2) {
        let lo = pt.date.getTime(), hi = next.date.getTime();
        for (let iter = 0; iter < 20; iter++) {
          const mid = (lo + hi) / 2;
          const s = sampleAt(new Date(mid));
          if (s.intensity > 0) lo = mid; else hi = mid;
        }
        // Only inject if meaningfully different from next
        if (next.date.getTime() - hi > THIRTY_MIN) {
          const offset = sampleAt(new Date(hi));
          offset.intensity = 0;
          withShoulders.push(offset);
        }
      }
    }
  }

  return withShoulders;
}

/**
 * Find ALL peak moments (local maxima) in a curve.
 *
 * A peak is any sample with intensity > 0 whose intensity is >= both
 * its neighbours. This catches retrograde oscillations where a single
 * continuous activation can contain multiple bumps. Every peak gets a
 * label — no minimum intensity threshold.
 *
 * Always emits a peak at the first/last sample when that sample is active,
 * even if it isn't a strict local max. This guarantees cut-off curves get
 * an identifying edge label — e.g. a slow Pluto curve descending into the
 * window with a retrograde wobble that makes a later sample slightly
 * higher than the boundary.
 */
export function findPeaks(curve) {
  if (curve.length === 0) return [];

  const peaks = [];
  const peakIndices = new Set();

  function addPeak(i) {
    if (peakIndices.has(i)) return;
    peaks.push({ ...curve[i], index: i });
    peakIndices.add(i);
  }

  for (let i = 0; i < curve.length; i++) {
    const { intensity } = curve[i];
    if (intensity <= 0) continue;

    const prev = i > 0 ? curve[i - 1].intensity : 0;
    const next = i < curve.length - 1 ? curve[i + 1].intensity : 0;

    if (intensity >= prev && intensity >= next) {
      // Plateau dedup: when the previous sample has the same intensity, the
      // start of the plateau is already marked — skip this one to avoid
      // generating a peak at every sample in a flat region.
      if (i > 0 && Math.abs(curve[i - 1].intensity - intensity) < 1e-9) continue;
      addPeak(i);
    }
  }

  // Synthesize boundary peaks for cut-off curves. Without this, a curve that
  // enters or leaves the window already in activation but isn't a strict
  // local max at the boundary (e.g. nearby retrograde wobble) would render
  // with no label identifying it. Only add an edge peak when no other peak
  // dominates that boundary's intensity — an internal peak with higher
  // intensity is the "real" exact aspect and doesn't need an edge twin.
  const lastIdx = curve.length - 1;
  const EPS = 1e-9;
  if (curve[0].intensity > 0) {
    const i0 = curve[0].intensity;
    const dominated = peaks.some(p => p.index !== 0 && p.intensity >= i0 - EPS);
    if (!dominated) addPeak(0);
  }
  if (lastIdx > 0 && curve[lastIdx].intensity > 0) {
    const iL = curve[lastIdx].intensity;
    const dominated = peaks.some(p => p.index !== lastIdx && p.intensity >= iL - EPS);
    if (!dominated) addPeak(lastIdx);
  }

  peaks.sort((a, b) => a.index - b.index);
  return peaks;
}
