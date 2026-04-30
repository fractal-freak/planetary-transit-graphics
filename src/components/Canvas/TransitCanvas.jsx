import { useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useCanvasRenderer, PADDING } from './useCanvasRenderer';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './Canvas.module.css';

export { PADDING };

const TransitCanvas = forwardRef(function TransitCanvas(
  { curves, signChanges, transitJobs, startDate, endDate, zoom = 1, onOverlayUpdate },
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

  // Renderer returns a stable repaint function
  const repaint = useCanvasRenderer(canvasRef, {
    curves, signChanges, transitJobs, startDate, endDate, canvasW, canvasH, zoom,
    highlightPairRef, labelHitAreasRef, crowdedRowsRef, rowLayoutRef, theme,
  });

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

  // Helper: hit-test label areas at canvas-space coordinates
  const hitTestLabels = useCallback((mx, my) => {
    const hitAreas = labelHitAreasRef.current;
    if (!hitAreas) return null;
    for (const area of hitAreas) {
      if (mx >= area.left && mx <= area.right && my >= area.top && my <= area.bottom) {
        return area.pairKey;
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

  // Throttled mousemove + click-to-stick highlight
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafPending = null;

    const onMouseMove = (e) => {
      // If a curve is sticky-locked, don't update highlight on hover
      if (stickyPairRef.current != null) return;
      if (rafPending) return;

      rafPending = requestAnimationFrame(() => {
        rafPending = null;
        // Re-check sticky inside rAF in case click happened between queue and execution
        if (stickyPairRef.current != null) return;

        const [mx, my] = toCanvasCoords(e, canvas);
        const found = hitTestLabels(mx, my);

        const prev = highlightPairRef.current;
        if (prev !== found) {
          highlightPairRef.current = found;
          repaint();
          setHasCursor(found != null);
        }
      });
    };

    const onClick = (e) => {
      const [mx, my] = toCanvasCoords(e, canvas);
      const found = hitTestLabels(mx, my);

      if (stickyPairRef.current != null) {
        // Already sticky — click anywhere clears it
        stickyPairRef.current = null;
        highlightPairRef.current = found;  // show hover under cursor (or null)
        repaint();
        setHasCursor(found != null);
      } else if (found != null) {
        // Click on a label — lock it
        stickyPairRef.current = found;
        highlightPairRef.current = found;
        repaint();
        setHasCursor(true);
      }
    };

    const onMouseLeave = () => {
      if (rafPending) { cancelAnimationFrame(rafPending); rafPending = null; }
      // Don't clear highlight if sticky-locked
      if (stickyPairRef.current != null) return;
      if (highlightPairRef.current != null) {
        highlightPairRef.current = null;
        repaint();
        setHasCursor(false);
      }
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
    <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{
          width: canvasW > 0 ? `${canvasW}px` : '100%',
          height: canvasH > 0 ? `${canvasH}px` : '100%',
          cursor: hasCursor ? 'pointer' : 'default',
        }}
      />
    </div>
  );
});

export default TransitCanvas;
