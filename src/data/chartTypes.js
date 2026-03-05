/**
 * Mundane chart type definitions.
 *
 * Each chart type has a default relevance duration (how long its influence
 * is considered active) and visual styling for the UI.
 */

export const CHART_TYPES = {
  natal: {
    id: 'natal',
    label: 'Natal',
    description: 'Birth chart for a person, nation, or entity',
    color: '#5b8af0',       // blue
    glowColor: 'rgba(91, 138, 240, 0.4)',
    relevanceDuration: null, // permanent
  },
  great_conjunction: {
    id: 'great_conjunction',
    label: 'Great Conjunction',
    description: 'Saturn–Jupiter conjunction (~20 year cycle)',
    color: '#f0c05b',       // gold
    glowColor: 'rgba(240, 192, 91, 0.4)',
    relevanceDuration: 20 * 365.25 * 86400000, // ~20 years in ms
  },
  aries_ingress: {
    id: 'aries_ingress',
    label: 'Aries Ingress',
    description: 'Sun enters 0° Aries (spring equinox chart)',
    color: '#f05b5b',       // red
    glowColor: 'rgba(240, 91, 91, 0.4)',
    relevanceDuration: 365.25 * 86400000, // ~1 year in ms
  },
  lunation: {
    id: 'lunation',
    label: 'Lunation',
    description: 'New Moon or Full Moon chart',
    color: '#c4c4c4',       // silver
    glowColor: 'rgba(196, 196, 196, 0.4)',
    relevanceDuration: 29.53 * 86400000, // ~1 synodic month in ms
  },
  eclipse: {
    id: 'eclipse',
    label: 'Eclipse',
    description: 'Solar or lunar eclipse chart',
    color: '#a05bf0',       // purple
    glowColor: 'rgba(160, 91, 240, 0.4)',
    relevanceDuration: 6 * 30.44 * 86400000, // ~6 months in ms
  },
};

/**
 * Get the chart type definition for a given type ID.
 * Falls back to 'natal' if unknown.
 */
export function getChartType(typeId) {
  return CHART_TYPES[typeId] || CHART_TYPES.natal;
}

/**
 * Compute the default relevance window for a chart.
 *
 * @param {string} chartType - One of the CHART_TYPES keys
 * @param {Date} eventDate - The date/time of the event
 * @returns {{ relevanceStart: Date|null, relevanceEnd: Date|null }}
 */
export function computeRelevanceWindow(chartType, eventDate) {
  const type = CHART_TYPES[chartType];
  if (!type || !type.relevanceDuration) {
    return { relevanceStart: null, relevanceEnd: null };
  }

  const start = eventDate;
  const end = new Date(eventDate.getTime() + type.relevanceDuration);
  return { relevanceStart: start, relevanceEnd: end };
}
