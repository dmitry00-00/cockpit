// Лестница масштабов (шаг 10) — чистые функции над состоянием: уровни есть, когда на них есть место;
// путь — по одному месту на уровень; `[` и `]` двигают уровень, а точка фокуса сохраняется. Проверяется
// на синтетическом мире с той же формой, что §13: Великое Колесо → … → Neverwinter → Южные ворота, плюс
// подрегион и здание, висящее прямо на регионе (Old Owl Well), — на них ловятся пропуски уровней.
import { describe, expect, it } from 'vitest';
import {
  LEVEL_TEMPO, ancestorsOf, childrenOf, descendantsAt, focusOf, initialLadder, isWithin, jumpTo, ladderLevels, moveLevel, namedIn,
  normalizeLadder, partyPlaceId, pathTo, pendingFor, pendingTargets, placeCounts, selectPlace, type Ladder,
} from './ladder';
import { journalEntries } from './journal';
import { emptyState, type Actor, type State } from './state';
import { createEngineStore } from './store';

function actor(id: string, name: string, locationId?: string): Actor {
  return { id, name, kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {}, initiative: 10, locationId };
}

function world(): State {
  const s = emptyState();
  s.actors = { bo: actor('bo', 'Bo'), lyra: actor('lyra', 'Lyra') };
  s.party = ['bo', 'lyra'];
  s.world.locations = {
    wheel: { id: 'wheel', name: 'Великое Колесо', scale: 'cosmology' },
    material: { id: 'material', name: 'Материальный', scale: 'plane', parentId: 'wheel' },
    toril: { id: 'toril', name: 'Toril', scale: 'planet', parentId: 'material' }, // системы нет — уровень скрыт
    faerun: { id: 'faerun', name: 'Faerûn', scale: 'continent', parentId: 'toril' },
    scn: { id: 'scn', name: 'Sword Coast North', scale: 'region', parentId: 'faerun' },
    nw: { id: 'nw', name: 'Neverwinter', scale: 'settlement', parentId: 'scn', population: 23_000 },
    gate: { id: 'gate', name: 'Южные ворота', scale: 'building', parentId: 'nw' },
    trail: { id: 'trail', name: 'Triboar Trail', scale: 'region', parentId: 'scn' },
    well: { id: 'well', name: 'Old Owl Well', scale: 'building', parentId: 'scn' },
  };
  s.world.factions = { zh: { id: 'zh', name: 'Zhentarim', renown: 0, influencePercent: 45, trend: 1 } };
  return s;
}

const ids = (list: { id: string }[]) => list.map(l => l.id);

describe('уровни и путь', () => {
  it('ladderLevels: только уровни с местом, по порядку; система скрыта; бой — пока идёт бой', () => {
    const s = world();
    expect(ladderLevels(s)).toEqual(['cosmology', 'plane', 'planet', 'continent', 'region', 'settlement', 'building']);
    s.encounter.active = true;
    expect(ladderLevels(s)).toEqual(['cosmology', 'plane', 'planet', 'continent', 'region', 'settlement', 'building', 'battle']);
  });

  it('partyPlaceId: место первого в партии с locationId, иначе первое поселение', () => {
    const s = world();
    expect(partyPlaceId(s)).toBe('nw');
    s.actors.lyra = actor('lyra', 'Lyra', 'well');
    expect(partyPlaceId(s)).toBe('well');
    s.actors.bo = actor('bo', 'Bo', 'trail');
    expect(partyPlaceId(s)).toBe('trail');
    expect(partyPlaceId(emptyState())).toBeUndefined();
  });

  it('ancestorsOf, pathTo: путь — по одному месту на уровень, подрегион занимает уровень региона; цикл обрывается', () => {
    const s = world();
    expect(ids(ancestorsOf(s, 'gate'))).toEqual(['nw', 'scn', 'faerun', 'toril', 'material', 'wheel']);
    expect(pathTo(s, 'gate')).toEqual({ building: 'gate', settlement: 'nw', region: 'scn', continent: 'faerun', planet: 'toril', plane: 'material', cosmology: 'wheel' });
    // Подрегион: на уровне региона — он сам, а не родитель; поселения на пути нет.
    expect(pathTo(s, 'trail')).toEqual({ region: 'trail', continent: 'faerun', planet: 'toril', plane: 'material', cosmology: 'wheel' });
    expect(pathTo(s, 'нет')).toEqual({});
    s.world.locations.wheel = { ...s.world.locations.wheel, parentId: 'gate' };
    expect(ids(ancestorsOf(s, 'gate'))).toEqual(['nw', 'scn', 'faerun', 'toril', 'material', 'wheel']);
  });

  it('childrenOf, descendantsAt, isWithin', () => {
    const s = world();
    expect(ids(childrenOf(s, 'scn'))).toEqual(['nw', 'trail', 'well']);
    expect(ids(descendantsAt(s, 'scn', 'building'))).toEqual(['gate', 'well']);
    expect(ids(descendantsAt(s, 'scn', 'region'))).toEqual(['trail']);
    expect(isWithin(s, 'gate', 'scn')).toBe(true);
    expect(isWithin(s, 'scn', 'scn')).toBe(true);
    expect(isWithin(s, 'well', 'nw')).toBe(false);
  });

  it('initialLadder: путь к месту партии, уровень — регион; без региона — самый нижний уровень пути; пустой мир — пусто', () => {
    const s = world();
    const l = initialLadder(s);
    expect(l.level).toBe('region');
    expect(l.path).toEqual(pathTo(s, 'nw'));
    expect(focusOf(s, l)?.name).toBe('Sword Coast North');
    expect(initialLadder(s, 'settlement').level).toBe('settlement');
    expect(initialLadder(s, 'battle')).toEqual({ level: 'settlement', path: pathTo(s, 'nw') });
    expect(initialLadder(emptyState())).toEqual({ level: 'region', path: {} });
  });

  it('LEVEL_TEMPO: от лет на Колесе до раундов в бою', () => {
    expect(LEVEL_TEMPO.cosmology).toBe('year');
    expect(LEVEL_TEMPO.planet).toBe('season');
    expect(LEVEL_TEMPO.region).toBe('day');
    expect(LEVEL_TEMPO.battle).toBe('round');
  });
});

