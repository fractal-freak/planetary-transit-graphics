import { useEffect, useRef } from 'react';
import { PLANETS } from '../../data/planets';
import { ZODIAC_SIGNS, getSignIndex } from '../../data/zodiac';

/**
 * ChartWheel — single-chart zodiac wheel preview.
 *
 * Rotates so ASC (if available) sits at the 9 o'clock position. Falls back
 * to 0° Aries at 9 o'clock when no angles are present. Draws the zodiac
 * ring, whole-sign house cusps, planet glyphs at their longitudes, and
 * ASC/MC markers.
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

// Force text-style rendering for astrological glyphs (no color emoji).
const GLYPH_FONT = '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", serif';

function drawWheel(ctx, chart, size) {
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.47;
  const rZodiacInner = size * 0.37;
  const rPlanets = size * 0.31;
  const rHousesInner = size * 0.10;

  const ascLng = chart.angles?.Asc ?? 0;
  const angleFor = (L) => Math.PI - ((L - ascLng) * Math.PI / 180);

  // ── Boundary rings ──
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rZodiacInner, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(cx, cy, rHousesInner, 0, Math.PI * 2);
  ctx.stroke();

  // ── Zodiac sign sectors and glyphs ──
  const signColors = ['#c83c3c', '#3c963c', '#beaa28', '#3264c8'];
  for (let i = 0; i < 12; i++) {
    const startLng = i * 30;

    // Sector boundary line through the sign band only
    const phiStart = angleFor(startLng);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx + rZodiacInner * Math.cos(phiStart), cy + rZodiacInner * Math.sin(phiStart));
    ctx.lineTo(cx + rOuter * Math.cos(phiStart), cy + rOuter * Math.sin(phiStart));
    ctx.stroke();

    // Sign glyph at sector midpoint
    const phiMid = angleFor(startLng + 15);
    const rGlyph = (rOuter + rZodiacInner) / 2;
    ctx.fillStyle = signColors[i % 4];
    ctx.font = `${Math.round(size * 0.05)}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ZODIAC_SIGNS[i].symbol, cx + rGlyph * Math.cos(phiMid), cy + rGlyph * Math.sin(phiMid));
  }

  // ── Degree ticks every 5° on the inside of the zodiac ring ──
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.5;
  for (let d = 0; d < 360; d += 5) {
    const phi = angleFor(d);
    const len = d % 30 === 0 ? 5 : (d % 10 === 0 ? 3 : 2);
    ctx.beginPath();
    ctx.moveTo(cx + rZodiacInner * Math.cos(phi), cy + rZodiacInner * Math.sin(phi));
    ctx.lineTo(cx + (rZodiacInner - len) * Math.cos(phi), cy + (rZodiacInner - len) * Math.sin(phi));
    ctx.stroke();
  }

  // ── Whole-sign house cusps ──
  const ascSignStart = Math.floor(ascLng / 30) * 30;
  const houseCusps = [];
  for (let i = 0; i < 12; i++) {
    houseCusps.push((ascSignStart + i * 30) % 360);
  }
  for (let i = 0; i < 12; i++) {
    const phi = angleFor(houseCusps[i]);
    // Emphasize 1st (Asc) and 10th (MC in whole sign) cusps
    if (i === 0) {
      ctx.strokeStyle = 'rgba(200,60,60,0.6)';
      ctx.lineWidth = 1.2;
    } else if (i === 9) {
      ctx.strokeStyle = 'rgba(180,140,40,0.6)';
      ctx.lineWidth = 1.2;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.6;
    }
    ctx.beginPath();
    ctx.moveTo(cx + rHousesInner * Math.cos(phi), cy + rHousesInner * Math.sin(phi));
    ctx.lineTo(cx + rZodiacInner * Math.cos(phi), cy + rZodiacInner * Math.sin(phi));
    ctx.stroke();
  }

  // ── House numbers at house midpoint, just inside the inner ring ──
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.font = `${Math.round(size * 0.028)}px sans-serif`;
  for (let i = 0; i < 12; i++) {
    const midLng = (houseCusps[i] + 15) % 360;
    const phi = angleFor(midLng);
    const r = rHousesInner + (rPlanets - rHousesInner) * 0.18;
    ctx.fillText(String(i + 1), cx + r * Math.cos(phi), cy + r * Math.sin(phi));
  }

  // ── ASC / MC labels on the cusp lines ──
  if (chart.angles) {
    const drawLabel = (lng, label, color) => {
      if (lng == null) return;
      const phi = angleFor(lng);
      const r = rZodiacInner - (rZodiacInner - rPlanets) * 0.5;
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(size * 0.030)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx + r * Math.cos(phi), cy + r * Math.sin(phi));
    };
    drawLabel(chart.angles.Asc, 'AC', 'rgba(200,60,60,0.85)');
    drawLabel(chart.angles.MC, 'MC', 'rgba(180,140,40,0.95)');
  }

  // ── Planet glyphs ──
  // Collision-spread along the ring so overlapping glyphs are readable.
  const placements = [];
  for (const planet of PLANETS) {
    const lng = chart.positions?.[planet.id];
    if (lng == null) continue;
    placements.push({ planet, lng, originalLng: lng });
  }
  placements.sort((a, b) => a.lng - b.lng);
  const minSep = 7;
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
    const phiOrig = angleFor(originalLng);
    const phi = angleFor(lng);

    // Tick at the actual longitude on the inside of the zodiac ring
    ctx.strokeStyle = planet.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + rZodiacInner * Math.cos(phiOrig), cy + rZodiacInner * Math.sin(phiOrig));
    ctx.lineTo(cx + (rZodiacInner - 4) * Math.cos(phiOrig), cy + (rZodiacInner - 4) * Math.sin(phiOrig));
    ctx.stroke();

    // Optional connector if displaced from collision-spread
    if (Math.abs(lng - originalLng) > 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + rZodiacInner * Math.cos(phiOrig), cy + rZodiacInner * Math.sin(phiOrig));
      ctx.lineTo(cx + rPlanets * Math.cos(phi), cy + rPlanets * Math.sin(phi));
      ctx.stroke();
    }

    // Glyph
    ctx.fillStyle = planet.color;
    ctx.font = `${Math.round(size * 0.05)}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(planet.symbol, cx + rPlanets * Math.cos(phi), cy + rPlanets * Math.sin(phi));

    // Degree label slightly inward
    const signIdx = getSignIndex(originalLng);
    const degInSign = Math.floor(originalLng - signIdx * 30);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = `${Math.round(size * 0.026)}px sans-serif`;
    const labelR = rPlanets - (rPlanets - rHousesInner) * 0.22;
    ctx.fillText(`${degInSign}°`, cx + labelR * Math.cos(phi), cy + labelR * Math.sin(phi));
  }
}
