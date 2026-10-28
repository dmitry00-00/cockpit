// @vitest-environment node
// Сборка персонажа из таблиц владельца и SRD: что класс и раса дают выбрать, заклинания, снаряжение, механика
// умений (защита без доспехов, драконья устойчивость, «Оборона», домен Жизни), черты; плюс данные SRD (импортёры)
// и сверка таблиц владельца с SRD. Числа ВЫВОДЯТСЯ: если сходятся не потому, что должны, тест обязан упасть.
import { describe, expect, it } from 'vitest';
import { CLASSES, FEATS, classById, featById, raceById } from '../rules/compendium';
import { CHOICE_FEATURES, CLASS_START, ITEMS, ITEM_CATEGORIES, armorIdOfItem, categoryItems } from '../rules/srd/equipment';
import { SPELLS, SPELL_LIST, SRD_SUBCLASS_SPELLS, classSpellList } from '../rules/srd/spells';
import { SRD_CLASS_IDS } from '../rules/srd/classes';
import { attacksOf, classChoicesOf, inventoryOf, maxSlotLevel, spellcastingOf, srdIdOf, startingKitOf } from './build';
import { DeriveError, deriveCharacter, deriveDraft, featBlocked, type PcSpec } from './derive';
import { pcActor } from './seed';

/** Персонаж 1-го уровня со стандартным набором по порядку; всё нужное — поверх. */
const pc = (over: Partial<PcSpec>): PcSpec => ({
  id: 't', name: 'T', raceId: 'celovek', classId: 'voin', level: 1,
  base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, improvements: [], armor: null, shield: false, skills: [],
  choices: {}, spells: [], feats: [{ at: 'race', id: 'borec' }], ...over,
});
const mods0 = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

describe('данные SRD: заклинания и снаряжение (импортёры)', () => {
  it('319 заклинаний SRD с источником srd; текст дословный; списки классов и подклассов SRD', () => {
    expect(SPELL_LIST).toHaveLength(319);
    for (const s of SPELL_LIST) {
      expect(s.source).toBe('srd');
      expect(s.text.length, s.id).toBeGreaterThan(20);
      expect(s.level).toBeGreaterThanOrEqual(0);
    }
    expect(SPELLS['magic-missile'].text).toBe('You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.');
    expect(SPELLS['hunters-mark']).toMatchObject({ name: "Hunter's Mark", level: 1, concentration: true, duration: 'Up to 1 hour' });
    expect(classSpellList('wizard', 0).map(s => s.id)).toContain('fire-bolt');
    expect(classSpellList('paladin', 9).every(s => s.level >= 1 && s.level <= 5)).toBe(true);
    // SRD 5.1, Life Domain Spells: 1st bless, cure wounds … 7th death ward, guardian of faith (поправка к API в импортёре).
    expect(SRD_SUBCLASS_SPELLS.life.spells.map(s => s.id)).toEqual(['bless', 'cure-wounds', 'lesser-restoration', 'spiritual-weapon', 'beacon-of-hope', 'revivify', 'death-ward', 'guardian-of-faith', 'mass-cure-wounds', 'raise-dead']);
  });

  it('стартовые наборы двенадцати классов: каждый предмет и каждая категория есть в справочнике; текст выбора — SRD', () => {
    expect(Object.keys(CLASS_START).sort()).toEqual([...SRD_CLASS_IDS].sort());
    for (const [id, c] of Object.entries(CLASS_START)) {
      for (const f of c.equipment.fixed) expect(ITEMS[f.item], `${id}: ${f.item}`).toBeDefined();
      for (const ch of c.equipment.choices) {
        expect(ch.options.length, `${id}: ${ch.text}`).toBeGreaterThan(0);
        for (const part of ch.options.flat()) {
          if ('item' in part) expect(ITEMS[part.item], `${id}: ${part.item}`).toBeDefined();
          else expect(categoryItems(part.pick).length, `${id}: ${part.pick}`).toBeGreaterThan(0);
        }
      }
    }
    expect(CLASS_START.fighter.equipment.choices[0].text).toBe('(a) chain mail or (b) leather armor, longbow, and 20 arrows');
    // SRD: паладин — «(b) any simple melee weapon»; API давал простое любое — поправка импортёра.
    expect(CLASS_START.paladin.equipment.choices[1].options[1]).toEqual([{ pick: 'simple-melee-weapons', qty: 1 }]);
    for (const id of ITEM_CATEGORIES['simple-melee-weapons']) expect(ITEMS[id].weapon).toMatchObject({ category: 'simple', range: 'melee' });
    expect(Object.values(ITEMS).filter(i => i.kind === 'armor').every(i => armorIdOfItem(i.id))).toBe(true);
    expect(CHOICE_FEATURES['dragon-ancestor'].options).toHaveLength(10);
  });

  it('сверка таблиц владельца с SRD: известные заговоры и заклинания по уровням; расхождения — списком', () => {
    const mismatches: string[] = [];
    for (const cls of CLASSES) {
      const srd = srdIdOf(cls);
      const by = srd ? CLASS_START[srd].spellsByLevel : undefined;
      if (!by) continue;
      for (const row of cls.levels) {
        const s = by[String(row.level)] ?? {};
        const c = row.resources['0'];
        const k = row.resources['Известные заклинания'] ?? row.resources['Известные закл.'];
        if (c !== undefined && String(s.cantrips) !== c) mismatches.push(`${srd} ${row.level}: заговоры ${c} ≠ ${s.cantrips}`);
        if (k !== undefined && k !== '-' && String(s.known) !== k) mismatches.push(`${srd} ${row.level}: известные ${k} ≠ ${s.known}`);
      }
    }
    // Известное расхождение — в отчёт владельцу: в SRD у барда 10-го уровня 4 заговора, в таблице 3. Исправят — список опустеет.
    expect(mismatches).toEqual(['bard 10: заговоры 3 ≠ 4']);
  });
});

