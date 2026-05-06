export const PLANETS = [
  {
    id: 'Sun',
    name: 'Sun',
    symbol: '☉',
    color: '#AA5500',
    glowColor: 'rgba(170, 85, 0, 0.5)',
    defaultEnabled: true,
  },
  {
    id: 'Moon',
    name: 'Moon',
    symbol: '☽',
    color: '#C8C8D0',
    glowColor: 'rgba(200, 200, 208, 0.4)',
    defaultEnabled: false,
  },
  {
    id: 'Mercury',
    name: 'Mercury',
    symbol: '☿',
    color: '#AA00AA',
    glowColor: 'rgba(170, 0, 170, 0.4)',
    defaultEnabled: true,
  },
  {
    id: 'Venus',
    name: 'Venus',
    symbol: '♀',
    color: '#00AAAA',
    glowColor: 'rgba(0, 170, 170, 0.45)',
    defaultEnabled: true,
  },
  {
    id: 'Mars',
    name: 'Mars',
    symbol: '♂',
    color: '#FF5555',
    glowColor: 'rgba(255, 85, 85, 0.45)',
    defaultEnabled: true,
  },
  {
    id: 'Jupiter',
    name: 'Jupiter',
    symbol: '♃',
    color: '#555555',
    glowColor: 'rgba(85, 85, 85, 0.4)',
    defaultEnabled: true,
  },
  {
    id: 'Saturn',
    name: 'Saturn',
    symbol: '♄',
    color: '#AA0000',
    glowColor: 'rgba(170, 0, 0, 0.4)',
    defaultEnabled: true,
  },
  {
    id: 'Uranus',
    name: 'Uranus',
    symbol: '♅',
    color: '#5555FF',
    glowColor: 'rgba(85, 85, 255, 0.4)',
    defaultEnabled: false,
  },
  {
    id: 'Neptune',
    name: 'Neptune',
    symbol: '♆',
    color: '#00AAAA',
    glowColor: 'rgba(0, 170, 170, 0.4)',
    defaultEnabled: false,
  },
  {
    id: 'Pluto',
    name: 'Pluto',
    symbol: '♇',
    color: '#AA0000',
    glowColor: 'rgba(170, 0, 0, 0.4)',
    defaultEnabled: false,
  },
  {
    id: 'TrueNode',
    name: 'Lunar Nodes',
    symbol: '☊',
    color: '#000000',
    glowColor: 'rgba(0, 0, 0, 0.35)',
    defaultEnabled: false,
    conjunctionOnly: true,
  },
];

/**
 * Natal chart angles — fixed ecliptic points derived from birth time + location.
 * These are not moving bodies; they serve as natal targets only.
 */
export const NATAL_ANGLES = [
  {
    id: 'Asc',
    name: 'Ascendant',
    symbol: 'AC',
    color: '#000000',
    glowColor: 'rgba(0, 0, 0, 0.4)',
    isAngle: true,
  },
  {
    id: 'Dsc',
    name: 'Descendant',
    symbol: 'DC',
    color: '#000000',
    glowColor: 'rgba(0, 0, 0, 0.4)',
    isAngle: true,
  },
  {
    id: 'MC',
    name: 'Midheaven',
    symbol: 'MC',
    color: '#000000',
    glowColor: 'rgba(0, 0, 0, 0.4)',
    isAngle: true,
  },
  {
    id: 'IC',
    name: 'Imum Coeli',
    symbol: 'IC',
    color: '#000000',
    glowColor: 'rgba(0, 0, 0, 0.4)',
    isAngle: true,
  },
];

export const NATAL_ANGLE_IDS = NATAL_ANGLES.map(a => a.id);

export const PLANET_MAP = Object.fromEntries(
  [...PLANETS, ...NATAL_ANGLES].map(p => [p.id, p])
);

/**
 * Planet speed ordering — fastest to slowest.
 * Used to determine which planets a given planet can track transits against.
 */
export const SPEED_ORDER = [
  'Moon', 'Mercury', 'Venus', 'Sun', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'TrueNode',
];

/**
 * Bodies that never exhibit retrograde motion.
 * Sun and Moon always move direct; TrueNode oscillates but doesn't retrograde conventionally.
 */
export const NON_RETROGRADE_PLANETS = new Set(['Sun', 'Moon', 'TrueNode']);

/**
 * Returns the list of planets slower than the given planet.
 * E.g. getSlowerPlanets('Jupiter') → ['Saturn', 'Uranus', 'Neptune', 'Pluto']
 */
export function getSlowerPlanets(planetId) {
  const idx = SPEED_ORDER.indexOf(planetId);
  if (idx === -1 || idx === SPEED_ORDER.length - 1) return [];
  return SPEED_ORDER.slice(idx + 1);
}

/**
 * Returns all other planets (excluding the given planet), preserving speed order.
 */
export function getOtherPlanets(planetId) {
  return SPEED_ORDER.filter(id => id !== planetId);
}

/**
 * Returns the list of planets faster than the given planet.
 * E.g. getFasterPlanets('Jupiter') → ['Moon', 'Sun', 'Mercury', 'Venus', 'Mars']
 */
export function getFasterPlanets(planetId) {
  const idx = SPEED_ORDER.indexOf(planetId);
  if (idx <= 0) return [];
  return SPEED_ORDER.slice(0, idx);
}

/**
 * Returns true if planetA is faster than planetB (lower index in SPEED_ORDER).
 */
export function isFasterThan(planetA, planetB) {
  return SPEED_ORDER.indexOf(planetA) < SPEED_ORDER.indexOf(planetB);
}

/**
 * Default transit jobs shown on first load.
 */
export const DEFAULT_JOBS = [
  {
    id: 'default-1',
    transitPlanet: 'Jupiter',
    targets: ['Saturn'],
    aspects: ['Conjunction', 'Opposition', 'Trine', 'Square', 'Sextile'],
    showSignChanges: true,
    showRetrogrades: true,
  },
];
