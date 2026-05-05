import { useState, useRef, useEffect, useMemo } from 'react';
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
import ChartWheel from '../ChartWheel/ChartWheel';
import ChartDataView from '../ChartWheel/ChartDataView';
import styles from './ChartPickerModal.module.css';

const ALL_FOLDERS = '__all__';
const UNCATEGORIZED = '__uncategorized__';

/**
 * ChartPickerModal — Saved Charts browser with two-pane layout.
 *
 * Left pane: folder dropdown + searchable chart table.
 * Right pane: wheel/data preview of the highlighted chart.
 */
export default function ChartPickerModal({ open, onClose, onSelectChart, currentChartId }) {
  const {
    user,
    savedCharts, setSavedCharts,
    savedFolders, setSavedFolders,
    defaultChartId, setDefaultChartId: setDefId,
  } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState(ALL_FOLDERS);
  const [previewId, setPreviewId] = useState(null);
  const [previewMode, setPreviewMode] = useState('wheel');

  const [editingChartId, setEditingChartId] = useState(null);
  const [editChartName, setEditChartName] = useState('');
  const [confirmDeleteChartId, setConfirmDeleteChartId] = useState(null);

  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState(null);

  const [moveChartId, setMoveChartId] = useState(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const overlayRef = useRef(null);
  const searchRef = useRef(null);

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
      // Default the folder to the one containing the current chart, else All
      const current = savedCharts.find(c => c.id === currentChartId);
      setActiveFolder(current?.folderId || ALL_FOLDERS);
      setPreviewId(currentChartId || null);
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

  // ── Chart actions ──

  function handleSelectChart(chart) {
    onSelectChart({
      name: chart.name,
      chartType: chart.chartType || 'natal',
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
      if (previewId === chartId) setPreviewId(null);
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
      if (folderId) setActiveFolder(folderId);
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
      setActiveFolder(id);
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
      if (activeFolder === folderId) setActiveFolder(ALL_FOLDERS);
    } catch (err) {
      console.error('Delete folder failed:', err);
    }
  }

  // ── Filtering / sorting ──

  const query = searchQuery.toLowerCase().trim();

  const visibleCharts = useMemo(() => {
    let list = [...savedCharts];

    // Folder filter (overridden by search)
    if (!query) {
      if (activeFolder === UNCATEGORIZED) {
        list = list.filter(c => !c.folderId);
      } else if (activeFolder !== ALL_FOLDERS) {
        list = list.filter(c => c.folderId === activeFolder);
      }
    }

    if (query) {
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(query) ||
        (c.locationName || '').toLowerCase().includes(query) ||
        (c.birthDate || '').includes(query) ||
        (c.chartType || '').toLowerCase().includes(query)
      );
    }

    // Default chart pinned to top, then alphabetical by name
    list.sort((a, b) => {
      if (a.id === defaultChartId) return -1;
      if (b.id === defaultChartId) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [savedCharts, query, activeFolder, defaultChartId]);

  const previewChart = previewId
    ? savedCharts.find(c => c.id === previewId) || null
    : null;

  const activeFolderObj = savedFolders.find(f => f.id === activeFolder);

  // ── Header subtitle (Astro-Gold-style "120 Astro Gold Sample Charts") ──
  const folderLabel =
    activeFolder === ALL_FOLDERS ? 'All charts'
    : activeFolder === UNCATEGORIZED ? 'Uncategorized'
    : (activeFolderObj?.name || 'Folder');

  // ── Render ──

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Saved Charts</span>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Folder bar (folder dropdown + count + label) */}
        <div className={styles.folderBar}>
          <select
            className={styles.folderSelect}
            value={activeFolder}
            onChange={e => { setActiveFolder(e.target.value); setSearchQuery(''); }}
          >
            <option value={ALL_FOLDERS}>All charts</option>
            <option value={UNCATEGORIZED}>Uncategorized</option>
            {savedFolders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <span className={styles.folderCountPill}>{visibleCharts.length}</span>
          <span className={styles.folderSubtitle}>{folderLabel}</span>
          {activeFolder !== ALL_FOLDERS && activeFolder !== UNCATEGORIZED && activeFolderObj && (
            <div className={styles.folderEditActions}>
              <button
                className={styles.folderActionBtn}
                onClick={() => { setEditingFolderId(activeFolder); setEditFolderName(activeFolderObj.name); }}
                title="Rename folder"
              >{'✎'}</button>
              <button
                className={styles.folderActionBtn}
                onClick={() => setConfirmDeleteFolderId(activeFolder)}
                title="Delete folder"
              >&times;</button>
            </div>
          )}
        </div>

        {/* Inline folder rename / delete confirm */}
        {editingFolderId && (
          <div className={styles.inlineFolderEdit}>
            <input
              className={styles.inlineInput}
              value={editFolderName}
              onChange={e => setEditFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRenameFolder(editingFolderId);
                if (e.key === 'Escape') setEditingFolderId(null);
              }}
              autoFocus
            />
            <button className={styles.inlineBtn} onClick={() => handleRenameFolder(editingFolderId)}>Save</button>
            <button className={styles.inlineBtn} onClick={() => setEditingFolderId(null)}>Cancel</button>
          </div>
        )}
        {confirmDeleteFolderId && (
          <div className={styles.inlineFolderEdit}>
            <span className={styles.deleteText}>
              Delete folder? Charts inside will become uncategorized.
            </span>
            <button className={`${styles.inlineBtn} ${styles.inlineBtnDanger}`} onClick={() => handleDeleteFolder(confirmDeleteFolderId)}>Delete</button>
            <button className={styles.inlineBtn} onClick={() => setConfirmDeleteFolderId(null)}>Cancel</button>
          </div>
        )}

        {/* Body — two panes */}
        <div className={styles.body}>
          {/* Left pane: chart table */}
          <div className={styles.leftPane}>
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

            <div className={styles.tableWrap}>
              <div className={styles.tableHeader}>
                <span className={styles.colName}>Name</span>
                <span className={styles.colDate}>Date</span>
                <span className={styles.colType}>Type</span>
              </div>
              <div className={styles.tableBody}>
                {visibleCharts.length === 0 ? (
                  <div className={styles.empty}>
                    {query ? 'No charts match your search' : 'No charts in this folder'}
                  </div>
                ) : (
                  visibleCharts.map(chart => {
                    const isPreview = previewId === chart.id;
                    const isCurrent = currentChartId === chart.id;
                    const isEditing = editingChartId === chart.id;
                    const isConfirmDelete = confirmDeleteChartId === chart.id;

                    if (isEditing) {
                      return (
                        <div key={chart.id} className={styles.tableRow}>
                          <input
                            className={styles.inlineInput}
                            style={{ flex: 1 }}
                            value={editChartName}
                            onChange={e => setEditChartName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameChart(chart.id);
                              if (e.key === 'Escape') setEditingChartId(null);
                            }}
                            autoFocus
                          />
                          <button className={styles.inlineBtn} onClick={() => handleRenameChart(chart.id)}>Save</button>
                          <button className={styles.inlineBtn} onClick={() => setEditingChartId(null)}>Cancel</button>
                        </div>
                      );
                    }
                    if (isConfirmDelete) {
                      return (
                        <div key={chart.id} className={styles.tableRow}>
                          <span className={styles.deleteText} style={{ flex: 1 }}>
                            Delete &ldquo;{chart.name}&rdquo;?
                          </span>
                          <button className={`${styles.inlineBtn} ${styles.inlineBtnDanger}`} onClick={() => handleDeleteChart(chart.id)}>Delete</button>
                          <button className={styles.inlineBtn} onClick={() => setConfirmDeleteChartId(null)}>Cancel</button>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={chart.id}
                        className={`${styles.tableRow} ${isPreview ? styles.tableRowActive : ''} ${isCurrent ? styles.tableRowCurrent : ''}`}
                        onClick={() => setPreviewId(chart.id)}
                        onDoubleClick={() => handleSelectChart(chart)}
                      >
                        <span className={styles.colName} title={chart.name}>
                          {chart.name}
                          {chart.id === defaultChartId && <span className={styles.chartDefault}> {'★'}</span>}
                        </span>
                        <span className={styles.colDate}>{chart.birthDate || '—'}</span>
                        <span className={styles.colType}>{chart.chartType || 'natal'}</span>

                        <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                          <button
                            className={styles.rowActionBtn}
                            onClick={() => handleToggleDefault(chart.id)}
                            title={chart.id === defaultChartId ? 'Remove default' : 'Set as default'}
                          >{chart.id === defaultChartId ? '★' : '☆'}</button>
                          <button
                            className={styles.rowActionBtn}
                            onClick={() => { setEditingChartId(chart.id); setEditChartName(chart.name); }}
                            title="Rename"
                          >{'✎'}</button>
                          {savedFolders.length > 0 && (
                            <button
                              className={styles.rowActionBtn}
                              onClick={() => setMoveChartId(moveChartId === chart.id ? null : chart.id)}
                              title="Move to folder"
                            >{'↷'}</button>
                          )}
                          <button
                            className={styles.rowActionBtn}
                            onClick={() => setConfirmDeleteChartId(chart.id)}
                            title="Delete"
                          >&times;</button>

                          {moveChartId === chart.id && (
                            <div className={styles.moveDropdown}>
                              <button
                                className={`${styles.moveOption} ${!chart.folderId ? styles.moveOptionActive : ''}`}
                                onClick={() => handleMoveChart(chart.id, null)}
                              >Uncategorized</button>
                              {savedFolders.map(f => (
                                <button
                                  key={f.id}
                                  className={`${styles.moveOption} ${chart.folderId === f.id ? styles.moveOptionActive : ''}`}
                                  onClick={() => handleMoveChart(chart.id, f.id)}
                                >{f.name}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right pane: preview */}
          <div className={styles.rightPane}>
            <div className={styles.previewToggle}>
              <button
                className={`${styles.toggleBtn} ${previewMode === 'wheel' ? styles.toggleBtnActive : ''}`}
                onClick={() => setPreviewMode('wheel')}
              >Wheel</button>
              <button
                className={`${styles.toggleBtn} ${previewMode === 'data' ? styles.toggleBtnActive : ''}`}
                onClick={() => setPreviewMode('data')}
              >Data</button>
            </div>

            {previewChart ? (
              <>
                <div className={styles.previewMeta}>
                  <div className={styles.previewName}>{previewChart.name}</div>
                  <div className={styles.previewSub}>
                    {previewChart.chartType || 'natal'}
                    {previewChart.birthDate && ` · ${previewChart.birthDate}`}
                    {previewChart.birthTime && ` · ${previewChart.birthTime}`}
                  </div>
                  {previewChart.locationName && (
                    <div className={styles.previewSub}>{previewChart.locationName}</div>
                  )}
                </div>

                <div className={styles.previewBody}>
                  {previewMode === 'wheel'
                    ? <ChartWheel chart={previewChart} size={320} />
                    : <ChartDataView chart={previewChart} />
                  }
                </div>
              </>
            ) : (
              <div className={styles.previewEmpty}>
                Select a chart to preview
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {creatingFolder ? (
            <div className={styles.newFolderRow}>
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
            <>
              <button className={styles.footerBtn} onClick={() => setCreatingFolder(true)}>+ New Folder</button>
              <div style={{ flex: 1 }} />
              <button className={styles.footerBtn} onClick={onClose}>Cancel</button>
              <button
                className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                onClick={() => previewChart && handleSelectChart(previewChart)}
                disabled={!previewChart}
              >
                Select
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
