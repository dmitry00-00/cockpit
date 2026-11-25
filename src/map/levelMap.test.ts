// Карта уровня лестницы на сиде §13: на каких уровнях она есть, куда смотрит, какие места на ней отмечены,
// где партия. Координаты мест — пиксели карты HandsomeRob (content/maps/toril.json).
import { describe, expect, it } from 'vitest';
import { LOCATION, seedState } from '../campaign';
import { initialLadder, jumpTo, selectPlace } from '../engine';
import { HEX_MILES, geoOf, levelMap } from './levelMap';

describe('карта уровня', () => {
  const state = seedState();

  it('регион на старте: карта Toril, рамка Sword Coast North, пины — места региона с координатами', () => {
    const ladder = initialLadder(state);
    expect(ladder.level).toBe('region');
    const m = levelMap(state, ladder)!;
    expect(m.passport.id).toBe('toril');
    expect(m.frameKey).toBe(`region:${LOCATION.swordCoastNorth}`);
    expect(m.places.map(l => l.id).sort()).toEqual([LOCATION.neverwinter, LOCATION.neverwinterWood, LOCATION.oldOwlWell, LOCATION.triboarTrail].sort());
    expect(HEX_MILES.region).toBe(6);
  });

  it('партия — там же, где Neverwinter; Южные ворота имеют собственные координаты плана', () => {
    const m = levelMap(state, initialLadder(state))!;
    const nw = state.world.locations[LOCATION.neverwinter].geo!;
    expect(m.party).toEqual({ x: nw.x, y: nw.y });
    expect(geoOf(state, LOCATION.southGate)).toEqual({ map: 'neverwinter', x: 455, y: 905 });
  });

  it('континент: рамка Faerûn шире, чем выше; подрегионы Sword Coast North не дублируют свой регион', () => {
    const m = levelMap(state, jumpTo(state, initialLadder(state), 'continent'))!;
    expect(m.frame.x1 - m.frame.x0).toBeGreaterThan(m.frame.y1 - m.frame.y0);
    expect(m.places.map(l => l.id)).toEqual([LOCATION.swordCoastNorth]);
  });

  it('подрегион в фокусе: рамка — его, пины — от верхнего места уровня', () => {
    const ladder = selectPlace(state, initialLadder(state), LOCATION.triboarTrail);
    const m = levelMap(state, ladder)!;
    expect(m.frameKey).toBe(`region:${LOCATION.triboarTrail}`);
    expect(m.places.map(l => l.id)).toContain(LOCATION.neverwinter);
  });

  it('уровни без карты — здание, план, космология — карты не дают', () => {
    const base = initialLadder(state);
    for (const level of ['building', 'plane', 'cosmology'] as const) expect(levelMap(state, jumpTo(state, base, level)), level).toBeUndefined();
  });

  it('место без координат и без предков с ними — карты нет', () => {
    const s = seedState();
    for (const l of Object.values(s.world.locations)) delete l.geo;
    expect(levelMap(s, initialLadder(s))).toBeUndefined();
  });

  it('поселение с планом (M10): Neverwinter — план города целиком рамкой; места на плане — пины; карта мира — переключателем', () => {
    const ladder = jumpTo(state, selectPlace(state, initialLadder(state), LOCATION.neverwinter), 'settlement');
    const m = levelMap(state, ladder)!;
    expect(m.passport.id).toBe('neverwinter');
    expect(m.passport.units).toBe('feet');
    expect(m.frame).toEqual({ x0: 0, y0: 0, x1: 1440, y1: 1015 });
    expect(m.plan).toBe(true);
    // Партия отмечена только на карте мира; Южные ворота — первое здание-пин на плане.
    expect(m.party).toBeUndefined();
    expect(m.places.map(l => l.id)).toEqual([LOCATION.southGate]);
    expect(m.places[0].geo).toEqual({ map: 'neverwinter', x: 455, y: 905 });
    const world = levelMap(state, ladder, { plan: false })!;
    expect([world.passport.id, world.plan]).toEqual(['toril', false]);
    // Регион и места без плана — как раньше, без переключателя.
    expect(levelMap(state, initialLadder(state))!.plan).toBeUndefined();
  });
});

