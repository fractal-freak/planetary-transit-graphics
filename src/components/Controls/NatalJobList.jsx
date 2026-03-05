import { SPEED_ORDER } from '../../data/planets';
import NatalJobCard from './NatalJobCard';
import NatalJobWizard from './NatalJobWizard';
import styles from './Controls.module.css';

export default function NatalJobList({ natalChart, natalJobs, natalCurves, onAddJob, onRemoveJob, onUpdateJob }) {
  // Sort cards by planet speed: slowest (Pluto) first, fastest (Moon) last
  const sorted = [...natalJobs].sort(
    (a, b) => SPEED_ORDER.indexOf(b.transitPlanet) - SPEED_ORDER.indexOf(a.transitPlanet)
  );

  return (
    <div className={styles.jobList}>
      {sorted.map(job => {
        const hasAspects = natalCurves && natalCurves.some(c => c.jobId === job.id);
        return (
          <NatalJobCard
            key={job.id}
            job={job}
            natalChart={natalChart}
            hasAspects={hasAspects}
            onRemove={() => onRemoveJob(job.id)}
            onUpdate={updates => onUpdateJob(job.id, updates)}
          />
        );
      })}
      <NatalJobWizard natalChart={natalChart} onAddJob={onAddJob} />
    </div>
  );
}
