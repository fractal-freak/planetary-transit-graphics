import { useState, useMemo } from 'react';
import { addMonths, subMonths, format } from 'date-fns';
import MonthView from './MonthView';
import { buildPerfectionMap } from '../../utils/calendarEvents';
import styles from './AlignmentCalendar.module.css';

export default function AlignmentCalendar({ curves = [] }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState('month'); // 'month' | 'year'

  const eventsByDay = useMemo(() => buildPerfectionMap(curves), [curves]);

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
