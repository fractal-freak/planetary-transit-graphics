import { useState } from 'react';
import { PLANETS, PLANET_MAP, SPEED_ORDER } from '../../data/planets';
import styles from './Controls.module.css';

// All planets sorted slowest-first (matches chart row ordering)
const SORTED_PLANETS = [...PLANETS].sort(
  (a, b) => SPEED_ORDER.indexOf(b.id) - SPEED_ORDER.indexOf(a.id)
);

export default function OrbSettings({ orbSettings, onOrbChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.orbSettingsWrap}>
      <button
        type="button"
        className={styles.orbToggle}
        onClick={() => setOpen(o => !o)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Settings</span>
      </button>

      {open && (
        <div className={styles.orbList}>
          {SORTED_PLANETS.map(p => {
            const orb = orbSettings[p.id] ?? 8;
            return (
              <div key={p.id} className={styles.orbRow}>
                <span className={styles.orbPlanetSymbol}>{p.symbol}</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={orb}
                  onChange={e => onOrbChange(p.id, parseFloat(e.target.value))}
                  className={styles.orbSlider}
                />
                <span className={styles.orbValue}>{orb % 1 === 0 ? orb + '.0' : orb}°</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
