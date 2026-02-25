import { useState, useRef, useCallback, useEffect } from 'react';
import { PLANETS, PLANET_MAP, NATAL_ANGLES } from '../../data/planets';
import { computeNatalPositions, computeNatalAngles, combineDateAndTime, formatDegree } from '../../data/natalChart';
import styles from './Controls.module.css';

/**
 * NatalDataInput — Birth data entry and natal position display.
 *
 * Collapsed: shows date/time/location inputs + Calculate button.
 * Expanded (after calculation): shows compact grid of natal positions.
 */
export default function NatalDataInput({ natalChart, onNatalChartChange }) {
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('12:00');
  const [location, setLocation] = useState('');
  const [locationData, setLocationData] = useState(null); // { lat, lng, name }
  const [locationResults, setLocationResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function handleCalculate() {
    if (!birthDate) return;
    const dateTime = combineDateAndTime(birthDate, birthTime);
    const positions = computeNatalPositions(dateTime);
    // Compute chart angles when birth location (lat/lng) is available
    const lat = locationData?.lat;
    const lng = locationData?.lng;
    const angles = (lat != null && lng != null)
      ? computeNatalAngles(dateTime, lat, lng)
      : null;
    onNatalChartChange({
      birthDate,
      birthTime,
      lat: lat || null,
      lng: lng || null,
      locationName: locationData?.name || location || null,
      positions,
      angles,
    });
  }

  function handleClear() {
    onNatalChartChange(null);
    setBirthDate('');
    setBirthTime('12:00');
    setLocation('');
    setLocationData(null);
    setLocationResults([]);
  }

  async function handleLocationSearch(query) {
    const searchTerm = query || location.trim();
    if (!searchTerm || searchTerm.length < 2) return;
    setSearching(true);
    try {
      const q = encodeURIComponent(searchTerm);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await resp.json();
      setLocationResults(
        data.map(r => ({
          name: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
        }))
      );
    } catch {
      setLocationResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleSelectLocation(loc) {
    setLocationData(loc);
    setLocation(loc.name.split(',').slice(0, 2).join(','));
    setLocationResults([]);
  }

  // ── If natal chart is set, show positions summary ──
  if (natalChart) {
    return (
      <div className={styles.natalSummary}>
        <div className={styles.natalSummaryHeader}>
          <span className={styles.natalSummaryDate}>
            {natalChart.birthDate} · {natalChart.birthTime || '12:00'}
          </span>
          <button className={styles.natalClearBtn} onClick={handleClear}>
            Clear
          </button>
        </div>

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

  // ── Input form ──
  return (
    <div className={styles.natalForm}>
      <div className={styles.natalFormRow}>
        <label className={styles.natalLabel}>
          <span className={styles.natalLabelText}>Date</span>
          <input
            type="date"
            className={styles.natalInput}
            value={birthDate}
            onChange={e => setBirthDate(e.target.value)}
          />
        </label>
        <label className={styles.natalLabel}>
          <span className={styles.natalLabelText}>Time</span>
          <input
            type="time"
            className={styles.natalInput}
            value={birthTime}
            onChange={e => setBirthTime(e.target.value)}
          />
        </label>
      </div>

      <label className={styles.natalLabel}>
        <span className={styles.natalLabelText}>Location</span>
        <div className={styles.natalLocationWrap}>
          <input
            type="text"
            className={styles.natalInput}
            value={location}
            onChange={e => {
              const val = e.target.value;
              setLocation(val);
              setLocationData(null);
              // Debounced auto-search after 3+ characters
              if (debounceRef.current) clearTimeout(debounceRef.current);
              if (val.trim().length >= 3) {
                debounceRef.current = setTimeout(() => {
                  handleLocationSearch(val.trim());
                }, 400);
              } else {
                setLocationResults([]);
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (debounceRef.current) clearTimeout(debounceRef.current);
                handleLocationSearch();
              }
            }}
            placeholder="City, Country"
          />
          {locationData && (
            <span className={styles.natalLocationCheck}>✓</span>
          )}
        </div>
      </label>

      {/* Location search results dropdown */}
      {locationResults.length > 0 && (
        <div className={styles.natalLocationResults}>
          {locationResults.map((loc, i) => (
            <button
              key={i}
              className={styles.natalLocationResult}
              onClick={() => handleSelectLocation(loc)}
            >
              {loc.name.length > 60 ? loc.name.slice(0, 60) + '…' : loc.name}
            </button>
          ))}
        </div>
      )}

      {searching && (
        <div className={styles.natalSearching}>Searching…</div>
      )}

      <button
        className={`${styles.wizardBtn} ${styles.wizardBtnPrimary}`}
        onClick={handleCalculate}
        disabled={!birthDate}
        style={{ marginTop: '4px' }}
      >
        Calculate Chart
      </button>
    </div>
  );
}
