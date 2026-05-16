import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { DEFAULT_JOBS, PLANET_MAP } from './data/planets';
import { getDefaultOrbSettings } from './data/orbDefaults';
import { useTransits } from './hooks/useTransits';
import { useNatalTransits } from './hooks/useNatalTransits';
import { useMundaneTransits } from './hooks/useMundaneTransits';
import { useAuth } from './contexts/AuthContext';
import { computeNatalAngles, computeNatalPositions, computeNatalSpeeds, combineDateAndTime } from './data/natalChart';
import { initSwissEph, isSweReady } from './api/swisseph';
import { loadSession, saveSession } from './firebase/firestore';
import { reorderAnonPresets, loadAnonPresets } from './utils/anonPresets';
import TransitCanvas, { PADDING } from './components/Canvas/TransitCanvas';
import Controls from './components/Controls/Controls';
import StripView from './components/StripView/StripView';
import MatrixView from './components/MatrixView/MatrixView';
import WheelView from './components/WheelView/WheelView';
import ExportButton from './components/ExportButton/ExportButton';
import SaveListButton from './components/SaveListButton/SaveListButton';
import UserMenu from './components/Auth/UserMenu';
import AuthModal from './components/Auth/AuthModal';
import ProjectPickerModal from './components/Controls/ProjectPickerModal';
import AlignmentCalendar from './components/Calendar/AlignmentCalendar';
import stripStyles from './components/StripView/StripView.module.css';
import styles from './App.module.css';
import { resolveRelativeDates, dateRangeToRelativeRange } from './data/defaultPresets';
import { getTimeLord, resolveStartSign, getTimeLordSegments } from './utils/timelord';
import { loadAnonNotes, saveAnonNote, deleteAnonNote, clearAnonNotes } from './utils/anonNotes';
import { loadChartNotes, saveChartNote, deleteChartNote } from './firebase/firestore';

/**
 * Recompute positions and angles from birth data on load. This fixes stale
 * cached values for charts that were saved before the timezone fix — their
 * stored positions/angles were computed treating birth time as the device's
 * local time. Now that combineDateAndTime resolves the birthplace's tz from
 * lat/lng, refreshing on load corrects any drift.
 */
