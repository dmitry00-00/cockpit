// Слои карты (ROADMAP 6.4): погода регионов на день — броски d20 из лога, не выдуманные; опасность — веса встреч мест.
import { beforeAll, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../engine/events';
import { SECONDS_PER_DAY } from '../engine/state';
import { loadJourney } from '../rules/a5e/journey';
import { secOf } from './calendar';
import { placeDangerOf, regionWeatherOf } from './mapLayers';
import { seedEngine } from './seed';
import { LOCATION } from './world';

beforeAll(() => loadJourney());

const MIRTUL = secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 });
let seq = 0;
const roll = (label: string, total: number, worldSec = MIRTUL, extra: Partial<DomainEvent> = {}, hidden = false): DomainEvent =>
  ({ id: `e${++seq}`, seq, at: seq, worldSec, type: 'DICE_ROLLED', payload: { formula: '1d20', dice: [total], mod: 0, total, hidden, label }, ...extra }) as DomainEvent;

describe('погода регионов на день', () => {
  it('последний бросок дня по региону — строка таблицы A5E; чужой день, отменённый бросок и чужая подпись — мимо', () => {
    const events = [
      roll('Погода · Tangled Forest', 1),
      roll('Погода · Tangled Forest', 3),
      roll('Погода · Rolling Grasslands', 18, MIRTUL - SECONDS_PER_DAY),
      roll('Погода · Lofty Mountains', 20),
      roll('Погода · Unrelenting Marsh', 5),
      roll('Встреча · Tangled Forest, уровень 1', 50),
    ];
    // Бросок по болоту отменён (Ctrl+Z): компенсирующее событие с undoes.
    const undo = { ...events[4], id: 'u1', seq: 99, undoes: events[4].id } as DomainEvent;
    const w = regionWeatherOf([...events, undo], MIRTUL + 3600);
    expect(w.get('tangled-forest')).toEqual({ roll: 3, winter: false, weather: 'clear', hidden: false });
    expect(w.has('rolling-grasslands')).toBe(false);
    expect([...w.keys()].sort()).toEqual(['lofty-mountains', 'tangled-forest']);
  });

  it('зимой +5, кроме тёплых краёв; скрытый бросок мастера игрокам не виден', () => {
    const hammer = secOf({ year: 1492, month: 'Hammer', day: 3, hour: 9 });
    const events = [roll('Погода · Tangled Forest', 18, hammer), roll('Погода · Parched Sands', 18, hammer, {}, true)];
    const dm = regionWeatherOf(events, hammer);
    expect(dm.get('tangled-forest')).toMatchObject({ roll: 18, winter: true, weather: 'snow' });
    expect(dm.get('parched-sands')).toMatchObject({ winter: false, hidden: true });
    expect(regionWeatherOf(events, hammer, true).has('parched-sands')).toBe(false);
  });
});

describe('опасность мест', () => {
  it('веса встреч мест кампании с ждущим изменением — как в «Пульсе»', () => {
    // Ждущее предложение — из лога сида («Встречи с ликантропами»): ×1 сейчас, ×2 рядом.
    const store = seedEngine({ clock: { now: () => 1 }, ids: { next: (() => { let n = 0; return () => `s${++n}`; })() } });
    expect(placeDangerOf(store.getState().state).get(LOCATION.neverwinterWood)).toEqual([{ key: 'Werewolf', weight: 1, pending: 2 }]);
  });
});
