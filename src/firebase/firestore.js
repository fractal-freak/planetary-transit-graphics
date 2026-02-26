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
} from 'firebase/firestore';
import { db } from './config';

/**
 * Firestore schema:
 *
 *   users/{uid}                        → { defaultChartId: string | null }
 *   users/{uid}/charts/{chartId}       → {
 *     name, birthDate, birthTime, locationName,
 *     lat, lng, positions, angles, folderId,
 *     createdAt, updatedAt
 *   }
 *   users/{uid}/folders/{folderId}     → { name, createdAt }
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
