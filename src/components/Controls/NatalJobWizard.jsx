import { useState } from 'react';
import { PLANETS, PLANET_MAP, SPEED_ORDER, NON_RETROGRADE_PLANETS, NATAL_ANGLES, NATAL_ANGLE_IDS } from '../../data/planets';
import { ASPECTS } from '../../utils/aspects';
import { formatDegree } from '../../data/natalChart';
import styles from './Controls.module.css';

const ALL_ASPECT_NAMES = ASPECTS.map(a => a.name);

/**
 * NatalJobWizard — Creates natal transit jobs.
 *
 * Step 1: Pick a transiting planet (any planet can transit natal positions)
 * Step 2: Pick which natal planets to track aspects against
 */
export default function NatalJobWizard({ natalChart, onAddJob }) {
  const [step, setStep] = useState(0);
  const [transitPlanet, setTransitPlanet] = useState(null);
  const [natalTargets, setNatalTargets] = useState([]);
  const [showRetrogrades, setShowRetrogrades] = useState(true);
  const [selectedAspects, setSelectedAspects] = useState(ALL_ASPECT_NAMES);

  function reset() {
    setStep(0);
    setTransitPlanet(null);
    setNatalTargets([]);
    setShowRetrogrades(true);
    setSelectedAspects(ALL_ASPECT_NAMES);
  }

  function handlePickPlanet(planetId) {
    setTransitPlanet(planetId);
    // Default: select all natal planets EXCEPT the transit planet itself, plus angles if available
    const defaultTargets = SPEED_ORDER.filter(id => id !== planetId);
    const angleTargets = natalChart?.angles ? NATAL_ANGLE_IDS : [];
    setNatalTargets([...defaultTargets, ...angleTargets]);
    setStep(2);
  }

  function handleToggleTarget(targetId) {
    setNatalTargets(prev =>
      prev.includes(targetId)
        ? prev.filter(t => t !== targetId)
        : [...prev, targetId]
    );
  }

  function handleToggleAll() {
    const allOthers = SPEED_ORDER.filter(id => id !== transitPlanet);
    const angleTargets = natalChart?.angles ? NATAL_ANGLE_IDS : [];
    const allTargets = [...allOthers, ...angleTargets];
    if (natalTargets.length === allTargets.length) {
      setNatalTargets([]);
    } else {
      setNatalTargets([...allTargets]);
    }
  }

  function handleFinalize() {
    onAddJob({
      id: `natal-job-${Date.now()}`,
      transitPlanet,
      natalTargets,
      aspects: selectedAspects,
      showSignChanges: true,
      showRetrogrades: NON_RETROGRADE_PLANETS.has(transitPlanet) ? false : showRetrogrades,
    });
    reset();
  }

  // Not started
  if (step === 0) {
    return (
      <button
        className={styles.addTransitBtn}
        onClick={() => setStep(1)}
        type="button"
      >
        + Add Transit
      </button>
    );
  }

  // Step 1: Pick transit planet — all planets are eligible
  if (step === 1) {
    return (
      <div className={styles.wizardContainer}>
        <div className={styles.wizardHeader}>
          <span className={styles.wizardTitle}>Select Transiting Planet</span>
          <button className={styles.wizardClose} onClick={reset} type="button">✕</button>
        </div>

        <div className={styles.planetGrid}>
          {SPEED_ORDER.map(id => {
            const p = PLANET_MAP[id];
            return (
              <button
                key={id}
                className={styles.planetBtn}
                onClick={() => handlePickPlanet(id)}
                type="button"
              >
                <span className={styles.planetBtnSymbol}>{p.symbol}</span>
                <span className={styles.planetBtnName}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Step 2: Pick natal targets
  const transitP = PLANET_MAP[transitPlanet];
  const positions = natalChart?.positions || {};
  const angles = natalChart?.angles || null;
  const allOthers = SPEED_ORDER.filter(id => id !== transitPlanet);
  const angleTargets = angles ? NATAL_ANGLE_IDS : [];
  const allTargets = [...allOthers, ...angleTargets];

  return (
    <div className={styles.wizardContainer}>
      <div className={styles.wizardHeader}>
        <span className={styles.wizardTitle}>
          {transitP.symbol} {transitP.name} → natal
        </span>
        <button className={styles.wizardClose} onClick={reset} type="button">✕</button>
      </div>

      <label className={styles.targetAllLabel}>
        <input
          type="checkbox"
          checked={natalTargets.length === allTargets.length}
          onChange={handleToggleAll}
          className={styles.targetCheckbox}
        />
        <span>Select All</span>
      </label>

      <div className={styles.targetList}>
        {allOthers.map(id => {
          const p = PLANET_MAP[id];
          const lon = positions[id];
          return (
            <label key={id} className={styles.targetItem}>
              <input
                type="checkbox"
                checked={natalTargets.includes(id)}
                onChange={() => handleToggleTarget(id)}
                className={styles.targetCheckbox}
              />
              <span className={styles.targetSymbol}>{p.symbol}</span>
              <span className={styles.targetName}>
                {p.name}
                {lon != null && (
                  <span className={styles.natalDegInline}> {formatDegree(lon)}</span>
                )}
              </span>
            </label>
          );
        })}

        {angles && (
          <>
            <div style={{ fontSize: '9px', color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 0 2px', borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: 4 }}>
              Chart Angles
            </div>
            {NATAL_ANGLES.map(a => {
              const lon = angles[a.id];
              return (
                <label key={a.id} className={styles.targetItem}>
                  <input
                    type="checkbox"
                    checked={natalTargets.includes(a.id)}
                    onChange={() => handleToggleTarget(a.id)}
                    className={styles.targetCheckbox}
                  />
                  <span className={styles.targetSymbol} style={{ fontSize: '10px', fontWeight: 700 }}>{a.symbol}</span>
                  <span className={styles.targetName}>
                    {a.name}
                    {lon != null && (
                      <span className={styles.natalDegInline}> {formatDegree(lon)}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </>
        )}
      </div>

      <div className={styles.wizardDivider} />
      <span className={styles.jobSectionLabel}>Aspects</span>
      <div className={styles.targetList}>
        {ASPECTS.map(aspect => (
          <label key={aspect.name} className={styles.targetItem}>
            <input
              type="checkbox"
              checked={selectedAspects.includes(aspect.name)}
              onChange={() => {
                setSelectedAspects(prev => {
                  const next = prev.includes(aspect.name)
                    ? prev.filter(a => a !== aspect.name)
                    : [...prev, aspect.name];
                  return next.length > 0 ? next : prev;
                });
              }}
              className={styles.targetCheckbox}
            />
            <span className={styles.targetSymbol}>{aspect.symbol}</span>
            <span className={styles.targetName}>{aspect.name}</span>
            <span className={styles.aspectAngle}>{aspect.angle}°</span>
          </label>
        ))}
      </div>

      {!NON_RETROGRADE_PLANETS.has(transitPlanet) && (
        <label className={styles.signChangeToggle} style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={showRetrogrades}
            onChange={() => setShowRetrogrades(v => !v)}
            className={styles.targetCheckbox}
          />
          <span className={styles.signChangeLabel}>Retrograde cycles</span>
        </label>
      )}

      <div className={styles.wizardNav}>
        <button className={styles.wizardBtn} onClick={() => setStep(1)} type="button">
          Back
        </button>
        <button
          className={`${styles.wizardBtn} ${styles.wizardBtnPrimary}`}
          onClick={handleFinalize}
          disabled={natalTargets.length === 0}
          type="button"
        >
          Add Transit
        </button>
      </div>
    </div>
  );
}
