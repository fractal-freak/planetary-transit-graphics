import { useState } from 'react';
import { SPEED_ORDER } from '../../data/planets';
import TransitJobCard from './TransitJobCard';
import TransitJobWizard from './TransitJobWizard';
import styles from './Controls.module.css';

const LUNATION_JOB_DEFAULTS = {
  transitPlanet: 'Moon',
  targets: ['Sun'],
  aspects: ['Conjunction', 'Opposition'],
  isLunation: true,
  showSignChanges: false,
  showRetrogrades: false,
};

export default function TransitJobList({ transitJobs, curves, signChanges, loading, onAddJob, onRemoveJob, onUpdateJob, onClearAll }) {
  const lunationJob = transitJobs.find(j => j.isLunation);
  const nonLunationJobs = transitJobs.filter(j => !j.isLunation);

  // Sort non-lunation cards by planet speed: slowest (Pluto) first, fastest (Moon) last
  const sorted = [...nonLunationJobs].sort(
    (a, b) => SPEED_ORDER.indexOf(b.transitPlanet) - SPEED_ORDER.indexOf(a.transitPlanet)
  );

  function handleToggleLunations() {
    if (lunationJob) {
      onRemoveJob(lunationJob.id);
    } else {
      onAddJob(LUNATION_JOB_DEFAULTS);
    }
  }

  return (
    <div className={styles.jobList}>
      {sorted.map(job => {
        const hasAspects = curves && curves.some(c => c.jobId === job.id);
        const planet = job.transitPlanet;
        const hasSignChange = signChanges?.changes?.some(c => c.planet === planet);
        const hasStation = signChanges?.stations?.some(s => s.planet === planet);
        const hasRetroPeriod = signChanges?.retrogradePeriods?.some(p => p.planet === planet);
        const wantsEclipses = planet === 'TrueNode' && (job.showEclipses ?? true);
        const hasEclipse = wantsEclipses && (signChanges?.eclipses?.length ?? 0) > 0;
        const hasAnyActivity = loading
          ? null
          : (hasAspects || hasSignChange || hasStation || hasRetroPeriod || hasEclipse);
        return (
          <TransitJobCard
            key={job.id}
            job={job}
            hasAspects={hasAspects}
            hasAnyActivity={hasAnyActivity}
            onRemove={() => onRemoveJob(job.id)}
            onUpdate={updates => onUpdateJob(job.id, updates)}
          />
        );
      })}
      <TransitJobWizard
        onAddJob={onAddJob}
        existingJobs={transitJobs}
        lunationsActive={!!lunationJob}
        onToggleLunations={handleToggleLunations}
      />
      {transitJobs.length >= 2 && onClearAll && (
        <ClearAllButton onClearAll={onClearAll} />
      )}
    </div>
  );
}


export function ClearAllButton({ onClearAll }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className={styles.clearAllConfirm}>
        <span className={styles.clearAllConfirmText}>Clear all transits?</span>
        <button
          type="button"
          className={styles.clearAllConfirmYes}
          onClick={() => { onClearAll(); setConfirming(false); }}
        >
          Clear
        </button>
        <button
          type="button"
          className={styles.clearAllConfirmNo}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={styles.clearAllBtn}
      onClick={() => setConfirming(true)}
    >
      Clear all
    </button>
  );
}
