// Черновик редактора персонажа: point buy, увеличения, смена расы/класса/уровня, навыки, id, спецификация.
import { describe, expect, it } from 'vitest';
import { classById } from '../../rules/compendium';
import { classArmorProficiency, deriveCharacter, deriveDraft } from '../../campaign/derive';
import { sheetOf } from '../../campaign/seed';
import {
  POINT_BUY_TOTAL, STANDARD_ARRAY, actorIdFor, asiLevelsOf, asiMode, assignArray, bumpAsi, canDecrease, canIncrease, draftIssues, initialDraft,
  pointsLeft, pointsUsed, selectKit, setFeat, setPick, toSpec, toggleAsiChoice, toggleChoice, toggleSkill, toggleSpell, withBackground, withClass,
  withLevel, withMethod, withRace, withSubrace, type Draft,
} from './draft';

/** Владение доспехами класса — тем же путём, что у редактора (автонадевание набора). */
const classArmorProficiencySet = (classId: string): ReadonlySet<string> => new Set(classArmorProficiency(classById(classId)!));

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

  it('человек-воин 1-го уровня: навыки, боевой стиль, навык и черта расы, набор SRD — лист сходится: 12 хитов, AC 19, атака мечом', () => {
    const prof = classArmorProficiencySet('voin');
    let d: Draft = { ...initialDraft(), name: 'Test', backgroundId: 'soldier' };
    d = toggleSkill(d, 'perception', 2);
    d = toggleSkill(d, 'survival', 2);
    d = toggleChoice(d, 'fighting-style', 'oborona', 1);
    d = toggleChoice(d, 'race-skills', 'stealth', 1);
    d = setFeat(d, 'race', 'bditel-nyy');
    d = selectKit(d, 0, 0, prof); // кольчуга — надевается сама
    d = selectKit(d, 1, 0, prof); // воинское оружие и щит — щит надевается
    d = setPick(d, 1, 0, 'longsword', prof);
    d = selectKit(d, 2, 1, prof);
    d = selectKit(d, 3, 1, prof);
    expect(d).toMatchObject({ armor: 'chain-mail', shield: true });
    expect(draftIssues(d, classById('voin'))).toEqual([]);
    const spec = toSpec(d, 'test');
    expect(deriveDraft(spec).issues).toEqual([]);
    const c = deriveCharacter(spec);
    expect(c.hpMax).toBe(10 + 2); // d10 + CON 14 (13 + 1 человека)
    expect(c.ac).toBe(16 + 2 + 1); // кольчуга, щит, «Оборона»
    expect([...c.skills].sort()).toEqual(['athletics', 'intimidation', 'perception', 'stealth', 'survival']);
    expect(c.abilities).toEqual({ str: 16, dex: 15, con: 14, int: 13, wis: 11, cha: 9 });
    expect(c.attacks.map(a => [a.name, a.toHit, a.damage])).toEqual([['Longsword', 5, '1d8 + 3 / 1d10 + 3'], ['Handaxe', 5, '1d6 + 3']]);
    expect(spec.bio).toBeUndefined();
    expect(toSpec({ ...d, age: '26', height: '97 см' }, 'x').bio).toEqual({ height: '97 см', age: 26 });
  });

  it('что мешает словами формы: без имени, подкласс по уровню, невыбранное снаряжение; остальное говорит deriveDraft', () => {
    const d = { ...initialDraft(), level: 4 };
    expect(draftIssues(d, classById('voin'))).toEqual(['нет имени', 'выбрать подкласс (с 3-го уровня)', 'снаряжение: выбрать ещё 4']);
    const issues = deriveDraft(toSpec(d, 'x')).issues;
    expect(issues).toEqual(expect.arrayContaining(['выбрать ещё 2 навыка класса', 'выбрать: Боевой стиль', 'выбрать черту расы']));
    expect(issues.join()).toMatch(/не выбрано увеличение на уровне 4/);
  });

  it('божество (E8): жрецу обязательно и с доменом подкласса; в спецификацию и лист — id и имя, без доменов', () => {
    const cleric = { ...initialDraft(), name: 'Tamsin', classId: 'jrec', subclassId: 'jrec-jizni' };
    expect(draftIssues(cleric, classById('jrec'))).toContain('выбрать божество');
    const lathander = { id: 'lathander', name: 'Lathander', domains: ['jrec-jizni', 'jrec-sveta'] };
    expect(draftIssues({ ...cleric, deity: lathander }, classById('jrec')).join()).not.toMatch(/божеств/);
    expect(draftIssues({ ...cleric, subclassId: 'jrec-voyny', deity: lathander }, classById('jrec'))).toContain('божество Lathander не даёт домен Войны');
    expect(draftIssues({ ...initialDraft(), name: 'X' }, classById('voin')).join()).not.toMatch(/божеств/);
    const spec = toSpec({ ...cleric, deity: lathander }, 'tamsin');
    expect(spec.deity).toEqual({ id: 'lathander', name: 'Lathander' });
    expect(sheetOf(spec, deriveDraft(spec).derived).deity).toEqual({ id: 'lathander', name: 'Lathander' });
    expect(toSpec(cleric, 'x').deity).toBeUndefined();
  });
});

