import { useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useCanvasRenderer, PADDING } from './useCanvasRenderer';
import { useTheme } from '../../contexts/ThemeContext';
import { useColors } from '../../contexts/ColorContext';
import styles from './Canvas.module.css';

export { PADDING };

const TransitCanvas = forwardRef(function TransitCanvas(
  { curves, signChanges, transitJobs, startDate, endDate, zoom = 1, onOverlayUpdate, natalPositions },
  ref
) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const labelHitAreasRef = useRef([]);
  const highlightPairRef = useRef(null);
  const stickyPairRef = useRef(null);       // locked highlight on click
  const crowdedRowsRef = useRef([]);
  const rowLayoutRef = useRef([]);
  const [baseWidth, setBaseWidth] = useState(0);
  const [baseHeight, setBaseHeight] = useState(0);

  // Track highlight for cursor style only (cheap — doesn't redraw canvas)
  const [hasCursor, setHasCursor] = useState(false);

  // Tooltip state — shows planet positions at the hovered (or pinned) peak.
  // We mirror the state in a ref so the canvas event handlers can read the
  // latest value without being re-registered on every state change.
  const [tooltip, setTooltip] = useState(null); // { peakInfo, x, y, pinned }
  const tooltipRef = useRef(null);
  useEffect(() => { tooltipRef.current = tooltip; }, [tooltip]);

  // (overlay data is passed to parent via onOverlayUpdate callback)

  // Measure the wrapper (available space) and derive canvas size from zoom
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      if (w > 0 && h > 0) {
        setBaseWidth(w);
        setBaseHeight(h);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // The actual canvas pixel dimensions (CSS pixels, before DPR)
  const canvasW = Math.round(baseWidth * zoom);
  const canvasH = baseHeight;

  const { theme } = useTheme();
  const { version: colorsVersion } = useColors();

  // Renderer returns a stable repaint function
  const repaint = useCanvasRenderer(canvasRef, {
    curves, signChanges, transitJobs, startDate, endDate, canvasW, canvasH, zoom,
    highlightPairRef, labelHitAreasRef, crowdedRowsRef, rowLayoutRef, theme,
    natalPositions,
  });

  // Repaint when the user picks a new color palette — kept as its own effect
  // so we don't have to expand useCanvasRenderer's internal deps array.
  useEffect(() => {
    repaint();
  }, [colorsVersion, repaint]);

  // Repaint when natal positions change (mode switch, chart swap) — same
  // pattern as colorsVersion to avoid changing the renderer's deps-array size.
  useEffect(() => {
    repaint();
  }, [natalPositions, repaint]);

  // Sync overlay data after each paint — notify parent for DOM overlays
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (onOverlayUpdate) {
        onOverlayUpdate({
          crowdedRows: [...crowdedRowsRef.current],
          rowLayouts: [...rowLayoutRef.current],
        });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [curves, signChanges, transitJobs, startDate, endDate, canvasW, canvasH]);

  useImperativeHandle(ref, () => ({
    toDataURL: (type = 'image/png') => canvasRef.current?.toDataURL(type),
  }));

  // Helper: hit-test label areas at canvas-space coordinates. Returns the
  // matched hit area (with pairKey + peakInfo), or null.
  const hitTestLabels = useCallback((mx, my) => {
    const hitAreas = labelHitAreasRef.current;
    if (!hitAreas) return null;
    for (const area of hitAreas) {
      if (mx >= area.left && mx <= area.right && my >= area.top && my <= area.bottom) {
        return area;
      }
    }
    return null;
  }, []);

  // Convert a DOM mouse event to canvas-space coordinates
  const toCanvasCoords = useCallback((e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }, [canvasW, canvasH]);

  // Throttled mousemove + click-to-stick highlight + tooltip
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wrapper = wrapperRef.current;

    let rafPending = null;

    function tooltipCoordsFromEvent(e) {
      // Tooltip lives inside the wrapper (which contains the canvas).
      // Convert clientX/Y → wrapper-relative pixels.
      const rect = wrapper.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    const onMouseMove = (e) => {
      if (rafPending) return;

      rafPending = requestAnimationFrame(() => {
        rafPending = null;
        const [mx, my] = toCanvasCoords(e, canvas);
        const area = hitTestLabels(mx, my);

        // Highlight: skip if sticky locked.
        if (stickyPairRef.current == null) {
          const foundKey = area?.pairKey ?? null;
          const prev = highlightPairRef.current;
          if (prev !== foundKey) {
            highlightPairRef.current = foundKey;
            repaint();
            setHasCursor(foundKey != null);
          }
        }

        // Tooltip: skip if pinned. Read latest tooltip via ref so this
        // handler can stay registered across renders.
        const tt = tooltipRef.current;
        if (!tt?.pinned) {
          if (area?.peakInfo) {
            const { x, y } = tooltipCoordsFromEvent(e);
            setTooltip({ peakInfo: area.peakInfo, x, y, pinned: false });
          } else if (tt) {
            setTooltip(null);
          }
        }
      });
    };

    const onClick = (e) => {
      const [mx, my] = toCanvasCoords(e, canvas);
      const area = hitTestLabels(mx, my);
      const foundKey = area?.pairKey ?? null;
      const tt = tooltipRef.current;

      if (stickyPairRef.current != null) {
        // Already sticky — click anywhere clears it AND any pinned tooltip
        stickyPairRef.current = null;
        highlightPairRef.current = foundKey;
        repaint();
        setHasCursor(foundKey != null);
        if (tt?.pinned) {
          if (area?.peakInfo) {
            const { x, y } = tooltipCoordsFromEvent(e);
            setTooltip({ peakInfo: area.peakInfo, x, y, pinned: false });
          } else {
            setTooltip(null);
          }
        }
      } else if (foundKey != null) {
        // Click on a label — lock highlight + pin the tooltip
        stickyPairRef.current = foundKey;
        highlightPairRef.current = foundKey;
        repaint();
        setHasCursor(true);
        if (area?.peakInfo) {
          const { x, y } = tooltipCoordsFromEvent(e);
          setTooltip({ peakInfo: area.peakInfo, x, y, pinned: true });
        }
      }
    };

    const onMouseLeave = () => {
      if (rafPending) { cancelAnimationFrame(rafPending); rafPending = null; }
      // Don't clear highlight or tooltip if pinned
      if (stickyPairRef.current != null) return;
      if (highlightPairRef.current != null) {
        highlightPairRef.current = null;
        repaint();
        setHasCursor(false);
      }
      const tt = tooltipRef.current;
      if (tt && !tt.pinned) setTooltip(null);
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mouseleave', onMouseLeave);
    return () => {
      if (rafPending) cancelAnimationFrame(rafPending);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [canvasW, canvasH, repaint, toCanvasCoords, hitTestLabels]);

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{
          width: canvasW > 0 ? `${canvasW}px` : '100%',
          height: canvasH > 0 ? `${canvasH}px` : '100%',
          cursor: hasCursor ? 'pointer' : 'default',
        }}
      />
      {tooltip && <PeakTooltip tooltip={tooltip} wrapperRef={wrapperRef} />}
    </div>
  );
});

