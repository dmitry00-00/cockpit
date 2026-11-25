import { describe, it, expect } from 'vitest';
import { calendarAdapterForState, seedState, secOf } from '../../campaign';
import type { JournalEntry } from '../../engine';
import { canonItems, campaignItems } from './timeline';
import type { CalendarAdapter } from '../../campaign/calendar';
const calendar = calendarAdapterForState(seedState());
describe('ribbon projections', () => {
  it('merges duplicate canon citations and links without inventing a day', () => {
    const out = canonItems([{id:'a',year:1370,kind:'politics',text:'event',cites:['Book p1']}], [{id:'b',same:'a',year:1370,text:'duplicate',src:{title:'Luskan',how:'history'},cites:['Book p2'],links:[{t:'Luskan',ref:'place:luskan'}]}], calendar);
    expect(out).toHaveLength(1); expect(out[0].source).toContain('Book p2'); expect(out[0].links).toHaveLength(1); expect(out[0].sec).toBeUndefined(); expect(out[0].date).toContain('день не установлен');
  });
  it('preserves vague prose and year ranges, converts explicit dates only', () => {
    const out = canonItems([{id:'a',year:1492,kind:'politics',text:'A',month:5,day:15,when:'15 Mirtul'}, {id:'b',year:1492,kind:'magic',text:'B',when:'Late Mirtul'}], [{id:'c',year:1385,to:1395,text:'war',src:{title:'War',how:'conflict'}}], calendar);
    expect(out[0].sec).toBe(secOf({year:1492,month:'Mirtul',day:15})); expect(out[1].sec).toBeUndefined(); expect(out[1].date).toContain('Late Mirtul'); expect(out[2].endYear).toBe(1395);
  });
  it('excludes hidden, secret, undone, compensation and delta journal rows', () => {
    const entry = {id:'ok',eventId:'e',worldSec:0,text:'public',hidden:false,secret:false,undone:false} as JournalEntry;
    expect(campaignItems([entry,{...entry,id:'hidden',hidden:true},{...entry,id:'secret',secret:true},{...entry,id:'undone',undone:true},{...entry,id:'undo',compensation:'undo'},{...entry,id:'delta',deltaId:'delta'}],calendar).map(i=>i.id)).toEqual(['campaign:ok']);
  });
  it('does not manufacture a year for a counter-calendar journal row', () => {
    const entry = {id:'counter-day',eventId:'e',worldSec:0,text:'public',hidden:false,secret:false,undone:false} as JournalEntry;
    const counter: CalendarAdapter = { ...calendar, id:'planet-days', kind:'counter', yearAt:() => null, formatDate:() => 'День 1, 00:00', formatDateOnly:() => 'День 1', formatCompactDate:() => 'День 1', formatTime:() => '00:00', moonAt:undefined };
    expect(campaignItems([entry], counter)[0]).toMatchObject({ year:null, date:'День 1, 00:00' });
  });
});
