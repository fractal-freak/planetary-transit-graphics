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
