import { useState, useRef, useCallback, useEffect } from 'react';
import { DEFAULT_JOBS, PLANET_MAP } from './data/planets';
import { getDefaultOrbSettings } from './data/orbDefaults';
import { useTransits } from './hooks/useTransits';
import { useNatalTransits } from './hooks/useNatalTransits';
import { useMundaneTransits } from './hooks/useMundaneTransits';
import { useAuth } from './contexts/AuthContext';
import { computeNatalAngles, combineDateAndTime } from './data/natalChart';
import { initSwissEph, isSweReady } from './api/swisseph';
import { useSFchtImport } from './hooks/useSFchtImport';
import TransitCanvas, { PADDING } from './components/Canvas/TransitCanvas';
import Controls from './components/Controls/Controls';
import StripView from './components/StripView/StripView';
import MatrixView from './components/MatrixView/MatrixView';
import WheelView from './components/WheelView/WheelView';
import ExportButton from './components/ExportButton/ExportButton';
import UserMenu from './components/Auth/UserMenu';
import AuthModal from './components/Auth/AuthModal';
import ProjectPickerModal from './components/Controls/ProjectPickerModal';
import ChartPickerModal from './components/Controls/ChartPickerModal';
import stripStyles from './components/StripView/StripView.module.css';
import styles from './App.module.css';

/** Recompute angles from birth data (fixes stale cached values). */
function refreshAngles(chart) {
  if (!chart || chart.lat == null || chart.lng == null || !chart.birthDate) return chart;
  if (!isSweReady()) return chart; // defer until WASM is loaded
  const dt = combineDateAndTime(chart.birthDate, chart.birthTime);
  return { ...chart, angles: computeNatalAngles(dt, chart.lat, chart.lng) };
}

const DEFAULT_START = new Date(2025, 0, 1);
const DEFAULT_END = new Date(2026, 11, 31);

