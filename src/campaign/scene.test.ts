// Место как сцена (Д2, ROADMAP 6.1): Neverwinter 15 Mirtul 1492 DR из сида и справочника вики — каждая строка ссылкой,
// ждущее рядом с нынешним, пустых секций нет; игрокам — только открытое; год сцены меняет силы и людей.
import { describe, expect, it } from 'vitest';
import { loadSceneCanon } from '../world/sceneCanon';
import type { Process } from '../engine/state';
import { LOCATION, THREAD, secOf, seedEngine } from './index';
import { sceneOf, type Scene, type SceneSectionId } from './scene';

const NEVERWINTER = '7e243b80-8918-42fa-b60e-03cec8bdb184';
const rows = (s: Scene, id: SceneSectionId) => s.sections.find(x => x.id === id)?.rows ?? [];

describe('сцена места (Д2)', () => {
  it('Neverwinter, 15 Mirtul 1492 DR: сейчас, вера, силы с враждами, люди, рынок и округа со ждущим, нить, канон', async () => {
    const state = seedEngine().getState().state;
    const scene = sceneOf(state, { location: LOCATION.neverwinter }, state.time.sec, await loadSceneCanon(NEVERWINTER, 1492));
    expect(scene.sections.map(s => s.id)).toEqual(['now', 'faith', 'powers', 'people', 'market', 'around', 'threads', 'chronicle']);
    expect(scene.sections.every(s => s.rows.length > 0)).toBe(true);

    expect(rows(scene, 'now')).toEqual([
      { label: '15 Mirtul 1492 DR', note: 'весна' },
      { label: 'Selûne', ref: 'body:selune', note: 'растёт · полнолуние через 3 дн.' },
      expect.objectContaining({ note: 'погода дня' }),
    ]);
    // Вера: боги места по вики; церковь Helm — фракция кампании, ссылка на её карточку.
    expect(rows(scene, 'faith')).toContainEqual({ label: 'Helm', ref: 'deity:helm', note: 'бог места' });
    expect(rows(scene, 'faith')).toContainEqual(expect.objectContaining({ label: 'Church of Helm', ref: 'faction:fac-church-of-helm' }));
    // Силы: вражды вики, где обе стороны здесь или вторая — фракция кампании; распущенных к 1492 нет.
    const powers = rows(scene, 'powers');
    expect(powers).toContainEqual({ label: "Neverwinter's Rangers", ref: 'organization:neverwinter-s-rangers', with: { label: 'Ashmadai', ref: 'organization:ashmadai' }, note: 'враги по вики' });
    expect(powers).toContainEqual(expect.objectContaining({ label: 'Soft Claws', with: { label: 'Harpers', ref: 'faction:fac-harpers' }, note: 'враги по вики' }));
    expect(powers.some(r => r.ref === 'organization:neverwinter-nine')).toBe(false);
    // Организация из пары списком не повторяется.
    expect(powers.filter(r => r.ref === 'organization:ashmadai' || r.with?.ref === 'organization:ashmadai')).toHaveLength(1);
    // Люди: члены организаций — первыми, организация в заметке.
    const people = rows(scene, 'people');
    expect(people.length).toBeGreaterThan(100);
    expect(people[0].note).toBeTruthy();
    expect(people.every(r => r.ref?.startsWith('person:'))).toBe(true);
    // Рынок и округа: ждущее рядом с нынешним, не вместо него.
    expect(rows(scene, 'market')).toEqual([{ label: 'Все товары', note: '+10%' }, { label: 'оружие', note: '+10%', pending: '+20%' }]);
    const around = rows(scene, 'around');
    expect(around[0]).toEqual({ label: 'Werewolf', ref: 'monster:werewolf-human', note: 'Neverwinter Wood ×1', pending: '×2' });
    expect(around).toContainEqual({ label: 'Urban Township', note: 'регион A5E · уровень опасности 2 · DC занятий 14' });
    expect(around).toContainEqual(expect.objectContaining({ label: 'Assassin', ref: 'monster:assassin' }));
    // Нити: факт мастера и ждущее предложение о месте.
    expect(rows(scene, 'threads')).toEqual([expect.objectContaining({ label: 'The Missing Caravan', ref: `thread:${THREAD.missingCaravan}` })]);
    // Канон места: последние события хронологии до года сцены, по-английски.
    const canon = rows(scene, 'chronicle');
    expect(canon[0]).toMatchObject({ en: true, note: '1487 DR' });
    expect(canon.every(r => Number(r.note!.slice(0, 4)) <= 1492)).toBe(true);
  });

  it('игрокам — только открытое: сейчас и рынок без ждущего; ни вики, ни встреч, ни секретов', async () => {
    const state = seedEngine().getState().state;
    const scene = sceneOf(state, { location: LOCATION.neverwinter }, state.time.sec, await loadSceneCanon(NEVERWINTER, 1492), { players: true });
    expect(scene.sections.map(s => s.id)).toEqual(['now', 'market']);
    expect(rows(scene, 'market')).toEqual([{ label: 'Все товары', note: '+10%' }]);
  });

  it('показывает игрокам только принятые слухи у текущего места; скрытые и удалённые слухи не попадают в сцену', () => {
    const state = structuredClone(seedEngine().getState().state);
    state.facts['rumor-local'] = { id: 'rumor-local', text: 'У южных ворот видели незнакомцев', visibility: 'players', category: 'rumor', subjectId: LOCATION.southGate };
    state.facts['rumor-secret'] = { id: 'rumor-secret', text: 'DM_ONLY_RUMOR_SENTINEL', visibility: 'dm', category: 'rumor', subjectId: LOCATION.neverwinter };
    state.facts['rumor-elsewhere'] = { id: 'rumor-elsewhere', text: 'Вдали слышали гром', visibility: 'players', category: 'rumor', subjectId: LOCATION.oldOwlWell };

    const scene = sceneOf(state, { location: LOCATION.neverwinter }, state.time.sec, undefined, { players: true });
    expect(rows(scene, 'rumors')).toEqual([{ label: 'У южных ворот видели незнакомцев', note: 'слух, дошедший до этого места' }]);
    expect(JSON.stringify(scene)).not.toContain('DM_ONLY_RUMOR_SENTINEL');
    expect(JSON.stringify(scene)).not.toContain('Вдали слышали гром');
    state.facts['rumor-city'] = { id: 'rumor-city', text: 'У кузницы ждут посыльного', visibility: 'players', category: 'rumor', subjectId: LOCATION.neverwinter };
    const gateScene = sceneOf(state, { location: LOCATION.southGate }, state.time.sec, undefined, { players: true });
    expect(rows(gateScene, 'rumors').map(row => row.label)).toContain('У кузницы ждут посыльного');
  });

  it('«Сейчас» наследует процесс от родителя; игрокам выдаёт только явно открытые часы', () => {
    const state = structuredClone(seedEngine().getState().state);
    const process: Process = {
      id: 'secret-cosmic-front', kind: 'cosmic', name: 'Секретная война у портала', scale: 'plane', stage: 'ongoing',
      parties: [LOCATION.material], at: LOCATION.material, startedSec: state.time.sec, nextSec: state.time.sec + 5 * 86_400,
      vars: {}, causeId: 'private-cause', clock: { segments: 4, filled: 2, playerVisible: true, playerLabel: 'Огни вдали' },
      data: { text: 'Тайное следствие, неизвестное игрокам.' },
    };
    state.world.processes = { [process.id]: process };

    const gm = sceneOf(state, { location: LOCATION.neverwinter }, state.time.sec);
    expect(rows(gm, 'processes')).toEqual([expect.objectContaining({
      label: 'Секретная война у портала', note: expect.stringContaining('Космический процесс · идёт · следующий такт'),
    })]);

    const players = sceneOf(state, { location: LOCATION.neverwinter }, state.time.sec, undefined, { players: true });
    expect(rows(players, 'processes')).toEqual([{ label: 'Огни вдали', note: 'Часы: 2 из 4' }]);
    const projection = JSON.stringify(players);
    expect(projection).not.toContain(process.id);
    expect(projection).not.toContain(process.name);
    expect(projection).not.toContain('ongoing');
    expect(projection).not.toContain('Тайное следствие');
  });

  it('год сцены — линза: в 1372 DR в Neverwinter есть Neverwinter Nine, канона после 1372 нет; место справочника находит место кампании', async () => {
    const state = seedEngine().getState().state;
    const sec = secOf({ year: 1372, month: 'Mirtul', day: 15 });
    const scene = sceneOf(state, { place: NEVERWINTER }, sec, await loadSceneCanon(NEVERWINTER, 1372));
    expect(scene.year).toBe(1372);
    expect(rows(scene, 'powers').some(r => r.ref === 'organization:neverwinter-nine')).toBe(true);
    expect(rows(scene, 'chronicle').every(r => Number(r.note!.slice(0, 4)) <= 1372)).toBe(true);
    // Рынок — место кампании по ссылке на справочник.
    expect(rows(scene, 'market')[0]).toMatchObject({ label: 'Все товары' });
  });

  it('место без справочника и без кампании — только «Сейчас»', () => {
    const state = seedEngine().getState().state;
    expect(sceneOf(state, { place: 'нет-такого' }, state.time.sec).sections.map(s => s.id)).toEqual(['now']);
  });
});
