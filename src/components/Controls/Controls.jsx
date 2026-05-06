import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import DateRangePicker from './DateRangePicker';
import TransitJobList from './TransitJobList';
import ChartSection from './ChartSection';
import NatalJobList from './NatalJobList';
import ChartStackPanel from './ChartStackPanel';
import OrbSettings from './OrbSettings';
import ColorSettings from './ColorSettings';
import PresetPickerModal from './PresetPickerModal';
import CollapsibleSection from './CollapsibleSection';
import ThemeToggle from './ThemeToggle';
import {
  IconFolder,
  IconCalendar,
  IconStar,
  IconChart,
  IconStack,
  IconTarget,
  IconUser,
  IconSidebar,
  IconSaturn,
  IconGlobe,
  IconSparkles,
  IconPalette,
  IconLock,
  IconLockOpen,
} from './sectionIcons';
import styles from './Controls.module.css';

export default function Controls({
  page,
  mode,
  onModeChange,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  transitJobs,
  curves,
  signChanges,
  curvesLoading,
  onAddJob,
  onRemoveJob,
  onClearAllJobs,
  onClearAllNatalJobs,
  onClearAllMundaneJobs,
  onUpdateJob,
  orbSettings,
  onOrbChange,
  isOpen,
  onToggleOpen,
  sidebarCollapsed,
  onToggleSidebarCollapsed,
  dateRangeLocked,
  onToggleDateRangeLocked,
  natalChart,
  onNatalChartChange,
  onChartSaved,
  timelordEnabled,
  onTimelordEnabledChange,
  timelordStartSign,
  onTimelordStartSignChange,
  currentTimelordSegments,
  natalJobs,
  natalCurves,
  natalSignChanges,
  natalLoading,
  onAddNatalJob,
  onRemoveNatalJob,
  onUpdateNatalJob,
  chartNotes,
  onSaveNote,
  onDeleteNote,
  onAddNoteTransit,
  onLoadNoteTransit,
  onSelectChartWithNote,
  onLoadPreset,
  onReorderPresets,
  // Mundane mode props
  stackCharts,
  onAddStackChart,
  onRemoveStackChart,
  mundaneJobs,
  mundaneCurves,
  onAddMundaneJob,
  onRemoveMundaneJob,
  onUpdateMundaneJob,
  // Project props
  activeProject,
  onOpenProjectModal,
}) {
  const { user, savedPresets } = useAuth();
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  const currentJobs = mode === 'world' ? transitJobs : mode === 'natal' ? natalJobs : mundaneJobs;
  const hasJobs = currentJobs.length > 0;

  // Favorites: up to 5 starred presets for quick access, filtered to current mode
  const modePresets = savedPresets.filter(p => (p.mode || 'world') === mode);
  const favorites = modePresets.filter(p => p.isFavorite);

  return (
    <>
      <button className={styles.mobileToggle} onClick={onToggleOpen} aria-expanded={isOpen}>
        {isOpen ? '\u2715 Close' : '\u2699 Settings'}
      </button>

      <aside className={`${styles.controls} ${isOpen ? styles.controlsOpen : ''}`}>
        <div className={styles.controlsInner}>
          {/* ── Top toolbar — sidebar collapse button (desktop) ── */}
          {onToggleSidebarCollapsed && (
            <div className={styles.sidebarTopBar}>
              <button
                type="button"
                className={styles.sidebarTopBtn}
                onClick={onToggleSidebarCollapsed}
                aria-label="Hide sidebar"
                title="Hide sidebar"
              >
                <IconSidebar />
              </button>
            </div>
          )}

          {/* ── Mode Tabs ── */}
          <div className={styles.modeTabs}>
            <button
              className={`${styles.modeTab} ${mode === 'world' ? styles.modeTabActive : ''}`}
              onClick={() => onModeChange('world')}
            >
              <span className={styles.modeTabIcon}><IconGlobe /></span>
              <span>World</span>
            </button>
            <button
              className={`${styles.modeTab} ${mode === 'natal' ? styles.modeTabActive : ''}`}
              onClick={() => onModeChange('natal')}
            >
              <span className={styles.modeTabIcon}><IconUser /></span>
              <span>Natal</span>
            </button>
            <button
              className={`${styles.modeTab} ${mode === 'mundane' ? styles.modeTabActive : ''}`}
              onClick={() => onModeChange('mundane')}
            >
              <span className={styles.modeTabIcon}><IconSparkles /></span>
              <span>Predictive</span>
            </button>
          </div>

          {/* ── Active Project ── */}
          {activeProject && (
            <CollapsibleSection id="project" title="Project" icon={<IconFolder />}>
              <div style={{
                padding: '8px 10px',
                background: 'rgba(0,0,0,0.03)',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(0,0,0,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeProject.name}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(0,0,0,0.3)', marginTop: '2px' }}>
                  {activeProject.chartIds?.length || 0} chart{(activeProject.chartIds?.length || 0) !== 1 ? 's' : ''}
                </div>
                <button
                  className={styles.presetsOpenBtn}
                  onClick={onOpenProjectModal}
                  style={{ marginTop: '6px', width: '100%' }}
                >
                  Manage Projects
                </button>
              </div>
            </CollapsibleSection>
          )}

          {/* Chart — pinned to the top in natal mode so the active chart
              is the first thing the user sees / can swap. */}
          {mode === 'natal' && (
            <CollapsibleSection id="chart" title="Chart" icon={<IconUser />}>
              <ChartSection
                natalChart={natalChart}
                onNatalChartChange={onNatalChartChange}
                onChartSaved={onChartSaved}
                timelordEnabled={timelordEnabled}
                onTimelordEnabledChange={onTimelordEnabledChange}
                timelordStartSign={timelordStartSign}
                onTimelordStartSignChange={onTimelordStartSignChange}
                currentTimelordSegments={currentTimelordSegments}
                onSelectChartWithNote={onSelectChartWithNote}
                chartNotes={chartNotes}
                onSaveNote={onSaveNote}
                onDeleteNote={onDeleteNote}
                onAddNoteTransit={onAddNoteTransit}
                onLoadNoteTransit={onLoadNoteTransit}
              />
            </CollapsibleSection>
          )}

          {/* Date Range — Graph page only; the Calendar page has its own
              header with Month/Year, prev/next, and Today buttons. */}
          {page !== 'calendar' && (
            <CollapsibleSection
              id="dateRange"
              title="Date Range"
              icon={<IconCalendar />}
              headerExtra={
                <button
                  type="button"
                  className={`${styles.dateRangeLockBtn} ${dateRangeLocked ? styles.dateRangeLockBtnActive : ''}`}
                  onClick={onToggleDateRangeLocked}
                  title={dateRangeLocked
                    ? 'Date range is locked — presets will only swap planets'
                    : 'Lock date range — presets will only swap planets'}
                  aria-label={dateRangeLocked ? 'Unlock date range' : 'Lock date range'}
                  aria-pressed={dateRangeLocked}
                >
                  {dateRangeLocked ? <IconLock /> : <IconLockOpen />}
                </button>
              }
            >
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartChange={onStartChange}
                onEndChange={onEndChange}
                natalBirthDate={mode === 'natal' ? natalChart?.birthDate : null}
                chartKind={natalChart?.chartType}
              />
            </CollapsibleSection>
          )}

          {/* ── Presets (shared) ── */}
          {mode !== 'mundane' && (
            <CollapsibleSection id="presets" title="Presets" icon={<IconStar />}>
              <div className={styles.presetsBar}>
                {favorites.length > 0 && (
                  <PresetFavoritesList
                    favorites={favorites}
                    onLoadPreset={onLoadPreset}
                    onReorderPresets={onReorderPresets}
                  />
                )}
                <button
                  className={styles.presetsOpenBtn}
                  onClick={() => setPresetModalOpen(true)}
                >
                  {modePresets.length > 0
                    ? `All Presets (${modePresets.length})`
                    : 'Save / Load Presets'}
                </button>
              </div>
            </CollapsibleSection>
          )}

          {/* ── World Mode Content ── */}
          {mode === 'world' && (
            <CollapsibleSection id="customTransits" title="Custom Transits" icon={<IconSaturn />}>
              <TransitJobList
                transitJobs={transitJobs}
                curves={curves}
                signChanges={signChanges}
                loading={curvesLoading}
                onAddJob={onAddJob}
                onRemoveJob={onRemoveJob}
                onUpdateJob={onUpdateJob}
                onClearAll={onClearAllJobs}
              />
            </CollapsibleSection>
          )}

          {/* ── Natal Mode Content ── */}
          {mode === 'natal' && (
            <>
              <CollapsibleSection id="natalTransits" title="Natal Transits" icon={<IconSaturn />}>
                {!natalChart ? (
                  <div style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: 'var(--fg-subtle)',
                    fontSize: '11px',
                    letterSpacing: '0.02em',
                  }}>
                    Add birth data first
                  </div>
                ) : (
                  <NatalJobList
                    natalChart={natalChart}
                    natalJobs={natalJobs}
                    natalCurves={natalCurves}
                    natalSignChanges={natalSignChanges}
                    natalLoading={natalLoading}
                    onAddJob={onAddNatalJob}
                    onRemoveJob={onRemoveNatalJob}
                    onUpdateJob={onUpdateNatalJob}
                    onClearAll={onClearAllNatalJobs}
                  />
                )}
              </CollapsibleSection>

            </>
          )}

          {/* ── Mundane Mode Content ── */}
          {mode === 'mundane' && (
            <>
              {/* Projects (quick access in predictive mode) */}
              {!activeProject && (
                <CollapsibleSection id="mundaneProjects" title="Projects" icon={<IconFolder />}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className={styles.presetsOpenBtn}
                      onClick={onOpenProjectModal}
                      style={{ flex: 1, fontSize: '10px' }}
                    >
                      Open Project
                    </button>
                  </div>
                </CollapsibleSection>
              )}

              <CollapsibleSection id="chartStack" title="Chart Stack" icon={<IconStack />}>
                <ChartStackPanel
                  stackCharts={stackCharts || []}
                  onAddChart={onAddStackChart}
                  onRemoveChart={onRemoveStackChart}
                />
              </CollapsibleSection>

              <CollapsibleSection id="predictiveTransits" title="Predictive Transits" icon={<IconTarget />}>
                {(!stackCharts || stackCharts.length === 0) ? (
                  <div style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: 'var(--fg-subtle)',
                    fontSize: '11px',
                    letterSpacing: '0.02em',
                  }}>
                    Add charts to your stack first
                  </div>
                ) : (
                  <NatalJobList
                    natalChart={{
                      positions: mergeStackPositions(stackCharts),
                      angles: mergeStackAngles(stackCharts),
                    }}
                    natalJobs={mundaneJobs}
                    natalCurves={mundaneCurves}
                    onAddJob={onAddMundaneJob}
                    onRemoveJob={onRemoveMundaneJob}
                    onUpdateJob={onUpdateMundaneJob}
                    onClearAll={onClearAllMundaneJobs}
                  />
                )}
              </CollapsibleSection>
            </>
          )}

          {/* ── Colors (shared across all modes) ── */}
          <CollapsibleSection id="colors" title="Colors" icon={<IconPalette />}>
            <ColorSettings />
          </CollapsibleSection>

          {/* ── Orb Settings (shared) ── */}
          <OrbSettings
            orbSettings={orbSettings}
            onOrbChange={onOrbChange}
          />
        </div>

        {/* ── Theme toggle — anchored at sidebar bottom ── */}
        <div className={styles.sidebarFooter}>
          <ThemeToggle />
        </div>
      </aside>

      <PresetPickerModal
        open={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        onLoadPreset={onLoadPreset}
        currentMode={mode}
        currentJobs={currentJobs}
        hasJobs={hasJobs}
        startDate={startDate}
        endDate={endDate}
      />
    </>
  );
}

