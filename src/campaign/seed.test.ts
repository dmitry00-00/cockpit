// @vitest-environment node
// Шаг 4 «готово, когда партия, противники и мир поднимаются из сида одной командой». Одна команда — seedEngine().
// Числа здесь — таблица HANDOFF §13, а не то, что напечатал код: расхождение = ошибка вывода или компендиума.
import { describe, expect, it } from 'vitest';
import { EventLog } from '../engine/log';
import { journalEntries } from '../engine/journal';
import { localStorageStore, memoryStore, parseLog, serializeLog } from '../engine/persist';
import { emptyState } from '../engine/state';
import { MONSTERS } from '../rules/srd/monsters';
import { formatHarptos } from './calendar';
import { PARTY } from './party';
import { SEED_SEC, seedEngine, seedLog, seedState } from './seed';
import { DELTA, FACT, FACTION, LOCATION, THREAD } from './world';

const fixed = () => {
  let t = 1_000, n = 0;
  return { clock: { now: () => (t += 1) }, ids: { next: () => `e${++n}` } };
};

describe('одна команда', () => {
  it('seedEngine(): партия, противники и мир — и лог сида уже применён: предложения, заметка, концентрация, два удара', () => {
    const store = seedEngine(fixed());
    const { state, events } = store.getState();
    expect(events).toHaveLength(8);
    expect(state.party).toEqual(['bo', 'korrin', 'lyra', 'aldric']);
    expect(Object.keys(state.actors)).toHaveLength(8);
    expect(state.actors.bo.hp).toEqual({ current: 41, max: 49, temp: 0 });
    expect(state.actors.captain.hp).toEqual({ current: 45, max: 65, temp: 0 });
    expect(Object.keys(state.world.locations).length).toBeGreaterThan(0);
    expect(store.getState().canUndo).toBe(true);
  });

  it('с хранилищем: первый запуск пишет сид, второй поднимается из записанного, а не из сида заново', () => {
    const persist = memoryStore();
    const a = seedEngine({ persist, ...fixed() });
    a.getState().damage('korrin', 7, 'slashing', 'bandit-1');
    expect(persist.load()).toHaveLength(9); // 4 предложения + заметка + концентрация + 2 удара сида + урон
    const b = seedEngine({ persist, ...fixed() });
    expect(b.getState().events).toHaveLength(9);
    expect(b.getState().state).toEqual(a.getState().state);
    expect(b.getState().state.actors.bo.sheet?.portrait).toBe('bo-portrait');
    expect(b.getState().state.actors.korrin.hp.current).toBe(42);
  });
});

