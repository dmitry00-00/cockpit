// @vitest-environment node
// Данные SRD: состав, порядок, дословность и отсутствие эмодзи. Тексты не пересказаны: несколько точных фраз
// SRD захардкожены здесь и обязаны входить в text — если кто-то «улучшит» формулировку, тест упадёт.
import { describe, expect, it } from 'vitest';
import { ACTION_IDS, ACTION_LIST, ACTIONS } from './actions';
import { CONCENTRATION, COVER, COVER_GENERAL, DIFFICULTY_CLASSES, LIGHT, concentrationSaveDc } from './checks';
import { CONDITION_IDS, CONDITIONS, EXHAUSTION_MAX_LEVEL, isConditionId } from './conditions';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('conditions', () => {
  it('ровно 15 состояний в порядке CONDITION_IDS, id совпадает с ключом', () => {
    expect(CONDITION_IDS.length).toBe(15);
    expect(CONDITION_IDS).toEqual([
      'blinded',
      'charmed',
      'deafened',
      'exhaustion',
      'frightened',
      'grappled',
      'incapacitated',
      'invisible',
      'paralyzed',
      'petrified',
      'poisoned',
      'prone',
      'restrained',
      'stunned',
      'unconscious',
    ]);
    expect(Object.keys(CONDITIONS)).toEqual([...CONDITION_IDS]);
    for (const id of CONDITION_IDS) expect(CONDITIONS[id].id).toBe(id);
  });

  it('у каждого непустой text, name, label и source', () => {
    for (const id of CONDITION_IDS) {
      const c = CONDITIONS[id];
      expect(c.text.length, id).toBeGreaterThan(0);
      for (const p of c.text) expect(p.trim().length, id).toBeGreaterThan(0);
      expect(c.name.length, id).toBeGreaterThan(0);
      expect(c.label.length, id).toBeGreaterThan(0);
      expect(c.source.length, id).toBeGreaterThan(0);
    }
  });

  it('invisible — бафф, остальные дебаффы', () => {
    for (const id of CONDITION_IDS) {
      expect(CONDITIONS[id].kind, id).toBe(id === 'invisible' ? 'buff' : 'debuff');
    }
  });

  it('истощение — ровно 6 уровней 1..6 по порядку; у остальных levels нет', () => {
    expect(EXHAUSTION_MAX_LEVEL).toBe(6);
    const levels = CONDITIONS.exhaustion.levels;
    expect(levels).toBeDefined();
    expect(levels?.length).toBe(6);
    expect(levels?.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const l of levels ?? []) expect(l.effect.trim().length).toBeGreaterThan(0);
    for (const id of CONDITION_IDS) {
      if (id !== 'exhaustion') expect(CONDITIONS[id].levels, id).toBeUndefined();
    }
  });

  it('уровни истощения — дословно из таблицы SRD', () => {
    expect(CONDITIONS.exhaustion.levels?.map((l) => l.effect)).toEqual([
      'Disadvantage on ability checks',
      'Speed halved',
      'Disadvantage on attack rolls and saving throws',
      'Hit point maximum halved',
      'Speed reduced to 0',
      'Death',
    ]);
  });

  it('тексты не пересказаны: точные фразы SRD входят в text', () => {
    const joined = (id: (typeof CONDITION_IDS)[number]) => CONDITIONS[id].text.join(' ');
    expect(joined('blinded')).toContain(
      "A blinded creature can't see and automatically fails any ability check that requires sight",
    );
    expect(joined('prone')).toContain("A prone creature's only movement option is to crawl");
    expect(joined('unconscious')).toContain('An unconscious creature is incapacitated');
    expect(joined('paralyzed')).toContain(
      'Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature',
    );
    expect(joined('exhaustion')).toContain('Exhaustion is measured in six levels');
  });

  it('source — Appendix PH-A', () => {
    for (const id of CONDITION_IDS) {
      expect(CONDITIONS[id].source).toBe('SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)');
    }
  });

  it('isConditionId сужает строку', () => {
    expect(isConditionId('prone')).toBe(true);
    expect(isConditionId('Prone')).toBe(false);
    expect(isConditionId('dazed')).toBe(false);
  });
});

