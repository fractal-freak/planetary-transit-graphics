import { useTheme } from '../../contexts/ThemeContext';
import styles from './Controls.module.css';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className={styles.themeToggleLabel}>
        {isDark ? 'Dark Mode' : 'Light Mode'}
      </span>
      <span className={styles.themeToggleIcon} aria-hidden="true">
        {isDark ? '☀' : '☾'}
      </span>
    </button>
  );
}
