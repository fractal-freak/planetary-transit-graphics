import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadPresets,
  savePreset,
  renamePreset,
  deletePreset,
  togglePresetFavorite,
  updatePresetJobs,
} from '../../firebase/firestore';
import styles from './PresetPickerModal.module.css';

const MAX_PRESETS = 30;
const MAX_FAVORITES = 5;

/**
 * PresetPickerModal — full-screen modal for saving, loading,
 * and managing transit configuration presets.
 *
 * Props:
 *   open          — whether modal is visible
 *   onClose       — close handler
 *   onLoadPreset  — (preset) => void — load a preset's jobs
 *   currentMode   — 'world' | 'natal'
 *   currentJobs   — the current transitJobs or natalJobs array
 *   hasJobs       — whether there are jobs to save
 */
export default function PresetPickerModal({
  open,
  onClose,
  onLoadPreset,
  currentMode,
  currentJobs,
  hasJobs,
  startDate,
  endDate,
}) {
  const { user, savedPresets, setSavedPresets } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');

  // Save flow
  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmOverwriteId, setConfirmOverwriteId] = useState(null);

  const overlayRef = useRef(null);
  const searchRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setIsSaving(false);
      setSaveName('');
      setEditingId(null);
      setConfirmDeleteId(null);
      setConfirmOverwriteId(null);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  // ── Helpers ──

  async function refreshPresets() {
    const presets = await loadPresets(user.uid);
    setSavedPresets(presets);
  }

  // Only show presets matching the current mode
  const modePresets = savedPresets.filter(p => (p.mode || 'world') === currentMode);
  const favoriteCount = modePresets.filter(p => p.isFavorite).length;
  const atCap = savedPresets.length >= MAX_PRESETS;

  // ── Build a short description of jobs for the meta line ──

  function describeJobs(jobs, mode) {
    if (!jobs || jobs.length === 0) return 'Empty';
    const planets = [...new Set(jobs.map(j => j.transitPlanet))];
    const names = planets.slice(0, 3).join(', ');
    const suffix = planets.length > 3 ? ` +${planets.length - 3}` : '';
    return `${jobs.length} transit${jobs.length > 1 ? 's' : ''} \u00B7 ${names}${suffix}`;
  }

  // ── Preset actions ──

  function handleLoadPreset(preset) {
    onLoadPreset(preset);
    onClose();
  }

  async function handleToggleFavorite(presetId, currentFav) {
    // If trying to favorite and already at max, block
    if (!currentFav && favoriteCount >= MAX_FAVORITES) return;
    try {
      await togglePresetFavorite(user.uid, presetId, !currentFav);
      await refreshPresets();
    } catch (err) {
      console.error('Toggle favorite failed:', err);
    }
  }

  async function handleRename(presetId) {
    if (!editName.trim()) return;
    try {
      await renamePreset(user.uid, presetId, editName.trim());
      await refreshPresets();
      setEditingId(null);
      setEditName('');
    } catch (err) {
      console.error('Rename failed:', err);
    }
  }

  async function handleDelete(presetId) {
    try {
      await deletePreset(user.uid, presetId);
      await refreshPresets();
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function handleOverwrite(presetId) {
    if (!hasJobs) return;
    try {
      const cleanJobs = currentJobs.map(job => JSON.parse(JSON.stringify(job)));
      await updatePresetJobs(user.uid, presetId, currentMode, cleanJobs, startDate, endDate);
      await refreshPresets();
      setConfirmOverwriteId(null);
    } catch (err) {
      console.error('Overwrite preset failed:', err);
      alert('Failed to overwrite preset: ' + (err.message || err));
    }
  }

  async function handleSaveConfirm() {
    if (!saveName.trim() || !hasJobs || atCap) return;
    setSaving(true);
    try {
      // Serialize jobs to plain objects — strip undefined values that Firestore rejects
      const cleanJobs = currentJobs.map(job => JSON.parse(JSON.stringify(job)));
      await savePreset(user.uid, {
        name: saveName.trim(),
        mode: currentMode,
        jobs: cleanJobs,
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
      });
      await refreshPresets();
      setIsSaving(false);
      setSaveName('');
    } catch (err) {
      console.error('Save preset failed:', err);
      alert('Failed to save preset: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  // ── Filtering & sorting ──

  const query = searchQuery.toLowerCase().trim();

  // Sort: favorites first, then by creation date (newest first, already from Firestore)
  const sorted = [...modePresets].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return 0;
  });

  const filtered = query
    ? sorted.filter(p => (p.name || '').toLowerCase().includes(query))
    : sorted;

  // ── Render preset item ──

  function renderPresetItem(preset) {
    if (editingId === preset.id) {
      return (
        <div key={preset.id} className={styles.presetItem}>
          <div className={styles.inlineEdit}>
            <input
              className={styles.inlineInput}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename(preset.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              autoFocus
            />
            <div className={styles.inlineActions}>
              <button className={styles.inlineBtn} onClick={() => handleRename(preset.id)}>Save</button>
              <button className={styles.inlineBtn} onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      );
    }

    if (confirmDeleteId === preset.id) {
      return (
        <div key={preset.id} className={styles.presetItem}>
          <div className={styles.inlineEdit}>
            <span className={styles.deleteText}>Delete &ldquo;{preset.name}&rdquo;?</span>
            <div className={styles.inlineActions}>
              <button className={`${styles.inlineBtn} ${styles.inlineBtnDanger}`} onClick={() => handleDelete(preset.id)}>Delete</button>
              <button className={styles.inlineBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      );
    }

    if (confirmOverwriteId === preset.id) {
      return (
        <div key={preset.id} className={styles.presetItem}>
          <div className={styles.inlineEdit}>
            <span className={styles.deleteText}>Overwrite &ldquo;{preset.name}&rdquo; with current setup?</span>
            <div className={styles.inlineActions}>
              <button className={styles.inlineBtn} onClick={() => handleOverwrite(preset.id)}>Overwrite</button>
              <button className={styles.inlineBtn} onClick={() => setConfirmOverwriteId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      );
    }

    const jobs = preset.jobs || [];

    return (
      <div key={preset.id} className={styles.presetItem}>
        <button className={styles.presetBtn} onClick={() => handleLoadPreset(preset)}>
          <span className={styles.presetName}>
            <span className={styles.presetNameText}>{preset.name}</span>
            {preset.isFavorite && (
              <span className={styles.favoriteStar}>{'\u2605'}</span>
            )}
          </span>
          <span className={styles.presetMeta}>
            {describeJobs(jobs, preset.mode)}
          </span>
        </button>

        <div className={styles.presetActions}>
          <button
            className={styles.presetActionBtn}
            onClick={() => handleToggleFavorite(preset.id, preset.isFavorite)}
            title={
              preset.isFavorite
                ? 'Remove from favorites'
                : favoriteCount >= MAX_FAVORITES
                  ? `Max ${MAX_FAVORITES} favorites`
                  : 'Add to favorites'
            }
            style={!preset.isFavorite && favoriteCount >= MAX_FAVORITES ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
          >
            {preset.isFavorite ? '\u2605' : '\u2606'}
          </button>
          <button
            className={styles.presetActionBtn}
            onClick={() => { setConfirmOverwriteId(preset.id); setEditingId(null); setConfirmDeleteId(null); }}
            title={hasJobs ? 'Overwrite with current setup' : 'Add transits first'}
            style={!hasJobs ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
            disabled={!hasJobs}
          >
            {'\u21BB'}
          </button>
          <button
            className={styles.presetActionBtn}
            onClick={() => { setEditingId(preset.id); setEditName(preset.name); setConfirmDeleteId(null); setConfirmOverwriteId(null); }}
            title="Rename"
          >
            {'\u270E'}
          </button>
          <button
            className={styles.presetActionBtn}
            onClick={() => { setConfirmDeleteId(preset.id); setEditingId(null); setConfirmOverwriteId(null); }}
            title="Delete"
          >
            &times;
          </button>
        </div>
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
          <span className={styles.title}>{currentMode === 'natal' ? 'Natal' : 'World'} Presets</span>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Search (show when 6+ presets for this mode) */}
        {modePresets.length >= 6 && (
          <div className={styles.searchWrap}>
            <input
              ref={searchRef}
              className={styles.searchInput}
              type="text"
              placeholder="Search presets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Body */}
        <div className={styles.body}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              {query ? 'No presets match your search' : `No ${currentMode === 'natal' ? 'natal' : 'world'} presets yet`}
            </div>
          ) : (
            filtered.map(preset => renderPresetItem(preset))
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {isSaving ? (
            <div className={styles.saveRow}>
              <input
                className={styles.inlineInput}
                style={{ flex: 1 }}
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveConfirm();
                  if (e.key === 'Escape') { setIsSaving(false); setSaveName(''); }
                }}
                placeholder="Preset name..."
                autoFocus
              />
              <button
                className={styles.inlineBtn}
                onClick={handleSaveConfirm}
                disabled={saving || !saveName.trim()}
              >
                {saving ? '...' : 'Save'}
              </button>
              <button className={styles.inlineBtn} onClick={() => { setIsSaving(false); setSaveName(''); }}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className={styles.footerBtn}
              onClick={() => setIsSaving(true)}
              disabled={!hasJobs || atCap}
              title={atCap ? `Max ${MAX_PRESETS} presets` : !hasJobs ? 'Add transits first' : 'Save current transit setup'}
            >
              {modePresets.length > 0
                ? `Save Current Setup (${modePresets.length})`
                : 'Save Current Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
