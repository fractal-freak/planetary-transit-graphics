import { useEffect, useRef } from 'react';
import { PLANETS } from '../../data/planets';
import { ZODIAC_SIGNS, getSignIndex } from '../../data/zodiac';

/**
 * ChartWheel — single-chart zodiac wheel preview.
 *
 * Rotates so ASC (if available) sits at the 9 o'clock position. Falls back
 * to 0° Aries at 9 o'clock when no angles are present. Draws zodiac ring,
 * sign glyphs, planet glyphs at their longitudes, and ASC/MC markers.
 */
export default function ChartWheel({ chart, size = 320 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    if (chart) drawWheel(ctx, chart, size);
    else ctx.clearRect(0, 0, size, size);
  }, [chart, size]);

  return <canvas ref={canvasRef} />;
}

function drawWheel(ctx, chart, size) {
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.47;
  const rZodiac = size * 0.40;
  const rPlanet = size * 0.31;
  const rInner = size * 0.22;

  const ascLng = chart.angles?.Asc ?? 0;
  const angleFor = (L) => Math.PI - ((L - ascLng) * Math.PI / 180);

  // ── Outer ring ──
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rZodiac, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rPlanet, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.stroke();

  // ── Zodiac sign sectors and glyphs ──
  const signColors = ['#c83c3c', '#3c963c', '#beaa28', '#3264c8'];
  for (let i = 0; i < 12; i++) {
    const startLng = i * 30;
    const endLng = (i + 1) * 30;

    // Sector boundary line
    const phiStart = angleFor(startLng);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx + rZodiac * Math.cos(phiStart), cy + rZodiac * Math.sin(phiStart));
    ctx.lineTo(cx + rOuter * Math.cos(phiStart), cy + rOuter * Math.sin(phiStart));
    ctx.stroke();

    // Sign glyph at sector midpoint
    const midLng = startLng + 15;
    const phiMid = angleFor(midLng);
    const rGlyph = (rOuter + rZodiac) / 2;
    const gx = cx + rGlyph * Math.cos(phiMid);
    const gy = cy + rGlyph * Math.sin(phiMid);
    ctx.fillStyle = signColors[i % 4];
    ctx.font = `${Math.round(size * 0.045)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ZODIAC_SIGNS[i].symbol, gx, gy);
  }

  // ── Degree ticks every 5° on the inside of the zodiac ring ──
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.5;
  for (let d = 0; d < 360; d += 5) {
    const phi = angleFor(d);
    const len = d % 30 === 0 ? 5 : (d % 10 === 0 ? 3 : 2);
    ctx.beginPath();
    ctx.moveTo(cx + (rZodiac) * Math.cos(phi), cy + (rZodiac) * Math.sin(phi));
    ctx.lineTo(cx + (rZodiac - len) * Math.cos(phi), cy + (rZodiac - len) * Math.sin(phi));
    ctx.stroke();
  }

  // ── Angle axes (ASC/DSC, MC/IC) ──
  if (chart.angles) {
    const drawAxis = (lng, label, color) => {
      const phi = angleFor(lng);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx + rInner * Math.cos(phi), cy + rInner * Math.sin(phi));
      ctx.lineTo(cx + rPlanet * Math.cos(phi), cy + rPlanet * Math.sin(phi));
      ctx.stroke();
      ctx.setLineDash([]);

      // Label just inside the planet ring
      const lx = cx + (rInner - 8) * Math.cos(phi);
      const ly = cy + (rInner - 8) * Math.sin(phi);
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(size * 0.032)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly);
    };
    drawAxis(chart.angles.Asc, 'AC', '#c83c3c');
    if (chart.angles.MC != null) drawAxis(chart.angles.MC, 'MC', '#b8860b');
  }

  // ── Planet glyphs ──
  // Resolve collisions: bump glyphs apart along the ring if too close
  const placements = [];
  for (const planet of PLANETS) {
    const lng = chart.positions?.[planet.id];
    if (lng == null) continue;
    placements.push({ planet, lng, originalLng: lng });
  }

  // Sort by longitude and spread out clusters
  placements.sort((a, b) => a.lng - b.lng);
  const minSep = 7; // degrees
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < placements.length; i++) {
      const cur = placements[i];
      const next = placements[(i + 1) % placements.length];
      let gap = next.lng - cur.lng;
      if (i === placements.length - 1) gap += 360;
      if (gap < minSep) {
        const push = (minSep - gap) / 2;
        cur.lng -= push;
        next.lng += push;
      }
    }
  }

  for (const { planet, lng, originalLng } of placements) {
    const phi = angleFor(lng);
    const px = cx + rPlanet * Math.cos(phi) + (rPlanet - rInner) * 0.3 * Math.cos(phi);
    const py = cy + rPlanet * Math.sin(phi) + (rPlanet - rInner) * 0.3 * Math.sin(phi);

    // Draw line from original longitude on planet ring to glyph if displaced
    if (Math.abs(lng - originalLng) > 0.5) {
      const phiOrig = angleFor(originalLng);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + rPlanet * Math.cos(phiOrig), cy + rPlanet * Math.sin(phiOrig));
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    // Tick at the actual longitude on the planet ring
    const phiOrig = angleFor(originalLng);
    ctx.strokeStyle = planet.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + (rPlanet + 2) * Math.cos(phiOrig), cy + (rPlanet + 2) * Math.sin(phiOrig));
    ctx.lineTo(cx + (rPlanet - 4) * Math.cos(phiOrig), cy + (rPlanet - 4) * Math.sin(phiOrig));
    ctx.stroke();

    // Glyph
    ctx.fillStyle = planet.color;
    ctx.font = `${Math.round(size * 0.05)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(planet.symbol, px, py);

    // Degree label
    const signIdx = getSignIndex(originalLng);
    const degInSign = Math.floor(originalLng - signIdx * 30);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = `${Math.round(size * 0.028)}px sans-serif`;
    const labelR = rPlanet + (rPlanet - rInner) * 0.55;
    ctx.fillText(`${degInSign}°`, cx + labelR * Math.cos(phi), cy + labelR * Math.sin(phi));
  }
}