// ─── Peak tooltip ───
// Shows the peak's date + each body's degree°min' Sign at the perfection.
// Positioned near the cursor, flipped if it would overflow the wrapper.
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatTooltipDate(d) {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function PositionLine({ glyph, position, retrograde, isNatal }) {
  return (
    <div className={styles.tooltipRow}>
      <span className={styles.tooltipGlyph}>{glyph}</span>
      <span className={styles.tooltipPos}>
        {position.deg}°<span className={styles.tooltipMin}>{position.min}'</span>
      </span>
      <span className={styles.tooltipSign}>{position.signSymbol}</span>
      <span className={styles.tooltipR}>{retrograde ? 'R' : ''}</span>
      {isNatal && <span className={styles.tooltipNatalTag}>natal</span>}
    </div>
  );
}

function PeakTooltip({ tooltip, wrapperRef }) {
  const { peakInfo, x, y, pinned } = tooltip;
  const ttRef = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // After render, measure tooltip and clamp inside wrapper.
  useEffect(() => {
    const tt = ttRef.current;
    const wrap = wrapperRef.current;
    if (!tt || !wrap) return;
    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;
    const ttW = tt.offsetWidth;
    const ttH = tt.offsetHeight;
    let left = x + 14;
    let top = y + 14;
    if (left + ttW > wrapW - 8) left = Math.max(8, x - ttW - 14);
    if (top + ttH > wrapH - 8) top = Math.max(8, y - ttH - 14);
    setPos({ left, top });
  }, [x, y, peakInfo, wrapperRef]);

  // Station tooltip — single body, just position + stationing direction.
  if (peakInfo.kind === 'station') {
    return (
      <div
        ref={ttRef}
        className={`${styles.peakTooltip} ${pinned ? styles.peakTooltipPinned : ''}`}
        style={{ left: pos.left, top: pos.top }}
      >
        <div className={styles.tooltipDate}>
          {formatTooltipDate(peakInfo.date)}
        </div>
        <PositionLine
          glyph={peakInfo.transitSymbol}
          position={peakInfo.transitPosition}
          retrograde={false}
        />
        <div className={styles.tooltipStationLabel}>
          stations {peakInfo.stationDirection}
        </div>
      </div>
    );
  }

  // Aspect/peak tooltip — two bodies + the aspect glyph centered between.
  return (
    <div
      ref={ttRef}
      className={`${styles.peakTooltip} ${pinned ? styles.peakTooltipPinned : ''}`}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className={styles.tooltipDate}>
        {formatTooltipDate(peakInfo.date)}
      </div>
      <PositionLine
        glyph={peakInfo.transitSymbol}
        position={peakInfo.transitPosition}
        retrograde={peakInfo.transitRetro}
      />
      <div className={styles.tooltipAspectGlyph}>
        {peakInfo.aspectSymbol}
      </div>
      <PositionLine
        glyph={peakInfo.targetSymbol}
        position={peakInfo.targetPosition}
        retrograde={peakInfo.targetRetro}
        isNatal={peakInfo.isNatal}
      />
    </div>
  );
}

export default TransitCanvas;
