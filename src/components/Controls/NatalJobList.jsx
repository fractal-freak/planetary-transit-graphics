import NatalJobCard from './NatalJobCard';
import NatalJobWizard from './NatalJobWizard';
import styles from './Controls.module.css';

export default function NatalJobList({ natalChart, natalJobs, natalCurves, onAddJob, onRemoveJob, onUpdateJob }) {
  return (
    <div className={styles.jobList}>
      {natalJobs.map(job => {
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
