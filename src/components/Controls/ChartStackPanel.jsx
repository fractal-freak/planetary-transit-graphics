import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getChartType, CHART_TYPES } from '../../data/chartTypes';
import { formatDegree } from '../../data/natalChart';
import { findAriesIngress, findLunations, castEventChart } from '../../api/mundaneEvents';
import { saveChart as firestoreSaveChart } from '../../firebase/firestore';
import { useSFchtImport } from '../../hooks/useSFchtImport';
import styles from './Controls.module.css';

/**
 * Panel for managing the active chart stack in predictive mode.
 * Shows stacked charts, allows adding/removing charts from the stack,
 * provides shortcuts for generating event charts, and supports
 * drag-and-drop import of Solar Fire .SFcht files.
 */
export default function ChartStackPanel({
  stackCharts,
  onAddChart,
  onRemoveChart,
}) {
  const { user, savedCharts, setSavedCharts } = useAuth();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showEventGen, setShowEventGen] = useState(false);
  const [eventType, setEventType] = useState('aries_ingress');
  const [eventYear, setEventYear] = useState(new Date().getFullYear());
  const [eventLat, setEventLat] = useState('38.9072');
  const [eventLng, setEventLng] = useState('-77.0369');
  const [eventLocation, setEventLocation] = useState('Washington, DC');
  const [generating, setGenerating] = useState(false);

  const {
    importStatus, dragOver, fileInputRef,
    handleDragOver, handleDragLeave, handleDrop, handleFileInput,
  } = useSFchtImport({
    onChartsImported: (charts) => {
      for (const chart of charts) {
        onAddChart(chart);
      }
    },
  });

  async function handleGenerateEvent() {
    setGenerating(true);
    try {
      let charts = [];
      const lat = parseFloat(eventLat);
      const lng = parseFloat(eventLng);

      if (eventType === 'aries_ingress') {
        const date = findAriesIngress(eventYear);
        const chart = castEventChart({
          eventDate: date,
          lat, lng,
          locationName: eventLocation,
          chartType: 'aries_ingress',
          name: `Aries Ingress ${eventYear}`,
          eventDescription: `Sun enters 0\u00B0 Aries, ${eventYear}`,
        });
        charts = [chart];
      } else if (eventType === 'lunation') {
        const start = new Date(Date.UTC(eventYear, 0, 1));
        const end = new Date(Date.UTC(eventYear, 11, 31));
        const lunations = findLunations(start, end);

        charts = lunations.map(l => castEventChart({
          eventDate: l.date,
          lat, lng,
          locationName: eventLocation,
          chartType: 'lunation',
          name: `${l.type === 'new' ? 'New Moon' : 'Full Moon'} ${l.date.toISOString().slice(0, 10)}`,
          eventDescription: `${l.type === 'new' ? 'New Moon' : 'Full Moon'} at ${formatDegree(l.type === 'new' ? 0 : 180)}`,
        }));
      }

      for (const chart of charts) {
        if (user) {
          const chartId = await firestoreSaveChart(user.uid, chart);
          const savedChart = { id: chartId, ...chart };
          setSavedCharts(prev => [savedChart, ...prev]);
          onAddChart(savedChart);
        } else {
          const localChart = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...chart };
          onAddChart(localChart);
        }
      }

      setShowEventGen(false);
    } catch (err) {
      console.error('Failed to generate event chart:', err);
    }
    setGenerating(false);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {dragOver && (
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
      )}

      {/* Import status */}
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
          letterSpacing: '0.02em',
          marginBottom: '4px',
        }}>
          {importStatus}
        </div>
      )}

      {/* Stacked charts list */}
      {stackCharts.length === 0 && !dragOver ? (
        <div
          style={{
            padding: '20px 12px',
            textAlign: 'center',
            color: 'rgba(0,0,0,0.2)',
            fontSize: '11px',
            letterSpacing: '0.02em',
            border: '1px dashed rgba(0,0,0,0.08)',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          Drop .SFcht files here or click to browse
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
          {stackCharts.map(chart => {
            const ct = getChartType(chart.chartType);
            return (
              <div
                key={chart.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.03)',
                  borderRadius: '6px',
                  borderLeft: `3px solid ${ct.color}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chart.name}
                  </div>
                  <div style={{ fontSize: '9px', color: 'rgba(0,0,0,0.35)', marginTop: '1px' }}>
                    {ct.label} · {chart.birthDate || '\u2014'}
                  </div>
                </div>
                <button
                  onClick={() => onRemoveChart(chart.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(0,0,0,0.25)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 4px',
                    lineHeight: 1,
                  }}
                  title="Remove from stack"
                >
                  {'\u00D7'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".SFcht,.sfcht"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      {/* Add buttons */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {/* Import .SFcht file */}
        <button
          className={styles.presetsOpenBtn}
          onClick={() => fileInputRef.current?.click()}
          style={{ flex: 1, fontSize: '10px' }}
        >
          + Import .SFcht
        </button>

        {/* Add from saved charts */}
        {user && savedCharts.length > 0 && (
          <div style={{ position: 'relative', flex: 1 }}>
            <button
              className={styles.presetsOpenBtn}
              onClick={() => setShowAddMenu(!showAddMenu)}
              style={{ width: '100%', fontSize: '10px' }}
            >
              + Saved Chart
            </button>
            {showAddMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 100,
                maxHeight: '200px',
                overflowY: 'auto',
                marginTop: '4px',
              }}>
                {savedCharts
                  .filter(c => !stackCharts.some(sc => sc.id === c.id))
                  .map(chart => {
                    const ct = getChartType(chart.chartType);
                    return (
                      <button
                        key={chart.id}
                        onClick={() => {
                          onAddChart(chart);
                          setShowAddMenu(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 10px',
                          border: 'none',
                          background: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '11px',
                          borderBottom: '1px solid rgba(0,0,0,0.05)',
                        }}
                      >
                        <span style={{ color: ct.color, marginRight: '4px' }}>{'\u25CF'}</span>
                        {chart.name}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Generate event chart */}
        <button
          className={styles.presetsOpenBtn}
          onClick={() => setShowEventGen(!showEventGen)}
          style={{ flex: 1, fontSize: '10px' }}
        >
          + Event Chart
        </button>
      </div>

      {/* Event chart generator */}
      {showEventGen && (
        <div style={{
          marginTop: '8px',
          padding: '10px',
          background: 'rgba(0,0,0,0.03)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          <select
            value={eventType}
            onChange={e => setEventType(e.target.value)}
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(0,0,0,0.1)',
              fontSize: '11px',
              background: '#fff',
            }}
          >
            {Object.values(CHART_TYPES).filter(t => t.id !== 'natal').map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type="number"
              value={eventYear}
              onChange={e => setEventYear(parseInt(e.target.value))}
              placeholder="Year"
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '11px',
              }}
            />
          </div>

          <input
            type="text"
            value={eventLocation}
            onChange={e => setEventLocation(e.target.value)}
            placeholder="Location name"
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(0,0,0,0.1)',
              fontSize: '11px',
            }}
          />

          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type="number"
              step="0.0001"
              value={eventLat}
              onChange={e => setEventLat(e.target.value)}
              placeholder="Latitude"
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '11px',
              }}
            />
            <input
              type="number"
              step="0.0001"
              value={eventLng}
              onChange={e => setEventLng(e.target.value)}
              placeholder="Longitude"
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '11px',
              }}
            />
          </div>

          <button
            className={styles.presetsOpenBtn}
            onClick={handleGenerateEvent}
            disabled={generating}
            style={{ fontSize: '11px' }}
          >
            {generating ? 'Generating\u2026' : 'Generate & Add to Stack'}
          </button>
        </div>
      )}
    </div>
  );
}
