// @vitest-environment node
// Производные по SRD: формулы на голых числах, потом четверо §13 с подстановкой, потом монстры — блок
// против формулы. Числа §13 здесь ВЫВОДЯТСЯ; если сходятся не потому, что должны, тест обязан упасть.
import { describe, expect, it } from 'vitest';
import { CLASSES, RACES, bySource } from '../rules/compendium';
import { ARMOR_IDS } from '../rules/srd/armor';
import { SRD_CLASSES, SRD_CLASS_IDS } from '../rules/srd/classes';
import { MONSTERS, MONSTER_IDS } from '../rules/srd/monsters';
import {
  DeriveError, TRAIT_EFFECTS, abilityMod, armorClass, classArmorProficiency, classSkillChoices, deriveCharacter,
  maxHp, passivePerception, proficiencyBonusOf, srdClassOf,
} from './derive';
import { ALDRIC, BO, KORRIN, LYRA, PARTY } from './party';

describe('модификатор характеристики', () => {
  it('таблица SRD: 1 → −5, 8–9 → −1, 10–11 → 0, 16–17 → +3, 20 → +5, 30 → +10', () => {
    expect([1, 8, 9, 10, 11, 12, 15, 16, 17, 18, 20, 30].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 1, 2, 3, 3, 4, 5, 10]);
    expect(() => abilityMod(0)).toThrow(DeriveError);
    expect(() => abilityMod(31)).toThrow(DeriveError);
    expect(() => abilityMod(10.5)).toThrow(DeriveError);
  });
});

describe('бонус мастерства и кости хитов', () => {
  it('на 5-м уровне +3 у всех 13 классов компендиума; у 1-го +2, у 20-го +6', () => {
    for (const c of CLASSES) {
      expect(proficiencyBonusOf(c, 5), c.name).toBe(3);
      expect(proficiencyBonusOf(c, 1), c.name).toBe(2);
      expect(proficiencyBonusOf(c, 20), c.name).toBe(6);
    }
    expect(() => proficiencyBonusOf(CLASSES[0], 21)).toThrow(/нет уровня/);
  });

  it('у каждого SRD-класса компендиума есть кость хитов; у Изобретателя из книги — нет', () => {
    for (const c of bySource(CLASSES, ['srd'])) expect(srdClassOf(c).hitDie, c.name).toBeGreaterThan(0);
    expect(SRD_CLASS_IDS).toHaveLength(12);
    expect(SRD_CLASSES.barbarian.hitDie).toBe(12);
    expect(SRD_CLASSES.wizard.hitDie).toBe(6);
    const artificer = CLASSES.find(c => c.nameRu === 'Изобретатель')!;
    expect(() => srdClassOf(artificer)).toThrow(/не из SRD/);
  });

  it('хиты: кость целиком на 1-м, среднее дальше, CON за каждый уровень, бонус за уровень — тоже с 1-го', () => {
    expect(maxHp(10, 1, 0)).toBe(10);
    expect(maxHp(10, 5, 0)).toBe(34); // 10 + 4·6
    expect(maxHp(10, 5, 2)).toBe(44);
    expect(maxHp(10, 5, 2, 1)).toBe(49); // Hill Dwarf
    expect(maxHp(6, 5, -1)).toBe(17); // 6 + 4·4 − 5
    expect(maxHp(12, 20, 5)).toBe(245);
    expect(() => maxHp(10, 0, 0)).toThrow(DeriveError);
  });
});

describe('класс доспеха', () => {
  it('лёгкий — весь DEX, средний — до +2, тяжёлый — без DEX и без штрафа за отрицательный', () => {
    expect(armorClass(3, { armor: 'leather' })).toBe(14);
    expect(armorClass(-1, { armor: 'padded' })).toBe(10);
    expect(armorClass(4, { armor: 'studded-leather' })).toBe(16);
    expect(armorClass(4, { armor: 'scale-mail' })).toBe(16);
    expect(armorClass(1, { armor: 'breastplate' })).toBe(15);
    expect(armorClass(-1, { armor: 'hide' })).toBe(11);
    expect(armorClass(5, { armor: 'chain-mail' })).toBe(16);
    expect(armorClass(-2, { armor: 'plate' })).toBe(18);
    expect(armorClass(0, { armor: 'ring-mail' })).toBe(14);
    expect(armorClass(0, { armor: 'splint' })).toBe(17);
  });

  it('щит +2 к любому; без доспеха 10 + DEX; Mage Armor 13 + DEX и не вместе с доспехом', () => {
    expect(armorClass(2)).toBe(12);
    expect(armorClass(2, { shield: true })).toBe(14);
    expect(armorClass(0, { armor: 'chain-mail', shield: true })).toBe(18);
    expect(armorClass(2, { mageArmor: true })).toBe(15);
    expect(armorClass(2, { mageArmor: true, shield: true })).toBe(17);
    expect(() => armorClass(2, { mageArmor: true, armor: 'leather' })).toThrow(DeriveError);
    expect(ARMOR_IDS).toHaveLength(12);
  });
});

