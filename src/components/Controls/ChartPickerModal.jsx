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
  loadChartNotes,
} from '../../firebase/firestore';
import { loadAnonNotes } from '../../utils/anonNotes';
import { useAstroGoldFolderImport } from '../../hooks/useAstroGoldFolderImport';
import { formatTimeAgo } from '../../utils/timeAgo';
import { noteHaystack } from './NotesSection';
import { PLANET_MAP } from '../../data/planets';
import { ASPECT_MAP } from '../../utils/aspects';
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
export default function ChartPickerModal({
  open, onClose, onSelectChart, currentChartId,
  onSelectChartWithNote,
}) {
  const {
    user,
    savedCharts, setSavedCharts,
    savedFolders, setSavedFolders,
    defaultChartId, setDefaultChartId: setDefId,
  } = useAuth();

  const {
    connect: connectAstroGold,
    syncNow: syncAstroGoldNow,
    disconnect: disconnectAstroGold,
    cleanupDuplicates: cleanupAstroGoldDuplicates,
    status: agStatus,
    busy: agBusy,
    summary: agSummary,
    supported: agSupported,
    connected: agConnected,
    lastSyncedAt: agLastSyncedAt,
  } = useAstroGoldFolderImport();

  const handleCleanupDuplicates = async () => {
    if (!window.confirm('Scan for and delete duplicate charts? Only charts that share an exact synced identity (same name, time, and location) are touched. The oldest copy of each is kept.')) {
      return;
    }
    await cleanupAstroGoldDuplicates();
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState(ALL_FOLDERS);
  const [previewId, setPreviewId] = useState(null);
  const [previewMode, setPreviewMode] = useState('wheel');
  // Sort: clicking a column header toggles asc → desc → asc.
  const [sortBy, setSortBy] = useState({ field: 'name', dir: 'asc' });
  const toggleSort = (field) => setSortBy(s =>
    s.field === field
      ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' }
  );

  const [editingChartId, setEditingChartId] = useState(null);
  const [editChartName, setEditChartName] = useState('');
  const [confirmDeleteChartId, setConfirmDeleteChartId] = useState(null);

  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState(null);

  const [moveChartId, setMoveChartId] = useState(null);
  // Multi-select for bulk move/delete. Distinct from previewId.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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
      setSelectedIds(new Set());
      setBulkMoveOpen(false);
      setConfirmBulkDelete(false);
      setCreatingFolder(false);
      setNewFolderName('');
      // Default the folder to the one containing the current chart, else All
      const current = savedCharts.find(c => c.id === currentChartId);
      setActiveFolder(current?.folderId || ALL_FOLDERS);
      setPreviewId(currentChartId || null);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  // ── Filtering / sorting (must be above early return — hooks order) ──

  const query = searchQuery.toLowerCase().trim();

  const visibleCharts = useMemo(() => {
    let list = [...savedCharts];

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

    const dirMul = sortBy.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      // Default chart always pins to the top regardless of sort.
      if (a.id === defaultChartId) return -1;
      if (b.id === defaultChartId) return 1;
      let cmp;
      if (sortBy.field === 'date') {
        cmp = (a.birthDate || '').localeCompare(b.birthDate || '');
      } else if (sortBy.field === 'type') {
        cmp = (a.chartType || 'natal').localeCompare(b.chartType || 'natal');
      } else {
        cmp = (a.name || '').localeCompare(b.name || '');
      }
      // Stable secondary sort by name so equal-key rows have a deterministic order.
      if (cmp === 0 && sortBy.field !== 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      }
      return cmp * dirMul;
    });
    return list;
  }, [savedCharts, query, activeFolder, defaultChartId, sortBy]);

  // Detect likely duplicates across the whole library (name + birthDate + birthTime + lat + lng).
  const duplicateIds = useMemo(() => {
    const groups = new Map();
    for (const c of savedCharts) {
      const key = `${c.name || ''}|${c.birthDate || ''}|${c.birthTime || ''}|${c.lat ?? ''}|${c.lng ?? ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c.id);
    }
    const dups = new Set();
    for (const ids of groups.values()) {
      if (ids.length > 1) ids.forEach(id => dups.add(id));
    }
    return dups;
  }, [savedCharts]);

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
      id: chart.id,
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

  // ── Multi-select helpers ──

  function toggleSelected(id, e) {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === visibleCharts.length && visibleCharts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleCharts.map(c => c.id)));
    }
  }

  async function handleBulkMove(folderId) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map(id => moveChartToFolder(user.uid, id, folderId)));
      await refreshData();
      setBulkMoveOpen(false);
      setSelectedIds(new Set());
      if (folderId) setActiveFolder(folderId);
    } catch (err) {
      console.error('Bulk move failed:', err);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map(id => deleteChart(user.uid, id)));
      if (defaultChartId && ids.includes(defaultChartId)) {
        await setDefaultChartId(user.uid, null);
        setDefId(null);
      }
      await refreshData();
      setConfirmBulkDelete(false);
      if (previewId && ids.includes(previewId)) setPreviewId(null);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk delete failed:', err);
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
          {agSupported && (
            <div style={{ marginLeft: 'auto', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {agConnected && agLastSyncedAt && !agBusy && (
                <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                  Synced {formatTimeAgo(agLastSyncedAt)}
                </span>
              )}
              {agConnected ? (
                <>
                  <button
                    className={styles.inlineBtn}
                    onClick={syncAstroGoldNow}
                    disabled={agBusy}
                    title="Re-scan the connected folder for new or modified charts."
                  >
                    {agBusy ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button
                    className={styles.inlineBtn}
                    onClick={handleCleanupDuplicates}
                    disabled={agBusy}
                    title="Find and delete charts duplicated by past sync races, keeping the oldest copy of each."
                  >
                    Clean up duplicates
                  </button>
                  <button
                    className={styles.inlineBtn}
                    onClick={disconnectAstroGold}
                    disabled={agBusy}
                    title="Forget the connected folder. Reconnect to sync again."
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  className={styles.inlineBtn}
                  onClick={connectAstroGold}
                  disabled={agBusy}
                  title={
                    user
                      ? 'Pick a folder of .SFcht chart files (e.g. your Astro Gold iCloud folder) to bulk-import them. The app will auto-sync on focus afterwards.'
                      : 'Sign in first to sync charts to your library.'
                  }
                >
                  {agBusy ? 'Syncing…' : 'Connect chart library'}
                </button>
              )}
            </div>
          )}
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {(agStatus || agSummary) && (
          <div
            style={{
              padding: '4px 16px 8px',
              fontSize: '11px',
              color: 'var(--fg-muted)',
              lineHeight: 1.4,
              borderBottom: '1px solid var(--border-soft)',
            }}
          >
            {agStatus}
            {agSummary && (
              agSummary.deletedDuplicates !== undefined ? (
                <span>Removed {agSummary.deletedDuplicates} duplicate chart{agSummary.deletedDuplicates === 1 ? '' : 's'}.</span>
              ) : (
                <span>
                  {agSummary.added} new, {agSummary.updated} updated, {agSummary.unchanged ?? 0} unchanged
                  {agSummary.errors > 0 && `, ${agSummary.errors} errors`}
                  {agSummary.filesSkipped > 0 && ` (${agSummary.filesSkipped} files unchanged)`}
                  {agSummary.files > 0 && ` across ${agSummary.files} file${agSummary.files === 1 ? '' : 's'}`}
                  .
                </span>
              )
            )}
          </div>
        )}

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
                <input
                  type="checkbox"
                  className={styles.colCheck}
                  checked={visibleCharts.length > 0 && selectedIds.size === visibleCharts.length}
                  ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < visibleCharts.length; }}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
                <span className={styles.colName}>
                  <button
                    type="button"
                    className={`${styles.sortBtn} ${sortBy.field === 'name' ? styles.sortBtnActive : ''}`}
                    onClick={() => toggleSort('name')}
                    title="Sort by name"
                  >
                    Name
                    {sortBy.field === 'name' && (
                      <span className={styles.sortArrow}>{sortBy.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                </span>
                <span className={styles.colDate}>
                  <button
                    type="button"
                    className={`${styles.sortBtn} ${sortBy.field === 'date' ? styles.sortBtnActive : ''}`}
                    onClick={() => toggleSort('date')}
                    title="Sort by date"
                  >
                    Date
                    {sortBy.field === 'date' && (
                      <span className={styles.sortArrow}>{sortBy.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                </span>
                <span className={styles.colType}>
                  <button
                    type="button"
                    className={`${styles.sortBtn} ${sortBy.field === 'type' ? styles.sortBtnActive : ''}`}
                    onClick={() => toggleSort('type')}
                    title="Sort by type"
                  >
                    Type
                    {sortBy.field === 'type' && (
                      <span className={styles.sortArrow}>{sortBy.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                </span>
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

                    const isDup = duplicateIds.has(chart.id);
                    const isSelected = selectedIds.has(chart.id);
                    return (
                      <div
                        key={chart.id}
                        className={`${styles.tableRow} ${isPreview ? styles.tableRowActive : ''} ${isCurrent ? styles.tableRowCurrent : ''} ${isSelected ? styles.tableRowSelected : ''}`}
                        onClick={() => setPreviewId(chart.id)}
                        onDoubleClick={() => handleSelectChart(chart)}
                      >
                        <input
                          type="checkbox"
                          className={styles.colCheck}
                          checked={isSelected}
                          onChange={() => toggleSelected(chart.id)}
                          onClick={e => e.stopPropagation()}
                        />
                        <span className={styles.colName} title={chart.name}>
                          {chart.name}
                          {chart.id === defaultChartId && <span className={styles.chartDefault}> {'★'}</span>}
                          {isDup && <span className={styles.dupBadge} title="Possible duplicate">dup</span>}
                        </span>
                        <span className={styles.colDate}>{chart.birthDate || '—'}</span>
                        <span className={styles.colType}>{chart.chartType || 'natal'}</span>
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
              <button
                className={`${styles.toggleBtn} ${previewMode === 'notes' ? styles.toggleBtnActive : ''}`}
                onClick={() => setPreviewMode('notes')}
              >Notes</button>
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
                  {previewMode === 'wheel' && <ChartWheel chart={previewChart} size={380} />}
                  {previewMode === 'data' && <ChartDataView chart={previewChart} />}
                  {previewMode === 'notes' && (
                    <PreviewNotesList
                      chart={previewChart}
                      user={user}
                      onAdd={(note) => {
                        if (onSelectChartWithNote) onSelectChartWithNote(previewChart, note, 'add');
                        onClose();
                      }}
                      onLoad={(note) => {
                        if (onSelectChartWithNote) onSelectChartWithNote(previewChart, note, 'load');
                        onClose();
                      }}
                    />
                  )}
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
          ) : confirmBulkDelete ? (
            <div className={styles.newFolderRow}>
              <span className={styles.deleteText} style={{ flex: 1 }}>
                Delete {selectedIds.size} chart{selectedIds.size === 1 ? '' : 's'}? This cannot be undone.
              </span>
              <button className={`${styles.inlineBtn} ${styles.inlineBtnDanger}`} onClick={handleBulkDelete}>Delete {selectedIds.size}</button>
              <button className={styles.inlineBtn} onClick={() => setConfirmBulkDelete(false)}>Cancel</button>
            </div>
          ) : selectedIds.size > 0 ? (
            <>
              <span className={styles.selectionLabel}>{selectedIds.size} selected</span>
              <button className={styles.footerBtn} onClick={() => setSelectedIds(new Set())}>Clear</button>
              <div className={styles.footerSep} />
              <div className={styles.moveWrap}>
                <button
                  className={styles.footerBtn}
                  onClick={() => setBulkMoveOpen(v => !v)}
                >Move {selectedIds.size}…</button>
                {bulkMoveOpen && (
                  <div className={styles.moveDropdown}>
                    <button
                      className={styles.moveOption}
                      onClick={() => handleBulkMove(null)}
                    >Uncategorized</button>
                    {savedFolders.map(f => (
                      <button
                        key={f.id}
                        className={styles.moveOption}
                        onClick={() => handleBulkMove(f.id)}
                      >{f.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className={`${styles.footerBtn} ${styles.footerBtnDanger}`}
                onClick={() => setConfirmBulkDelete(true)}
              >Delete {selectedIds.size}</button>
              <div style={{ flex: 1 }} />
              <button className={styles.footerBtn} onClick={onClose}>Cancel</button>
            </>
          ) : (
            <>
              <button className={styles.footerBtn} onClick={() => setCreatingFolder(true)}>+ New Folder</button>
              <div className={styles.footerSep} />
              <button
                className={styles.footerBtn}
                disabled={!previewChart}
                onClick={() => previewChart && handleToggleDefault(previewChart.id)}
                title={previewChart?.id === defaultChartId ? 'Remove default' : 'Set as default'}
              >{previewChart?.id === defaultChartId ? '★ Default' : '☆ Default'}</button>
              <div className={styles.moveWrap}>
                <button
                  className={styles.footerBtn}
                  disabled={!previewChart}
                  onClick={() => previewChart && setMoveChartId(moveChartId === previewChart.id ? null : previewChart.id)}
                >Move</button>
                {previewChart && moveChartId === previewChart.id && (
                  <div className={styles.moveDropdown}>
                    <button
                      className={`${styles.moveOption} ${!previewChart.folderId ? styles.moveOptionActive : ''}`}
                      onClick={() => handleMoveChart(previewChart.id, null)}
                    >Uncategorized</button>
                    {savedFolders.map(f => (
                      <button
                        key={f.id}
                        className={`${styles.moveOption} ${previewChart.folderId === f.id ? styles.moveOptionActive : ''}`}
                        onClick={() => handleMoveChart(previewChart.id, f.id)}
                      >{f.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className={styles.footerBtn}
                disabled={!previewChart}
                onClick={() => { if (previewChart) { setEditingChartId(previewChart.id); setEditChartName(previewChart.name); } }}
              >Rename</button>
              <button
                className={`${styles.footerBtn} ${styles.footerBtnDanger}`}
                disabled={!previewChart}
                onClick={() => previewChart && setConfirmDeleteChartId(previewChart.id)}
              >Delete</button>
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

/**
 * PreviewNotesList — fetches and displays the notes attached to the
 * currently-previewed chart in the picker modal. Each row exposes Add /
 * Load buttons that bubble up via onAdd/onLoad along with the underlying
 * note; the parent uses those to load the chart and apply the transit.
 */
function PreviewNotesList({ chart, user, onAdd, onLoad }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Load notes from BOTH Firestore (signed in + non-local id) and
  // localStorage (any chart id), then merge by transit + target + aspect +
  // peak day. Firestore takes precedence on collisions; entries that exist
  // only in localStorage still surface so old data isn't hidden behind a
  // mismatched chart id.
  useEffect(() => {
    let cancelled = false;
    if (!chart?.id) {
      setNotes([]);
      return;
    }
    setLoading(true);
    setSearch('');
    const useFirestore = !!user && !chart.id.startsWith('local-') && !chart.id.startsWith('anon-');
    const localNotes = loadAnonNotes(chart.id) || [];
    const remotePromise = useFirestore
      ? loadChartNotes(user.uid, chart.id).catch(() => [])
      : Promise.resolve([]);
    remotePromise.then(remote => {
      if (cancelled) return;
      const seen = new Map();
      const keyOf = n => `${n.transitPlanet}|${n.target}|${n.aspect}|${(n.peakDate || '').slice(0, 10)}`;
      for (const n of (remote || [])) seen.set(keyOf(n), n);
      for (const n of localNotes) {
        const k = keyOf(n);
        if (!seen.has(k)) seen.set(k, n);
      }
      const merged = Array.from(seen.values()).sort((a, b) => {
        const aT = new Date(a.createdAt || 0).getTime();
        const bT = new Date(b.createdAt || 0).getTime();
        return bT - aT;
      });
      setNotes(merged);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [chart, user]);

  const filtered = search.trim()
    ? notes.filter(n => noteHaystack(n).includes(search.toLowerCase().trim()))
    : notes;

  if (loading) {
    return <div className={styles.notesPickerEmpty}>Loading notes…</div>;
  }
  if (notes.length === 0) {
    return (
      <div className={styles.notesPickerEmpty}>
        No notes for this chart yet. Click a transit on the timeline to add one.
      </div>
    );
  }

  return (
    <div className={styles.notesPickerWrap}>
      <input
        type="text"
        className={styles.notesPickerSearch}
        placeholder="Search notes…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {filtered.length === 0 && (
        <div className={styles.notesPickerEmpty}>No notes match.</div>
      )}
      <div className={styles.notesPickerList}>
      {filtered.map(note => {
        const tP = PLANET_MAP[note.transitPlanet];
        const targetP = PLANET_MAP[note.target];
        const aspect = ASPECT_MAP[note.aspect];
        const peakDate = note.peakDate ? new Date(note.peakDate) : null;
        const peakStr = peakDate
          ? peakDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : '';
        return (
          <div key={note.id} className={styles.notesPickerItem}>
            <div className={styles.notesPickerHeader}>
              <span className={styles.notesPickerGlyphs}>
                <span style={{ color: tP?.color }}>{tP?.symbol ?? note.transitPlanet}</span>
                <span>{aspect?.symbol ?? note.aspect}</span>
                <span style={{ color: targetP?.color }}>{targetP?.symbol ?? note.target}</span>
              </span>
              {peakStr && <span className={styles.notesPickerDate}>{peakStr}</span>}
            </div>
            {note.body && <div className={styles.notesPickerBody}>{note.body}</div>}
            <div className={styles.notesPickerActions}>
              <button
                className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                onClick={() => onAdd(note)}
                title="Load this chart and add this transit alongside any current ones"
              >Add</button>
              <button
                className={styles.footerBtn}
                onClick={() => onLoad(note)}
                title="Load this chart and replace all current transits with just this one"
              >Load</button>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
