import { SPEED_ORDER } from '../../data/planets';
import NatalJobCard from './NatalJobCard';
import NatalJobWizard from './NatalJobWizard';
import styles from './Controls.module.css';

export default function NatalJobList({ natalChart, natalJobs, natalCurves, natalSignChanges, natalLoading, onAddJob, onRemoveJob, onUpdateJob }) {
  // Sort cards by planet speed: slowest (Pluto) first, fastest (Moon) last
  const sorted = [...natalJobs].sort(
    (a, b) => SPEED_ORDER.indexOf(b.transitPlanet) - SPEED_ORDER.indexOf(a.transitPlanet)
  );

  return (
    <div className={styles.jobList}>
      {sorted.map(job => {
        const hasAspects = natalCurves && natalCurves.some(c => c.jobId === job.id);
        const planet = job.transitPlanet;
        const hasSignChange = natalSignChanges?.changes?.some(c => c.planet === planet);
        const hasStation = natalSignChanges?.stations?.some(s => s.planet === planet);
        const hasRetroPeriod = natalSignChanges?.retrogradePeriods?.some(p => p.planet === planet);
        const wantsEclipses = planet === 'TrueNode' && (job.showEclipses ?? true);
        const hasEclipse = wantsEclipses && (natalSignChanges?.eclipses?.length ?? 0) > 0;
        // While curves are still computing, the activity check would be a
        // false negative — pass null so the card hides the "no transits" line.
        const hasAnyActivity = natalLoading
          ? null
          : (hasAspects || hasSignChange || hasStation || hasRetroPeriod || hasEclipse);
        return (
          <NatalJobCard
            key={job.id}
            job={job}
            natalChart={natalChart}
            hasAspects={hasAspects}
            hasAnyActivity={hasAnyActivity}
            onRemove={() => onRemoveJob(job.id)}
            onUpdate={updates => onUpdateJob(job.id, updates)}
          />
        );
      })}
      <NatalJobWizard natalChart={natalChart} onAddJob={onAddJob} />
    </div>
  );
}