describe('партия §13', () => {
  const table = [
    // имя, класс, HP текущие/макс, AC, PP
    ['bo', 'Bo Tambernack', 'sledopyt', 41, 49, 16, 12],
    ['korrin', 'Korrin Battlehammer', 'voin', 49, 49, 18, 14],
    ['lyra', 'Lyra Moonwhisper', 'volsebnik', 32, 32, 15, 14],
    ['aldric', 'Brother Aldric', 'jrec', 38, 38, 18, 13],
  ] as const;

  it.each(table)('%s — %s: %s, %i/%i, AC %i, PP %i', (id, name, classId, current, max, ac, pp) => {
    const a = seedEngine(fixed()).getState().state.actors[id];
    expect(a.kind).toBe('pc');
    expect(a.name).toBe(name);
    expect(a.sheet?.classId).toBe(classId);
    expect(a.sheet?.level).toBe(5);
    expect(a.sheet?.proficiencyBonus).toBe(3);
    expect(a.hp).toEqual({ current, max, temp: 0 });
    expect(a.ac).toBe(ac);
    expect(a.passivePerception).toBe(pp);
    expect(a.conditions).toEqual({});
  });

  it('четыре портрета партии явно связаны со своими листами и переживают seed/replay', () => {
    const state = seedEngine(fixed()).getState().state;
    expect(PARTY.find(p => p.id === 'bo')?.portrait).toBe('bo-portrait');
    expect(state.actors.bo.sheet?.portrait).toBe('bo-portrait');
    expect(PARTY.find(p => p.id === 'korrin')?.portrait).toBe('codex-korrin-v1');
    expect(state.actors.korrin.sheet?.portrait).toBe('codex-korrin-v1');
    expect(PARTY.find(p => p.id === 'lyra')?.portrait).toBe('codex-lyra-v1');
    expect(state.actors.lyra.sheet?.portrait).toBe('codex-lyra-v1');
    expect(PARTY.find(p => p.id === 'aldric')?.portrait).toBe('codex-aldric-v1');
    expect(state.actors.aldric.sheet?.portrait).toBe('codex-aldric-v1');
  });

  it('снаряжение — стартовые наборы SRD (29.10): атаки на листе у всех четверых, доспех §13 из набора', () => {
    const actors = seedEngine(fixed()).getState().state.actors;
    const attacks = (id: string) => (actors[id].sheet?.attacks ?? []).map(x => `${x.name} ${x.toHit >= 0 ? '+' : ''}${x.toHit} ${x.damage}${x.disadvantage ? ' (помеха)' : ''}`);
    expect(attacks('bo')).toEqual(['Longbow +6 1d8 + 3 (помеха)', 'Shortsword +6 1d6 + 3']);
    expect(attacks('korrin')).toEqual(['Warhammer +6 1d8 + 3 / 1d10 + 3', 'Handaxe +6 1d6 + 3']);
    expect(attacks('lyra')).toEqual(['Dagger +5 1d4 + 2']);
    expect(attacks('aldric')).toEqual(['Mace +5 1d6 + 2', 'Crossbow, light +5 1d8 + 2']);
    for (const p of PARTY) expect(p.equipment?.length, p.name).toBeGreaterThan(0);
  });

  it('заклинания — списки SRD (29.10): DC и атака по листу, домен Life у Aldric — шесть всегда подготовленных', () => {
    const actors = seedEngine(fixed()).getState().state.actors;
    const sc = (id: string) => actors[id].sheet?.spellcasting;
    expect(sc('korrin')).toBeUndefined();
    expect(sc('bo')).toMatchObject({ ability: 'wis', saveDc: 13, kind: 'known', cantrips: [] });
    expect(sc('bo')!.spells).toContain('hunters-mark');
    expect(sc('lyra')).toMatchObject({ ability: 'int', saveDc: 15, attack: 7, kind: 'spellbook', maxLevel: 3 });
    expect([sc('lyra')!.cantrips.length, sc('lyra')!.spells.length]).toEqual([4, 14]);
    expect(sc('lyra')!.spells).toContain('mage-armor');
    expect(sc('aldric')).toMatchObject({ ability: 'wis', saveDc: 14, kind: 'prepared' });
    expect([sc('aldric')!.cantrips.length, sc('aldric')!.spells.length, sc('aldric')!.always.length]).toEqual([4, 8, 6]);
    expect(actors.aldric.sheet?.subclassId).toBe('jrec-jizni');
  });

  it('нереплеящийся лог сохраняется отдельной строкой до восстановления из сида', () => {
    const persist = memoryStore();
    // Событие, которое не пройдёт validate: урон по актёру, которого в сиде нет.
    const source = [{ id: 'x', seq: 0, at: 0, worldSec: 0, type: 'DAMAGE_APPLIED' as const, payload: { targetId: 'nobody', amount: 1 } }];
    persist.save(source);
    const reasons: string[] = [];
    let recoveryCopy: string | null | undefined;
    const store = seedEngine({ persist, ...fixed(), onRecover: (r, raw) => { reasons.push(r); recoveryCopy = raw; } });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/nobody/);
    expect(recoveryCopy).toBe(serializeLog(source));
    expect(persist.loadRecoveryCopy?.()).toBe(serializeLog(source));
    expect(store.getState().state.actors.bo.hp.current).toBe(41);
    expect(persist.load()).toHaveLength(8); // сид записан заново, битого лога больше нет
    // Без хранилища ошибка не глотается: ловить нечего и чистить нечего.
    expect(() => seedEngine({ ...fixed(), persist: undefined })).not.toThrow();
  });

  it('пустой ключ запускает сид, повреждённый JSON сохраняется дословно и доступен после перезагрузки', () => {
    const values = new Map<string, string>();
    let removes = 0;
    const persist = localStorageStore('campaign', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { removes++; values.delete(key); },
    });
    const missingReasons: string[] = [];
    const missing = seedEngine({ persist, ...fixed(), onRecover: reason => missingReasons.push(reason) });
    expect(missing.getState().events).toHaveLength(8);
    expect(missingReasons).toEqual([]);

    values.set('campaign', '{broken');
    const reasons: string[] = [];
    let recoveryCopy: string | null | undefined;
    const recovered = seedEngine({ persist, ...fixed(), onRecover: (reason, raw) => { reasons.push(reason); recoveryCopy = raw; } });
    expect(recovered.getState().events).toHaveLength(8);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/JSON/);
    expect(recoveryCopy).toBe('{broken');
    expect(values.get('campaign.recovery-original')).toBe('{broken');
    expect(removes).toBe(1);
    expect(parseLog(values.get('campaign')!)).toHaveLength(8);

    let copyAfterReload: string | null | undefined;
    const reloaded = seedEngine({ persist, ...fixed(), onRecoveryCopy: raw => { copyAfterReload = raw; } });
    expect(reloaded.getState().events).toHaveLength(8);
    expect(copyAfterReload).toBe('{broken');
  });

  it('если резервную копию нельзя записать, источник повреждённого журнала не очищается и не заменяется сидом', () => {
    const values = new Map<string, string>([['campaign', '{broken']]);
    let removes = 0;
    let writes = 0;
    const persist = localStorageStore('campaign', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === 'campaign.recovery-original') throw new Error('quota');
        writes++;
        values.set(key, value);
      },
      removeItem: key => { removes++; values.delete(key); },
    });
    const store = seedEngine({ persist, ...fixed() });
    expect(store.getState().events).toHaveLength(8);
    expect(values.get('campaign')).toBe('{broken');
    expect(values.has('campaign.recovery-original')).toBe(false);
    expect(removes).toBe(0);
    expect(writes).toBe(0);
  });

  it('нереплеящийся localStorage сохраняет исходное форматирование перед заменой основного журнала', () => {
    const raw = ' { "format": 1, "events": [{"id":"x","seq":0,"at":0,"worldSec":0,"type":"DAMAGE_APPLIED","payload":{"targetId":"nobody","amount":1}}] }\n';
    const values = new Map<string, string>([['campaign', raw]]);
    const persist = localStorageStore('campaign', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    });
    let recoveryCopy: string | null | undefined;
    const store = seedEngine({ persist, ...fixed(), onRecover: (_reason, copy) => { recoveryCopy = copy; } });
    expect(store.getState().events).toHaveLength(8);
    expect(recoveryCopy).toBe(raw);
    expect(values.get('campaign.recovery-original')).toBe(raw);
    expect(parseLog(values.get('campaign')!)).toHaveLength(8);
  });

  it('ошибка чтения localStorage не удаляет и не перезаписывает недоступный сохранённый лог', () => {
    const saved = serializeLog(seedLog());
    let stored = saved;
    let removes = 0;
    let writes = 0;
    const persist = localStorageStore('campaign', {
      getItem: () => { throw new Error('storage denied'); },
      setItem: (_key, value) => { writes++; stored = value; },
      removeItem: () => { removes++; stored = ''; },
    });
    const reasons: string[] = [];
    const store = seedEngine({ persist, ...fixed(), onRecover: reason => reasons.push(reason) });
    expect(store.getState().events).toHaveLength(8);
    expect(store.getState().state.actors.bo.hp.current).toBe(41);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/не удалось прочитать/);

    store.getState().damage('bo', 1);
    expect(store.getState().state.actors.bo.hp.current).toBe(40);
    expect(removes).toBe(0);
    expect(writes).toBe(0);
    expect(stored).toBe(saved);
    expect(parseLog(stored)).toHaveLength(8);
  });

  it('текущие хиты — не начальное состояние, а урон в логе; начальное состояние — все целы', () => {
    const s = seedState();
    expect(s.actors.bo.hp.current).toBe(49);
    expect(s.actors.captain.hp.current).toBe(65);
    expect(s.actors.bo.concentration).toBeUndefined(); // концентрация — событие, не данные
    expect(s.deltas).toEqual({}); // предложения — события, не данные
    const log = seedLog();
    expect(log.map(e => e.type)).toEqual(['WORLD_DELTA_PROPOSED', 'WORLD_DELTA_PROPOSED', 'WORLD_DELTA_PROPOSED', 'WORLD_DELTA_PROPOSED', 'NOTE_ADDED', 'CONCENTRATION_STARTED', 'DAMAGE_APPLIED', 'DAMAGE_APPLIED']);
    // Заметка о прибытии — за двадцать минут до сида, остальное — в его момент.
    expect(log.every(e => e.worldSec === SEED_SEC || (e.type === 'NOTE_ADDED' && e.worldSec === SEED_SEC - 20 * 60))).toBe(true);
    EventLog.check(log);
  });

  it('концентрация Bo: Hunter\'s Mark ещё 38 минут; Mage Armor у Lyra — эффект ещё 7 часов', () => {
    const { actors } = seedEngine(fixed()).getState().state;
    expect(actors.bo.concentration).toEqual({ spell: "Hunter's Mark", untilSec: SEED_SEC + 38 * 60 });
    expect(actors.lyra.concentration).toBeUndefined();
    expect(actors.lyra.effects).toEqual([{ name: 'Mage Armor', untilSec: SEED_SEC + 7 * 3600, sourceId: 'lyra' }]);
    for (const id of ['korrin', 'aldric']) {
      expect(actors[id].concentration).toBeUndefined();
      expect(actors[id].effects).toBeUndefined();
    }
  });

  it('лист персонажа ссылается на компендиум: раса, класс, умения 5-го уровня по id и имени', () => {
    const { actors } = seedEngine(fixed()).getState().state;
    expect(actors.bo.sheet).toMatchObject({ raceId: 'poluroslik', subraceId: 'poluroslik-legkonogiy', classId: 'sledopyt', armor: 'scale-mail' });
    expect(actors.bo.sheet?.features).toContainEqual({ id: 'dopolnitel-naa-ataka', name: 'Дополнительная атака', level: 5 });
    expect(actors.korrin.sheet).toMatchObject({ raceId: 'dvarf', subraceId: 'dvarf-holmovoy', classId: 'voin', armor: 'chain-mail', shield: true });
    expect(actors.lyra.sheet).toMatchObject({ raceId: 'el-f', subraceId: 'el-f-vyssiy', classId: 'volsebnik' });
    expect(actors.lyra.sheet?.armor).toBeUndefined();
    expect(actors.aldric.sheet).toMatchObject({ raceId: 'celovek', classId: 'jrec', armor: 'scale-mail', shield: true });
    expect(actors.aldric.sheet?.subraceId).toBeUndefined();
    for (const p of PARTY) {
      const sheet = actors[p.id].sheet!;
      expect(sheet.features.length, p.name).toBeGreaterThan(0);
      expect(sheet.traits.length, p.name).toBeGreaterThan(0);
      expect(Object.values(sheet.abilities).every(v => v >= 8 && v <= 20), p.name).toBe(true);
    }
  });
});

