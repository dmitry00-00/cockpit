import {expect,it} from 'vitest';
import {authoredTemplatePreview,authorPreview,newPackageDraft,validateDraft,type AuthoredTemplate} from './packageDraft';
const packages=[{id:'dnd5e-2014',version:'5.1.0'}];
it('validates manifest, dependencies and authored records, then round-trips without campaign mutations',()=>{
 const draft=newPackageDraft();draft.records=[{id:'town',kind:'place',name:'Town',text:'Own text',audience:'players',source:'Author'}];
 expect(validateDraft(JSON.parse(JSON.stringify(draft)),packages)).toEqual(draft);
 expect(()=>validateDraft({...draft,manifest:{...draft.manifest,requires:[{id:'missing'}]}},packages)).toThrow('зависимость');
 expect(()=>validateDraft({...draft,manifest:{...draft.manifest,requires:[{id:'dnd5e-2014',version:'wrong'}]}},packages)).toThrow('Версия');
 expect(()=>validateDraft({...draft,records:[...draft.records,...draft.records]},packages)).toThrow('повторяется');
 expect(()=>validateDraft({...draft,manifest:{...draft.manifest,version:'bad'}},packages)).toThrow('Версия');
});
it('player preview excludes whole DM records and their ids/metadata',()=>{
 const draft=newPackageDraft();draft.records=[{id:'secret-id',kind:'fact',name:'Secret',text:'secret text',audience:'dm',source:'secret source'},{id:'public',kind:'scene',name:'Arrival',text:'open',audience:'players',source:'source-private'}];
 expect(JSON.stringify(authorPreview(draft,'players'))).not.toMatch(/secret|source-private|audience/);
 expect(authorPreview(draft,'dm')).toHaveLength(2);
});
it('rejects malformed records rather than accepting partially usable package data',()=>{
 expect(()=>validateDraft(null,packages)).toThrow();
 const draft=newPackageDraft();expect(()=>validateDraft({...draft,records:[null]},packages)).toThrow();
 expect(()=>validateDraft({...draft,manifest:{...draft.manifest,distribution:'open'}},packages)).toThrow();
});

it('validates stable source-package references while leaving old authored records compatible',()=>{
 const draft=newPackageDraft();
 draft.records=[{id:'opening',kind:'scene',name:'Opening',text:'Author-owned summary',audience:'dm',source:'Author',references:[{packageId:'lmop-ru-phantom-2015-local',version:'0.4.0',nodeId:'arrival'}]}];
 expect(validateDraft(JSON.parse(JSON.stringify(draft)),packages).records[0].references).toEqual(draft.records[0].references);
 expect(()=>validateDraft({...draft,records:[{...draft.records[0],references:[...draft.records[0].references!,...draft.records[0].references!]}]},packages)).toThrow(/повторяется ссылка/);
 expect(()=>validateDraft({...draft,records:[{...draft.records[0],references:[{packageId:'not valid',version:'0.4',nodeId:'arrival'}]}]},packages)).toThrow(/некорректный id пакета/);
 const old={...draft,records:[{id:'legacy',kind:'scene' as const,name:'Legacy',text:'Old row',audience:'dm' as const,source:'Author'}]};
 expect(validateDraft(old,packages).records[0]).not.toHaveProperty('references');
});

const source=(nodeId:string)=>[{kind:'package' as const,ref:'lmop-ru-phantom-2015-local',version:'0.4.0',nodeId}];
const place=(id:string,audience:'dm'|'players'='dm'):AuthoredTemplate=>({id,kind:'location',template:{id:'location',version:'1.0.0'},name:id,summary:'Existing pilot node',audience,provenance:source(id),links:[],data:{category:'place'}});

