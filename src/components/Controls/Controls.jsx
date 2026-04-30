import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import DateRangePicker from './DateRangePicker';
import TransitJobList from './TransitJobList';
import ChartSection from './ChartSection';
import NatalJobList from './NatalJobList';
import ChartStackPanel from './ChartStackPanel';
import OrbSettings from './OrbSettings';
import PresetPickerModal from './PresetPickerModal';
import CollapsibleSection from './CollapsibleSection';
import ThemeToggle from './ThemeToggle';
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
  onUpdateJob,
  orbSettings,
  onOrbChange,
  isOpen,
  onToggleOpen,
  natalChart,
  onNatalChartChange,
  natalJobs,
  natalCurves,
  onAddNatalJob,
  onRemoveNatalJob,
  onUpdateNatalJob,
  onLoadPreset,
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
          {/* ── Mode Tabs ── */}
          <div className={styles.modeTabs}>
            <button
              className={`${styles.modeTab} ${mode === 'world' ? styles.modeTabActive : ''}`}
              onClick={() => onModeChange('world')}
            >
              World
            </button>
            <button
              className={`${styles.modeTab} ${mode === 'natal' ? styles.modeTabActive : ''}`}
              onClick={() => onModeChange('natal')}
            >
              Natal
            </button>
            <button
              className={`${styles.modeTab} ${mode === 'mundane' ? styles.modeTabActive : ''}`}
              onClick={() => onModeChange('mundane')}
            >
              Predictive
            </button>
          </div>

          {/* ── Active Project ── */}
          {activeProject && (
            <CollapsibleSection id="project" title="Project">
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

          {/* Date Range — Graph page only; the Calendar page has its own
              header with Month/Year, prev/next, and Today buttons. */}
          {page !== 'calendar' && (
            <CollapsibleSection id="dateRange" title="Date Range">
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartChange={onStartChange}
                onEndChange={onEndChange}
              />
            </CollapsibleSection>
          )}

          {/* ── Presets (shared) ── */}
          {mode !== 'mundane' && (
            <CollapsibleSection id="presets" title="Presets">
              <div className={styles.presetsBar}>
                {favorites.length > 0 && (
                  <div className={styles.presetFavorites}>
                    {favorites.map(preset => (
                      <button
                        key={preset.id}
                        className={styles.presetFavBtn}
                        onClick={() => onLoadPreset(preset)}
                        title={`Load "${preset.name}" (${preset.mode})`}
                      >
                        <span className={styles.presetFavStar}>{'★'}</span>
                        <span className={styles.presetFavName}>{preset.name}</span>
                      </button>
                    ))}
                  </div>
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
            <CollapsibleSection id="customTransits" title="Custom Transits">
              <TransitJobList
                transitJobs={transitJobs}
                curves={curves}
                signChanges={signChanges}
                loading={curvesLoading}
                onAddJob={onAddJob}
                onRemoveJob={onRemoveJob}
                onUpdateJob={onUpdateJob}
              />
            </CollapsibleSection>
          )}

          {/* ── Natal Mode Content ── */}
          {mode === 'natal' && (
            <>
              <CollapsibleSection id="chart" title="Chart">
                <ChartSection
                  natalChart={natalChart}
                  onNatalChartChange={onNatalChartChange}
                />
              </CollapsibleSection>

              <CollapsibleSection id="natalTransits" title="Natal Transits">
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
                    onAddJob={onAddNatalJob}
                    onRemoveJob={onRemoveNatalJob}
                    onUpdateJob={onUpdateNatalJob}
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
                <CollapsibleSection id="mundaneProjects" title="Projects">
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

              <CollapsibleSection id="chartStack" title="Chart Stack">
                <ChartStackPanel
                  stackCharts={stackCharts || []}
                  onAddChart={onAddStackChart}
                  onRemoveChart={onRemoveStackChart}
                />
              </CollapsibleSection>

              <CollapsibleSection id="predictiveTransits" title="Predictive Transits">
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
                  />
                )}
              </CollapsibleSection>
            </>
          )}

          {/* ── Orb Settings (shared) ── */}
          <OrbSettings
            orbSettings={orbSettings}
            onOrbChange={onOrbChange}
          />

          {/* ── Theme toggle (sidebar bottom) ── */}
          <div className={styles.sidebarSpacer} />
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
