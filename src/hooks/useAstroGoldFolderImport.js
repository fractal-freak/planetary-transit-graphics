import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { parseSFchtFile, isSFchtFile, astroGoldKey } from '../utils/sfchtParser';
import { castEventChart } from '../api/mundaneEvents';
import {
  saveChart as firestoreSaveChart,
  createFolder,
  loadFolders,
  getAstroGoldLastSyncedAt,
  setAstroGoldLastSyncedAt,
} from '../firebase/firestore';
import {
  saveDirectoryHandle,
  loadDirectoryHandle,
  clearDirectoryHandle,
} from '../utils/handleStorage';

/**
 * Connect a folder of `.SFcht` chart files (e.g. an Astro Gold iCloud folder)
 * and keep the user's Firestore library in sync with it.
 *
 * Phase 2 behavior:
 *   - First connect picks the folder and persists the handle in IndexedDB.
 *   - On app mount and on tab focus the hook silently re-scans (only files
 *     with mtime > lastSyncedAt get re-parsed) so the library stays current
 *     without the user having to click anything.
 *   - "Sync now" forces a re-scan; will re-prompt for permission if Chrome
 *     dropped it between sessions.
 *   - "Disconnect" forgets the handle; next sync requires picking the folder
 *     again.
 *
 * Constraints (inherent to web file access):
 *   - Chrome/Edge desktop only — Safari/iOS unsupported.
 *   - The browser must be open in a tab for any sync to run; truly
 *     background sync would need a native helper app.
 */
const FOCUS_DEBOUNCE_MS = 30 * 1000;

