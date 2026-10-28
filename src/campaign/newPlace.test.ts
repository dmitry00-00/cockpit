// Новое место щелчком (M8): предложение с патчем; до «Принять» места нет, после — с geo, Ctrl+Z убирает.
import { describe, expect, it } from 'vitest';
import { newPlaceDelta } from './newPlace';
import { seedEngine } from './seed';
import { LOCATION } from './world';

const fixed = () => {
  let t = 1000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
};

describe('newPlaceDelta', () => {
  it('id из имени, совпадение — с номером (и с ждущим предложением); принятие — место с geo и ссылкой на справочник; Ctrl+Z убирает', () => {
    const store = seedEngine(fixed());
    const api = () => store.getState();
    const scn = api().state.world.locations[LOCATION.swordCoastNorth];
    const d = newPlaceDelta(api().state, { name: 'Port Llast', scale: 'settlement', map: 'toril', x: 8460, y: 2690, gazetteerId: 'pt' }, scn);
    expect(d).toMatchObject({
      id: 'd-new-loc-port-llast', scale: 'settlement', subject: 'Новое место · Port Llast', was: 'нет на карте', now: 'поселение в Sword Coast North',
      causeId: LOCATION.swordCoastNorth, status: 'pending',
      patch: { kind: 'newLocation', location: { id: 'loc-port-llast', name: 'Port Llast', scale: 'settlement', parentId: LOCATION.swordCoastNorth, geo: { map: 'toril', x: 8460, y: 2690 }, ref: 'place:pt' } },
    });
    api().propose(d);
    // Второе с тем же именем, пока первое ждёт, — уже с номером.
    expect(newPlaceDelta(api().state, { name: 'Port Llast', scale: 'building', map: 'toril', x: 1, y: 1 }, scn).patch).toMatchObject({ location: { id: 'loc-port-llast-2' } });
    expect(api().state.world.locations['loc-port-llast']).toBeUndefined();
    api().accept(d.id);
    expect(api().state.world.locations['loc-port-llast']).toMatchObject({ geo: { x: 8460, y: 2690 }, ref: 'place:pt' });
    api().undo();
    expect(api().state.world.locations['loc-port-llast']).toBeUndefined();
    expect(api().state.deltas[d.id].status).toBe('pending');
  });
});
