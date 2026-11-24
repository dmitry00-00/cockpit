// Memory-only QA fixture for D12 canonical NPC gifts; never opens or writes a saved campaign.
import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '@fontsource/ibm-plex-mono';
import '../../../src/styles/index.css';
import { DeskPage } from '../../../src/pages/DeskPage';
import { seedEngine } from '../../../src/campaign/seed';
import { memoryStore } from '../../../src/engine/persist';

const persist = memoryStore();
const store = seedEngine({ persist });
store.getState().dispatch({ type: 'ITEM_GAINED', payload: {
  stack: { id: 'qa-arrows-for-gift', itemId: 'arrow', qty: 5, owner: { kind: 'actor', id: 'bo' }, storage: { kind: 'actor', id: 'bo' } },
} });
createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<p>Открываю изолированную проверку…</p>}><DeskPage store={store} persist={memoryStore()} /></Suspense>,
);