describe('выборы умений: из таблиц владельца и SRD', () => {
  it('воин 1-го: боевой стиль из блока под таблицей (SRD и книга помечены); в таблице уровней — место выбора, а не «Сражение большим оружием»', () => {
    const voin = classById('voin')!;
    const [style] = classChoicesOf(voin, 1, undefined, []);
    expect(style).toMatchObject({ id: 'fighting-style', label: 'Боевой стиль', count: 1 });
    const ids = style.options.map(o => o.id);
    expect(ids).toEqual(expect.arrayContaining(['oborona', 'strel-ba', 'duelant']));
    expect(style.options.find(o => o.id === 'oborona')!.source).toBe('srd');
    expect(style.options.find(o => o.id === 'perehvat')!.source).toBe('book');
    expect(voin.levels[0].features.map(f => f.name)).toContain('Боевой стиль');
    // Паладин и следопыт — со 2-го; у следопыта блок с листа друида (TCE), перенесён импортёром.
    expect(classChoicesOf(classById('paladin')!, 1, undefined, [])).toEqual([]);
    expect(classChoicesOf(classById('paladin')!, 2, undefined, [])[0].id).toBe('fighting-style');
    const ranger = classChoicesOf(classById('sledopyt')!, 2, undefined, []);
    expect(ranger.map(c => c.id)).toEqual(['fighting-style', 'favored-enemy', 'terrain']);
    expect(ranger[0].options.map(o => o.name)).toContain('Воин-Друид');
    expect(classChoicesOf(classById('sledopyt')!, 14, undefined, []).find(c => c.id === 'favored-enemy')!.count).toBe(3);
  });

  it('плут: компетентность — из навыков персонажа и воровских инструментов; чародей: метамагия с 3-го, предок дракона у SRD-подкласса', () => {
    const rogue = classChoicesOf(classById('plut')!, 1, undefined, ['stealth', 'perception']);
    expect(rogue).toEqual([expect.objectContaining({ id: 'expertise', count: 2 })]);
    expect(rogue[0].options.map(o => o.id)).toEqual(['stealth', 'perception', 'thieves-tools']);
    const sorc = classById('carodey')!;
    expect(classChoicesOf(sorc, 1, undefined, []).map(c => c.id)).toEqual([]);
    expect(classChoicesOf(sorc, 1, 'carodey-nasledie-drakon-ey-krovi', []).map(c => c.id)).toEqual(['dragon-ancestor']);
    const meta = classChoicesOf(sorc, 3, undefined, []).find(c => c.id === 'metamagic')!;
    expect(meta.count).toBe(2);
    expect(meta.options.filter(o => o.source === 'srd').length).toBeGreaterThanOrEqual(7);
  });
});

