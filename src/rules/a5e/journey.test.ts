import { beforeAll, describe, expect, it } from 'vitest';
import { DIFFICULT } from '../../map/terrain';
import {
  JOURNEY_ACTIVITIES, JOURNEY_META, JOURNEY_REGIONS, activityDc, loadJourney, encounterAt, journeyLegs, REGION_OF_TERRAIN, supplyNeeded, tierOfLevel,
  weatherAt, activityResult, regionActivityMods, roadMilesAsPace, settlementMarks, SETTLEMENT_REGION, UNDERGROUND_REGION,
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

  it('дорога — Open Roads: на милю в час быстрее, 32 мили обычным темпом — день; поселения и Подземье — свои регионы', () => {
    expect(roadMilesAsPace(32, 'normal')).toBe(24);
    expect(roadMilesAsPace(10, 'fast')).toBe(8);
    const legs = journeyLegs({ f: 12 }, 'normal', 1, DIFFICULT, { 'open-roads': 64, 'urban-township': 2, 'country-shire': 0.2 });
    expect(legs.map(l => [l.region.id, l.miles, l.days])).toEqual([['open-roads', 64, 2], ['tangled-forest', 12, 1], ['urban-township', 2, 0.1]]);
    expect(JOURNEY_REGIONS['open-roads'].fields['Fast Travel']).toBe('Adventurers move one mile per hour faster when traveling along open roads.');
    expect(journeyLegs({}, 'normal', 2, DIFFICULT, { [UNDERGROUND_REGION]: 48 }).map(l => [l.region.name, l.days, l.dc])).toEqual([['Underland Realm', 2, 14]]);
  });

  it('поселения справочника: город и городок — Urban Township, деревня — Country Shire; радиус в милях; «по GIS» — нет', () => {
    for (const s of Object.values(SETTLEMENT_REGION)) expect(JOURNEY_REGIONS[s.region]).toBeDefined();
    const marks = settlementMarks([
      { x: 1, y: 1, kind: 'City' }, { x: 2, y: 2, kind: 'Village' }, { x: 3, y: 3, kind: 'Town', approx: true }, { x: 4, y: 4, kind: 'Ruins' },
    ], 0.5);
    expect(marks).toEqual([{ x: 1, y: 1, r: 4, region: 'urban-township' }, { x: 2, y: 2, r: 6, region: 'country-shire' }]);
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

  it('поправки занятий по полю региона: преимущество, помеха, «нельзя», кость компетентности, авто-исходы, условие', () => {
    const bad = regionActivityMods(JOURNEY_REGIONS['blasted-badlands']);
    expect(bad.scout.kind).toBe('advantage');
    expect(bad['befriend-animal'].kind).toBe('disadvantage');
    expect(bad['hunt-and-gather'].kind).toBe('impossible');
    expect(regionActivityMods(JOURNEY_REGIONS['urban-township']).rob.kind).toBe('expertise');
    const sea = regionActivityMods(JOURNEY_REGIONS['restless-sea']);
    expect(sea['cover-tracks']).toMatchObject({ kind: 'auto-success', conditional: true });
    expect(sea.track).toMatchObject({ kind: 'auto-failure', conditional: true });
    expect(regionActivityMods(JOURNEY_REGIONS['haunted-lands']).pray).toMatchObject({ kind: 'disadvantage', conditional: true });
    // Фраза без имени занятия («tracks left in the snow») не угадывается.
    expect(regionActivityMods(JOURNEY_REGIONS['frozen-wastes']).track).toBeUndefined();
    expect(regionActivityMods(JOURNEY_REGIONS['open-roads'])).toEqual({});
  });

  it('исход: DC и выше — успех; натуральные 20 и 1 — только предложение критического исхода', () => {
    expect(activityResult(10, 14, 14)).toEqual({ success: true });
    expect(activityResult(9, 13, 14)).toEqual({ success: false });
    expect(activityResult(20, 22, 14)).toEqual({ success: true, maybeCritical: 'success' });
    expect(activityResult(1, 6, 14)).toEqual({ success: false, maybeCritical: 'failure' });
  });
});
