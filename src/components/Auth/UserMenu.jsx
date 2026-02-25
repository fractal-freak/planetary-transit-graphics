import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../firebase/auth';
import styles from './Auth.module.css';

/**
 * Compact user avatar + dropdown in the header.
 * Shows sign-in button when logged out, avatar + menu when logged in.
 */
export default function UserMenu({ onSignInClick }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!user) {
    return (
      <button className={styles.signInBtn} onClick={onSignInClick}>
        Sign In
      </button>
    );
  }

  const initial = (user.displayName || user.email || '?')[0].toUpperCase();

  return (
    <div className={styles.userMenu} ref={menuRef}>
      <button
        className={styles.avatar}
        onClick={() => setOpen(o => !o)}
        title={user.displayName || user.email}
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt="" className={styles.avatarImg} />
        ) : (
          <span className={styles.avatarInitial}>{initial}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownUser}>
            <span className={styles.dropdownName}>
              {user.displayName || 'User'}
            </span>
            <span className={styles.dropdownEmail}>
              {user.email}
            </span>
          </div>
          <div className={styles.dropdownDivider} />
          <button
            className={styles.dropdownItem}
            onClick={() => { signOut(); setOpen(false); }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
