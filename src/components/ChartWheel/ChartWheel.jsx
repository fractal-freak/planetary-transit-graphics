import { useEffect, useRef } from 'react';
import { PLANETS } from '../../data/planets';
import { ZODIAC_SIGNS, getSignIndex } from '../../data/zodiac';
import { ASPECTS, aspectIntensity, isHardAspect } from '../../utils/aspects';

/**
 * ChartWheel — single-chart zodiac wheel preview.
 *
 * Layered bands, outer to inner:
 *   - Zodiac sign band   (between rOuter and rZodiacInner)
 *   - Planet band        (planet glyph at rGlyph, deg° at rDegree, min' at rMinute)
 *   - Houses ring        (between rHouseOuter and rHouseInner; numbers + cusps here)
 *   - Aspect interior    (chords stay inside rHouseInner)
 *
 * Rotated so ASC sits at 9 o'clock; falls back to 0° Aries when no
 * angles are present.
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
  // Bands: zodiac → planet → houses(thin) → aspects
  const rOuter = size * 0.48;
  const rZodiacInner = size * 0.41;
  const rGlyph = size * 0.355;
  const rDegree = size * 0.305;
  const rMinute = size * 0.265;
  const rHouseOuter = size * 0.215;
  const rHouseNumber = size * 0.195;
  const rHouseInner = size * 0.175;

  const ascLng = chart.angles?.Asc ?? 0;
  const angleFor = (L) => Math.PI - ((L - ascLng) * Math.PI / 180);

  // ── Boundary rings (solid dark gray rather than alpha-on-cream) ──
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, rOuter, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, rZodiacInner, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, rHouseOuter, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, rHouseInner, 0, Math.PI * 2); ctx.stroke();

  // ── Zodiac sign sectors and glyphs ──
  const signColors = ['#c83c3c', '#3c963c', '#beaa28', '#3264c8'];
  for (let i = 0; i < 12; i++) {
    const startLng = i * 30;
    const phiStart = angleFor(startLng);

    ctx.strokeStyle = '#555';
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

  // ── Whole-sign house cusps: extend through the planet area to the zodiac ring ──
  // so it's clear which house each planet sits in (the houses ring still holds
  // the numbers; the line just runs across both bands as one continuous cusp).
  const ascSignStart = Math.floor(ascLng / 30) * 30;
  const houseCusps = [];
  for (let i = 0; i < 12; i++) {
    houseCusps.push((ascSignStart + i * 30) % 360);
  }
  for (let i = 0; i < 12; i++) {
    const phi = angleFor(houseCusps[i]);
    if (i === 0 || i === 9) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.3;
    } else {
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 0.8;
    }
    ctx.beginPath();
    ctx.moveTo(cx + rHouseInner * Math.cos(phi), cy + rHouseInner * Math.sin(phi));
    ctx.lineTo(cx + rZodiacInner * Math.cos(phi), cy + rZodiacInner * Math.sin(phi));
    ctx.stroke();
  }

  // ── House numbers in the (now thinner) houses ring ──
  ctx.fillStyle = '#222';
  ctx.font = `bold ${Math.round(size * 0.024)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const midLng = (houseCusps[i] + 15) % 360;
    const phi = angleFor(midLng);
    ctx.fillText(String(i + 1), cx + rHouseNumber * Math.cos(phi), cy + rHouseNumber * Math.sin(phi));
  }

  // ── Aspect lines (chords of the inner houses ring; stay strictly inside) ──
  const placements = [];
  for (const planet of PLANETS) {
    const lng = chart.positions?.[planet.id];
    if (lng == null) continue;
    placements.push({ planet, lng, originalLng: lng });
  }

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
    lines.sort((x, y) => x.intensity - y.intensity);
    for (const { a, b, aspect, intensity } of lines) {
      const phiA = angleFor(a.originalLng);
      const phiB = angleFor(b.originalLng);
      const xA = cx + rHouseInner * Math.cos(phiA);
      const yA = cy + rHouseInner * Math.sin(phiA);
      const xB = cx + rHouseInner * Math.cos(phiB);
      const yB = cy + rHouseInner * Math.sin(phiB);
      ctx.strokeStyle = isHardAspect(aspect.angle) ? ASPECT_COLOR_HARD : ASPECT_COLOR_SOFT;
      ctx.lineWidth = 0.5 + intensity * 1.4;
      ctx.beginPath();
      ctx.moveTo(xA, yA);
      ctx.lineTo(xB, yB);
      ctx.stroke();
    }
  }

  // ── Helper: render planet/angle label stack at a longitude. ──
  // Glyph at rGlyph, deg° at rDegree, min' at rMinute — radial hierarchy,
  // always in line with the planet at its angle on the wheel.
  const drawBody = ({ phiOrig, phi, glyph, color, lng, glyphFontSize, isAngle }) => {
    // Tick on the inner edge of the zodiac ring at the exact longitude
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + rZodiacInner * Math.cos(phiOrig), cy + rZodiacInner * Math.sin(phiOrig));
    ctx.lineTo(cx + (rZodiacInner - 4) * Math.cos(phiOrig), cy + (rZodiacInner - 4) * Math.sin(phiOrig));
    ctx.stroke();
    // Connector for collision-displaced glyphs
    if (Math.abs((lng - (chart.positions?.[glyph] ?? lng))) > 0.5 && !isAngle) {
      // (no-op; we draw the connector below using the explicit displacement check)
    }
    // Glyph
    ctx.fillStyle = color;
    ctx.font = isAngle
      ? `bold ${Math.round(size * 0.030)}px sans-serif`
      : `bold ${Math.round(size * (glyphFontSize || 0.054))}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, cx + rGlyph * Math.cos(phi), cy + rGlyph * Math.sin(phi));

    // Degree° just inward from the glyph
    const signIdx = getSignIndex(lng);
    const inSign = lng - signIdx * 30;
    const deg = Math.floor(inSign);
    const min = Math.floor((inSign - deg) * 60);
    ctx.fillStyle = '#000';
    ctx.font = `bold ${Math.round(size * 0.026)}px sans-serif`;
    ctx.fillText(`${deg}°`, cx + rDegree * Math.cos(phi), cy + rDegree * Math.sin(phi));

    // Minute' further inward
    ctx.fillStyle = '#333';
    ctx.font = `${Math.round(size * 0.021)}px sans-serif`;
    ctx.fillText(`${String(min).padStart(2, '0')}'`, cx + rMinute * Math.cos(phi), cy + rMinute * Math.sin(phi));
  };

  // ── Build a single list of bodies (planets + angles) for shared spread. ──
  const bodies = placements.map(({ planet, originalLng }) => ({
    kind: 'planet',
    glyph: planet.symbol,
    color: planet.color,
    originalLng,
    lng: originalLng,
  }));
  if (chart.angles) {
    const ascLngA = chart.angles.Asc;
    const mcLngA = chart.angles.MC;
    const dscLngA = chart.angles.Dsc ?? (ascLngA != null ? (ascLngA + 180) % 360 : null);
    const icLngA = chart.angles.IC ?? (mcLngA != null ? (mcLngA + 180) % 360 : null);
    const pushAngle = (lng, label) => {
      if (lng == null) return;
      bodies.push({ kind: 'angle', glyph: label, color: '#000', originalLng: lng, lng });
    };
    pushAngle(ascLngA, 'AC');
    pushAngle(dscLngA, 'DC');
    pushAngle(mcLngA, 'MC');
    pushAngle(icLngA, 'IC');
  }

  // ── Per-sign collision spread covering planets and angles together so a
  // planet conjunct an angle pushes the angle aside (and vice versa). Margin
  // of 4° from each cusp keeps glyphs visually inside their sign sector;
  // minSep of 10° keeps glyph circles from overlapping.
  const margin = 4;
  const minSep = 10;
  const groups = new Map();
  for (const b of bodies) {
    const sign = Math.floor(((b.originalLng % 360) + 360) % 360 / 30);
    if (!groups.has(sign)) groups.set(sign, []);
    groups.get(sign).push(b);
  }
  for (const [sign, group] of groups) {
    const signStart = sign * 30 + margin;
    const signEnd = sign * 30 + 30 - margin;
    const span = Math.max(0, signEnd - signStart);
    group.sort((a, b) => a.originalLng - b.originalLng);
    const sep = Math.min(minSep, group.length > 1 ? span / (group.length - 1) : minSep);
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < group.length - 1; i++) {
        const cur = group[i];
        const nxt = group[i + 1];
        const gap = nxt.lng - cur.lng;
        if (gap < sep) {
          const push = (sep - gap) / 2;
          cur.lng -= push;
          nxt.lng += push;
        }
      }
      for (let i = 0; i < group.length; i++) {
        const minAllowed = signStart + i * sep;
        if (group[i].lng < minAllowed) group[i].lng = minAllowed;
      }
      for (let i = group.length - 1; i >= 0; i--) {
        const maxAllowed = signEnd - (group.length - 1 - i) * sep;
        if (group[i].lng > maxAllowed) group[i].lng = maxAllowed;
      }
    }
  }

  // ── Render planets first, then angles on top. ──
  const renderBody = (b) => {
    const phiOrig = angleFor(b.originalLng);
    const phi = angleFor(b.lng);
    if (Math.abs(b.lng - b.originalLng) > 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + (rZodiacInner - 4) * Math.cos(phiOrig), cy + (rZodiacInner - 4) * Math.sin(phiOrig));
      ctx.lineTo(cx + rGlyph * Math.cos(phi), cy + rGlyph * Math.sin(phi));
      ctx.stroke();
    }
    drawBody({
      phiOrig,
      phi,
      glyph: b.glyph,
      color: b.color,
      lng: b.originalLng,
      glyphFontSize: 0.054,
      isAngle: b.kind === 'angle',
    });
  };
  for (const b of bodies) if (b.kind === 'planet') renderBody(b);
  for (const b of bodies) if (b.kind === 'angle') renderBody(b);
}
