import { SPEED_ORDER } from '../../data/planets';
import TransitJobCard from './TransitJobCard';
import TransitJobWizard from './TransitJobWizard';
import styles from './Controls.module.css';

export default function TransitJobList({ transitJobs, curves, onAddJob, onRemoveJob, onUpdateJob }) {
  // Sort cards by planet speed: slowest (Pluto) first, fastest (Moon) last
  const sorted = [...transitJobs].sort(
    (a, b) => SPEED_ORDER.indexOf(b.transitPlanet) - SPEED_ORDER.indexOf(a.transitPlanet)
  );

  return (
    <div className={styles.jobList}>
      {sorted.map(job => {
        const hasAspects = curves && curves.some(c => c.jobId === job.id);
        return (
          <TransitJobCard
            key={job.id}
            job={job}
            hasAspects={hasAspects}
            onRemove={() => onRemoveJob(job.id)}
            onUpdate={updates => onUpdateJob(job.id, updates)}
          />
        );
      })}
      <TransitJobWizard onAddJob={onAddJob} />
    </div>
  );
}
