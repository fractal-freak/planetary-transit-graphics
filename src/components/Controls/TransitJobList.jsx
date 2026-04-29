import { SPEED_ORDER } from '../../data/planets';
import TransitJobCard from './TransitJobCard';
import TransitJobWizard from './TransitJobWizard';
import styles from './Controls.module.css';

export default function TransitJobList({ transitJobs, curves, signChanges, onAddJob, onRemoveJob, onUpdateJob }) {
  // Sort cards by planet speed: slowest (Pluto) first, fastest (Moon) last
  const sorted = [...transitJobs].sort(
    (a, b) => SPEED_ORDER.indexOf(b.transitPlanet) - SPEED_ORDER.indexOf(a.transitPlanet)
  );

  return (
    <div className={styles.jobList}>
      {sorted.map(job => {
        const hasAspects = curves && curves.some(c => c.jobId === job.id);
        const planet = job.transitPlanet;
        const hasSignChange = signChanges?.changes?.some(c => c.planet === planet);
        const hasStation = signChanges?.stations?.some(s => s.planet === planet);
        const hasRetroPeriod = signChanges?.retrogradePeriods?.some(p => p.planet === planet);
        const hasEclipse = planet === 'TrueNode' && (signChanges?.eclipses?.length ?? 0) > 0;
        const hasAnyActivity = hasAspects || hasSignChange || hasStation || hasRetroPeriod || hasEclipse;
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
      <TransitJobWizard onAddJob={onAddJob} />
    </div>
  );
}
