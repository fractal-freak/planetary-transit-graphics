import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  saveChart,
  deleteChart,
  renameChart,
  setDefaultChartId,
  loadCharts,
} from '../../firebase/firestore';
import { formatDegree } from '../../data/natalChart';
import { PLANETS, NATAL_ANGLES } from '../../data/planets';
import styles from './Controls.module.css';

/**
 * Saved Charts panel — shown in the sidebar when user is signed in and in natal mode.
 *
 * Features:
 *  - Save current natal chart (with a custom name)
 *  - List saved charts
 *  - Load a saved chart
 *  - Set a chart as default (auto-loads on sign in)
 *  - Rename / delete saved charts
 */
export default function SavedCharts({ natalChart, onNatalChartChange }) {
  const { user, savedCharts, setSavedCharts, defaultChartId, setDefaultChartId: setDefId } = useAuth();
  const [saving, setSaving] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (!user) return null;

  function handleSaveClick() {
    // Pre-fill with a sensible default name
    const defaultName = natalChart.locationName
      ? natalChart.locationName.split(',')[0].trim()
      : `Chart ${natalChart.birthDate}`;
    setSaveName(defaultName);
    setShowNameInput(true);
  }

  async function handleSaveConfirm() {
    if (!natalChart || !saveName.trim()) return;
    setSaving(true);
    try {
      const chartId = await saveChart(user.uid, {
        ...natalChart,
        name: saveName.trim(),
      });

      // Refresh the list
      const charts = await loadCharts(user.uid);
      setSavedCharts(charts);

      // If this is the first chart, auto-set as default
      if (charts.length === 1) {
        await setDefaultChartId(user.uid, chartId);
        setDefId(chartId);
      }

      setShowNameInput(false);
      setSaveName('');
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleLoad(chart) {
    onNatalChartChange({
      birthDate: chart.birthDate,
      birthTime: chart.birthTime,
      lat: chart.lat,
      lng: chart.lng,
      locationName: chart.locationName,
      positions: chart.positions,
      angles: chart.angles || null,
    });
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

  function startRename(chart) {
    setEditingId(chart.id);
    setEditName(chart.name);
    setConfirmDeleteId(null);
  }

  // Check if current natal chart matches a saved one (by birth data)
  const currentMatchId = natalChart
    ? savedCharts.find(c =>
        c.birthDate === natalChart.birthDate &&
        c.birthTime === natalChart.birthTime &&
        c.lat === natalChart.lat &&
        c.lng === natalChart.lng
      )?.id
    : null;

  return (
    <div className={styles.savedChartsSection}>
      {/* Save button / name input */}
      {natalChart && !currentMatchId && !showNameInput && (
        <button
          className={`${styles.wizardBtn} ${styles.wizardBtnPrimary}`}
          onClick={handleSaveClick}
          disabled={saving}
          style={{ width: '100%', marginBottom: savedCharts.length > 0 ? '8px' : '0' }}
        >
          Save This Chart
        </button>
      )}

      {showNameInput && (
        <div className={styles.saveNameWrap}>
          <input
            className={styles.natalInput}
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveConfirm();
              if (e.key === 'Escape') { setShowNameInput(false); setSaveName(''); }
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
              onClick={() => { setShowNameInput(false); setSaveName(''); }}
              style={{ flex: 0 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {currentMatchId && natalChart && (
        <div className={styles.savedChartSavedNote}>
          Chart saved
        </div>
      )}

      {/* Saved charts list */}
      {savedCharts.length > 0 && (
        <div className={styles.savedChartsList}>
          {savedCharts.map(chart => (
            <div
              key={chart.id}
              className={`${styles.savedChartItem} ${
                currentMatchId === chart.id ? styles.savedChartItemActive : ''
              }`}
            >
              {editingId === chart.id ? (
                /* Rename mode */
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
                    <button
                      className={styles.savedChartAction}
                      onClick={() => handleRename(chart.id)}
                    >
                      Save
                    </button>
                    <button
                      className={styles.savedChartAction}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : confirmDeleteId === chart.id ? (
                /* Delete confirmation */
                <div className={styles.savedChartDeleteConfirm}>
                  <span className={styles.savedChartDeleteText}>Delete this chart?</span>
                  <div className={styles.savedChartRenameActions}>
                    <button
                      className={styles.savedChartActionDanger}
                      onClick={() => handleDelete(chart.id)}
                    >
                      Delete
                    </button>
                    <button
                      className={styles.savedChartAction}
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal display */
                <>
                  <button
                    className={styles.savedChartLoad}
                    onClick={() => handleLoad(chart)}
                  >
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
                      onClick={() => startRename(chart)}
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
      )}

      {savedCharts.length === 0 && !natalChart && (
        <div className={styles.savedChartsEmpty}>
          Calculate a chart, then save it here
        </div>
      )}
    </div>
  );
}
