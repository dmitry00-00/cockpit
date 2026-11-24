import {fireEvent,render,screen,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {seedState} from '../campaign';
import {WorkspaceHub} from './WorkspaceHub';
import {DRAFT_KEY,newPackageDraft,validateDraft} from './packageDraft';
vi.mock('./catalog',()=>({loadPackageCatalog:vi.fn().mockResolvedValue([{format:1,id:'dnd5e-2014',kind:'rules',title:'SRD',version:'5.1.0',distribution:'open',layers:[]}])}));
it('authors and restores a real local package and filters its audience preview',async()=>{
 localStorage.removeItem(DRAFT_KEY);const state=seedState();const before=JSON.stringify(state);
 const props={route:{context:'workshop' as const},state,onCharacter:vi.fn(),onImport:vi.fn()};
 const view=render(<WorkspaceHub {...props}/>);await screen.findByText('SRD · 5.1.0');
 fireEvent.click(screen.getByRole('button',{name:'Добавить запись'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Имя записи'}),{target:{value:'Secret room'}});
 fireEvent.change(screen.getByRole('textbox',{name:'Текст'}),{target:{value:'Secret passage'}});
 fireEvent.click(screen.getByRole('button',{name:'Внести в черновик'}));
 fireEvent.click(within(screen.getByRole('region',{name:'Авторский пакет'})).getByRole('button',{name:'Сохранить черновик'}));
 expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).records[0].name).toBe('Secret room');
 fireEvent.click(screen.getByRole('button',{name:'Предпросмотр игроков'}));
 expect(within(screen.getByRole('region',{name:'Предпросмотр аудитории'})).queryByText('Secret passage')).toBeNull();
 expect(JSON.stringify(state)).toBe(before);view.unmount();render(<WorkspaceHub {...props}/>);
 await screen.findByRole('button',{name:'Править Secret room'});
 localStorage.removeItem(DRAFT_KEY);
});

it('carries BA23 plan refs through an inert scene draft, save, audience preview and reload cancellation',async()=>{
 localStorage.removeItem(DRAFT_KEY);
 const synthetic=newPackageDraft();
 synthetic.templates=[
  {id:'synthetic-scene',kind:'scene',template:{id:'scene',version:'1.0.0'},name:'Synthetic scene',summary:'Synthetic authoring scene',audience:'dm',provenance:[{kind:'author',ref:'u10-test'}],links:[],data:{trigger:'A synthetic scene trigger; no player action occurred.'}},
  {id:'synthetic-event',kind:'event',template:{id:'event',version:'1.0.0'},name:'Synthetic event',summary:'Chronology draft statement',audience:'dm',provenance:[{kind:'author',ref:'u10-test'}],links:[{relation:'after-scene',target:'synthetic-scene'}],data:{statement:'Synthetic event statement, not a campaign fact.',time:{kind:'unknown'}}},
 ];
 const initial=validateDraft(synthetic,[]);
 localStorage.setItem(DRAFT_KEY,JSON.stringify(initial));
 const savedCampaign=seedState();const before=JSON.stringify(savedCampaign);
 const props={route:{context:'workshop' as const},state:savedCampaign,onCharacter:vi.fn(),onImport:vi.fn()};
 let view=render(<WorkspaceHub {...props}/>);await screen.findByText('SRD · 5.1.0');
 const pilot=screen.getByRole('region',{name:'Авторская вертикаль Фанделвера'});
 const recap='Черновая связка «Засада на дороге» и «Сдача припасов»; исход пока не установлен.';
 fireEvent.change(within(pilot).getByRole('textbox',{name:'Короткий авторский пересказ'}),{target:{value:recap}});
 const mapReview=within(pilot).queryByRole('checkbox',{name:/сохранить все эти точные ссылки карты/});if(mapReview)fireEvent.click(mapReview);
 const textReview=within(pilot).queryByRole('checkbox',{name:/сохранить все эти точные ссылки пересказа/});if(textReview)fireEvent.click(textReview);
 fireEvent.click(within(pilot).getByRole('button',{name:'Внести ссылки и пересказ в черновик'}));
 const unsavedBeforeSave=localStorage.getItem(DRAFT_KEY)!;
 expect(JSON.parse(unsavedBeforeSave).records.some((record:{id:string})=>record.id==='phandelver-opening-summary')).toBe(false);

 const preview=screen.getByRole('region',{name:'Предпросмотр аудитории'});
 fireEvent.click(within(preview).getByRole('button',{name:'Предпросмотр мастера'}));
 expect(within(preview).getByText(recap)).toBeTruthy();
 expect(within(preview).getByText('Synthetic event statement, not a campaign fact.')).toBeTruthy();
 expect(within(preview).getByText(/lmop-ru-phantom-2015-local@0\.4\.0 · ambush$/)).toBeTruthy();
 fireEvent.click(within(preview).getByRole('button',{name:'Предпросмотр игроков'}));
 expect(within(preview).queryByText(recap)).toBeNull();
 expect(within(preview).queryByText('Synthetic event statement, not a campaign fact.')).toBeNull();
 expect(within(preview).queryByText(/lmop-ru-phantom-2015-local@0\.4\.0 · ambush$/)).toBeNull();

 fireEvent.click(within(screen.getByRole('region',{name:'Авторский пакет'})).getByRole('button',{name:'Сохранить черновик'}));
 const savedRaw=localStorage.getItem(DRAFT_KEY)!;const saved=JSON.parse(savedRaw);
 const pilotRecord=saved.records.find((record:{id:string})=>record.id==='phandelver-opening-summary');
 expect(pilotRecord.kind).toBe('scene');expect(pilotRecord.text).toBe(recap);
 expect(pilotRecord.references.map((reference:{nodeId:string})=>reference.nodeId)).toEqual(expect.arrayContaining(['town-plan','hideout-plan','arrival','delivery-thread','ambush','trail','goblin-route','cragmaw-hideout','supply-route']));
 expect(saved.templates.find((template:{id:string})=>template.id==='synthetic-event').data.statement).toBe('Synthetic event statement, not a campaign fact.');
 expect(JSON.stringify(savedCampaign)).toBe(before);

 view.unmount();view=render(<WorkspaceHub {...props}/>);await screen.findByText('SRD · 5.1.0');
 const reloadedPilot=screen.getByRole('region',{name:'Авторская вертикаль Фанделвера'});
 const reloadedRecap=await within(reloadedPilot).findByDisplayValue(recap) as HTMLTextAreaElement;
 expect(reloadedRecap.value).toBe(recap);
 expect(screen.getByText('Synthetic event statement, not a campaign fact.')).toBeTruthy();
 const cancel=within(screen.getByRole('region',{name:'Авторский пакет'})).getByRole('button',{name:'Отменить несохранённые изменения'});
 fireEvent.change(reloadedRecap,{target:{value:'Несохранённая отменяемая редакция «Засада на дороге» без исхода.'}});
 const changedMapReview=within(reloadedPilot).queryByRole('checkbox',{name:/сохранить все эти точные ссылки карты/});if(changedMapReview)fireEvent.click(changedMapReview);
 const changedTextReview=within(reloadedPilot).queryByRole('checkbox',{name:/сохранить все эти точные ссылки пересказа/});if(changedTextReview)fireEvent.click(changedTextReview);
 fireEvent.click(within(reloadedPilot).getByRole('button',{name:'Внести ссылки и пересказ в черновик'}));
 expect(localStorage.getItem(DRAFT_KEY)).toBe(savedRaw);
 fireEvent.click(cancel);
 expect(await within(reloadedPilot).findByDisplayValue(recap)).toBeTruthy();
 expect(localStorage.getItem(DRAFT_KEY)).toBe(savedRaw);
 expect(cancel).toBeDisabled();

 fireEvent.change(within(reloadedPilot).getByRole('textbox',{name:'Короткий авторский пересказ'}),{target:{value:'Отложенная несохранённая редакция «Засада на дороге» без исхода.'}});
 const lastMapReview=within(reloadedPilot).queryByRole('checkbox',{name:/сохранить все эти точные ссылки карты/});if(lastMapReview)fireEvent.click(lastMapReview);
 const lastTextReview=within(reloadedPilot).queryByRole('checkbox',{name:/сохранить все эти точные ссылки пересказа/});if(lastTextReview)fireEvent.click(lastTextReview);
 fireEvent.click(within(reloadedPilot).getByRole('button',{name:'Внести ссылки и пересказ в черновик'}));
 expect(localStorage.getItem(DRAFT_KEY)).toBe(savedRaw);
 view.unmount();view=render(<WorkspaceHub {...props}/>);await screen.findByText('SRD · 5.1.0');
 const afterCancel=await screen.findByDisplayValue(recap) as HTMLTextAreaElement;
 expect(afterCancel.value).toBe(recap);
 expect(screen.getByText('Synthetic event statement, not a campaign fact.')).toBeTruthy();
 expect(JSON.stringify(savedCampaign)).toBe(before);
 view.unmount();localStorage.removeItem(DRAFT_KEY);
});

it('creates empty-unknown rumor, terrain and event templates, validates relative dates and reloads the saved draft',async()=>{
 localStorage.removeItem(DRAFT_KEY);const state=seedState();const before=JSON.stringify(state);
 const props={route:{context:'workshop' as const},state,onCharacter:vi.fn(),onImport:vi.fn()};
 let view=render(<WorkspaceHub {...props}/>);await screen.findByText('SRD · 5.1.0');
 const section=screen.getByRole('region',{name:'Авторский пакет'});
 const create=async(kind:string,name:string)=>{
  fireEvent.change(within(section).getByRole('combobox',{name:'Тип нового шаблона'}),{target:{value:kind}});
  fireEvent.click(within(section).getByRole('button',{name:'Создать шаблон'}));
  const editor=within(section).getByRole('form',{name:'Шаблон авторского пакета'});
  fireEvent.change(within(editor).getByRole('textbox',{name:'Название'}),{target:{value:name}});
  fireEvent.change(within(editor).getByRole('textbox',{name:'Краткое описание'}),{target:{value:`${name} — авторская заготовка; сведения пока неизвестны.`}});
  return editor;
 };
 await create('rumor','Unverified rumor');
 fireEvent.click(within(section).getByRole('button',{name:'Внести шаблон в черновик'}));
 await create('terrain','Unspecified terrain');
 fireEvent.click(within(section).getByRole('button',{name:'Внести шаблон в черновик'}));
 const eventEditor=await create('event','Unresolved chronology');
 fireEvent.change(within(eventEditor).getByRole('combobox',{name:'Сведения о времени'}),{target:{value:'relative'}});
 fireEvent.change(within(eventEditor).getByPlaceholderText('Оставьте пустым, если якорь пока неизвестен'),{target:{value:'missing-event'}});
 fireEvent.click(within(eventEditor).getByRole('button',{name:'Внести шаблон в черновик'}));
 expect(within(section).getByText(/относительная дата ссылается на неизвестное событие или сцену/)).toBeInTheDocument();
 expect(JSON.parse(localStorage.getItem(DRAFT_KEY)??'null')).toBeNull();
 fireEvent.change(within(eventEditor).getByRole('combobox',{name:'Сведения о времени'}),{target:{value:'unknown'}});
 fireEvent.click(within(eventEditor).getByRole('button',{name:'Внести шаблон в черновик'}));

 fireEvent.click(within(section).getByRole('button',{name:'Сохранить черновик'}));
 const savedRaw=localStorage.getItem(DRAFT_KEY)!;const saved=JSON.parse(savedRaw);
 expect(saved.templates.map((template:{kind:string})=>template.kind)).toEqual(expect.arrayContaining(['rumor','terrain','event']));
 expect(saved.templates.every((template:{template:{version:string};provenance:unknown[];audience:string})=>template.template.version==='1.0.0'&&template.provenance.length>0&&['dm','players'].includes(template.audience))).toBe(true);
 expect(saved.templates.find((template:{kind:string})=>template.kind==='terrain').data).toEqual({});
 expect(saved.templates.find((template:{kind:string})=>template.kind==='event').data).toEqual({time:{kind:'unknown'}});
 expect(JSON.stringify(state)).toBe(before);

 view.unmount();view=render(<WorkspaceHub {...props}/>);await screen.findByText('SRD · 5.1.0');
 expect(await screen.findByRole('button',{name:'Править шаблон Unverified rumor'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Править шаблон Unspecified terrain'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Править шаблон Unresolved chronology'})).toBeInTheDocument();
 expect(localStorage.getItem(DRAFT_KEY)).toBe(savedRaw);expect(JSON.stringify(state)).toBe(before);
 view.unmount();localStorage.removeItem(DRAFT_KEY);
});
