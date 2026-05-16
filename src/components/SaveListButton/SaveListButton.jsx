import { buildTransitsMarkdown } from '../../utils/transitExport';
import styles from './SaveListButton.module.css';

export default function SaveListButton({ curves, signChanges, startDate, endDate }) {
  function handleSave() {
    if (!startDate || !endDate) return;
    const md = buildTransitsMarkdown(curves, signChanges, startDate, endDate);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const startIso = startDate.toISOString().slice(0, 10);
    const endIso = endDate.toISOString().slice(0, 10);
    link.download = `transits-${startIso}-to-${endIso}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      className={styles.saveListBtn}
      onClick={handleSave}
      title="Save the visible transits as a Markdown list"
    >
      <span className={styles.icon}>↓</span>
      <span>Save List</span>
    </button>
  );
}
