// Disposable map-layer QA campaign; the synthetic active front never reaches localStorage.
import { createRoot } from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '../../../src/styles/index.css';
import { DeskPage } from '../../../src/pages/DeskPage';
import { seedState } from '../../../src/campaign/seed';
import type { Process } from '../../../src/engine/state';
import { memoryStore } from '../../../src/engine/persist';
import { createEngineStore } from '../../../src/engine/store';

const state = structuredClone(seedState());
const process: Process = {
  id: 'qa-active-war-front',
  kind: 'war',
  name: 'Учебный фронт у Neverwinter',
  scale: 'continent',
  stage: 'campaign',
  parties: ['kingdom:cormyr', 'kingdom:luskan'],
  startedSec: state.time.sec,
  nextSec: state.time.sec + 1,
  vars: {},
  data: { kind: 'war', version: 1, front: { map: 'toril', nodes: [
    { id: 'loc-neverwinter', name: 'Neverwinter', x: 8522, y: 2610 },
    { id: 'qa-front-camp', name: 'Лагерь фронта · QA', x: 8830, y: 2740 },
  ] } },
};
state.world.processes = { ...(state.world.processes ?? {}), [process.id]: process };
const persist = memoryStore();
const store = createEngineStore(state, { persist });

createRoot(document.getElementById('root')!).render(<div className="h-full flex flex-col">
  <p role="note" className="flex-none px-3 py-1 type-body-sm text-t2 bg-pn">Тестовая кампания · синтетический фронт · только память · перезагрузка сбрасывает данные</p>
  <div className="flex-1 min-h-0 flex"><DeskPage store={store} persist={persist} /></div>
</div>);