/**
 * Merge all planet positions from stacked charts into one object.
 * Uses the first chart's value for each planet (positions are static).
 * This is used to populate the NatalJobList target picker.
 */
function mergeStackPositions(charts) {
  const merged = {};
  for (const chart of charts) {
    if (!chart.positions) continue;
    for (const [key, val] of Object.entries(chart.positions)) {
      if (!(key in merged)) merged[key] = val;
    }
  }
  return merged;
}

function mergeStackAngles(charts) {
  const merged = {};
  for (const chart of charts) {
    if (!chart.angles) continue;
    for (const [key, val] of Object.entries(chart.angles)) {
      if (!(key in merged)) merged[key] = val;
    }
  }
  return merged;
}

// ─── Drag-and-drop favorites list ───
//
// Each row is HTML5-draggable. Drop a row onto another row and the
// reorder fires via onReorderPresets(orderedIds). Top row is the default
// preset (auto-loads on a fresh session) and shows the "default" badge.
function PresetFavoritesList({ favorites, onLoadPreset, onReorderPresets }) {
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  function handleDragStart(e, id) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
  }

  function handleDragOver(e, id) {
    if (!draggedId || draggedId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) setDragOverId(id);
  }

  function handleDragLeave(id) {
    if (dragOverId === id) setDragOverId(null);
  }

  function handleDrop(e, dropTargetId) {
    e.preventDefault();
    if (!draggedId || draggedId === dropTargetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    if (onReorderPresets) {
      const ids = favorites.map(p => p.id);
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(dropTargetId);
      if (fromIdx >= 0 && toIdx >= 0) {
        const next = ids.slice();
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, draggedId);
        onReorderPresets(next);
      }
    }
    setDraggedId(null);
    setDragOverId(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  return (
    <div className={styles.presetFavorites}>
      {favorites.map((preset, idx) => {
        const isDragging = draggedId === preset.id;
        const isDragOver = dragOverId === preset.id;
        const cls = [
          styles.presetFavRow,
          isDragging ? styles.presetFavRowDragging : '',
          isDragOver ? styles.presetFavRowDragOver : '',
        ].filter(Boolean).join(' ');
        return (
          <div
            key={preset.id}
            className={cls}
            draggable={!!onReorderPresets}
            onDragStart={(e) => handleDragStart(e, preset.id)}
            onDragOver={(e) => handleDragOver(e, preset.id)}
            onDragLeave={() => handleDragLeave(preset.id)}
            onDrop={(e) => handleDrop(e, preset.id)}
            onDragEnd={handleDragEnd}
          >
            <button
              className={styles.presetFavBtn}
              onClick={() => onLoadPreset(preset)}
              title={`Load "${preset.name}" (${preset.mode}) — drag to reorder`}
            >
              <span className={styles.presetFavStar}>{'★'}</span>
              <span className={styles.presetFavName}>{preset.name}</span>
              {idx === 0 && (
                <span className={styles.presetFavDefault}>default</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
