import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  deleteField,
} from 'firebase/firestore';
import { db } from './config';
import { DEFAULT_PRESETS } from '../data/defaultPresets';

/**
 * Firestore schema:
 *
 *   users/{uid}                        → { defaultChartId: string | null }
 *   users/{uid}/charts/{chartId}       → {
 *     name, birthDate, birthTime, locationName,
 *     lat, lng, positions, angles, folderId,
 *     chartType, relevanceStart, relevanceEnd,
 *     houseCusps, houseSystem, eventDescription,
 *     createdAt, updatedAt
 *   }
 *   users/{uid}/folders/{folderId}     → { name, createdAt }
 *   users/{uid}/presets/{presetId}     → {
 *     name, mode, jobs, isFavorite,
 *     createdAt, updatedAt
 *   }
 *   users/{uid}/stacks/{stackId}       → {
 *     name, chartIds, folderId,
 *     createdAt, updatedAt
 *   }
 *   users/{uid}/projects/{projectId}   → {
 *     name, chartIds,
 *     createdAt, updatedAt
 *   }
 */

// ── User doc ──

function userRef(uid) {
  return doc(db, 'users', uid);
}

export async function ensureUserDoc(uid) {
  const ref = userRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { defaultChartId: null });
  }
}

// ── Charts ──

function chartsCol(uid) {
  return collection(db, 'users', uid, 'charts');
}

function chartRef(uid, chartId) {
  return doc(db, 'users', uid, 'charts', chartId);
}

/**
 * Load all saved charts for a user, ordered by creation date (newest first).
 * Returns [{ id, ...data }]
 */
