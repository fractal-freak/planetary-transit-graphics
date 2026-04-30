import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { DEFAULT_ELEMENT_RGB, setElementRGB } from '../data/zodiac';

const ColorContext = createContext(null);
const STORAGE_KEY = 'transitwiz.colorSets';

const DEFAULT_SET_ID = 'elements';
const DEFAULT_SET = {
  id: DEFAULT_SET_ID,
  name: 'Elements',
  isDefault: true,
  colors: DEFAULT_ELEMENT_RGB,
};

export const ELEMENTS = [
  { index: 0, name: 'Fire',  symbol: '🜂' },  // 🜂
  { index: 1, name: 'Earth', symbol: '🜃' },  // 🜃
  { index: 2, name: 'Air',   symbol: '🜁' },  // 🜁
  { index: 3, name: 'Water', symbol: '🜄' },  // 🜄
];

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch { return null; }
}

function writeStored(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function genId() {
  return 'set-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

export function useColors() {
  const ctx = useContext(ColorContext);
  if (!ctx) throw new Error('useColors must be used within ColorProvider');
  return ctx;
}

export function ColorProvider({ children }) {
  const [colorSets, setColorSets] = useState(() => {
    const stored = readStored();
    if (stored?.userSets?.length) return [DEFAULT_SET, ...stored.userSets];
    return [DEFAULT_SET];
  });

  const [activeSetId, setActiveSetId] = useState(() => {
    const stored = readStored();
    return stored?.activeSetId || DEFAULT_SET_ID;
  });

  // Bump on every color change so consumers can include this in effect deps
  // and re-render their canvases without prop-drilling the colors array.
  const [version, setVersion] = useState(0);

  const activeSet = colorSets.find(s => s.id === activeSetId) || DEFAULT_SET;
  const activeColors = activeSet.colors;

  // Sync the runtime ELEMENT_RGB override + persist + bump version
  useEffect(() => {
    setElementRGB(activeColors);
    setVersion(v => v + 1);
  }, [activeColors]);

  // Persist color sets and active selection
  useEffect(() => {
    const userSets = colorSets.filter(s => !s.isDefault);
    writeStored({ userSets, activeSetId });
  }, [colorSets, activeSetId]);

  const selectSet = useCallback((id) => {
    setActiveSetId(id);
  }, []);

  // Update one element's RGB in the active set. If the active set is the
  // built-in default, fork it into a new "Custom" set first.
  // Generate the new id and forked object OUTSIDE the setColorSets updater
  // so React's StrictMode double-invocation of the updater doesn't produce
  // two divergent forks with different IDs.
  const setElementColor = useCallback((elementIndex, rgb) => {
    if (activeSet?.isDefault) {
      const newId = genId();
      const forked = {
        id: newId,
        name: 'Custom',
        isDefault: false,
        colors: activeColors.map((c, i) => i === elementIndex ? rgb : [...c]),
      };
      setColorSets(prev => prev.some(s => s.id === newId) ? prev : [...prev, forked]);
      setActiveSetId(newId);
      return;
    }
    setColorSets(prev => prev.map(s => (
      s.id === activeSetId
        ? { ...s, colors: s.colors.map((c, i) => i === elementIndex ? rgb : c) }
        : s
    )));
  }, [activeSet, activeColors, activeSetId]);

  const saveAsNewSet = useCallback((name) => {
    const trimmed = (name || '').trim() || 'Untitled';
    const newSet = {
      id: genId(),
      name: trimmed,
      isDefault: false,
      colors: activeColors.map(c => [...c]),
    };
    setColorSets(prev => [...prev, newSet]);
    setActiveSetId(newSet.id);
    return newSet.id;
  }, [activeColors]);

  const renameSet = useCallback((id, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setColorSets(prev => prev.map(s => (
      s.id === id && !s.isDefault ? { ...s, name: trimmed } : s
    )));
  }, []);

  const deleteSet = useCallback((id) => {
    setColorSets(prev => {
      const target = prev.find(s => s.id === id);
      if (!target || target.isDefault) return prev;
      const next = prev.filter(s => s.id !== id);
      return next;
    });
    setActiveSetId(prev => prev === id ? DEFAULT_SET_ID : prev);
  }, []);

  const value = {
    colorSets,
    activeSetId,
    activeSet,
    activeColors,
    version,
    selectSet,
    setElementColor,
    saveAsNewSet,
    renameSet,
    deleteSet,
  };

  return (
    <ColorContext.Provider value={value}>{children}</ColorContext.Provider>
  );
}
