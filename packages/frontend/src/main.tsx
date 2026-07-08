import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { useThemeStore } from './store/theme';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Apply any cached theme overrides synchronously, before first paint — avoids
// a flash of the default palette while the authenticated GET /api/theme
// (fired from AppShell, after login) is still in flight.
useThemeStore.getState().loadCache();

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
