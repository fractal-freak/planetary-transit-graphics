import { useState } from 'react';
import { PLANETS, NATAL_ANGLES } from '../../data/planets';
import { formatDegree, formatNatalPosition } from '../../data/natalChart';
import { useAuth } from '../../contexts/AuthContext';
import {
  saveChart,
  setDefaultChartId,
  loadCharts,
} from '../../firebase/firestore';
import { useSFchtImport } from '../../hooks/useSFchtImport';
import { ZODIAC_SIGNS } from '../../data/zodiac';
import { PLANET_MAP } from '../../data/planets';
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
export default function ChartSection({
  natalChart,
  onNatalChartChange,
  timelordEnabled,
  onTimelordEnabledChange,
  timelordStartSign,
  onTimelordStartSignChange,
  currentTimelordSegments,
  onSelectChartWithNote,
}) {
  const { user, savedCharts, setSavedCharts, defaultChartId, setDefaultChartId: setDefId } = useAuth();

  const [view, setView] = useState('idle');
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    importStatus, dragOver, fileInputRef,
    handleDragOver, handleDragLeave, handleDrop, handleFileInput,
  } = useSFchtImport({
    onChartsImported: (charts) => {
      if (charts.length > 0) {
        // Load the first imported chart as the natal chart
        const first = charts[0];
        onNatalChartChange({
          id: first.id,
          name: first.name,
          chartType: first.chartType || 'natal',
          birthDate: first.birthDate,
          birthTime: first.birthTime,
          lat: first.lat,
          lng: first.lng,
          locationName: first.locationName,
          positions: first.positions,
          angles: first.angles || null,
        });
      }
    },
  });

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
    const defaultName = natalChart.name
      || (natalChart.locationName
        ? natalChart.locationName.split(',')[0].trim()
        : `Chart ${natalChart.birthDate}`);
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
      <div
        className={styles.savedChartsSection}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragOver ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            border: '2px dashed rgba(91, 138, 240, 0.5)',
            borderRadius: '8px',
            background: 'rgba(91, 138, 240, 0.05)',
            color: 'rgba(91, 138, 240, 0.8)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.03em',
            marginBottom: '8px',
          }}>
            Drop .SFcht file to import charts
          </div>
        ) : (
          <div className={styles.savedChartsEmpty} style={{ marginBottom: '8px' }}>
            Enter birth data or import a chart file
          </div>
        )}

        {importStatus && (
          <div style={{
            padding: '6px 10px',
            textAlign: 'center',
            fontSize: '10px',
            color: importStatus.startsWith('Import') && !importStatus.includes('failed')
              ? 'rgba(60, 140, 60, 0.7)'
              : importStatus.includes('failed') || importStatus.includes('Not')
                ? 'rgba(200, 50, 50, 0.6)'
                : 'rgba(0, 0, 0, 0.4)',
            fontWeight: 500,
            marginBottom: '4px',
          }}>
            {importStatus}
          </div>
        )}

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
        <button
          className={styles.wizardBtn}
          onClick={() => fileInputRef.current?.click()}
          style={{ width: '100%', marginTop: '4px' }}
        >
          + Import .SFcht
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".SFcht,.sfcht"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />

        <ChartPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelectChart={handleSelectFromPicker}
          onSelectChartWithNote={onSelectChartWithNote}
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

      {/* Time lord (annual profections) */}
      {onTimelordEnabledChange && (
        <TimelordControls
          enabled={timelordEnabled}
          onEnabledChange={onTimelordEnabledChange}
          startSign={timelordStartSign}
          onStartSignChange={onTimelordStartSignChange}
          segments={currentTimelordSegments}
          natalChart={natalChart}
        />
      )}

      <ChartPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectChart={handleSelectFromPicker}
        onSelectChartWithNote={onSelectChartWithNote}
        currentChartId={currentMatchId}
      />
    </div>
  );
}

// ── Chart Summary sub-component ──

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Format YYYY-MM-DD → "Mar 17, 1919".
function formatBirthDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = SHORT_MONTHS[parseInt(m[2], 10) - 1] || '';
  return `${month} ${parseInt(m[3], 10)}, ${m[1]}`;
}

