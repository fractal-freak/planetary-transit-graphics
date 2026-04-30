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
        <span className={styles.sectionTitleText}>{title}</span>
        <span className={styles.sectionToggleArrow}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </section>
  );
}
