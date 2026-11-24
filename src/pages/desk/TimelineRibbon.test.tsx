import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { calendarAdapterForState, seedState } from '../../campaign';
import { SECONDS_PER_DAY } from '../../engine';
import type { CalendarAdapter } from '../../campaign/calendar';
import { loadChronoIndex, loadEvents } from '../../world/chronology';
import { TimelineRibbon } from './TimelineRibbon';
vi.mock('../../world/chronology', async importOriginal => ({...await importOriginal<typeof import('../../world/chronology')>(),
  loadChronoIndex: vi.fn().mockResolvedValue({eras:[{name:'Present Age',from:1489,to:1600}]}),
  loadEvents: vi.fn().mockResolvedValue([{id:'unknown',year:1492,text:'Year only event',kind:'politics',cites:['Book p7']}]),
  loadArticleEvents: vi.fn().mockResolvedValue([]),
}));
function setup(dmView=true, calendarOverride?: CalendarAdapter, withPlan=false) {
 const state=seedState(); state.deltas.secret={id:'secret',subject:'Secret caravan',was:'old',now:'new',cause:'Secret route',causeId:'x',scale:'region',status:'pending'};
 if(withPlan) { const startSec=Math.floor(state.time.sec/SECONDS_PER_DAY)*SECONDS_PER_DAY; state.world.timelinePlans={'plan-1':{id:'plan-1',title:'Council',details:'Possible meeting',startSec,endSec:startSec+2*SECONDS_PER_DAY-1,source:'GM notes, page 4',visibility:'dm',status:'active'}}; }
 const onYear=vi.fn(),onInbox=vi.fn(),onCreatePlan=vi.fn(),onCancelPlan=vi.fn();
 const view=render(<TimelineRibbon dmView={dmView} state={state} entries={[]} calendar={calendarOverride ?? calendarAdapterForState(state)} lensYear={null} onYear={onYear} onInbox={onInbox} onOpenEntity={vi.fn()} onCreatePlan={onCreatePlan} onCancelPlan={onCancelPlan}/>);
 return {state,onYear,onInbox,onCreatePlan,onCancelPlan,...view};
}
describe('timeline controls',()=>{
 it('keeps low-height windows usable and allows explicitly opening the tape',()=>{
  const original=window.matchMedia;
  window.matchMedia=vi.fn().mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as MediaQueryList);
  try { setup(); const toggle=screen.getByRole('button',{name:'Лента времени'});
   expect(toggle).toHaveAttribute('aria-expanded','false');
   expect(screen.queryByRole('group',{name:'Планы и календарь'})).toBeNull();
   fireEvent.click(toggle);expect(toggle).toHaveAttribute('aria-expanded','true');
  } finally { window.matchMedia=original; }
 });
 it('does not mount secret plans or DM data for players',()=>{const {container}=setup(false,undefined,true); expect(container).toBeEmptyDOMElement();});
 it('preserves uncertain dates and exposes source, while navigation leaves state unchanged',async()=>{
  const {state,onYear}=setup();const before=JSON.stringify(state);
  const marker=await screen.findByRole('button',{name:'Канон · дата неточная · 1'}); fireEvent.click(marker);
  const detail=screen.getByRole('region',{name:'События ленты'});expect(detail).toHaveTextContent('день не установлен');expect(detail).toHaveTextContent('Book p7');
  fireEvent.click(screen.getByRole('button',{name:'Следующий период ленты'})); fireEvent.click(screen.getByRole('button',{name:'Год'}));
  fireEvent.click(screen.getByRole('button',{name:'К сейчас'}));expect(onYear).toHaveBeenCalledWith(null);expect(JSON.stringify(state)).toBe(before);
 });
 it('scrolls the cassette with horizontal wheel input without advancing campaign time',()=>{
  const {state}=setup();const before=state.time.sec;
  const region=screen.getByRole('region',{name:'Хронологическая лента'});
  const tape=region.querySelector('.timeline-tape')!;
  expect(region).toHaveTextContent('12 Mirtul — 18 Mirtul');
  fireEvent.wheel(tape,{deltaX:80,deltaY:0});
  expect(region).toHaveTextContent('19 Mirtul — 25 Mirtul');expect(state.time.sec).toBe(before);
 });
 it('keeps undated proposals separate and never accepts them through the ribbon',async()=>{
  const {onInbox,state}=setup();await waitFor(()=>expect(within(screen.getByRole('group',{name:'Предложения'})).getByRole('button')).toBeInTheDocument());
  fireEvent.click(within(screen.getByRole('group',{name:'Предложения'})).getByRole('button'));
  expect(screen.getByRole('region',{name:'События ленты'})).toHaveTextContent('Дата предложения не установлена');
  fireEvent.click(screen.getByRole('button',{name:'Во входящие'}));expect(onInbox).toHaveBeenCalledOnce();expect(state.deltas.secret.status).toBe('pending');
 });
 it('shows a source-backed dated plan as a range and cancels it through the journal callback',async()=>{
  const {state,onCancelPlan}=setup(true,undefined,true);
  fireEvent.click(await screen.findByRole('button',{name:/Открыть план Council/}));
  const detail=screen.getByRole('region',{name:'События ленты'});
  fireEvent.click(within(detail).getByText(/Council/));
  expect(detail).toHaveTextContent('Possible meeting');expect(detail).toHaveTextContent('GM notes, page 4');
  fireEvent.click(within(detail).getByRole('button',{name:'Снять план'}));
  expect(onCancelPlan).toHaveBeenCalledWith('plan-1');expect(state.world.timelinePlans?.['plan-1'].status).toBe('active');
 });
 it('creates a dated DM plan without changing clocks or local state directly',()=>{
  const {state,onCreatePlan}=setup();
  const beforeTime=state.time.sec;
  fireEvent.click(screen.getByText('Добавить план мастера'));
  fireEvent.change(screen.getByRole('textbox',{name:'Название плана'}),{target:{value:'Council'}});
  fireEvent.change(screen.getByRole('textbox',{name:'Источник плана'}),{target:{value:'GM notes, page 4'}});
  fireEvent.change(screen.getByRole('spinbutton',{name:'Через сколько дней'}),{target:{value:'2'}});
  fireEvent.change(screen.getByRole('spinbutton',{name:'Длительность плана в днях'}),{target:{value:'3'}});
  fireEvent.click(screen.getByRole('button',{name:'Записать план'}));
  expect(onCreatePlan).toHaveBeenCalledOnce();
  const plan=onCreatePlan.mock.calls[0][0]; const start=Math.floor(state.time.sec/SECONDS_PER_DAY)+2;
  expect(plan).toMatchObject({title:'Council',source:'GM notes, page 4',startSec:start*SECONDS_PER_DAY,endSec:(start+3)*SECONDS_PER_DAY-1});
  expect(state.time.sec).toBe(beforeTime);expect(state.world.timelinePlans).toBeUndefined();
 });
 it('uses only day scale and does not load Forgotten Realms chronology for a counter calendar',async()=>{
  const state=seedState();const base=calendarAdapterForState(state);
  const counter:CalendarAdapter={...base,id:'planet-days',kind:'counter',yearAt:()=>null,yearSuffix:undefined,formatDate:()=>'День 1, 00:00',formatDateOnly:()=>'День 1',formatCompactDate:()=>'День 1',moonAt:undefined,seasonAt:undefined};
  vi.mocked(loadChronoIndex).mockClear();vi.mocked(loadEvents).mockClear();
  setup(true,counter);
  expect(within(screen.getByRole('group',{name:'Масштаб ленты'})).getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button',{name:'День'})).toHaveAttribute('aria-pressed','true');
  expect(screen.queryByRole('button',{name:'Год'})).toBeNull();expect(screen.queryByRole('button',{name:'Эпоха'})).toBeNull();
  expect(screen.queryByText(/DR/)).toBeNull();expect(loadChronoIndex).not.toHaveBeenCalled();expect(loadEvents).not.toHaveBeenCalled();
 });
});