export async function loadCharts(uid) {
  const q = query(chartsCol(uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Save a new chart (auto-generated ID) or overwrite an existing one.
 * Returns the chart ID.
 */
export async function saveChart(uid, chartData, chartId) {
  const ref = chartId ? chartRef(uid, chartId) : doc(chartsCol(uid));
  await setDoc(ref, {
    name: chartData.name || 'Untitled Chart',
    birthDate: chartData.birthDate || null,
    birthTime: chartData.birthTime || null,
    locationName: chartData.locationName || null,
    lat: chartData.lat ?? null,
    lng: chartData.lng ?? null,
    positions: chartData.positions || {},
    angles: chartData.angles || null,
    folderId: chartData.folderId || null,
    // Mundane chart fields
    chartType: chartData.chartType || 'natal',
    relevanceStart: chartData.relevanceStart || null,
    relevanceEnd: chartData.relevanceEnd || null,
    houseCusps: chartData.houseCusps || null,
    houseSystem: chartData.houseSystem || null,
    eventDescription: chartData.eventDescription || null,
    createdAt: chartData.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Delete a saved chart.
 */
export async function deleteChart(uid, chartId) {
  await deleteDoc(chartRef(uid, chartId));
}

/**
 * Rename a saved chart.
 */
export async function renameChart(uid, chartId, newName) {
  await updateDoc(chartRef(uid, chartId), {
    name: newName,
    updatedAt: serverTimestamp(),
  });
}

// ── Default chart ──

export async function getDefaultChartId(uid) {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? snap.data().defaultChartId : null;
}

export async function setDefaultChartId(uid, chartId) {
  await setDoc(userRef(uid), { defaultChartId: chartId }, { merge: true });
}

// ── Folders ──

function foldersCol(uid) {
  return collection(db, 'users', uid, 'folders');
}

function folderRef(uid, folderId) {
  return doc(db, 'users', uid, 'folders', folderId);
}

/**
 * Load all folders for a user, ordered by creation date.
 * Returns [{ id, name, createdAt }]
 */
export async function loadFolders(uid) {
  try {
    const q = query(foldersCol(uid), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    // Collection may not exist yet or index not ready — return empty
    const snap = await getDocs(foldersCol(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

/**
 * Create a new folder. Returns the folder ID.
 */
export async function createFolder(uid, name) {
  const ref = doc(foldersCol(uid));
  await setDoc(ref, { name, createdAt: serverTimestamp() });
  return ref.id;
}

/**
 * Rename an existing folder.
 */
export async function renameFolder(uid, folderId, newName) {
  await updateDoc(folderRef(uid, folderId), { name: newName });
}

/**
 * Delete a folder and move all its charts to uncategorized (folderId → null).
 */
export async function deleteFolder(uid, folderId) {
  // Move all charts in this folder to uncategorized
  const allCharts = await loadCharts(uid);
  const chartsInFolder = allCharts.filter(c => c.folderId === folderId);
  await Promise.all(
    chartsInFolder.map(c =>
      updateDoc(chartRef(uid, c.id), { folderId: null, updatedAt: serverTimestamp() })
    )
  );
  await deleteDoc(folderRef(uid, folderId));
}

/**
 * Move a chart into a folder (or to uncategorized if folderId is null).
 */
export async function moveChartToFolder(uid, chartId, folderId) {
  await updateDoc(chartRef(uid, chartId), {
    folderId: folderId || null,
    updatedAt: serverTimestamp(),
  });
}

// ── Presets ──

function presetsCol(uid) {
  return collection(db, 'users', uid, 'presets');
}

function presetRef(uid, presetId) {
  return doc(db, 'users', uid, 'presets', presetId);
}

/**
 * Load all presets for a user, ordered by creation date (newest first).
 * Returns [{ id, ...data }]
 */
export async function loadPresets(uid) {
  try {
    const q = query(presetsCol(uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    // Collection may not exist yet or index not ready
    const snap = await getDocs(presetsCol(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

/**
 * Save a new preset (auto-generated ID) or overwrite an existing one.
 * Returns the preset ID.
 */
export async function savePreset(uid, presetData, presetId) {
  const ref = presetId ? presetRef(uid, presetId) : doc(presetsCol(uid));
  const payload = {
    name: presetData.name || 'Untitled Preset',
    mode: presetData.mode || 'world',
    jobs: presetData.jobs || [],
    startDate: presetData.startDate || null,
    endDate: presetData.endDate || null,
    isFavorite: presetData.isFavorite || false,
    createdAt: presetData.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (presetData.relativeRange) payload.relativeRange = presetData.relativeRange;
  await setDoc(ref, payload);
  return ref.id;
}

/**
 * Update a preset's jobs, mode, and date range (overwrite current setup), keeping name & favorite.
 * Drops `relativeRange` since the user is committing explicit dates.
 */
export async function updatePresetJobs(uid, presetId, mode, jobs, startDate, endDate) {
  await updateDoc(presetRef(uid, presetId), {
    mode,
    jobs,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    relativeRange: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Rename a preset.
 */
export async function renamePreset(uid, presetId, newName) {
  await updateDoc(presetRef(uid, presetId), {
    name: newName,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a preset.
 */
export async function deletePreset(uid, presetId) {
  await deleteDoc(presetRef(uid, presetId));
}

/**
 * Toggle the favorite status of a preset.
 */
export async function togglePresetFavorite(uid, presetId, isFavorite) {
  await updateDoc(presetRef(uid, presetId), {
    isFavorite,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Seed the 5 default starred presets into the user's preset collection on
 * first load. Tracks `defaultsSeededAt` in localStorage (keyed by uid) so
 * deletions stick — once seeded, this function becomes a no-op for that
 * (user, browser) pair.
 *
 * The function body is also idempotent on its own: it skips defaults whose
 * names already exist (no duplicate writes), and only attaches
 * `relativeRange` to same-named presets that don't already have it. So
 * even if the flag is missing on a fresh device, repeated calls don't
 * produce duplicates or repeated writes.
 *
 * Returns the number of presets actually written.
 */
export async function seedDefaultPresetsIfNeeded(uid) {
  const flagKey = `transitwiz.user.${uid}.defaultsSeededAt`;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(flagKey)) return 0;
  const existing = await getDocs(presetsCol(uid));
  const byName = new Map(existing.docs.map(d => [d.data().name, d]));
  const writes = [];
  for (const def of DEFAULT_PRESETS) {
    const match = byName.get(def.name);
    if (match) {
      // Existing same-named preset — attach relativeRange + favorite flag
      // without touching jobs, so user customizations are preserved but
      // dates become today-relative.
      if (!match.data().relativeRange) {
        writes.push(updateDoc(match.ref, {
          relativeRange: def.relativeRange,
          isFavorite: true,
          updatedAt: serverTimestamp(),
        }));
      }
    } else {
      writes.push(savePreset(uid, def));
    }
  }
  await Promise.all(writes);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(flagKey, new Date().toISOString());
  }
  return writes.length;
}

// ── Chart Stacks ──

function stacksCol(uid) {
  return collection(db, 'users', uid, 'stacks');
}

function stackRef(uid, stackId) {
  return doc(db, 'users', uid, 'stacks', stackId);
}

/**
 * Load all chart stacks for a user, ordered by creation date (newest first).
 * Returns [{ id, name, chartIds, folderId, createdAt, updatedAt }]
 */
export async function loadStacks(uid) {
  try {
    const q = query(stacksCol(uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(stacksCol(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

/**
 * Save a new stack (auto-generated ID) or overwrite an existing one.
 * Returns the stack ID.
 */
export async function saveStack(uid, stackData, stackId) {
  const ref = stackId ? stackRef(uid, stackId) : doc(stacksCol(uid));
  await setDoc(ref, {
    name: stackData.name || 'Untitled Stack',
    chartIds: stackData.chartIds || [],
    folderId: stackData.folderId || null,
    createdAt: stackData.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Delete a chart stack.
 */
export async function deleteStack(uid, stackId) {
  await deleteDoc(stackRef(uid, stackId));
}

/**
 * Update the charts in a stack.
 */
export async function updateStackCharts(uid, stackId, chartIds) {
  await updateDoc(stackRef(uid, stackId), {
    chartIds,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Rename a chart stack.
 */
export async function renameStack(uid, stackId, newName) {
  await updateDoc(stackRef(uid, stackId), {
    name: newName,
    updatedAt: serverTimestamp(),
  });
}

// ── Projects ──

function projectsCol(uid) {
  return collection(db, 'users', uid, 'projects');
}

function projectRef(uid, projectId) {
  return doc(db, 'users', uid, 'projects', projectId);
}

/**
 * Load all projects for a user, ordered by creation date (newest first).
 */
export async function loadProjects(uid) {
  try {
    const q = query(projectsCol(uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(projectsCol(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

/**
 * Save a new project (auto-generated ID) or overwrite an existing one.
 * Returns the project ID.
 */
export async function saveProject(uid, projectData, projectId) {
  const ref = projectId ? projectRef(uid, projectId) : doc(projectsCol(uid));
  await setDoc(ref, {
    name: projectData.name || 'Untitled Project',
    chartIds: projectData.chartIds || [],
    createdAt: projectData.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Delete a project.
 */
export async function deleteProject(uid, projectId) {
  await deleteDoc(projectRef(uid, projectId));
}

/**
 * Update the charts in a project.
 */
export async function updateProjectCharts(uid, projectId, chartIds) {
  await updateDoc(projectRef(uid, projectId), {
    chartIds,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Rename a project.
 */
export async function renameProject(uid, projectId, newName) {
  await updateDoc(projectRef(uid, projectId), {
    name: newName,
    updatedAt: serverTimestamp(),
  });
}

// ── Session snapshot ──
// Mirrors the localStorage-persisted graph state so it survives storage
// clears and roams across devices for signed-in users.
//   users/{uid}/session/current → { mode, startDate, endDate,
//                                   transitJobs, natalJobs, orbSettings,
//                                   updatedAt }

function sessionRef(uid) {
  return doc(db, 'users', uid, 'session', 'current');
}

export async function loadSession(uid) {
  const snap = await getDoc(sessionRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveSession(uid, state) {
  // Strip undefined — Firestore rejects them
  const clean = JSON.parse(JSON.stringify(state));
  await setDoc(sessionRef(uid), {
    ...clean,
    updatedAt: serverTimestamp(),
  });
}
