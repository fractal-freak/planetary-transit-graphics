export const PLANETS = [
  {
    id: 'Sun',
    name: 'Sun',
    symbol: '☉',
    color: '#F5C842',
    glowColor: 'rgba(245, 200, 66, 0.5)',
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
    color: '#D4A96A',
    glowColor: 'rgba(212, 169, 106, 0.4)',
    defaultEnabled: true,
  },
  {
    id: 'Venus',
    name: 'Venus',
    symbol: '♀',
    color: '#F0D080',
    glowColor: 'rgba(240, 208, 128, 0.45)',
    defaultEnabled: true,
  },
  {
    id: 'Mars',
    name: 'Mars',
    symbol: '♂',
    color: '#E05C3A',
    glowColor: 'rgba(224, 92, 58, 0.45)',
    defaultEnabled: true,
  },
  {
    id: 'Jupiter',
    name: 'Jupiter',
    symbol: '♃',
    color: '#C8A050',
    glowColor: 'rgba(200, 160, 80, 0.4)',
    defaultEnabled: true,
  },
  {
    id: 'Saturn',
    name: 'Saturn',
    symbol: '♄',
    color: '#E8D090',
    glowColor: 'rgba(232, 208, 144, 0.35)',
    defaultEnabled: true,
  },
  {
    id: 'Uranus',
    name: 'Uranus',
    symbol: '♅',
    color: '#60D0D8',
    glowColor: 'rgba(96, 208, 216, 0.4)',
    defaultEnabled: false,
  },
  {
    id: 'Neptune',
    name: 'Neptune',
    symbol: '♆',
    color: '#4070E8',
    glowColor: 'rgba(64, 112, 232, 0.4)',
    defaultEnabled: false,
  },
  {
    id: 'Pluto',
    name: 'Pluto',
    symbol: '♇',
    color: '#A08090',
    glowColor: 'rgba(160, 128, 144, 0.35)',
    defaultEnabled: false,
  },
  {
    id: 'TrueNode',
    name: 'Lunar Nodes',
    symbol: '☊',
    color: '#9898A8',
    glowColor: 'rgba(152, 152, 168, 0.35)',
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
    color: '#E05C3A',
    glowColor: 'rgba(224, 92, 58, 0.45)',
    isAngle: true,
  },
  {
    id: 'Dsc',
    name: 'Descendant',
    symbol: 'DC',
    color: '#4070E8',
    glowColor: 'rgba(64, 112, 232, 0.4)',
    isAngle: true,
  },
  {
    id: 'MC',
    name: 'Midheaven',
    symbol: 'MC',
    color: '#F5C842',
    glowColor: 'rgba(245, 200, 66, 0.5)',
    isAngle: true,
  },
  {
    id: 'IC',
    name: 'Imum Coeli',
    symbol: 'IC',
    color: '#60D0D8',
    glowColor: 'rgba(96, 208, 216, 0.4)',
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
