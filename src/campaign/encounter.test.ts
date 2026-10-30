// Бой за живым столом: модификатор инициативы из листа или блока SRD, кандидаты в порядок (партия первой,
// выбывшие — нет), устойчивая сортировка по убыванию, свободные id и имена новичков, `count` штук одного блока.
import { describe, expect, it } from 'vitest';
import { createEngineStore } from '../engine';
import { MONSTERS, loadMonsterLibraries } from '../rules/srd/monsters';
import { currentOrder, encounterCandidates, encounterMonsterId, initiativeMod, nextActorId, sortInitiative, spawnMonsters, suggestMonsterName } from './encounter';
import { seedState } from './seed';

describe('initiativeMod', () => {
  it('персонаж — DEX из листа (Bo 16 → +3), монстр — из блока SRD (Bandit Captain DEX 16 → +3, Bandit 12 → +1), NPC без листа — 0', () => {
    const s = seedState();
    expect(initiativeMod(s.actors.bo)).toBe(3);
    expect(initiativeMod(s.actors.captain)).toBe(Math.floor((MONSTERS['bandit-captain'].abilities.dex - 10) / 2));
    expect(initiativeMod(s.actors['bandit-1'])).toBe(1);
    expect(initiativeMod({ ...s.actors.bo, sheet: undefined, kind: 'npc' })).toBe(0);
  });
});

describe('encounterCandidates и sortInitiative', () => {
  it('партия в порядке корешка, затем остальные; выбывший не кандидат', () => {
    const s = seedState();
    s.actors['bandit-2'].removed = true;
    expect(encounterCandidates(s).map(a => a.id)).toEqual(['bo', 'korrin', 'lyra', 'aldric', 'captain', 'bandit-1', 'bandit-3']);
  });

  it('сортировка по убыванию, равные — как переданы; исходный массив не трогается', () => {
    const entries = [{ actorId: 'a', initiative: 10 }, { actorId: 'b', initiative: 15 }, { actorId: 'c', initiative: 10 }];
    expect(sortInitiative(entries).map(e => e.actorId)).toEqual(['b', 'a', 'c']);
    expect(entries.map(e => e.actorId)).toEqual(['a', 'b', 'c']);
  });

  it('currentOrder — порядок боя записями с текущими бросками; вне боя пуст', () => {
    const s = seedState();
    expect(currentOrder(s)).toEqual([]);
    s.encounter = { active: true, round: 1, turnIndex: 0, order: ['korrin', 'bo'] };
    expect(currentOrder(s)).toEqual([{ actorId: 'korrin', initiative: 18 }, { actorId: 'bo', initiative: 15 }]);
  });
});

describe('появление противников', () => {
  it('nextActorId — первый свободный после занятых сидом: bandit-4; занятые в этом же вызове пропускаются', () => {
    const s = seedState();
    expect(nextActorId(s, 'bandit')).toBe('bandit-4');
    expect(nextActorId(s, 'bandit', new Set(['bandit-4']))).toBe('bandit-5');
    // captain — id не по шаблону, поэтому считается штукой блока, а свободный id ищется от счётчика дальше.
    expect(nextActorId(s, 'bandit-captain')).toBe('bandit-captain-2');
  });

  it('suggestMonsterName — первый по блоку без номера, следующие с номером; выбывшие считаются (номера не повторяются)', () => {
    const s = seedState();
    expect(suggestMonsterName(s, 'bandit')).toBe('Bandit 4');
    expect(suggestMonsterName(s, 'bandit-captain')).toBe('Bandit Captain 2');
    const empty = { ...s, actors: {} };
    expect(suggestMonsterName(empty, 'bandit')).toBe('Bandit');
    s.actors['bandit-3'].removed = true;
    expect(suggestMonsterName(s, 'bandit')).toBe('Bandit 4');
  });

  it('spawnMonsters: один — с именем как есть, несколько — с номерами от следующего свободного; хиты и AC из блока, без броска инициативы', () => {
    const s = seedState();
    const [one] = spawnMonsters(s, 'bandit', 'Громила', 1);
    expect(one).toMatchObject({ id: 'bandit-4', name: 'Громила', kind: 'monster', monsterId: 'bandit', hp: { current: 11, max: 11, temp: 0 }, ac: 12 });
    expect(one.initiative).toBeUndefined();

    const three = spawnMonsters(s, 'bandit', 'Bandit', 3);
    expect(three.map(a => a.id)).toEqual(['bandit-4', 'bandit-5', 'bandit-6']);
    expect(three.map(a => a.name)).toEqual(['Bandit 4', 'Bandit 5', 'Bandit 6']);
    // Пустое имя — имя блока; count вне 1–20 подрезается.
    expect(spawnMonsters(s, 'bandit-captain', '   ', 0)[0].name).toBe('Bandit Captain');
    expect(spawnMonsters(s, 'bandit', 'x', 99)).toHaveLength(20);
  });

  it('снимок проходит редьюсер: ACTOR_SPAWNED с ним встаёт в состояние, id не конфликтует с сидом', () => {
    const store = createEngineStore(seedState());
    const [bandit] = spawnMonsters(store.getState().state, 'bandit', 'Bandit', 1);
    store.getState().spawn(bandit);
    expect(store.getState().state.actors['bandit-4']).toMatchObject({ name: 'Bandit', hp: { current: 11 } });
  });
});

describe('встреча A5E → блок (ROADMAP 0.5, M15)', () => {
  it('имя таблицы без регистра; сначала блок A5E, потом SRD; нет блока — undefined', async () => {
    await loadMonsterLibraries();
    expect(encounterMonsterId('Bandit captain')).toBe('a5e-bandit-captain');
    expect(encounterMonsterId('Gelatinous cube')).toBe('a5e-gelatinous-cube');
    expect(encounterMonsterId('Travel scenery')).toBeUndefined();
  });
});
