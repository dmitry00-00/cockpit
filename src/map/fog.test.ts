// Туман знаний — проекция: пройденные пути (PARTY_TRAVELED, кроме отменённых), открытые мастером места и место
// партии. Обзор — FOG_SIGHT_MILES в пикселях исходника по калибровке паспорта.
import { describe, expect, it } from 'vitest';
import { LOCATION, seedState } from '../campaign';
import { EventLog } from '../engine';
import { FOG_SIGHT_MILES, exploredOf } from './fog';
import { MAPS } from './maps';

const toril = MAPS.toril;
const sight = FOG_SIGHT_MILES / toril.milesPerPixel;
const fixed = () => {
  let t = 0, n = 0;
  return { clock: { now: () => ++t }, ids: { next: () => `e${++n}` } };
};
const route = { fromId: LOCATION.neverwinter, toId: LOCATION.oldOwlWell, map: 'toril', points: [{ x: 8522, y: 2610 }, { x: 8700, y: 2668 }], miles: 93.6, pace: 'normal' as const, days: 3.9 };

describe('туман знаний', () => {
  it('на старте открыт только круг обзора вокруг места партии', () => {
    const s = seedState();
    const nw = s.world.locations[LOCATION.neverwinter].geo!;
    expect(exploredOf(s, [], toril)).toEqual({ circles: [{ x: nw.x, y: nw.y, r: sight }], paths: [], sight });
  });

  it('поход открывает коридор пути и новое место партии; отменённый — нет', () => {
    const log = new EventLog(seedState(), [], fixed());
    log.dispatch({ type: 'PARTY_TRAVELED', payload: route });
    let e = exploredOf(log.state, log.entries, toril);
    expect(e.paths).toEqual([route.points]);
    expect(e.circles).toEqual([{ x: 8700, y: 2668, r: sight }]);
    log.undo();
    e = exploredOf(log.state, log.entries, toril);
    expect(e.paths).toEqual([]);
  });

  it('открытое мастером место — кругом своей рамки, но не меньше обзора', () => {
    const log = new EventLog(seedState(), [], fixed());
    log.dispatch({ type: 'PLACE_REVEALED', payload: { locationId: LOCATION.neverwinterWood } });
    log.dispatch({ type: 'PLACE_REVEALED', payload: { locationId: LOCATION.oldOwlWell } });
    const circles = exploredOf(log.state, log.entries, toril).circles;
    expect(circles).toContainEqual({ x: 8570, y: 2520, r: 120 });
    expect(circles).toContainEqual({ x: 8700, y: 2668, r: sight });
  });

  it('путь по другой карте в туман этой не попадает', () => {
    const log = new EventLog(seedState(), [], fixed());
    log.dispatch({ type: 'PARTY_TRAVELED', payload: { ...route, map: 'planetos' } });
    expect(exploredOf(log.state, log.entries, toril).paths).toEqual([]);
  });

  it('план города (M10) открыт целиком, пока партия в городе; ушла и город не открыт — закрыт', () => {
    const plan = MAPS.neverwinter;
    const s = seedState();
    const all = exploredOf(s, [], plan);
    expect(all.circles).toEqual([{ x: 720, y: 507.5, r: Math.hypot(1440, 1015) / 2 }]);
    const away = { ...s, actors: Object.fromEntries(Object.entries(s.actors).map(([id, a]) => [id, s.party.includes(id) ? { ...a, locationId: LOCATION.oldOwlWell } : a])) };
    expect(exploredOf(away, [], plan).circles).toEqual([]);
    const revealed = { ...away, world: { ...away.world, locations: { ...away.world.locations, [LOCATION.neverwinter]: { ...away.world.locations[LOCATION.neverwinter], revealed: true } } } };
    expect(exploredOf(revealed, [], plan).circles).toHaveLength(1);
  });
});

