import DateRangePicker from './DateRangePicker';
import TransitJobList from './TransitJobList';
import NatalDataInput from './NatalDataInput';
import NatalJobList from './NatalJobList';
import OrbSettings from './OrbSettings';
import styles from './Controls.module.css';

export default function Controls({
  mode,
  onModeChange,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  transitJobs,
  curves,
  onAddJob,
  onRemoveJob,
  onUpdateJob,
  orbSettings,
  onOrbChange,
  isOpen,
  onToggleOpen,
  /* natal props (wired later) */
  natalChart,
  onNatalChartChange,
  natalJobs,
  natalCurves,
  onAddNatalJob,
  onRemoveNatalJob,
  onUpdateNatalJob,
}) {
  return (
    <>
      <button className={styles.mobileToggle} onClick={onToggleOpen} aria-expanded={isOpen}>
        {isOpen ? '✕ Close' : '⚙ Settings'}
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
          </div>

          {/* ── Date Range (shared) ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Date Range</h2>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartChange={onStartChange}
              onEndChange={onEndChange}
            />
          </section>

          {/* ── World Mode Content ── */}
          {mode === 'world' && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Transits</h2>
              <TransitJobList
                transitJobs={transitJobs}
                curves={curves}
                onAddJob={onAddJob}
                onRemoveJob={onRemoveJob}
                onUpdateJob={onUpdateJob}
              />
            </section>
          )}

          {/* ── Natal Mode Content ── */}
          {mode === 'natal' && (
            <>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Birth Chart</h2>
                <NatalDataInput
                  natalChart={natalChart}
                  onNatalChartChange={onNatalChartChange}
                />
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Natal Transits</h2>
                {!natalChart ? (
                  <div style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: 'rgba(0,0,0,0.2)',
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
              </section>
            </>
          )}

          {/* ── Orb Settings (shared) ── */}
          <OrbSettings
            orbSettings={orbSettings}
            onOrbChange={onOrbChange}
          />
        </div>
      </aside>
    </>
  );
}
