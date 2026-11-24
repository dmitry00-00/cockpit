// Disposable six-person desk; no reads/writes of the owner's campaign.
import { createRoot } from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '../../../src/styles/index.css';
import { DeskPage } from '../../../src/pages/DeskPage';
import { seedEngine } from '../../../src/campaign';
import { memoryStore } from '../../../src/engine';
import { loadTexts } from '../../../src/rules/texts';
async function start() {
 await loadTexts();
 const persist=memoryStore();const store=seedEngine({persist});
 for(let n=5;n<=6;n++) { const actor=structuredClone(store.getState().state.actors.bo);store.getState().spawn({...actor,id:`qa-${n}`,name:`Участник ${n}`},true); }
 createRoot(document.getElementById('root')!).render(<div className="h-full flex flex-col"><p className="flex-none type-body-xs text-t2">Проверка ленты · шесть участников · только память</p><div className="flex flex-col flex-1 min-h-0"><DeskPage store={store} persist={persist}/></div></div>);
}
void start();
