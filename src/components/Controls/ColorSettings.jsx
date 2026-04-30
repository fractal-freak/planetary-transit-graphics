import { useRef, useState } from 'react';
import { useColors, ELEMENTS } from '../../contexts/ColorContext';
import styles from './Controls.module.css';

function rgbToHex([r, g, b]) {
  const toHex = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function hexToRgb(hex) {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export default function ColorSettings() {
  const {
    colorSets,
    activeSetId,
    activeSet,
    activeColors,
    selectSet,
    setElementColor,
    saveAsNewSet,
    renameSet,
    deleteSet,
  } = useColors();

  const fileInputRefs = useRef({});
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsValue, setSaveAsValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [setsOpen, setSetsOpen] = useState(false);

  function openPicker(elementIdx) {
    const input = fileInputRefs.current[elementIdx];
    if (input) {
      input.value = rgbToHex(activeColors[elementIdx]);
      input.click();
    }
  }

  function handleColorChange(elementIdx, hex) {
    const rgb = hexToRgb(hex);
    if (rgb) setElementColor(elementIdx, rgb);
  }

  function handleSaveAs() {
    const name = saveAsValue.trim();
    if (!name) return;
    saveAsNewSet(name);
    setSaveAsValue('');
    setShowSaveAs(false);
  }

  function handleRename(id) {
    const name = renameValue.trim();
    if (name) renameSet(id, name);
    setRenamingId(null);
    setRenameValue('');
  }

  return (
    <div className={styles.colorSettingsBody}>
      {/* Color sets — selector + manage */}
      <div className={styles.colorSetsHeader}>
        <button
          type="button"
          className={styles.colorSetsToggle}
          onClick={() => setSetsOpen(o => !o)}
          aria-expanded={setsOpen}
        >
          <span className={styles.colorSetsLabel}>Set</span>
          <span className={styles.colorSetsCurrent}>{activeSet?.name || 'Elements'}</span>
          <span className={styles.colorSetsChevron}>{setsOpen ? '▾' : '▸'}</span>
        </button>
      </div>

      {setsOpen && (
        <div className={styles.colorSetsList}>
          {colorSets.map(set => {
            const isActive = set.id === activeSetId;
            const isRenaming = renamingId === set.id;
            const isConfirmingDelete = confirmDeleteId === set.id;

            if (isRenaming) {
              return (
                <div key={set.id} className={styles.colorSetRenameRow}>
                  <input
                    autoFocus
                    type="text"
                    className={styles.colorSetInput}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(set.id);
                      if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                    }}
                    maxLength={32}
                  />
                  <button type="button" className={styles.colorSetMicroBtn} onClick={() => handleRename(set.id)}>OK</button>
                </div>
              );
            }

            if (isConfirmingDelete) {
              return (
                <div key={set.id} className={styles.colorSetConfirmRow}>
                  <span className={styles.colorSetConfirmText}>Delete "{set.name}"?</span>
                  <button type="button" className={`${styles.colorSetMicroBtn} ${styles.colorSetMicroBtnDanger}`} onClick={() => { deleteSet(set.id); setConfirmDeleteId(null); }}>Delete</button>
                  <button type="button" className={styles.colorSetMicroBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                </div>
              );
            }

            return (
              <div key={set.id} className={`${styles.colorSetRow} ${isActive ? styles.colorSetRowActive : ''}`}>
                <button
                  type="button"
                  className={styles.colorSetSelect}
                  onClick={() => selectSet(set.id)}
                  title={set.isDefault ? 'Built-in default — cannot be deleted' : ''}
                >
                  <span className={styles.colorSetSwatches} aria-hidden="true">
                    {set.colors.map((c, i) => (
                      <span
                        key={i}
                        className={styles.colorSetSwatchMini}
                        style={{ background: `rgb(${c[0]}, ${c[1]}, ${c[2]})` }}
                      />
                    ))}
                  </span>
                  <span className={styles.colorSetName}>{set.name}</span>
                  {set.isDefault && <span className={styles.colorSetDefault}>default</span>}
                </button>
                {!set.isDefault && (
                  <div className={styles.colorSetActions}>
                    <button
                      type="button"
                      className={styles.colorSetIconBtn}
                      onClick={() => { setRenamingId(set.id); setRenameValue(set.name); }}
                      title="Rename"
                      aria-label="Rename set"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className={`${styles.colorSetIconBtn} ${styles.colorSetIconBtnDanger}`}
                      onClick={() => setConfirmDeleteId(set.id)}
                      title="Delete"
                      aria-label="Delete set"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {showSaveAs ? (
            <div className={styles.colorSetRenameRow}>
              <input
                autoFocus
                type="text"
                className={styles.colorSetInput}
                value={saveAsValue}
                onChange={e => setSaveAsValue(e.target.value)}
                placeholder="New set name"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveAs();
                  if (e.key === 'Escape') { setShowSaveAs(false); setSaveAsValue(''); }
                }}
                maxLength={32}
              />
              <button type="button" className={styles.colorSetMicroBtn} onClick={handleSaveAs}>Save</button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.colorSetSaveAs}
              onClick={() => { setShowSaveAs(true); setSaveAsValue(activeSet?.isDefault ? '' : activeSet?.name + ' copy'); }}
            >
              + Save current as new set
            </button>
          )}
        </div>
      )}

      {/* Elements — one row per element with name, symbol, swatch */}
      <div className={styles.elementList}>
        {ELEMENTS.map((el) => {
          const rgb = activeColors[el.index];
          const hex = rgbToHex(rgb);
          return (
            <div key={el.index} className={styles.elementRow}>
              <span className={styles.elementSymbol} aria-hidden="true">{el.symbol}</span>
              <span className={styles.elementName}>{el.name}</span>
              <button
                type="button"
                className={styles.elementSwatch}
                style={{ background: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
                onClick={() => openPicker(el.index)}
                aria-label={`Edit ${el.name} color (currently ${hex})`}
                title={hex}
              />
              <input
                ref={r => { fileInputRefs.current[el.index] = r; }}
                type="color"
                className={styles.elementColorInput}
                defaultValue={hex}
                onChange={e => handleColorChange(el.index, e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
