import { useState, useRef, useCallback, useEffect } from 'react';
import { DEFAULT_JOBS, PLANET_MAP } from './data/planets';
import { getDefaultOrbSettings } from './data/orbDefaults';
import { useTransits } from './hooks/useTransits';
import { useNatalTransits } from './hooks/useNatalTransits';
import TransitCanvas, { PADDING } from './components/Canvas/TransitCanvas';
import Controls from './components/Controls/Controls';
import ExportButton from './components/ExportButton/ExportButton';
import styles from './App.module.css';

const DEFAULT_START = new Date(2025, 0, 1);
const DEFAULT_END = new Date(2026, 11, 31);

export default function App() {
  const [mode, setMode] = useState('world');
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [transitJobs, setTransitJobs] = useState(DEFAULT_JOBS);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [orbSettings, setOrbSettings] = useState(getDefaultOrbSettings);
  const [overlayData, setOverlayData] = useState({ crowdedRows: [], rowLayouts: [] });

  // ── Natal mode state (persisted to localStorage) ──
  const [natalChart, setNatalChart] = useState(() => {
    try {
      const saved = localStorage.getItem('ptg_natalChart');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [natalJobs, setNatalJobs] = useState(() => {
    try {
      const saved = localStorage.getItem('ptg_natalJobs');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const stickyYearRef = useRef(null);

  // Persist natal data to localStorage
  useEffect(() => {
    if (natalChart) {
      localStorage.setItem('ptg_natalChart', JSON.stringify(natalChart));
    } else {
      localStorage.removeItem('ptg_natalChart');
    }
  }, [natalChart]);

  useEffect(() => {
    localStorage.setItem('ptg_natalJobs', JSON.stringify(natalJobs));
  }, [natalJobs]);

  const { curves, signChanges, loading } = useTransits(transitJobs, startDate, endDate, orbSettings);
  const { curves: natalCurves, signChanges: natalSignChanges, loading: natalLoading } = useNatalTransits(
    natalJobs, natalChart, startDate, endDate, orbSettings
  );

  const handleOverlayUpdate = useCallback((data) => {
    setOverlayData(data);
  }, []);

  // ── Sticky year label: scroll-driven, directly updates DOM for smooth animation ──
  useEffect(() => {
    const el = scrollRef.current;
    const stickyEl = stickyYearRef.current;
    if (!el || !stickyEl || !startDate || !endDate) return;

    const LABEL_W = 36;     // approximate width of "2025" in px
    const PIN_LEFT = 2;     // default left inside clip container (2px right of y-axis border)
    const GAP = 6;           // min gap between sticky and next year label

    function update() {
      const scrollLeft = el.scrollLeft;
      if (scrollLeft <= 0 || zoom <= 1) {
        stickyEl.style.display = 'none';
        return;
      }

      const containerW = el.clientWidth;
      const canvasW = containerW * zoom;
      const plotW = canvasW - PADDING.left - PADDING.right;
      const totalMs = endDate - startDate;
      const ox = PADDING.left; // y-axis column width
      const labelHalfW = LABEL_W / 2;

      const plotLeftX = scrollLeft - ox;
      if (plotLeftX < 0) { stickyEl.style.display = 'none'; return; }

      // Date at the visible left edge (just past the y-axis column)
      const dateAtLeft = new Date(startDate.getTime() + (plotLeftX / plotW) * totalMs);
      const year = dateAtLeft.getFullYear();

      // Helper: canvas-space x of Jan 1 for a given year
      function jan1CanvasX(y) {
        const jan1 = new Date(y, 0, 1);
        return ox + ((jan1 - startDate) / totalMs) * plotW;
      }

      // Find the right year to display: check if the NEXT year's Jan 1
      // has already scrolled to or past the y-axis edge. If so, that year
      // is the one that should be sticky (not the current calendar year).
      const nextJan1X = jan1CanvasX(year + 1);
      const nextJan1Viewport = nextJan1X - scrollLeft;
      const showYear = (nextJan1Viewport <= ox + labelHalfW) ? year + 1 : year;

      // Where is the displayed year's Jan 1 in viewport space?
      const jan1X = jan1CanvasX(showYear);
      const jan1Viewport = jan1X - scrollLeft;

      // Where is the FOLLOWING year's Jan 1 (for push-off calculation)?
      const followingJan1X = jan1CanvasX(showYear + 1);
      const followingJan1Viewport = followingJan1X - scrollLeft;
      const followingLeftEdgeInClip = (followingJan1Viewport - labelHalfW) - ox;

      // Show sticky when the displayed year's canvas label is at or behind the y-axis
      if (jan1Viewport <= ox + labelHalfW) {
        let left = PIN_LEFT;

        // Push sticky left if the following year's label is approaching
        const stickyRightEdge = left + LABEL_W;
        if (stickyRightEdge + GAP > followingLeftEdgeInClip) {
          left = followingLeftEdgeInClip - LABEL_W - GAP;
        }

        if (left + LABEL_W <= 0) {
          // Current showYear is fully pushed off — immediately switch to next year
          stickyEl.textContent = String(showYear + 1);
          stickyEl.style.display = '';
          stickyEl.style.left = `${PIN_LEFT}px`;
        } else {
          stickyEl.textContent = String(showYear);
          stickyEl.style.display = '';
          stickyEl.style.left = `${left}px`;
        }
      } else {
        stickyEl.style.display = 'none';
      }
    }

    el.addEventListener('scroll', update, { passive: true });
    update();
    return () => el.removeEventListener('scroll', update);
  }, [zoom, startDate, endDate]);

  function handleOrbChange(planetId, value) {
    setOrbSettings(prev => ({ ...prev, [planetId]: value }));
  }

  function handleAddJob(job) {
    setTransitJobs(prev => [...prev, job]);
  }

  function handleRemoveJob(jobId) {
    setTransitJobs(prev => prev.filter(j => j.id !== jobId));
  }

  function handleUpdateJob(jobId, updates) {
    setTransitJobs(prev =>
      prev.map(j => (j.id === jobId ? { ...j, ...updates } : j))
    );
  }

  // ── Natal job handlers ──
  function handleAddNatalJob(job) {
    setNatalJobs(prev => [...prev, job]);
  }
  function handleRemoveNatalJob(jobId) {
    setNatalJobs(prev => prev.filter(j => j.id !== jobId));
  }
  function handleUpdateNatalJob(jobId, updates) {
    setNatalJobs(prev =>
      prev.map(j => (j.id === jobId ? { ...j, ...updates } : j))
    );
  }

  // Choose active data based on mode
  const activeCurves = mode === 'world' ? curves : natalCurves;
  const activeSignChanges = mode === 'world' ? signChanges : natalSignChanges;
  const activeJobs = mode === 'world' ? transitJobs : natalJobs;
  const activeLoading = mode === 'world' ? loading : natalLoading;

  // Count total rows for empty state
  // Jobs with targets get one row per target; jobs with no targets but
  // showSignChanges enabled get one sign-change-only row (e.g. TrueNode).
  const totalRows = activeJobs.reduce((sum, j) => {
    const targets = j.targets || j.natalTargets || [];
    if (targets.length > 0) return sum + targets.length;
    if (j.showSignChanges) return sum + 1;
    return sum;
  }, 0);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerDot} />
          <h1 className={styles.title}>Planetary Transit Graphics</h1>
        </div>
        <ExportButton canvasRef={canvasRef} />
      </header>

      <main className={styles.main}>
        <Controls
          mode={mode}
          onModeChange={setMode}
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          transitJobs={transitJobs}
          curves={curves}
          onAddJob={handleAddJob}
          onRemoveJob={handleRemoveJob}
          onUpdateJob={handleUpdateJob}
          orbSettings={orbSettings}
          onOrbChange={handleOrbChange}
          isOpen={controlsOpen}
          onToggleOpen={() => setControlsOpen(o => !o)}
          natalChart={natalChart}
          onNatalChartChange={setNatalChart}
          natalJobs={natalJobs}
          natalCurves={natalCurves}
          onAddNatalJob={handleAddNatalJob}
          onRemoveNatalJob={handleRemoveNatalJob}
          onUpdateNatalJob={handleUpdateNatalJob}
        />

        <div className={styles.chartArea}>
          {/* canvasWrap: position context for the non-scrolling overlay */}
          <div className={styles.canvasWrap}>
            <div ref={scrollRef} className={styles.canvasContainer} style={{ overflowX: zoom > 1 ? 'auto' : 'hidden' }}>
              {activeLoading && (
                <div className={styles.loadingOverlay}>
                  <span className={styles.loadingText}>
                    Computing transits…
                  </span>
                </div>
              )}

              {!activeLoading && totalRows === 0 && (
                <div className={styles.emptyState}>
                  <span>{mode === 'natal' ? 'Enter birth data and add natal transits' : 'Add a transit to begin'}</span>
                </div>
              )}

              <TransitCanvas
                ref={canvasRef}
                curves={activeCurves}
                signChanges={activeSignChanges}
                transitJobs={activeJobs}
                startDate={startDate}
                endDate={endDate}
                zoom={zoom}
                onOverlayUpdate={handleOverlayUpdate}
              />
            </div>

            {/* Non-scrolling overlay: sits OUTSIDE the scroll container
                so it never moves when the user scrolls horizontally. */}
            <div className={styles.canvasOverlay}>
              {/* Solid Y-axis background column — masks chart data behind glyphs */}
              {overlayData.rowLayouts.length > 0 && (
                <div
                  className={styles.yAxisColumn}
                  style={{ width: `${PADDING.left}px` }}
                />
              )}

              {/* Y-axis planet glyphs */}
              {overlayData.rowLayouts.map((row, i) => {
                const planet = PLANET_MAP[row.rowPlanet];
                if (!planet) return null;
                return (
                  <div
                    key={`yaxis-${i}`}
                    className={styles.yAxisLabel}
                    style={{
                      top: `${row.rowTop}px`,
                      height: `${row.rowH}px`,
                      width: `${PADDING.left}px`,
                    }}
                  >
                    <span className={styles.yAxisGlyph}>{planet.symbol}</span>
                  </div>
                );
              })}

              {/* Sticky year label — scroll-driven via ref for smooth animation.
                  The scroll handler directly updates textContent, display, and left.
                  Clip container starts at the y-axis border so the label slides
                  behind the border line when pushed out by the next year. */}
              {overlayData.rowLayouts.length > 0 && (() => {
                const lastRow = overlayData.rowLayouts[overlayData.rowLayouts.length - 1];
                const gridBottom = lastRow.rowTop + lastRow.rowH;
                const yearY = gridBottom + 22;
                return (
                  <div
                    className={styles.stickyYearClip}
                    style={{ left: `${PADDING.left}px`, top: `${yearY}px` }}
                  >
                    <div
                      ref={stickyYearRef}
                      className={styles.stickyYear}
                      style={{ left: '2px', display: 'none' }}
                    />
                  </div>
                );
              })()}

              {/* Crowded-row notes — top-justified in viewport */}
              {overlayData.crowdedRows.map((row, i) => (
                <div
                  key={`crowded-${i}`}
                  className={styles.crowdedNote}
                  style={{
                    top: `${row.rowTop}px`,
                    height: `${row.rowH}px`,
                  }}
                >
                  <span className={styles.crowdedNoteText}>
                    Hey! It's getting crowded, try a shorter timescale or less targets to view details.
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.zoomBar}>
            <div className={styles.zoomControl}>
              <input
                type="range"
                min="1"
                max="5"
                step="0.25"
                value={zoom}
                onChange={e => setZoom(parseFloat(e.target.value))}
                className={styles.zoomSlider}
              />
              <span className={styles.zoomLabel}>{zoom.toFixed(1)}×</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
