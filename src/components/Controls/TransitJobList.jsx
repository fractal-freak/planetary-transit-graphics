import TransitJobCard from './TransitJobCard';
import TransitJobWizard from './TransitJobWizard';
import styles from './Controls.module.css';

export default function TransitJobList({ transitJobs, curves, onAddJob, onRemoveJob, onUpdateJob }) {
  return (
    <div className={styles.jobList}>
      {transitJobs.map(job => {
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
