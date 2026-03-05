import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getChartType } from '../../data/chartTypes';
import styles from './ProjectChartPickerModal.module.css';

/**
 * Multi-select chart picker modal.
 * Shows folders with collapsible sections, per-chart checkboxes,
 * and folder-level select-all. Used for building research projects.
 */
export default function ProjectChartPickerModal({
  open,
  onClose,
  onConfirm,
  initialSelectedIds = [],
  title = 'Select Charts',
}) {
  const { savedCharts, savedFolders } = useAuth();
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelectedIds));
  const [openFolders, setOpenFolders] = useState(new Set());
  const [search, setSearch] = useState('');
  const overlayRef = useRef(null);
  const searchRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(initialSelectedIds));
      setSearch('');
      // Auto-open all folders that have charts
      const folderIds = new Set(savedFolders.map(f => f.id));
      setOpenFolders(folderIds);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  // Group charts by folder
  const { folderCharts, uncategorized } = useMemo(() => {
    const byFolder = {};
    const uncat = [];
    for (const chart of savedCharts) {
      if (chart.folderId) {
        if (!byFolder[chart.folderId]) byFolder[chart.folderId] = [];
        byFolder[chart.folderId].push(chart);
      } else {
        uncat.push(chart);
      }
    }
    return { folderCharts: byFolder, uncategorized: uncat };
  }, [savedCharts]);

  // Filter by search
  const searchLower = search.toLowerCase().trim();
  function matchesSearch(chart) {
    if (!searchLower) return true;
    return (
      chart.name?.toLowerCase().includes(searchLower) ||
      chart.birthDate?.toLowerCase().includes(searchLower) ||
      chart.locationName?.toLowerCase().includes(searchLower)
    );
  }

  function toggleChart(chartId) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(chartId)) next.delete(chartId);
      else next.add(chartId);
      return next;
    });
  }

  function toggleFolder(folderId) {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function toggleAllInFolder(folderId, charts) {
    const filtered = charts.filter(matchesSearch);
    const allSelected = filtered.every(c => selectedIds.has(c.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        for (const c of filtered) next.delete(c.id);
      } else {
        for (const c of filtered) next.add(c.id);
      }
      return next;
    });
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  function handleConfirm() {
    onConfirm(Array.from(selectedIds));
    onClose();
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  if (!open) return null;

  function renderChartItem(chart) {
    if (!matchesSearch(chart)) return null;
    const isSelected = selectedIds.has(chart.id);
    const ct = getChartType(chart.chartType);
    return (
      <div
        key={chart.id}
        className={`${styles.chartItem} ${isSelected ? styles.chartItemSelected : ''}`}
        onClick={() => toggleChart(chart.id)}
      >
        <input
          type="checkbox"
          className={styles.chartCheckbox}
          checked={isSelected}
          onChange={() => toggleChart(chart.id)}
          onClick={e => e.stopPropagation()}
        />
        <div className={styles.chartInfo}>
          <span className={styles.chartName}>
            <span style={{ color: ct.color, marginRight: '4px' }}>{'\u25CF'}</span>
            {chart.name}
          </span>
          <span className={styles.chartMeta}>
            {ct.label} {'\u00B7'} {chart.birthDate || '\u2014'}
          </span>
        </div>
      </div>
    );
  }

  const totalSelected = selectedIds.size;

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button className={styles.closeBtn} onClick={onClose}>{'\u00D7'}</button>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <input
            ref={searchRef}
            className={styles.searchInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search charts\u2026"
          />
        </div>

        {/* Selection count */}
        <div className={styles.selectionBar}>
          <span>
            {totalSelected} chart{totalSelected !== 1 ? 's' : ''} selected
          </span>
          {totalSelected > 0 && (
            <button className={styles.clearBtn} onClick={clearAll}>Clear all</button>
          )}
        </div>

        {/* Body */}
        <div className={styles.body}>
          {savedCharts.length === 0 ? (
            <div className={styles.empty}>
              No charts available. Import .SFcht files to get started.
            </div>
          ) : (
            <>
              {/* Folders */}
              {savedFolders.map(folder => {
                const charts = folderCharts[folder.id] || [];
                const filtered = charts.filter(matchesSearch);
                if (filtered.length === 0 && searchLower) return null;

                const isOpen = openFolders.has(folder.id);
                const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
                const someSelected = filtered.some(c => selectedIds.has(c.id));

                return (
                  <div key={folder.id} className={styles.folderSection}>
                    <div className={styles.folderHeader}>
                      <input
                        type="checkbox"
                        className={styles.folderCheckbox}
                        checked={allSelected}
                        ref={el => {
                          if (el) el.indeterminate = someSelected && !allSelected;
                        }}
                        onChange={() => toggleAllInFolder(folder.id, charts)}
                        onClick={e => e.stopPropagation()}
                      />
                      <span
                        className={styles.folderChevron}
                        onClick={() => toggleFolder(folder.id)}
                      >
                        {isOpen ? '\u25BE' : '\u25B8'}
                      </span>
                      <span
                        className={styles.folderName}
                        onClick={() => toggleFolder(folder.id)}
                      >
                        {folder.name}
                      </span>
                      <span className={styles.folderCount}>{filtered.length}</span>
                    </div>
                    {isOpen && (
                      <div className={styles.folderChildren}>
                        {charts.map(chart => renderChartItem(chart))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Divider */}
              {savedFolders.length > 0 && uncategorized.length > 0 && (
                <div className={styles.sectionDivider} />
              )}

              {/* Uncategorized */}
              {uncategorized.map(chart => renderChartItem(chart))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
            onClick={handleConfirm}
            disabled={totalSelected === 0}
          >
            {totalSelected === 0
              ? 'Select charts to continue'
              : `Add ${totalSelected} Chart${totalSelected !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