describe('движение по лестнице', () => {
  it('`[` и `]`: вверх до Колеса и обратно вниз до здания — точка фокуса сохраняется на каждом уровне', () => {
    const s = world();
    let l = initialLadder(s); // регион · Sword Coast North, путь до Neverwinter
    l = moveLevel(s, l, 1);
    expect([l.level, focusOf(s, l)?.id]).toEqual(['settlement', 'nw']);
    l = moveLevel(s, l, 1);
    expect([l.level, focusOf(s, l)?.id]).toEqual(['building', 'gate']); // первый потомок: пути ниже не было
    expect(moveLevel(s, l, 1)).toBe(l); // ниже здания без боя некуда — тот же объект
    const up: string[] = [];
    for (let i = 0; i < 7; i++) { l = moveLevel(s, l, -1); up.push(`${l.level}:${focusOf(s, l)?.id}`); }
    expect(up).toEqual(['settlement:nw', 'region:scn', 'continent:faerun', 'planet:toril', 'plane:material', 'cosmology:wheel', 'cosmology:wheel']);
    // Путь ниже не тронут: вниз возвращает туда же, вплоть до ворот.
    const down: string[] = [];
    for (let i = 0; i < 6; i++) { l = moveLevel(s, l, 1); down.push(`${l.level}:${focusOf(s, l)?.id}`); }
    expect(down).toEqual(['plane:material', 'planet:toril', 'continent:faerun', 'region:scn', 'settlement:nw', 'building:gate']);
  });

  it('уровни без места на ветке пропускаются: у Old Owl Well нет поселения — `[` уводит сразу в регион', () => {
    const s = world();
    const l = selectPlace(s, initialLadder(s), 'well');
    expect([l.level, focusOf(s, l)?.id]).toEqual(['building', 'well']);
    const up = moveLevel(s, l, -1);
    expect([up.level, focusOf(s, up)?.id]).toEqual(['region', 'scn']);
    // И обратно: `]` возвращает к колодцу — путь помнит его, хотя поселение на ветке региона есть и ближе.
    const down = moveLevel(s, up, 1);
    expect([down.level, focusOf(s, down)?.id]).toEqual(['building', 'well']);
    expect(down.path.settlement).toBeUndefined();
  });

  it('selectPlace: подрегион занимает уровень региона; путь ниже сохраняется, только если он внутри выбранного', () => {
    const s = world();
    const base = selectPlace(s, initialLadder(s), 'gate'); // здание · Южные ворота, путь полный
    const trail = selectPlace(s, base, 'trail');
    expect(trail.level).toBe('region');
    expect(trail.path).toEqual({ region: 'trail', continent: 'faerun', planet: 'toril', plane: 'material', cosmology: 'wheel' }); // nw и gate не внутри Triboar Trail — сброшены
    const scn = selectPlace(s, base, 'scn');
    expect(scn.path.settlement).toBe('nw');
    expect(scn.path.building).toBe('gate'); // внутри Sword Coast North — остались
    expect(selectPlace(s, base, 'нет')).toBe(base);
  });

  it('jumpTo: клик по крошке — прыжок на уровень; на свой уровень и на недоступный — без изменений', () => {
    const s = world();
    const l = initialLadder(s);
    expect(jumpTo(s, l, 'region')).toBe(l);
    expect(jumpTo(s, l, 'battle')).toBe(l); // боя нет
    expect(jumpTo(s, l, 'system')).toBe(l); // уровня нет в сеттинге и предка на нём нет
    const top = jumpTo(s, l, 'cosmology');
    expect([top.level, focusOf(s, top)?.id]).toEqual(['cosmology', 'wheel']);
    expect(top.path.settlement).toBe('nw'); // путь вниз сохранён
    const gate = jumpTo(s, top, 'building');
    expect([gate.level, focusOf(s, gate)?.id]).toEqual(['building', 'gate']);
    // Из подрегиона вниз некуда — крошка «здание» не срабатывает.
    const trail = selectPlace(s, l, 'trail');
    expect(jumpTo(s, trail, 'building')).toBe(trail);
    expect(jumpTo(s, trail, 'settlement')).toBe(trail);
  });

  it('бой: начался — `]` доходит до боя, `[` из боя возвращает на место, откуда он начался; кончился — normalizeLadder уводит с уровня боя', () => {
    const s = world();
    s.encounter.active = true;
    let l = selectPlace(s, initialLadder(s), 'nw');
    l = moveLevel(s, l, 1);
    expect(l.level).toBe('building');
    l = moveLevel(s, l, 1);
    expect(l.level).toBe('battle');
    expect(focusOf(s, l)).toBeUndefined();
    expect(moveLevel(s, l, 1)).toBe(l);
    const back = moveLevel(s, l, -1);
    expect([back.level, focusOf(s, back)?.id]).toEqual(['building', 'gate']);
    // Крошка региона из боя — предок места, откуда бой начался.
    const region = jumpTo(s, l, 'region');
    expect([region.level, focusOf(s, region)?.id]).toEqual(['region', 'scn']);
    expect(normalizeLadder(s, l)).toBe(l);
    s.encounter.active = false;
    const after = normalizeLadder(s, l);
    expect([after.level, focusOf(s, after)?.id]).toEqual(['building', 'gate']);
    // Уровень, которого больше нет в мире, — на ближайший с фокусом; вовсе без пути — с начала.
    const noGate: Ladder = { level: 'building', path: { building: 'нет', settlement: 'nw', region: 'scn' } };
    expect(normalizeLadder(s, noGate)).toEqual({ level: 'settlement', path: noGate.path });
    expect(normalizeLadder(s, { level: 'battle', path: {} })).toEqual(initialLadder(s));
  });
});

