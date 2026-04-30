import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { ensureUserDoc, loadCharts, loadFolders, loadPresets, loadStacks, loadProjects, getDefaultChartId, seedDefaultPresetsIfNeeded } from '../firebase/firestore';
import { loadAnonPresets } from '../utils/anonPresets';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savedCharts, setSavedCharts] = useState([]);
  const [savedFolders, setSavedFolders] = useState([]);
  const [savedPresets, setSavedPresets] = useState([]);
  const [savedStacks, setSavedStacks] = useState([]);
  const [savedProjects, setSavedProjects] = useState([]);
  const [defaultChartId, setDefaultChartIdState] = useState(null);

  // Listen to Firebase auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          await ensureUserDoc(firebaseUser.uid);
          const [charts, defId] = await Promise.all([
            loadCharts(firebaseUser.uid),
            getDefaultChartId(firebaseUser.uid),
          ]);
          setSavedCharts(charts);
          setDefaultChartIdState(defId);
          // Load folders and presets separately — collections may not exist yet
          try {
            const folders = await loadFolders(firebaseUser.uid);
            setSavedFolders(folders);
          } catch (folderErr) {
            console.warn('Folders not available yet:', folderErr);
            setSavedFolders([]);
          }
          try {
            // Seed default presets on first load (idempotent — checks
            // user.defaultsSeededAt flag). Then load.
            try {
              await seedDefaultPresetsIfNeeded(firebaseUser.uid);
            } catch (seedErr) {
              console.warn('Default preset seeding failed:', seedErr);
            }
            const presets = await loadPresets(firebaseUser.uid);
            setSavedPresets(presets);
          } catch (presetErr) {
            console.warn('Presets not available yet:', presetErr);
            setSavedPresets([]);
          }
          try {
            const stacks = await loadStacks(firebaseUser.uid);
            setSavedStacks(stacks);
          } catch (stackErr) {
            console.warn('Stacks not available yet:', stackErr);
            setSavedStacks([]);
          }
          try {
            const projects = await loadProjects(firebaseUser.uid);
            setSavedProjects(projects);
          } catch (projectErr) {
            console.warn('Projects not available yet:', projectErr);
            setSavedProjects([]);
          }
        } catch (err) {
          console.error('Failed to load user data:', err);
        }
      } else {
        setSavedCharts([]);
        setSavedFolders([]);
        // Anonymous users still get the 5 starred default presets via
        // localStorage. seeded on first read, deletions/edits stick.
        try {
          setSavedPresets(loadAnonPresets());
        } catch {
          setSavedPresets([]);
        }
        setSavedStacks([]);
        setSavedProjects([]);
        setDefaultChartIdState(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = {
    user,
    loading,
    savedCharts,
    setSavedCharts,
    savedFolders,
    setSavedFolders,
    savedPresets,
    setSavedPresets,
    savedStacks,
    setSavedStacks,
    savedProjects,
    setSavedProjects,
    defaultChartId,
    setDefaultChartId: setDefaultChartIdState,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