export default function App() {
  const [sweLoaded, setSweLoaded] = useState(false);
  const [mode, setMode] = useState('world');
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [transitJobs, setTransitJobs] = useState(DEFAULT_JOBS);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [orbSettings, setOrbSettings] = useState(getDefaultOrbSettings);
  const [overlayData, setOverlayData] = useState({ crowdedRows: [], rowLayouts: [] });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalCreate, setProjectModalCreate] = useState(false);
  const [dashChartPickerOpen, setDashChartPickerOpen] = useState(false);
  const [activeProject, setActiveProject] = useState(() => {
    try {
      const saved = localStorage.getItem('ptg_activeProject');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const { user, savedCharts, defaultChartId } = useAuth();

  // ── Natal mode state (persisted to localStorage) ──
  const [natalChart, setNatalChart] = useState(() => {
    try {
      const saved = localStorage.getItem('ptg_natalChart');
      return saved ? refreshAngles(JSON.parse(saved)) : null;
    } catch { return null; }
  });
  const [natalJobs, setNatalJobs] = useState(() => {
    try {
      const saved = localStorage.getItem('ptg_natalJobs');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  // ── Mundane mode state ──
  const [stackCharts, setStackCharts] = useState([]);
  const [mundaneJobs, setMundaneJobs] = useState([]);
  const [mundaneView, setMundaneView] = useState('timeline'); // 'timeline' | 'strips' | 'matrix' | 'wheel'

  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const stickyYearRef = useRef(null);

  // ── Swiss Ephemeris WASM initialization ──
  useEffect(() => {
    initSwissEph().then(() => {
      setSweLoaded(true);
      // Refresh natal chart angles now that WASM is available
      setNatalChart(prev => refreshAngles(prev));
    });
  }, []);

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

  // Auto-load default chart when user signs in
  useEffect(() => {
    if (user && defaultChartId && savedCharts.length > 0 && !natalChart) {
      const defaultChart = savedCharts.find(c => c.id === defaultChartId);
      if (defaultChart) {
        setNatalChart(refreshAngles({
          birthDate: defaultChart.birthDate,
          birthTime: defaultChart.birthTime,
          lat: defaultChart.lat,
          lng: defaultChart.lng,
          locationName: defaultChart.locationName,
          positions: defaultChart.positions,
          angles: defaultChart.angles || null,
        }));
      }
    }
  }, [user, defaultChartId, savedCharts]);

  // Persist active project to localStorage
  useEffect(() => {
    if (activeProject) {
      localStorage.setItem('ptg_activeProject', JSON.stringify(activeProject));
    } else {
      localStorage.removeItem('ptg_activeProject');
    }
  }, [activeProject]);

  function handleSelectProject(project) {
    setActiveProject(project);

    // Load project charts into the stack for predictive mode
    const projectCharts = (project.charts || []).length > 0
      ? project.charts
      : project.chartIds
          .map(id => savedCharts.find(c => c.id === id))
          .filter(Boolean);

    setStackCharts(projectCharts);

    // If there's exactly one natal-type chart, set it as natal chart
    const natalCharts = projectCharts.filter(c => c.chartType === 'natal');
    if (natalCharts.length === 1) {
      setNatalChart(refreshAngles({
        birthDate: natalCharts[0].birthDate,
        birthTime: natalCharts[0].birthTime,
        lat: natalCharts[0].lat,
        lng: natalCharts[0].lng,
        locationName: natalCharts[0].locationName,
        positions: natalCharts[0].positions,
        angles: natalCharts[0].angles || null,
      }));
    }
  }

  const { curves, signChanges, loading } = useTransits(transitJobs, startDate, endDate, orbSettings);
  const { curves: natalCurves, signChanges: natalSignChanges, loading: natalLoading } = useNatalTransits(
    natalJobs, natalChart, startDate, endDate, orbSettings
  );
  const { curves: mundaneCurves, signChanges: mundaneSignChanges, loading: mundaneLoading } = useMundaneTransits(
    mundaneJobs, stackCharts, startDate, endDate, orbSettings
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

  // ── Mundane job handlers ──
  function handleAddMundaneJob(job) {
    setMundaneJobs(prev => [...prev, job]);
  }
  function handleRemoveMundaneJob(jobId) {
    setMundaneJobs(prev => prev.filter(j => j.id !== jobId));
  }
  function handleUpdateMundaneJob(jobId, updates) {
    setMundaneJobs(prev =>
      prev.map(j => (j.id === jobId ? { ...j, ...updates } : j))
    );
  }

  // ── Stack handlers ──
  function handleAddStackChart(chart) {
    setStackCharts(prev => {
      if (prev.some(c => c.id === chart.id)) return prev;
      return [...prev, chart];
    });
  }
  function handleRemoveStackChart(chartId) {
    setStackCharts(prev => prev.filter(c => c.id !== chartId));
  }

  // Dashboard-level SFcht import
  const {
    importStatus: dashImportStatus,
    fileInputRef: dashFileInputRef,
    handleFileInput: dashHandleFileInput,
  } = useSFchtImport({
    onChartsImported: (charts) => {
      for (const chart of charts) {
        handleAddStackChart(chart);
      }
      const natalTypes = charts.filter(c => c.chartType === 'natal');
      if (natalTypes.length === 1) {
        setNatalChart(refreshAngles({
          birthDate: natalTypes[0].birthDate,
          birthTime: natalTypes[0].birthTime,
          lat: natalTypes[0].lat,
          lng: natalTypes[0].lng,
          locationName: natalTypes[0].locationName,
          positions: natalTypes[0].positions,
          angles: natalTypes[0].angles || null,
        }));
      }
    },
  });

  // Dashboard chart picker handler
  function handleDashSelectChart(chartData) {
    setNatalChart(refreshAngles(chartData));
    setMode('natal');
    setDashChartPickerOpen(false);
  }

  // ── Preset handler ──
  function handleLoadPreset(preset) {
    // Switch mode if needed
    if (preset.mode && preset.mode !== mode) {
      setMode(preset.mode);
    }
    // Restore saved date range if present
    if (preset.startDate) setStartDate(new Date(preset.startDate));
    if (preset.endDate) setEndDate(new Date(preset.endDate));
    // Re-assign fresh IDs to avoid conflicts
    const prefix = preset.mode === 'natal' ? 'natal-job' : 'job';
    const freshJobs = (preset.jobs || []).map((job, i) => ({
      ...job,
      id: `${prefix}-${Date.now()}-${i}`,
    }));
    if (preset.mode === 'natal') {
      setNatalJobs(freshJobs);
    } else {
      setTransitJobs(freshJobs);
    }
  }

  // Choose active data based on mode
  const activeCurves = mode === 'world' ? curves : mode === 'natal' ? natalCurves : mundaneCurves;
  const activeSignChanges = mode === 'world' ? signChanges : mode === 'natal' ? natalSignChanges : mundaneSignChanges;
  const activeJobs = mode === 'world' ? transitJobs : mode === 'natal' ? natalJobs : mundaneJobs;
  const activeLoading = mode === 'world' ? loading : mode === 'natal' ? natalLoading : mundaneLoading;

  // Count total rows for empty state
  // Jobs with targets get one row per target; jobs with no targets but
  // showSignChanges enabled get one sign-change-only row (e.g. TrueNode).
  const totalRows = activeJobs.reduce((sum, j) => {
    const targets = j.targets || j.natalTargets || [];
    if (targets.length > 0) return sum + targets.length;
    if (j.showSignChanges) return sum + 1;
    return sum;
  }, 0);

  // Show loading screen while WASM initializes
  if (!sweLoaded) {
    return (
      <div className={styles.app}>
        <div className={styles.loadingOverlay} style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className={styles.loadingText}>Initializing ephemeris…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerDot} />
          <h1 className={styles.title}>Planetary Transit Graphics</h1>
          {activeProject && (
            <button
              className={styles.projectBadge}
              onClick={() => setShowProjectModal(true)}
            >
              {activeProject.name}
            </button>
          )}
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.projectBtn}
            onClick={() => setShowProjectModal(true)}
          >
            Projects
          </button>
          <ExportButton canvasRef={canvasRef} />
          <UserMenu onSignInClick={() => setShowAuthModal(true)} />
        </div>
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
          onNatalChartChange={chart => setNatalChart(refreshAngles(chart))}
          natalJobs={natalJobs}
          natalCurves={natalCurves}
          onAddNatalJob={handleAddNatalJob}
          onRemoveNatalJob={handleRemoveNatalJob}
          onUpdateNatalJob={handleUpdateNatalJob}
          onLoadPreset={handleLoadPreset}
          stackCharts={stackCharts}
          onAddStackChart={handleAddStackChart}
          onRemoveStackChart={handleRemoveStackChart}
          mundaneJobs={mundaneJobs}
          mundaneCurves={mundaneCurves}
          onAddMundaneJob={handleAddMundaneJob}
          onRemoveMundaneJob={handleRemoveMundaneJob}
          onUpdateMundaneJob={handleUpdateMundaneJob}
          activeProject={activeProject}
          onOpenProjectModal={() => setShowProjectModal(true)}
        />

        <div className={styles.chartArea}>
          {/* Mundane mode view switcher */}
          {mode === 'mundane' && stackCharts.length > 0 && (
            <div className={styles.viewSwitcherBar}>
              <div className={stripStyles.viewSwitcher}>
                <button
                  className={`${stripStyles.viewTab} ${mundaneView === 'timeline' ? stripStyles.viewTabActive : ''}`}
                  onClick={() => setMundaneView('timeline')}
                >
                  Timeline
                </button>
                <button
                  className={`${stripStyles.viewTab} ${mundaneView === 'strips' ? stripStyles.viewTabActive : ''}`}
                  onClick={() => setMundaneView('strips')}
                >
                  Strips
                </button>
                <button
                  className={`${stripStyles.viewTab} ${mundaneView === 'matrix' ? stripStyles.viewTabActive : ''}`}
                  onClick={() => setMundaneView('matrix')}
                >
                  Matrix
                </button>
                <button
                  className={`${stripStyles.viewTab} ${mundaneView === 'wheel' ? stripStyles.viewTabActive : ''}`}
                  onClick={() => setMundaneView('wheel')}
                >
                  Wheel
                </button>
              </div>
            </div>
          )}

          {/* Strip / Matrix view (mundane mode only) */}
          {mode === 'mundane' && mundaneView === 'strips' ? (
            <StripView
              stackCharts={stackCharts}
              orbSettings={orbSettings}
            />
          ) : mode === 'mundane' && mundaneView === 'matrix' ? (
            <MatrixView
              stackCharts={stackCharts}
              orbSettings={orbSettings}
            />
          ) : mode === 'mundane' && mundaneView === 'wheel' ? (
            <WheelView
              stackCharts={stackCharts}
              orbSettings={orbSettings}
            />
          ) : (
          <>
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
                  <div className={styles.dashboard}>
                    <section className={styles.dashSection}>
                      <h3 className={styles.dashSectionTitle}>Charts</h3>
                      <div className={styles.dashBtnGroup}>
                        <button
                          className={styles.dashBtn}
                          onClick={() => dashFileInputRef.current?.click()}
                        >
                          <span className={styles.dashBtnIcon}>{'\u2913'}</span>
                          Import Chart
                        </button>
                        {user && savedCharts.length > 0 && (
                          <button
                            className={styles.dashBtn}
                            onClick={() => setDashChartPickerOpen(true)}
                          >
                            <span className={styles.dashBtnIcon}>{'\u2750'}</span>
                            Open Chart
                          </button>
                        )}
                        <button
                          className={styles.dashBtn}
                          onClick={() => {
                            setMode('natal');
                            setControlsOpen(true);
                          }}
                        >
                          <span className={styles.dashBtnIcon}>+</span>
                          Add Chart
                        </button>
                      </div>
                      {dashImportStatus && (
                        <div className={styles.dashImportStatus}>
                          {dashImportStatus}
                        </div>
                      )}
                    </section>

                    <section className={styles.dashSection}>
                      <h3 className={styles.dashSectionTitle}>Projects</h3>
                      <div className={styles.dashBtnGroup}>
                        <button
                          className={`${styles.dashBtn} ${styles.dashBtnPrimary}`}
                          onClick={() => {
                            setProjectModalCreate(true);
                            setShowProjectModal(true);
                          }}
                        >
                          <span className={styles.dashBtnIcon}>+</span>
                          New Project
                        </button>
                        <button
                          className={styles.dashBtn}
                          onClick={() => {
                            setProjectModalCreate(false);
                            setShowProjectModal(true);
                          }}
                        >
                          <span className={styles.dashBtnIcon}>{'\u2630'}</span>
                          Load Project
                        </button>
                      </div>
                    </section>

                    {activeProject && (
                      <div className={styles.dashActiveProject}>
                        Active: <strong>{activeProject.name}</strong>
                      </div>
                    )}
                  </div>

                  {/* Hidden file input for dashboard import */}
                  <input
                    ref={dashFileInputRef}
                    type="file"
                    accept=".SFcht,.sfcht"
                    multiple
                    style={{ display: 'none' }}
                    onChange={dashHandleFileInput}
                  />
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
          </>
          )}
        </div>
      </main>

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}

      <ProjectPickerModal
        open={showProjectModal}
        onClose={() => { setShowProjectModal(false); setProjectModalCreate(false); }}
        onSelectProject={handleSelectProject}
        activeProjectId={activeProject?.id}
        initialCreate={projectModalCreate}
      />

      <ChartPickerModal
        open={dashChartPickerOpen}
        onClose={() => setDashChartPickerOpen(false)}
        onSelectChart={handleDashSelectChart}
        currentChartId={null}
      />
    </div>
  );
}
