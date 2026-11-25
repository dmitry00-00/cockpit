// Disposable QA campaign: explicit test market stocks, no user's campaign/localStorage.
import { createRoot } from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '../../../src/styles/index.css';
import { DeskPage } from '../../../src/pages/DeskPage';
import { seedState } from '../../../src/campaign/seed';
import { LOCATION } from '../../../src/campaign/world';
import { placeLocation } from '../../../src/campaign/worldGraph';
import { loadGazetteer } from '../../../src/map/gazetteer';
import { loadTexts } from '../../../src/rules/texts';
import { memoryStore } from '../../../src/engine/persist';
import { createEngineStore } from '../../../src/engine/store';

async function start() {
  await loadTexts();
  const state = structuredClone(seedState());
  const places = await loadGazetteer('toril');
  const place = places.find(p => p.name === 'Waterdeep');
  if (!place) throw new Error('Для QA нужен Waterdeep из справочника Toril');
  const origin = placeLocation(state, place, 'toril').location;
  state.world.locations[origin.id] = { ...origin, stock: { cloth: 5 } };
  state.world.locations[LOCATION.neverwinter] = { ...state.world.locations[LOCATION.neverwinter], stock: { cloth: 2 } };
  const persist = memoryStore();
  const store = createEngineStore(state, { persist });
  createRoot(document.getElementById('root')!).render(<div className="h-full flex flex-col">
    <p role="note" className="flex-none px-3 py-1 type-body-sm text-t2 bg-pn">Тестовая кампания · данные только в памяти · перезагрузка сбрасывает проверку</p>
    <div className="flex-1 min-h-0"><DeskPage store={store} persist={persist} /></div>
  </div>);
}
void start().catch(e => { document.getElementById('root')!.textContent = String(e); });
