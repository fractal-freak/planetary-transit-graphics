import { useState } from 'react';
import { PLANETS, PLANET_MAP, SPEED_ORDER, getSlowerPlanets, NON_RETROGRADE_PLANETS } from '../../data/planets';
import { ASPECTS } from '../../utils/aspects';
import styles from './Controls.module.css';

const ALL_ASPECT_NAMES = ASPECTS.map(a => a.name);

export default function TransitJobWizard({ onAddJob, lunationsActive, onToggleLunations }) {
  const [step, setStep] = useState(0); // 0 = closed, 1 = pick planet, 2 = pick targets
  const [transitPlanet, setTransitPlanet] = useState(null);
  const [targets, setTargets] = useState([]);
  const [showSignChanges, setShowSignChanges] = useState(true);
  const [showRetrogrades, setShowRetrogrades] = useState(true);
  const [selectedAspects, setSelectedAspects] = useState(ALL_ASPECT_NAMES);

  function reset() {
    setStep(0);
    setTransitPlanet(null);
    setTargets([]);
    setShowSignChanges(true);
    setShowRetrogrades(true);
    setSelectedAspects(ALL_ASPECT_NAMES);
  }

  function handlePickPlanet(planetId) {
    const planet = PLANET_MAP[planetId];

    // TrueNode (lunar nodes): skip target selection, finalize immediately
    // Nodes only show sign changes — no aspect targets
    if (planet?.conjunctionOnly) {
      onAddJob({
        id: `job-${Date.now()}`,
        transitPlanet: planetId,
        targets: [],
        aspects: ['Conjunction'],
        showSignChanges: true,
        showRetrogrades: false,
        showEclipses: true,
      });
      reset();
      return;
    }

    setTransitPlanet(planetId);
    const slower = getSlowerPlanets(planetId);
    setTargets([...slower]); // default: slower planets pre-selected
    setStep(2);
  }

  function handleToggleTarget(targetId) {
    setTargets(prev =>
      prev.includes(targetId)
        ? prev.filter(t => t !== targetId)
        : [...prev, targetId]
    );
  }

  function handleToggleAllTargets(allPlanets) {
    if (targets.length === allPlanets.length) {
      setTargets([]);
    } else {
      setTargets([...allPlanets]);
    }
  }

  function handleFinalize() {
    onAddJob({
      id: `job-${Date.now()}`,
      transitPlanet,
      targets,
      aspects: selectedAspects,
      showSignChanges,
      showRetrogrades: NON_RETROGRADE_PLANETS.has(transitPlanet) ? false : showRetrogrades,
    });
    reset();
  }

  // Not started — show the add button
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

  // Step 1: Pick transit planet — only planets that have slower targets
  if (step === 1) {
    // Include planets with slower targets + conjunctionOnly planets (TrueNode)
    const eligible = SPEED_ORDER.filter(id => {
      const p = PLANET_MAP[id];
      return p?.conjunctionOnly || getSlowerPlanets(id).length > 0;
    });
    return (
      <div className={styles.wizardContainer}>
        <div className={styles.wizardHeader}>
          <span className={styles.wizardTitle}>Select Planet</span>
          <button className={styles.wizardClose} onClick={reset} type="button">✕</button>
        </div>

        <div className={styles.planetGrid}>
          {eligible.map(id => {
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
          {onToggleLunations && (
            <button
              className={`${styles.planetBtn} ${lunationsActive ? styles.planetBtnActive : ''}`}
              onClick={() => { onToggleLunations(); reset(); }}
              type="button"
            >
              <span className={styles.planetBtnSymbol}>
                <SolarEclipseGlyph size={16} />
              </span>
              <span className={styles.planetBtnName}>Lunations</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const slowerPlanets = getSlowerPlanets(transitPlanet);
  const transitP = PLANET_MAP[transitPlanet];

  // Step 2: Pick targets — finalize directly from here
  if (step === 2) {
    return (
      <div className={styles.wizardContainer}>
        <div className={styles.wizardHeader}>
          <span className={styles.wizardTitle}>
            {transitP.symbol} {transitP.name} transits
          </span>
          <button className={styles.wizardClose} onClick={reset} type="button">✕</button>
        </div>

        <label className={styles.targetAllLabel}>
          <input
            type="checkbox"
            checked={targets.length === slowerPlanets.length}
            onChange={() => handleToggleAllTargets(slowerPlanets)}
            className={styles.targetCheckbox}
          />
          <span>Select All</span>
        </label>

        <div className={styles.targetList}>
          {slowerPlanets.map(id => {
            const p = PLANET_MAP[id];
            return (
              <label key={id} className={styles.targetItem}>
                <input
                  type="checkbox"
                  checked={targets.includes(id)}
                  onChange={() => handleToggleTarget(id)}
                  className={styles.targetCheckbox}
                />
                <span className={styles.targetSymbol}>{p.symbol}</span>
                <span className={styles.targetName}>{p.name}</span>
              </label>
            );
          })}
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

        <label className={styles.signChangeToggle} style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={showSignChanges}
            onChange={() => setShowSignChanges(v => !v)}
            className={styles.targetCheckbox}
          />
          <span className={styles.signChangeLabel}>Sign changes</span>
        </label>

        {!NON_RETROGRADE_PLANETS.has(transitPlanet) && (
          <label className={styles.signChangeToggle} style={{ marginTop: 4 }}>
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
            disabled={targets.length === 0 && !showSignChanges && !showRetrogrades}
            type="button"
          >
            Add Transit
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// Replicates the canvas drawSolarEclipseGlyph: red sun peeking left,
// dark navy moon in front, white separator at the overlap.
function SolarEclipseGlyph({ size = 16 }) {
  // Classic eclipse glyph: a sun circle with a moon crescent inside it.
  // - Sun: stroked circle, line-drawn like ☉/♂/♀ etc.
  // - Crescent: a single filled <path> built from two arcs.
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.42;          // Sun outer radius (with margin for stroke)
  const rMoon = R * 0.68;         // Crescent's circle radius
  const offset = rMoon * 0.55;    // Distance between the two crescent circles → controls thickness
  const sw = 1;

  // Position so the crescent's bounding box is centered horizontally in the sun.
  const c1 = cx + rMoon / 2 - offset / 4;
  const c2 = c1 + offset;
  const xInt = (c1 + c2) / 2;
  const yOff = Math.sqrt(rMoon * rMoon - (offset * offset) / 4);

  const crescentPath = [
    `M${xInt} ${cy - yOff}`,
    `A${rMoon} ${rMoon} 0 1 0 ${xInt} ${cy + yOff}`,
    `A${rMoon} ${rMoon} 0 0 0 ${xInt} ${cy - yOff}`,
    `Z`,
  ].join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      shapeRendering="geometricPrecision"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor" strokeWidth={sw} />
      <path d={crescentPath} fill="currentColor" />
    </svg>
  );
}
