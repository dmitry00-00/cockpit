import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { State } from '../engine';
import type { ProductRoute } from '../routes';
import type { PackageManifest } from '../packages/manifest';
import { parseAdventureBundle } from '../packages/adventure';
import { DEFAULT_SETTING_PACKAGE } from '../packages/settings';
import { BUILT_IN_CAMPAIGNS } from '../packages/campaigns';
import { campaignPlanScope } from '../campaign/planScope';
import { CompendiumPage, RulesPage, TokensPage } from '../lazyParts';
import { ArtImage } from '../art/ArtImage';
import type { ArtId } from '../art/registry.generated';
import { FIRST_PACK_ITEM_ART, FIRST_PACK_NODE_ART } from '../art/firstPackArtwork';
import firstVerticalData from '../../research/content-phandelver/first-vertical.json';
import { loadPackageCatalog } from './catalog';
import { SessionScoreEditor } from './SessionScoreEditor';
import type { SessionScoreCatalogEntry } from './sessionScore';
import { authoredTemplatePreview, authorPreview, AUTHOR_TEMPLATE_KINDS, DRAFT_KEY, newPackageDraft, validateDraft, type AuthoredRecord, type AuthoredTemplate, type AuthorTemplateKind, type PackageDraft } from './packageDraft';
import { PhandelverAuthoringPilot } from './PhandelverAuthoringPilot';
import { AuthoredTemplateEditor, newAuthoredTemplate } from './AuthoredTemplateEditor';
import { downloadText } from '../pages/desk/session';
import { BTN } from '../pages/desk/styles';
const KIND_LABEL={place:'Место',person:'Персонаж',scene:'Сцена',fact:'Сведение'} as const;
const TEMPLATE_KIND_LABEL: Record<AuthorTemplateKind,string>={location:'Место',person:'Персонаж',path:'Путь',terrain:'Местность',event:'Хронология',rumor:'Слух',scene:'Сцена'};
const DIST_LABEL={open:'Открытое',table:'Личный стол',internal:'Внутреннее использование'} as const;
const PACKAGE_KIND_LABEL={rules:'Правила',setting:'Сеттинг',shared:'Общий пакет',campaign:'Кампания'} as const;
const FIELD='w-full min-w-0 bg-wl shadow-bevel-in text-tx type-body-sm px-2 py-1';
function authoredTemplateText(template:{kind:string;data:unknown}):string|undefined {
 const data=template.data as {statement?:string;claim?:string;trigger?:string;procedure?:string;topology?:{fromId:string;viaIds:string[];toId:string};category?:string;role?:string;biome?:string;landform?:string;surface?:string};
 if(template.kind==='event')return data.statement;
 if(template.kind==='rumor')return data.claim;
 if(template.kind==='scene')return [data.trigger,data.procedure].filter(Boolean).join('\n')||undefined;
 if(template.kind==='path'&&data.topology)return `${data.topology.fromId} → ${[...data.topology.viaIds,data.topology.toId].join(' → ')}`;
 if(template.kind==='location')return data.category;
 if(template.kind==='person')return data.role;
 return [data.biome,data.landform,data.surface].filter(Boolean).join(' · ')||undefined;
}
const AdventurePreview=lazy(()=>import('../components/AdventurePreview').then(m=>({default:m.AdventurePreview})));
const ArtSheet=lazy(()=>import('../art/ArtSheet'));
const FIRST_VERTICAL=parseAdventureBundle(firstVerticalData);
const FIRST_VERTICAL_LINK_COUNT=FIRST_VERTICAL.nodes.reduce((sum,node)=>sum+node.links.length,0);
function packageDependencyLabel(id:string,catalog:readonly PackageManifest[]) {
 const dependency=catalog.find(packageManifest=>packageManifest.id===id);
 return dependency?`${dependency.titleRu??dependency.title} (${dependency.id}@${dependency.version})`:`${id} · пакет не найден`;
}
const FIRST_VERTICAL_ART:{asset:ArtId;label:string}[]=[
 {asset:FIRST_PACK_NODE_ART.gundren,label:'Портрет · Gundren'},
 {asset:FIRST_PACK_NODE_ART.goblin,label:'Противник · Goblin'},
 {asset:FIRST_PACK_NODE_ART.ambush,label:'Сцена · засада'},
 {asset:FIRST_PACK_ITEM_ART.longbow,label:'Предмет · Longbow'},
];

