// localStorage-backed preset store for anonymous (signed-out) users.
// Mirrors the Firestore preset API. Defaults are seeded on first read so
// every new visitor sees the 5 starred presets; once seeded, deletions and
// edits stick because the seed flag is set.

import { DEFAULT_PRESETS } from '../data/defaultPresets';

const PRESETS_KEY = 'transitwiz.anon.presets';
const SEED_FLAG_KEY = 'transitwiz.anon.defaultsSeededAt';

function readAll() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function genId() {
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function seedIfNeeded() {
  if (localStorage.getItem(SEED_FLAG_KEY)) return;
  const now = new Date().toISOString();
  const existing = readAll();
  const seeded = DEFAULT_PRESETS.map(p => ({
    id: genId(),
    ...p,
    startDate: null,
    endDate: null,
    createdAt: now,
    updatedAt: now,
  }));
  writeAll([...seeded, ...existing]);
  localStorage.setItem(SEED_FLAG_KEY, now);
}

export function loadAnonPresets() {
  seedIfNeeded();
  return readAll();
}

export function saveAnonPreset(presetData, presetId) {
  const all = readAll();
  const now = new Date().toISOString();
  if (presetId) {
    const idx = all.findIndex(p => p.id === presetId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...presetData, updatedAt: now };
      writeAll(all);
      return presetId;
    }
  }
  const id = genId();
  all.unshift({
    id,
    name: presetData.name || 'Untitled Preset',
    mode: presetData.mode || 'world',
    jobs: presetData.jobs || [],
    startDate: presetData.startDate || null,
    endDate: presetData.endDate || null,
    isFavorite: presetData.isFavorite || false,
    createdAt: now,
    updatedAt: now,
  });
  writeAll(all);
  return id;
}

export function updateAnonPresetJobs(presetId, mode, jobs, startDate, endDate) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === presetId);
  if (idx < 0) return;
  // Overwriting with current setup → drop relativeRange, store explicit dates
  const { relativeRange: _drop, ...rest } = all[idx];
  all[idx] = {
    ...rest,
    mode,
    jobs,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
}

export function renameAnonPreset(presetId, newName) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === presetId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], name: newName, updatedAt: new Date().toISOString() };
  writeAll(all);
}

export function deleteAnonPreset(presetId) {
  const all = readAll().filter(p => p.id !== presetId);
  writeAll(all);
}

export function toggleAnonPresetFavorite(presetId, isFavorite) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === presetId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], isFavorite, updatedAt: new Date().toISOString() };
  writeAll(all);
}

/**
 * Reorder presets to match the given list of ids (presets not in the list
 * keep their relative order at the end). The "top" of the list becomes the
 * default preset that auto-loads on a fresh session.
 */
export function reorderAnonPresets(orderedIds) {
  const all = readAll();
  const byId = new Map(all.map(p => [p.id, p]));
  const reordered = [];
  for (const id of orderedIds) {
    if (byId.has(id)) {
      reordered.push(byId.get(id));
      byId.delete(id);
    }
  }
  // Append any presets the caller didn't include in the order list.
  for (const remaining of byId.values()) reordered.push(remaining);
  writeAll(reordered);
}

/**
 * Move a preset up one slot (toward index 0). No-op if already at the top.
 */
export function moveAnonPresetUp(presetId) {
  const all = readAll();
  const idx = all.findIndex(p => p.id === presetId);
  if (idx <= 0) return;
  const next = all.slice();
  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  writeAll(next);
}

/**
 * Re-seed the built-in default presets. Idempotent on name — defaults that
 * still exist by name are skipped, so this only re-adds the ones the user
 * deleted. Resets the seed flag so they survive a future page reload too.
 */
export function restoreAnonDefaults() {
  const all = readAll();
  const existingNames = new Set(all.map(p => p.name));
  const now = new Date().toISOString();
  const toAdd = DEFAULT_PRESETS
    .filter(p => !existingNames.has(p.name))
    .map(p => ({
      id: genId(),
      ...p,
      startDate: null,
      endDate: null,
      createdAt: now,
      updatedAt: now,
    }));
  if (toAdd.length === 0) return 0;
  writeAll([...all, ...toAdd]);
  localStorage.setItem(SEED_FLAG_KEY, now);
  return toAdd.length;
}
