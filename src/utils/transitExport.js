import { format } from 'date-fns';
import { PLANETS } from '../data/planets';
import { ZODIAC_SIGNS, getSignIndex } from '../data/zodiac';
import { getLongitude } from '../api/ephemeris';
import { isSweReady } from '../api/swisseph';

/**
 * Serialize the visible transits to a Markdown document grouped by transit
 * planet — one ## section per planet, events sorted by date underneath.
 *
 * Mirrors what the timeline canvas labels (aspect perfections, sign
 * ingresses, retrograde stations) and matches the canvas's date window via
 * the in-range filter.
 *
 * @param {Array}  curves       — aspect curves with .peaks (from useTransits family)
 * @param {Object} signChanges  — { changes, stations, eclipses }
 * @param {Date}   startDate    — chart window start
 * @param {Date}   endDate      — chart window end
 * @returns {string} Markdown text
 */
export function buildTransitsMarkdown(curves, signChanges, startDate, endDate) {
  const byPlanet = new Map();
  const add = (planet, event) => {
    if (!byPlanet.has(planet)) byPlanet.set(planet, []);
    byPlanet.get(planet).push(event);
  };

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const inRange = (d) => {
    const t = d.getTime();
    return t >= startMs && t <= endMs;
  };

  const signAt = (planet, date) => {
    if (!isSweReady()) return '';
    const lng = getLongitude(planet, date);
    const sign = ZODIAC_SIGNS[getSignIndex(lng)];
    const deg = Math.floor(((lng % 30) + 30) % 30);
    return `${deg}° ${sign.name}`;
  };

  // ── Aspect perfections ──
  if (curves) {
    for (const curve of curves) {
      if (!curve.peaks) continue;
      const planet = curve.transitPlanet;
      const isSunMoon =
        (planet === 'Sun' && curve.target === 'Moon') ||
        (planet === 'Moon' && curve.target === 'Sun');

      for (const peak of curve.peaks) {
        const date = peak.realPeakDate || peak.date;
        if (!inRange(date)) continue;

        let description;
        if (isSunMoon && curve.aspect.name === 'Conjunction') {
          description = `New Moon (${signAt(planet, date)})`;
        } else if (isSunMoon && curve.aspect.name === 'Opposition') {
          description = `Full Moon (${signAt(planet, date)})`;
        } else {
          const where = signAt(planet, date);
          description = `${curve.aspect.name} ${curve.target}${where ? ` (${where})` : ''}`;
        }

        add(planet, { date, description });
      }
    }
  }

  // ── Sign ingresses ──
  if (signChanges?.changes) {
    for (const sc of signChanges.changes) {
      if (!inRange(sc.date)) continue;
      add(sc.planet, {
        date: sc.date,
        description: `Enters ${sc.signName}`,
      });
    }
  }

  // ── Retrograde stations ──
  if (signChanges?.stations) {
    for (const st of signChanges.stations) {
      if (!inRange(st.date)) continue;
      const where = signAt(st.planet, st.date);
      add(st.planet, {
        date: st.date,
        description: `Stations ${st.type}${where ? ` at ${where}` : ''}`,
      });
    }
  }

  // ── Render ──
  const yearsDiffer = startDate.getFullYear() !== endDate.getFullYear();
  const eventDateFmt = yearsDiffer ? 'MMM d, yyyy' : 'MMM d';
  const titleFmt = 'MMM d, yyyy';

  let md = `# Transits, ${format(startDate, titleFmt)} – ${format(endDate, titleFmt)}\n\n`;

  for (const p of PLANETS) {
    const events = byPlanet.get(p.id);
    if (!events || events.length === 0) continue;
    events.sort((a, b) => a.date - b.date);
    md += `## ${p.name}\n`;
    for (const ev of events) {
      md += `- ${format(ev.date, eventDateFmt)} — ${ev.description}\n`;
    }
    md += '\n';
  }

  return md;
}
