import { useEffect, useRef, useCallback } from 'react';
import { PLANET_MAP, SPEED_ORDER } from '../../data/planets';
import { getElementColor, getElementRGB, getSignIndex, ZODIAC_SIGNS } from '../../data/zodiac';
import { getLongitude } from '../../api/ephemeris';
import { isSweReady } from '../../api/swisseph';

export const PADDING = { top: 40, right: 30, bottom: 50, left: 55 };
const SIGN_CHANGE_EXTRA_BOTTOM = 30; // extra bottom padding when sign change labels are shown
const ROW_GAP = 16;
const MAX_ROW_HEIGHT = 300; // cap row height to keep curves readable even with few rows
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Default max curve height as fraction of HALF the row (used as fallback)
// Curves extend both above and below the centered baseline, so this ratio
// applies to half the row height.
const DEFAULT_CURVE_HEIGHT_RATIO = 0.40;

// Cluster-aware label placement constants
const CLUSTER_THRESHOLD_X = 40;       // px — peaks within this distance form a cluster
const COMPACT_GAP = 2;                // px between labels in a cluster column
const MAX_DISPLACEMENT_RATIO = 0.70;  // max label displacement as fraction of row height

export function useCanvasRenderer(canvasRef, { curves, signChanges, transitJobs, startDate, endDate, canvasW, canvasH, zoom, highlightPairRef, labelHitAreasRef, crowdedRowsRef, rowLayoutRef }) {
  // Store latest props in a ref so repaint() always sees current values
  const propsRef = useRef();
  propsRef.current = { curves, signChanges, transitJobs, startDate, endDate, canvasW, canvasH, zoom };

  // Expose a stable repaint function that reads current state from refs
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const { curves: c, signChanges: sc, transitJobs: tj, startDate: sd, endDate: ed, canvasW: cw, canvasH: ch, zoom: z } = propsRef.current;
    if (!canvas || !sd || !ed) return;
    renderCanvas(canvas, c, sc, tj, sd, ed, cw, ch, z, highlightPairRef?.current ?? null, labelHitAreasRef, crowdedRowsRef, rowLayoutRef);
  }, []); // stable — reads everything from refs

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !startDate || !endDate) return;

    // Coalesce rapid updates (e.g. zoom slider) into a single paint per frame
    const rafId = requestAnimationFrame(() => {
      renderCanvas(canvas, curves, signChanges, transitJobs, startDate, endDate, canvasW, canvasH, zoom, highlightPairRef?.current ?? null, labelHitAreasRef, crowdedRowsRef, rowLayoutRef);
    });
    return () => cancelAnimationFrame(rafId);

  }, [curves, signChanges, transitJobs, startDate, endDate, canvasW, canvasH]); // Note: highlightPairRef not a dep

  return repaint;
}

