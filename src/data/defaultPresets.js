// Default starred presets seeded into every user's preset list (Firestore for
// signed-in users, localStorage for anonymous users) on first load. Once
// seeded, they're owned by the user — deletions stick, edits stick, and the
// seed flag prevents them from reappearing.
//
// Date ranges are relative: `relativeRange` is computed at load time so the
// chart always opens on today + span, regardless of when the preset was
// seeded. If the user overwrites a preset, `relativeRange` is dropped and
// explicit `startDate`/`endDate` are stored instead.

export const DEFAULT_PRESETS = [
  {
    name: 'Week Ahead Forecast',
    mode: 'world',
    isFavorite: true,
    relativeRange: { value: 7, unit: 'days' },
    jobs: [
      { transitPlanet: 'Mercury', targets: ['Venus', 'Sun', 'Mars', 'Jupiter', 'Saturn'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Venus', targets: ['Mars', 'Jupiter', 'Saturn', 'Sun'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Mars', targets: ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Saturn', targets: ['Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Sun', targets: ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Square', 'Trine', 'Sextile'], showRetrogrades: false, showSignChanges: true },
      { transitPlanet: 'Moon', targets: ['Mercury', 'Venus', 'Sun', 'Mars', 'Jupiter', 'Saturn'], aspects: ['Conjunction', 'Opposition', 'Square'], showRetrogrades: false, showSignChanges: true },
      { transitPlanet: 'Jupiter', targets: ['Saturn', 'Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
    ],
  },
  {
    name: 'Inferior Planet Forecast',
    mode: 'world',
    isFavorite: true,
    relativeRange: { value: 1, unit: 'months' },
    jobs: [
      { transitPlanet: 'Mercury', targets: ['Venus', 'Sun', 'Mars', 'Jupiter', 'Saturn'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Venus', targets: ['Mars', 'Jupiter', 'Saturn', 'Sun'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Moon', targets: ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'], aspects: ['Conjunction', 'Opposition'], showRetrogrades: false, showSignChanges: true },
    ],
  },
  {
    name: 'All Traditional Planets',
    mode: 'world',
    isFavorite: true,
    relativeRange: { value: 3, unit: 'months' },
    jobs: [
      { transitPlanet: 'Mercury', targets: ['Venus', 'Sun', 'Mars', 'Jupiter', 'Saturn'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Venus', targets: ['Mars', 'Jupiter', 'Saturn', 'Sun'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Mars', targets: ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Saturn', targets: ['Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Sun', targets: ['Venus', 'Mars', 'Jupiter', 'Saturn', 'Mercury'], aspects: ['Conjunction', 'Opposition', 'Square', 'Trine'], showRetrogrades: false, showSignChanges: true },
      { transitPlanet: 'Moon', targets: ['Sun'], aspects: ['Conjunction', 'Opposition'], showRetrogrades: false, showSignChanges: false },
      { transitPlanet: 'Jupiter', targets: ['Saturn', 'Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
    ],
  },
  {
    name: 'Superior Planet Forecast',
    mode: 'world',
    isFavorite: true,
    relativeRange: { value: 6, unit: 'months' },
    jobs: [
      { transitPlanet: 'Mars', targets: ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Saturn', targets: ['Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Jupiter', targets: ['Saturn', 'Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
    ],
  },
  {
    name: 'Outer Planet Forecast',
    mode: 'world',
    isFavorite: true,
    relativeRange: { value: 6, unit: 'months' },
    jobs: [
      { transitPlanet: 'Uranus', targets: ['Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Neptune', targets: ['Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Pluto', targets: [], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Saturn', targets: ['Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
      { transitPlanet: 'Jupiter', targets: ['Saturn', 'Uranus', 'Neptune', 'Pluto'], aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'], showRetrogrades: true, showSignChanges: true },
    ],
  },
];

// Resolve `relativeRange` against `now` into concrete startDate/endDate.
// Today at local midnight → today + span. Returns ISO strings.
export function resolveRelativeDates(relativeRange, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  const { value, unit } = relativeRange;
  if (unit === 'days') end.setDate(end.getDate() + value);
  else if (unit === 'weeks') end.setDate(end.getDate() + value * 7);
  else if (unit === 'months') end.setMonth(end.getMonth() + value);
  else if (unit === 'years') end.setFullYear(end.getFullYear() + value);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}
