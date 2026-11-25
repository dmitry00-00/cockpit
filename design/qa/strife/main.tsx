// Memory-only QA fixture for A5E Strife and Mental Stress; never opens or writes a saved campaign.
import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '@fontsource/ibm-plex-mono';
import '../../../src/styles/index.css';
import { DeskPage } from '../../../src/pages/DeskPage';
import { seedEngine } from '../../../src/campaign/seed';
import { memoryStore } from '../../../src/engine/persist';

const store = seedEngine({ persist: memoryStore() });
const untilSec = store.getState().state.time.sec + 86_400;
store.getState().dispatch({ type: 'CAMPAIGN_STRESS_THEME_SET', payload: { enabled: true } });
store.getState().dispatch({ type: 'A5E_TRACK_SET', payload: {
  actorId: 'bo', track: 'strife', level: 5, stressEffect: { kind: 'short', id: 'flippant', untilSec },
} });
createRoot(document.getElementById('root')!).render(<Suspense fallback={<p>Открываю изолированную проверку…</p>}><DeskPage store={store} persist={memoryStore()} /></Suspense>);