function renderCanvas(canvas, curves, signChanges, transitJobs, startDate, endDate, canvasW, canvasH, zoom, highlightPair, labelHitAreasRef, crowdedRowsRef, rowLayoutRef) {
    // Use explicit dimensions from parent (accounts for zoom) or fall back to element size
    const displayW = canvasW || canvas.offsetWidth;
    const displayH = canvasH || canvas.offsetHeight;

    if (displayW === 0 || displayH === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = displayW;
    const H = displayH;
    const hasAnySignChanges = signChanges?.changes?.length > 0;
    const hasAnyStations = signChanges?.stations?.length > 0;
    const bottomPad = PADDING.bottom + ((hasAnySignChanges || hasAnyStations) ? SIGN_CHANGE_EXTRA_BOTTOM : 0);
    const plotW = W - PADDING.left - PADDING.right;
    const totalPlotH = H - PADDING.top - bottomPad;

    // Background — offwhite
    ctx.fillStyle = '#f5f3ef';
    ctx.fillRect(0, 0, W, H);

    // Derive rows from curves' rowKey grouping.
    // Slower targets share one "main" row per job; faster targets each get their own row.
    const curvesByRow = {};
    const rowOrder = []; // preserve insertion order for stable layout
    if (curves) {
      for (const c of curves) {
        if (!curvesByRow[c.rowKey]) {
          curvesByRow[c.rowKey] = [];
          rowOrder.push({
            key: c.rowKey,
            rowPlanet: c.rowPlanet,
            rowTargetPlanet: c.rowTargetPlanet,
            jobId: c.jobId,
          });
        }
        curvesByRow[c.rowKey].push(c);
      }
    }
    // Inject rows for sign-change-only jobs (e.g. TrueNode with no targets,
    // or any planet with showSignChanges enabled but no active aspect curves).
    // Only inject when there's actual activity in the timeframe — otherwise
    // an empty row would be drawn for a planet with nothing happening.
    if (transitJobs) {
      const existingRowKeys = new Set(rowOrder.map(r => r.key));
      for (const job of transitJobs) {
        const wantsEclipses = job.transitPlanet === 'TrueNode' && (job.showEclipses ?? true);
        if (!job.showSignChanges && !job.showRetrogrades && !wantsEclipses) continue;
        const rowKey = `planet-${job.transitPlanet}`;
        if (existingRowKeys.has(rowKey)) continue;

        const planet = job.transitPlanet;
        const hasSignChange = signChanges?.changes?.some(c => c.planet === planet);
        const hasStation = signChanges?.stations?.some(s => s.planet === planet);
        const hasRetroPeriod = signChanges?.retrogradePeriods?.some(p => p.planet === planet);
        const hasEclipse = wantsEclipses && (signChanges?.eclipses?.length ?? 0) > 0;
        if (!hasSignChange && !hasStation && !hasRetroPeriod && !hasEclipse) continue;

        rowOrder.push({
          key: rowKey,
          rowPlanet: planet,
          rowTargetPlanet: null,
          jobId: job.id,
        });
        existingRowKeys.add(rowKey);
        if (!curvesByRow[rowKey]) curvesByRow[rowKey] = [];
      }
    }

    // Sort rows by planetary speed: slowest (Pluto) at top, fastest (Moon) at bottom.
    // Uses the rowPlanet's position in SPEED_ORDER — higher index = slower = top.
    rowOrder.sort((a, b) => SPEED_ORDER.indexOf(b.rowPlanet) - SPEED_ORDER.indexOf(a.rowPlanet));

    // Build set of row keys where sign COLORS are enabled (showSignChanges=ON).
    // Rows with only retrogrades (showSignChanges=OFF) get markers but no sign coloring.
    const signColorRows = new Set();
    if (transitJobs) {
      for (const job of transitJobs) {
        if (job.showSignChanges) {
          signColorRows.add(`planet-${job.transitPlanet}`);
        }
      }
    }

    const rows = rowOrder;
    const numRows = rows.length || 1;
    const totalGap = ROW_GAP * (numRows - 1);
    const rawRowH = (totalPlotH - totalGap) / numRows;
    // Cap row height so that 1-2 row views don't stretch curves into thin needles
    const rowH = Math.min(rawRowH, MAX_ROW_HEIGHT);
    // When capped, the rows don't fill the plot — center them vertically
    const usedH = numRows * rowH + totalGap;
    const rowOffsetY = Math.max(0, (totalPlotH - usedH) / 2);

    // Draw time grid — grid lines and axis labels follow the row area
    const rowAreaTop = PADDING.top + rowOffsetY;
    const rowAreaBottom = rowAreaTop + usedH;
    drawTimeGrid(ctx, W, H, plotW, totalPlotH, startDate, endDate, rowAreaTop, rowAreaBottom, zoom);

    // Collect all placed label hit areas across rows (for hover hit-testing)
    const allPlacedLabels = [];
    // Collect overcrowded row positions for DOM overlay
    const crowdedRows = [];
    // Collect row layout info for DOM-based Y-axis labels
    const rowLayouts = [];

    // Draw each row
    rows.forEach((row, rowIdx) => {
      const rowTop = PADDING.top + rowOffsetY + rowIdx * (rowH + ROW_GAP);
      const rowCurves = curvesByRow[row.key] || [];

      // Record layout for DOM overlay Y-axis labels
      rowLayouts.push({ rowTop, rowH, rowPlanet: row.rowPlanet });

      // Row separator line — full width including Y-axis area
      if (rowIdx > 0) {
        const sepY = rowTop - ROW_GAP / 2;
        ctx.beginPath();
        ctx.moveTo(0, sepY);
        ctx.lineTo(PADDING.left + plotW, sepY);
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Row baseline & sign-color segments
      const rowSignChanges = signChanges?.changes?.filter(sc => sc.rowKey === row.key) || [];
      // Sign colors only apply when showSignChanges is ON for this row's planet
      const hasSignColors = signColorRows.has(row.key) &&
        (rowSignChanges.length > 0 || signChanges?.initialSigns?.[row.key] != null);
      const isEclipseRow = row.rowPlanet === 'TrueNode';

      // Build sign-color segment boundaries for this row (used by baseline + curves)
      let signSegments = null; // array of { startX, endX, signIndex }
      const baselineY = rowTop + rowH / 2; // centered baseline

      // Filter retrograde periods for this row
      const rowRetrogradePeriods = signChanges?.retrogradePeriods?.filter(rp => rp.rowKey === row.key) || [];

      if (hasSignColors) {
        signSegments = buildSignSegments(rowSignChanges, signChanges.initialSigns[row.key], plotW, startDate, endDate);
        // Eclipse row: NO baseline — data is centered where baseline would be
        if (!isEclipseRow) {
          drawElementColoredBaseline(ctx, signSegments, plotW, baselineY, null, startDate, endDate);
        }
      } else if (!isEclipseRow) {
        // Bolder baseline when row has retrograde/station data to match sign-colored style
        const hasRetroData = rowRetrogradePeriods.length > 0;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, baselineY);
        ctx.lineTo(PADDING.left + plotW, baselineY);
        ctx.strokeStyle = hasRetroData ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.12)';
        ctx.lineWidth = hasRetroData ? 2 : 0.5;
        ctx.stroke();
      }

      // (Y-axis planet glyphs are rendered as sticky DOM overlays — see TransitCanvas)

      // Pre-compute sign change bounding rects for label collision avoidance
      // (markers are drawn AFTER curves so they render on top and aren't obscured by fills)
      let signChangeRects = [];
      if (rowSignChanges.length > 0) {
        signChangeRects = computeSignChangeRects(ctx, rowSignChanges, plotW, baselineY, startDate, endDate, isEclipseRow);
      }

      // Draw aspect curves within this row, collecting peak labels.
      // When a pair is highlighted, dim non-matching curves.
      const rowLabels = [];
      for (const curve of rowCurves) {
        const pairKey = `${curve.transitPlanet}-${curve.target}`;
        const dimmed = highlightPair != null && pairKey !== highlightPair;
        const highlighted = highlightPair != null && pairKey === highlightPair;
        drawAspectCurve(ctx, curve, plotW, rowH, rowTop, startDate, endDate, rowLabels, dimmed, highlighted, signSegments, baselineY, signChanges?.eclipses);
      }

      // Redraw baseline with dashed pattern for retrograde periods ON TOP of curves.
      // The curve stroke at intensity=0 draws along the baseline, covering any
      // pre-drawn dashes — so we must: (1) erase the baseline in retrograde sections
      // using the background color, then (2) redraw with dashes on top.
      if (rowRetrogradePeriods.length > 0 && !isEclipseRow) {
        const ox = PADDING.left;
        // Erase just the solid baseline stroke in retrograde sections so
        // the dashed redraw isn't fighting the solid line.  Use a narrow
        // band (±1.5 px) that clears the 2 px solid stroke without
        // destroying curve fills that descend to the baseline.
        ctx.save();
        for (const rp of rowRetrogradePeriods) {
          const rpStartX = dateToX(rp.startDate, startDate, endDate, plotW);
          const rpEndX = dateToX(rp.endDate, startDate, endDate, plotW);
          ctx.fillStyle = '#f5f3ef';
          ctx.fillRect(ox + rpStartX, baselineY - 1.5, rpEndX - rpStartX, 3);
        }
        ctx.restore();
        // Redraw dashed baseline on top (overdraw pass: higher opacity, only retrograde sections)
        if (signSegments) {
          drawElementColoredBaseline(ctx, signSegments, plotW, baselineY, rowRetrogradePeriods, startDate, endDate, true);
        } else {
          const subSegs = splitByRetrograde(0, plotW, rowRetrogradePeriods, startDate, endDate, plotW);
          ctx.save();
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 2.5;
          for (const sub of subSegs) {
            if (!sub.retrograde) continue; // only redraw retrograde sections
            ctx.beginPath();
            ctx.setLineDash([6, 4]);
            ctx.moveTo(PADDING.left + sub.startX, baselineY);
            ctx.lineTo(PADDING.left + sub.endX, baselineY);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Draw sign change markers ON TOP of curves (text-only, below baseline)
      if (rowSignChanges.length > 0) {
        drawSignChangeMarkers(ctx, rowSignChanges, plotW, rowH, rowTop, startDate, endDate, baselineY, isEclipseRow);
      }

      // Draw station markers ON TOP of curves (diamonds + labels below baseline)
      const rowStations = signChanges?.stations?.filter(s => s.rowKey === row.key) || [];
      let stationRects = [];
      if (rowStations.length > 0) {
        stationRects = computeStationRects(ctx, rowStations, plotW, baselineY, startDate, endDate);
        drawStationMarkers(ctx, rowStations, plotW, rowH, rowTop, startDate, endDate, baselineY);
      }

      // Draw eclipse markers for the Eclipses row
      if (isEclipseRow) {
        const rowEclipses = signChanges?.eclipses?.filter(e => e.rowKey === row.key) || [];
        if (rowEclipses.length > 0) {
          const eclipseRects = drawEclipseMarkers(ctx, rowEclipses, plotW, rowH, rowTop, startDate, endDate, baselineY, signChangeRects);
          signChangeRects.push(...eclipseRects);
        }
      }

      // Merge all reserved rects for peak label collision avoidance
      const allReservedRects = [...signChangeRects, ...stationRects];

      // Check if any cluster in this row would stack more than 3 labels
      const overcrowded = isRowOvercrowded(rowLabels);

      if (overcrowded) {
        // Record row position for DOM overlay (no canvas drawing)
        crowdedRows.push({ rowTop, rowH });
      } else {
        // Draw peak labels with cluster-aware collision avoidance
        // Pass all reserved rects so aspect labels avoid ingress + station markers
        const placedInRow = drawPeakLabels(ctx, rowLabels, plotW, rowTop, rowH, allReservedRects);
        allPlacedLabels.push(...placedInRow);
      }
    });

    // ── "Now" line — vertical marker at the current date/time ──
    // Label sits below all axis labels: day (+12), month (+16), year (+32).
    const now = new Date();
    if (now > startDate && now < endDate) {
      const nowX = PADDING.left + dateToX(now, startDate, endDate, plotW);
      const nowLabelY = rowAreaBottom + 46;
      ctx.save();
      // Line spans from row area top down to the label
      ctx.beginPath();
      ctx.moveTo(nowX, rowAreaTop);
      ctx.lineTo(nowX, nowLabelY - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.70)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // "Now" label at the bottom of the line
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText('Now', nowX, nowLabelY);
      ctx.restore();
    }

    // Export placed label hit areas so TransitCanvas can use them for hover
    if (labelHitAreasRef) {
      labelHitAreasRef.current = allPlacedLabels;
    }

    // Export overcrowded row positions for DOM overlay
    if (crowdedRowsRef) {
      crowdedRowsRef.current = crowdedRows;
    }

    // Export row layout info for DOM-based Y-axis labels
    if (rowLayoutRef) {
      rowLayoutRef.current = rowLayouts;
    }

}

// ─── Sign-color segment builder ───

/**
 * Build an array of { startX, endX, signIndex } segments from sign changes.
 * startX/endX are pixel offsets within plotW (0-based, add PADDING.left for canvas coords).
 */
function buildSignSegments(changes, initialSignIndex, plotW, startDate, endDate) {
  const sorted = [...changes].sort((a, b) => a.date - b.date);
  const segments = [];
  let currentSign = initialSignIndex ?? 0;
  let segStartX = 0;

  for (const sc of sorted) {
    const changeX = dateToX(sc.date, startDate, endDate, plotW);
    if (changeX > segStartX) {
      segments.push({ startX: segStartX, endX: changeX, signIndex: currentSign });
    }
    segStartX = changeX;
    currentSign = sc.signIndex;
  }

  // Final segment
  if (segStartX < plotW) {
    segments.push({ startX: segStartX, endX: plotW, signIndex: currentSign });
  }

  return segments;
}

/**
 * Look up which sign index applies at a given x offset within plotW.
 */
function signIndexAtX(signSegments, x) {
  if (!signSegments) return null;
  for (const seg of signSegments) {
    if (x >= seg.startX && x < seg.endX) return seg.signIndex;
  }
  // Past the end — use last segment
  return signSegments.length > 0 ? signSegments[signSegments.length - 1].signIndex : null;
}

// ─── Element-colored baseline ───

/**
 * Split a pixel range [startX, endX] into sub-segments that are either
 * inside or outside retrograde periods, so each can be drawn solid or dashed.
 * Returns array of { startX, endX, retrograde: boolean }.
 */
function splitByRetrograde(startX, endX, retrogradePeriods, startDate, endDate, plotW) {
  if (!retrogradePeriods || retrogradePeriods.length === 0) {
    return [{ startX, endX, retrograde: false }];
  }

  // Convert retrograde periods to pixel ranges
  const retroRanges = retrogradePeriods.map(rp => ({
    startX: dateToX(rp.startDate, startDate, endDate, plotW),
    endX: dateToX(rp.endDate, startDate, endDate, plotW),
  })).sort((a, b) => a.startX - b.startX);

  const result = [];
  let cursor = startX;

  for (const rr of retroRanges) {
    if (rr.endX <= cursor || rr.startX >= endX) continue;

    const rStart = Math.max(rr.startX, cursor);
    const rEnd = Math.min(rr.endX, endX);

    // Direct segment before this retrograde period
    if (rStart > cursor) {
      result.push({ startX: cursor, endX: rStart, retrograde: false });
    }

    // Retrograde segment
    result.push({ startX: rStart, endX: rEnd, retrograde: true });
    cursor = rEnd;
  }

  // Trailing direct segment
  if (cursor < endX) {
    result.push({ startX: cursor, endX, retrograde: false });
  }

  return result;
}

function drawElementColoredBaseline(ctx, signSegments, plotW, baselineY, retrogradePeriods, startDate, endDate, isOverdraw = false) {
  const ox = PADDING.left;
  const LINE_W = isOverdraw ? 2.5 : 2;
  // When overdrawing on top of curves, use higher opacity so dashes are clearly visible
  const opacity = isOverdraw ? 0.90 : 0.65;

  ctx.save();
  ctx.lineWidth = LINE_W;

  for (const seg of signSegments) {
    const subSegs = splitByRetrograde(seg.startX, seg.endX, retrogradePeriods, startDate, endDate, plotW);
    for (const sub of subSegs) {
      if (isOverdraw && !sub.retrograde) continue; // overdraw pass: only redraw retrograde sections
      ctx.beginPath();
      if (sub.retrograde) {
        ctx.setLineDash([6, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.moveTo(ox + sub.startX, baselineY);
      ctx.lineTo(ox + sub.endX, baselineY);
      ctx.strokeStyle = getElementColor(seg.signIndex, opacity);
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Sign change rect computation (no drawing — for label collision avoidance) ───

function computeSignChangeRects(ctx, changes, plotW, baselineY, startDate, endDate, isEclipseRow = false) {
  const ox = PADDING.left;
  const SC_GLYPH_FONT = '600 14px "Apple Symbols", "Segoe UI Symbol", Inter, system-ui, sans-serif';
  const SC_DATE_FONT = '600 11px Inter, system-ui, sans-serif';
  const SC_PAD = 4;
  const SOUTH_NODE_SYMBOL = '\u260B';

  const reservedRects = [];

  for (const sc of changes) {
    const x = ox + dateToX(sc.date, startDate, endDate, plotW);
    const isDualNode = sc.southSignIndex != null;
    const d = sc.date;
    const dateLine = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    const planetSymbol = PLANET_MAP[sc.planet]?.symbol || '';

    ctx.font = SC_DATE_FONT;
    const dateW = ctx.measureText(dateLine).width;

    ctx.font = SC_GLYPH_FONT;
    const arrowStr = `${planetSymbol}\u2192`;
    const arrowW = ctx.measureText(arrowStr).width;
    const signW = ctx.measureText(sc.signSymbol).width;
    const northTotalW = arrowW + signW;

    let southTotalW = 0;
    // Compute total label height: date(13) + glyph(16) [+ south glyph(16)]
    let labelBlockH = 13 + 16;
    if (isDualNode) {
      const southArrowStr = `${SOUTH_NODE_SYMBOL}\u2192`;
      const southArrowW = ctx.measureText(southArrowStr).width;
      const southSignW = ctx.measureText(sc.southSignSymbol).width;
      southTotalW = southArrowW + southSignW;
      labelBlockH = 13 + 16 + 16;
    }

    const maxLabelW = Math.max(dateW, northTotalW, southTotalW);
    const halfW = maxLabelW / 2 + SC_PAD;

    if (isEclipseRow) {
      // Eclipse row: labels centered at baselineY
      const rectTop = baselineY - labelBlockH / 2;
      reservedRects.push({
        left: x - halfW,
        right: x + halfW,
        top: rectTop - SC_PAD,
        bottom: rectTop + labelBlockH + SC_PAD,
      });
    } else {
      // Normal row: labels below baseline
      const labelTop = baselineY + 10;
      const bottomEdge = labelTop + labelBlockH;
      reservedRects.push({
        left: x - halfW,
        right: x + halfW,
        top: baselineY - SC_PAD,
        bottom: bottomEdge + SC_PAD,
      });
    }
  }

  return reservedRects;
}

// ─── Sign change markers on baseline ───

/**
 * Draw sign change markers on top of curves.
 */
function drawSignChangeMarkers(ctx, changes, plotW, rowH, rowTop, startDate, endDate, baselineY, isEclipseRow = false) {
  const ox = PADDING.left;
  const SC_GLYPH_FONT = '600 14px "Apple Symbols", "Segoe UI Symbol", Inter, system-ui, sans-serif';
  const SC_DATE_FONT = '600 11px Inter, system-ui, sans-serif';
  const SOUTH_NODE_SYMBOL = '\u260B'; // ☋

  ctx.save();

  for (const sc of changes) {
    const x = ox + dateToX(sc.date, startDate, endDate, plotW);
    const [r, g, b] = getElementRGB(sc.signIndex);
    const isDualNode = sc.southSignIndex != null;

    const d = sc.date;
    const dateLine = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    const planetSymbol = PLANET_MAP[sc.planet]?.symbol || '';

    // Compute total label block height: date(13) + glyph(16) [+ south glyph(16)]
    const labelBlockH = isDualNode ? (13 + 16 + 16) : (13 + 16);

    // Eclipse row: center label block at baselineY (no connector line)
    // Normal row: labels below baseline with connector
    const labelTop = isEclipseRow
      ? baselineY - labelBlockH / 2
      : baselineY + 10;

    if (!isEclipseRow) {
      // Thin short connector line from baseline down to labels
      ctx.beginPath();
      ctx.moveTo(x, baselineY + 2);
      ctx.lineTo(x, labelTop);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.35)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Date line
    ctx.font = SC_DATE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillText(dateLine, x, labelTop);

    // ─── North Node glyph line ───
    ctx.font = SC_GLYPH_FONT;
    ctx.textBaseline = 'top';
    const arrowStr = `${planetSymbol}\u2192`;
    const arrowW = ctx.measureText(arrowStr).width;
    const signW = ctx.measureText(sc.signSymbol).width;
    const northTotalW = arrowW + signW;
    const northStartX = x - northTotalW / 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
    ctx.fillText(arrowStr, northStartX, labelTop + 13);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillText(sc.signSymbol, northStartX + arrowW, labelTop + 13);

    // ─── South Node glyph line (only for dual node markers) ───
    if (isDualNode) {
      const [sr, sg, sb] = getElementRGB(sc.southSignIndex);
      const southArrowStr = `${SOUTH_NODE_SYMBOL}\u2192`;
      const southArrowW = ctx.measureText(southArrowStr).width;
      const southSignW = ctx.measureText(sc.southSignSymbol).width;
      const southTotalW = southArrowW + southSignW;
      const southStartX = x - southTotalW / 2;

      const southLineY = labelTop + 13 + 16;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
      ctx.fillText(southArrowStr, southStartX, southLineY);
      ctx.fillStyle = `rgb(${sr}, ${sg}, ${sb})`;
      ctx.fillText(sc.southSignSymbol, southStartX + southArrowW, southLineY);
    }
  }

  ctx.restore();
}

// ─── Station marker rect computation (for label collision avoidance) ───

function computeStationRects(ctx, stations, plotW, baselineY, startDate, endDate) {
  const ox = PADDING.left;
  const MARKER_R = 5;
  const ST_DATE_FONT = '600 11px Inter, system-ui, sans-serif';
  const ST_GLYPH_FONT = '600 14px "Apple Symbols", "Segoe UI Symbol", Inter, system-ui, sans-serif';
  const SC_PAD = 4;

  const reservedRects = [];

  for (const st of stations) {
    const x = ox + dateToX(st.date, startDate, endDate, plotW);
    const d = st.date;
    const dateLine = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    const planetSymbol = PLANET_MAP[st.planet]?.symbol || '';
    const stationLabel = st.type === 'retrograde' ? '℞' : 'D';

    ctx.font = ST_DATE_FONT;
    const dateW = ctx.measureText(dateLine).width;

    ctx.font = ST_GLYPH_FONT;
    const glyphStr = `${planetSymbol}${stationLabel}`;
    const glyphW = ctx.measureText(glyphStr).width;

    const maxLabelW = Math.max(dateW, glyphW);
    const halfW = maxLabelW / 2 + SC_PAD;

    // Station labels go BELOW baseline (same side as sign ingresses)
    const labelTop = baselineY + 10; // same offset as sign change labels
    const bottomEdge = labelTop + 13 + 16; // date line + glyph line

    reservedRects.push({
      left: x - halfW,
      right: x + halfW,
      top: baselineY - MARKER_R - SC_PAD,
      bottom: bottomEdge + SC_PAD,
    });
  }

  return reservedRects;
}

// ─── Station markers on baseline (diamonds + labels below) ───

function drawStationMarkers(ctx, stations, plotW, rowH, rowTop, startDate, endDate, baselineY) {
  const ox = PADDING.left;
  const MARKER_R = 5;
  const ST_GLYPH_FONT = '600 14px "Apple Symbols", "Segoe UI Symbol", Inter, system-ui, sans-serif';
  const ST_DATE_FONT = '600 11px Inter, system-ui, sans-serif';

  ctx.save();

  for (const st of stations) {
    const x = ox + dateToX(st.date, startDate, endDate, plotW);
    const [r, g, b] = getElementRGB(st.signIndex);

    // Mask baseline behind the diamond
    ctx.beginPath();
    ctx.rect(x - MARKER_R - 1, baselineY - 1.5, (MARKER_R + 1) * 2, 3);
    ctx.fillStyle = '#f5f3ef';
    ctx.fill();

    // Diamond marker — opaque fill in sign element color
    ctx.beginPath();
    ctx.moveTo(x, baselineY - MARKER_R);
    ctx.lineTo(x + MARKER_R, baselineY);
    ctx.lineTo(x, baselineY + MARKER_R);
    ctx.lineTo(x - MARKER_R, baselineY);
    ctx.closePath();
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fill();

    // Labels BELOW the baseline
    const d = st.date;
    const dateLine = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    const planetSymbol = PLANET_MAP[st.planet]?.symbol || '';
    const stationLabel = st.type === 'retrograde' ? '℞' : 'D';

    // Thin short connector line from diamond down to labels
    const labelTop = baselineY + 10;
    ctx.beginPath();
    ctx.moveTo(x, baselineY + MARKER_R);
    ctx.lineTo(x, labelTop);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Date line
    ctx.font = ST_DATE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillText(dateLine, x, labelTop);

    // Glyph line (planet symbol + station type) — below date
    ctx.font = ST_GLYPH_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillText(`${planetSymbol}${stationLabel}`, x, labelTop + 13);
  }

  ctx.restore();
}

// ─── Eclipse markers ───

/**
 * Draw eclipse event markers in the Eclipses row.
 * Returns array of reservation rects for collision avoidance.
 */
function drawEclipseMarkers(ctx, eclipses, plotW, rowH, rowTop, startDate, endDate, baselineY, existingRects) {
  const ox = PADDING.left;
  const EC_TEXT_FONT = '600 11px Inter, system-ui, sans-serif';
  const EC_SIGN_FONT = '600 14px "Apple Symbols", "Segoe UI Symbol", Inter, system-ui, sans-serif';
  const GLYPH_R = 9;
  const LABEL_H = 46; // height of one label block (date + type + sign)
  const LABEL_PAD = 4; // gap between label edge and glyph edge
  const placedRects = []; // all reserved rects (glyphs + labels)

  // Helper: check if a rect collides with any already-placed rect or existing rects
  function collides(testRect) {
    const all = [...existingRects, ...placedRects];
    return all.some(r2 =>
      testRect.left < r2.right && testRect.right > r2.left &&
      testRect.top < r2.bottom && testRect.bottom > r2.top
    );
  }

  // Helper: build a label rect
  function makeRect(cx, halfW, top) {
    return { left: cx - halfW, right: cx + halfW, top, bottom: top + LABEL_H };
  }

  // Helper: draw the 3-line label block (date, type, sign) centred at labelX
  function drawLabel(labelX, topY, dateLine, typeLabel, r, g, b, signSymbol) {
    const dateY = topY + 13;
    const typeY = topY + 27;
    const signY = topY + 32;

    ctx.font = EC_TEXT_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillText(dateLine, labelX, dateY);
    ctx.fillText(typeLabel, labelX, typeY);

    ctx.font = EC_SIGN_FONT;
    ctx.textBaseline = 'top';
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillText(signSymbol, labelX, signY);
  }

  // Helper: draw a dashed leader line from label to glyph
  function drawLeader(fromX, fromY, toX, toY) {
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 1;
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();

  for (const ec of eclipses) {
    const x = ox + dateToX(ec.date, startDate, endDate, plotW);
    if (x < ox - 30 || x > ox + plotW + 30) continue;

    ctx.font = EC_TEXT_FONT;
    const typeLabel = ec.type === 'solar' ? 'Solar Eclipse' : 'Lunar Eclipse';
    const textHalfW = Math.max(ctx.measureText(typeLabel).width, 40) / 2 + 4;
    const [r, g, b] = getElementRGB(ec.signIndex);

    // ── Glyph always at baseline ──
    const glyphCy = baselineY;
    if (ec.type === 'solar') {
      drawSolarEclipseGlyph(ctx, x, glyphCy, GLYPH_R);
    } else {
      drawLunarEclipseGlyph(ctx, x, glyphCy, GLYPH_R);
    }
    placedRects.push({
      left: x - GLYPH_R - 2, right: x + GLYPH_R + 2,
      top: glyphCy - GLYPH_R - 2, bottom: glyphCy + GLYPH_R + 2,
    });

    const d = ec.date;
    const dateLine = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

    // ── Progressive label placement ──
    // Priority 1: directly above glyph (centred on x)
    // Priority 2: directly below glyph (centred on x)
    // Priority 3+: nudge sideways at above/below Y positions until a slot is found
    const aboveTop = glyphCy - GLYPH_R - LABEL_PAD - LABEL_H;
    const belowTop = glyphCy + GLYPH_R + LABEL_PAD;
    const NUDGE_STEP = textHalfW * 2 + 6; // horizontal shift per nudge attempt

    let placed = false;

    // Allow labels to extend past row bounds by up to one label-height. The
    // eclipse row is typically the topmost (slowest planet), and its label
    // stack is tall (46px) — strict row clipping was hiding labels in short
    // viewports. Collision detection still prevents overlap with sign-change
    // labels in the same row.
    const overflowSlack = LABEL_H + 8;
    const minTop = rowTop - overflowSlack;
    const maxBottom = rowTop + rowH + overflowSlack;

    // Phase 1 & 2: try centred above, then centred below
    for (const tryTop of [aboveTop, belowTop]) {
      const tryBottom = tryTop + LABEL_H;
      if (tryTop < minTop || tryBottom > maxBottom) continue;
      const rect = makeRect(x, textHalfW, tryTop);
      if (!collides(rect)) {
        drawLabel(x, tryTop, dateLine, typeLabel, r, g, b, ec.signSymbol);
        placedRects.push(rect);
        placed = true;
        break;
      }
    }

    // Phase 3: nudge sideways — try above Y then below Y, shifting left/right
    if (!placed) {
      for (let nudge = 1; nudge <= 4 && !placed; nudge++) {
        for (const yTop of [aboveTop, belowTop]) {
          if (yTop < minTop || yTop + LABEL_H > maxBottom) continue;
          // Try right, then left
          for (const dir of [1, -1]) {
            const labelX = x + dir * nudge * NUDGE_STEP;
            // Keep label within plot area
            if (labelX - textHalfW < ox - 10 || labelX + textHalfW > ox + plotW + 10) continue;

            const rect = makeRect(labelX, textHalfW, yTop);
            if (!collides(rect)) {
              // Draw dashed leader line from label centre-bottom (or top) to glyph
              const isAbove = yTop < glyphCy;
              if (isAbove) {
                drawLeader(labelX, yTop + LABEL_H, x, glyphCy - GLYPH_R - 1);
              } else {
                drawLeader(labelX, yTop, x, glyphCy + GLYPH_R + 1);
              }
              drawLabel(labelX, yTop, dateLine, typeLabel, r, g, b, ec.signSymbol);
              placedRects.push(rect);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
    }

    // If still nothing fit, skip label — glyph still visible
  }

  ctx.restore();
  return placedRects;
}

/**
 * Draw a solar eclipse glyph: black moon disc sliding over a bright sun disc.
 * The sun (back) peeks out from the right side only.
 * Black circle in front, golden/orange circle behind visible on one edge.
 */
function drawSolarEclipseGlyph(ctx, cx, cy, r) {
  ctx.save();

  // Red sun (back) peeks from the left, black moon (front) covers most of it.
  // White separator line only visible where the two circles overlap.
  const peekOffset = r * 0.55;

  // Sun glow halo (behind everything) — crimson red glow
  const glowR = r + 5;
  const glow = ctx.createRadialGradient(cx - peekOffset, cy, r * 0.5, cx - peekOffset, cy, glowR);
  glow.addColorStop(0, 'rgba(220, 40, 40, 0.18)');
  glow.addColorStop(0.6, 'rgba(200, 30, 30, 0.10)');
  glow.addColorStop(1, 'rgba(180, 20, 20, 0)');
  ctx.beginPath();
  ctx.arc(cx - peekOffset, cy, glowR, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Sun disc (back, peeking from left) — crimson red
  ctx.beginPath();
  ctx.arc(cx - peekOffset, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#dc3545';
  ctx.fill();

  // Brighter highlight on the sun
  const sunHighlight = ctx.createRadialGradient(cx - peekOffset + r * 0.2, cy - r * 0.2, 0, cx - peekOffset, cy, r);
  sunHighlight.addColorStop(0, 'rgba(255, 90, 90, 0.35)');
  sunHighlight.addColorStop(1, 'rgba(220, 40, 40, 0)');
  ctx.beginPath();
  ctx.arc(cx - peekOffset, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = sunHighlight;
  ctx.fill();

  // Moon disc (front) — near-black
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();

  // White separator line — clip to the red sun area so white only shows at overlap
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx - peekOffset, cy, r, 0, Math.PI * 2);
  ctx.clip();
  // Now stroke the moon edge; only the part inside the sun clip region is visible
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * Draw a lunar eclipse glyph: a black-outlined circle with a white interior
 * and a crimson red crescent creeping in from one side — like a waxing moon
 * phase but the shadow is red. White = moon surface, red = eclipse shadow.
 */
function drawLunarEclipseGlyph(ctx, cx, cy, r) {
  ctx.save();

  // Clip everything to the main circle boundary
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Fill the entire circle white (the moon surface)
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#d8d8e0';
  ctx.fill();

  // Draw the crimson red crescent on the right side (the eclipse shadow creeping in).
  // Uses waxing-gibbous moon phase technique — the red portion sits on the right.
  const phase = 0.75; // how much of the circle the red fills — lower = bigger white crescent
  ctx.beginPath();
  // Right half-circle (red shadow)
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
  // Elliptical curve back — k controls the crescent width
  const k = 2 * phase - 1; // 0.7 for phase 0.85
  ctx.ellipse(cx, cy, r * k, r, 0, Math.PI / 2, -Math.PI / 2, false);
  ctx.closePath();
  ctx.fillStyle = '#dc3545';
  ctx.fill();

  ctx.restore();

  // Black outline of the full circle (drawn outside clip so it's complete)
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ─── Row Y-axis label ───

function drawRowLabelSingle(ctx, planetId, rowTop, rowH) {
  const p = PLANET_MAP[planetId];
  if (!p) return;

  const cx = PADDING.left / 2;
  const cy = rowTop + rowH / 2;

  ctx.save();
  ctx.font = '26px "Apple Symbols", "Segoe UI Symbol", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Normalize glyph weight: stroke + fill gives uniform thickness
  ctx.lineWidth = 0.6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.40)';
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.strokeText(p.symbol, cx, cy);
  ctx.fillText(p.symbol, cx, cy);
  ctx.restore();
}


// ─── Time grid ───

function drawTimeGrid(ctx, W, H, plotW, plotH, startDate, endDate, rowAreaTop, rowAreaBottom, zoom) {
  const ox = PADDING.left;
  // Use row area bounds for grid lines & labels (defaults to full plot area)
  const gridTop = rowAreaTop ?? PADDING.top;
  const gridBottom = rowAreaBottom ?? (PADDING.top + plotH);
  const oy = PADDING.top;
  const totalMs = endDate - startDate;
  const totalDays = totalMs / 86400000;
  const pixelsPerDay = plotW / totalDays;

  // ── Daily grid (batched into a single path for performance) ──
  const showDays = pixelsPerDay >= 8;
  const showDayLabels = pixelsPerDay >= 12;

  if (showDays) {
    // Weekend shading — only when day labels are visible (zoomed enough to
    // read individual days), so weeks read as visual rhythm.
    if (showDayLabels) {
      const shadeCursor = new Date(startDate);
      shadeCursor.setHours(0, 0, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.035)';
      while (shadeCursor <= endDate) {
        const dow = shadeCursor.getDay(); // 0=Sun, 6=Sat
        if (dow === 0 || dow === 6) {
          const x0 = ox + dateToX(shadeCursor, startDate, endDate, plotW);
          const next = new Date(shadeCursor);
          next.setDate(next.getDate() + 1);
          const x1 = ox + dateToX(next > endDate ? endDate : next, startDate, endDate, plotW);
          ctx.fillRect(x0, gridTop, x1 - x0, gridBottom - gridTop);
        }
        shadeCursor.setDate(shadeCursor.getDate() + 1);
      }
    }

    ctx.beginPath();
    const dayCursor = new Date(startDate);
    dayCursor.setHours(0, 0, 0, 0);
    while (dayCursor <= endDate) {
      if (dayCursor.getDate() !== 1) {
        const cx = ox + dateToX(dayCursor, startDate, endDate, plotW);
        ctx.moveTo(cx, gridTop);
        ctx.lineTo(cx, gridBottom);
      }
      dayCursor.setDate(dayCursor.getDate() + 1);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Day-of-month labels (only when zoomed in far enough)
    if (showDayLabels) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';

      // When the window doesn't start on the 1st, the very first day label
      // would be a bare number right at the left edge (half-clipped).
      // Instead, show the month abbreviation (e.g. "Feb") — the exact day
      // can be inferred from the next visible day number.
      const startDom = startDate.getDate();
      let leftEdgeReserved = ox; // right edge of the month abbreviation at left (if any)
      if (startDom !== 1) {
        const monthAbbr = MONTH_NAMES[startDate.getMonth()];
        ctx.textAlign = 'left';
        const abbrW = ctx.measureText(monthAbbr).width;
        ctx.fillText(monthAbbr, ox + 2, gridBottom + 12);
        ctx.textAlign = 'center';
        leftEdgeReserved = ox + 2 + abbrW + 4; // text + small gap
      }

      const labelCursor = new Date(startDate);
      labelCursor.setHours(0, 0, 0, 0);
      // Skip the very first day — we already drew the month label for it
      if (startDom !== 1) {
        labelCursor.setDate(labelCursor.getDate() + 1);
      }
      while (labelCursor <= endDate) {
        const dom = labelCursor.getDate();
        if (dom !== 1) {
          const cx = ox + dateToX(labelCursor, startDate, endDate, plotW);
          // Skip day labels that would overlap the left-edge month abbreviation
          const dayLabelHalfW = ctx.measureText(String(dom)).width / 2;
          if (cx - dayLabelHalfW < leftEdgeReserved) {
            labelCursor.setDate(labelCursor.getDate() + 1);
            continue;
          }
          ctx.fillText(String(dom), cx, gridBottom + 12);
        }
        labelCursor.setDate(labelCursor.getDate() + 1);
      }
    }
  }

  // ── Hourly grid (when zoomed in close enough to days view) ──
  // Progressive detail: 6h → 3h → 1h intervals as pixelsPerDay increases.
  let hourInterval = null;
  let showHourLabels = false;

  if (pixelsPerDay >= 600) {
    hourInterval = 1;   // every hour
    showHourLabels = true;
  } else if (pixelsPerDay >= 300) {
    hourInterval = 3;   // every 3 hours
    showHourLabels = true;
  } else if (pixelsPerDay >= 150) {
    hourInterval = 6;   // every 6 hours
    showHourLabels = true;
  } else if (pixelsPerDay >= 80) {
    hourInterval = 6;   // 6-hour lines only, no labels
    showHourLabels = false;
  }

  if (hourInterval != null) {
    const hourTicks = []; // collect for labels
    ctx.beginPath();

    // Iterate through each day in the range and place hour ticks
    const dayCursorH = new Date(startDate);
    dayCursorH.setHours(0, 0, 0, 0);

    while (dayCursorH <= endDate) {
      for (let h = hourInterval; h < 24; h += hourInterval) {
        const hourDate = new Date(dayCursorH);
        hourDate.setHours(h, 0, 0, 0);
        if (hourDate < startDate || hourDate > endDate) continue;
        const cx = ox + dateToX(hourDate, startDate, endDate, plotW);
        if (cx > ox && cx < ox + plotW) {
          ctx.moveTo(cx, gridTop);
          ctx.lineTo(cx, gridBottom);
          if (showHourLabels) {
            hourTicks.push({ x: cx, hour: h });
          }
        }
      }
      dayCursorH.setDate(dayCursorH.getDate() + 1);
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.035)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Hour labels — smaller and lighter than day labels to keep visual hierarchy
    if (showHourLabels && hourTicks.length > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.font = '500 8px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';

      for (const tick of hourTicks) {
        const label = formatHourLabel(tick.hour);
        ctx.fillText(label, tick.x, gridBottom + 12);
      }
    }
  }

  // ── Monthly / quarterly / yearly grid ──
  // When day labels are visible and the window doesn't start on the 1st,
  // the first day label already shows the month abbreviation — so skip
  // the duplicate month tick label at the left edge.
  const startDom = startDate.getDate();
  const firstDayShowsMonth = showDayLabels && startDom !== 1;

  const ticks = getTimeTicks(startDate, endDate, plotW);

  // Pre-check: if the first tick would be clipped, decide whether to
  // left-align it or skip it (to avoid hiding the next tick).
  // Build a set of tick indices to skip.
  const skipTickIdx = new Set();
  for (let i = 0; i < ticks.length; i++) {
    const { x, label, isYear } = ticks[i];
    const cx = ox + x;
    if (cx < ox) { skipTickIdx.add(i); continue; }

    // Suppress duplicate when day labels already show the month
    if (x <= 0 && firstDayShowsMonth && !isYear) { skipTickIdx.add(i); continue; }

    ctx.font = isYear ? '600 11px Inter, system-ui, sans-serif' : '600 10px Inter, system-ui, sans-serif';
    const halfW = ctx.measureText(label).width / 2;

    // If it would clip at the left edge...
    if (cx - halfW < ox && !isYear) {
      // Check if left-aligning it would collide with the next visible tick
      const leftAlignedRight = ox + 2 + ctx.measureText(label).width + 4;
      const nextTick = ticks[i + 1];
      if (nextTick) {
        const nextCx = ox + nextTick.x;
        ctx.font = nextTick.isYear ? '600 11px Inter, system-ui, sans-serif' : '600 10px Inter, system-ui, sans-serif';
        const nextHalfW = ctx.measureText(nextTick.label).width / 2;
        if (nextCx - nextHalfW < leftAlignedRight) {
          // Would collide — skip this edge tick, let the next tick render naturally
          skipTickIdx.add(i);
        }
      }
    }
    break; // only need to check the first visible tick
  }

  ticks.forEach(({ x, label, isYear }, idx) => {
    const cx = ox + x;

    // Draw grid line (only if within the visible plot area)
    if (cx >= ox) {
      ctx.beginPath();
      ctx.moveTo(cx, gridTop);
      ctx.lineTo(cx, gridBottom);
      ctx.strokeStyle = isYear ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = isYear ? 1.25 : 0.75;
      ctx.stroke();
    }

    // Skip ticks determined to be invisible or colliding
    if (skipTickIdx.has(idx)) return;

    ctx.fillStyle = isYear ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.55)';
    ctx.font = isYear ? '600 11px Inter, system-ui, sans-serif' : '600 10px Inter, system-ui, sans-serif';
    const halfLabelW = ctx.measureText(label).width / 2;

    // Year labels sit below month labels to avoid overlap when sticky.
    // Month: gridBottom + 16, Year: gridBottom + 32.
    const labelY = gridBottom + (isYear ? 32 : 16);

    // If a tick label would clip at the left edge, left-align it at the
    // y-axis column edge.  This applies regardless of zoom — the opaque
    // y-axis DOM overlay masks the canvas underneath, and the DOM sticky
    // year label takes over once the canvas label scrolls behind the column.
    if (cx - halfLabelW < ox) {
      ctx.textAlign = 'left';
      ctx.fillText(label, ox + 2, labelY);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, labelY);
    }
  });
}

function getTimeTicks(startDate, endDate, plotW) {
  const totalMs = endDate - startDate;
  const totalDays = totalMs / 86400000;
  const ticks = [];

  const showMonths = totalDays <= 730;
  const showQuarters = totalDays > 730 && totalDays <= 1825;

  const current = new Date(startDate);
  current.setDate(1);

  while (current <= endDate) {
    const x = dateToX(current, startDate, endDate, plotW);
    const month = current.getMonth();
    const year = current.getFullYear();

    let label = null;
    let isYear = false;

    if (month === 0) {
      label = String(year);
      isYear = true;
    } else if (showMonths) {
      label = MONTH_NAMES[month];
    } else if (showQuarters && month % 3 === 0) {
      label = MONTH_NAMES[month];
    }

    if (label !== null) {
      ticks.push({ x, label, isYear });
    }

    current.setMonth(current.getMonth() + 1);
  }

  return ticks;
}

// ─── Aspect curve (confined to a row) ───

function drawAspectCurve(ctx, curve, plotW, rowH, rowTop, startDate, endDate, rowLabels, dimmed = false, highlighted = false, signSegments = null, baselineY, eclipses = null) {
  const { points, peaks } = curve;
  if (!points || points.length < 2) return;

  const ox = PADDING.left;
  const ratio = curve.heightRatio || DEFAULT_CURVE_HEIGHT_RATIO;
  // curveH is max displacement upward from the centered baseline
  const halfRowH = rowH / 2;
  const curveH = halfRowH * ratio;
  const bY = baselineY; // centered baseline Y

  // Mapped points: grow upward from baseline only
  const mapped = points.map(d => ({
    x: ox + dateToX(d.date, startDate, endDate, plotW),
    y: bY - d.intensity * curveH,
    intensity: d.intensity,
  }));

  // Opacity multiplier for dimmed/highlighted states
  const opacityMul = dimmed ? 0.15 : highlighted ? 1.3 : 1;
  const lineW = highlighted ? 2 + ratio * 2 : (1 + ratio * 1.5);

  if (signSegments) {
    // --- ELEMENT-COLORED FILL + LINE (segmented by sign) ---
    for (const seg of signSegments) {
      const segLeft = ox + seg.startX;
      const segRight = ox + seg.endX;
      const [r, g, b] = getElementRGB(seg.signIndex);

      // Clip to this sign segment
      ctx.save();
      ctx.beginPath();
      ctx.rect(segLeft, rowTop, segRight - segLeft, rowH + 1);
      ctx.clip();

      // Fill gradient from curve top down to baseline
      const baseFillAlpha = 0.08 + ratio * 0.25;
      const fillAlpha = Math.min(baseFillAlpha * opacityMul, 0.5);
      const gradient = ctx.createLinearGradient(0, bY - curveH, 0, bY);
      gradient.addColorStop(0, `rgba(${r},${g},${b},${fillAlpha.toFixed(2)})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},${(0.02 * opacityMul).toFixed(3)})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(mapped[0].x, bY);
      drawSharpLineFill(ctx, mapped);
      ctx.lineTo(mapped[mapped.length - 1].x, bY);
      ctx.closePath();
      ctx.fill();

      // Stroke line
      const baseLineAlpha = 0.5 + ratio * 0.7;
      const lineAlpha = Math.min(baseLineAlpha * opacityMul, 1);
      ctx.strokeStyle = `rgba(${r},${g},${b},${lineAlpha.toFixed(2)})`;
      ctx.lineWidth = lineW;
      drawSharpLine(ctx, mapped);
      ctx.stroke();

      ctx.restore();
    }
  } else {
    // --- DEFAULT BLACK FILL + LINE ---
    const baseFillAlpha = 0.08 + ratio * 0.25;
    const fillAlpha = Math.min(baseFillAlpha * opacityMul, 0.5);
    ctx.save();
    const gradient = ctx.createLinearGradient(0, bY - curveH, 0, bY);
    gradient.addColorStop(0, `rgba(0,0,0,${fillAlpha.toFixed(2)})`);
    gradient.addColorStop(1, `rgba(0,0,0,${(0.02 * opacityMul).toFixed(3)})`);
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.moveTo(mapped[0].x, bY);
    drawSharpLineFill(ctx, mapped);
    ctx.lineTo(mapped[mapped.length - 1].x, bY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const baseLineAlpha = 0.4 + ratio * 0.8;
    const lineAlpha = Math.min(baseLineAlpha * opacityMul, 1);
    ctx.save();
    ctx.strokeStyle = `rgba(0,0,0,${lineAlpha.toFixed(2)})`;
    ctx.lineWidth = lineW;
    drawSharpLine(ctx, mapped);
    ctx.stroke();
    ctx.restore();
  }

  // --- COLLECT PEAK LABELS for later collision-aware drawing ---
  if (peaks && rowLabels) {
    // A Sun-Moon conjunction/opposition is a New / Full Moon; render the
    // label as "{moonSign} New Moon" / "{moonSign} Full Moon" instead of
    // the standard glyph triple. Detect the pair once outside the loop.
    const isSunMoonPair =
      (curve.transitPlanet === 'Sun' && curve.target === 'Moon') ||
      (curve.transitPlanet === 'Moon' && curve.target === 'Sun');
    const lunationKind =
      isSunMoonPair && curve.aspect.name === 'Conjunction' ? 'new'
      : isSunMoonPair && curve.aspect.name === 'Opposition' ? 'full'
      : null;

    peaks.forEach(peak => {
      const px = ox + dateToX(peak.date, startDate, endDate, plotW);
      const py = bY - peak.intensity * curveH;
      // Use the real peak date for the label when the peak is cut off by the time window
      const d = peak.realPeakDate || peak.date;
      // Build label parts as structured data for multi-size rendering.
      // Each glyph segment: { text, retrograde }
      const tSym = PLANET_MAP[curve.transitPlanet]?.symbol || '';
      const tRetro = peak.transitRetrograde && curve.transitPlanet !== 'Sun' && curve.transitPlanet !== 'Moon';
      const aspectSym = curve.aspect.symbol;
      const targetSym = PLANET_MAP[curve.target]?.symbol || '';
      const targetRetro = peak.targetRetrograde && curve.target !== 'Sun' && curve.target !== 'Moon';
      // Near-miss label: show when the aspect got close but didn't complete.
      // Skip edge-cutoff peaks (where the real peak is outside the chart window).
      let nearMiss = '';
      if (peak.deviation != null && peak.deviation >= 0.1 && !peak.edgeCutoff) {
        const rounded = Math.ceil(peak.deviation);
        nearMiss = `<${rounded}°`;
      }
      const dateLine = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

      // ── Lunation / eclipse override ──
      let lunation = null;
      let eclipseHit = null;
      if (lunationKind && isSweReady()) {
        const moonLon = getLongitude('Moon', d);
        const signIndex = getSignIndex(moonLon);
        const sign = ZODIAC_SIGNS[signIndex];
        lunation = { kind: lunationKind, signIndex, signSymbol: sign.symbol };
        // If this New / Full Moon is also an eclipse, swap in the eclipse
        // graphic. Eclipse perfections coincide with the lunation within a
        // few hours; allow a 1-day window for matching.
        if (eclipses && eclipses.length > 0) {
          const dayMs = 86400000;
          const wantType = lunationKind === 'new' ? 'solar' : 'lunar';
          const match = eclipses.find(e =>
            e.type === wantType && Math.abs(e.date - d) < dayMs,
          );
          if (match) {
            eclipseHit = {
              type: match.type,
              kind: match.kind,
              signIndex: match.signIndex,
              signSymbol: match.signSymbol,
            };
          }
        }
      }

      rowLabels.push({
        x: px, y: py, dateLine, ratio, dimmed, highlighted,
        tSym, tRetro, aspectSym, targetSym, targetRetro, nearMiss,
        isNatal: curve.isNatal || false,
        pairKey: `${curve.transitPlanet}-${curve.target}`,
        lunation, eclipse: eclipseHit,
      });
    });
  }
}

// ─── Overcrowding detection ───

function isRowOvercrowded(labels) {
  if (!labels || labels.length <= 3) return false;

  // Cluster labels by X proximity (same threshold as drawPeakLabels)
  const sorted = [...labels].sort((a, b) => a.x - b.x);
  let maxClusterSize = 1;
  let currentSize = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - sorted[i - 1].x <= CLUSTER_THRESHOLD_X) {
      currentSize++;
    } else {
      if (currentSize > maxClusterSize) maxClusterSize = currentSize;
      currentSize = 1;
    }
  }
  if (currentSize > maxClusterSize) maxClusterSize = currentSize;

  return maxClusterSize > 3;
}

// ─── Draw peak labels with cluster-aware collision avoidance ───

function drawPeakLabels(ctx, labels, plotW, rowTop, rowH, reservedRects) {
  if (!labels || labels.length === 0) return [];

  // Font hierarchy
  const GLYPH_FONT = '600 14px "Apple Symbols", "Segoe UI Symbol", Inter, system-ui, sans-serif';
  const RETRO_FONT = '700 8px Inter, system-ui, sans-serif';
  const NEARMISS_FONT = '600 14px Inter, system-ui, sans-serif';
  const DATE_FONT = '600 11px Inter, system-ui, sans-serif';
  const MORE_FONT = '500 9px Inter, system-ui, sans-serif';
  const MIN_GAP_X = 6;
  const BLOCK_H = 32;
  const BUMP_H = BLOCK_H + 4;
  const LEADER_OFFSET_X = 55;
  const RETRO_OFFSET_Y = 3;
  const NATAL_FONT = '600 8px Inter, system-ui, sans-serif';
  const NATAL_OFFSET_Y = 3;
  const VISUAL_GAP = 2;
  const RETRO_VISUAL_GAP = 1;
  const MAX_CLUSTER_SHOW = 5;

  // Max vertical displacement — capped by row height
  const maxDisplacement = rowH ? Math.floor(rowH * MAX_DISPLACEMENT_RATIO) : 108;
  const maxBumps = Math.max(1, Math.floor(maxDisplacement / BUMP_H));

  ctx.save();
  // Pre-seed placed array with reserved rects (e.g. sign change labels)
  const placed = reservedRects ? [...reservedRects] : [];

  // ── Glyph measurement helpers (unchanged) ──

  function glyphMetrics(text, font) {
    ctx.font = font;
    const m = ctx.measureText(text);
    const advance = m.width;
    const visualRight = m.actualBoundingBoxRight != null ? m.actualBoundingBoxRight : advance;
    return { advance, visualRight };
  }

  // Eclipse peak labels are rendered by a custom path; report the visual
  // width here so cluster placement still works without going through the
  // glyph-segments code path.
  function eclipsePeakLineWidth(lbl) {
    const text = lbl.eclipse.type === 'solar' ? 'Solar Eclipse' : 'Lunar Eclipse';
    const ECLIPSE_GLYPH_R = 7;
    ctx.font = DATE_FONT;
    const textW = ctx.measureText(text).width;
    ctx.font = GLYPH_FONT;
    const signW = ctx.measureText(lbl.eclipse.signSymbol).width;
    return ECLIPSE_GLYPH_R * 2 + 4 + textW + 4 + signW;
  }

  function layoutGlyphLine(lbl) {
    // Sun-Moon conjunction/opposition → New Moon / Full Moon. We replace the
    // glyph triple with a "{signGlyph} New Moon" line. The sign glyph picks
    // up the moon's element color.
    if (lbl.lunation && !lbl.eclipse) {
      const segments = [];
      let cursor = 0;
      const signM = glyphMetrics(lbl.lunation.signSymbol, GLYPH_FONT);
      segments.push({
        text: lbl.lunation.signSymbol,
        font: GLYPH_FONT,
        alphaKey: 'glyph',
        x: cursor,
        baseline: 'bottom',
        yOff: 0,
        rgb: getElementRGB(lbl.lunation.signIndex),
      });
      cursor += signM.advance + 3;
      const text = lbl.lunation.kind === 'new' ? 'New Moon' : 'Full Moon';
      ctx.font = DATE_FONT;
      const textW = ctx.measureText(text).width;
      segments.push({
        text,
        font: DATE_FONT,
        alphaKey: 'glyph',
        x: cursor,
        baseline: 'bottom',
        yOff: 0,
      });
      cursor += textW;
      return { segments, totalW: cursor };
    }
    if (lbl.eclipse) {
      // Eclipse peak labels use a custom render; report width but no
      // segments. Callers must check lbl.eclipse before rendering.
      return { segments: [], totalW: eclipsePeakLineWidth(lbl) };
    }
    const segments = [];
    let cursor = 0;
    const tM = glyphMetrics(lbl.tSym, GLYPH_FONT);
    segments.push({ text: lbl.tSym, font: GLYPH_FONT, alphaKey: 'glyph', x: cursor, baseline: 'bottom', yOff: 0 });
    if (lbl.tRetro) {
      // Position "R" subscript after the glyph's advance width (not visual bounds)
      const retroX = cursor + tM.advance;
      const rM = glyphMetrics('R', RETRO_FONT);
      segments.push({ text: 'R', font: RETRO_FONT, alphaKey: 'retro', x: retroX, baseline: 'bottom', yOff: RETRO_OFFSET_Y, isRetro: true });
      cursor = retroX + rM.advance + VISUAL_GAP;
    } else {
      cursor += tM.advance + VISUAL_GAP;
    }
    const aM = glyphMetrics(lbl.aspectSym, GLYPH_FONT);
    segments.push({ text: lbl.aspectSym, font: GLYPH_FONT, alphaKey: 'glyph', x: cursor, baseline: 'bottom', yOff: 0 });
    cursor += aM.advance + VISUAL_GAP;
    const targM = glyphMetrics(lbl.targetSym, GLYPH_FONT);
    segments.push({ text: lbl.targetSym, font: GLYPH_FONT, alphaKey: 'glyph', x: cursor, baseline: 'bottom', yOff: 0 });
    if (lbl.targetRetro) {
      // Position "R" subscript after the glyph's advance width (not visual bounds)
      const retroX = cursor + targM.advance;
      const rM = glyphMetrics('R', RETRO_FONT);
      segments.push({ text: 'R', font: RETRO_FONT, alphaKey: 'retro', x: retroX, baseline: 'bottom', yOff: RETRO_OFFSET_Y, isRetro: true });
      cursor = retroX + rM.advance;
    } else {
      cursor += targM.advance;
    }
    // Natal subscript "ₙ" after target glyph for natal transit curves
    if (lbl.isNatal) {
      const nM = glyphMetrics('ₙ', NATAL_FONT);
      segments.push({ text: 'ₙ', font: NATAL_FONT, alphaKey: 'natal', x: cursor, baseline: 'bottom', yOff: NATAL_OFFSET_Y });
      cursor += nM.advance;
    }
    if (lbl.nearMiss) {
      cursor += VISUAL_GAP + 1;
      const nmM = glyphMetrics(lbl.nearMiss, NEARMISS_FONT);
      segments.push({ text: lbl.nearMiss, font: NEARMISS_FONT, alphaKey: 'nearMiss', x: cursor, baseline: 'bottom', yOff: 0 });
      cursor += nmM.advance;
    }
    return { segments, totalW: cursor };
  }

  const ALPHA_MAP = { glyph: 0.60, retro: 0.45, nearMiss: 0.55, natal: 0.35 };

  // ── Collision helpers ──

  function collidesRect(left, top, right, bottom) {
    return placed.some(p =>
      left < p.right && right > p.left && top < p.bottom && bottom > p.top
    );
  }

  function collides(testX, testY, hw) {
    return collidesRect(testX - hw - MIN_GAP_X, testY - BLOCK_H, testX + hw + MIN_GAP_X, testY);
  }

  // ── Render a single label at a given position ──

  // Render the eclipse-style peak label on a Sun-Moon row: the same round
  // eclipse glyph that the Lunar Nodes row uses, with a "{glyph} Solar
  // Eclipse {sign}" inline label and the date above.
  function renderEclipsePeakLabel(lbl, finalX, baseY, needsLeader) {
    const ECLIPSE_GLYPH_R = 7;
    const text = lbl.eclipse.type === 'solar' ? 'Solar Eclipse' : 'Lunar Eclipse';
    ctx.font = DATE_FONT;
    const textW = ctx.measureText(text).width;
    ctx.font = GLYPH_FONT;
    const signW = ctx.measureText(lbl.eclipse.signSymbol).width;
    const lineW = ECLIPSE_GLYPH_R * 2 + 4 + textW + 4 + signW;
    const dateW = ctx.measureText(lbl.dateLine).width;
    const maxW = Math.max(lineW, dateW);
    const halfW = maxW / 2;

    const labelOpacity = lbl.dimmed ? 0.15 : lbl.highlighted ? 1.4 : 1;
    const dateAlpha = (0.55 * labelOpacity).toFixed(2);

    // Date line — top, centered.
    ctx.font = DATE_FONT;
    ctx.fillStyle = `rgba(0,0,0,${dateAlpha})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(lbl.dateLine, finalX, baseY - 15);

    // Inline glyph + text + sign at baseY.
    const lineStartX = finalX - lineW / 2;
    const glyphCx = lineStartX + ECLIPSE_GLYPH_R;
    const glyphCy = baseY - 7; // visually align with text baseline

    ctx.save();
    if (lbl.eclipse.type === 'solar') {
      drawSolarEclipseGlyph(ctx, glyphCx, glyphCy, ECLIPSE_GLYPH_R);
    } else {
      drawLunarEclipseGlyph(ctx, glyphCx, glyphCy, ECLIPSE_GLYPH_R);
    }
    ctx.restore();

    ctx.font = DATE_FONT;
    ctx.fillStyle = `rgba(0,0,0,${(0.62 * labelOpacity).toFixed(2)})`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const textX = lineStartX + ECLIPSE_GLYPH_R * 2 + 4;
    ctx.fillText(text, textX, baseY);

    // Sign glyph in element color, after the text.
    ctx.font = GLYPH_FONT;
    const [r, g, b] = getElementRGB(lbl.eclipse.signIndex);
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.95 * labelOpacity).toFixed(2)})`;
    ctx.fillText(lbl.eclipse.signSymbol, textX + textW + 4, baseY);

    // Optional leader to peak point.
    if (needsLeader) {
      ctx.beginPath();
      ctx.moveTo(finalX, baseY + 2);
      ctx.lineTo(lbl.x, lbl.y);
      ctx.strokeStyle = `rgba(0,0,0,${(0.18 * labelOpacity).toFixed(2)})`;
      ctx.lineWidth = 0.75;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    placed.push({
      left: finalX - halfW - MIN_GAP_X,
      right: finalX + halfW + MIN_GAP_X,
      top: baseY - BLOCK_H,
      bottom: baseY,
      pairKey: lbl.pairKey,
    });
  }

  function renderLabel(lbl, finalX, baseY, needsLeader) {
    // Eclipse override: draw the same circular eclipse glyph the Lunar Nodes
    // row uses, plus a "Date / {Solar|Lunar} Eclipse {sign}" stack. The
    // canvas glyph isn't a font character so we bypass the segments path.
    if (lbl.eclipse) {
      renderEclipsePeakLabel(lbl, finalX, baseY, needsLeader);
      return;
    }
    const { segments, totalW: glyphLineW } = layoutGlyphLine(lbl);
    ctx.font = DATE_FONT;
    const dateW = ctx.measureText(lbl.dateLine).width;
    const maxW = Math.max(glyphLineW, dateW);
    const halfW = maxW / 2;

    const labelOpacity = lbl.dimmed ? 0.15 : lbl.highlighted ? 1.4 : 1;
    const dateAlpha = (0.55 * labelOpacity).toFixed(2);

    // Date line — top
    ctx.font = DATE_FONT;
    ctx.fillStyle = `rgba(0,0,0,${dateAlpha})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(lbl.dateLine, finalX, baseY - 15);

    // Glyph line — from layout plan
    const startX = finalX - glyphLineW / 2;
    for (const seg of segments) {
      ctx.font = seg.font;
      const alpha = (ALPHA_MAP[seg.alphaKey] * labelOpacity).toFixed(2);
      if (seg.rgb) {
        const [r, g, b] = seg.rgb;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      } else {
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = seg.baseline;
      ctx.fillText(seg.text, startX + seg.x, baseY + (seg.yOff || 0));
    }

    // Leader line if offset
    if (needsLeader) {
      ctx.beginPath();
      ctx.moveTo(finalX, baseY + 2);
      ctx.lineTo(lbl.x, lbl.y);
      ctx.strokeStyle = `rgba(0,0,0,${(0.18 * labelOpacity).toFixed(2)})`;
      ctx.lineWidth = 0.75;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(lbl.x, lbl.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${(0.25 * labelOpacity).toFixed(2)})`;
      ctx.fill();
    }

    placed.push({
      left: finalX - halfW - MIN_GAP_X,
      right: finalX + halfW + MIN_GAP_X,
      top: baseY - BLOCK_H,
      bottom: baseY,
      pairKey: lbl.pairKey,
    });
  }

  // ── Phase 1: Detect clusters ──

  // Sort all labels by x for cluster detection
  const sorted = [...labels].sort((a, b) => a.x - b.x);
  const clusters = [];
  let currentCluster = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - currentCluster[currentCluster.length - 1].x <= CLUSTER_THRESHOLD_X) {
      currentCluster.push(sorted[i]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [sorted[i]];
    }
  }
  clusters.push(currentCluster);

  // ── Phase 2: Process each cluster ──

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      // ── Individual label placement (with row-height-capped bumping) ──
      const lbl = cluster[0];
      const { totalW: glyphLineW } = layoutGlyphLine(lbl);
      ctx.font = DATE_FONT;
      const dateW = ctx.measureText(lbl.dateLine).width;
      const halfW = Math.max(glyphLineW, dateW) / 2;

      const plotLeft = PADDING.left;
      const plotRight = PADDING.left + plotW;

      // Clamp x so the label stays within the plot bounds (edge-cutoff peaks)
      let finalX = Math.max(plotLeft + halfW + MIN_GAP_X, Math.min(plotRight - halfW - MIN_GAP_X, lbl.x));
      let baseY = lbl.y - 8;
      let needsLeader = Math.abs(finalX - lbl.x) > 10;
      let fits = false;

      // Vertical bumping (capped)
      for (let i = 0; i <= maxBumps; i++) {
        if (baseY - BLOCK_H < rowTop) break; // don't go above row
        if (!collides(finalX, baseY, halfW)) { fits = true; break; }
        baseY -= BUMP_H;
      }

      // Horizontal offset fallback — try a series of offsets in both
      // directions and pick the closest one that fits. Wide labels (eclipses,
      // lunations) need more than the default 55px nudge to clear nearby
      // sign-change labels in adjacent rows.
      if (!fits) {
        const resetY = lbl.y - 8;
        const offsets = [LEADER_OFFSET_X, LEADER_OFFSET_X * 1.5, LEADER_OFFSET_X * 2, LEADER_OFFSET_X * 2.5, LEADER_OFFSET_X * 3];
        for (const off of offsets) {
          // Alternate right then left at each distance (closer of the two
          // wins overall since we sort by absolute offset).
          for (const dir of [1, -1]) {
            const tryX = lbl.x + dir * off;
            if (tryX - halfW - MIN_GAP_X < plotLeft) continue;
            if (tryX + halfW + MIN_GAP_X > plotRight) continue;
            if (!collides(tryX, resetY, halfW)) {
              fits = true; finalX = tryX; baseY = resetY; needsLeader = true;
              break;
            }
          }
          if (fits) break;
        }
      }

      if (fits) renderLabel(lbl, finalX, baseY, needsLeader);

    } else {
      // ── Cluster column layout ──

      // Sort by ratio descending for priority (drop lowest ratio first)
      const prioritized = [...cluster].sort((a, b) => b.ratio - a.ratio);

      // Cap visible labels
      const showCount = Math.min(prioritized.length, MAX_CLUSTER_SHOW);
      const visible = prioritized.slice(0, showCount);
      const hiddenCount = prioritized.length - showCount;

      // Sort visible by peak Y ascending (highest peak = smallest Y → top of column)
      visible.sort((a, b) => a.y - b.y);

      // Compute column dimensions
      const slotH = BLOCK_H + COMPACT_GAP;
      let columnH = showCount * BLOCK_H + (showCount - 1) * COMPACT_GAP;
      if (hiddenCount > 0) columnH += 14; // space for "+N more" line

      // Measure max width across all visible labels
      let maxHalfW = 0;
      for (const lbl of visible) {
        const { totalW: gw } = layoutGlyphLine(lbl);
        ctx.font = DATE_FONT;
        const dw = ctx.measureText(lbl.dateLine).width;
        maxHalfW = Math.max(maxHalfW, Math.max(gw, dw) / 2);
      }

      // Centroid X = average peak position in the cluster
      const centroidX = cluster.reduce((s, l) => s + l.x, 0) / cluster.length;

      // Position column: bottom at highest peak - 10, grow upward
      const highestPeakY = Math.min(...visible.map(l => l.y));
      let columnBottom = highestPeakY - 10;
      let columnTop = columnBottom - columnH;

      // Clamp to row bounds
      if (columnTop < rowTop + 4) {
        columnTop = rowTop + 4;
        columnBottom = columnTop + columnH;
      }
      if (columnBottom > rowTop + rowH) {
        columnBottom = rowTop + rowH;
        columnTop = columnBottom - columnH;
      }

      // Try centroid, then shift if collisions
      const plotLeft = PADDING.left;
      const plotRight = PADDING.left + plotW;
      let finalCX = centroidX;
      let needsLeader = false;

      // Clamp to plot bounds
      if (finalCX - maxHalfW - MIN_GAP_X < plotLeft) finalCX = plotLeft + maxHalfW + MIN_GAP_X;
      if (finalCX + maxHalfW + MIN_GAP_X > plotRight) finalCX = plotRight - maxHalfW - MIN_GAP_X;

      // Check for collision with already-placed labels
      if (collidesRect(finalCX - maxHalfW - MIN_GAP_X, columnTop, finalCX + maxHalfW + MIN_GAP_X, columnBottom)) {
        // Try shifting left
        const leftCX = centroidX - LEADER_OFFSET_X;
        const rightCX = centroidX + LEADER_OFFSET_X;
        if (leftCX - maxHalfW - MIN_GAP_X >= plotLeft &&
            !collidesRect(leftCX - maxHalfW - MIN_GAP_X, columnTop, leftCX + maxHalfW + MIN_GAP_X, columnBottom)) {
          finalCX = leftCX;
          needsLeader = true;
        } else if (rightCX + maxHalfW + MIN_GAP_X <= plotRight &&
            !collidesRect(rightCX - maxHalfW - MIN_GAP_X, columnTop, rightCX + maxHalfW + MIN_GAP_X, columnBottom)) {
          finalCX = rightCX;
          needsLeader = true;
        } else {
          // Still doesn't fit — skip entire cluster
          continue;
        }
      }

      // Determine if leader lines needed (centroid far from peaks)
      const avgPeakX = visible.reduce((s, l) => s + l.x, 0) / visible.length;
      if (Math.abs(finalCX - avgPeakX) > 15) needsLeader = true;

      // ── Render each label in the column ──
      for (let si = 0; si < visible.length; si++) {
        const lbl = visible[si];
        const slotBottom = columnTop + (si + 1) * BLOCK_H + si * COMPACT_GAP;

        renderLabel(lbl, finalCX, slotBottom, false);

        // Draw leader line from this label to its actual peak
        if (needsLeader || Math.abs(finalCX - lbl.x) > 10 || Math.abs(slotBottom - lbl.y) > 20) {
          const labelOpacity = lbl.dimmed ? 0.15 : lbl.highlighted ? 1.4 : 1;
          ctx.beginPath();
          ctx.moveTo(finalCX, slotBottom + 2);
          ctx.lineTo(lbl.x, lbl.y);
          ctx.strokeStyle = `rgba(0,0,0,${(0.15 * labelOpacity).toFixed(2)})`;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(lbl.x, lbl.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,0,0,${(0.20 * labelOpacity).toFixed(2)})`;
          ctx.fill();
        }
      }

      // ── "+N more" indicator if labels were hidden ──
      if (hiddenCount > 0) {
        const moreY = columnTop + showCount * BLOCK_H + (showCount - 1) * COMPACT_GAP + 12;
        ctx.font = MORE_FONT;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`+${hiddenCount} more`, finalCX, moreY);
      }
    }
  }

  ctx.restore();
  return placed;
}

// ─── Rounded rect helper ───

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Straight line helpers ───

function drawSharpLine(ctx, points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
}

function drawSharpLineFill(ctx, points) {
  if (points.length < 2) return;
  ctx.lineTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
}

// ─── Utilities ───

/**
 * Format an hour (0–23) as a compact 12-hour label: "6a", "12p", "3p", etc.
 */
function formatHourLabel(h) {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

function dateToX(date, startDate, endDate, plotW) {
  const total = endDate - startDate;
  const offset = date - startDate;
  return Math.max(0, Math.min(plotW, (offset / total) * plotW));
}

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
