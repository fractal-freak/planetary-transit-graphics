import CalendarPicker from './CalendarPicker';
import styles from './Controls.module.css';

export default function DateRangePicker({ startDate, endDate, onStartChange, onEndChange }) {
  function setQuickRange(days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + days);
    onStartChange(today);
    onEndChange(end);
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
        onChange={onStartChange}
        max={new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 1)}
      />
      <CalendarPicker
        label="To"
        value={endDate}
        onChange={onEndChange}
        min={new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1)}
      />
    </div>
  );
}
