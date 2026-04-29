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

const MAX_EVENTS_LARGE = 4;
const MAX_DOTS_SMALL = 4;

/**
 * Single month calendar grid.
 *
 * @param {Date} monthDate    - any date inside the month to render
 * @param {boolean} large     - true for the standalone month view, false for year-grid tiles
 * @param {Function} onMonthClick - if provided, makes the month title clickable (used in year view)
 * @param {Map<string, Array>} eventsByDay - 'yyyy-MM-dd' → events[]
 */
export default function MonthView({ monthDate, large = false, onMonthClick, eventsByDay }) {
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

          const dayKey = format(day, 'yyyy-MM-dd');
          const events = inMonth && eventsByDay ? eventsByDay.get(dayKey) : null;

          return (
            <div key={day.toISOString()} className={cls}>
              <div className={styles.dayNumber}>{day.getDate()}</div>
              {events && events.length > 0 && (
                large ? (
                  <DayEventsLarge events={events} />
                ) : (
                  <DayEventsSmall events={events} />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayEventsLarge({ events }) {
  const visible = events.slice(0, MAX_EVENTS_LARGE);
  const overflow = events.length - visible.length;
  return (
    <div className={styles.dayEvents}>
      {visible.map((e, i) => (
        <div
          key={i}
          className={styles.eventGlyphs}
          title={e.title}
        >
          {e.glyphs}
        </div>
      ))}
      {overflow > 0 && (
        <div className={styles.eventOverflow}>+{overflow}</div>
      )}
    </div>
  );
}

function DayEventsSmall({ events }) {
  const visible = events.slice(0, MAX_DOTS_SMALL);
  return (
    <div className={styles.dayDots}>
      {visible.map((e, i) => (
        <span
          key={i}
          className={styles.dot}
          style={{ background: e.color }}
          title={e.title}
        />
      ))}
    </div>
  );
}
