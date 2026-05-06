import { useEffect, useRef } from 'react';
import { PLANETS } from '../../data/planets';
import { ZODIAC_SIGNS, getSignIndex } from '../../data/zodiac';
import { ASPECTS, aspectIntensity, isHardAspect } from '../../utils/aspects';

/**
 * ChartWheel — single-chart zodiac wheel preview.
 *
 * Rotates so ASC (if available) sits at the 9 o'clock position. Falls back
 * to 0° Aries at 9 o'clock when no angles are present. Draws zodiac ring,
 * whole-sign house cusps, planet glyphs at their longitudes, ASC/MC
 * markers, and aspect lines between planets in the center.
 */
export default function ChartWheel({ chart, size = 360 }) {
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

const GLYPH_FONT = '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", serif';

const ASPECT_COLOR_HARD = 'rgba(200, 50, 50, 0.7)';
const ASPECT_COLOR_SOFT = 'rgba(60, 110, 200, 0.7)';

function drawWheel(ctx, chart, size) {
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.48;
  const rZodiacInner = size * 0.41;
  const rGlyph = size * 0.345;
  const rDegree = size * 0.275;
  const rHousesInner = size * 0.20;

  const ascLng = chart.angles?.Asc ?? 0;
  const angleFor = (L) => Math.PI - ((L - ascLng) * Math.PI / 180);

  // ── Boundary rings ──
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, rOuter, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, rZodiacInner, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, rHousesInner, 0, Math.PI * 2); ctx.stroke();

  // ── Zodiac sign sectors and glyphs ──
  const signColors = ['#c83c3c', '#3c963c', '#beaa28', '#3264c8'];
  for (let i = 0; i < 12; i++) {
    const startLng = i * 30;
    const phiStart = angleFor(startLng);

    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx + rZodiacInner * Math.cos(phiStart), cy + rZodiacInner * Math.sin(phiStart));
    ctx.lineTo(cx + rOuter * Math.cos(phiStart), cy + rOuter * Math.sin(phiStart));
    ctx.stroke();

    const phiMid = angleFor(startLng + 15);
    const rGlyphSign = (rOuter + rZodiacInner) / 2;
    ctx.fillStyle = signColors[i % 4];
    ctx.font = `bold ${Math.round(size * 0.058)}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ZODIAC_SIGNS[i].symbol, cx + rGlyphSign * Math.cos(phiMid), cy + rGlyphSign * Math.sin(phiMid));
  }

  // ── Degree ticks every 5°/10°/30° ──
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 0.7;
  for (let d = 0; d < 360; d += 5) {
    const phi = angleFor(d);
    const len = d % 30 === 0 ? 6 : (d % 10 === 0 ? 4 : 2);
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
    if (i === 0 || i === 9) {
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1.2;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.7;
    }
    ctx.beginPath();
    ctx.moveTo(cx + rHousesInner * Math.cos(phi), cy + rHousesInner * Math.sin(phi));
    ctx.lineTo(cx + rZodiacInner * Math.cos(phi), cy + rZodiacInner * Math.sin(phi));
    ctx.stroke();
  }

  // ── House numbers just inside the inner ring (so they sit in each house slice) ──
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.font = `${Math.round(size * 0.024)}px sans-serif`;
  for (let i = 0; i < 12; i++) {
    const midLng = (houseCusps[i] + 15) % 360;
    const phi = angleFor(midLng);
    const r = rHousesInner - 9;
    ctx.fillText(String(i + 1), cx + r * Math.cos(phi), cy + r * Math.sin(phi));
  }

  // ── ASC / MC labels at the planet-glyph radius, on their actual longitude. ──
  // A small tick on the inner edge of the zodiac ring marks the exact angle.
  if (chart.angles) {
    const drawAxis = (lng, label) => {
      if (lng == null) return;
      const phi = angleFor(lng);
      // Tick on the zodiac ring inner edge
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx + rZodiacInner * Math.cos(phi), cy + rZodiacInner * Math.sin(phi));
      ctx.lineTo(cx + (rZodiacInner - 7) * Math.cos(phi), cy + (rZodiacInner - 7) * Math.sin(phi));
      ctx.stroke();
      // Label at the planet-glyph radius
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.round(size * 0.030)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx + rGlyph * Math.cos(phi), cy + rGlyph * Math.sin(phi));
    };
    drawAxis(chart.angles.Asc, 'AC');
    drawAxis(chart.angles.MC, 'MC');
  }

  // ── Collect placements ──
  const placements = [];
  for (const planet of PLANETS) {
    const lng = chart.positions?.[planet.id];
    if (lng == null) continue;
    placements.push({ planet, lng, originalLng: lng });
  }

  // ── Aspect lines (drawn before glyphs so glyphs sit on top) ──
  if (placements.length > 1) {
    const lines = [];
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i];
        const b = placements[j];
        for (const aspect of ASPECTS) {
          if (aspect.angle === 0) continue;
          const intensity = aspectIntensity(a.originalLng, b.originalLng, aspect.angle, aspect.orb);
          if (intensity > 0) {
            lines.push({ a, b, aspect, intensity });
            break;
          }
        }
      }
    }
    // Draw weaker lines first so tighter ones overlay on top.
    lines.sort((x, y) => x.intensity - y.intensity);
    for (const { a, b, aspect, intensity } of lines) {
      const phiA = angleFor(a.originalLng);
      const phiB = angleFor(b.originalLng);
      // Aspect lines are chords of the inner circle — both endpoints sit on
      // its edge so all lines stay strictly within the central area.
      const xA = cx + rHousesInner * Math.cos(phiA);
      const yA = cy + rHousesInner * Math.sin(phiA);
      const xB = cx + rHousesInner * Math.cos(phiB);
      const yB = cy + rHousesInner * Math.sin(phiB);
      ctx.strokeStyle = isHardAspect(aspect.angle) ? ASPECT_COLOR_HARD : ASPECT_COLOR_SOFT;
      ctx.lineWidth = 0.5 + intensity * 1.4;
      ctx.beginPath();
      ctx.moveTo(xA, yA);
      ctx.lineTo(xB, yB);
      ctx.stroke();
    }
  }

  // ── Planet glyphs (with collision-spread) ──
  placements.sort((a, b) => a.lng - b.lng);
  const minSep = 8;
  for (let pass = 0; pass < 4; pass++) {
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

    // Tick on the inner edge of the zodiac ring, at the exact longitude
    ctx.strokeStyle = planet.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + rZodiacInner * Math.cos(phiOrig), cy + rZodiacInner * Math.sin(phiOrig));
    ctx.lineTo(cx + (rZodiacInner - 7) * Math.cos(phiOrig), cy + (rZodiacInner - 7) * Math.sin(phiOrig));
    ctx.stroke();

    // Connector to displaced glyph
    if (Math.abs(lng - originalLng) > 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + (rZodiacInner - 7) * Math.cos(phiOrig), cy + (rZodiacInner - 7) * Math.sin(phiOrig));
      ctx.lineTo(cx + rGlyph * Math.cos(phi), cy + rGlyph * Math.sin(phi));
      ctx.stroke();
    }

    // Planet glyph
    ctx.fillStyle = planet.color;
    ctx.font = `bold ${Math.round(size * 0.054)}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(planet.symbol, cx + rGlyph * Math.cos(phi), cy + rGlyph * Math.sin(phi));

    // Degree° (black, bold) + minute' (dark gray) stacked, with breathing room.
    const signIdx = getSignIndex(originalLng);
    const inSign = originalLng - signIdx * 30;
    const deg = Math.floor(inSign);
    const min = Math.floor((inSign - deg) * 60);
    const labelX = cx + rDegree * Math.cos(phi);
    const labelY = cy + rDegree * Math.sin(phi);
    ctx.fillStyle = '#000';
    ctx.font = `bold ${Math.round(size * 0.026)}px sans-serif`;
    ctx.fillText(`${deg}°`, labelX, labelY - size * 0.016);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = `${Math.round(size * 0.020)}px sans-serif`;
    ctx.fillText(`${String(min).padStart(2, '0')}'`, labelX, labelY + size * 0.018);
  }
}
