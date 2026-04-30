import { useState } from 'react';
import styles from './Controls.module.css';

const STORAGE_PREFIX = 'transitwiz.section.';

export default function CollapsibleSection({ id, title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(() => {
    if (!id) return defaultOpen;
    try {
      const v = localStorage.getItem(STORAGE_PREFIX + id);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch {}
    return defaultOpen;
  });

  function toggle() {
    setOpen(o => {
      const next = !o;
      if (id) {
        try { localStorage.setItem(STORAGE_PREFIX + id, next ? '1' : '0'); } catch {}
      }
      return next;
    });
  }

  return (
    <section className={`${styles.section} ${open ? styles.sectionOpen : styles.sectionClosed}`}>
      <button
        type="button"
        className={styles.sectionTitleToggle}
        onClick={toggle}
        aria-expanded={open}
      >
        {icon && <span className={styles.sectionIcon}>{icon}</span>}
        <span className={styles.sectionTitleGroup}>
          <span className={styles.sectionTitleText}>{title}</span>
          <svg
            className={`${styles.sectionToggleArrow} ${open ? styles.sectionToggleArrowOpen : ''}`}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </section>
  );
}
