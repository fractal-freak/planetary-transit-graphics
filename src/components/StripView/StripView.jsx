import { useMemo } from 'react';
import { PLANET_MAP } from '../../data/planets';
import { getChartType } from '../../data/chartTypes';
import { ZODIAC_SIGNS, getElementColor } from '../../data/zodiac';
import { computeCrossChartAspects } from '../../utils/crossChartAspects';
import styles from './StripView.module.css';

/**
 * Graphic Ephemeris Strip View.
 *
 * Renders horizontal degree rulers (0°–360°) stacked vertically,
 * one per chart in the stack.  Planet markers are placed at their
 * ecliptic longitude with glyphs and tooltips.  Vertical alignment
 * guides appear at degrees where multiple charts have planets.
 */
export default function StripView({ stackCharts, orbSettings }) {
  // Compute cross-chart aspects for alignment guides
  const crossAspects = useMemo(() => {
    if (!stackCharts || stackCharts.length < 2) return [];
    return computeCrossChartAspects(stackCharts, {
      hardOnly: true,
      maxOrb: 3, // tight orb for visual guides
    });
  }, [stackCharts]);

  // Find conjunction degrees (for vertical alignment guides)
  const conjunctionDegrees = useMemo(() => {
    return crossAspects
      .filter(a => a.aspect.name === 'Conjunction' && a.orb <= 3)
      .map(a => ({
        degree: (a.lonA + a.lonB) / 2,
        orb: a.orb,
        label: `${a.bodyA}/${a.bodyB}`,
        chartA: a.chartA.name,
        chartB: a.chartB.name,
      }));
  }, [crossAspects]);

  if (!stackCharts || stackCharts.length === 0) {
    return (
      <div className={styles.empty}>
        Add charts to your stack to see the strip view
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Zodiac sign header */}
      <div className={styles.signHeader}>
        <div className={styles.labelCol} />
        <div className={styles.rulerCol}>
          {ZODIAC_SIGNS.map((sign, i) => (
            <div
              key={sign.name}
              className={styles.signLabel}
              style={{
                left: `${(i / 12) * 100}%`,
                width: `${100 / 12}%`,
                color: getElementColor(i, 0.7),
              }}
            >
              {sign.symbol}
            </div>
          ))}
        </div>
      </div>

      {/* Chart strips */}
      {stackCharts.map(chart => (
        <StripRuler
          key={chart.id}
          chart={chart}
          conjunctionDegrees={conjunctionDegrees}
        />
      ))}

      {/* Cross-chart aspect summary */}
      {crossAspects.length > 0 && (
        <div className={styles.aspectSummary}>
          <div className={styles.aspectSummaryTitle}>Cross-Chart Aspects (≤3° orb)</div>
          {crossAspects.slice(0, 20).map((a, i) => (
            <div key={i} className={styles.aspectRow}>
              <span className={styles.aspectLabel}>{a.label}</span>
              <span className={styles.aspectOrb}>{a.orb.toFixed(2)}°</span>
              <span className={styles.aspectCharts}>
                {a.chartA.name} / {a.chartB.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Single chart strip ruler.
 */
function StripRuler({ chart, conjunctionDegrees }) {
  const ct = getChartType(chart.chartType || 'natal');
  const positions = { ...(chart.positions || {}), ...(chart.angles || {}) };

  // Sort planets by longitude
  const entries = Object.entries(positions)
    .filter(([, lon]) => typeof lon === 'number' && !isNaN(lon))
    .sort(([, a], [, b]) => a - b);

  return (
    <div className={styles.strip}>
      {/* Label */}
      <div className={styles.labelCol}>
        <div
          className={styles.chartLabel}
          style={{ borderLeftColor: ct.color }}
        >
          <div className={styles.chartName}>{chart.name}</div>
          <div className={styles.chartType}>{ct.label}</div>
        </div>
      </div>

      {/* Ruler */}
      <div className={styles.rulerCol}>
        <div className={styles.ruler}>
          {/* Sign boundaries */}
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={`sign-${i}`}
              className={styles.signBoundary}
              style={{ left: `${(i / 12) * 100}%` }}
            />
          ))}

          {/* Degree ticks (every 10°) */}
          {Array.from({ length: 36 }, (_, i) => (
            <div
              key={`tick-${i}`}
              className={styles.degreeTick}
              style={{ left: `${(i * 10 / 360) * 100}%` }}
            />
          ))}

          {/* Conjunction alignment guides */}
          {conjunctionDegrees.map((cj, i) => (
            <div
              key={`guide-${i}`}
              className={styles.alignmentGuide}
              style={{
                left: `${(cj.degree / 360) * 100}%`,
                opacity: 1 - cj.orb / 3,
              }}
              title={`${cj.label} (${cj.chartA} / ${cj.chartB}) — ${cj.orb.toFixed(2)}° orb`}
            />
          ))}

          {/* Planet markers */}
          {entries.map(([bodyId, lon]) => {
            const planet = PLANET_MAP[bodyId];
            if (!planet) return null;
            const sign = ZODIAC_SIGNS[Math.floor(lon / 30)];
            const degInSign = (lon % 30).toFixed(1);

            return (
              <div
                key={bodyId}
                className={styles.planetMarker}
                style={{
                  left: `${(lon / 360) * 100}%`,
                  color: planet.color || ct.color,
                }}
                title={`${planet.name}: ${degInSign}° ${sign?.name || ''} (${lon.toFixed(4)}°)`}
              >
                <span className={styles.planetGlyph}>{planet.symbol}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
