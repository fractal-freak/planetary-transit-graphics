import { useRef, useEffect, useMemo, useState } from 'react';
import { PLANET_MAP } from '../../data/planets';
import { ZODIAC_SIGNS, getElementColor } from '../../data/zodiac';
import { getChartType } from '../../data/chartTypes';
import { angularSeparation, ASPECTS, isHardAspect } from '../../utils/aspects';
import styles from './WheelView.module.css';

/**
 * Chart Wheel View.
 *
 * Renders a traditional circular zodiac wheel on canvas.
 * Supports single chart, biwheel (2 charts), and triwheel (3 charts).
 */
export default function WheelView({ stackCharts, orbSettings }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [selectedChart, setSelectedChart] = useState(0);
  const [showAspects, setShowAspects] = useState(true);
  const [wheelMode, setWheelMode] = useState('single'); // 'single' | 'bi' | 'tri'

  // Charts to display on wheel
  const wheelCharts = useMemo(() => {
    if (!stackCharts || stackCharts.length === 0) return [];
    if (wheelMode === 'single') return [stackCharts[selectedChart] || stackCharts[0]];
    if (wheelMode === 'bi') return stackCharts.slice(0, 2);
    return stackCharts.slice(0, 3);
  }, [stackCharts, selectedChart, wheelMode]);

  // Render wheel on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || wheelCharts.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    drawWheel(ctx, size, wheelCharts, showAspects);
  }, [wheelCharts, showAspects]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas || wheelCharts.length === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);

      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      drawWheel(ctx, size, wheelCharts, showAspects);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [wheelCharts, showAspects]);

  if (!stackCharts || stackCharts.length === 0) {
    return (
      <div className={styles.empty}>
        Add charts to your stack to see the wheel view
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.modeSelect}>
          <button
            className={`${styles.modeBtn} ${wheelMode === 'single' ? styles.modeBtnActive : ''}`}
            onClick={() => setWheelMode('single')}
          >
            Single
          </button>
          {stackCharts.length >= 2 && (
            <button
              className={`${styles.modeBtn} ${wheelMode === 'bi' ? styles.modeBtnActive : ''}`}
              onClick={() => setWheelMode('bi')}
            >
              Biwheel
            </button>
          )}
          {stackCharts.length >= 3 && (
            <button
              className={`${styles.modeBtn} ${wheelMode === 'tri' ? styles.modeBtnActive : ''}`}
              onClick={() => setWheelMode('tri')}
            >
              Triwheel
            </button>
          )}
        </div>

        {wheelMode === 'single' && stackCharts.length > 1 && (
          <select
            className={styles.chartSelect}
            value={selectedChart}
            onChange={e => setSelectedChart(Number(e.target.value))}
          >
            {stackCharts.map((chart, i) => (
              <option key={chart.id} value={i}>{chart.name}</option>
            ))}
          </select>
        )}

        <label className={styles.controlItem}>
          <input
            type="checkbox"
            checked={showAspects}
            onChange={e => setShowAspects(e.target.checked)}
            className={styles.checkbox}
          />
          <span className={styles.controlLabel}>Aspects</span>
        </label>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className={styles.canvasWrap}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        {wheelCharts.map((chart, i) => {
          const ct = getChartType(chart.chartType || 'natal');
          return (
            <div key={chart.id} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: ct.color }} />
              <span className={styles.legendName}>{chart.name}</span>
              <span className={styles.legendType}>{ct.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Draw the zodiac wheel on canvas.
 */
function drawWheel(ctx, size, charts, showAspects) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const signR = outerR * 0.85;
  const innerR = outerR * 0.72;
  const aspectR = innerR * 0.85;

  // Clear
  ctx.clearRect(0, 0, size, size);

  // Background
  ctx.fillStyle = '#faf8f5';
  ctx.beginPath();
  ctx.arc(cx, cy, outerR + 4, 0, Math.PI * 2);
  ctx.fill();

  // Draw zodiac ring
  drawZodiacRing(ctx, cx, cy, outerR, signR);

  // Draw sign boundaries
  drawSignBoundaries(ctx, cx, cy, outerR, innerR);

  // Draw degree ticks
  drawDegreeTicks(ctx, cx, cy, signR, innerR);

  // Inner circle
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();

  // Draw planets for each chart
  if (charts.length === 1) {
    drawPlanets(ctx, cx, cy, innerR, signR, charts[0], getChartType(charts[0].chartType || 'natal'));
  } else {
    // Multi-chart: space planets at different radii
    const radii = charts.length === 2
      ? [innerR * 0.95, outerR * 0.93]
      : [innerR * 0.92, (innerR + signR) / 2, outerR * 0.93];

    charts.forEach((chart, i) => {
      const ct = getChartType(chart.chartType || 'natal');
      const r = radii[i];
      drawPlanetsAtRadius(ctx, cx, cy, r, chart, ct);
    });
  }

  // Draw aspect lines
  if (showAspects && charts.length >= 1) {
    drawAspectLines(ctx, cx, cy, aspectR, charts);
  }
}

/**
 * Draw the zodiac sign ring with colored segments.
 */
function drawZodiacRing(ctx, cx, cy, outerR, innerR) {
  for (let i = 0; i < 12; i++) {
    const startAngle = degToRad(i * 30 - 90);
    const endAngle = degToRad((i + 1) * 30 - 90);

    // Sign background
    ctx.fillStyle = getElementColor(i, 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, endAngle);
    ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fill();

    // Sign symbol
    const midAngle = degToRad(i * 30 + 15 - 90);
    const labelR = (outerR + innerR) / 2;
    const sx = cx + Math.cos(midAngle) * labelR;
    const sy = cy + Math.sin(midAngle) * labelR;

    ctx.save();
    ctx.font = '14px "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", serif';
    ctx.fillStyle = getElementColor(i, 0.55);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ZODIAC_SIGNS[i].symbol, sx, sy);
    ctx.restore();
  }

  // Outer ring border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draw sign boundary lines.
 */
function drawSignBoundaries(ctx, cx, cy, outerR, innerR) {
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1;

  for (let i = 0; i < 12; i++) {
    const angle = degToRad(i * 30 - 90);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.stroke();
  }
}

/**
 * Draw degree tick marks (every 5° and 10°).
 */
function drawDegreeTicks(ctx, cx, cy, signR, innerR) {
  for (let deg = 0; deg < 360; deg += 5) {
    const angle = degToRad(deg - 90);
    const isMajor = deg % 10 === 0;
    const tickStart = isMajor ? innerR : innerR + (signR - innerR) * 0.6;

    ctx.strokeStyle = isMajor ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * tickStart, cy + Math.sin(angle) * tickStart);
    ctx.lineTo(cx + Math.cos(angle) * signR, cy + Math.sin(angle) * signR);
    ctx.stroke();
  }
}

/**
 * Draw planets for a single-chart wheel.
 */
function drawPlanets(ctx, cx, cy, innerR, signR, chart, ct) {
  const positions = { ...(chart.positions || {}), ...(chart.angles || {}) };
  const entries = Object.entries(positions)
    .filter(([, lon]) => typeof lon === 'number' && !isNaN(lon));

  // Resolve collisions — nudge planets that are too close
  const placed = resolveCollisions(entries, 8);

  for (const [bodyId, lon, displayLon] of placed) {
    const planet = PLANET_MAP[bodyId];
    if (!planet) continue;

    const angle = degToRad(displayLon - 90);
    const r = (innerR + signR) / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    // Tick from inner ring to planet position
    const tickAngle = degToRad(lon - 90);
    ctx.strokeStyle = (planet.color || ct.color) + '40';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(tickAngle) * innerR, cy + Math.sin(tickAngle) * innerR);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Planet glyph
    ctx.save();
    ctx.font = '14px "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", serif';
    ctx.fillStyle = planet.color || ct.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(planet.symbol, x, y);
    ctx.restore();
  }
}

/**
 * Draw planets at a specific radius (for multi-chart wheels).
 */
function drawPlanetsAtRadius(ctx, cx, cy, r, chart, ct) {
  const positions = { ...(chart.positions || {}), ...(chart.angles || {}) };
  const entries = Object.entries(positions)
    .filter(([, lon]) => typeof lon === 'number' && !isNaN(lon));

  const placed = resolveCollisions(entries, 8);

  for (const [bodyId, lon, displayLon] of placed) {
    const planet = PLANET_MAP[bodyId];
    if (!planet) continue;

    const angle = degToRad(displayLon - 90);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    ctx.save();
    ctx.font = '12px "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", serif';
    ctx.fillStyle = planet.color || ct.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(planet.symbol, x, y);
    ctx.restore();
  }
}

/**
 * Draw aspect lines between planets within/across charts.
 */
function drawAspectLines(ctx, cx, cy, r, charts) {
  // For single chart: intra-chart aspects
  // For multi-chart: cross-chart aspects between first two charts
  const chartA = charts[0];
  const chartB = charts.length > 1 ? charts[1] : charts[0];

  const pointsA = getAllPoints(chartA);
  const pointsB = chartA === chartB ? pointsA : getAllPoints(chartB);

  for (const [idA, lonA] of pointsA) {
    for (const [idB, lonB] of pointsB) {
      if (chartA === chartB && idA >= idB) continue; // avoid duplicates in single chart

      const sep = angularSeparation(lonA, lonB);

      for (const aspect of ASPECTS) {
        const dev = Math.abs(sep - aspect.angle);
        if (dev <= 3) { // tight orb for visual clarity
          const angleA = degToRad(lonA - 90);
          const angleB = degToRad(lonB - 90);
          const x1 = cx + Math.cos(angleA) * r;
          const y1 = cy + Math.sin(angleA) * r;
          const x2 = cx + Math.cos(angleB) * r;
          const y2 = cy + Math.sin(angleB) * r;

          const hard = isHardAspect(aspect.angle);
          const alpha = 0.15 + (1 - dev / 3) * 0.35;

          ctx.strokeStyle = hard
            ? `rgba(200, 60, 60, ${alpha})`
            : `rgba(60, 100, 200, ${alpha})`;
          ctx.lineWidth = hard ? 1 : 0.5;

          if (aspect.angle === 0) {
            // Conjunction — highlight with a dot
            ctx.fillStyle = `rgba(240, 192, 91, ${alpha + 0.2})`;
            ctx.beginPath();
            ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, 3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
          break; // only draw tightest aspect per pair
        }
      }
    }
  }
}

/**
 * Resolve display collisions by nudging planets that are too close.
 */
function resolveCollisions(entries, minGap) {
  const sorted = entries
    .map(([id, lon]) => [id, lon, lon]) // [id, actualLon, displayLon]
    .sort((a, b) => a[1] - b[1]);

  // Simple collision resolution: nudge overlapping glyphs apart
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 1; i < sorted.length; i++) {
      const diff = ((sorted[i][2] - sorted[i - 1][2]) % 360 + 360) % 360;
      if (diff < minGap && diff > 0) {
        const nudge = (minGap - diff) / 2;
        sorted[i - 1][2] = (sorted[i - 1][2] - nudge + 360) % 360;
        sorted[i][2] = (sorted[i][2] + nudge) % 360;
      }
    }
    // Check wrap-around (last to first)
    if (sorted.length > 1) {
      const diff = ((sorted[0][2] - sorted[sorted.length - 1][2]) % 360 + 360) % 360;
      if (diff < minGap && diff > 0) {
        const nudge = (minGap - diff) / 2;
        sorted[sorted.length - 1][2] = (sorted[sorted.length - 1][2] - nudge + 360) % 360;
        sorted[0][2] = (sorted[0][2] + nudge) % 360;
      }
    }
  }

  return sorted;
}

function getAllPoints(chart) {
  const points = [];
  if (chart.positions) {
    for (const [id, lon] of Object.entries(chart.positions)) {
      if (typeof lon === 'number' && !isNaN(lon)) points.push([id, lon]);
    }
  }
  if (chart.angles) {
    for (const [id, lon] of Object.entries(chart.angles)) {
      if (typeof lon === 'number' && !isNaN(lon)) points.push([id, lon]);
    }
  }
  return points;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}
