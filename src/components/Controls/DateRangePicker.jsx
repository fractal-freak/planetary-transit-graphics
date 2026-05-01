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

// Pixels of horizontal pointer movement that map to 1 year of age.
const SCRUB_PX_PER_YEAR = 6;
// Movement threshold (px) that distinguishes a click from a drag.
const DRAG_THRESHOLD_PX = 4;
// Hard cap on the visible date range. Beyond this the ephemeris compute
// gets prohibitively slow and the canvas can lock the main thread, so we
// clamp any change that would exceed it.
const MAX_RANGE_DAYS = 365 * 10;

export default function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  natalBirthDate,
}) {
  const birth = parseBirthDate(natalBirthDate);
  const showAges = !!birth;

  const [fromAgeEditing, setFromAgeEditing] = useState(false);
  const [toAgeEditing, setToAgeEditing] = useState(false);

  // Keep the previous startDate so we can compute the span shift
  const prevStartRef = useRef(startDate);
  useEffect(() => { prevStartRef.current = startDate; }, [startDate]);

  // Drag state for the scrub interaction. We keep it in a ref so we can
  // mutate without re-rendering on every move.
  const dragRef = useRef({
    active: false,
    isFrom: false,
    pointerId: null,
    startX: 0,
    startAge: 0,
    moved: false,
    lastAppliedAge: 0,
    target: null,
  });

  function setQuickRange(days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + days);
    onStartChange(today);
    onEndChange(end);
  }

  // Snap-to-span: when From moves, slide To by the same delta to preserve span.
  // Also enforces MAX_RANGE_DAYS — span is capped so it can't balloon past the
  // safe compute window even if a stale span value sneaks through.
  function handleStartChange(newStart) {
    const oldStart = prevStartRef.current;
    if (oldStart && endDate) {
      const rawSpan = diffDays(oldStart, endDate);
      const span = Math.max(1, Math.min(rawSpan, MAX_RANGE_DAYS));
      const newEnd = addDays(newStart, span);
      onStartChange(newStart);
      onEndChange(newEnd);
    } else {
      onStartChange(newStart);
    }
  }

  // Clamp End to startDate + MAX_RANGE_DAYS. Snap-to-span already prevents
  // From-driven explosions; this catches direct End edits (typed dates,
  // scrubbed end segment, etc.).
  function handleEndChange(newEnd) {
    const cap = addDays(startDate, MAX_RANGE_DAYS);
    const clamped = newEnd > cap ? cap : newEnd;
    onEndChange(clamped);
  }

  function commitFromAge(raw) {
    setFromAgeEditing(false);
    if (!birth) return;
    const n = parseInt((raw || '').trim(), 10);
    if (isNaN(n)) return;
    handleStartChange(dateAtAge(birth, n));
  }

  function commitToAge(raw) {
    setToAgeEditing(false);
    if (!birth) return;
    const n = parseInt((raw || '').trim(), 10);
    if (isNaN(n)) return;
    handleEndChange(dateAtAge(birth, n));
  }

  // ─── Drag-to-scrub on the age value ───
  function handleAgePointerDown(e, isFrom, currentAge) {
    if (!birth) return;
    e.preventDefault();
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); } catch {}
    dragRef.current = {
      active: true,
      isFrom,
      pointerId: e.pointerId,
      startX: e.clientX,
      startAge: currentAge,
      moved: false,
      lastAppliedAge: currentAge,
      target,
    };
  }

  function handleAgePointerMove(e) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) >= DRAG_THRESHOLD_PX) drag.moved = true;
    if (!drag.moved) return;
    const deltaYears = Math.round(dx / SCRUB_PX_PER_YEAR);
    const newAge = drag.startAge + deltaYears;
    if (newAge === drag.lastAppliedAge) return;
    drag.lastAppliedAge = newAge;
    const next = dateAtAge(birth, newAge);
    if (drag.isFrom) handleStartChange(next);
    else handleEndChange(next);
  }

  function handleAgePointerUp(e) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    try { drag.target?.releasePointerCapture?.(e.pointerId); } catch {}
    const wasDrag = drag.moved;
    drag.active = false;
    drag.target = null;
    // Click without drag → enter type-the-age edit mode.
    if (!wasDrag) {
      if (drag.isFrom) setFromAgeEditing(true);
      else setToAgeEditing(true);
    }
  }

  function handleAgePointerCancel(e) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    drag.active = false;
    drag.target = null;
  }

  const fromAge = showAges ? ageAt(birth, startDate) : null;
  const toAge = showAges ? ageAt(birth, endDate) : null;
  const beforeBirthFrom = fromAge !== null && fromAge < 0;
  const beforeBirthTo = toAge !== null && toAge < 0;

  function renderAgeRow({ isFrom, age, beforeBirth, editing, setEditing, commit }) {
    return (
      <div className={styles.ageRow}>
        <span className={styles.ageRowLabel}>age</span>
        {editing ? (
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            className={styles.ageInput}
            defaultValue={age ?? ''}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(e.target.value); }
              if (e.key === 'Escape') { setEditing(false); }
            }}
            maxLength={4}
          />
        ) : (
          <button
            type="button"
            className={styles.ageValueBtn}
            onPointerDown={(e) => handleAgePointerDown(e, isFrom, age ?? 0)}
            onPointerMove={handleAgePointerMove}
            onPointerUp={handleAgePointerUp}
            onPointerCancel={handleAgePointerCancel}
            title="Drag to scrub, click to type"
          >
            {beforeBirth ? 'before birth' : (age ?? '—')}
          </button>
        )}
      </div>
    );
  }

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

      <CalendarPicker
        label="From"
        value={startDate}
        onChange={handleStartChange}
        max={new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 1)}
      />
      {showAges && renderAgeRow({
        isFrom: true,
        age: fromAge,
        beforeBirth: beforeBirthFrom,
        editing: fromAgeEditing,
        setEditing: setFromAgeEditing,
        commit: commitFromAge,
      })}

      <CalendarPicker
        label="To"
        value={endDate}
        onChange={handleEndChange}
        min={new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1)}
        max={addDays(startDate, MAX_RANGE_DAYS)}
      />
      {showAges && renderAgeRow({
        isFrom: false,
        age: toAge,
        beforeBirth: beforeBirthTo,
        editing: toAgeEditing,
        setEditing: setToAgeEditing,
        commit: commitToAge,
      })}
    </div>
  );
}
