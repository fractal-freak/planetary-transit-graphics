// localStorage-backed transit note store for charts that don't have a
// Firestore home — anonymous users, or signed-in users on a chart they
// haven't saved yet. Mirrors the Firestore notes API shape so callers can
// switch backends based on whether the user is signed in.
//
// Storage layout: one localStorage key per chart, scoped by chart.id, so
// charts each carry their own notes list and we don't have to load
// everything into memory just to read one chart's notes.

const KEY_PREFIX = 'transitwiz.anon.notes-';

function keyFor(chartId) {
  return `${KEY_PREFIX}${chartId}`;
}

function readAll(chartId) {
  if (!chartId) return [];
  try {
    const raw = localStorage.getItem(keyFor(chartId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(chartId, notes) {
  try {
    localStorage.setItem(keyFor(chartId), JSON.stringify(notes));
  } catch {
    // Quota or private mode — silently fail; the user just won't keep notes.
  }
}

function genId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadAnonNotes(chartId) {
  return readAll(chartId);
}

export function saveAnonNote(chartId, noteData, noteId) {
  const all = readAll(chartId);
  const now = new Date().toISOString();
  if (noteId) {
    const idx = all.findIndex(n => n.id === noteId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...noteData, updatedAt: now };
      writeAll(chartId, all);
      return noteId;
    }
  }
  const id = genId();
  all.unshift({
    id,
    transitPlanet: noteData.transitPlanet,
    target: noteData.target,
    aspect: noteData.aspect,
    peakDate: noteData.peakDate || null,
    body: noteData.body || '',
    createdAt: now,
    updatedAt: now,
  });
  writeAll(chartId, all);
  return id;
}

export function deleteAnonNote(chartId, noteId) {
  const all = readAll(chartId).filter(n => n.id !== noteId);
  writeAll(chartId, all);
}

/** Move all notes from one chart-id key to another. Used when a local
 *  chart gets saved to Firestore and inherits a real chart id. */
export function rekeyAnonNotes(oldChartId, newChartId) {
  if (!oldChartId || !newChartId || oldChartId === newChartId) return;
  const notes = readAll(oldChartId);
  if (notes.length === 0) return;
  writeAll(newChartId, notes);
  try { localStorage.removeItem(keyFor(oldChartId)); } catch {}
}

/** Drop all anon notes for a chart id (e.g. after migrating them to
 *  Firestore so they don't double up). */
export function clearAnonNotes(chartId) {
  if (!chartId) return;
  try { localStorage.removeItem(keyFor(chartId)); } catch {}
}
