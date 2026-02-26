import { useState } from 'react';
import { PLANETS, NATAL_ANGLES } from '../../data/planets';
import { formatDegree } from '../../data/natalChart';
import { useAuth } from '../../contexts/AuthContext';
import {
  saveChart,
  deleteChart,
  renameChart,
  setDefaultChartId,
  loadCharts,
} from '../../firebase/firestore';
import NatalDataInput from './NatalDataInput';
import styles from './Controls.module.css';

/**
 * ChartSection — unified natal chart section.
 *
 * Views:
 *   idle     → EMPTY (no chart) or SUMMARY (chart loaded)
 *   creating → NatalDataInput form
 *   picking  → scrollable saved charts picker
 *   saving   → inline name input to save current chart
 */
export default function ChartSection({ natalChart, onNatalChartChange }) {
  const { user, savedCharts, setSavedCharts, defaultChartId, setDefaultChartId: setDefId } = useAuth();

  const [view, setView] = useState('idle');
  const [searchQuery, setSearchQuery] = useState('');

  // Save flow
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  // Picker inline edit/delete
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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

  function handleOpenPicker() {
    setSearchQuery('');
    setEditingId(null);
    setConfirmDeleteId(null);
    setView('picking');
  }

  function handleClosePicker() {
    setView('idle');
    setSearchQuery('');
  }

  function handleLoadChart(chart) {
    onNatalChartChange({
      birthDate: chart.birthDate,
      birthTime: chart.birthTime,
      lat: chart.lat,
      lng: chart.lng,
      locationName: chart.locationName,
      positions: chart.positions,
      angles: chart.angles || null,
    });
    setView('idle');
    setSearchQuery('');
  }

  async function handleSetDefault(chartId) {
    try {
      const newDefault = chartId === defaultChartId ? null : chartId;
      await setDefaultChartId(user.uid, newDefault);
      setDefId(newDefault);
    } catch (err) {
      console.error('Set default failed:', err);
    }
  }

  async function handleDelete(chartId) {
    try {
      await deleteChart(user.uid, chartId);
      const charts = await loadCharts(user.uid);
      setSavedCharts(charts);
      if (defaultChartId === chartId) {
        await setDefaultChartId(user.uid, null);
        setDefId(null);
      }
      setConfirmDeleteId(null);
      // If we deleted the currently loaded chart, clear it
      if (currentMatchId === chartId) {
        onNatalChartChange(null);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function handleRename(chartId) {
    if (!editName.trim()) return;
    try {
      await renameChart(user.uid, chartId, editName.trim());
      const charts = await loadCharts(user.uid);
      setSavedCharts(charts);
      setEditingId(null);
      setEditName('');
    } catch (err) {
      console.error('Rename failed:', err);
    }
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

  // ── PICKING view ──
  if (view === 'picking') {
    // Sort: default chart first, then newest
    const sorted = [...savedCharts].sort((a, b) => {
      if (a.id === defaultChartId) return -1;
      if (b.id === defaultChartId) return 1;
      return 0; // keep existing order (newest first from Firestore)
    });

    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? sorted.filter(c =>
          (c.name || '').toLowerCase().includes(query) ||
          (c.locationName || '').toLowerCase().includes(query) ||
          (c.birthDate || '').includes(query)
        )
      : sorted;

    return (
      <div>
        <div className={styles.chartPickerHeader}>
          <span className={styles.chartPickerTitle}>Saved Charts</span>
          <button className={styles.wizardClose} onClick={handleClosePicker}>
            &times;
          </button>
        </div>

        {savedCharts.length >= 6 && (
          <input
            className={`${styles.natalInput} ${styles.chartPickerSearch}`}
            type="text"
            placeholder="Search charts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        )}

        <div className={styles.chartPickerList}>
          {filtered.length === 0 && (
            <div className={styles.savedChartsEmpty}>No charts match</div>
          )}
          {filtered.map(chart => (
            <div
              key={chart.id}
              className={`${styles.savedChartItem} ${
                currentMatchId === chart.id ? styles.savedChartItemActive : ''
              }`}
            >
              {editingId === chart.id ? (
                <div className={styles.savedChartRename}>
                  <input
                    className={styles.natalInput}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(chart.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    style={{ fontSize: '11px', padding: '4px 6px' }}
                  />
                  <div className={styles.savedChartRenameActions}>
                    <button className={styles.savedChartAction} onClick={() => handleRename(chart.id)}>Save</button>
                    <button className={styles.savedChartAction} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : confirmDeleteId === chart.id ? (
                <div className={styles.savedChartDeleteConfirm}>
                  <span className={styles.savedChartDeleteText}>Delete this chart?</span>
                  <div className={styles.savedChartRenameActions}>
                    <button className={styles.savedChartActionDanger} onClick={() => handleDelete(chart.id)}>Delete</button>
                    <button className={styles.savedChartAction} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <button className={styles.savedChartLoad} onClick={() => handleLoadChart(chart)}>
                    <span className={styles.savedChartName}>
                      {chart.name}
                      {chart.id === defaultChartId && (
                        <span className={styles.savedChartDefault}> (default)</span>
                      )}
                    </span>
                    <span className={styles.savedChartMeta}>
                      {chart.birthDate} {chart.birthTime && `\u00B7 ${chart.birthTime}`}
                    </span>
                  </button>
                  <div className={styles.savedChartActions}>
                    <button
                      className={styles.savedChartAction}
                      onClick={() => handleSetDefault(chart.id)}
                      title={chart.id === defaultChartId ? 'Remove as default' : 'Set as default'}
                    >
                      {chart.id === defaultChartId ? '\u2605' : '\u2606'}
                    </button>
                    <button
                      className={styles.savedChartAction}
                      onClick={() => { setEditingId(chart.id); setEditName(chart.name); setConfirmDeleteId(null); }}
                      title="Rename"
                    >
                      {'\u270E'}
                    </button>
                    <button
                      className={styles.savedChartAction}
                      onClick={() => { setConfirmDeleteId(chart.id); setEditingId(null); }}
                      title="Delete"
                    >
                      &times;
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
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
            onClick={handleOpenPicker}
            style={{ width: '100%', marginTop: '4px' }}
          >
            Load Saved
          </button>
        )}
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
            <button className={styles.chartActionBtn} onClick={handleOpenPicker}>Switch</button>
          </>
        )}
        {user && !currentMatchId && (
          <>
            <span className={styles.chartActionDot}>{'\u00B7'}</span>
            <button className={styles.chartActionBtn} onClick={handleStartSave}>Save</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Chart Summary sub-component ──

function ChartSummary({ natalChart, savedChart, defaultChartId, onClear }) {
  return (
    <div className={styles.natalSummary}>
      <div className={styles.natalSummaryHeader}>
        {savedChart ? (
          <span className={styles.chartNameText}>
            {savedChart.name}
            {savedChart.id === defaultChartId && (
              <span className={styles.savedChartDefault}> {'\u2605'}</span>
            )}
          </span>
        ) : (
          <span className={styles.natalSummaryDate}>
            {natalChart.birthDate} {'\u00B7'} {natalChart.birthTime || '12:00'}
          </span>
        )}
        {onClear && (
          <button className={styles.natalClearBtn} onClick={onClear}>
            &times;
          </button>
        )}
      </div>

      {savedChart && (
        <div className={styles.natalSummaryDate} style={{ marginTop: -2 }}>
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
  );
}
