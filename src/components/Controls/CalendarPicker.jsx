import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './CalendarPicker.module.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatDisplay(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}/${date.getFullYear()}`;
}

function parseInput(str) {
  // Accept MM/DD/YYYY or M/D/YYYY
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const m = parseInt(parts[0], 10);
  const d = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  if (isNaN(m) || isNaN(d) || isNaN(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(y, m - 1, d);
  // Verify the date components match (catches invalid days like Feb 30)
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}

// Pixels of horizontal pointer movement that map to one unit when scrubbing
// a date segment. Uniform across day/month/year — the unit is determined
// by which segment (MM, DD, YYYY) the user grabs.
const SCRUB_PX_PER_UNIT = 4;
const SCRUB_DRAG_THRESHOLD_PX = 4;

function addDays(d, days) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(d, months) {
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addYears(d, years) {
  const next = new Date(d);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export default function CalendarPicker({ label, value, onChange, min, max }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const [viewMode, setViewMode] = useState('days'); // 'days' | 'months' | 'years'
  const [inputValue, setInputValue] = useState(formatDisplay(value));
  const [inputError, setInputError] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Drag-to-scrub state. Kept in a ref so we don't re-render on every move.
  const scrubRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startValue: null,
    moved: false,
    unit: 'day',
    lastDelta: 0,
    target: null,
  });

  // Compute dropdown position when it opens
  useEffect(() => {
    if (open && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, [open]);

  // Close on outside click (check both wrapper and portal dropdown)
  useEffect(() => {
    function handleClick(e) {
      const inWrapper = wrapperRef.current && wrapperRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inWrapper && !inDropdown) {
        setOpen(false);
        setViewMode('days');
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  // Sync view when value changes externally
  useEffect(() => {
    setViewYear(value.getFullYear());
    setViewMonth(value.getMonth());
    setInputValue(formatDisplay(value));
    setInputError(false);
  }, [value]);

  // ─── Manual input handling ───

  function handleInputChange(e) {
    const raw = e.target.value;
    setInputValue(raw);
    setInputError(false);
  }

  function handleInputCommit() {
    const parsed = parseInput(inputValue);
    if (!parsed) {
      setInputError(true);
      // Revert after brief flash
      setTimeout(() => {
        setInputValue(formatDisplay(value));
        setInputError(false);
      }, 800);
      return;
    }
    if (min && parsed < min) {
      setInputError(true);
      setTimeout(() => { setInputValue(formatDisplay(value)); setInputError(false); }, 800);
      return;
    }
    if (max && parsed > max) {
      setInputError(true);
      setTimeout(() => { setInputValue(formatDisplay(value)); setInputError(false); }, 800);
      return;
    }
    onChange(parsed);
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputCommit();
      inputRef.current?.blur();
      setEditingText(false);
    }
    if (e.key === 'Escape') {
      setInputValue(formatDisplay(value));
      setInputError(false);
      inputRef.current?.blur();
      setEditingText(false);
    }
  }

  function handleInputBlur() {
    // Only commit if value actually changed
    if (inputValue !== formatDisplay(value)) {
      handleInputCommit();
    }
    setEditingText(false);
  }

  // ─── Drag-to-scrub on a date segment ───
  // Each MM/DD/YYYY segment has its own handlers; the unit is fixed by which
  // segment the user grabs. A click without drag drops into the type-the-date
  // text input.
  function handleSegmentPointerDown(e, unit) {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
    e.preventDefault();
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); } catch {}
    scrubRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startValue: new Date(value),
      moved: false,
      unit,
      lastDelta: 0,
      target,
    };
  }

  function handleSegmentPointerMove(e) {
    const s = scrubRef.current;
    if (!s.active || s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.startX;
    if (!s.moved && Math.abs(dx) < SCRUB_DRAG_THRESHOLD_PX) return;
    if (!s.moved) s.moved = true;
    e.preventDefault();
    const delta = Math.round(dx / SCRUB_PX_PER_UNIT);
    if (delta === s.lastDelta) return;
    s.lastDelta = delta;
    let next;
    if (s.unit === 'year') next = addYears(s.startValue, delta);
    else if (s.unit === 'month') next = addMonths(s.startValue, delta);
    else next = addDays(s.startValue, delta);
    if (min && next < min) next = min;
    if (max && next > max) next = max;
    onChange(next);
  }

  function handleSegmentPointerUp(e) {
    const s = scrubRef.current;
    if (!s.active || s.pointerId !== e.pointerId) return;
    try { s.target?.releasePointerCapture?.(e.pointerId); } catch {}
    const wasDrag = s.moved;
    s.active = false;
    s.target = null;
    // Click without drag → drop into typing mode for the whole date.
    if (!wasDrag) setEditingText(true);
  }

  function handleSegmentPointerCancel(e) {
    const s = scrubRef.current;
    if (!s.active || s.pointerId !== e.pointerId) return;
    s.active = false;
    s.target = null;
  }

  // Auto-focus + select the text input when the user clicks a segment.
  useEffect(() => {
    if (editingText && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingText]);

  function exitEditingText() {
    setEditingText(false);
  }

  // ─── Month navigation ───

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  }

  // ─── Day selection ───

  function selectDay(day) {
    const selected = new Date(viewYear, viewMonth, day);
    if (min && selected < min) return;
    if (max && selected > max) return;
    onChange(selected);
    setOpen(false);
    setViewMode('days');
  }

  function selectToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (min && today < min) return;
    if (max && today > max) return;
    onChange(today);
    setOpen(false);
    setViewMode('days');
  }

  // ─── Month selection (from month grid) ───

  function selectMonth(monthIdx) {
    setViewMonth(monthIdx);
    setViewMode('days');
  }

  // ─── Year selection (from year grid) ───

  const yearRangeStart = Math.floor(viewYear / 12) * 12;

  function selectYear(year) {
    setViewYear(year);
    setViewMode('months');
  }

  function prevYearRange() {
    setViewYear(y => Math.floor(y / 12) * 12 - 12);
  }

  function nextYearRange() {
    setViewYear(y => Math.floor(y / 12) * 12 + 12);
  }

  // ─── Disabled checks ───

  function isDisabled(day) {
    const d = new Date(viewYear, viewMonth, day);
    if (min && d < min) return true;
    if (max && d > max) return true;
    return false;
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  // Build day grid cells
  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  // ─── Render ───

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <span className={styles.label}>{label}</span>

      {/* Editable date input + calendar icon toggle */}
      <div className={`${styles.trigger} ${inputError ? styles.triggerError : ''}`}>
        {editingText ? (
          <input
            ref={inputRef}
            type="text"
            className={styles.dateInput}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            onFocus={(e) => e.target.select()}
            spellCheck={false}
            autoComplete="off"
          />
        ) : (
          <span className={styles.dateSegments}>
            <span
              className={styles.dateSegment}
              onPointerDown={(e) => handleSegmentPointerDown(e, 'month')}
              onPointerMove={handleSegmentPointerMove}
              onPointerUp={handleSegmentPointerUp}
              onPointerCancel={handleSegmentPointerCancel}
              title="Drag to scrub the month, click to type"
            >
              {String(value.getMonth() + 1).padStart(2, '0')}
            </span>
            <span className={styles.dateSegmentSep}>/</span>
            <span
              className={styles.dateSegment}
              onPointerDown={(e) => handleSegmentPointerDown(e, 'day')}
              onPointerMove={handleSegmentPointerMove}
              onPointerUp={handleSegmentPointerUp}
              onPointerCancel={handleSegmentPointerCancel}
              title="Drag to scrub the day, click to type"
            >
              {String(value.getDate()).padStart(2, '0')}
            </span>
            <span className={styles.dateSegmentSep}>/</span>
            <span
              className={styles.dateSegment}
              onPointerDown={(e) => handleSegmentPointerDown(e, 'year')}
              onPointerMove={handleSegmentPointerMove}
              onPointerUp={handleSegmentPointerUp}
              onPointerCancel={handleSegmentPointerCancel}
              title="Drag to scrub the year, click to type"
            >
              {value.getFullYear()}
            </span>
          </span>
        )}
        <button
          type="button"
          className={styles.calIconBtn}
          onClick={() => { setOpen(o => !o); setViewMode('days'); }}
          tabIndex={-1}
        >
          &#x1F4C5;
        </button>
      </div>

      {open && createPortal(
        <div
          className={styles.dropdown}
          ref={dropdownRef}
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {/* ─── DAYS VIEW ─── */}
          {viewMode === 'days' && (
            <>
              <div className={styles.navRow}>
                <button className={styles.navBtn} onClick={prevMonth} type="button">&lsaquo;</button>
                <div className={styles.navCenter}>
                  <button
                    className={styles.navTitleBtn}
                    onClick={() => setViewMode('months')}
                    type="button"
                  >
                    {MONTH_NAMES[viewMonth]}
                  </button>
                  <button
                    className={styles.navTitleBtn}
                    onClick={() => setViewMode('years')}
                    type="button"
                  >
                    {viewYear}
                  </button>
                </div>
                <button className={styles.navBtn} onClick={nextMonth} type="button">&rsaquo;</button>
              </div>

              <div className={styles.dayLabels}>
                {DAY_LABELS.map(dl => (
                  <span key={dl} className={styles.dayLabel}>{dl}</span>
                ))}
              </div>

              <div className={styles.grid}>
                {cells.map((day, i) =>
                  day === null ? (
                    <span key={`empty-${i}`} className={styles.emptyCell} />
                  ) : (
                    <button
                      key={day}
                      type="button"
                      disabled={isDisabled(day)}
                      className={`${styles.dayCell} ${sameDay(new Date(viewYear, viewMonth, day), value) ? styles.selected : ''}`}
                      onClick={() => selectDay(day)}
                    >
                      {day}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                className={styles.todayBtn}
                onClick={selectToday}
              >
                Today
              </button>
            </>
          )}

          {/* ─── MONTHS VIEW ─── */}
          {viewMode === 'months' && (
            <>
              <div className={styles.navRow}>
                <button className={styles.navBtn} onClick={() => setViewYear(y => y - 1)} type="button">&lsaquo;</button>
                <button
                  className={styles.navTitleBtn}
                  onClick={() => setViewMode('years')}
                  type="button"
                >
                  {viewYear}
                </button>
                <button className={styles.navBtn} onClick={() => setViewYear(y => y + 1)} type="button">&rsaquo;</button>
              </div>

              <div className={styles.monthGrid}>
                {MONTH_SHORT.map((name, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`${styles.monthCell} ${idx === viewMonth && viewYear === value.getFullYear() ? styles.selectedMonth : ''}`}
                    onClick={() => selectMonth(idx)}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setViewMode('days')}
              >
                ← Back to days
              </button>
            </>
          )}

          {/* ─── YEARS VIEW ─── */}
          {viewMode === 'years' && (
            <>
              <div className={styles.navRow}>
                <button className={styles.navBtn} onClick={prevYearRange} type="button">&lsaquo;</button>
                <span className={styles.navTitle}>
                  {yearRangeStart} – {yearRangeStart + 11}
                </span>
                <button className={styles.navBtn} onClick={nextYearRange} type="button">&rsaquo;</button>
              </div>

              <div className={styles.yearGrid}>
                {Array.from({ length: 12 }, (_, i) => yearRangeStart + i).map(year => (
                  <button
                    key={year}
                    type="button"
                    className={`${styles.yearCell} ${year === viewYear ? styles.selectedYear : ''}`}
                    onClick={() => selectYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setViewMode('months')}
              >
                ← Back to months
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