function refreshAngles(chart) {
  if (!chart) return chart;
  // Backfill a stable id so legacy charts cached without one (pre-notes
  // feature) still get an identity to attach notes to. New charts already
  // come with one — this no-ops when chart.id is set.
  const ensuredChart = chart.id
    ? chart
    : { ...chart, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` };
  if (!ensuredChart.birthDate) return ensuredChart;
  if (!isSweReady()) return ensuredChart; // defer until WASM is loaded
  const hasLoc = ensuredChart.lat != null && ensuredChart.lng != null;
  const dt = combineDateAndTime(ensuredChart.birthDate, ensuredChart.birthTime, ensuredChart.lat, ensuredChart.lng);
  const positions = computeNatalPositions(dt);
  const speeds = computeNatalSpeeds(dt);
  const angles = hasLoc ? computeNatalAngles(dt, ensuredChart.lat, ensuredChart.lng) : null;
  return { ...ensuredChart, positions, speeds, angles };
}

/**
 * Splice a reordered subset of preset ids back into the full savedPresets
 * list. Useful when the sidebar shows favorites filtered out of the full
 * list — drag-reordering the favorites needs to update the underlying
 * order without disturbing non-favorites.
 */
function mergeReorderedFavorites(allPresets, orderedFavoriteIds) {
  const idSet = new Set(orderedFavoriteIds);
  const byId = new Map(allPresets.map(p => [p.id, p]));
  const reorderedFavorites = orderedFavoriteIds
    .map(id => byId.get(id))
    .filter(Boolean);
  let favIdx = 0;
  return allPresets.map(p => (idSet.has(p.id) ? reorderedFavorites[favIdx++] : p));
}

/** Default first-time range: today through one week ahead. */
function defaultDateRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function readStoredDate(key) {
  try {
    const v = localStorage.getItem(key);
    if (!v) return null;
    const d = new Date(JSON.parse(v));
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function readStoredJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

export default function App() {
  const [sweLoaded, setSweLoaded] = useState(false);
  const [page, setPage] = useState('graph'); // 'graph' | 'calendar'
  const [mode, setMode] = useState(() =>
    readStoredJSON('ptg_mode', null) || 'world'
  );
  const [startDate, setStartDate] = useState(() =>
    readStoredDate('ptg_startDate') || defaultDateRange().start
  );
  const [endDate, setEndDate] = useState(() =>
    readStoredDate('ptg_endDate') || defaultDateRange().end
  );
  const [transitJobs, setTransitJobs] = useState(() =>
    readStoredJSON('ptg_transitJobs', null) || DEFAULT_JOBS
  );
  const [controlsOpen, setControlsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readStoredJSON('ptg_sidebarCollapsed', false)
  );
  const [dateRangeLocked, setDateRangeLocked] = useState(() =>
    readStoredJSON('ptg_dateRangeLocked', false)
  );
  const [zoom, setZoom] = useState(1);
  const [orbSettings, setOrbSettings] = useState(() => {
    // Merge stored values with defaults so newly-introduced keys (e.g. Lunation)
    // pick up sane defaults on existing installs.
    const stored = readStoredJSON('ptg_orbSettings', null);
    return { ...getDefaultOrbSettings(), ...(stored || {}) };
  });
  const [overlayData, setOverlayData] = useState({ crowdedRows: [], rowLayouts: [] });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalCreate, setProjectModalCreate] = useState(false);
  const [activeProject, setActiveProject] = useState(() => {
    try {
      const saved = localStorage.getItem('ptg_activeProject');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const { user, savedCharts, savedPresets, setSavedPresets, defaultChartId } = useAuth();
  // 'loading' until Firestore session fetch resolves; then 'restored' (had a
  // saved session) or 'empty' (no session — eligible to auto-apply preset).
  // For signed-out users, stays 'loading' so we never write back to Firestore.
  const [sessionStatus, setSessionStatus] = useState('loading');
  const autoAppliedPresetRef = useRef(false);

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
  // ── Annual profections / time lord highlight ──
  const [timelordEnabled, setTimelordEnabled] = useState(() => {
    try { return localStorage.getItem('ptg_timelordEnabled') === '1'; } catch { return false; }
  });
  const [timelordStartSign, setTimelordStartSign] = useState(() => {
    try {
      const v = localStorage.getItem('ptg_timelordStartSign');
      if (v === null || v === 'asc') return 'asc';
      const n = Number(v);
      return Number.isFinite(n) ? n : 'asc';
    } catch { return 'asc'; }
  });
  // ── Mundane mode state ──
  const [stackCharts, setStackCharts] = useState([]);
  const [mundaneJobs, setMundaneJobs] = useState([]);
  const [mundaneView, setMundaneView] = useState('timeline'); // 'timeline' | 'strips' | 'matrix' | 'wheel'

  // ── Calendar nav state (lifted so the sidebar can drive it) ──
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState('month'); // 'month' | 'year'

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

  useEffect(() => {
    try { localStorage.setItem('ptg_timelordEnabled', timelordEnabled ? '1' : '0'); } catch {}
  }, [timelordEnabled]);
  useEffect(() => {
    try {
      localStorage.setItem(
        'ptg_timelordStartSign',
        timelordStartSign === 'asc' ? 'asc' : String(timelordStartSign)
      );
    } catch {}
  }, [timelordStartSign]);

  // Persist transit/world-mode settings
  useEffect(() => {
    localStorage.setItem('ptg_transitJobs', JSON.stringify(transitJobs));
  }, [transitJobs]);
  useEffect(() => {
    localStorage.setItem('ptg_startDate', JSON.stringify(startDate.toISOString()));
  }, [startDate]);
  useEffect(() => {
    localStorage.setItem('ptg_endDate', JSON.stringify(endDate.toISOString()));
  }, [endDate]);
  useEffect(() => {
    localStorage.setItem('ptg_mode', JSON.stringify(mode));
  }, [mode]);
  useEffect(() => {
    localStorage.setItem('ptg_orbSettings', JSON.stringify(orbSettings));
  }, [orbSettings]);
  useEffect(() => {
    localStorage.setItem('ptg_sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('ptg_dateRangeLocked', JSON.stringify(dateRangeLocked));
  }, [dateRangeLocked]);

  // ── Session restore from Firestore on sign-in ──
  // Firestore is the source of truth for signed-in users. localStorage is
  // a best-effort fallback for the brief pre-restore window and for offline
  // / signed-out use.
  useEffect(() => {
    if (!user) {
      setSessionStatus('loading');
      autoAppliedPresetRef.current = false;
      return;
    }
    let cancelled = false;
    setSessionStatus('loading');
    (async () => {
      try {
        const session = await loadSession(user.uid);
        if (cancelled) return;
        const hasContent = session && (
          (session.transitJobs && session.transitJobs.length > 0) ||
          (session.natalJobs && session.natalJobs.length > 0)
        );
        if (hasContent) {
          if (session.mode) setMode(session.mode);
          if (session.startDate) setStartDate(new Date(session.startDate));
          if (session.endDate) setEndDate(new Date(session.endDate));
          if (Array.isArray(session.transitJobs)) setTransitJobs(session.transitJobs);
          if (Array.isArray(session.natalJobs)) setNatalJobs(session.natalJobs);
          if (session.orbSettings) setOrbSettings(session.orbSettings);
          setSessionStatus('restored');
        } else {
          setSessionStatus('empty');
        }
      } catch (err) {
        console.warn('Session restore failed:', err);
        if (!cancelled) setSessionStatus('empty');
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Auto-apply the user's favorite preset when starting a fresh session.
  //
  // Signed-in users: fires after sessionStatus becomes 'empty' (Firestore
  // session check resolved with no saved session).
  //
  // Anonymous users: fires on first load if there's no `ptg_transitJobs`
  // in localStorage (true first-time visitor) OR if jobs are empty. The top
  // favorite preset (first favorite in the user's list) is the "default" —
  // users can move favorites up to change which one auto-loads.
  useEffect(() => {
    if (autoAppliedPresetRef.current) return;
    if (!savedPresets || savedPresets.length === 0) return;

    const isFreshSession = user
      ? sessionStatus === 'empty'
      : (readStoredJSON('ptg_transitJobs', null) === null && transitJobs.length === DEFAULT_JOBS.length);
    if (!isFreshSession) return;

    // Top favorite for the current mode wins; falls back to top favorite
    // overall, then any preset, then leaves DEFAULT_JOBS in place.
    const modeFavs = savedPresets.filter(p => p.isFavorite && (p.mode || 'world') === mode);
    const allFavs = savedPresets.filter(p => p.isFavorite);
    const fav = modeFavs[0] || allFavs[0] || savedPresets[0];
    if (!fav) return;

    autoAppliedPresetRef.current = true;
    if (fav.mode && fav.mode !== mode) setMode(fav.mode);
    let relativeRange = fav.relativeRange;
    if (!relativeRange && fav.startDate && fav.endDate) {
      relativeRange = dateRangeToRelativeRange(new Date(fav.startDate), new Date(fav.endDate));
    }
    if (relativeRange) {
      const { startDate: s, endDate: e } = resolveRelativeDates(relativeRange);
      setStartDate(new Date(s));
      setEndDate(new Date(e));
    }
    const prefix = fav.mode === 'natal' ? 'natal-job' : 'job';
    const freshJobs = (fav.jobs || []).map((job, i) => ({
      ...job,
      id: `${prefix}-${Date.now()}-${i}`,
    }));
    if (fav.mode === 'natal') {
      setNatalJobs(freshJobs);
    } else {
      setTransitJobs(freshJobs);
    }
  }, [user, sessionStatus, savedPresets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save session to Firestore whenever graph state changes (debounced).
  // Skipped while sessionStatus is 'loading' to avoid clobbering the saved
  // session with default values before restore completes.
  useEffect(() => {
    if (!user || sessionStatus === 'loading') return;
    const timer = setTimeout(() => {
      saveSession(user.uid, {
        mode,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        transitJobs,
        natalJobs,
        orbSettings,
      }).catch(err => console.warn('Session save failed:', err));
    }, 800);
    return () => clearTimeout(timer);
  }, [user, sessionStatus, mode, startDate, endDate, transitJobs, natalJobs, orbSettings]);

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
  // Resolve the start sign — Asc by default, or whichever sign the user
  // has selected. Used both to compute the active lord for highlighting and
  // to expand TimeLord-target jobs into per-year sub-curves.
  const timelordStartSignResolved = useMemo(() => {
    if (!natalChart) return null;
    return resolveStartSign(natalChart, timelordStartSign);
  }, [natalChart, timelordStartSign]);

  const { curves: natalCurvesRaw, signChanges: natalSignChanges, loading: natalLoading } = useNatalTransits(
    natalJobs, natalChart, startDate, endDate, orbSettings, timelordStartSignResolved
  );

  // Time lord segments active across the *visible* date range. The readout
  // in the sidebar lists every lord that holds during the user's current
  // window — so scrolling forward two years shows the lord(s) for that
  // window, not today's. Per-peak highlighting still computes its own lord
  // at each peak's date independently.
  const currentTimelordSegments = useMemo(() => {
    if (
      !timelordEnabled ||
      !natalChart?.birthDate ||
      timelordStartSignResolved == null ||
      !startDate || !endDate
    ) return [];
    return getTimeLordSegments(natalChart.birthDate, timelordStartSignResolved, startDate, endDate);
  }, [timelordEnabled, natalChart, timelordStartSignResolved, startDate, endDate]);

  // Tag *individual peaks* whose date falls within a profection year where
  // the curve's target equals that year's lord. Per-peak (rather than
  // per-curve) so a multi-year timeframe lights up different transit pairs
  // as the lord-of-year hands off each birthday. Dynamic-target sub-curves
  // (isTimeLord) are pre-tagged for the whole segment; regular jobs check
  // peak by peak.
  const natalCurves = useMemo(() => {
    if (
      !timelordEnabled ||
      !natalChart?.birthDate ||
      timelordStartSignResolved == null
    ) {
      return natalCurvesRaw;
    }
    return natalCurvesRaw.map(c => {
      if (c.isTimeLord) {
        const peaks = c.peaks.map(p => ({ ...p, isTimeLord: true }));
        return { ...c, peaks };
      }
      const peaks = c.peaks.map(p => {
        const tl = getTimeLord(natalChart.birthDate, timelordStartSignResolved, p.date);
        return tl && c.target === tl.planetId ? { ...p, isTimeLord: true } : p;
      });
      return { ...c, peaks };
    });
  }, [natalCurvesRaw, natalChart, timelordStartSignResolved, timelordEnabled]);
  const { curves: mundaneCurves, signChanges: mundaneSignChanges, loading: mundaneLoading } = useMundaneTransits(
    mundaneJobs, stackCharts, startDate, endDate, orbSettings
  );

  const handleOverlayUpdate = useCallback((data) => {
    setOverlayData(data);
  }, []);

  // ── Pinch / ctrl-wheel zoom on the timeline ──
  // Browsers fire `wheel` events with ctrlKey=true for trackpad pinch and
  // for ctrl+wheel on a mouse. We intercept those, prevent the browser's
  // default page zoom, and adjust our timeline zoom while keeping the date
  // under the cursor anchored in place.
  // Read zoom inside the listener via a ref so the effect doesn't have to
  // re-attach (and detach) on every zoom change — we'd lose the listener
  // mid-gesture otherwise.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onWheel(e) {
      // Pinch / ctrl-wheel → zoom, cursor-anchored.
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const viewportX = e.clientX - rect.left;
        const oldZoom = zoomRef.current;
        const factor = Math.exp(-e.deltaY * 0.01);
        const newZoom = Math.max(1, Math.min(5, oldZoom * factor));
        if (newZoom === oldZoom) return;
        const ratio = newZoom / oldZoom;
        const oldCanvasX = el.scrollLeft + viewportX;
        const newScrollLeft = oldCanvasX * ratio - viewportX;
        setZoom(newZoom);
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollLeft = Math.max(0, newScrollLeft);
          }
        });
        return;
      }

      // Regular two-finger / wheel scroll → horizontal pan along the timeline.
      // Only meaningful when zoomed in (otherwise the canvas == viewport).
      // Map both deltaX and deltaY to scrollLeft so a vertical wheel still
      // scrubs through time, and prevent the page from scrolling underneath.
      if (zoomRef.current > 1) {
        const delta = e.deltaX + e.deltaY;
        if (delta === 0) return;
        e.preventDefault();
        el.scrollLeft += delta;
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // Re-run when sweLoaded flips (canvas div mounts) or when the rendered
    // graph view changes (mundane sub-views replace the canvas container).
  }, [sweLoaded, mode, mundaneView, page]);

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
  function handleClearAllJobs() {
    setTransitJobs([]);
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
  function handleClearAllNatalJobs() {
    setNatalJobs([]);
  }

  // ── Transit notes for the active natal chart ──
  // Notes attach to a chart and a specific transit (transitPlanet, target,
  // aspect, peakDate). For Firestore-saved charts we persist under the
  // chart's subcollection; otherwise we mirror to localStorage.
  const [chartNotes, setChartNotes] = useState([]);
  const activeChartId = natalChart?.id || null;
  const activeChartIsSaved = !!(user && activeChartId && savedCharts?.find(c => c.id === activeChartId));

  useEffect(() => {
    let cancelled = false;
    if (!activeChartId) {
      setChartNotes([]);
      return;
    }
    mergedNotesForChart(user, activeChartId).then(notes => {
      if (!cancelled) setChartNotes(notes);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChartId, activeChartIsSaved, user]);

  async function handleSaveNote(noteData, noteId) {
    if (!activeChartId) return;
    if (activeChartIsSaved) {
      await saveChartNote(user.uid, activeChartId, noteData, noteId);
    } else {
      saveAnonNote(activeChartId, noteData, noteId);
    }
    const fresh = await mergedNotesForChart(user, activeChartId);
    setChartNotes(fresh);
  }

  // Build a (transit, target, aspect) triple from a peakInfo that may be
  // an aspect peak, a station marker, or a lunation peak. Synthetic targets
  // ('station', 'lunation', 'eclipse') let stations and lunations attach
  // notes too without changing the persisted note schema.
  function noteKeyFromPeak(peakInfo) {
    if (!peakInfo) return null;
    if (peakInfo.kind === 'station') {
      return {
        transitPlanet: peakInfo.transitPlanet,
        target: 'station',
        aspect: peakInfo.stationDirection || 'station',
      };
    }
    if (peakInfo.kind === 'lunation') {
      const isEclipse = !!peakInfo.eclipse;
      return {
        transitPlanet: 'Moon',
        target: isEclipse ? 'eclipse' : 'lunation',
        aspect: isEclipse ? peakInfo.eclipse.type : peakInfo.lunationKind,
      };
    }
    if (peakInfo.aspectName && peakInfo.targetPlanet) {
      return {
        transitPlanet: peakInfo.transitPlanet,
        target: peakInfo.targetPlanet,
        aspect: peakInfo.aspectName,
      };
    }
    return null;
  }

  // Match a stored note to a peakInfo by yyyy-mm-dd peak date so timezone /
  // re-computation drift doesn't cause false misses.
  function findNoteForPeak(peakInfo) {
    const key = noteKeyFromPeak(peakInfo);
    if (!key) return null;
    const day = peakInfo.date instanceof Date
      ? peakInfo.date.toISOString().slice(0, 10)
      : null;
    if (!day) return null;
    return chartNotes.find(n =>
      n.transitPlanet === key.transitPlanet &&
      n.target === key.target &&
      n.aspect === key.aspect &&
      ((n.peakDate || '').slice(0, 10) === day)
    ) || null;
  }

  async function handleSavePeakNote(peakInfo, body, existingNoteId) {
    if (!activeChartId) return;
    const key = noteKeyFromPeak(peakInfo);
    if (!key) return;
    const peakIso = peakInfo.date instanceof Date ? peakInfo.date.toISOString() : null;
    await handleSaveNote({ ...key, peakDate: peakIso, body }, existingNoteId);
  }

  async function handleDeleteNote(noteId) {
    if (!activeChartId) return;
    if (activeChartIsSaved) {
      await deleteChartNote(user.uid, activeChartId, noteId);
    } else {
      deleteAnonNote(activeChartId, noteId);
    }
    const fresh = await mergedNotesForChart(user, activeChartId);
    setChartNotes(fresh);
  }

  // Default visible window when loading a transit from a note: how many
  // days of context to show on each side of the peak. Slow planets need
  // a wider window because their aspects perfect over many months and
  // multiple stations; fast planets perfect quickly so a tight window
  // keeps the curve readable.
  function noteBufferDays(transitPlanet) {
    switch (transitPlanet) {
      case 'Moon': return 4;
      case 'Sun':
      case 'Mercury':
      case 'Venus': return 21;
      case 'Mars': return 60;
      case 'Jupiter': return 120;
      case 'Saturn': return 240;
      case 'Uranus':
      case 'Neptune':
      case 'Pluto': return 540;
      case 'TrueNode': return 120;
      default: return 60;
    }
  }
  function dateRangeFromNote(note) {
    if (!note?.peakDate) return null;
    const peak = new Date(note.peakDate);
    if (isNaN(peak.getTime())) return null;
    const buf = noteBufferDays(note.transitPlanet) * 86400000;
    return { start: new Date(peak.getTime() - buf), end: new Date(peak.getTime() + buf) };
  }

  // Add the transit a note describes onto the existing natal jobs without
  // replacing what's already on the timeline. No-op if a job for the exact
  // (transit, target, aspect) trio already exists, so the timeline doesn't
  // accumulate duplicates. Expands the date window to include the note's
  // peak if it falls outside, so the new transit is actually visible.
  function handleAddNoteTransit(note) {
    setMode('natal');
    if (!dateRangeLocked) {
      const range = dateRangeFromNote(note);
      if (range) {
        setStartDate(prev => (!prev || range.start < prev) ? range.start : prev);
        setEndDate(prev => (!prev || range.end > prev) ? range.end : prev);
      }
    }
    setNatalJobs(prev => {
      const existing = prev.find(j =>
        j.transitPlanet === note.transitPlanet &&
        (j.natalTargets || []).includes(note.target) &&
        (j.aspects || []).includes(note.aspect)
      );
      if (existing) return prev;
      return [
        ...prev,
        {
          id: `natal-job-${Date.now()}`,
          transitPlanet: note.transitPlanet,
          natalTargets: [note.target],
          aspects: [note.aspect],
          showSignChanges: false,
          showRetrogrades: true,
        },
      ];
    });
  }

  // Replace the whole natal-job list with just the one transit the note
  // describes. Center the date range on the peak with a buffer sized to
  // the transiting planet, so the curve fits comfortably in view.
  function handleLoadNoteTransit(note) {
    setMode('natal');
    if (!dateRangeLocked) {
      const range = dateRangeFromNote(note);
      if (range) {
        setStartDate(range.start);
        setEndDate(range.end);
      }
    }
    setNatalJobs([{
      id: `natal-job-${Date.now()}`,
      transitPlanet: note.transitPlanet,
      natalTargets: [note.target],
      aspects: [note.aspect],
      showSignChanges: false,
      showRetrogrades: true,
    }]);
  }

  // Picker → Notes tab: load a chart that isn't currently active and
  // immediately apply one of its notes ('add' appends, 'load' replaces).
  function handleSelectChartWithNote(chart, note, mode) {
    setNatalChart(refreshAngles(chart));
    if (mode === 'load') handleLoadNoteTransit(note);
    else handleAddNoteTransit(note);
  }

  // Called by ChartSection after a chart is persisted to Firestore for the
  // first time. The Firestore id replaces the local- id we minted at chart
  // creation; any notes the user attached against that local id need to
  // come along and live in the new Firestore subcollection so the picker
  // and the sidebar both find them under the new id.
  //
  // We deliberately do NOT delete the localStorage copy after migration —
  // if Firestore reports success but the writes silently fail to persist,
  // we'd be wiping the only copy of the user's notes. The note loaders
  // merge both stores, so the local copy just acts as a free backup.
  async function handleChartSaved(oldId, newId, updatedChart) {
    setNatalChart(refreshAngles(updatedChart));
    if (!user || !oldId || !newId || oldId === newId) return;
    const localNotes = loadAnonNotes(oldId);
    if (localNotes.length === 0) return;
    try {
      for (const note of localNotes) {
        await saveChartNote(user.uid, newId, {
          transitPlanet: note.transitPlanet,
          target: note.target,
          aspect: note.aspect,
          peakDate: note.peakDate,
          body: note.body,
          createdAt: note.createdAt,
        });
      }
      // Re-fetch under the new id so the sidebar list updates immediately.
      const fresh = await mergedNotesForChart(user, newId);
      setChartNotes(fresh);
    } catch (err) {
      console.error('Note migration failed:', err);
    }
  }

  // Load notes for a chart from every place we might have stashed them and
  // merge by (transitPlanet, target, aspect, peakDate). Firestore takes
  // precedence when keys collide, but anything that's *only* in localStorage
  // still surfaces — so a botched migration can't make data disappear.
  async function mergedNotesForChart(currentUser, chartId) {
    if (!chartId) return [];
    const local = loadAnonNotes(chartId) || [];
    let remote = [];
    if (currentUser && !chartId.startsWith('local-') && !chartId.startsWith('anon-')) {
      try { remote = await loadChartNotes(currentUser.uid, chartId); } catch {}
    }
    const seen = new Map();
    const keyOf = n => `${n.transitPlanet}|${n.target}|${n.aspect}|${(n.peakDate || '').slice(0, 10)}`;
    for (const n of remote) seen.set(keyOf(n), n);
    for (const n of local) {
      const k = keyOf(n);
      if (!seen.has(k)) seen.set(k, n);
    }
    return Array.from(seen.values()).sort((a, b) => {
      const aT = new Date(a.createdAt || 0).getTime();
      const bT = new Date(b.createdAt || 0).getTime();
      return bT - aT;
    });
  }

  // ── Mundane job handlers ──
  function handleAddMundaneJob(job) {
    setMundaneJobs(prev => [...prev, job]);
  }
  function handleRemoveMundaneJob(jobId) {
    setMundaneJobs(prev => prev.filter(j => j.id !== jobId));
  }
  function handleClearAllMundaneJobs() {
    setMundaneJobs([]);
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


  // ── Preset handler ──
  function handleLoadPreset(preset) {
    // Switch mode if needed
    if (preset.mode && preset.mode !== mode) {
      setMode(preset.mode);
    }
    // Resolve dates: prefer today-relative range if present (default presets),
    // otherwise use stored explicit dates (user-saved presets).
    // When the user has pinned the Date Range section, skip date assignment
    // so they can hop between planet configs without losing their window.
    if (!dateRangeLocked) {
      // Always anchor to today. Old presets that still have absolute
      // startDate/endDate get migrated on the fly into a duration.
      let relativeRange = preset.relativeRange;
      if (!relativeRange && preset.startDate && preset.endDate) {
        relativeRange = dateRangeToRelativeRange(new Date(preset.startDate), new Date(preset.endDate));
      }
      if (relativeRange) {
        const { startDate: s, endDate: e } = resolveRelativeDates(relativeRange);
        setStartDate(new Date(s));
        setEndDate(new Date(e));
      }
    }
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

  // Reorder favorites in the sidebar. The top-most preset is the
  // "default" that auto-loads on a fresh session.
  //
  // The list passed in is the new order of the favorites group; we splice
  // it back into the full savedPresets list so non-favorite ordering stays
  // intact (favorites are filtered + drag-reordered as their own group).
  function handleReorderPresets(orderedFavoriteIds) {
    if (user) {
      // Signed-in: in-memory reorder for this session. Firestore order
      // persistence is a follow-up (would require an `order` field).
      setSavedPresets(prev => mergeReorderedFavorites(prev, orderedFavoriteIds));
    } else {
      const next = mergeReorderedFavorites(savedPresets, orderedFavoriteIds);
      reorderAnonPresets(next.map(p => p.id));
      setSavedPresets(loadAnonPresets());
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
          <img
            className={styles.wizardHat}
            src={`${import.meta.env.BASE_URL}wizard-hat.png`}
            alt=""
            aria-hidden="true"
          />
          <h1 className={styles.title}>Transit Wiz</h1>
          {activeProject && page === 'graph' && (
            <button
              className={styles.projectBadge}
              onClick={() => setShowProjectModal(true)}
            >
              {activeProject.name}
            </button>
          )}
        </div>

        <nav className={styles.pageNav}>
          <button
            type="button"
            className={`${styles.pageNavBtn} ${page === 'graph' ? styles.pageNavBtnActive : ''}`}
            onClick={() => setPage('graph')}
          >
            Graph
          </button>
          <button
            type="button"
            className={`${styles.pageNavBtn} ${page === 'calendar' ? styles.pageNavBtnActive : ''}`}
            onClick={() => setPage('calendar')}
          >
            Calendar
          </button>
        </nav>

        <div className={styles.headerRight}>
          {page === 'graph' && (
            <>
              <button
                className={styles.projectBtn}
                onClick={() => setShowProjectModal(true)}
              >
                Projects
              </button>
              <ExportButton canvasRef={canvasRef} />
              <SaveListButton
                curves={activeCurves}
                signChanges={activeSignChanges}
                startDate={startDate}
                endDate={endDate}
              />
            </>
          )}
          <UserMenu onSignInClick={() => setShowAuthModal(true)} />
        </div>
      </header>

      <main className={`${styles.main} ${sidebarCollapsed ? styles.mainSidebarCollapsed : ''}`}>
        {sidebarCollapsed && (
          <button
            type="button"
            className={styles.sidebarOpenBtn}
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Show sidebar"
            title="Show sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
        )}
        <Controls
          page={page}
          mode={mode}
          onModeChange={setMode}
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          transitJobs={transitJobs}
          curves={curves}
          signChanges={signChanges}
          curvesLoading={loading}
          onAddJob={handleAddJob}
          onRemoveJob={handleRemoveJob}
          onUpdateJob={handleUpdateJob}
          onClearAllJobs={handleClearAllJobs}
          orbSettings={orbSettings}
          onOrbChange={handleOrbChange}
          isOpen={controlsOpen}
          onToggleOpen={() => setControlsOpen(o => !o)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebarCollapsed={() => setSidebarCollapsed(c => !c)}
          dateRangeLocked={dateRangeLocked}
          onToggleDateRangeLocked={() => setDateRangeLocked(l => !l)}
          natalChart={natalChart}
          onNatalChartChange={chart => setNatalChart(refreshAngles(chart))}
          onChartSaved={handleChartSaved}
          timelordEnabled={timelordEnabled}
          onTimelordEnabledChange={setTimelordEnabled}
          timelordStartSign={timelordStartSign}
          onTimelordStartSignChange={setTimelordStartSign}
          currentTimelordSegments={currentTimelordSegments}
          natalJobs={natalJobs}
          natalCurves={natalCurves}
          natalSignChanges={natalSignChanges}
          natalLoading={natalLoading}
          chartNotes={chartNotes}
          onSaveNote={handleSaveNote}
          onDeleteNote={handleDeleteNote}
          onAddNoteTransit={handleAddNoteTransit}
          onLoadNoteTransit={handleLoadNoteTransit}
          onSelectChartWithNote={handleSelectChartWithNote}
          onAddNatalJob={handleAddNatalJob}
          onRemoveNatalJob={handleRemoveNatalJob}
          onUpdateNatalJob={handleUpdateNatalJob}
          onClearAllNatalJobs={handleClearAllNatalJobs}
          onLoadPreset={handleLoadPreset}
          onReorderPresets={handleReorderPresets}
          stackCharts={stackCharts}
          onAddStackChart={handleAddStackChart}
          onRemoveStackChart={handleRemoveStackChart}
          mundaneJobs={mundaneJobs}
          mundaneCurves={mundaneCurves}
          onAddMundaneJob={handleAddMundaneJob}
          onRemoveMundaneJob={handleRemoveMundaneJob}
          onUpdateMundaneJob={handleUpdateMundaneJob}
          onClearAllMundaneJobs={handleClearAllMundaneJobs}
          activeProject={activeProject}
          onOpenProjectModal={() => setShowProjectModal(true)}
        />

        <div className={styles.chartArea}>
          {page === 'calendar' ? (
            <AlignmentCalendar
              mode={mode}
              transitJobs={transitJobs}
              natalJobs={natalJobs}
              natalChart={natalChart}
              mundaneJobs={mundaneJobs}
              stackCharts={stackCharts}
              orbSettings={orbSettings}
              currentDate={calendarDate}
              onCurrentDateChange={setCalendarDate}
              view={calendarView}
              onViewChange={setCalendarView}
            />
          ) : (
          <>
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
                  <span className={styles.emptyStateText}>
                    Open the settings panel to add transits
                  </span>
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
                natalPositions={
                  mode === 'natal' && natalChart
                    ? { ...(natalChart.positions || {}), ...(natalChart.angles || {}) }
                    : null
                }
                notesEnabled={mode === 'natal' && !!activeChartId}
                findNoteForPeak={findNoteForPeak}
                onSavePeakNote={handleSavePeakNote}
                onDeleteNote={handleDeleteNote}
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
                    Hey! It's getting crowded, try a shorter date range or less targets to view details.
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
            <button
              className={styles.nowButton}
              onClick={() => {
                const el = scrollRef.current;
                const now = new Date();
                // If today is outside the visible range, jump the range to
                // today (preserving span). Otherwise, scroll the viewport
                // to center on today within the existing range.
                if (now < startDate || now > endDate) {
                  const todayMidnight = new Date();
                  todayMidnight.setHours(0, 0, 0, 0);
                  const spanMs = endDate.getTime() - startDate.getTime();
                  const newStart = todayMidnight;
                  const newEnd = new Date(newStart.getTime() + spanMs);
                  setStartDate(newStart);
                  setEndDate(newEnd);
                  return;
                }
                if (!el) return;
                const canvasW = el.scrollWidth;
                const plotW = canvasW - PADDING.left - PADDING.right;
                const totalMs = endDate - startDate;
                const nowX = PADDING.left + ((now - startDate) / totalMs) * plotW;
                el.scrollLeft = Math.max(0, nowX - el.clientWidth / 2);
              }}
            >
              Now
            </button>
          </div>
          </>
          )}
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

    </div>
  );
}
