import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { ensureUserDoc, loadCharts, loadFolders, getDefaultChartId } from '../firebase/firestore';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savedCharts, setSavedCharts] = useState([]);
  const [savedFolders, setSavedFolders] = useState([]);
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
          // Load folders separately — collection may not exist yet
          try {
            const folders = await loadFolders(firebaseUser.uid);
            setSavedFolders(folders);
          } catch (folderErr) {
            console.warn('Folders not available yet:', folderErr);
            setSavedFolders([]);
          }
        } catch (err) {
          console.error('Failed to load user data:', err);
        }
      } else {
        setSavedCharts([]);
        setSavedFolders([]);
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
    defaultChartId,
    setDefaultChartId: setDefaultChartIdState,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
