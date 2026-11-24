// @vitest-environment node
import { describe,expect,it } from 'vitest';
import { seedEngine,seedState } from './seed';
import { createEngineStore } from '../engine/store';
import { memoryStore } from '../engine/persist';
import { partyContextOf } from './partyContext';
import { supplyOf,mouthsOf } from './supply';
import { partyPlaceId } from '../engine/ladder';

const fixed = () => {let n=0;return {ids:{next:()=>`party-context-${++n}`},clock:{now:()=>n}};};
describe('facts below the party cards',()=>{
  it('reuses live supply and does not infer a journey or camp from the current location',()=>{
    const store=seedEngine({persist:memoryStore(),...fixed()});
    const state=store.getState().state;
    const view=partyContextOf(state,store.getState().events);
    expect(view.members).toBe(4);
    expect(view.supply).toMatchObject({value:supplyOf(state),perDay:mouthsOf(state)});
    expect(view.lastJourney).toBeUndefined();
    expect(view.lastRest).toBeUndefined();
    store.getState().changeSupply('found',4);
    expect(partyContextOf(store.getState().state,store.getState().events).supply.value).toBe(view.supply.value+4);
  });
  it('supplies DM trade context from the current settlement index without exposing it in the player projection',()=>{
    const state=seedState();
    const locationId=partyPlaceId(state);
    expect(locationId).toBeTruthy();
    const location=state.world.locations[locationId!]!;
    location.scale='settlement';
    location.pricePercent=5;
    location.prices={weapons:15};
    const dm=partyContextOf(state,[]);
    expect(dm.market).toMatchObject({locationId:location.id,locationName:location.name});
    expect(dm.market?.goods).toContainEqual(expect.objectContaining({id:'weapons',index:120}));
    expect(partyContextOf(state,[],true).market).toBeUndefined();
  });
  it('journey history and rest follow actual events, undo/redo and replay',()=>{
    const persist=memoryStore(),store=seedEngine({persist,...fixed()});
    const api=store.getState();
    const places=Object.values(api.state.world.locations);
    const from=places.find(l=>l.name==='Neverwinter')!;
    const to=places.find(l=>l.name==='Triboar Trail')!;
    api.travel({fromId:from.id,toId:to.id,map:'toril',points:[{x:0,y:0},{x:1,y:1}],miles:24,days:1,pace:'normal'});
    const project=()=>partyContextOf(store.getState().state,store.getState().events);
    expect(project().lastJourney).toMatchObject({from:'Neverwinter',to:'Triboar Trail',miles:24,days:1});
    api.rest('short',['bo']);
    expect(project().lastRest).toMatchObject({kind:'short',participants:['Bo Tambernack']});
    api.undo();
    expect(project().lastRest).toBeUndefined();
    expect(project().lastJourney).toBeDefined();
    api.undo();
    expect(project().lastJourney).toBeUndefined();
    api.redo();
    expect(project().lastJourney).toBeDefined();
    const replay=createEngineStore(seedState(),{persist,...fixed()});
    expect(partyContextOf(replay.getState().state,replay.getState().events)).toEqual(project());
  });

  it('не назначает место всей партии, если только часть участников имеет позицию',()=>{
    const state=seedState();
    const from=Object.values(state.world.locations).find(place=>place.name==='Neverwinter')!;
    state.actors[state.party[0]!]!.locationId=from.id;
    state.actors[state.party[1]!]!.locationId=undefined;
    const context=partyContextOf(state,[]);
    expect(context.location).toBeUndefined();
    expect(context.locationIncomplete).toBe(true);
    expect(context.positions).toEqual([{id:from.id,name:from.name,members:1}]);
  });

  it('player data omits unrevealed place names and journey endpoints',()=>{
    const store=seedEngine({persist:memoryStore(),...fixed()}),api=store.getState();
    const places=Object.values(api.state.world.locations),from=places.find(l=>l.name==='Neverwinter')!,to=places.find(l=>l.name==='Triboar Trail')!;
    api.travel({fromId:from.id,toId:to.id,map:'toril',points:[{x:0,y:0},{x:1,y:1}],miles:24,days:1,pace:'normal'});
    const privateState=structuredClone(store.getState().state);
    privateState.world.locations[from.id].revealed=false;
    privateState.world.locations[to.id].revealed=false;
    const hidden=partyContextOf(privateState,store.getState().events,true);
    expect(hidden.location).toBeUndefined();
    expect(hidden.lastJourney).toBeUndefined();
    expect(JSON.stringify(hidden)).not.toMatch(/Neverwinter|Triboar/);
    privateState.world.locations[from.id].revealed=true;
    privateState.world.locations[to.id].revealed=true;
    expect(partyContextOf(privateState,store.getState().events,true).lastJourney).toBeDefined();
  });
  it('не показывает выдуманное общее место разделённой партии и скрывает нераскрытые позиции',()=>{
    const store=seedEngine({persist:memoryStore(),...fixed()}),state=structuredClone(store.getState().state);
    const ids=state.party.slice(0,2);
    const places=Object.values(state.world.locations);
    const town=places.find(place=>place.name==='Neverwinter')!;
    const well=places.find(place=>place.name==='Old Owl Well')!;
    for(const id of state.party) if(state.actors[id]&&!state.actors[id].removed) state.actors[id].locationId=town.id;
    state.actors[ids[0]].locationId=town.id;
    state.actors[ids[1]].locationId=well.id;
    town.revealed=true;
    well.revealed=false;
    const dm=partyContextOf(state,[]);
    expect(dm.split).toBe(true);
    expect(dm.location).toBeUndefined();
    expect(dm.positions).toEqual(expect.arrayContaining([expect.objectContaining({id:town.id,name:town.name}),expect.objectContaining({id:well.id,name:well.name})]));
    const player=partyContextOf(state,[],true);
    expect(player.split).toBe(true);
    expect(player.positions).toEqual(expect.arrayContaining([expect.objectContaining({id:town.id,name:town.name})]));
    expect(JSON.stringify(player)).not.toContain(well.name);
  });
});
