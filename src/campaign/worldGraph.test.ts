// Места графа мира в кампании (SIMULATION.md С2): есть — оно же; нет — новое поселение в самом мелком накрывающем месте,
// патчем, принятие — как у нового места с карты; id — по той же схеме, что щелчок мастера.
import { describe, expect, it } from 'vitest';
import { applyWorldPatch } from '../engine/reduce';
import { enclosingLocation, locationOfPlace, placeLocation } from './worldGraph';
import { seedState } from './seed';
import { LOCATION } from './world';

const NEVERWINTER = '7e243b80-8918-42fa-b60e-03cec8bdb184';

describe('места графа в кампании', () => {
  it('Neverwinter уже в мире — оно, без патча', () => {
    const s = seedState();
    expect(locationOfPlace(s, NEVERWINTER)?.id).toBe(LOCATION.neverwinter);
    expect(placeLocation(s, { id: NEVERWINTER, name: 'Neverwinter', x: 8522, y: 2610 }, 'toril')).toEqual({ location: s.world.locations[LOCATION.neverwinter] });
  });

  it('Waterdeep — в Sword Coast North, Baldur\'s Gate — в Faerûn; принятие ставит место, второй раз — уже оно', () => {
    const s = seedState();
    expect(enclosingLocation(s, 'toril', 8770, 3045)?.id).toBe(LOCATION.swordCoastNorth);
    expect(enclosingLocation(s, 'toril', 9143, 3906)?.id).toBe(LOCATION.faerun);
    expect(enclosingLocation(s, 'other', 1, 1)).toBeUndefined();
    const wd = { id: 'e37dd71f-f84a-4ba1-a21c-2c98f6ad3cc2', name: 'Waterdeep', x: 8770, y: 3045 };
    const { location, patch } = placeLocation(s, wd, 'toril');
    expect(location).toEqual({ id: 'loc-waterdeep', name: 'Waterdeep', scale: 'settlement', parentId: LOCATION.swordCoastNorth, ref: `place:${wd.id}`, geo: { map: 'toril', x: 8770, y: 3045 } });
    const after = applyWorldPatch(s, patch!);
    expect(placeLocation(after, wd, 'toril')).toEqual({ location });
    expect(() => placeLocation(s, wd, 'other')).toThrow(/нет места кампании/);
  });
});
