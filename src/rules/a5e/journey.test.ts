import { beforeAll, describe, expect, it } from 'vitest';
import { DIFFICULT } from '../../map/terrain';
import {
  JOURNEY_ACTIVITIES, JOURNEY_META, JOURNEY_REGIONS, activityDc, loadJourney, encounterAt, journeyLegs, REGION_OF_TERRAIN, supplyNeeded, tierOfLevel,
  weatherAt,
} from './journey';

// Данные похода — отдельный кусок (ROADMAP 0.5): до загрузки экспорты пусты.
beforeAll(async () => {
  expect(Object.keys(JOURNEY_REGIONS)).toHaveLength(0);
  await loadJourney();
});

describe('поход A5E — данные', () => {
  it('18 регионов, у каждого таблицы уровней 0–4; строки в пределах 1–100; источник — A5E SRD CC BY 4.0', () => {
    expect(JOURNEY_META.source).toContain('CC BY 4.0');
    expect(Object.keys(JOURNEY_REGIONS)).toHaveLength(18);
    for (const r of Object.values(JOURNEY_REGIONS)) {
      expect(Object.keys(r.encounters).sort(), r.id).toEqual(['0', '1', '2', '3', '4']);
      for (const [tier, rows] of Object.entries(r.encounters)) {
        const hit = new Set(rows.flatMap(x => Array.from({ length: x.to - x.from + 1 }, (_, i) => x.from + i)));
        const gaps = r.gaps?.[tier] ?? [];
        // Без записанных дыр таблица покрывает 1–100 целиком.
        expect(hit.size + gaps.length, `${r.id} ${tier}`).toBe(100);
        for (const g of gaps) expect(hit.has(g)).toBe(false);
      }
    }
    for (const id of Object.values(REGION_OF_TERRAIN)) if (id) expect(JOURNEY_REGIONS[id], id).toBeDefined();
  });

  it('14 занятий в пути с навыком и исходами дословно', () => {
    expect(JOURNEY_ACTIVITIES.map(a => a.name)).toContain('Hunt and Gather');
    expect(JOURNEY_ACTIVITIES).toHaveLength(14);
    const hunt = JOURNEY_ACTIVITIES.find(a => a.id === 'hunt-and-gather')!;
    expect(hunt.skills).toEqual(['survival']);
    expect(hunt.outcomes.success).toBe('The adventurer gains 1 Supply per day spent doing this journey activity.');
  });
});

describe('поход A5E — расчёт', () => {
  it('DC занятия: уровень 0 — 10, 4 — 18; плохая погода +2, враждебные земли +4', () => {
    expect(activityDc(0)).toBe(10);
    expect(activityDc(4)).toBe(18);
    expect(activityDc(1, ['Inclement Weather', 'Hostile Territory'])).toBe(18);
    expect(tierOfLevel(5)).toBe(2);
    expect(tierOfLevel(4)).toBe(1);
  });

  it('путь режется на регионы: равнина с холмами — один регион; лес — трудная местность SRD, дни вдвое', () => {
    const legs = journeyLegs({ g: 30, h: 18, f: 12, u: 5 }, 'normal', 1, DIFFICULT);
    expect(legs.map(l => [l.region.id, l.miles, l.days])).toEqual([['rolling-grasslands', 48, 2], ['tangled-forest', 12, 1]]);
    expect(legs[0].dc).toBe(12);
  });

  it('припасы: Small и Medium — 1 в день, Large — 2; ночёвки по целым дням', () => {
    expect(supplyNeeded(2.5, { small: 4 })).toBe(12);
    expect(supplyNeeded(1, { small: 3, large: 1 })).toBe(5);
  });

  it('встреча и погода по таблице региона', () => {
    const row = encounterAt('tangled-forest', 1, 2)!;
    expect(row).toMatchObject({ name: 'Allosaurus', type: 'monster' });
    expect(encounterAt('tangled-forest', 1, 15)?.type).toBe('scenery');
    expect(encounterAt('blasted-badlands', 4, 54)).toBeNull();
    expect(weatherAt('tangled-forest', 3)).toBe('clear');
    expect(weatherAt('tangled-forest', 18, true)).toBe('snow');
  });
});