// Format HH:MM (24h) → "9:00 AM".
function formatBirthTime(t) {
  if (!t) return '';
  const m = /^(\d{2}):(\d{2})/.exec(t);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const am = h < 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m[2]} ${am ? 'AM' : 'PM'}`;
}

function ChartSummary({ natalChart, savedChart, defaultChartId, onClear }) {
  const [expanded, setExpanded] = useState(false);

  const displayName = natalChart.name
    || savedChart?.name
    || 'Untitled chart';
  const chartType = natalChart.chartType || savedChart?.chartType || 'natal';

  return (
    <div className={styles.natalSummary}>
      {/* Collapsed header: always visible */}
      <div className={styles.natalSummaryHeader}>
        <button
          className={styles.summaryToggle}
          onClick={() => setExpanded(prev => !prev)}
          aria-expanded={expanded}
        >
          <span className={styles.chartNameText}>
            {displayName}
            {savedChart?.id === defaultChartId && (
              <span className={styles.savedChartDefault}> {'\u2605'}</span>
            )}
          </span>
          {chartType !== 'natal' && (
            <span className={styles.chartTypeBadge}>{chartType}</span>
          )}
          <svg
            className={`${styles.summaryChevron} ${expanded ? styles.summaryChevronOpen : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
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
          {/* Birth data \u2014 one piece per line, plenty of breathing room */}
          <div className={styles.natalBirthData}>
            <div className={styles.natalBirthLine}>{formatBirthDate(natalChart.birthDate)}</div>
            {natalChart.birthTime && (
              <div className={styles.natalBirthLineMuted}>{formatBirthTime(natalChart.birthTime)}</div>
            )}
            {natalChart.locationName && (
              <div className={styles.natalBirthLineMuted}>{natalChart.locationName}</div>
            )}
          </div>

          {/* Placements \u2014 single column, one row per body */}
          <div className={styles.natalPlacements}>
            {PLANETS.map(p => {
              const lon = natalChart.positions[p.id];
              if (lon == null) return null;
              const pos = formatNatalPosition(lon);
              const speed = natalChart.speeds?.[p.id];
              // Sun and Moon never go retrograde; the True Node moves
              // backward most of the time but it's conventional to flag
              // R only when it's actually moving retrograde at this
              // moment, which the speed handles correctly.
              const isRetrograde = speed != null && speed < 0 && p.id !== 'Sun' && p.id !== 'Moon';
              return (
                <div key={p.id} className={styles.natalPlacementRow}>
                  <span className={styles.natalPlacementGlyph}>{p.symbol}</span>
                  <span className={styles.natalPlacementName}>{p.name}</span>
                  <span className={styles.natalPlacementSign}>{pos.signSymbol}</span>
                  <span className={styles.natalPlacementDeg}>
                    {pos.deg}{'\u00B0'}<span className={styles.natalPlacementMin}>{pos.min}'</span>
                  </span>
                  <span className={styles.natalPlacementR}>
                    {isRetrograde ? 'R' : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {natalChart.angles && (
            <div className={`${styles.natalPlacements} ${styles.natalAngles}`}>
              {NATAL_ANGLES.map(a => {
                const lon = natalChart.angles[a.id];
                if (lon == null) return null;
                const pos = formatNatalPosition(lon);
                return (
                  <div key={a.id} className={styles.natalPlacementRow}>
                    <span className={`${styles.natalPlacementGlyph} ${styles.natalPlacementGlyphAngle}`}>
                      {a.symbol}
                    </span>
                    <span className={styles.natalPlacementName}>{a.name}</span>
                    <span className={styles.natalPlacementSign}>{pos.signSymbol}</span>
                    <span className={styles.natalPlacementDeg}>
                      {pos.deg}{'\u00B0'}<span className={styles.natalPlacementMin}>{pos.min}'</span>
                    </span>
                    <span className={styles.natalPlacementR}></span>
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

/** Tickbox + start-sign dropdown for annual profections / time lord highlight. */
function TimelordControls({ enabled, onEnabledChange, startSign, onStartSignChange, segments, natalChart }) {
  return (
    <div className={styles.timelordBox}>
      <label className={styles.timelordToggle}>
        <input
          type="checkbox"
          checked={!!enabled}
          onChange={e => onEnabledChange(e.target.checked)}
        />
        <span>Highlight time lord transits</span>
      </label>
      {enabled && (
        <div className={styles.timelordRow}>
          <span className={styles.timelordLabel}>Profect from</span>
          <select
            className={styles.timelordSelect}
            value={startSign === 'asc' ? 'asc' : String(startSign)}
            onChange={e => onStartSignChange(e.target.value === 'asc' ? 'asc' : Number(e.target.value))}
          >
            <option value="asc">Ascendant</option>
            {ZODIAC_SIGNS.map(s => (
              <option key={s.index} value={String(s.index)}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
      {/* One row per profection year overlapping the visible date range, so
          scrolling the timeline forward updates which lord(s) you're seeing. */}
      {enabled && segments && segments.length > 0 && (
        <div className={styles.timelordSegments}>
          {segments.map(seg => {
            const planet = PLANET_MAP[seg.planetId];
            if (!planet) return null;
            return (
              <div key={seg.age} className={styles.timelordCurrent}>
                <span className={styles.timelordCurrentLabel}>Year {seg.age + 1}</span>
                <span className={styles.timelordCurrentSep}>·</span>
                <span className={styles.timelordCurrentLord} style={{ color: planet.color }}>
                  {planet.symbol} {planet.name}
                </span>
                <span className={styles.timelordCurrentSep}>·</span>
                <span className={styles.timelordCurrentSign}>
                  {ZODIAC_SIGNS[seg.profectedSign].name} ({seg.profectedHouse}H)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
