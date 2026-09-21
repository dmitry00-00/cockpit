import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Шрифты самохостятся: сессия живёт локально, без сети за столом.
import '@fontsource/forum/400.css';
import '@fontsource/pt-sans/400.css';
import '@fontsource/pt-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/press-start-2p/400.css';
import './styles/index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
