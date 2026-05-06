/**
 * Compact "time since" label: "just now", "3 min ago", "2 hr ago", "Apr 22".
 * Returns "" for null/invalid input so callers can render conditionally.
 */
export function formatTimeAgo(msEpoch, now = Date.now()) {
  if (typeof msEpoch !== 'number' || !isFinite(msEpoch)) return '';
  const diff = Math.max(0, now - msEpoch);
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return 'just now';
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  const d = new Date(msEpoch);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
