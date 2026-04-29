import { useState, useMemo, useEffect } from 'react';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  format,
  isWithinInterval,
} from 'date-fns';
import MonthView from './MonthView';
import { buildEventMap } from '../../utils/calendarEvents';
import { useTransits } from '../../hooks/useTransits';
import { useNatalTransits } from '../../hooks/useNatalTransits';
import { useMundaneTransits } from '../../hooks/useMundaneTransits';
import styles from './AlignmentCalendar.module.css';

const BACK_BUFFER = 3;     // months behind the viewed month
const FORWARD_BUFFER = 12; // months ahead of the viewed month

/**
 * Build a [start, end] range covering the visible month/year plus buffer.
 * - Month view: viewedMonth - 3 ... viewedMonth + 12
 * - Year view:  Jan(year) - 1mo ... Dec(year) + 1mo
 */
function rangeFor(date, view) {
  if (view === 'year') {
    const y = date.getFullYear();
    return {
      start: subMonths(new Date(y, 0, 1), 1),
      end: addMonths(new Date(y, 11, 31), 1),
    };
  }
  const m = startOfMonth(date);
  return {
    start: subMonths(m, BACK_BUFFER),
    end: endOfMonth(addMonths(m, FORWARD_BUFFER)),
  };
}

export default function AlignmentCalendar({
  mode,
  transitJobs = [],
  natalJobs = [],
  natalChart = null,
  mundaneJobs = [],
  stackCharts = [],
  orbSettings,
  currentDate,
  onCurrentDateChange,
  view,
  onViewChange,
}) {
  const setCurrentDate = onCurrentDateChange;
  const setView = onViewChange;

  // Compute range — slides only when the viewed area falls outside it.
  const [calRange, setCalRange] = useState(() => rangeFor(new Date(), 'month'));

  useEffect(() => {
    const needed = rangeFor(currentDate, view);
    // If the needed window isn't fully inside the current range, recompute.
    const insideStart = isWithinInterval(needed.start, { start: calRange.start, end: calRange.end });
    const insideEnd = isWithinInterval(needed.end, { start: calRange.start, end: calRange.end });
    if (!insideStart || !insideEnd) {
      setCalRange(needed);
    }
  }, [currentDate, view, calRange]);

  // Each hook returns early when its jobs are empty, so passing [] to the
  // inactive ones avoids wasted compute. Hooks themselves can't be called
  // conditionally, so we always call all three but gate by mode at the args.
  const worldResult = useTransits(
    mode === 'world' ? transitJobs : [],
    calRange.start, calRange.end, orbSettings
  );
  const natalResult = useNatalTransits(
    mode === 'natal' ? natalJobs : [],
    natalChart, calRange.start, calRange.end, orbSettings
  );
  const mundaneResult = useMundaneTransits(
    mode === 'mundane' ? mundaneJobs : [],
    stackCharts, calRange.start, calRange.end, orbSettings
  );

  const active = mode === 'natal' ? natalResult
    : mode === 'mundane' ? mundaneResult
    : worldResult;

  const eventsByDay = useMemo(
    () => buildEventMap(active.curves, active.signChanges),
    [active.curves, active.signChanges]
  );

  const year = currentDate.getFullYear();

  function goPrev() {
    if (view === 'month') {
      setCurrentDate(d => subMonths(d, 1));
    } else {
      setCurrentDate(d => new Date(d.getFullYear() - 1, d.getMonth(), 1));
    }
  }

  function goNext() {
    if (view === 'month') {
      setCurrentDate(d => addMonths(d, 1));
    } else {
      setCurrentDate(d => new Date(d.getFullYear() + 1, d.getMonth(), 1));
    }
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  const heading = view === 'month' ? format(currentDate, 'MMMM yyyy') : String(year);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={goPrev}
            aria-label={view === 'month' ? 'Previous month' : 'Previous year'}
          >
            ‹
          </button>
          <h2 className={styles.heading}>{heading}</h2>
          <button
            type="button"
            className={styles.navBtn}
            onClick={goNext}
            aria-label={view === 'month' ? 'Next month' : 'Next year'}
          >
            ›
          </button>
          <button type="button" className={styles.todayBtn} onClick={goToday}>
            Today
          </button>
          {active.loading && (
            <span className={styles.loadingHint}>Computing…</span>
          )}
        </div>

        <div className={styles.toolbarRight}>
          <div className={styles.viewSwitcher}>
            <button
              type="button"
              className={`${styles.viewTab} ${view === 'month' ? styles.viewTabActive : ''}`}
              onClick={() => setView('month')}
            >
              Month
            </button>
            <button
              type="button"
              className={`${styles.viewTab} ${view === 'year' ? styles.viewTabActive : ''}`}
              onClick={() => setView('year')}
            >
              Year
            </button>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {view === 'month' ? (
          <MonthView monthDate={currentDate} large eventsByDay={eventsByDay} />
        ) : (
          <div className={styles.yearGrid}>
            {Array.from({ length: 12 }, (_, i) => (
              <MonthView
                key={i}
                monthDate={new Date(year, i, 1)}
                eventsByDay={eventsByDay}
                onMonthClick={() => {
                  setCurrentDate(new Date(year, i, 1));
                  setView('month');
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