export function useAstroGoldFolderImport({ onChartsImported } = {}) {
  const { user, savedCharts, setSavedCharts, setSavedFolders } = useAuth();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [connected, setConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const supported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

  // Refs let event handlers read latest state without forcing re-binds on
  // every render (especially important since auto-sync is wired to focus).
  const busyRef = useRef(false);
  const lastSyncedAtRef = useRef(null);
  const lastAutoSyncRef = useRef(0);
  const savedChartsRef = useRef(savedCharts);
  busyRef.current = busy;
  lastSyncedAtRef.current = lastSyncedAt;
  savedChartsRef.current = savedCharts;

  // ── Core import: walk the handle, parse changed files, upsert charts ──
  const importFromHandle = useCallback(async (rootHandle, since) => {
    if (!user) return null;
    setBusy(true);
    setSummary(null);
    setStatus('Scanning folder…');

    try {
      const files = [];
      await walkDir(rootHandle, [], files);
      const sfchtFiles = files.filter(f => isSFchtFile(f.file.name));

      if (sfchtFiles.length === 0) {
        setStatus('No .SFcht files found in that folder.');
        return null;
      }

      // mtime diff: re-parse only files modified since the last successful sync.
      const sinceMs = typeof since === 'number' ? since : 0;
      const filesToParse = sfchtFiles.filter(f => f.file.lastModified > sinceMs);
      const filesSkipped = sfchtFiles.length - filesToParse.length;

      if (filesToParse.length === 0) {
        const now = Date.now();
        await setAstroGoldLastSyncedAt(user.uid, now);
        setLastSyncedAt(now);
        setSummary({ added: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0, files: 0, filesSkipped });
        setStatus(null);
        return { added: 0, updated: 0 };
      }

      // Dedupe lookup uses latest savedCharts (via ref in case state lags).
      const existingByKey = new Map();
      for (const c of savedChartsRef.current) {
        if (c.astroGoldKey) existingByKey.set(c.astroGoldKey, c);
      }

      const allFolders = await loadFolders(user.uid);
      const folderIdByName = new Map(allFolders.map(f => [f.name, f.id]));

      let added = 0, updated = 0, unchanged = 0, skipped = 0, errors = 0;
      const importedCharts = [];
      const newCharts = [];
      const updatedById = new Map();

      for (let i = 0; i < filesToParse.length; i++) {
        const { file, pathParts } = filesToParse[i];
        setStatus(`Parsing ${file.name} (${i + 1}/${filesToParse.length})…`);

        const baseName = file.name.replace(/\.sfcht$/i, '');
        const folderName = [...pathParts, baseName].join(' / ');
        let folderId = folderIdByName.get(folderName);
        if (!folderId) {
          folderId = await createFolder(user.uid, folderName);
          folderIdByName.set(folderName, folderId);
        }

        let parsed;
        try {
          const buffer = await file.arrayBuffer();
          parsed = parseSFchtFile(buffer);
        } catch (err) {
          console.warn(`Skipping ${file.name}:`, err.message);
          errors += 1;
          continue;
        }

        for (const record of parsed) {
          try {
            const key = astroGoldKey(record);
            if (!key) { skipped += 1; continue; }
            const existing = existingByKey.get(key);

            // Build the chart we'd write. Compare against the existing record
            // (if any) and skip the Firestore write entirely when nothing the
            // user can see has changed — that's the common case during
            // re-syncs of files Astro Gold rewrote whole-cloth.
            const chart = castEventChart({
              eventDate: record.utcDate,
              lat: record.lat,
              lng: record.lng,
              locationName: record.locationName,
              chartType: record.chartType,
              name: record.name,
            });
            chart.birthDate = record.birthDate;
            chart.birthTime = record.birthTime;
            chart.folderId = folderId;
            chart.astroGoldKey = key;
            chart.astroGoldPath = [...pathParts, file.name].join('/');

            if (existing && chartsEqual(existing, chart)) {
              unchanged += 1;
              continue;
            }

            const chartId = await firestoreSaveChart(user.uid, chart, existing?.id);
            const savedChart = { id: chartId, ...chart };
            if (existing) {
              updated += 1;
              updatedById.set(chartId, savedChart);
            } else {
              added += 1;
              existingByKey.set(key, savedChart);
              newCharts.push(savedChart);
            }
            importedCharts.push(savedChart);
          } catch (err) {
            console.warn('Skipping chart record:', err.message);
            errors += 1;
          }
        }
      }

      if (newCharts.length || updatedById.size) {
        setSavedCharts(prev => {
          const updatedList = updatedById.size
            ? prev.map(c => updatedById.get(c.id) || c)
            : prev;
          return newCharts.length ? [...newCharts, ...updatedList] : updatedList;
        });
      }

      const refreshed = await loadFolders(user.uid);
      setSavedFolders(refreshed);

      const now = Date.now();
      await setAstroGoldLastSyncedAt(user.uid, now);
      setLastSyncedAt(now);
      setSummary({ added, updated, unchanged, skipped, errors, files: filesToParse.length, filesSkipped });
      setStatus(null);

      if (onChartsImported && importedCharts.length > 0) {
        onChartsImported(importedCharts);
      }
      return { added, updated };
    } catch (err) {
      console.error('Sync failed:', err);
      setStatus('Sync failed: ' + (err?.message || err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [user, setSavedCharts, setSavedFolders, onChartsImported]);

  // ── On mount (per user): load persisted state, auto-sync if permission stuck ──
  useEffect(() => {
    if (!user) {
      setConnected(false);
      setLastSyncedAt(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [handle, ts] = await Promise.all([
          loadDirectoryHandle(),
          getAstroGoldLastSyncedAt(user.uid),
        ]);
        if (cancelled) return;
        setConnected(!!handle);
        setLastSyncedAt(ts);
        if (handle && supported) {
          // queryPermission is gesture-free; requestPermission isn't, so we
          // only auto-sync if Chrome already remembers the grant.
          const perm = await handle.queryPermission?.({ mode: 'read' });
          if (perm === 'granted' && !busyRef.current) {
            lastAutoSyncRef.current = Date.now();
            await importFromHandle(handle, ts ?? 0);
          }
        }
      } catch (err) {
        console.warn('Auto-sync init failed:', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, supported, importFromHandle]);

  // ── Auto-sync on tab focus / visibility-change (debounced) ──
  useEffect(() => {
    if (!user || !supported) return;
    const trigger = async () => {
      if (busyRef.current) return;
      if (Date.now() - lastAutoSyncRef.current < FOCUS_DEBOUNCE_MS) return;
      try {
        const handle = await loadDirectoryHandle();
        if (!handle) return;
        const perm = await handle.queryPermission?.({ mode: 'read' });
        if (perm !== 'granted') return;
        lastAutoSyncRef.current = Date.now();
        await importFromHandle(handle, lastSyncedAtRef.current ?? 0);
      } catch (err) {
        console.warn('Auto-sync on focus failed:', err?.message || err);
      }
    };
    const onVis = () => { if (!document.hidden) trigger(); };
    window.addEventListener('focus', trigger);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', trigger);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, supported, importFromHandle]);

  // ── Public actions ──

  const connect = useCallback(async () => {
    if (!supported) {
      setStatus('Your browser doesn’t support folder access. Use Chrome or Edge on desktop.');
      return;
    }
    if (!user) {
      setStatus('Sign in to sync charts to your library.');
      return;
    }
    let rootHandle;
    try {
      rootHandle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Directory picker failed:', err);
      setStatus('Could not open folder: ' + (err?.message || err));
      return;
    }
    try {
      await saveDirectoryHandle(rootHandle);
    } catch (err) {
      console.warn('Could not persist directory handle:', err?.message || err);
      // Non-fatal — sync still works for this session.
    }
    setConnected(true);
    // First connect imports everything (no mtime filter).
    await importFromHandle(rootHandle, 0);
  }, [supported, user, importFromHandle]);

  const syncNow = useCallback(async () => {
    if (!supported) {
      setStatus('Your browser doesn’t support folder access. Use Chrome or Edge on desktop.');
      return;
    }
    if (!user) {
      setStatus('Sign in to sync charts to your library.');
      return;
    }
    const handle = await loadDirectoryHandle();
    if (!handle) {
      await connect();
      return;
    }
    let perm = await handle.queryPermission?.({ mode: 'read' });
    if (perm !== 'granted') {
      try {
        perm = await handle.requestPermission({ mode: 'read' });
      } catch (err) {
        setStatus('Permission request failed: ' + (err?.message || err));
        return;
      }
    }
    if (perm !== 'granted') {
      setStatus('Permission denied — pick the folder again to reconnect.');
      return;
    }
    await importFromHandle(handle, lastSyncedAtRef.current ?? 0);
  }, [supported, user, connect, importFromHandle]);

  const disconnect = useCallback(async () => {
    try {
      await clearDirectoryHandle();
    } catch {
      // Best-effort
    }
    setConnected(false);
    setStatus(null);
    setSummary(null);
  }, []);

  return {
    connect,
    syncNow,
    disconnect,
    status,
    busy,
    summary,
    supported,
    connected,
    lastSyncedAt,
  };
}

/**
 * True when re-importing this chart record would just overwrite the existing
 * Firestore doc with byte-identical inputs. We compare the human-meaningful
 * fields only (positions/angles are derived from these and computed
 * deterministically by castEventChart, so they'll match too).
 */
function chartsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.name === b.name &&
    a.birthDate === b.birthDate &&
    a.birthTime === b.birthTime &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.locationName === b.locationName &&
    (a.chartType || 'natal') === (b.chartType || 'natal') &&
    (a.folderId || null) === (b.folderId || null) &&
    (a.astroGoldPath || null) === (b.astroGoldPath || null)
  );
}

/**
 * Recursively walk a FileSystemDirectoryHandle and collect every file with
 * the directory path that led to it.
 */
async function walkDir(dirHandle, pathParts, out) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith('.')) continue;
    if (handle.kind === 'file') {
      try {
        const file = await handle.getFile();
        out.push({ file, pathParts: [...pathParts] });
      } catch (err) {
        console.warn(`Could not read ${name}:`, err?.message || err);
      }
    } else if (handle.kind === 'directory') {
      await walkDir(handle, [...pathParts, name], out);
    }
  }
}