describe('пассивное внимание', () => {
  it('10 + WIS; мастерство только при владении', () => {
    expect(passivePerception(2, false, 3)).toBe(12);
    expect(passivePerception(1, true, 3)).toBe(14);
    expect(passivePerception(-1, true, 2)).toBe(11);
  });
});

describe('компендиум как источник: то, на что опирается derive', () => {
  it('ключи TRAIT_EFFECTS существуют в компендиуме — иначе механика черты потеряется молча', () => {
    const ids = new Set(RACES.flatMap(r => [...r.traits, ...r.subraces.flatMap(s => s.traits)]).map(t => t.id));
    for (const id of Object.keys(TRAIT_EFFECTS)) expect(ids.has(id), id).toBe(true);
    const dwarf = RACES.find(r => r.id === 'dvarf')!;
    expect(dwarf.subraces.find(s => s.id === 'dvarf-holmovoy')!.traits.map(t => t.id)).toContain('dvarfskaa-vyderjka');
    expect(RACES.find(r => r.id === 'el-f')!.traits.map(t => t.id)).toContain('obostrennye-cuvstva');
  });

  it('ASI подрасы в компендиуме — уже сумма с расой (High Elf: DEX +2 от эльфа, INT +1 от подрасы)', () => {
    const elf = RACES.find(r => r.id === 'el-f')!;
    expect(elf.subraces.find(s => s.id === 'el-f-vyssiy')!.asi).toEqual({ dex: 2, int: 1 });
    expect(RACES.find(r => r.id === 'dvarf')!.subraces.find(s => s.id === 'dvarf-holmovoy')!.asi).toEqual({ con: 2, wis: 1 });
    expect(RACES.find(r => r.id === 'poluroslik')!.subraces.find(s => s.id === 'poluroslik-legkonogiy')!.asi).toEqual({ dex: 2, cha: 1 });
    expect(RACES.find(r => r.id === 'celovek')!.asi).toEqual({ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
  });

  it('навыки и доспехи классов читаются из текста компендиума у всех 13 классов', () => {
    for (const c of CLASSES) {
      const s = classSkillChoices(c);
      expect(s.count, c.name).toBeGreaterThan(0);
      if (s.options) expect(s.options.length, c.name).toBeGreaterThanOrEqual(s.count);
    }
    const byId = (id: string) => CLASSES.find(c => c.id === id)!;
    expect(classSkillChoices(byId('jrec'))).toEqual({ count: 2, options: ['history', 'medicine', 'insight', 'religion', 'persuasion'] });
    expect(classSkillChoices(byId('sledopyt')).options).toContain('animal-handling');
    expect(classSkillChoices(byId('bard'))).toEqual({ count: 3, options: null });
    expect([...classArmorProficiency(byId('voin'))].sort()).toEqual(['heavy', 'light', 'medium', 'shield']);
    expect([...classArmorProficiency(byId('jrec'))].sort()).toEqual(['light', 'medium', 'shield']);
    expect([...classArmorProficiency(byId('volsebnik'))]).toEqual([]);
  });
});

describe('партия §13 — вывод с подстановкой', () => {
  it('Bo Tambernack: следопыт 5, Lightfoot — HP 49, AC 16, PP 12', () => {
    const d = deriveCharacter(BO);
    // база 12/13/15/10/14/8 + Lightfoot (DEX +2, CHA +1) + 4-й уровень (CON +1, DEX +1)
    expect(d.abilities).toEqual({ str: 12, dex: 16, con: 16, int: 10, wis: 14, cha: 9 });
    expect(d.proficiencyBonus).toBe(3);
    expect(d.srdClass.hitDie).toBe(10);
    expect(d.hpMax).toBe(10 + 4 * 6 + 5 * 3); // 49: d10, CON +3
    expect(d.ac).toBe(14 + Math.min(3, 2)); // 16: чешуйчатый, DEX +3 срезан до +2
    expect(d.skills).not.toContain('perception');
    expect(d.passivePerception).toBe(10 + 2); // 12: WIS +2, без владения
    expect(d.features.filter(f => f.level === 5).map(f => f.name)).toEqual(['Дополнительная атака']);
    expect(d.traits.map(t => t.id)).toContain('vezuciy');
  });

  it('Korrin Battlehammer: воин 5, Hill Dwarf — HP 49, AC 18, PP 14', () => {
    const d = deriveCharacter(KORRIN);
    // база 15/14/13/10/12/8 + Hill Dwarf (CON +2, WIS +1) + 4-й уровень (STR +2)
    expect(d.abilities).toEqual({ str: 17, dex: 14, con: 15, int: 10, wis: 13, cha: 8 });
    expect(d.hpMax).toBe(10 + 4 * 6 + 5 * 2 + 5 * 1); // 49: d10, CON +2, Dwarven Toughness +1 за уровень
    expect(d.ac).toBe(16 + 2); // 18: кольчуга без DEX + щит
    expect(d.skills).toContain('perception');
    expect(d.passivePerception).toBe(10 + 1 + 3); // 14: WIS +1, владение
    expect(d.features.filter(f => f.level === 5).map(f => f.name)).toEqual(['Дополнительная атака']);
    expect(d.traits.map(t => t.id)).toContain('dvarfskaa-vyderjka');
  });

  it('Lyra Moonwhisper: волшебница 5, High Elf — HP 32, AC 15 (Mage Armor), PP 14', () => {
    const d = deriveCharacter(LYRA);
    // база 8/13/14/15/12/10 + High Elf (DEX +2, INT +1) + 4-й уровень (INT +2)
    expect(d.abilities).toEqual({ str: 8, dex: 15, con: 14, int: 18, wis: 12, cha: 10 });
    expect(d.hpMax).toBe(6 + 4 * 4 + 5 * 2); // 32: d6, CON +2
    expect(d.ac).toBe(13 + 2); // 15: Mage Armor + DEX +2
    expect(d.skills).toEqual(['arcana', 'history', 'perception']); // Внимательность — от Keen Senses эльфа, не из выбора
    expect(d.passivePerception).toBe(10 + 1 + 3); // 14
    expect(d.features.some(f => f.id === 'kniga-zaklinaniy')).toBe(true);
  });

  it('Brother Aldric: жрец 5, человек — HP 38, AC 18, PP 13', () => {
    const d = deriveCharacter(ALDRIC);
    // база 12/14/13/8/15/10 + человек (+1 ко всем) + 4-й уровень (WIS +1, STR +1)
    expect(d.abilities).toEqual({ str: 14, dex: 15, con: 14, int: 9, wis: 17, cha: 11 });
    expect(d.hpMax).toBe(8 + 4 * 5 + 5 * 2); // 38: d8, CON +2
    expect(d.ac).toBe(14 + 2 + 2); // 18: чешуйчатый + DEX +2 + щит
    expect(d.skills).not.toContain('perception'); // у жреца Внимательности в списке класса нет
    expect(d.passivePerception).toBe(10 + 3); // 13: WIS +3, без владения
    expect(d.features.filter(f => f.level === 5).map(f => f.name)).toEqual(['Уничтожение нежити']);
  });

  it('все четверо — стандартный набор 15/14/13/12/10/8 и одно увеличение на 4-м', () => {
    for (const p of PARTY) {
      expect([...Object.values(p.base)].sort((a, b) => b - a), p.name).toEqual([15, 14, 13, 12, 10, 8]);
      expect(p.improvements.map(i => i.level), p.name).toEqual([4]);
      expect(p.level).toBe(5);
    }
  });

  it('что не проходит: чужой доспех, лишний навык, ASI не по правилу, характеристика выше 20', () => {
    expect(() => deriveCharacter({ ...LYRA, mageArmor: false, armor: 'scale-mail' })).toThrow(/не владеет доспехом/);
    expect(() => deriveCharacter({ ...ALDRIC, skills: ['medicine', 'perception'] })).toThrow(/не предлагает Perception/);
    expect(() => deriveCharacter({ ...BO, skills: ['stealth'] })).toThrow(/даёт 3 навыка/);
    expect(() => deriveCharacter({ ...BO, improvements: [{ level: 4, asi: { con: 3 } }] })).toThrow(/\+2 к одной или \+1 к двум/);
    expect(() => deriveCharacter({ ...BO, improvements: [] })).toThrow(/не выбрано увеличение на уровне 4/);
    expect(() => deriveCharacter({ ...BO, improvements: [{ level: 6, asi: { con: 2 } }] })).toThrow(/не даёт увеличение на уровне 6/);
    expect(() => deriveCharacter({ ...LYRA, base: { ...LYRA.base, int: 18 } })).toThrow(/выше 20/);
    expect(() => deriveCharacter({ ...KORRIN, base: { ...KORRIN.base, str: 8 }, improvements: [{ level: 4, asi: { con: 2 } }] })).toThrow(/требует STR 13/);
    expect(() => deriveCharacter({ ...BO, subraceId: undefined })).toThrow(/нужно выбрать подрасу/);
    expect(() => deriveCharacter({ ...BO, raceId: 'nope' })).toThrow(/нет расы/);
  });
});

describe('монстры SRD — блок против формулы', () => {
  it('библиотека: 45 блоков из импортёра, бандиты §13 на месте; у каждого — источник CC-BY-4.0, бонус мастерства по CR и хиты среднего', () => {
    expect(MONSTER_IDS.length).toBeGreaterThanOrEqual(45);
    expect(MONSTER_IDS).toContain('bandit');
    expect(MONSTER_IDS).toContain('bandit-captain');
    expect(MONSTER_IDS.slice(0, 6)).toEqual(['commoner', 'acolyte', 'guard', 'noble', 'bandit', 'bandit-captain']);
    const avg = (f: string) => {
      const m = /^(\d+)d(\d+)(?: ([+-]) (\d+))?$/.exec(f)!;
      const mod = m[3] === '-' ? -Number(m[4]) : Number(m[4] ?? 0);
      return Math.floor(Number(m[1]) * (Number(m[2]) + 1) / 2) + mod;
    };
    const PB: Record<string, number> = { '0': 2, '1/8': 2, '1/4': 2, '1/2': 2, '1': 2, '2': 2, '3': 2, '4': 2, '5': 3, '6': 3, '7': 3, '8': 3 };
    for (const id of MONSTER_IDS) {
      const m = MONSTERS[id];
      expect(m.id).toBe(id);
      expect(m.source, id).toContain('CC-BY-4.0');
      expect(avg(m.hp.formula), `${id}: ${m.hp.formula}`).toBe(m.hp.average);
      expect(m.proficiencyBonus, `${id}: CR ${m.cr}`).toBe(PB[m.cr]);
      expect(m.speedText, id).toContain(`${m.speed} ft.`);
    }
  });

  it('пассивное внимание, спасброски и «число ↔ текст» у атак сходятся с блоком у всех; у бандитов атаки по DEX', () => {
    for (const id of MONSTER_IDS) {
      const m = MONSTERS[id];
      const pp = 10 + (m.skills.perception ?? abilityMod(m.abilities.wis));
      expect(m.senses, m.name).toContain(`passive Perception ${pp}`);
      for (const a of [...m.actions, ...m.reactions]) {
        if (!a.attack) continue;
        expect(a.text, `${m.name}: ${a.name}`).toContain(`${a.attack.toHit >= 0 ? '+' : ''}${a.attack.toHit} to hit`);
        if (a.attack.reach !== undefined) expect(a.text).toContain(`reach ${a.attack.reach} ft.`);
        if (a.attack.range) expect(a.text).toContain(`range ${a.attack.range[0]}/${a.attack.range[1]} ft.`);
        if (a.attack.damage) expect(a.text, `${m.name}: ${a.name}`).toContain(`${a.attack.average} (${a.attack.damage}) ${a.attack.damageType} damage`);
      }
      for (const [ab, v] of Object.entries(m.savingThrows)) expect(v, `${m.name}: save ${ab}`).toBe(abilityMod(m.abilities[ab as keyof typeof m.abilities]) + m.proficiencyBonus);
    }
    for (const id of ['bandit', 'bandit-captain']) {
      const m = MONSTERS[id];
      expect(passivePerception(abilityMod(m.abilities.wis), 'perception' in m.skills, m.proficiencyBonus)).toBe(10);
      // Финес и дальнобойное оружие бьют по DEX; у обоих бандитов все атаки такие.
      for (const a of m.actions) if (a.attack) expect(a.attack.toHit, `${m.name}: ${a.name}`).toBe(abilityMod(m.abilities.dex) + m.proficiencyBonus);
    }
    const c = MONSTERS['bandit-captain'];
    expect(c.skills.athletics).toBe(abilityMod(c.abilities.str) + c.proficiencyBonus);
    expect(c.skills.deception).toBe(abilityMod(c.abilities.cha) + c.proficiencyBonus);
  });

  it('хиты — среднее формулы: 2d8 + 2 = 11, 10d8 + 20 = 65; у кобольда 2d6 - 2 = 5', () => {
    expect(MONSTERS.bandit.hp).toEqual({ average: 11, formula: '2d8 + 2' });
    expect(MONSTERS['bandit-captain'].hp).toEqual({ average: 65, formula: '10d8 + 20' });
    expect(MONSTERS.kobold.hp).toEqual({ average: 5, formula: '2d6 - 2' });
    expect(abilityMod(MONSTERS.bandit.abilities.con) * 2).toBe(2);
    expect(abilityMod(MONSTERS['bandit-captain'].abilities.con) * 10).toBe(20);
  });

  it('AC из доспеха блока: кожаный 11 + DEX +1 = 12, клёпаный 12 + DEX +3 = 15; у волка — natural armor', () => {
    expect(armorClass(abilityMod(MONSTERS.bandit.abilities.dex), { armor: 'leather' })).toBe(MONSTERS.bandit.ac.value);
    expect(MONSTERS.bandit.ac.source).toBe('leather armor');
    expect(armorClass(abilityMod(MONSTERS['bandit-captain'].abilities.dex), { armor: 'studded-leather' })).toBe(MONSTERS['bandit-captain'].ac.value);
    expect(MONSTERS.wolf.ac).toEqual({ value: 13, source: 'natural armor' });
  });

  it('текст дословный: точные фразы SRD, особенности и иммунитеты из блока, ни одного эмодзи', () => {
    const c = MONSTERS['bandit-captain'];
    expect(c.actions.map(a => a.name)).toEqual(['Multiattack', 'Scimitar', 'Dagger']);
    expect(c.actions[0].text).toBe('The captain makes three melee attacks: two with its scimitar and one with its dagger. Or the captain makes two ranged attacks with its daggers.');
    expect(c.actions[2].attack).toEqual({ toHit: 5, reach: 5, range: [20, 60], damage: '1d4 + 3', average: 5, damageType: 'piercing' });
    expect(c.reactions[0]).toMatchObject({ name: 'Parry' });
    expect(c.reactions[0].text).toContain('adds 2 to its AC against one melee attack that would hit it');
    expect(MONSTERS.bandit.actions[1].text).toBe('Ranged Weapon Attack: +3 to hit, range 80/320 ft., one target. Hit: 5 (1d8 + 1) piercing damage.');
    expect(MONSTERS.wolf.traits.map(t => t.name)).toEqual(['Keen Hearing and Smell', 'Pack Tactics']);
    expect(MONSTERS['werewolf-hybrid'].damageImmunities).toEqual(["bludgeoning, piercing, and slashing from nonmagical weapons that aren't silvered"]);
    expect(MONSTERS.zombie.traits[0].name).toBe('Undead Fortitude');
    expect(MONSTERS.skeleton.conditionImmunities).toContain('exhaustion');
    expect(MONSTERS['giant-spider'].actions.find(a => a.name.startsWith('Web'))?.attack).toEqual({ toHit: 5, range: [30, 60] });
    for (const id of MONSTER_IDS) {
      const all = [...MONSTERS[id].traits, ...MONSTERS[id].actions, ...MONSTERS[id].reactions].map(a => `${a.name} ${a.text}`).join(' ');
      expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
