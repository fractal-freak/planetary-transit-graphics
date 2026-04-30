import { useTheme } from '../../contexts/ThemeContext';
import { IconSun, IconMoon } from './sectionIcons';
import styles from './Controls.module.css';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className={styles.themeToggleIcon} aria-hidden="true">
        {isDark ? <IconMoon /> : <IconSun />}
      </span>
      <span className={styles.themeToggleLabel}>
        {isDark ? 'Dark Mode' : 'Light Mode'}
      </span>
    </button>
  );
}
