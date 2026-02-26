import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadCharts,
  loadFolders,
  deleteChart,
  renameChart,
  setDefaultChartId,
  createFolder,
  renameFolder,
  deleteFolder,
  moveChartToFolder,
} from '../../firebase/firestore';
import styles from './ChartPickerModal.module.css';

/**
 * ChartPickerModal — full-screen modal for browsing, organizing,
 * and selecting saved natal charts.
 *
 * Features:
 * - Search across all charts
 * - One-level folders (collapsible)
 * - Star / rename / delete / move-to-folder per chart
 * - Create / rename / delete folders
 */
export default function ChartPickerModal({ open, onClose, onSelectChart, currentChartId }) {
  const {
    user,
    savedCharts, setSavedCharts,
    savedFolders, setSavedFolders,
    defaultChartId, setDefaultChartId: setDefId,
  } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');

  // Folder expansion state (set of folder IDs that are open)
  const [openFolders, setOpenFolders] = useState(new Set());

  // Inline editing
  const [editingChartId, setEditingChartId] = useState(null);
  const [editChartName, setEditChartName] = useState('');
  const [confirmDeleteChartId, setConfirmDeleteChartId] = useState(null);

  // Folder editing
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState(null);

  // Move-to-folder dropdown
  const [moveChartId, setMoveChartId] = useState(null);

  // New folder creation
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const overlayRef = useRef(null);
  const searchRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setEditingChartId(null);
      setConfirmDeleteChartId(null);
      setEditingFolderId(null);
      setConfirmDeleteFolderId(null);
      setMoveChartId(null);
      setCreatingFolder(false);
      setNewFolderName('');
      // Auto-expand folders that have the current chart
      if (currentChartId) {
        const chart = savedCharts.find(c => c.id === currentChartId);
        if (chart?.folderId) {
          setOpenFolders(new Set([chart.folderId]));
        }
      }
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  // ── Helpers ──

  async function refreshData() {
    const [charts, folders] = await Promise.all([
      loadCharts(user.uid),
      loadFolders(user.uid),
    ]);
    setSavedCharts(charts);
    setSavedFolders(folders);
  }

  function toggleFolder(folderId) {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  // ── Chart actions ──

  function handleSelectChart(chart) {
    onSelectChart({
      birthDate: chart.birthDate,
      birthTime: chart.birthTime,
      lat: chart.lat,
      lng: chart.lng,
      locationName: chart.locationName,
      positions: chart.positions,
      angles: chart.angles || null,
    });
    onClose();
  }

  async function handleToggleDefault(chartId) {
    try {
      const newDefault = chartId === defaultChartId ? null : chartId;
      await setDefaultChartId(user.uid, newDefault);
      setDefId(newDefault);
    } catch (err) {
      console.error('Set default failed:', err);
    }
  }

  async function handleRenameChart(chartId) {
    if (!editChartName.trim()) return;
    try {
      await renameChart(user.uid, chartId, editChartName.trim());
      await refreshData();
      setEditingChartId(null);
      setEditChartName('');
    } catch (err) {
      console.error('Rename failed:', err);
    }
  }

  async function handleDeleteChart(chartId) {
    try {
      await deleteChart(user.uid, chartId);
      if (defaultChartId === chartId) {
        await setDefaultChartId(user.uid, null);
        setDefId(null);
      }
      await refreshData();
      setConfirmDeleteChartId(null);
      // If we deleted the currently loaded chart, close modal and clear
      if (currentChartId === chartId) {
        onSelectChart(null);
        onClose();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function handleMoveChart(chartId, folderId) {
    try {
      await moveChartToFolder(user.uid, chartId, folderId);
      await refreshData();
      setMoveChartId(null);
      // Auto-open the target folder
      if (folderId) {
        setOpenFolders(prev => new Set([...prev, folderId]));
      }
    } catch (err) {
      console.error('Move failed:', err);
    }
  }

  // ── Folder actions ──

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    try {
      const id = await createFolder(user.uid, newFolderName.trim());
      await refreshData();
      setCreatingFolder(false);
      setNewFolderName('');
      setOpenFolders(prev => new Set([...prev, id]));
    } catch (err) {
      console.error('Create folder failed:', err);
    }
  }

  async function handleRenameFolder(folderId) {
    if (!editFolderName.trim()) return;
    try {
      await renameFolder(user.uid, folderId, editFolderName.trim());
      await refreshData();
      setEditingFolderId(null);
      setEditFolderName('');
    } catch (err) {
      console.error('Rename folder failed:', err);
    }
  }

  async function handleDeleteFolder(folderId) {
    try {
      await deleteFolder(user.uid, folderId);
      await refreshData();
      setConfirmDeleteFolderId(null);
    } catch (err) {
      console.error('Delete folder failed:', err);
    }
  }

  // ── Filtering ──

  const query = searchQuery.toLowerCase().trim();

  const allCharts = [...savedCharts].sort((a, b) => {
    if (a.id === defaultChartId) return -1;
    if (b.id === defaultChartId) return 1;
    return 0;
  });

  const filteredCharts = query
    ? allCharts.filter(c =>
        (c.name || '').toLowerCase().includes(query) ||
        (c.locationName || '').toLowerCase().includes(query) ||
        (c.birthDate || '').includes(query)
      )
    : allCharts;

  // When searching, flatten everything (ignore folders)
  const isSearching = query.length > 0;

  // Group charts by folder
  const chartsByFolder = {};
  const uncategorized = [];

  filteredCharts.forEach(chart => {
    if (isSearching || !chart.folderId) {
      if (isSearching) {
        uncategorized.push(chart);
      } else {
        uncategorized.push(chart);
      }
    } else {
      if (!chartsByFolder[chart.folderId]) chartsByFolder[chart.folderId] = [];
      chartsByFolder[chart.folderId].push(chart);
    }
  });

  // ── Render chart item ──

  function renderChartItem(chart, inFolder = false) {
    if (editingChartId === chart.id) {
      return (
        <div key={chart.id} className={styles.chartItem}>
          <div className={styles.inlineEdit}>
            <input
              className={styles.inlineInput}
              value={editChartName}
              onChange={e => setEditChartName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRenameChart(chart.id);
                if (e.key === 'Escape') setEditingChartId(null);
              }}
              autoFocus
            />
            <div className={styles.inlineActions}>
              <button className={styles.inlineBtn} onClick={() => handleRenameChart(chart.id)}>Save</button>
              <button className={styles.inlineBtn} onClick={() => setEditingChartId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      );
    }

    if (confirmDeleteChartId === chart.id) {
      return (
        <div key={chart.id} className={styles.chartItem}>
          <div className={styles.inlineEdit}>
            <span className={styles.deleteText}>Delete &ldquo;{chart.name}&rdquo;?</span>
            <div className={styles.inlineActions}>
              <button className={`${styles.inlineBtn} ${styles.inlineBtnDanger}`} onClick={() => handleDeleteChart(chart.id)}>Delete</button>
              <button className={styles.inlineBtn} onClick={() => setConfirmDeleteChartId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={chart.id}
        className={`${styles.chartItem} ${currentChartId === chart.id ? styles.chartItemActive : ''}`}
        style={{ position: 'relative' }}
      >
        <button className={styles.chartBtn} onClick={() => handleSelectChart(chart)}>
          <span className={styles.chartName}>
            {chart.name}
            {chart.id === defaultChartId && (
              <span className={styles.chartDefault}>{'\u2605'}</span>
            )}
          </span>
          <span className={styles.chartMeta}>
            {chart.birthDate}{chart.birthTime && ` \u00B7 ${chart.birthTime}`}
          </span>
        </button>

        <div className={styles.chartActions}>
          <button
            className={styles.chartActionBtn}
            onClick={() => handleToggleDefault(chart.id)}
            title={chart.id === defaultChartId ? 'Remove default' : 'Set as default'}
          >
            {chart.id === defaultChartId ? '\u2605' : '\u2606'}
          </button>
          <button
            className={styles.chartActionBtn}
            onClick={() => { setEditingChartId(chart.id); setEditChartName(chart.name); setConfirmDeleteChartId(null); }}
            title="Rename"
          >
            {'\u270E'}
          </button>
          {savedFolders.length > 0 && (
            <button
              className={styles.chartActionBtn}
              onClick={() => setMoveChartId(moveChartId === chart.id ? null : chart.id)}
              title="Move to folder"
            >
              {'\u21B7'}
            </button>
          )}
          <button
            className={styles.chartActionBtn}
            onClick={() => { setConfirmDeleteChartId(chart.id); setEditingChartId(null); }}
            title="Delete"
          >
            &times;
          </button>
        </div>

        {/* Move-to-folder dropdown */}
        {moveChartId === chart.id && (
          <div className={styles.moveDropdown}>
            <button
              className={`${styles.moveOption} ${!chart.folderId ? styles.moveOptionActive : ''}`}
              onClick={() => handleMoveChart(chart.id, null)}
            >
              Uncategorized
            </button>
            {savedFolders.map(f => (
              <button
                key={f.id}
                className={`${styles.moveOption} ${chart.folderId === f.id ? styles.moveOptionActive : ''}`}
                onClick={() => handleMoveChart(chart.id, f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render folder ──

  function renderFolder(folder) {
    const folderCharts = chartsByFolder[folder.id] || [];
    const isOpen = openFolders.has(folder.id);

    if (editingFolderId === folder.id) {
      return (
        <div key={folder.id} className={styles.folderSection}>
          <div className={styles.inlineEdit}>
            <input
              className={styles.inlineInput}
              value={editFolderName}
              onChange={e => setEditFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRenameFolder(folder.id);
                if (e.key === 'Escape') setEditingFolderId(null);
              }}
              autoFocus
            />
            <div className={styles.inlineActions}>
              <button className={styles.inlineBtn} onClick={() => handleRenameFolder(folder.id)}>Save</button>
              <button className={styles.inlineBtn} onClick={() => setEditingFolderId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      );
    }

    if (confirmDeleteFolderId === folder.id) {
      return (
        <div key={folder.id} className={styles.folderSection}>
          <div className={styles.inlineEdit}>
            <span className={styles.deleteText}>
              Delete &ldquo;{folder.name}&rdquo;?
              {folderCharts.length > 0 && ` (${folderCharts.length} charts will be uncategorized)`}
            </span>
            <div className={styles.inlineActions}>
              <button className={`${styles.inlineBtn} ${styles.inlineBtnDanger}`} onClick={() => handleDeleteFolder(folder.id)}>Delete</button>
              <button className={styles.inlineBtn} onClick={() => setConfirmDeleteFolderId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={folder.id} className={styles.folderSection}>
        <div className={styles.folderHeader}>
          <button
            className={styles.folderHeader}
            onClick={() => toggleFolder(folder.id)}
            style={{ padding: 0, width: 'auto', flex: 1, border: 'none' }}
          >
            <span className={styles.folderChevron}>
              {isOpen ? '\u25BE' : '\u25B8'}
            </span>
            <span className={styles.folderName}>{folder.name}</span>
            <span className={styles.folderCount}>({folderCharts.length})</span>
          </button>
          <div className={styles.folderActions}>
            <button
              className={styles.folderActionBtn}
              onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); setConfirmDeleteFolderId(null); }}
              title="Rename folder"
            >
              {'\u270E'}
            </button>
            <button
              className={styles.folderActionBtn}
              onClick={() => { setConfirmDeleteFolderId(folder.id); setEditingFolderId(null); }}
              title="Delete folder"
            >
              &times;
            </button>
          </div>
        </div>

        {isOpen && (
          <div className={styles.folderChildren}>
            {folderCharts.length === 0 ? (
              <div className={styles.empty} style={{ padding: '8px 0', fontSize: '11px' }}>
                No charts in this folder
              </div>
            ) : (
              folderCharts.map(chart => renderChartItem(chart, true))
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Close on overlay click ──

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Select Chart</span>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search charts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Body */}
        <div className={styles.body}>
          {filteredCharts.length === 0 ? (
            <div className={styles.empty}>
              {query ? 'No charts match your search' : 'No saved charts yet'}
            </div>
          ) : isSearching ? (
            // Flat list when searching
            uncategorized.map(chart => renderChartItem(chart))
          ) : (
            <>
              {/* Folders */}
              {savedFolders.map(folder => renderFolder(folder))}

              {/* Divider if there are both folders and uncategorized */}
              {savedFolders.length > 0 && uncategorized.length > 0 && (
                <div className={styles.sectionDivider} />
              )}

              {/* Uncategorized charts */}
              {uncategorized.map(chart => renderChartItem(chart))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {creatingFolder ? (
            <div className={styles.newFolderRow} style={{ flex: 1, display: 'flex', gap: '4px' }}>
              <input
                className={styles.inlineInput}
                style={{ flex: 1 }}
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                }}
                placeholder="Folder name..."
                autoFocus
              />
              <button className={styles.inlineBtn} onClick={handleCreateFolder}>Create</button>
              <button className={styles.inlineBtn} onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>Cancel</button>
            </div>
          ) : (
            <button className={styles.footerBtn} onClick={() => setCreatingFolder(true)}>
              + New Folder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