it('loads old drafts and writes typed authoring templates without activating campaign state',()=>{
 const draft=newPackageDraft();
 const {templates:_templates,...legacy}=draft;
 expect(validateDraft(JSON.parse(JSON.stringify(legacy)),packages).templates).toEqual([]);
 const world=[place('neverwinter'),place('high-road'),place('triboar-trail'),place('phandalin','players')];
 world.push({id:'supply-route',kind:'path',template:{id:'path',version:'1.0.0'},name:'Existing route',summary:'Ordered source route',audience:'dm',provenance:source('supply-route'),links:[],data:{mode:'road',topology:{fromId:'neverwinter',viaIds:['high-road','triboar-trail'],toId:'phandalin'}}});
 world.push({id:'gundren',kind:'person',template:{id:'person',version:'1.0.0'},name:'Existing person',summary:'Existing pilot node',audience:'dm',provenance:source('gundren'),links:[{relation:'associated-place',target:'neverwinter'}],data:{role:'npc'}});
 world.push({id:'ambush',kind:'scene',template:{id:'scene',version:'1.0.0'},name:'Existing scene',summary:'Scene stays a plan',audience:'dm',provenance:source('ambush'),links:[{relation:'at',target:'triboar-trail'},{relation:'participant',target:'gundren'},{relation:'route',target:'supply-route'}],data:{trigger:'A scene may be opened; its outcome is not recorded here.'}});
 world.push({id:'ambush-event',kind:'event',template:{id:'event',version:'1.0.0'},name:'Relative chronology',summary:'A content chronology row',audience:'dm',provenance:source('ambush'),links:[{relation:'after-scene',target:'ambush'}],data:{statement:'Chronology statement',time:{kind:'relative',relation:'after',anchorId:'ambush',offset:{value:1,unit:'day'}}}});
 world.push({id:'rumor-note',kind:'rumor',template:{id:'rumor',version:'1.0.0'},name:'Rumor',summary:'A claim, not a revealed campaign fact',audience:'players',provenance:[{kind:'author',ref:'author-note'}],links:[{relation:'about',target:'phandalin'}],data:{claim:'Unverified claim',status:'unverified'}});
 world.push({id:'forest-zone',kind:'terrain',template:{id:'terrain',version:'1.0.0'},name:'Terrain note',summary:'A descriptor with no engine rule',audience:'dm',provenance:[{kind:'author',ref:'terrain-note'}],links:[{relation:'within',target:'triboar-trail'}],data:{biome:'unspecified'}});
 draft.templates=world;
 const checked=validateDraft(JSON.parse(JSON.stringify(draft)),packages);
 expect(checked.templates?.find(node=>node.kind==='path')?.data).toEqual({mode:'road',topology:{fromId:'neverwinter',viaIds:['high-road','triboar-trail'],toId:'phandalin'}});
 expect(checked.templates?.find(node=>node.kind==='event')).toMatchObject({kind:'event',data:{time:{kind:'relative',anchorId:'ambush'}}});
 expect(checked.templates?.find(node=>node.kind==='scene')?.data).toHaveProperty('trigger');
 expect(checked.templates?.find(node=>node.kind==='rumor')?.data).toMatchObject({status:'unverified'});
 expect(JSON.stringify(checked)).not.toMatch(/WORLD_DELTA|FACT_REVEALED|eventLog/);
});

it('checks topology, relative anchors, relation types, provenance and player secrecy',()=>{
 const draft=newPackageDraft();
 draft.templates=[place('neverwinter'),place('phandalin','players'),{
  id:'supply-route',kind:'path',template:{id:'path',version:'1.0.0'},name:'Route',summary:'A route',audience:'players',provenance:source('supply-route'),links:[],data:{mode:'road',topology:{fromId:'neverwinter',viaIds:[],toId:'phandalin'}},
 }];
 const templates=draft.templates!;
 const publicLocation=templates[1] as Extract<AuthoredTemplate,{kind:'location'}>;
 publicLocation.data.mapPoint={mapId:'toril',key:'Phandalin',point:{x:12,y:34},coordinateSpace:'source-pixel',source:'private-editorial-map.json'};
 expect(()=>validateDraft(draft,packages)).toThrow(/игроковый путь не может включать закрытое место/);
 templates[0]=place('neverwinter','players');
 expect(validateDraft(draft,packages).templates).toHaveLength(3);
 const players=authoredTemplatePreview(validateDraft(draft,packages),'players');
 expect(players.map(node=>node.id)).toEqual(['neverwinter','phandalin','supply-route']);
 expect(JSON.stringify(players)).not.toMatch(/lmop-ru-phantom|private-editorial-map\.json/);
 const bad={...draft,templates:[...templates,{id:'scene',kind:'scene',template:{id:'scene',version:'1.0.0'},name:'Scene',summary:'Scene',audience:'players',provenance:source('ambush'),links:[{relation:'participant',target:'neverwinter'}],data:{}}]};
 expect(()=>validateDraft(bad,packages)).toThrow(/недопустимая связь/);
 const badAnchor={...draft,templates:[...templates,{id:'event',kind:'event',template:{id:'event',version:'1.0.0'},name:'Event',summary:'Event',audience:'players',provenance:source('arrival'),links:[],data:{statement:'Chronology',time:{kind:'relative',relation:'before',anchorId:'missing'}}}]};
 expect(()=>validateDraft(badAnchor,packages)).toThrow(/относительная дата/);
 expect(()=>validateDraft({...draft,templates:[...templates,{...templates[0],template:{id:'location',version:'2.0.0'}}]},packages)).toThrow(/версия 1.0.0/);
});