describe('стандартный набор, гибкие бонусы, черты', () => {
  it('набор раскладывается обменом; переход на point buy сохраняет раскладку, обратно — набор по порядку, если раскладка не набор', () => {
    const d = initialDraft();
    expect(d.method).toBe('array');
    const base = assignArray(d.base, 'int', 15);
    expect(base).toMatchObject({ int: 15, str: 12 });
    expect([...Object.values(base)].sort((a, b) => b - a)).toEqual([...STANDARD_ARRAY]);
    const pb = withMethod({ ...d, base }, 'pointbuy');
    expect(pb.base).toEqual(base);
    expect(withMethod({ ...pb, base: { ...base, str: 9 } }, 'array').base).toEqual(initialDraft().base);
  });

  it('гибкий бонус полуэльфа: +1 к двум, CHA не предлагается; смена подрасы и расы сбрасывает выбор и навыки расы', () => {
    let d = withRace(initialDraft(), 'poluel-f');
    d = toggleAsiChoice(d, 'cha');
    expect(d.asiChoice).toEqual({});
    d = toggleAsiChoice(toggleAsiChoice(toggleAsiChoice(d, 'dex'), 'con'), 'wis');
    expect(d.asiChoice).toEqual({ dex: 1, con: 1 });
    d = toggleChoice(d, 'race-skills', 'stealth', 2);
    expect(withSubrace(d, d.subraceId).asiChoice).toEqual({});
    expect(withRace(d, 'el-f').choices).toEqual({});
  });

  it('уровень ASI: «черта» снимает увеличение, «ASI» — черту; черта с одной характеристикой подставляет +1 сама; смена уровня вниз снимает черту', () => {
    let d: Draft = { ...initialDraft(), level: 4, improvements: { 4: { str: 2 } } };
    d = asiMode(d, 4, 'feat');
    expect(d.improvements).toEqual({});
    expect(d.feats['4']).toEqual({ id: '' });
    d = setFeat(d, '4', 'master-orujia');
    expect(d.feats['4']).toEqual({ id: 'master-orujia' }); // две характеристики на выбор — не подставляется
    expect(toSpec(d, 'x').feats).toEqual([{ at: 4, id: 'master-orujia' }]);
    expect(withLevel(d, 3).feats).toEqual({});
    expect(asiMode(d, 4, 'asi').feats).toEqual({});
  });
});

describe('выборы, заклинания, снаряжение', () => {
  it('выбор с одним вариантом — замена; со счётом — до лимита; снятый навык снимает и компетентность в нём', () => {
    let f: Draft = toggleChoice(initialDraft(), 'fighting-style', 'oborona', 1);
    f = toggleChoice(f, 'fighting-style', 'strel-ba', 1);
    expect(f.choices['fighting-style']).toEqual(['strel-ba']);
    let d: Draft = withClass(initialDraft(), 'plut');
    d = toggleSkill(toggleSkill(d, 'stealth', 4), 'perception', 4);
    d = toggleChoice(toggleChoice(d, 'expertise', 'stealth', 2), 'expertise', 'perception', 2);
    expect(toggleChoice(d, 'expertise', 'thieves-tools', 2)).toBe(d);
    d = toggleSkill(d, 'stealth', 4);
    expect(d.choices.expertise).toEqual(['perception']);
  });

  it('заговоры и заклинания считаются раздельно; смена класса снимает заклинания, смена уровня — те, что выше круга', () => {
    const isC = (id: string) => ['fire-bolt', 'light', 'mage-hand', 'ray-of-frost'].includes(id);
    let d = withClass(initialDraft(), 'volsebnik');
    for (const id of ['fire-bolt', 'light', 'mage-hand', 'ray-of-frost']) d = toggleSpell(d, id, isC, { cantrips: 3, leveled: 6 });
    expect(d.spells).toEqual(['fire-bolt', 'light', 'mage-hand']);
    d = withLevel(toggleSpell(withLevel(d, 3), 'misty-step', isC, { cantrips: 3, leveled: 10 }), 3);
    expect(d.spells).toContain('misty-step');
    expect(withLevel(d, 1).spells).not.toContain('misty-step');
    expect(withClass(d, 'voin').spells).toEqual([]);
  });

  it('набор: смена варианта снимает надетое, если его больше нет, и надевает новое; щит, снятый руками, при прочих сменах не возвращается', () => {
    const prof = classArmorProficiencySet('voin');
    let d = selectKit(withClass(initialDraft(), 'voin'), 0, 0, prof);
    expect(d.armor).toBe('chain-mail');
    d = selectKit(d, 0, 1, prof);
    expect(d.armor).toBe('leather');
    d = selectKit(d, 1, 0, prof);
    expect(d.shield).toBe(true);
    d = { ...d, shield: false };
    d = selectKit(d, 2, 0, prof);
    expect(d.shield).toBe(false);
    expect(toSpec(d, 'x').equipment).toEqual(expect.arrayContaining([{ id: 'leather-armor', qty: 1 }, { id: 'longbow', qty: 1 }, { id: 'arrow', qty: 20 }, { id: 'shield', qty: 1 }]));
  });
});
