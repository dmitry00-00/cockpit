// Disposable D10 acceptance fixture: synthetic campaign state stays in memory and resets on reload.
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
  stack: { id: 'qa-bo-gp', itemId: 'coin:gp', qty: 200, owner: { kind: 'actor', id: 'bo' }, storage: { kind: 'actor', id: 'bo' } },
} });
store.getState().dispatch({ type: 'CAMPAIGN_STRESS_THEME_SET', payload: { enabled: true } });
store.getState().dispatch({ type: 'A5E_TRACK_SET', payload: { actorId: 'bo', track: 'strife', level: 2 } });

createRoot(document.getElementById('root')!).render(<div className="h-full flex flex-col">
  <p role="note" className="flex-none px-3 py-1 type-body-sm text-t2 bg-pn">Только память · тестовая партия · 200 gp и 2 Strife у Bo · перезагрузка сбрасывает все изменения</p>
  <div className="flex-1 min-h-0 flex"><Suspense fallback={<p>Открываю изолированную проверку…</p>}><DeskPage store={store} persist={persist} /></Suspense></div>
</div>);
