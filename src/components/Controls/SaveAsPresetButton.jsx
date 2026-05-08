import styles from './Controls.module.css';

/**
 * Compact "Save as preset" CTA shown inside each job list when the current
 * setup doesn't match any saved preset for this mode.
 */
export default function SaveAsPresetButton({ onClick }) {
  return (
    <button
      type="button"
      className={styles.saveAsPresetBtn}
      onClick={onClick}
      title="Save this setup as a new preset"
    >
      ★ Save as preset
    </button>
  );
}
