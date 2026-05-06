import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { parseSFchtFile, isSFchtFile, astroGoldKey } from '../utils/sfchtParser';
import { castEventChart } from '../api/mundaneEvents';
import { saveChart as firestoreSaveChart, createFolder, loadFolders } from '../firebase/firestore';

/**
 * One-shot recursive import from a user-picked Astro Gold iCloud folder.
 *
 * Uses the File System Access API (`showDirectoryPicker`) — Chrome/Edge desktop
 * only. Walks the picked directory, parses every `.SFcht` library it finds,
 * dedupes charts against existing Firestore records by stable identity, and
 * mirrors the on-disk hierarchy as flat folder names like "Countries / Brazil".
 *
 * Existing charts that match by `astroGoldKey` are overwritten in place;
 * everything else is inserted. The picked handle is **not** persisted yet —
 * each session re-prompts. Persistent re-sync is a future phase.
 */
export function useAstroGoldFolderImport({ onChartsImported } = {}) {
  const { user, savedCharts, setSavedCharts, setSavedFolders } = useAuth();
  const [status, setStatus] = useState(null);   // human-readable progress text
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null); // { added, updated, skipped, errors }

  const supported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

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
      // User cancelled — silent
      if (err?.name === 'AbortError') return;
      console.error('Directory picker failed:', err);
      setStatus('Could not open folder: ' + (err?.message || err));
      return;
    }

    setBusy(true);
    setSummary(null);
    setStatus('Scanning folder…');

    try {
      // Step 1: walk the tree, collect (file, relativePathParts) pairs.
      const files = [];
      await walkDir(rootHandle, [], files);
      const sfchtFiles = files.filter(f => isSFchtFile(f.file.name));

      if (sfchtFiles.length === 0) {
        setStatus('No .SFcht files found in that folder.');
        setBusy(false);
        return;
      }

      // Step 2: build a fast lookup of existing charts by astroGoldKey.
      const existingByKey = new Map();
      for (const c of savedCharts) {
        if (c.astroGoldKey) existingByKey.set(c.astroGoldKey, c);
      }

      // Step 3: cache folder name → id so we don't recreate the same folder.
      const allFolders = await loadFolders(user.uid);
      const folderIdByName = new Map(allFolders.map(f => [f.name, f.id]));

      let added = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      const importedCharts = [];
      // Stage state changes locally; commit once at the end so we don't
      // re-render the chart list thousands of times during a big import.
      const newCharts = [];
      const updatedById = new Map();

      // Step 4: for each .SFcht library, parse and upsert each chart.
      for (let i = 0; i < sfchtFiles.length; i++) {
        const { file, pathParts } = sfchtFiles[i];
        setStatus(`Parsing ${file.name} (${i + 1}/${sfchtFiles.length})…`);

        // Folder name = on-disk path (parents + filename without extension),
        // joined with " / " — the schema is flat so we encode hierarchy as text.
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
            if (!key) {
              skipped += 1;
              continue;
            }

            const existing = existingByKey.get(key);

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

      // Single state commit at the end: prepend new charts, swap updated ones.
      if (newCharts.length || updatedById.size) {
        setSavedCharts(prev => {
          const updatedList = updatedById.size
            ? prev.map(c => updatedById.get(c.id) || c)
            : prev;
          return newCharts.length ? [...newCharts, ...updatedList] : updatedList;
        });
      }

      // Refresh folders list once at the end (we may have created several).
      const refreshed = await loadFolders(user.uid);
      setSavedFolders(refreshed);

      setSummary({ added, updated, skipped, errors, files: sfchtFiles.length });
      setStatus(null);
      if (onChartsImported && importedCharts.length > 0) {
        onChartsImported(importedCharts);
      }
    } catch (err) {
      console.error('Astro Gold import failed:', err);
      setStatus('Import failed: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [supported, user, savedCharts, setSavedCharts, setSavedFolders, onChartsImported]);

  return { connect, status, busy, summary, supported };
}

/**
 * Recursively walk a FileSystemDirectoryHandle and collect every file along
 * with its directory path (parts of relative path *not* including the file).
 */
async function walkDir(dirHandle, pathParts, out) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith('.')) continue; // skip .DS_Store etc
    if (handle.kind === 'file') {
      try {
        const file = await handle.getFile();
        out.push({ file, pathParts: [...pathParts] });
      } catch (err) {
        console.warn(`Could not read ${name}:`, err.message);
      }
    } else if (handle.kind === 'directory') {
      await walkDir(handle, [...pathParts, name], out);
    }
  }
}
