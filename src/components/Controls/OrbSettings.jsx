import { useState } from 'react';
import { PLANETS, PLANET_MAP, SPEED_ORDER } from '../../data/planets';
import { IconTarget } from './sectionIcons';
import styles from './Controls.module.css';

// All planets sorted slowest-first (matches chart row ordering)
const SORTED_PLANETS = [...PLANETS].sort(
  (a, b) => SPEED_ORDER.indexOf(b.id) - SPEED_ORDER.indexOf(a.id)
);

export default function OrbSettings({ orbSettings, onOrbChange }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={`${styles.section} ${open ? styles.sectionOpen : styles.sectionClosed}`}>
      <button
        type="button"
        className={styles.sectionTitleToggle}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className={styles.sectionIcon}><IconTarget /></span>
        <span className={styles.sectionTitleGroup}>
          <span className={styles.sectionTitleText}>Orb Settings</span>
          <svg
            className={`${styles.sectionToggleArrow} ${open ? styles.sectionToggleArrowOpen : ''}`}
            width="18"
            height="18"
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
        </span>
      </button>

      {open && (
        <div className={`${styles.sectionBody} ${styles.orbList}`}>
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
    </section>
  );
}
