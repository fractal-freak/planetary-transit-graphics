import { useState } from 'react';
import { PLANET_MAP, SPEED_ORDER, NON_RETROGRADE_PLANETS, NATAL_ANGLES, NATAL_ANGLE_IDS } from '../../data/planets';
import { ASPECTS } from '../../utils/aspects';
import { formatDegree } from '../../data/natalChart';
import styles from './Controls.module.css';

export default function NatalJobCard({ job, natalChart, hasAspects, hasAnyActivity, onRemove, onUpdate }) {
  const [expanded, setExpanded] = useState(false);

  const transitP = PLANET_MAP[job.transitPlanet];
  if (!transitP) return null;

  const positions = natalChart?.positions || {};
  const angles = natalChart?.angles || null;

  function handleToggleTarget(targetId) {
    const newTargets = job.natalTargets.includes(targetId)
      ? job.natalTargets.filter(t => t !== targetId)
      : [...job.natalTargets, targetId];
    if (newTargets.length > 0 || job.showSignChanges || job.showRetrogrades) {
      onUpdate({ natalTargets: newTargets });
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

  // All planets except the transit planet are valid natal targets
  const allOthers = SPEED_ORDER.filter(id => id !== job.transitPlanet);

  return (
    <div className={`${styles.jobCard} ${expanded ? styles.jobCardExpanded : ''}`}>
      <div
        className={styles.jobCardHeader}
        onClick={() => setExpanded(e => !e)}
      >
        <span className={styles.jobPlanet}>
          {transitP.symbol}
          <span style={{ fontSize: '9px', color: 'rgba(0,0,0,0.3)', marginLeft: 4 }}>
            → natal
          </span>
        </span>
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
          {!transitP.conjunctionOnly && (
            <>
              <div className={styles.jobSection}>
                <span className={styles.jobSectionLabel}>Natal Targets</span>
                <div className={styles.targetList}>
                  {allOthers.map(id => {
                    const p = PLANET_MAP[id];
                    const lon = positions[id];
                    return (
                      <label key={id} className={styles.targetItem}>
                        <input
                          type="checkbox"
                          checked={job.natalTargets.includes(id)}
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
                              checked={job.natalTargets.includes(a.id)}
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
          </div>
        </div>
      )}
    </div>
  );
}
