/**
 * Parser for Solar Fire / AstroGold .SFcht chart files.
 *
 * Binary format (reverse-engineered from real files):
 *
 *   File header:
 *     - uint16 LE: version/magic (observed: 3)
 *     - 80 bytes: reserved padding (ASCII spaces)
 *     - uint32 LE: total chart count
 *
 *   Each record (base 300 bytes, but some have variable-length note tails):
 *     - 2 bytes: record flags (01 01)
 *     - 50 bytes: chart name (ASCII, space-padded)
 *     - 20 bytes: city name
 *     - 20 bytes: state/country
 *     - 4 bytes: longitude (float32 LE, West positive, East negative)
 *     - 4 bytes: latitude (float32 LE, North positive)
 *     - 2 bytes: year (uint16 LE)
 *     - 1 byte: month (1–12)
 *     - 1 byte: day (1–31)
 *     - 1 byte: hour (0–23, local time)
 *     - 1 byte: minute (0–59)
 *     - 1 byte: second (0–59)
 *     - 4 bytes: timezone offset (float32 LE, POSIX sign: UTC = local + offset)
 *     - 5 bytes: timezone abbreviation (ASCII, space-padded)
 *     - ~184+ bytes: extended metadata / notes (variable length)
 *
 *   Coordinate convention:
 *     - Longitude: West = positive, East = negative (opposite of standard)
 *     - Latitude: North = positive, South = negative
 *
 *   Time convention:
 *     - All times are local. UTC = local_time + tz_offset (POSIX sign).
 */

const FILE_HEADER_SIZE = 82; // 2 (version) + 80 (padding)

/**
 * Parse an ArrayBuffer containing .SFcht data.
 * Returns an array of chart objects ready for the app's chart stack.
 *
 * @param {ArrayBuffer} buffer - Raw file contents
 * @returns {Array<Object>} Parsed chart records
 */
export function parseSFchtFile(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < FILE_HEADER_SIZE + 4) {
    throw new Error('File too small to be a valid .SFcht file');
  }

  const chartCount = view.getUint32(FILE_HEADER_SIZE, true);
  if (chartCount === 0 || chartCount > 500) {
    throw new Error(`Unexpected chart count: ${chartCount}`);
  }

  // Records have variable length (some have embedded notes).
  // Scan for the 01 01 flag pattern followed by printable ASCII names.
  const offsets = scanRecordOffsets(bytes, chartCount);

  const charts = [];
  for (const offset of offsets) {
    try {
      const chart = parseRecord(view, bytes, offset);
      if (chart) charts.push(chart);
    } catch (e) {
      console.warn('Skipping SFcht record at offset', offset, e.message);
    }
  }

  return charts;
}

/**
 * Scan the byte array for record start positions (01 01 flags).
 */
function scanRecordOffsets(bytes, expectedCount) {
  const offsets = [];
  let pos = FILE_HEADER_SIZE + 4; // skip past file header + chart count

  while (pos < bytes.length - 120 && offsets.length < expectedCount) {
    if (bytes[pos] === 0x01 && bytes[pos + 1] === 0x01) {
      // Verify the next several bytes look like a chart name (printable ASCII)
      let valid = true;
      for (let j = 2; j < 12; j++) {
        const b = bytes[pos + j];
        if (b !== 0x20 && (b < 0x20 || b > 0x7E)) {
          valid = false;
          break;
        }
      }
      if (valid) {
        offsets.push(pos);
        pos += 120; // skip past minimum record content to avoid false matches
        continue;
      }
    }
    pos++;
  }

  return offsets;
}

/**
 * Parse a single chart record starting at the flags byte.
 *
 * Field offsets from record start:
 *   +0:  2 bytes  flags (01 01)
 *   +2:  50 bytes name
 *   +52: 20 bytes city
 *   +72: 20 bytes state/country
 *   +92: 4 bytes  longitude (float32 LE)
 *   +96: 4 bytes  latitude (float32 LE)
 *   +100: 2 bytes year (uint16 LE)
 *   +102: 1 byte  month
 *   +103: 1 byte  day
 *   +104: 1 byte  hour
 *   +105: 1 byte  minute
 *   +106: 1 byte  second
 *   +107: 4 bytes tz offset (float32 LE)
 *   +111: 5 bytes tz abbreviation
 */
function parseRecord(view, bytes, offset) {
  const name = readString(bytes, offset + 2, 50);
  if (!name) return null;

  const city = readString(bytes, offset + 52, 20);
  const state = readString(bytes, offset + 72, 20);

  // Coordinates
  const lonRaw = view.getFloat32(offset + 92, true);
  const latRaw = view.getFloat32(offset + 96, true);

  // Convert: Solar Fire uses West-positive, we need East-positive
  const lng = -lonRaw;
  const lat = latRaw;

  // Date/time (local)
  const year = view.getUint16(offset + 100, true);
  const month = bytes[offset + 102];
  const day = bytes[offset + 103];
  const hour = bytes[offset + 104];
  const minute = bytes[offset + 105];
  const second = bytes[offset + 106];

  // Timezone offset (POSIX sign: UTC = local + offset)
  const tzOffset = view.getFloat32(offset + 107, true);
  const tzAbbr = readString(bytes, offset + 111, 5);

  // Validate
  if (year < 1 || year > 3000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  // Compute UTC: UTC = local_time + tz_offset
  const localMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const utcMs = localMs + (isFinite(tzOffset) ? tzOffset * 3600000 : 0);
  const utcDate = new Date(utcMs);

  const locationName = [city, state].filter(Boolean).join(', ');
  const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const birthTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    id: `sfcht-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    birthDate,
    birthTime,
    lat,
    lng,
    locationName,
    timezone: tzAbbr || undefined,
    utcDate,
    chartType: guessChartType(name),
  };
}

/**
 * Read a space-padded ASCII string field.
 */
function readString(bytes, offset, length) {
  if (offset + length > bytes.length) return '';
  let str = '';
  for (let i = 0; i < length; i++) {
    const b = bytes[offset + i];
    if (b === 0) break;
    str += String.fromCharCode(b);
  }
  return str.trimEnd();
}

/**
 * Guess chart type from chart name keywords.
 */
function guessChartType(name) {
  const lower = name.toLowerCase();
  if (lower.includes('aries ingress')) return 'aries_ingress';
  if (lower.includes('great conjunction') || lower.includes('saturn jupiter') || lower.includes('jupiter saturn')) return 'great_conjunction';
  if (lower.includes('lunation') || lower.includes('new moon') || lower.includes('full moon')) return 'lunation';
  if (lower.includes('eclipse')) return 'eclipse';
  if (lower.includes('ingress')) return 'aries_ingress';
  if (lower.includes('conjunction') || lower.includes('opposition')) return 'great_conjunction';
  return 'natal';
}

/**
 * Check if a filename has the .SFcht extension.
 */
export function isSFchtFile(filename) {
  return /\.sfcht$/i.test(filename);
}