describe('заклинания: план по классу и уровню', () => {
  it('волшебник 1-го: 3 заговора, 6 в книгу, до 1-го круга; 5-го — 4 заговора, 14 в книгу, до 3-го', () => {
    const w = classById('volsebnik')!;
    const p1 = spellcastingOf(w, 1, undefined, mods0);
    expect(p1).toMatchObject({ kind: 'plan', ability: 'int', cantrips: 3, leveled: 6, leveledKind: 'spellbook', maxLevel: 1 });
    const p5 = spellcastingOf(w, 5, undefined, mods0);
    expect(p5).toMatchObject({ cantrips: 4, leveled: 14, maxLevel: 3 });
    expect(maxSlotLevel(classById('koldun')!.levels[4])).toBe(3); // колдун 5-го — ячейки 3-го круга
  });

  it('жрец Жизни: подготовленные = WIS + уровень, заклинания домена всегда подготовлены; колдун Исчадия — расширенный список; паладин 1-го и воин — без заклинаний', () => {
    const j = classById('jrec')!;
    const p = spellcastingOf(j, 1, 'jrec-jizni', { ...mods0, wis: 3 });
    expect(p).toMatchObject({ kind: 'plan', cantrips: 3, leveled: 4, leveledKind: 'prepared', always: ['bless', 'cure-wounds'] });
    const w = spellcastingOf(classById('koldun')!, 1, 'koldun-iscadie', mods0);
    expect(w.kind === 'plan' && w.options.map(s => s.id)).toEqual(expect.arrayContaining(['burning-hands', 'command', 'eldritch-blast']));
    expect(w).toMatchObject({ cantrips: 2, leveled: 2, always: [] });
    expect(spellcastingOf(classById('paladin')!, 1, undefined, mods0).kind).toBe('none');
    expect(spellcastingOf(classById('paladin')!, 2, undefined, { ...mods0, cha: 3 })).toMatchObject({ leveled: 4 });
    expect(spellcastingOf(classById('voin')!, 5, undefined, mods0).kind).toBe('none');
  });

  it('книга — честно «нет данных»: Изобретатель без списка SRD; покровитель из книги — имена из таблицы без связи с SRD', () => {
    const a = spellcastingOf(classById('izobretatel')!, 1, undefined, mods0);
    expect(a).toMatchObject({ kind: 'nodata' });
    const fey = spellcastingOf(classById('koldun')!, 1, 'koldun-arhifea', mods0);
    expect(fey.kind === 'plan' && fey.tableOnly?.map(s => s.name)).toEqual(['Огонь фей', 'Усыпление']);
  });
});

describe('снаряжение и атаки', () => {
  it('набор воина: невыбранное — в missing; выбранное с предметом из категории — в инвентарь', () => {
    const kit = startingKitOf(classById('voin')!)!;
    expect(inventoryOf(kit, {}).missing).toEqual([0, 1, 2, 3]);
    const inv = inventoryOf(kit, { 0: { option: 0, picks: [] }, 1: { option: 0, picks: ['longsword'] }, 2: { option: 1, picks: [] }, 3: { option: 1, picks: [] } });
    expect(inv.missing).toEqual([]);
    expect(inv.items).toEqual([{ id: 'chain-mail', qty: 1 }, { id: 'longsword', qty: 1 }, { id: 'shield', qty: 1 }, { id: 'handaxe', qty: 2 }, { id: 'explorers-pack', qty: 1 }]);
    expect(inventoryOf(kit, { 1: { option: 1, picks: ['longsword'] } }).missing).toContain(1); // два воинских — взят один
    expect(startingKitOf(classById('izobretatel')!)).toBeNull();
  });

  it('атаки по SRD: STR у рукопашного, DEX у дальнобойного, лучшая у фехтовального; без владения — без мастерства; «Стрельба» +2', () => {
    const mods = { ...mods0, str: 3, dex: 2 };
    const a = attacksOf([{ id: 'longsword', qty: 1 }, { id: 'rapier', qty: 1 }, { id: 'longbow', qty: 1 }], { mods, proficiencyBonus: 2, srdClass: 'fighter', extraWeapons: [], archery: true });
    expect(a.map(x => [x.id, x.toHit, x.damage])).toEqual([['longsword', 5, '1d8 + 3 / 1d10 + 3'], ['rapier', 5, '1d8 + 3'], ['longbow', 6, '1d8 + 2']]);
    const wiz = attacksOf([{ id: 'longsword', qty: 1 }], { mods, proficiencyBonus: 2, srdClass: 'wizard', extraWeapons: ['longsword'], archery: false });
    expect(wiz[0]).toMatchObject({ toHit: 5, proficient: true }); // эльфийская выучка
    expect(attacksOf([{ id: 'longsword', qty: 1 }], { mods, proficiencyBonus: 2, srdClass: 'wizard', extraWeapons: [], archery: false })[0]).toMatchObject({ toHit: 3, proficient: false });
  });
});

