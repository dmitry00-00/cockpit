import {createRoot} from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '../../../src/styles/index.css';
import {App} from '../../../src/App';
import {DeskPage} from '../../../src/pages/DeskPage';
import {seedEngine, seedState} from '../../../src/campaign';
import {memoryStore} from '../../../src/engine';
import {createEngineStore} from '../../../src/engine';
import {loadTexts} from '../../../src/rules/texts';
const persist=memoryStore();
const fixture=new URLSearchParams(location.search).get('fixture');
const surface=new URLSearchParams(location.search).get('surface');
const partyPanelFixture=surface==='party-panel';
const kenseiFixture=fixture==='kensei';
const notebookFixture=fixture==='notebook';
const initial=seedState();
if(kenseiFixture){
 const actor=initial.actors.korrin;
 initial.actors.korrin={...actor,sheet:{...actor.sheet!,classId:'monah',level:2,subclassId:undefined,choices:[]}};
}
if(notebookFixture){
 initial.knowledge={
  'place:neverwinter':{
   ref:'place:neverwinter',
   name:'Neverwinter',
   facts:[{label:'Запись QA',value:'Синтетический пример; не факт кампании',sec:initial.time.sec,by:'korrin',check:{skill:'history',dc:15,total:17}}],
  },
 };
}
const store=kenseiFixture||notebookFixture?createEngineStore(initial,{persist}):seedEngine({persist});
void loadTexts().then(()=>createRoot(document.getElementById('root')!).render(
 partyPanelFixture
  ? <div className="app-shell fixed inset-0 min-h-0 flex flex-col overflow-hidden"><DeskPage store={store} persist={persist} cardFace="sheet"/></div>
  : <App store={store} persist={persist}/>,
));
