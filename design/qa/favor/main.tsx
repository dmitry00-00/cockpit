// Memory-only QA fixture for spending A5E favor; it never opens or writes a saved campaign.
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
  type: 'A5E_FAVOR_EARNED',
  payload: {
    actorId: 'aldric', deityRef: 'deity:lathander', deityName: 'Lathander',
    similarity: 'strongly-aligned', skill: 'religion', checkTotal: 15, amount: 2,
    source: 'a5e-srd:adventuring-8',
  },
});
createRoot(document.getElementById('root')!).render(<Suspense fallback={<p>Открываю изолированную проверку…</p>}><DeskPage store={store} persist={memoryStore()} /></Suspense>);
