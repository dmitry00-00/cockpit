import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Шрифты самохостятся: сессия живёт локально, без сети за столом.
import '@fontsource/forum/400.css';
import '@fontsource/pt-sans/400.css';
import '@fontsource/pt-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/index.css';
import { App } from './App';
import { loadTexts } from './rules/texts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
// Тексты справочников — после первой отрисовки (ROADMAP 0.5): стол уже виден, App перерисуется по загрузке.
void loadTexts();
// Each lazy surface loads when rendered. Do not fetch the editor, cosmos and full
// character UI before the owner opens them merely to make the entry chunk smaller.