describe('checks', () => {
  it('concentrationSaveDc = max(10, floor(damage / 2))', () => {
    expect(concentrationSaveDc(1)).toBe(10);
    expect(concentrationSaveDc(20)).toBe(10);
    expect(concentrationSaveDc(21)).toBe(10);
    expect(concentrationSaveDc(22)).toBe(11);
    expect(concentrationSaveDc(43)).toBe(21);
  });

  it('правило концентрации — дословно', () => {
    expect(CONCENTRATION.text.join(' ')).toContain(
      'The DC equals 10 or half the damage you take, whichever number is higher',
    );
    expect(CONCENTRATION.source.length).toBeGreaterThan(0);
  });

  it('6 строк DC ровно с этими числами', () => {
    expect(DIFFICULTY_CLASSES.length).toBe(6);
    expect(DIFFICULTY_CLASSES.map((d) => [d.label, d.dc])).toEqual([
      ['Very easy', 5],
      ['Easy', 10],
      ['Medium', 15],
      ['Hard', 20],
      ['Very hard', 25],
      ['Nearly impossible', 30],
    ]);
    for (const d of DIFFICULTY_CLASSES) expect(d.labelRu.length).toBeGreaterThan(0);
  });

  it('укрытие: +2, +5, полное — нельзя выбрать целью', () => {
    expect(Object.keys(COVER)).toEqual(['half', 'three-quarters', 'total']);
    expect(COVER.half.acBonus).toBe(2);
    expect(COVER['three-quarters'].acBonus).toBe(5);
    expect(COVER.total.acBonus).toBeNull();
    expect(COVER.half.text.join(' ')).toContain('has a +2 bonus to AC and Dexterity saving throws');
    expect(COVER['three-quarters'].text.join(' ')).toContain('has a +5 bonus to AC and Dexterity saving throws');
    expect(COVER.total.text.join(' ')).toContain("can't be targeted directly by an attack or a spell");
    expect(COVER_GENERAL.text.join(' ')).toContain("the degrees aren't added together");
    for (const c of Object.values(COVER)) {
      expect(c.id in COVER).toBe(true);
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.source.length).toBeGreaterThan(0);
    }
  });

  it('освещение: dim — lightly obscured, darkness — heavily obscured и blinded', () => {
    expect(Object.keys(LIGHT)).toEqual(['bright', 'dim', 'darkness']);
    expect(LIGHT.bright.obscured).toBe('none');
    expect(LIGHT.dim.obscured).toBe('lightly');
    expect(LIGHT.darkness.obscured).toBe('heavily');
    expect(LIGHT.bright.text.join(' ')).toContain('Bright light lets most creatures see normally');
    expect(LIGHT.dim.text.join(' ')).toContain(
      'creatures have disadvantage on Wisdom (Perception) checks that rely on sight',
    );
    expect(LIGHT.darkness.text.join(' ')).toContain('Darkness creates a heavily obscured area');
    expect(LIGHT.darkness.text.join(' ')).toContain('A creature effectively suffers from the blinded condition');
    for (const l of Object.values(LIGHT)) {
      expect(l.text.length).toBeGreaterThan(0);
      expect(l.source.length).toBeGreaterThan(0);
    }
  });
});

describe('actions', () => {
  it('10 действий в порядке SRD, id совпадает с ключом', () => {
    expect(ACTION_IDS.length).toBe(10);
    expect(ACTION_LIST.map((a) => a.name)).toEqual([
      'Attack',
      'Cast a Spell',
      'Dash',
      'Disengage',
      'Dodge',
      'Help',
      'Hide',
      'Ready',
      'Search',
      'Use an Object',
    ]);
    expect(Object.keys(ACTIONS)).toEqual([...ACTION_IDS]);
    for (const id of ACTION_IDS) {
      const a = ACTIONS[id];
      expect(a.id).toBe(id);
      expect(a.text.length, id).toBeGreaterThan(0);
      expect(a.label.length, id).toBeGreaterThan(0);
      expect(a.source.length, id).toBeGreaterThan(0);
    }
  });

  it('тексты не пересказаны', () => {
    expect(ACTIONS.dodge.text.join(' ')).toContain(
      'any attack roll made against you has disadvantage if you can see the attacker',
    );
    expect(ACTIONS.disengage.text.join(' ')).toContain(
      "your movement doesn't provoke opportunity attacks for the rest of the turn",
    );
    expect(ACTIONS.dash.text.join(' ')).toContain('The increase equals your speed, after applying any modifiers');
  });
});

describe('эмодзи и источники', () => {
  const allTexts = (): { where: string; s: string }[] => {
    const out: { where: string; s: string }[] = [];
    for (const id of CONDITION_IDS) {
      const c = CONDITIONS[id];
      out.push({ where: `condition ${id} name`, s: c.name }, { where: `condition ${id} label`, s: c.label });
      c.text.forEach((s, i) => out.push({ where: `condition ${id} text[${i}]`, s }));
      c.levels?.forEach((l) => out.push({ where: `condition ${id} level ${l.level}`, s: l.effect }));
    }
    for (const id of ACTION_IDS) {
      const a = ACTIONS[id];
      out.push({ where: `action ${id} name`, s: a.name }, { where: `action ${id} label`, s: a.label });
      a.text.forEach((s, i) => out.push({ where: `action ${id} text[${i}]`, s }));
    }
    for (const c of Object.values(COVER)) {
      out.push({ where: `cover ${c.id} label`, s: c.label });
      c.text.forEach((s, i) => out.push({ where: `cover ${c.id} text[${i}]`, s }));
    }
    COVER_GENERAL.text.forEach((s, i) => out.push({ where: `cover general text[${i}]`, s }));
    for (const l of Object.values(LIGHT)) {
      out.push({ where: `light ${l.id} label`, s: l.label });
      l.text.forEach((s, i) => out.push({ where: `light ${l.id} text[${i}]`, s }));
    }
    CONCENTRATION.text.forEach((s, i) => out.push({ where: `concentration text[${i}]`, s }));
    for (const d of DIFFICULTY_CLASSES) {
      out.push({ where: `dc ${d.dc} label`, s: d.label }, { where: `dc ${d.dc} labelRu`, s: d.labelRu });
    }
    return out;
  };

  it('ни в одном тексте нет эмодзи', () => {
    const texts = allTexts();
    expect(texts.length).toBeGreaterThan(80);
    for (const { where, s } of texts) expect(EMOJI.test(s), where).toBe(false);
  });

  it('source у всех непустой и называет SRD 5.1', () => {
    const sources = [
      ...CONDITION_IDS.map((id) => CONDITIONS[id].source),
      ...ACTION_IDS.map((id) => ACTIONS[id].source),
      ...Object.values(COVER).map((c) => c.source),
      ...Object.values(LIGHT).map((l) => l.source),
      CONCENTRATION.source,
      COVER_GENERAL.source,
    ];
    expect(sources.length).toBe(15 + 10 + 3 + 3 + 2);
    for (const s of sources) {
      expect(s.length).toBeGreaterThan(0);
      expect(s).toContain('SRD 5.1');
      expect(s).toContain('CC-BY-4.0');
    }
  });
});
