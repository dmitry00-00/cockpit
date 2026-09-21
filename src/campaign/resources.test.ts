// Ресурсы персонажа: максимумы из таблиц компендиума и умений SRD у партии §13, остаток из состояния,
// что вернёт короткий отдых.
import { describe, expect, it } from 'vitest';
import { classById } from '../rules/compendium';
import { seedState } from './seed';
import { poolLabel, resourcePoolsOf, restResourcesOf, tableResources } from './resources';

const pools = (id: string, spent: Record<string, number> = {}) => {
  const s = seedState();
  const a = { ...s.actors[id], resourcesSpent: spent };
  return resourcePoolsOf(a);
};
const byId = (id: string, spent?: Record<string, number>) => Object.fromEntries(pools(id, spent).map(p => [p.id, p]));

describe('ресурсы партии §13 (5-й уровень)', () => {
  it('Bo, следопыт: ячейки 1-го круга 4 и 2-го 2 из таблицы; умений с числом у следопыта нет', () => {
    expect(pools('bo').map(p => [p.id, p.max, p.restoresOn])).toEqual([['slot-1', 4, 'long'], ['slot-2', 2, 'long']]);
  });

  it('Korrin, воин: второе дыхание и всплеск действий по одному, оба — короткий отдых; несокрушимости до 9-го нет', () => {
    expect(pools('korrin').map(p => [p.id, p.max, p.restoresOn])).toEqual([['second-wind', 1, 'short'], ['action-surge', 1, 'short']]);
  });

  it('Lyra, волшебник: ячейки 4/3/2 и магическое восстановление; Aldric, жрец: ячейки 4/3/2 и божественный канал 1', () => {
    expect(pools('lyra').map(p => [p.id, p.max])).toEqual([['slot-1', 4], ['slot-2', 3], ['slot-3', 2], ['arcane-recovery', 1]]);
    expect(pools('aldric').map(p => [p.id, p.max, p.restoresOn])).toEqual([['slot-1', 4], ['slot-2', 3], ['slot-3', 2], ['channel-divinity', 1, 'short']].map(x => x.length === 2 ? [...x, 'long'] : x));
  });

  it('остаток — максимум минус потраченное, потраченное сверх максимума обрезается; без листа — пусто', () => {
    const b = byId('bo', { 'slot-1': 3, 'slot-2': 5 });
    expect(b['slot-1']).toMatchObject({ spent: 3, available: 1 });
    expect(b['slot-2']).toMatchObject({ spent: 2, available: 0 });
    const s = seedState();
    expect(resourcePoolsOf(s.actors.captain)).toEqual([]);
  });

  it('таблицы других классов: ярость, ци, единицы чародейства, ячейки договора с кругом; справочные колонки не ресурсы', () => {
    const row = (id: string, level: number) => classById(id)!.levels.find(l => l.level === level)!;
    expect(tableResources(row('varvar', 4))).toEqual([{ id: 'rage', max: 3 }]);
    expect(tableResources(row('varvar', 20))).toEqual([]); // «неогр» — без счёта
    expect(tableResources(row('monah', 4))).toEqual([{ id: 'ki', max: 4 }]);
    expect(tableResources(row('carodey', 4))).toEqual([{ id: 'slot-1', max: 4 }, { id: 'slot-2', max: 3 }, { id: 'sorcery', max: 4 }]);
    expect(tableResources(row('koldun', 5))).toEqual([{ id: 'pact-slots', max: 2, slotLevel: 3 }]);
    expect(tableResources(row('plut', 5))).toEqual([]);
    const s = seedState();
    const warlock = { ...s.actors.bo, sheet: { ...s.actors.bo.sheet!, classId: 'koldun' } };
    expect(resourcePoolsOf(warlock).map(poolLabel)).toEqual(['Ячейки договора · 3-го круга']);
  });

  it('короткий отдых возвращает только потраченное с правилом «короткий»; долгий — список пуст', () => {
    const s = seedState();
    const korrin = { ...s.actors.korrin, resourcesSpent: { 'second-wind': 1 } };
    const bo = { ...s.actors.bo, resourcesSpent: { 'slot-1': 2 } };
    expect(restResourcesOf([korrin, bo], 'short')).toEqual([{ actorId: 'korrin', resourceId: 'second-wind' }]);
    expect(restResourcesOf([korrin, bo], 'long')).toEqual([]);
  });
});