describe('противники §13', () => {
  it('Bandit Captain CR 2, AC 15, 45/65, скорость 30; три Bandit CR 1/8, 11/11', () => {
    const { actors, encounter } = seedEngine(fixed()).getState().state;
    const captain = actors.captain;
    expect(captain).toMatchObject({ kind: 'monster', name: 'Bandit Captain', monsterId: 'bandit-captain', ac: 15, passivePerception: 10 });
    expect(captain.hp).toEqual({ current: 45, max: 65, temp: 0 });
    expect(MONSTERS[captain.monsterId!]).toMatchObject({ cr: '2', speed: 30 });
    const bandits = Object.values(actors).filter(a => a.monsterId === 'bandit');
    expect(bandits).toHaveLength(3);
    for (const b of bandits) {
      expect(b).toMatchObject({ kind: 'monster', ac: 12, passivePerception: 10 });
      expect(b.hp).toEqual({ current: 11, max: 11, temp: 0 });
    }
    expect(MONSTERS.bandit.cr).toBe('1/8');
    // Бой не начат (F1): броски инициативы известны у всех восьми, порядок появится с ENCOUNTER_STARTED.
    expect(encounter).toEqual({ active: false, round: 0, turnIndex: 0, order: [] });
    expect(Object.values(actors).filter(a => a.initiative !== undefined)).toHaveLength(8);
  });
});

