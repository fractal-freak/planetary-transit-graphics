import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { parseSFchtFile, isSFchtFile } from '../utils/sfchtParser';
import { castEventChart } from '../api/mundaneEvents';
import { saveChart as firestoreSaveChart, createFolder, loadFolders } from '../firebase/firestore';

/**
 * Shared hook for importing .SFcht chart files.
 * Handles drag-and-drop, file input, parsing, position computation,
 * auto-folder creation, and Firestore persistence.
 *
 * @param {Object} options
 * @param {Function} options.onChartsImported - callback(importedCharts[]) after import
 */
export function useSFchtImport({ onChartsImported }) {
  const { user, setSavedCharts, setSavedFolders } = useAuth();
  const [importStatus, setImportStatus] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  async function handleImportFile(file) {
    if (!file || !isSFchtFile(file.name)) {
      setImportStatus('Not a .SFcht file');
      setTimeout(() => setImportStatus(null), 3000);
      return;
    }

    setImportStatus('Importing\u2026');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSFchtFile(buffer);

      if (parsed.length === 0) {
        setImportStatus('No charts found in file');
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }

      // Create a folder named after the file (strip .SFcht extension)
      const folderName = file.name.replace(/\.sfcht$/i, '');
      let folderId = null;
      if (user) {
        folderId = await createFolder(user.uid, folderName);
        const folders = await loadFolders(user.uid);
        setSavedFolders(folders);
      }

      const importedCharts = [];
      for (const record of parsed) {
        const chart = castEventChart({
          eventDate: record.utcDate,
          lat: record.lat,
          lng: record.lng,
          locationName: record.locationName,
          chartType: record.chartType,
          name: record.name,
        });

        // Preserve original birth date/time from the file
        chart.birthDate = record.birthDate;
        chart.birthTime = record.birthTime;
        chart.folderId = folderId;

        if (user) {
          const chartId = await firestoreSaveChart(user.uid, chart);
          const savedChart = { id: chartId, ...chart };
          setSavedCharts(prev => [savedChart, ...prev]);
          importedCharts.push(savedChart);
        } else {
          const localChart = { id: record.id, ...chart };
          importedCharts.push(localChart);
        }
      }

      setImportStatus(`Imported ${importedCharts.length} chart${importedCharts.length !== 1 ? 's' : ''}`);
      setTimeout(() => setImportStatus(null), 3000);

      if (onChartsImported) {
        onChartsImported(importedCharts);
      }
    } catch (err) {
      console.error('Failed to import .SFcht file:', err);
      setImportStatus('Import failed: ' + err.message);
      setTimeout(() => setImportStatus(null), 4000);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (const file of files) {
        handleImportFile(file);
      }
    }
  }

  function handleFileInput(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (const file of files) {
        handleImportFile(file);
      }
    }
    e.target.value = '';
  }

  return {
    importStatus,
    dragOver,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInput,
  };
}
