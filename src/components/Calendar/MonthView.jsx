import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from 'date-fns';
import styles from './AlignmentCalendar.module.css';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Single month calendar grid.
 *
 * @param {Date} monthDate    - any date inside the month to render
 * @param {boolean} large     - true for the standalone month view, false for year-grid tiles
 * @param {Function} onMonthClick - if provided, makes the month title clickable (used in year view)
 */
export default function MonthView({ monthDate, large = false, onMonthClick }) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const monthClass = `${styles.month} ${large ? styles.monthLarge : styles.monthSmall}`;

  return (
    <div className={monthClass}>
      <div className={styles.monthTitle}>
        {onMonthClick ? (
          <button type="button" className={styles.monthTitleBtn} onClick={onMonthClick}>
            {format(monthDate, 'MMMM')}
          </button>
        ) : (
          <span>{format(monthDate, large ? 'MMMM yyyy' : 'MMMM')}</span>
        )}
      </div>

      <div className={styles.weekdays}>
        {WEEKDAYS.map(d => (
          <div key={d} className={styles.weekday}>{d}</div>
        ))}
      </div>

      <div className={styles.daysGrid}>
        {days.map(day => {
          const inMonth = isSameMonth(day, monthDate);
          const today = inMonth && isToday(day);
          const cls = [
            styles.day,
            !inMonth && styles.dayOutside,
            today && styles.dayToday,
          ].filter(Boolean).join(' ');

          return (
            <div key={day.toISOString()} className={cls}>
              <div className={styles.dayNumber}>{day.getDate()}</div>
              {/* Event glyphs go here once data is wired up */}
            </div>
          );
        })}
      </div>
    </div>
  );
}
