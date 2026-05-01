import { useState, useEffect, useRef } from 'react';
import CalendarPicker from './CalendarPicker';
import styles from './Controls.module.css';

/**
 * Convert a YYYY-MM-DD birthdate string into a Date at local midnight.
 * Returns null if the string isn't parseable.
 */
function parseBirthDate(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return isNaN(d.getTime()) ? null : d;
}

/** Whole years from birthDate to targetDate, floored. */
function ageAt(birthDate, targetDate) {
  if (!birthDate || !targetDate) return null;
  let years = targetDate.getFullYear() - birthDate.getFullYear();
  const m = targetDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && targetDate.getDate() < birthDate.getDate())) {
    years -= 1;
  }
  return years;
}

/** Date when the chart owner reaches `age` (their nth birthday). */
function dateAtAge(birthDate, age) {
  const d = new Date(birthDate);
  d.setFullYear(d.getFullYear() + age);
  return d;
}

function diffDays(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addDays(d, days) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  natalBirthDate,
}) {
  const birth = parseBirthDate(natalBirthDate);
  const showAges = !!birth;

  // Track "from age" / "to age" as edit-buffers for the inline inputs
  const [fromAgeBuffer, setFromAgeBuffer] = useState('');
  const [toAgeBuffer, setToAgeBuffer] = useState('');
  const [fromAgeEditing, setFromAgeEditing] = useState(false);
  const [toAgeEditing, setToAgeEditing] = useState(false);

  // Keep the previous startDate so we can compute the span shift
  const prevStartRef = useRef(startDate);
  useEffect(() => { prevStartRef.current = startDate; }, [startDate]);

  function setQuickRange(days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + days);
    onStartChange(today);
    onEndChange(end);
  }

  // Snap-to-span: when From moves, slide To by the same delta to preserve span.
  // This prevents the "I picked 1943 then the chart froze" scenario because
  // span never balloons.
  function handleStartChange(newStart) {
    const oldStart = prevStartRef.current;
    if (oldStart && endDate) {
      const span = diffDays(oldStart, endDate);
      const newEnd = addDays(newStart, Math.max(span, 1));
      onStartChange(newStart);
      onEndChange(newEnd);
    } else {
      onStartChange(newStart);
    }
  }

  function commitFromAge(raw) {
    setFromAgeEditing(false);
    if (!birth) return;
    const n = parseInt((raw || '').trim(), 10);
    if (isNaN(n)) return;
    const next = dateAtAge(birth, n);
    handleStartChange(next);
  }

  function commitToAge(raw) {
    setToAgeEditing(false);
    if (!birth) return;
    const n = parseInt((raw || '').trim(), 10);
    if (isNaN(n)) return;
    const next = dateAtAge(birth, n);
    onEndChange(next);
  }

  const fromAge = showAges ? ageAt(birth, startDate) : null;
  const toAge = showAges ? ageAt(birth, endDate) : null;
  const beforeBirthFrom = fromAge !== null && fromAge < 0;
  const beforeBirthTo = toAge !== null && toAge < 0;

  return (
    <div className={styles.dateRange}>
      <div className={styles.quickRange}>
        <button type="button" className={styles.quickRangeBtn} onClick={() => setQuickRange(7)}>7 Days</button>
        <button type="button" className={styles.quickRangeBtn} onClick={() => setQuickRange(30)}>30 Days</button>
        <button type="button" className={styles.quickRangeBtn} onClick={() => setQuickRange(90)}>3 Months</button>
        <button type="button" className={styles.quickRangeBtn} onClick={() => setQuickRange(182)}>6 Months</button>
        <button type="button" className={styles.quickRangeBtn} onClick={() => setQuickRange(365)}>12 Months</button>
        <button type="button" className={styles.quickRangeBtn} onClick={() => setQuickRange(1095)}>3 Years</button>
      </div>

      {showAges && fromAge !== null && toAge !== null && !beforeBirthFrom && !beforeBirthTo && (
        <div className={styles.ageSummary}>
          Showing ages <strong>{fromAge}</strong> → <strong>{toAge}</strong>
        </div>
      )}

      <CalendarPicker
        label="From"
        value={startDate}
        onChange={handleStartChange}
        max={new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 1)}
      />
      {showAges && (
        <div className={styles.ageRow}>
          <span className={styles.ageRowLabel}>age</span>
          {fromAgeEditing ? (
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              className={styles.ageInput}
              defaultValue={fromAge ?? ''}
              onBlur={(e) => commitFromAge(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitFromAge(e.target.value); }
                if (e.key === 'Escape') { setFromAgeEditing(false); }
              }}
              maxLength={4}
            />
          ) : (
            <button
              type="button"
              className={styles.ageValueBtn}
              onClick={() => setFromAgeEditing(true)}
              title="Click to type age"
            >
              {beforeBirthFrom ? 'before birth' : (fromAge ?? '—')}
            </button>
          )}
        </div>
      )}

      <CalendarPicker
        label="To"
        value={endDate}
        onChange={onEndChange}
        min={new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1)}
      />
      {showAges && (
        <div className={styles.ageRow}>
          <span className={styles.ageRowLabel}>age</span>
          {toAgeEditing ? (
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              className={styles.ageInput}
              defaultValue={toAge ?? ''}
              onBlur={(e) => commitToAge(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitToAge(e.target.value); }
                if (e.key === 'Escape') { setToAgeEditing(false); }
              }}
              maxLength={4}
            />
          ) : (
            <button
              type="button"
              className={styles.ageValueBtn}
              onClick={() => setToAgeEditing(true)}
              title="Click to type age"
            >
              {beforeBirthTo ? 'before birth' : (toAge ?? '—')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
