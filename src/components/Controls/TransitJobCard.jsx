import { useState } from 'react';
import { PLANET_MAP, getOtherPlanets, getSlowerPlanets, isFasterThan, NON_RETROGRADE_PLANETS } from '../../data/planets';
import { ASPECTS } from '../../utils/aspects';
import styles from './Controls.module.css';

export default function TransitJobCard({ job, hasAspects, hasAnyActivity, onRemove, onUpdate }) {
  const [expanded, setExpanded] = useState(false);

  const transitP = PLANET_MAP[job.transitPlanet];
  if (!transitP) return null;


  function handleToggleTarget(targetId) {
    const newTargets = job.targets.includes(targetId)
      ? job.targets.filter(t => t !== targetId)
      : [...job.targets, targetId];
    // Allow empty targets if sign changes or retrogrades provides a row
    if (newTargets.length > 0 || job.showSignChanges || job.showRetrogrades) {
      onUpdate({ targets: newTargets });
    }
  }

  function handleToggleAspect(name) {
    const newAspects = job.aspects.includes(name)
      ? job.aspects.filter(a => a !== name)
      : [...job.aspects, name];
    if (newAspects.length > 0) {
      onUpdate({ aspects: newAspects });
    }
  }

  const otherPlanets = getOtherPlanets(job.transitPlanet);
  const slowerPlanets = getSlowerPlanets(job.transitPlanet);
  const fasterPlanets = otherPlanets.filter(id => isFasterThan(id, job.transitPlanet));

  return (
    <div className={`${styles.jobCard} ${expanded ? styles.jobCardExpanded : ''}`}>
      <div
        className={styles.jobCardHeader}
        onClick={() => setExpanded(e => !e)}
      >
        <span className={styles.jobPlanet}>{transitP.symbol}</span>
        <button
          className={styles.jobRemove}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          type="button"
        >
          ✕
        </button>
      </div>

      {hasAnyActivity === false && (
        <div className={styles.jobNoAspects}>No transits during this timeframe.</div>
      )}

      {expanded && (
        <div className={styles.jobCardBody}>
          {/* TrueNode (conjunction-only): hide targets & aspects — only show sign changes */}
          {!transitP.conjunctionOnly && (
            <>
              <div className={styles.jobSection}>
                <span className={styles.jobSectionLabel}>Targets</span>
                <div className={styles.targetList}>
                  {slowerPlanets.map(id => {
                    const p = PLANET_MAP[id];
                    return (
                      <label key={id} className={styles.targetItem}>
                        <input
                          type="checkbox"
                          checked={job.targets.includes(id)}
                          onChange={() => handleToggleTarget(id)}
                          className={styles.targetCheckbox}
                        />
                        <span className={styles.targetSymbol}>{p.symbol}</span>
                        <span className={styles.targetName}>{p.name}</span>
                      </label>
                    );
                  })}
                </div>

                {fasterPlanets.length > 0 && slowerPlanets.length > 0 && (
                  <div className={styles.targetDivider}>
                    <span className={styles.targetDividerText}>faster — separate rows</span>
                  </div>
                )}

                {fasterPlanets.length > 0 && (
                  <div className={styles.targetList}>
                    {fasterPlanets.map(id => {
                      const p = PLANET_MAP[id];
                      return (
                        <label key={id} className={styles.targetItem}>
                          <input
                            type="checkbox"
                            checked={job.targets.includes(id)}
                            onChange={() => handleToggleTarget(id)}
                            className={styles.targetCheckbox}
                          />
                          <span className={styles.targetSymbol}>{p.symbol}</span>
                          <span className={styles.targetName}>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={styles.jobSection}>
                <span className={styles.jobSectionLabel}>Aspects</span>
                <div className={styles.targetList}>
                  {ASPECTS.map(aspect => (
                    <label key={aspect.name} className={styles.targetItem}>
                      <input
                        type="checkbox"
                        checked={job.aspects.includes(aspect.name)}
                        onChange={() => handleToggleAspect(aspect.name)}
                        className={styles.targetCheckbox}
                      />
                      <span className={styles.targetSymbol}>{aspect.symbol}</span>
                      <span className={styles.targetName}>{aspect.name}</span>
                      <span className={styles.aspectAngle}>{aspect.angle}°</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className={styles.jobSection}>
            <label className={styles.signChangeToggle}>
              <input
                type="checkbox"
                checked={job.showSignChanges ?? false}
                onChange={() => onUpdate({ showSignChanges: !job.showSignChanges })}
                className={styles.targetCheckbox}
              />
              <span className={styles.signChangeLabel}>Sign changes</span>
            </label>

            {!NON_RETROGRADE_PLANETS.has(job.transitPlanet) && (
              <label className={styles.signChangeToggle} style={{ marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={job.showRetrogrades ?? false}
                  onChange={() => onUpdate({ showRetrogrades: !job.showRetrogrades })}
                  className={styles.targetCheckbox}
                />
                <span className={styles.signChangeLabel}>Retrograde cycles</span>
              </label>
            )}

            {job.transitPlanet === 'TrueNode' && (
              <label className={styles.signChangeToggle} style={{ marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={job.showEclipses ?? true}
                  onChange={() => onUpdate({ showEclipses: !(job.showEclipses ?? true) })}
                  className={styles.targetCheckbox}
                />
                <span className={styles.signChangeLabel}>Eclipses</span>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
