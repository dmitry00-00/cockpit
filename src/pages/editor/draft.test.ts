// Черновик редактора персонажа: point buy, увеличения, смена расы/класса/уровня, навыки, id, спецификация.
import { describe, expect, it } from 'vitest';
import { classById } from '../../rules/compendium';
import { deriveCharacter } from '../../campaign/derive';
import {
  POINT_BUY_TOTAL, STANDARD_ARRAY, actorIdFor, asiLevelsOf, bumpAsi, canDecrease, canIncrease, draftIssues, initialDraft,
  pointsLeft, pointsUsed, toSpec, toggleSkill, withBackground, withClass, withLevel, withRace, type Draft,
} from './draft';

describe('point buy', () => {
  it('стандартный набор стоит ровно 27; выше 15 и ниже 8 нельзя; очки считаются по таблице', () => {
    const d = initialDraft();
    expect(pointsUsed(d.base)).toBe(POINT_BUY_TOTAL);
    expect(pointsLeft(d.base)).toBe(0);
    expect([...STANDARD_ARRAY].sort((a, b) => b - a)).toEqual(Object.values(d.base).sort((a, b) => b - a));
    expect(canIncrease(d.base, 'cha')).toBe(false); // очков нет
    expect(canDecrease(d.base, 'cha')).toBe(false); // уже 8
    const base = { ...d.base, str: 8 }; // отдали 9 очков
    expect(pointsLeft(base)).toBe(9);
    expect(canIncrease(base, 'cha')).toBe(true);
    expect(canIncrease({ ...base, cha: 15 }, 'cha')).toBe(false);
  });
});

describe('уровень, раса, класс', () => {
  it('уровни ASI воина — 4, 6, 8…; увеличение +1 дважды, третьего не бывает; смена уровня вниз снимает лишние', () => {
    const voin = classById('voin')!;
    expect(asiLevelsOf(voin, 5)).toEqual([4]);
    expect(asiLevelsOf(voin, 8)).toEqual([4, 6, 8]);
    let asi = bumpAsi({}, 'str');
    asi = bumpAsi(asi, 'str');
    expect(asi).toEqual({ str: 2 });
    expect(bumpAsi(asi, 'dex')).toEqual({ str: 2 });
    let d = withLevel({ ...initialDraft(), improvements: { 4: { str: 2 }, 6: { con: 1, dex: 1 } } }, 8);
    expect(Object.keys(d.improvements)).toEqual(['4', '6']);
    d = withLevel(d, 5);
    expect(Object.keys(d.improvements)).toEqual(['4']);
    expect(withLevel(d, 99).level).toBe(20);
    expect(withLevel(d, 0).level).toBe(1);
  });

  it('раса с обязательной подрасой получает первую того же источника; человек — без; подкласс не раньше gainedAt', () => {
    expect(withRace(initialDraft(), 'el-f').subraceId).toBe('el-f-vyssiy');
    expect(withRace(initialDraft(), 'celovek').subraceId).toBeUndefined();
    const jrec = classById('jrec')!;
    const domain = jrec.subclasses[0];
    let d: Draft = { ...withClass(initialDraft(), 'jrec'), subclassId: domain.id };
    d = withLevel(d, 1);
    expect(d.subclassId).toBe(domain.gainedAt !== null && domain.gainedAt <= 1 ? domain.id : undefined);
    const voin = classById('voin')!;
    const archetype = voin.subclasses[0];
    expect(archetype.gainedAt).toBe(3);
    expect(withLevel({ ...initialDraft(), level: 3, subclassId: archetype.id }, 2).subclassId).toBeUndefined();
    expect(withLevel({ ...initialDraft(), level: 3, subclassId: archetype.id }, 3).subclassId).toBe(archetype.id);
  });

  it('смена класса сбрасывает подкласс, навыки, увеличения и доспех; предыстория остаётся', () => {
    const d = withClass({ ...initialDraft(), backgroundId: 'sage', skills: ['athletics'], improvements: { 4: { str: 2 } }, armor: 'chain-mail', shield: true }, 'volsebnik');
    expect(d).toMatchObject({ classId: 'volsebnik', backgroundId: 'sage', skills: [], improvements: {}, armor: null, shield: false });
  });
});

describe('навыки', () => {
  it('выбор ограничен числом класса; навык предыстории классом не выбирается; смена предыстории снимает совпавший', () => {
    let d: Draft = { ...initialDraft(), backgroundId: 'soldier' }; // атлетика, запугивание
    d = toggleSkill(d, 'athletics', 2);
    expect(d.skills).toEqual([]); // даёт предыстория
    d = toggleSkill(d, 'perception', 2);
    d = toggleSkill(d, 'survival', 2);
    d = toggleSkill(d, 'history', 2);
    expect(d.skills).toEqual(['perception', 'survival']);
    d = toggleSkill(d, 'perception', 2);
    expect(d.skills).toEqual(['survival']);
    d = withBackground({ ...d, skills: ['survival', 'animal-handling'] }, 'folk-hero'); // уход за животными, выживание
    expect(d.skills).toEqual([]);
    expect(withBackground(d, undefined).backgroundId).toBeUndefined();
  });
});

describe('id и спецификация', () => {
  it('id из имени: латиница, кириллица транслитом, занятый — с номером, пустое — pc', () => {
    expect(actorIdFor('Bo Tambernack', new Set())).toBe('bo-tambernack');
    expect(actorIdFor('Брат Альдрик', new Set())).toBe('brat-aldrik');
    expect(actorIdFor('Bo', new Set(['bo', 'bo-2']))).toBe('bo-3');
    expect(actorIdFor('   ', new Set())).toBe('pc');
  });

  it('человек-воин 1-го уровня из стартового черновика проходит derive: 12 хитов, AC 12, навыки класса и предыстории', () => {
    let d: Draft = { ...initialDraft(), name: 'Test', backgroundId: 'soldier' };
    d = toggleSkill(d, 'perception', 2);
    d = toggleSkill(d, 'survival', 2);
    expect(draftIssues(d, classById('voin'), 2)).toEqual([]);
    const spec = toSpec(d, 'test');
    const c = deriveCharacter(spec);
    expect(c.hpMax).toBe(10 + 2); // d10 + CON 14 (13 + 1 человека)
    expect(c.ac).toBe(12);
    expect([...c.skills].sort()).toEqual(['athletics', 'intimidation', 'perception', 'survival']);
    expect(c.abilities).toEqual({ str: 16, dex: 15, con: 14, int: 13, wis: 11, cha: 9 });
    expect(spec.bio).toBeUndefined();
    expect(toSpec({ ...d, age: '26', height: '97 см' }, 'x').bio).toEqual({ height: '97 см', age: 26 });
  });

  it('что мешает: без имени, без навыков, нераспределённое увеличение', () => {
    const d = { ...initialDraft(), level: 4 };
    expect(draftIssues(d, classById('voin'), 2)).toEqual(['нет имени', 'увеличение на 4-м уровне не распределено', 'выбрать ещё 2 навыка класса']);
  });
});