export function WorkspaceHub({route,state,onCharacter,onImport,onStrifeThemeChange,onNewCampaign,onExport,campaignScope}:{route:ProductRoute;state:State;onCharacter:()=>void;onImport:(file:File)=>Promise<void>;onStrifeThemeChange?:(enabled:boolean)=>void;onNewCampaign?:(settingPackageId:string,campaignPackageId?:string)=>void;onExport?:()=>void;campaignScope?:string}) {
 const [catalog,setCatalog]=useState<PackageManifest[]>([]),[error,setError]=useState('');
 const [draft,setDraft]=useState<PackageDraft>(newPackageDraft),[savedDraft,setSavedDraft]=useState<PackageDraft>(newPackageDraft),[loaded,setLoaded]=useState(false),[status,setStatus]=useState('');
 const [query,setQuery]=useState(''),[audience,setAudience]=useState<'dm'|'players'>('dm');
 const [edited,setEdited]=useState<AuthoredRecord|null>(null);
 const [editedTemplate,setEditedTemplate]=useState<{originalId:string|null;value:AuthoredTemplate}|null>(null);
 const [newTemplateKind,setNewTemplateKind]=useState<AuthorTemplateKind>('location');
 const [adventurePreviewOpen,setAdventurePreviewOpen]=useState(false);
 const [campaignToStart,setCampaignToStart]=useState<string|null>(null);
 const [campaignStartError,setCampaignStartError]=useState('');
 const file=useRef<HTMLInputElement>(null);
 useEffect(()=>{let live=true;loadPackageCatalog().then(p=>{if(!live)return;setCatalog(p);let initial=newPackageDraft();try{const saved=localStorage.getItem(DRAFT_KEY);if(saved)initial=validateDraft(JSON.parse(saved),p);}catch{setStatus('Сохранённый черновик не прочитан. Открыт новый; существующий файл не перезаписан.');}setDraft(initial);setSavedDraft(initial);setLoaded(true);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[]);
 const save=()=>{try{const checked=validateDraft(draft,catalog);localStorage.setItem(DRAFT_KEY,JSON.stringify(checked));setDraft(checked);setSavedDraft(checked);setStatus('Черновик сохранён в этом браузере. Кампания не менялась.');}catch(e){setStatus(e instanceof Error?e.message:String(e));}};
 const cancelDraft=()=>{setDraft(savedDraft);setEdited(null);setStatus('Несохранённые изменения отменены. Восстановлен последний сохранённый черновик; кампания не менялась.');};
 const exportDraft=()=>{try{const checked=validateDraft(draft,catalog);downloadText(`${checked.manifest.id}-${checked.manifest.version}.json`,JSON.stringify(checked,null,2));setStatus('Локальный пакет подготовлен. Его записи ещё не активированы в кампании.');}catch(e){setStatus(String(e));}};
 const openDraft=async(f:File)=>{try{if(f.size>5_000_000)throw Error('Файл больше 5 МБ');const checked=validateDraft(JSON.parse(await f.text()),catalog);setDraft(checked);setEdited(null);setStatus('Пакет открыт как черновик. Кампания не менялась.');}catch(e){setStatus(String(e));}};
 const patchManifest=(patch:Partial<PackageManifest>)=>setDraft(d=>({...d,manifest:{...d.manifest,...patch}}));
 const imported=Object.values(state.world.importedContent ?? {});
 const settingPackageId=state.settingPackageId??DEFAULT_SETTING_PACKAGE;
 const resolvedCampaignScope=campaignScope??campaignPlanScope();
 const activeParty=state.party.map(id=>state.actors[id]).filter(actor=>!!actor&&!actor.removed).map(actor=>({id:actor.id,name:actor.name}));
 const panel=route.context;
 const libraryTab=useRef(route.library);
 if(route.context==='library')libraryTab.current=route.library;
 const tab=libraryTab.current;
 return <section className="flex-1 min-h-0 min-w-0 overflow-auto p-4 flex flex-col gap-4 bg-pn" aria-label={panel==='workshop'?'Мастерская':'Библиотека'}>
  <header><h1 className="type-h-28 text-gd-hi">{panel==='workshop'?'Мастерская':'Библиотека'}</h1><p className="type-body-sm text-t2">{panel==='workshop'?'Подготовка материала для текущей кампании и собственного пакета.':'Встроенные пакеты, источники правил, графика и принятый каталог текущей кампании.'}</p></header>
  {error?<p role="alert">Каталог недоступен: {error}</p>:null}
  <div hidden={panel!=='workshop'} className="space-y-3">
   <div className="flex flex-wrap gap-2"><button className={BTN} onClick={onCharacter}>Создать персонажа</button><label className={BTN}>Импортировать материал<input aria-label="Импортировать материал в кампанию" type="file" className="sr-only" accept=".json,.dd2vtt,.rptok,.rpmap,.cmpgn" onChange={e=>{const f=e.target.files?.[0];if(f)void onImport(f);e.target.value='';}}/></label><a className={BTN} href="#/library">Посмотреть библиотеку</a></div>
   <p className="type-body-xs text-t2">Персонаж добавляется после подтверждения редактора. Импорт поступает во входящие; принятие записи каталога отдельно от активации на столе.</p>
   <section className="bg-cd shadow-bevel p-3 flex flex-col gap-3" aria-label="Реальный пакет приключения">
    <header className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="type-h-20 text-tx">Пакет приключения · {FIRST_VERTICAL.title}</h2><p className="type-body-sm text-t2">{FIRST_VERTICAL.id} · версия {FIRST_VERTICAL.version} · {DIST_LABEL[FIRST_VERTICAL.distribution]} · {FIRST_VERTICAL.nodes.length} записей · {FIRST_VERTICAL_LINK_COUNT} связей</p></div><a className={BTN} href="#/library/graphics">Графический каталог</a></header>
    <p className="type-body-sm">Пакеты, на которые ссылается граф (текущие установленные версии): {catalog.length?[FIRST_VERTICAL.setting,...FIRST_VERTICAL.rules].map(id=>packageDependencyLabel(id,catalog)).join(' · '):'загружаются…'}. Это связная выборка частей 1–4, не полный импорт приключения.</p>
    <p className="type-body-xs text-t2">Источник: Lost Mine of Phandelver RUS · PHantom Studio (2015), личный стол. Книга не копируется; пакет не предназначен для публикации или продажи. Просмотр и наличие графики не активируют места, сцены или персонажей кампании.</p>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3" aria-label="Графика, явно связанная с пакетом">
     {FIRST_VERTICAL_ART.map(sample=><figure key={sample.label} className="bg-wl shadow-bevel-in p-2 flex flex-col gap-2 min-w-0"><ArtImage asset={sample.asset} alt={sample.label} width={128} sizes="(max-width: 640px) 40vw, 128px" className="max-h-32 object-contain"/><figcaption className="type-body-xs text-t2">{sample.label}</figcaption></figure>)}
    </div>
    <details aria-label="Предпросмотр пакета Фанделвер" onToggle={event=>setAdventurePreviewOpen(event.currentTarget.open)}>
     <summary className="cursor-pointer type-body-sm text-gd-hi">Предпросмотр реальных записей и привязанной графики</summary>
     {adventurePreviewOpen?<Suspense fallback={<p role="status" className="type-body-sm text-t2">Загружаю пакет приключения…</p>}><AdventurePreview data={firstVerticalData}/></Suspense>:null}
    </details>
   </section>
   {loaded ? <SessionScoreEditor bundle={FIRST_VERTICAL}
    campaign={{scope:resolvedCampaignScope,settingPackageId,partyActorIds:activeParty.map(actor=>actor.id)}}
    party={activeParty} catalog={catalog as SessionScoreCatalogEntry[]} /> : <p role="status" className="type-body-xs text-t2">Загружаются версии пакетов для партитуры…</p>}
   <PhandelverAuthoringPilot bundle={FIRST_VERTICAL} draft={draft} installedPackages={catalog} onDraftChange={setDraft}/>
   <section className="bg-cd shadow-bevel p-3 flex flex-col gap-3" aria-label="Авторский пакет">
    <div><h2 className="type-h-20 text-tx">Авторский пакет · черновик</h2><p className="type-body-xs text-t2">Версия {draft.manifest.version} · {draft.manifest.id} · {DIST_LABEL[draft.manifest.distribution]} · {draft.records.length} текстовых записей и {draft.templates?.length??0} шаблонов. Редактирование меняет только черновик до отдельного импорта.</p></div>
    <div className="grid min-[800px]:grid-cols-3 gap-3">
     <label className="type-body-sm">Название<input className={FIELD} value={draft.manifest.title} onChange={e=>patchManifest({title:e.target.value})}/></label>
     <label className="type-body-sm">ID пакета<input className={FIELD} value={draft.manifest.id} onChange={e=>patchManifest({id:e.target.value})}/></label>
     <label className="type-body-sm">Версия<input className={FIELD} value={draft.manifest.version} onChange={e=>patchManifest({version:e.target.value})}/></label>
    </div>
    <fieldset><legend className="type-body-sm">Зависимости · точные версии</legend><div className="flex flex-wrap gap-3">{catalog.map(p=><label key={p.id} className="type-body-sm"><input type="checkbox" checked={draft.manifest.requires?.some(r=>r.id===p.id)??false} onChange={e=>patchManifest({requires:e.target.checked?[...(draft.manifest.requires??[]),{id:p.id,version:p.version}]:(draft.manifest.requires??[]).filter(r=>r.id!==p.id)})}/>{p.titleRu??p.title} · {p.version}</label>)}</div></fieldset>
    <div className="flex flex-wrap gap-2"><button disabled={!loaded} className={BTN} onClick={save}>Сохранить черновик</button><button disabled={!loaded||draft===savedDraft} className={BTN} onClick={cancelDraft}>Отменить несохранённые изменения</button><button disabled={!loaded} className={BTN} onClick={exportDraft}>Скачать локальный пакет</button><button disabled={!loaded} className={BTN} onClick={()=>file.current?.click()}>Открыть пакет</button><input ref={file} className="hidden" type="file" aria-label="Открыть авторский пакет" accept=".json" onChange={e=>{const f=e.target.files?.[0];if(f)void openDraft(f);e.target.value='';}}/></div>
    <p className="type-body-xs text-t2">Для личного стола · {draft.manifest.layers[0]?.license}. Собственные тексты; исходные книги и импортированные чужие материалы сюда автоматически не копируются.</p>
    {status?<p role="status" className="type-body-sm text-gd-hi">{status}</p>:null}
    <h3 className="type-h-17">Состав и изменения автора</h3>
    <ul className="flex flex-col gap-2">{draft.records.map(r=><li key={r.id} className="flex flex-wrap gap-2 type-body-sm"><span>{r.name} · {KIND_LABEL[r.kind]} · {r.audience==='dm'?'мастеру':'игрокам'}</span><button className={BTN} onClick={()=>setEdited({...r})}>Править {r.name}</button><button className={BTN} onClick={()=>setDraft(d=>({...d,records:d.records.filter(x=>x.id!==r.id)}))}>Убрать {r.name}</button></li>)}</ul>
    <button className={BTN} onClick={()=>setEdited({id:crypto.randomUUID(),kind:'scene',name:'',text:'',audience:'dm',source:'Авторский материал'})}>Добавить запись</button>
    {edited?<form className="grid gap-2 bg-wl p-3" aria-label="Запись пакета" onSubmit={e=>{e.preventDefault();try{const next={...draft,records:[...draft.records.filter(r=>r.id!==edited.id),edited]};validateDraft(next,catalog);setDraft(next);setEdited(null);setStatus('Изменения внесены в черновик; сохраните его.');}catch(err){setStatus(String(err));}}}>
     <label>Имя записи<input required className={FIELD} value={edited.name} onChange={e=>setEdited({...edited,name:e.target.value})}/></label>
     <label>Тип<select className={FIELD} value={edited.kind} onChange={e=>setEdited({...edited,kind:e.target.value as AuthoredRecord['kind']})}>{['place','person','scene','fact'].map(k=><option key={k} value={k}>{KIND_LABEL[k as keyof typeof KIND_LABEL]}</option>)}</select></label>
     <label>Текст<textarea required className={FIELD} rows={5} value={edited.text} onChange={e=>setEdited({...edited,text:e.target.value})}/></label>
     <label>Источник<input required className={FIELD} value={edited.source} onChange={e=>setEdited({...edited,source:e.target.value})}/></label>
     <label>Аудитория<select className={FIELD} value={edited.audience} onChange={e=>setEdited({...edited,audience:e.target.value as 'dm'|'players'})}><option value="dm">Только мастеру</option><option value="players">Игрокам</option></select></label>
     <div className="flex gap-2"><button className={BTN} type="submit">Внести в черновик</button><button className={BTN} type="button" onClick={()=>setEdited(null)}>Отмена записи</button></div>
    </form>:null}
    <h3 className="type-h-17">Семантические шаблоны · инертные записи пакета</h3>
    <p className="type-body-xs text-t2">Шаблоны хранят авторскую подготовку отдельно от кампании. Неизвестные сведения можно оставить пустыми; связи и относительные даты проверяются перед внесением и сохранением.</p>
    <ul className="flex flex-col gap-2">{(draft.templates??[]).map(template=><li key={template.id} className="flex flex-wrap gap-2 type-body-sm"><span>{template.name} · {TEMPLATE_KIND_LABEL[template.kind]} · {template.id} · v{template.template.version} · {template.audience==='dm'?'мастеру':'игрокам'}</span><button className={BTN} onClick={()=>setEditedTemplate({originalId:template.id,value:structuredClone(template)})}>Править шаблон {template.name}</button><button className={BTN} onClick={()=>setDraft(d=>({...d,templates:(d.templates??[]).filter(item=>item.id!==template.id)}))}>Убрать шаблон {template.name}</button></li>)}</ul>
    <div className="flex flex-wrap items-end gap-2"><label className="type-body-sm">Новый тип шаблона<select aria-label="Тип нового шаблона" className={FIELD} value={newTemplateKind} onChange={event=>setNewTemplateKind(event.target.value as AuthorTemplateKind)}>{AUTHOR_TEMPLATE_KINDS.map(kind=><option key={kind} value={kind}>{TEMPLATE_KIND_LABEL[kind]}</option>)}</select></label><button className={BTN} onClick={()=>setEditedTemplate({originalId:null,value:newAuthoredTemplate(newTemplateKind)})}>Создать шаблон</button></div>
    {editedTemplate?<AuthoredTemplateEditor key={`${editedTemplate.originalId??'new'}-${editedTemplate.value.id}`} initial={editedTemplate.value} templates={draft.templates??[]} idLocked={editedTemplate.originalId!==null} onCancel={()=>setEditedTemplate(null)} onSave={template=>{try{const templates=(draft.templates??[]).filter(item=>item.id!==editedTemplate.originalId&&item.id!==template.id);const next={...draft,templates:[...templates,template]};validateDraft(next,catalog);setDraft(next);setEditedTemplate(null);setStatus('Шаблон внесён только в черновик; кампания не менялась.');}catch(err){setStatus(err instanceof Error?err.message:String(err));}}}/> : null}
    <section aria-label="Предпросмотр аудитории"><div className="flex gap-2">{(['dm','players'] as const).map(a=><button className={BTN} key={a} aria-pressed={audience===a} onClick={()=>setAudience(a)}>{a==='dm'?'Предпросмотр мастера':'Предпросмотр игроков'}</button>)}</div><div className="p-3 bg-wl">{authorPreview(draft,audience).map(r=><article key={r.id}><h4 className="type-h-17">{r.name}</h4><p className="type-body-sm whitespace-pre-wrap">{r.text}</p>{'source'in r?<p className="type-body-xs text-t2">{r.source}</p>:null}{'references'in r&&r.references?<ul aria-label={`Ссылки БА23 записи ${r.name}`} className="type-body-xs text-t2">{r.references.map(reference=><li key={`${reference.packageId}@${reference.version}/${reference.nodeId}`}>{reference.packageId}@{reference.version} · {reference.nodeId}</li>)}</ul>:null}</article>)}{authoredTemplatePreview(draft,audience).map(template=><article key={template.id} data-template-kind={template.kind}><h4 className="type-h-17">{template.name} · {template.kind}</h4><p className="type-body-sm">{template.summary}</p>{authoredTemplateText(template)?<p className="type-body-xs text-t2 whitespace-pre-wrap">{authoredTemplateText(template)}</p>:null}</article>)}</div></section>
   </section>
  </div><div hidden={panel!=='library'} className="space-y-3">
   <nav className="flex flex-wrap gap-2" aria-label="Разделы библиотеки">{[['catalog','Пакеты'],['campaigns','Кампании'],['compendium','Компендиум'],['rules','Правила'],['tokens','Токены темы'],['graphics','Графика']].map(([id,label])=><a className={BTN} key={id} href={`#/library/${id}`} aria-current={tab===id?'page':undefined}>{label}</a>)}</nav>
   {(!tab||tab==='catalog')?<>
    <section className="bg-cd shadow-bevel p-3 flex flex-wrap items-center gap-3" aria-label="Кампании для запуска"><div className="flex-1 min-w-0"><h2 className="type-h-20 text-gd-hi">Кампания для запуска</h2><p className="type-body-sm text-t2">«Север: королевский визит» · книжный срез «Песни льда и пламени» · старт в Винтерфелле.</p></div><a className={BTN} href="#/library/campaigns">Выбрать кампанию</a></section>
    <label className="type-body-sm">Найти пакет<input className={FIELD} value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <p role="status" aria-live="polite" className="type-body-xs text-t2">{catalog.length} встроенных пакетов · {catalog.filter(p=>`${p.id} ${p.title} ${p.titleRu??''}`.toLowerCase().includes(query.toLowerCase())).length} показано. Каталог локальный: магазин, оплата и публикация не подключены.</p>
    <ul className="grid min-[800px]:grid-cols-2 gap-3">{catalog.filter(p=>`${p.id} ${p.title} ${p.titleRu??''}`.toLowerCase().includes(query.toLowerCase())).map(p=><li key={p.id} className="bg-cd shadow-bevel p-3 flex flex-col gap-2"><h2 className="type-h-20 text-gd-hi">{p.titleRu??p.title}</h2><p className="type-body-sm">{p.id} · версия {p.version} · {PACKAGE_KIND_LABEL[p.kind]}</p><p className="type-body-xs text-t2">Зависимости: {(p.requires??[]).map(r=>`${r.id}${r.version?` @${r.version}`:' (версия не закреплена)'}`).join(', ')||'нет'}</p><p className="type-body-xs text-t2">Распространение: {DIST_LABEL[p.distribution]} · {p.layers.length} слоёв</p><details><summary className="type-body-sm cursor-pointer">Слои, источники и лицензии · {p.layers.length}</summary><ul className="mt-2 flex flex-col gap-2">{p.layers.map(l=><li key={l.id} className="type-body-xs"><strong>{l.id}</strong><br/>{l.kinds.join(', ')} · {l.path}<br/>{l.license} · {DIST_LABEL[l.distribution]}{l.attribution?<><br/>{l.attribution}</>:null}{l.source?.url?<><br/><a className="underline text-gd-hi" href={l.source.url} target="_blank" rel="noreferrer">Источник</a></>:null}</li>)}</ul></details></li>)}</ul>
    <section aria-label="Принятый импорт"><h2 className="type-h-20">Каталог кампании · {imported.length}</h2><p className="type-body-sm text-t2">Принятые записи; наличие в каталоге само по себе не активирует сцену или персонажа.</p>{imported.map(r=><details key={r.id}><summary>{r.name} · {r.kind}</summary><p className="type-body-sm">{r.sourceFormat} · {r.sourceFile} · {r.rights?.license??'лицензия не подтверждена'}</p></details>)}</section>
   </>:tab==='campaigns'?<>
    <section className="bg-cd shadow-bevel p-3 flex flex-col gap-3" aria-label="Готовые кампании">
     <div><h2 className="type-h-20 text-gd-hi">Готовые кампании</h2><p className="type-body-sm text-t2">Выберите сценарий, чтобы создать для него новую кампанию. Это заменит текущий журнал после отдельного подтверждения.</p></div>
     {BUILT_IN_CAMPAIGNS.map(campaign=>{const manifest=catalog.find(item=>item.id===campaign.id&&item.kind==='campaign');return <article key={campaign.id} className="bg-wl shadow-bevel-in p-3 flex flex-col gap-2">
      <h3 className="type-h-20">{manifest?.titleRu??campaign.title}</h3>
      <p className="type-body-xs text-t2">{campaign.id} · версия {manifest?.version??campaign.version} · {PACKAGE_KIND_LABEL.campaign} · {DIST_LABEL[manifest?.distribution??'internal']}</p>
      <p className="type-body-sm">{campaign.description}</p>
      <p className="type-body-xs text-t2">{campaign.adventure.nodes.length} записей · вход: {campaign.adventure.nodes.find(node=>node.id===campaign.adventure.entry)?.name??campaign.adventure.entry} · правила отдельно</p>
      <p className="type-body-xs text-t2">{campaign.adventure.scope}</p>
      {onNewCampaign?<button type="button" className={BTN} onClick={()=>{setCampaignStartError('');setCampaignToStart(campaign.id);}}>Выбрать и создать кампанию</button>:<p className="type-body-xs text-t2">Создание недоступно в просмотре прошлой даты.</p>}
     </article>})}
    </section>
    {campaignToStart?(()=>{const selected=BUILT_IN_CAMPAIGNS.find(campaign=>campaign.id===campaignToStart);return selected?<div role="alertdialog" aria-label="Создать новую кампанию" className="bg-pl shadow-plate p-3 flex flex-col gap-2">
     <h2 className="type-h-20">Создать «{selected.title}»?</h2>
     <p className="type-body-sm">Текущий журнал будет заменён. При необходимости сначала скачайте его. Новая кампания откроется в сессии на {selected.settingPackageId} · {selected.entryLocationId}.</p>
     <p className="type-body-xs text-t2">Предложение первого запуска сразу появится во «Входящих»: примите его, чтобы открыть сценарий. Кампанию можно начать в мастерском режиме без партии; героев и систему правил можно привязать отдельно.</p>
     {campaignStartError?<p role="alert" className="type-body-sm text-danger">Кампания не создана: {campaignStartError}</p>:null}
     <div className="flex flex-wrap gap-2">{onExport?<button type="button" className={BTN} onClick={onExport}>Скачать текущий журнал</button>:null}<button type="button" className={BTN} disabled={!onNewCampaign} onClick={()=>{if(!onNewCampaign)return;setCampaignStartError('');try{onNewCampaign(selected.settingPackageId,selected.id);setCampaignToStart(null);location.hash='#/session/desk';}catch(reason){setCampaignStartError(reason instanceof Error?reason.message:String(reason));}}}>Создать кампанию</button><button type="button" className={BTN} onClick={()=>{setCampaignStartError('');setCampaignToStart(null);}}>Отмена</button></div>
    </div>:null})():null}
   </>:tab==='compendium'?<CompendiumPage/>:tab==='rules'?<RulesPage strifeEnabled={state.a5eStrifeEnabled??false} onStrifeThemeChange={onStrifeThemeChange}/>:tab==='graphics'?<Suspense fallback={<p role="status" className="type-body-sm text-t2">Загружаю графический каталог…</p>}><ArtSheet/></Suspense>:<TokensPage/>}
  </div>
 </section>;
}
