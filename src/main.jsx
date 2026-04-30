import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ColorProvider } from './contexts/ColorContext';
import './index.css';
import App from './App.jsx';

// When a new service worker takes control of this tab (after a deploy),
// reload once so the page actually renders the new bundle. Otherwise the
// user sees old code until they manually refresh a second time.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let reloading = false;
  // If the tab loaded with no controller, the first controllerchange is the
  // initial install — don't reload then.
  let hadInitialController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadInitialController) {
      hadInitialController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ColorProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ColorProvider>
    </ThemeProvider>
  </StrictMode>
);
