import { SPEED_ORDER, NATAL_ANGLE_IDS } from '../../data/planets';
import NatalJobCard from './NatalJobCard';
import NatalJobWizard from './NatalJobWizard';
import { ClearAllButton } from './TransitJobList';
import SaveAsPresetButton from './SaveAsPresetButton';
import styles from './Controls.module.css';

function buildLunationDefaults(natalChart) {
  const angleIds = natalChart?.angles ? NATAL_ANGLE_IDS : [];
  return {
    transitPlanet: 'Moon',
    natalTargets: [...SPEED_ORDER, ...angleIds],
    aspects: ['Conjunction', 'Opposition'],
    isLunation: true,
    showSignChanges: false,
    showRetrogrades: false,
  };
}

export default function NatalJobList({ natalChart, natalJobs, natalCurves, natalSignChanges, natalLoading, onAddJob, onRemoveJob, onUpdateJob, onClearAll, onSaveAsPreset }) {
  const lunationJob = natalJobs.find(j => j.isLunation);
  const nonLunationJobs = natalJobs.filter(j => !j.isLunation);

  // Sort non-lunation cards by planet speed: slowest (Pluto) first, fastest (Moon) last.
  // Lunation card always renders last (after the Moon row) so it sits next to the wizard.
  const sorted = [...nonLunationJobs].sort(
    (a, b) => SPEED_ORDER.indexOf(b.transitPlanet) - SPEED_ORDER.indexOf(a.transitPlanet)
  );

  function renderJobCard(job) {
    const hasAspects = natalCurves && natalCurves.some(c => c.jobId === job.id);
    const planet = job.transitPlanet;
    const hasSignChange = natalSignChanges?.changes?.some(c => c.planet === planet);
    const hasStation = natalSignChanges?.stations?.some(s => s.planet === planet);
    const hasRetroPeriod = natalSignChanges?.retrogradePeriods?.some(p => p.planet === planet);
    const wantsEclipses = planet === 'TrueNode' && (job.showEclipses ?? true);
    const hasEclipse = wantsEclipses && (natalSignChanges?.eclipses?.length ?? 0) > 0;
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
  }

  function handleToggleLunations() {
    if (lunationJob) {
      onRemoveJob(lunationJob.id);
    } else {
      onAddJob(buildLunationDefaults(natalChart));
    }
  }

  return (
    <div className={styles.jobList}>
      {sorted.map(renderJobCard)}
      {lunationJob && renderJobCard(lunationJob)}
      <NatalJobWizard
        natalChart={natalChart}
        onAddJob={onAddJob}
        lunationsActive={!!lunationJob}
        onToggleLunations={handleToggleLunations}
      />
      {natalJobs.length > 0 && onSaveAsPreset && (
        <SaveAsPresetButton onClick={onSaveAsPreset} />
      )}
      {natalJobs.length >= 2 && onClearAll && (
        <ClearAllButton onClearAll={onClearAll} />
      )}
    </div>
  );
}
