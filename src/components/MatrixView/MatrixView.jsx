import { useMemo, useState } from 'react';
import { PLANET_MAP } from '../../data/planets';
import { getChartType } from '../../data/chartTypes';
import { computeCrossChartAspects } from '../../utils/crossChartAspects';
import { isHardAspect } from '../../utils/aspects';
import styles from './MatrixView.module.css';

/**
 * Aspect Matrix View.
 *
 * Shows a grid of all cross-chart aspects between bodies in stacked charts.
 * Rows = bodies from chart A, Columns = bodies from chart B (for each pair).
 * Cells show aspect glyph + orb when within the configured threshold.
 */
export default function MatrixView({ stackCharts, orbSettings }) {
  const [maxOrb, setMaxOrb] = useState(5);
  const [hardOnly, setHardOnly] = useState(false);

  const crossAspects = useMemo(() => {
    if (!stackCharts || stackCharts.length < 2) return [];
    return computeCrossChartAspects(stackCharts, {
      hardOnly,
      maxOrb,
    });
  }, [stackCharts, hardOnly, maxOrb]);

  // Group aspects by chart pair
  const chartPairs = useMemo(() => {
    if (!stackCharts || stackCharts.length < 2) return [];

    const pairs = [];
    for (let i = 0; i < stackCharts.length; i++) {
      for (let j = i + 1; j < stackCharts.length; j++) {
        const chartA = stackCharts[i];
        const chartB = stackCharts[j];
        const pairKey = `${chartA.id}_${chartB.id}`;

        // Get aspects for this pair
        const pairAspects = crossAspects.filter(
          a => a.chartA.id === chartA.id && a.chartB.id === chartB.id
        );

        // Get all bodies from each chart
        const bodiesA = getChartBodies(chartA);
        const bodiesB = getChartBodies(chartB);

        pairs.push({
          key: pairKey,
          chartA,
          chartB,
          bodiesA,
          bodiesB,
          aspects: pairAspects,
        });
      }
    }
    return pairs;
  }, [stackCharts, crossAspects]);

  if (!stackCharts || stackCharts.length < 2) {
    return (
      <div className={styles.empty}>
        Add at least 2 charts to see the aspect matrix
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Controls */}
      <div className={styles.controls}>
        <label className={styles.controlItem}>
          <span className={styles.controlLabel}>Max orb</span>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={maxOrb}
            onChange={e => setMaxOrb(parseFloat(e.target.value))}
            className={styles.orbSlider}
          />
          <span className={styles.orbValue}>{maxOrb}°</span>
        </label>
        <label className={styles.controlItem}>
          <input
            type="checkbox"
            checked={hardOnly}
            onChange={e => setHardOnly(e.target.checked)}
            className={styles.checkbox}
          />
          <span className={styles.controlLabel}>Hard aspects only</span>
        </label>
        <span className={styles.aspectCount}>
          {crossAspects.length} aspect{crossAspects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Matrix tables — one per chart pair */}
      {chartPairs.map(pair => (
        <PairMatrix key={pair.key} pair={pair} />
      ))}

      {/* Tightest aspects list */}
      {crossAspects.length > 0 && (
        <div className={styles.tightestSection}>
          <div className={styles.tightestTitle}>Tightest Aspects</div>
          {crossAspects.slice(0, 15).map((a, i) => (
            <div key={i} className={styles.tightestRow}>
              <span className={styles.tightestRank}>{i + 1}</span>
              <span className={styles.tightestLabel}>{a.label}</span>
              <span className={styles.tightestOrb}>{a.orb.toFixed(2)}°</span>
              <span className={styles.tightestCharts}>
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
 * A single chart-pair matrix grid.
 */
function PairMatrix({ pair }) {
  const { chartA, chartB, bodiesA, bodiesB, aspects } = pair;
  const ctA = getChartType(chartA.chartType || 'natal');
  const ctB = getChartType(chartB.chartType || 'natal');

  // Build lookup: `${bodyA}_${bodyB}` → aspect
  const aspectLookup = useMemo(() => {
    const map = {};
    for (const a of aspects) {
      const key = `${a.bodyA}_${a.bodyB}`;
      // Keep tightest aspect per body pair
      if (!map[key] || a.orb < map[key].orb) {
        map[key] = a;
      }
    }
    return map;
  }, [aspects]);

  return (
    <div className={styles.pairSection}>
      <div className={styles.pairHeader}>
        <span className={styles.pairChartName} style={{ color: ctA.color }}>
          {chartA.name}
        </span>
        <span className={styles.pairVs}>vs</span>
        <span className={styles.pairChartName} style={{ color: ctB.color }}>
          {chartB.name}
        </span>
        <span className={styles.pairCount}>
          {aspects.length} aspect{aspects.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th className={styles.cornerCell} />
              {bodiesB.map(body => {
                const planet = PLANET_MAP[body.id];
                return (
                  <th key={body.id} className={styles.colHeader} title={planet?.name || body.id}>
                    <span style={{ color: planet?.color || ctB.color }}>
                      {planet?.symbol || body.id}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {bodiesA.map(bodyA => {
              const planetA = PLANET_MAP[bodyA.id];
              return (
                <tr key={bodyA.id}>
                  <td className={styles.rowHeader} title={planetA?.name || bodyA.id}>
                    <span style={{ color: planetA?.color || ctA.color }}>
                      {planetA?.symbol || bodyA.id}
                    </span>
                  </td>
                  {bodiesB.map(bodyB => {
                    const key = `${bodyA.id}_${bodyB.id}`;
                    const aspect = aspectLookup[key];
                    return (
                      <AspectCell key={bodyB.id} aspect={aspect} />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Single aspect cell in the matrix.
 */
function AspectCell({ aspect }) {
  if (!aspect) {
    return <td className={styles.cell} />;
  }

  const hard = isHardAspect(aspect.aspect.angle);
  const tightness = Math.max(0, 1 - aspect.orb / 5); // 0–1 for opacity scaling

  return (
    <td
      className={`${styles.cell} ${styles.cellActive} ${hard ? styles.cellHard : styles.cellSoft}`}
      title={`${aspect.label} — ${aspect.orb.toFixed(2)}° orb`}
      style={{ opacity: 0.4 + tightness * 0.6 }}
    >
      <span className={styles.cellSymbol}>{aspect.aspect.symbol}</span>
      <span className={styles.cellOrb}>{aspect.orb.toFixed(1)}°</span>
    </td>
  );
}

/**
 * Extract all chartable bodies (planets + angles) from a chart.
 */
function getChartBodies(chart) {
  const bodies = [];
  if (chart.positions) {
    for (const [id, lon] of Object.entries(chart.positions)) {
      if (typeof lon === 'number' && !isNaN(lon)) {
        bodies.push({ id, lon });
      }
    }
  }
  if (chart.angles) {
    for (const [id, lon] of Object.entries(chart.angles)) {
      if (typeof lon === 'number' && !isNaN(lon)) {
        bodies.push({ id, lon });
      }
    }
  }
  return bodies;
}