describe('цели предложений и счётчики мест', () => {
  it('pendingTargets: цель патча и имена в теме по границам слова; решённые не считаются', () => {
    const s = world();
    s.world.locations.wood = { id: 'wood', name: 'Neverwinter Wood', scale: 'region', parentId: 'scn' };
    s.deltas = {
      a: { id: 'a', scale: 'settlement', subject: 'Цены · Neverwinter', was: '+10%', now: '+15%', cause: '', causeId: 'x', status: 'pending', patch: { kind: 'location', id: 'nw', field: 'pricePercent', value: 15 } },
      b: { id: 'b', scale: 'region', subject: 'Встречи с ликантропами · Neverwinter Wood', was: '×1', now: '×2', cause: '', causeId: 'x', status: 'pending' },
      c: { id: 'c', scale: 'continent', subject: 'Zhentarim · влияние', was: '45%', now: '46%', cause: '', causeId: 'x', status: 'accepted', patch: { kind: 'faction', id: 'zh', field: 'influencePercent', value: 46 } },
    };
    expect([...pendingTargets(s)].sort()).toEqual(['nw', 'wood']);
    expect(pendingFor(s, 'nw').map(d => d.id)).toEqual(['a']);
    expect(pendingFor(s, 'wood').map(d => d.id)).toEqual(['b']);
    expect(pendingFor(s, 'zh')).toEqual([]);
    const named = Object.values(s.world.locations);
    expect(namedIn('Встречи · Neverwinter Wood', named)).toEqual(['wood']);
    expect(namedIn('Neverwinter и Neverwinter Wood', named)).toEqual(['wood', 'nw']);
    expect(namedIn('Neverwinterская', named)).toEqual([]);
    expect(namedIn('что-то', [{ id: 'x', name: '' }])).toEqual([]);
  });

  it('placeCounts: упоминания в записях (одно на запись) плюс факты о месте; ноль не пишется', () => {
    const s = world();
    const store = createEngineStore(s);
    store.getState().note('Партия прибыла в Neverwinter через Triboar Trail, Neverwinter шумит', [], 'settlement');
    store.getState().note('Слух про Old Owl Well', [], 'region');
    const st = store.getState().state;
    const entries = journalEntries(store.getState().events, st);
    const facts = [{ id: 'f', text: 'секрет', visibility: 'dm' as const, subjectId: 'well' }, { id: 'g', text: 'не о месте', visibility: 'dm' as const, subjectId: 'bo' }];
    const counts = placeCounts(entries, st, facts);
    expect(counts.get('nw')).toBe(1);
    expect(counts.get('trail')).toBe(1);
    expect(counts.get('well')).toBe(2);
    expect(counts.has('gate')).toBe(false);
  });
});
