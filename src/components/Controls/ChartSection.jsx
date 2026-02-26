import { useState } from 'react';
import { PLANETS, NATAL_ANGLES } from '../../data/planets';
import { formatDegree } from '../../data/natalChart';
import { useAuth } from '../../contexts/AuthContext';
import {
  saveChart,
  setDefaultChartId,
  loadCharts,
} from '../../firebase/firestore';
import NatalDataInput from './NatalDataInput';
import ChartPickerModal from './ChartPickerModal';
import styles from './Controls.module.css';

/**
 * ChartSection — unified natal chart section.
 *
 * Views:
 *   idle     → EMPTY (no chart) or SUMMARY (chart loaded)
 *   creating → NatalDataInput form
 *   saving   → inline name input to save current chart
 *
 * The chart picker is now a full-screen modal (ChartPickerModal),
 * triggered by the "Select Chart" button.
 */
export default function ChartSection({ natalChart, onNatalChartChange }) {
  const { user, savedCharts, setSavedCharts, defaultChartId, setDefaultChartId: setDefId } = useAuth();

  const [view, setView] = useState('idle');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Save flow
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const hasSavedCharts = user && savedCharts.length > 0;

  // Check if current chart matches a saved one
  const currentMatchId = natalChart
    ? savedCharts.find(c =>
        c.birthDate === natalChart.birthDate &&
        c.birthTime === natalChart.birthTime &&
        c.lat === natalChart.lat &&
        c.lng === natalChart.lng
      )?.id
    : null;

  const currentSavedChart = currentMatchId
    ? savedCharts.find(c => c.id === currentMatchId)
    : null;

  // ── Handlers ──

  function handleNewChart() {
    setView('creating');
  }

  function handleCancelCreate() {
    setView('idle');
  }

  function handleChartCreated(chartData) {
    onNatalChartChange(chartData);
    setView('idle');
  }

  function handleClearChart() {
    onNatalChartChange(null);
    setView('idle');
  }

  function handleStartSave() {
    const defaultName = natalChart.locationName
      ? natalChart.locationName.split(',')[0].trim()
      : `Chart ${natalChart.birthDate}`;
    setSaveName(defaultName);
    setView('saving');
  }

  async function handleSaveConfirm() {
    if (!natalChart || !saveName.trim()) return;
    setSaving(true);
    try {
      const chartId = await saveChart(user.uid, {
        ...natalChart,
        name: saveName.trim(),
      });
      const charts = await loadCharts(user.uid);
      setSavedCharts(charts);
      if (charts.length === 1) {
        await setDefaultChartId(user.uid, chartId);
        setDefId(chartId);
      }
      setView('idle');
      setSaveName('');
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelSave() {
    setView('idle');
    setSaveName('');
  }

  function handleSelectFromPicker(chartData) {
    onNatalChartChange(chartData);
  }

  // ── CREATING view ──
  if (view === 'creating') {
    return (
      <div>
        <div className={styles.chartPickerHeader}>
          <span className={styles.chartPickerTitle}>New Chart</span>
          <button className={styles.wizardClose} onClick={handleCancelCreate}>
            &times;
          </button>
        </div>
        <NatalDataInput
          onNatalChartChange={handleChartCreated}
          onCancel={handleCancelCreate}
        />
      </div>
    );
  }

  // ── SAVING view (inline name input) ──
  if (view === 'saving') {
    return (
      <div>
        {/* Still show the summary above the save input */}
        <ChartSummary
          natalChart={natalChart}
          savedChart={currentSavedChart}
          defaultChartId={defaultChartId}
        />
        <div className={styles.saveNameWrap}>
          <input
            className={styles.natalInput}
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveConfirm();
              if (e.key === 'Escape') handleCancelSave();
            }}
            placeholder="Name this chart..."
            autoFocus
            style={{ fontSize: '11px' }}
          />
          <div className={styles.saveNameActions}>
            <button
              className={`${styles.wizardBtn} ${styles.wizardBtnPrimary}`}
              onClick={handleSaveConfirm}
              disabled={saving || !saveName.trim()}
              style={{ flex: 1 }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              className={styles.wizardBtn}
              onClick={handleCancelSave}
              style={{ flex: 0 }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── IDLE: EMPTY or SUMMARY ──

  if (!natalChart) {
    // EMPTY state
    return (
      <div className={styles.savedChartsSection}>
        <div className={styles.savedChartsEmpty} style={{ marginBottom: '8px' }}>
          Enter birth data to begin
        </div>
        <button
          className={`${styles.wizardBtn} ${styles.wizardBtnPrimary}`}
          onClick={handleNewChart}
          style={{ width: '100%' }}
        >
          + New Chart
        </button>
        {hasSavedCharts && (
          <button
            className={styles.wizardBtn}
            onClick={() => setPickerOpen(true)}
            style={{ width: '100%', marginTop: '4px' }}
          >
            Select Chart
          </button>
        )}

        <ChartPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelectChart={handleSelectFromPicker}
          currentChartId={currentMatchId}
        />
      </div>
    );
  }

  // SUMMARY state
  return (
    <div>
      <ChartSummary
        natalChart={natalChart}
        savedChart={currentSavedChart}
        defaultChartId={defaultChartId}
        onClear={handleClearChart}
      />

      {/* Action bar */}
      <div className={styles.chartActionBar}>
        <button className={styles.chartActionBtn} onClick={handleNewChart}>New</button>
        {hasSavedCharts && (
          <>
            <span className={styles.chartActionDot}>{'\u00B7'}</span>
            <button className={styles.chartActionBtn} onClick={() => setPickerOpen(true)}>Select Chart</button>
          </>
        )}
        {user && !currentMatchId && (
          <>
            <span className={styles.chartActionDot}>{'\u00B7'}</span>
            <button className={styles.chartActionBtn} onClick={handleStartSave}>Save</button>
          </>
        )}
      </div>

      <ChartPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectChart={handleSelectFromPicker}
        currentChartId={currentMatchId}
      />
    </div>
  );
}

// ── Chart Summary sub-component ──

function ChartSummary({ natalChart, savedChart, defaultChartId, onClear }) {
  const [expanded, setExpanded] = useState(false);

  const displayName = savedChart
    ? savedChart.name
    : `${natalChart.birthDate} \u00B7 ${natalChart.birthTime || '12:00'}`;

  return (
    <div className={styles.natalSummary}>
      {/* Collapsed header: always visible */}
      <div className={styles.natalSummaryHeader}>
        <button
          className={styles.summaryToggle}
          onClick={() => setExpanded(prev => !prev)}
          aria-expanded={expanded}
        >
          <span className={styles.summaryChevron}>
            {expanded ? '\u25BE' : '\u25B8'}
          </span>
          <span className={styles.chartNameText}>
            {displayName}
            {savedChart?.id === defaultChartId && (
              <span className={styles.savedChartDefault}> {'\u2605'}</span>
            )}
          </span>
        </button>
        {onClear && (
          <button className={styles.natalClearBtn} onClick={onClear}>
            &times;
          </button>
        )}
      </div>

      {/* Expandable detail */}
      <div className={`${styles.summaryBody} ${expanded ? styles.summaryBodyOpen : ''}`}>
        <div className={styles.summaryBodyInner}>
          {savedChart && (
            <div className={styles.natalSummaryDate} style={{ marginTop: 2 }}>
              {natalChart.birthDate} {'\u00B7'} {natalChart.birthTime || '12:00'}
            </div>
          )}

          {natalChart.locationName && (
            <div className={styles.natalSummaryLocation}>
              {natalChart.locationName}
            </div>
          )}

          <div className={styles.natalGrid}>
            {PLANETS.map(p => {
              const lon = natalChart.positions[p.id];
              if (lon == null) return null;
              return (
                <div key={p.id} className={styles.natalGridItem}>
                  <span className={styles.natalGridSymbol}>{p.symbol}</span>
                  <span className={styles.natalGridDeg}>{formatDegree(lon)}</span>
                </div>
              );
            })}
          </div>

          {natalChart.angles && (
            <div className={styles.natalGrid} style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              {NATAL_ANGLES.map(a => {
                const lon = natalChart.angles[a.id];
                if (lon == null) return null;
                return (
                  <div key={a.id} className={styles.natalGridItem}>
                    <span className={styles.natalGridSymbol} style={{ fontSize: '10px', fontWeight: 700 }}>{a.symbol}</span>
                    <span className={styles.natalGridDeg}>{formatDegree(lon)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
