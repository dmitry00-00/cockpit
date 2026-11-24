/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/forum/400.css';
import '@fontsource/pt-sans/400.css';
import './styles/index.css';
import { PlayerConnection } from './player/PlayerConnection';

// Deliberately separate entry: no master App, seed, log, projector or preloadParts.
createRoot(document.getElementById('root')!).render(<StrictMode><PlayerConnection /></StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/player/sw.js', { scope: '/player/' }).catch(() => {});
}