describe('мир §13', () => {
  it('пакет FR предоставляет корни лестницы, а сид продолжает их устойчивыми id', () => {
    const { world } = seedEngine(fixed()).getState().state;
    expect(world.locations[LOCATION.greatWheel]).toMatchObject({ name: 'Великое Колесо', scale: 'cosmology' });
    expect(world.locations[LOCATION.realmspace]).toMatchObject({ name: 'Realmspace', scale: 'system', parentId: LOCATION.material });
    expect(world.locations[LOCATION.toril]).toMatchObject({ name: 'Toril', scale: 'planet', parentId: LOCATION.realmspace, geo: { map: 'toril' } });
    expect(world.locations[LOCATION.faerun]).toMatchObject({ name: 'Faerûn', scale: 'continent', parentId: LOCATION.toril, ref: 'place:0b786ca2-0cb5-413e-9e75-a7962ca03cfe' });
  });

  it('Neverwinter 23k, опасность средняя, цены +10%; фракции; нити со сроками от времени сида', () => {
    const { world } = seedEngine(fixed()).getState().state;
    expect(world.locations[LOCATION.neverwinter]).toMatchObject({ name: 'Neverwinter', scale: 'settlement', population: 23_000, danger: 'medium', pricePercent: 10 });
    expect(world.factions[FACTION.zhentarim]).toMatchObject({ name: 'Zhentarim', renown: 0, influencePercent: 45, trend: 1, goal: 'контроль над Triboar Trail' });
    expect(world.factions[FACTION.lordsAlliance]).toMatchObject({ name: "Lords' Alliance", renown: 12 });
    expect(world.factions[FACTION.harpers]).toMatchObject({ name: 'Harpers', renown: 5 });
    const day = 86_400;
    const caravan = world.threads[THREAD.missingCaravan];
    expect(caravan.name).toBe('The Missing Caravan');
    expect((SEED_SEC - caravan.openedSec) / day).toBe(12);
    const owl = world.threads[THREAD.oldOwlWell];
    expect(owl.name).toBe('Old Owl Well');
    expect((SEED_SEC - owl.lastTouchedSec) / day).toBe(9);
    expect(world.threads[THREAD.moonAndPack].name).toBe('Луна и стая');
    expect(Object.values(world.threads).every(t => t.status === 'open' && t.openedSec <= t.lastTouchedSec)).toBe(true);
  });

  it('четыре предложения pending, causeId — нить или факт мастера, нити — явно; секреты привязаны к нитям', () => {
    const { deltas, facts, world } = seedEngine(fixed()).getState().state;
    expect(Object.keys(deltas)).toHaveLength(4);
    for (const d of Object.values(deltas)) {
      expect(d.status).toBe('pending');
      expect(world.threads[d.causeId] ?? facts[d.causeId], d.subject).toBeDefined();
      expect(d.threadIds?.every(id => world.threads[id]), d.subject).toBe(true);
    }
    expect(deltas[DELTA.zhentarimTrail]).toMatchObject({ was: 'влияние 2', now: 'влияние 3', causeId: THREAD.missingCaravan });
    expect(deltas[DELTA.ironPrices]).toMatchObject({ was: 'базовые', now: '+10%', causeId: THREAD.missingCaravan });
    expect(deltas[DELTA.lycanthropes]).toMatchObject({ was: '×1', now: '×2 на 3 ночи', causeId: THREAD.moonAndPack });
    // Слух растёт из факта мастера: принятый слух связывается в журнале с ним (шаг 7).
    expect(deltas[DELTA.owlWellRumor]).toMatchObject({ now: 'у Old Owl Well видели восставших мертвецов', causeId: FACT.owlWellUndead, threadIds: [THREAD.oldOwlWell] });
    expect(facts[FACT.owlWellUndead]).toMatchObject({ visibility: 'dm', subjectId: LOCATION.oldOwlWell, threadIds: [THREAD.oldOwlWell] });
    expect(facts[FACT.zhentarimAgent]).toMatchObject({ visibility: 'dm', subjectId: LOCATION.neverwinter, threadIds: [THREAD.missingCaravan] });
    expect(Object.values(facts).every(f => f.visibility === 'dm')).toBe(true);
  });

  it('время: 15 Mirtul 1492 DR, утро; темп — часы', () => {
    const { time } = seedEngine(fixed()).getState().state;
    expect(time.sec).toBe(SEED_SEC);
    expect(formatHarptos(time.sec)).toBe('15 Mirtul 1492 DR, 08:00');
    expect(time.tempo).toBe('hour');
  });
});

