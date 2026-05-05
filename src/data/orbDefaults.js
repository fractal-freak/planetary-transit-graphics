import { PLANETS } from './planets';

/**
 * Per-planet default orbs (single value applies to all aspect types).
 *
 * Defaults vary by planetary speed (astrologically conventional):
 * - Fast movers (Moon) get narrow orbs to avoid visual noise
 * - Slow/traditional bodies (Sun, Jupiter, Saturn) get wide orbs
 * - Other planets get moderate orbs
 */
const DEFAULTS = {
  Moon:    8,
  Sun:     6,
  Mercury: 6,
  Venus:   6,
  Mars:    6,
  Jupiter: 3,
  Saturn:  3,
  Uranus:  3,
  Neptune: 3,
  Pluto:   3,
  TrueNode: 3,
};

// Special non-planet orb keys — used by the Lunations feature in natal mode
// to control how close a new/full moon must be to a natal target before
// the proximity tag appears.
export const LUNATION_ORB_KEY = 'Lunation';
export const LUNATION_ORB_DEFAULT = 8;

export function getDefaultOrbSettings() {
  const settings = {};
  for (const p of PLANETS) {
    settings[p.id] = DEFAULTS[p.id] || 8;
  }
  settings[LUNATION_ORB_KEY] = LUNATION_ORB_DEFAULT;
  return settings;
}
