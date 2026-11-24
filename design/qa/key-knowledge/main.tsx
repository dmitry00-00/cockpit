// Memory-only QA fixture for A5E Key Knowledge; never opens or writes a saved campaign.
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
store.getState().dispatch({
  type: 'A5E_KEY_KNOWLEDGE_EARNED',
  payload: { actorId: 'bo', subjectRef: 'actor:korrin', subjectName: 'Korrin Battlehammer', amount: 1, source: 'a5e-srd:adventuring-8' },
});
createRoot(document.getElementById('root')!).render(<Suspense fallback={<p>Открываю изолированную проверку…</p>}><DeskPage store={store} persist={memoryStore()} /></Suspense>);