describe('сид и движок', () => {
  it('лог связен, реплей даёт то же состояние, журнал читает удары сида, Ctrl+Z их откатывает', () => {
    const store = seedEngine(fixed());
    const log = new EventLog(seedState(), JSON.parse(JSON.stringify(store.getState().events)), fixed());
    expect(log.state).toEqual(store.getState().state);
    const j = journalEntries(store.getState().events, store.getState().state);
    // Предложения в журнал не пишутся; заметка, концентрация и удары — да.
    expect(j.map(e => e.text)).toEqual(['Партия прибыла в Neverwinter через Triboar Trail', "Концентрация: Hunter's Mark — Bo Tambernack", 'Урон 8 (slashing) по Bo Tambernack от Bandit Captain', 'Урон 20 (piercing) по Bandit Captain от Bo Tambernack']);
    expect(j[0]).toMatchObject({ threadIds: [THREAD.missingCaravan], scale: 'settlement', origin: 'dm', secret: false });
    store.getState().undo();
    expect(store.getState().state.actors.captain.hp.current).toBe(65);
    expect(store.getState().toast).toBe('Отменено: Урон 20 (piercing) по Bandit Captain от Bo Tambernack');
    store.getState().redo();
    expect(store.getState().state.actors.captain.hp.current).toBe(45);
  });

  it('seedState() каждый раз новый и не делит объекты с прошлым вызовом; emptyState() знает мир', () => {
    const a = seedState(), b = seedState();
    expect(a).toEqual(b);
    expect(a.actors.bo).not.toBe(b.actors.bo);
    expect(emptyState().world).toEqual({ locations: {}, factions: {}, threads: {} });
  });

  it('встроенный портрет входит в снимок ACTOR_SPAWNED и возвращается при реплее', () => {
    const store = seedEngine(fixed());
    const actor = { ...structuredClone(store.getState().state.actors.bo), id: 'bo-copy', name: 'Bo copy' };
    store.getState().spawn(actor, false);
    const snapshotEvent = store.getState().events.at(-1)!;
    expect(snapshotEvent).toMatchObject({ type: 'ACTOR_SPAWNED', payload: { actor: { sheet: { portrait: 'bo-portrait' } } } });
    const replay = new EventLog(seedState(), JSON.parse(JSON.stringify(store.getState().events)), fixed());
    expect(replay.state.actors['bo-copy'].sheet?.portrait).toBe('bo-portrait');
  });

  it('начать бой, ход, урон, состояние — обычная работа движка на сиде', () => {
    const store = seedEngine(fixed());
    store.getState().nextTurn(); // бой не начат — ничего
    expect(store.getState().state.encounter.active).toBe(false);
    store.getState().startEncounter();
    expect(store.getState().state.encounter).toMatchObject({ active: true, round: 1, turnIndex: 0 });
    expect(store.getState().state.encounter.order).toEqual(['korrin', 'bo', 'captain', 'lyra', 'bandit-1', 'aldric', 'bandit-2', 'bandit-3']);
    store.getState().damage('bandit-1', 11, 'slashing', 'korrin');
    expect(store.getState().state.actors['bandit-1'].hp.current).toBe(0);
    store.getState().dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bandit-1', conditionId: 'unconscious' } });
    expect(store.getState().state.actors['bandit-1'].conditions.unconscious).toEqual({});
    store.getState().dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: DELTA.ironPrices, subject: 'Цены на железо и оружие · Neverwinter', was: 'базовые', now: '+10%', causeId: THREAD.missingCaravan } });
    expect(store.getState().state.deltas[DELTA.ironPrices].status).toBe('accepted');
    store.getState().dispatch({ type: 'FACT_REVEALED', payload: { factId: FACT.owlWellUndead, audience: 'players' } });
    expect(store.getState().state.facts[FACT.owlWellUndead].visibility).toBe('players');
  });
});
