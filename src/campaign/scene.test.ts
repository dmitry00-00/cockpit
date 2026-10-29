// Место как сцена (Д2, ROADMAP 6.1): Neverwinter 15 Mirtul 1492 DR из сида и справочника вики — каждая строка ссылкой,
// ждущее рядом с нынешним, пустых секций нет; игрокам — только открытое; год сцены меняет силы и людей.
import { describe, expect, it } from 'vitest';
import { loadSceneCanon } from '../world/sceneCanon';
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
