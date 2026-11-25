// Read-only QA origin: six real cards, memory-only engine, no user campaign/localStorage.
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
for (const [source, id, name] of [['bo', 'qa-five', 'Пятый участник'], ['korrin', 'qa-six', 'Шестой участник']]) {
  store.getState().spawn({ ...structuredClone(store.getState().state.actors[source]), id, name }, true);
}
createRoot(document.getElementById('root')!).render(<Suspense fallback={<p>Открываю контрольную партию…</p>}><DeskPage store={store} persist={memoryStore()} /></Suspense>);
