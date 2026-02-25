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
 *   users/{uid}                      → { defaultChartId: string | null }
 *   users/{uid}/charts/{chartId}     → {
 *     name, birthDate, birthTime, locationName,
 *     lat, lng, positions, angles,
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
