import { useState, useRef, useEffect } from 'react';
import { PLANETS, NATAL_ANGLES } from '../../data/planets';
import { computeNatalPositions, computeNatalAngles, combineDateAndTime, formatDegree } from '../../data/natalChart';
import styles from './Controls.module.css';

/**
 * NatalDataInput — Birth data entry form.
 *
 * Always renders the form (date, time, location, Calculate button).
 * The chart summary display has moved to ChartSection.
 */
export default function NatalDataInput({ onNatalChartChange, onCancel }) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('12:00');
  const [location, setLocation] = useState('');
  const [locationData, setLocationData] = useState(null);
  const [locationResults, setLocationResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function handleCalculate() {
    if (!birthDate || !name.trim()) return;
    const lat = locationData?.lat;
    const lng = locationData?.lng;
    const dateTime = combineDateAndTime(birthDate, birthTime, lat, lng);
    const positions = computeNatalPositions(dateTime);
    const angles = (lat != null && lng != null)
      ? computeNatalAngles(dateTime, lat, lng)
      : null;
    onNatalChartChange({
      name: name.trim(),
      birthDate,
      birthTime,
      lat: lat || null,
      lng: lng || null,
      locationName: locationData?.name || location || null,
      positions,
      angles,
    });
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

  return (
    <div className={styles.natalForm}>
      <label className={styles.natalLabel}>
        <span className={styles.natalLabelText}>Name</span>
        <input
          type="text"
          className={styles.natalInput}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Chart name"
          autoFocus
        />
      </label>

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
            <span className={styles.natalLocationCheck}>{'\u2713'}</span>
          )}
        </div>
      </label>

      {locationResults.length > 0 && (
        <div className={styles.natalLocationResults}>
          {locationResults.map((loc, i) => (
            <button
              key={i}
              className={styles.natalLocationResult}
              onClick={() => handleSelectLocation(loc)}
            >
              {loc.name.length > 60 ? loc.name.slice(0, 60) + '\u2026' : loc.name}
            </button>
          ))}
        </div>
      )}

      {searching && (
        <div className={styles.natalSearching}>{`Searching\u2026`}</div>
      )}

      <button
        className={`${styles.wizardBtn} ${styles.wizardBtnPrimary}`}
        onClick={handleCalculate}
        disabled={!birthDate || !name.trim()}
        style={{ marginTop: '4px' }}
      >
        Calculate Chart
      </button>
    </div>
  );
}