describe('лист из редактора: derive с выборами, заклинаниями, снаряжением и чертами', () => {
  const fighter = pc({
    choices: { 'fighting-style': ['oborona'], 'race-skills': ['stealth'] }, skills: ['athletics', 'perception'],
    equipment: [{ id: 'chain-mail', qty: 1 }, { id: 'longsword', qty: 1 }, { id: 'shield', qty: 1 }], armor: 'chain-mail', shield: true,
  });

  it('воин-человек 1-го: «Оборона» +1 к AC в доспехе; навык и черта расы из таблицы; атака мечом; лист несёт выборы', () => {
    const d = deriveCharacter(fighter);
    expect(d.ac).toBe(16 + 2 + 1);
    expect(d.skills).toContain('stealth');
    expect(d.chosen.map(c => c.id)).toEqual(['race-skills', 'fighting-style']);
    expect(d.attacks[0]).toMatchObject({ id: 'longsword', toHit: 3 + 2 });
    expect(d.feats).toEqual([{ id: 'borec', name: featById('borec')!.nameRu, at: 'race' }]);
    const a = pcActor(fighter);
    expect(a.sheet).toMatchObject({ choices: [expect.objectContaining({ id: 'race-skills' }), expect.objectContaining({ id: 'fighting-style', values: [{ id: 'oborona', name: 'Оборона' }] })], equipment: fighter.equipment });
    expect(a.ac).toBe(19);
  });

  it('мягкий вывод копит «осталось», строгий бросает первое; доспех не из снаряжения и чужая черта не проходят', () => {
    const empty = pc({ choices: {}, feats: [] });
    const { derived, issues } = deriveDraft(empty);
    expect(derived.hpMax).toBe(12);
    expect(issues).toEqual(['выбрать ещё 2 навыка класса', 'выбрать: Навыки расы', 'выбрать: Боевой стиль', 'выбрать черту расы']);
    expect(() => deriveCharacter(empty)).toThrow(DeriveError);
    expect(deriveDraft({ ...fighter, equipment: [{ id: 'longsword', qty: 1 }, { id: 'shield', qty: 1 }] }).issues).toContain('T: Chain mail нет в снаряжении');
    expect(deriveDraft({ ...fighter, choices: { ...fighter.choices, 'fighting-style': ['nope'] } }).issues.join()).toMatch(/нет варианта nope/);
    expect(deriveDraft({ ...fighter, choices: { ...fighter.choices, metamagic: ['x'] } }).issues.join()).toMatch(/выбор «metamagic» на этом уровне не даётся/);
  });

  it('волшебник высший эльф: заговор расы, 3 заговора и 6 в книгу из списка SRD; Сл = 8 + БМ + INT; чужое заклинание — ошибка', () => {
    const spells = ['fire-bolt', 'light', 'mage-hand', 'magic-missile', 'shield', 'sleep', 'mage-armor', 'detect-magic', 'find-familiar'];
    const wiz = pc({ raceId: 'el-f', subraceId: 'el-f-vyssiy', classId: 'volsebnik', base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 }, skills: ['arcana', 'history'], choices: { 'race-cantrip': ['prestidigitation'] }, spells, feats: [] });
    const d = deriveCharacter(wiz);
    expect(d.spellcasting).toMatchObject({ ability: 'int', saveDc: 8 + 2 + 3, attack: 5, kind: 'spellbook', cantrips: ['fire-bolt', 'light', 'mage-hand'] });
    expect(d.spellcasting!.spells).toHaveLength(6);
    expect(deriveDraft({ ...wiz, spells: spells.slice(0, 7) }).issues).toEqual(['заклинания в книгу: ещё 2']);
    expect(deriveDraft({ ...wiz, spells: [...spells.slice(0, 8), 'cure-wounds'] }).issues.join()).toMatch(/Cure Wounds нет в списке класса/);
    expect(pcActor(wiz).sheet!.spellcasting!.cantrips).toEqual(['fire-bolt', 'light', 'mage-hand']);
  });

  it('жрец Жизни: тяжёлые доспехи — бонусное владение домена; без домена кольчуга чужая; заклинания домена не считаются в подготовленных', () => {
    const cleric = pc({ classId: 'jrec', subclassId: 'jrec-jizni', base: { str: 14, dex: 10, con: 13, int: 8, wis: 15, cha: 12 }, skills: ['medicine', 'religion'], armor: 'chain-mail', shield: true, choices: {}, feats: [{ at: 'race', id: 'borec' }], spells: ['sacred-flame', 'guidance', 'light', 'healing-word', 'shield-of-faith', 'command', 'sanctuary'] });
    const d = deriveCharacter({ ...cleric, choices: { 'race-skills': ['insight'] } });
    expect(d.ac).toBe(16 + 2);
    expect(d.spellcasting).toMatchObject({ kind: 'prepared', always: ['bless', 'cure-wounds'] });
    expect(deriveDraft({ ...cleric, subclassId: undefined, choices: { 'race-skills': ['insight'] } }).issues.join()).toMatch(/не владеет доспехом Chain mail/);
    expect(deriveDraft({ ...cleric, choices: { 'race-skills': ['insight'] }, spells: [...cleric.spells!, 'bless'] }).issues.join()).toMatch(/Bless и так всегда подготовлено/);
  });

  it('защита без доспехов: варвар 10 + DEX + CON со щитом, монах 10 + DEX + WIS без щита; драконья устойчивость: 13 + DEX и +1 хит за уровень', () => {
    const barb = deriveDraft(pc({ classId: 'varvar', base: { str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 }, shield: true })).derived;
    expect(barb.ac).toBe(10 + 2 + 3 + 2); // DEX 15, CON 16 (человек +1), щит
    const monk = deriveDraft(pc({ classId: 'monah', base: { str: 10, dex: 15, con: 13, int: 8, wis: 15, cha: 8 } })).derived;
    expect(monk.ac).toBe(10 + 3 + 3); // DEX 16, WIS 16
    const sorc = deriveDraft(pc({ classId: 'carodey', subclassId: 'carodey-nasledie-drakon-ey-krovi', base: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 } })).derived;
    expect(sorc.ac).toBe(13 + 2);
    expect(sorc.hpMax).toBe(6 + 2 + 1);
    expect(sorc.featureChoices.map(c => c.id)).toContain('dragon-ancestor');
  });

  it('гибкие бонусы расы (Q11): полуэльф SRD +2 CHA и +1 к двум на выбор, два навыка на выбор; Метка Прохода — +2 DEX и +1 к одной', () => {
    const he = raceById('poluel-f')!;
    expect(he.asiChoice).toEqual({ count: 2, amount: 1, from: ['str', 'dex', 'con', 'int', 'wis'] });
    const spec = pc({ raceId: 'poluel-f', feats: [], asiChoice: { dex: 1, con: 1 }, choices: { 'race-skills': ['stealth', 'insight'], 'fighting-style': ['oborona'] }, skills: ['athletics', 'perception'] });
    const d = deriveCharacter(spec);
    expect(d.abilities).toMatchObject({ dex: 15, con: 14, cha: 10 });
    expect(d.skills).toEqual(expect.arrayContaining(['stealth', 'insight']));
    expect(deriveDraft({ ...spec, asiChoice: { cha: 1 } }).issues.join()).toMatch(/не идёт в CHA/);
    expect(deriveDraft({ ...spec, asiChoice: { dex: 1 } }).issues).toContain('распределить бонус расы: +1 ещё к 1');
    const passage = raceById('celovek')!.subraces.find(s => s.nameRu === 'Прохода')!;
    expect(passage.asi).toEqual({ dex: 2 });
    expect(passage.asiChoice).toMatchObject({ count: 1, amount: 1 });
  });

  it('компетентность плута удваивает бонус и пассивную внимательность; черта на уровне ASI заменяет увеличение и проверяет требования', () => {
    const rogue = pc({ feats: [{ at: 'race', id: 'bditel-nyy' }], classId: 'plut', base: { str: 8, dex: 15, con: 13, int: 12, wis: 14, cha: 10 }, skills: ['stealth', 'perception', 'acrobatics', 'deception'], choices: { expertise: ['perception', 'thieves-tools'], 'race-skills': ['insight'] } });
    const d = deriveCharacter(rogue);
    expect(d.expertise).toEqual(['perception', 'thieves-tools']);
    expect(d.passivePerception).toBe(10 + 2 + 2 * 2);
    const fighter4 = { ...fighter, level: 4, feats: [{ at: 'race' as const, id: 'borec' }, { at: 4, id: 'master-orujia', asi: 'str' as const }] };
    const f4 = deriveCharacter(fighter4);
    expect(f4.abilities.str).toBe(15 + 1 + 1);
    expect(deriveDraft({ ...fighter4, improvements: [{ level: 4, asi: { str: 2 } }] }).issues.join()).toMatch(/и увеличение, и черта/);
    const heavy = FEATS.find(f => f.prerequisites.armor === 'medium')!;
    expect(featBlocked(heavy, { abilities: d.abilities, level: 1, armorProf: new Set(['light']), martial: false, casts: false, cantrips: false })).toMatch(/средними доспехами/);
    expect(featBlocked(heavy, { abilities: d.abilities, level: 1, armorProf: new Set(['light', 'medium']), martial: false, casts: false, cantrips: false })).toBeNull();
  });
});
