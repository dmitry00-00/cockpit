import { describe, expect, it } from 'vitest';
import { MONSTERS } from './monsters';
import { SPELLS, SPELL_LIST, concentrationSec } from './spells';
import {
  attackOdds, attackProfileOf, concentrationHoldChance, critChance, damageFactor, diceMean, hitChance, meanText, parseDice,
  percent, saveFailChance, saveInText, spellSaveAbility, withDisadvantage,
} from './odds';

describe('математика d20 (ROADMAP 5.1)', () => {
  it('попадание: +4 против AC 15 — половина, с преимуществом три четверти, с помехой четверть', () => {
    expect(hitChance(4, 15)).toBe(0.5);
    expect(hitChance(4, 15, 'advantage')).toBe(0.75);
    expect(hitChance(4, 15, 'disadvantage')).toBe(0.25);
  });

  it('20 попадает всегда, 1 промахивается всегда', () => {
    expect(hitChance(0, 30)).toBe(0.05);
    expect(hitChance(20, 5)).toBe(0.95);
  });

  it('постоянная помеха: с преимуществом гасятся до одной кости', () => {
    expect(withDisadvantage('normal')).toBe('disadvantage');
    expect(withDisadvantage('advantage')).toBe('normal');
    expect(withDisadvantage('disadvantage')).toBe('disadvantage');
  });

  it('крит — 1/20, с преимуществом 39/400, с помехой 1/400', () => {
    expect(critChance()).toBe(0.05);
    expect(critChance('advantage')).toBeCloseTo(39 / 400, 12);
    expect(critChance('disadvantage')).toBeCloseTo(1 / 400, 12);
  });

  it('спасбросок без автоматических 1 и 20: +0 против DC 25 проваливается всегда, +10 против DC 5 — никогда', () => {
    expect(saveFailChance(2, 13)).toBeCloseTo(0.5, 12);
    expect(saveFailChance(0, 25)).toBe(1);
    expect(saveFailChance(10, 5)).toBe(0);
    expect(saveFailChance(2, 13, 'advantage')).toBeCloseTo(0.25, 12);
  });

  it('строки костей: среднее и разбор', () => {
    expect(diceMean(parseDice('1d6 + 2')!)).toBe(5.5);
    expect(diceMean(parseDice('2d10+6')!)).toBe(17);
    expect(diceMean(parseDice('1d8 − 1')!)).toBe(3.5);
    expect(parseDice('5')).toEqual({ dice: [], bonus: 5 });
    expect(parseDice('удар')).toBeNull();
  });

  it('Scimitar гоблина по AC 15: половина попаданий, средний урон 2,925 с критами', () => {
    const scimitar = MONSTERS.goblin.actions.find(a => a.name === 'Scimitar')!;
    const odds = attackOdds(attackProfileOf(scimitar.attack!, scimitar.text), 15);
    expect(odds.hit).toBe(0.5);
    // 0,45 × 5,5 + 0,05 × (2d6 + 2 = 9)
    expect(odds.damage).toBeCloseTo(0.45 * 5.5 + 0.05 * 9, 12);
  });

  it('добавочный урон из текста SRD: укус взрослого чёрного дракона — piercing и acid', () => {
    const bite = MONSTERS['adult-black-dragon'].actions.find(a => a.name === 'Bite')!;
    const profile = attackProfileOf(bite.attack!, bite.text);
    expect(profile.parts.map(p => p.type)).toEqual(['piercing', 'acid']);
    expect(diceMean(profile.parts[1].dice)).toBe(4.5);
  });

  it('сопротивление — половина с округлением вниз, иммунитет — ноль, условная строка — без числа', () => {
    const def = { resistances: ['cold', 'bludgeoning, piercing, and slashing from nonmagical attacks'], immunities: ['poison'], vulnerabilities: ['fire'] };
    expect(damageFactor('cold', def)).toBe(0.5);
    expect(damageFactor('poison', def)).toBe(0);
    expect(damageFactor('fire', def)).toBe(2);
    expect(damageFactor('slashing', def)).toBe('unclear');
    expect(damageFactor('radiant', def)).toBe(1);
    // 1d4 cold с сопротивлением: ⌊1/2⌋=0, ⌊2/2⌋=1, ⌊3/2⌋=1, ⌊4/2⌋=2 → среднее 1, а не 1,25.
    const odds = attackOdds({ toHit: 30, parts: [{ dice: parseDice('1d4')!, type: 'cold' }] }, 10, 'normal', def);
    const critHalf = [2, 3, 4, 5, 6, 7, 8].reduce((s, n, i) => s + Math.floor(n / 2) * [1, 2, 3, 4, 3, 2, 1][i] / 16, 0);
    expect(odds.damage).toBeCloseTo(0.9 * 1 + 0.05 * critHalf, 12);
    expect(attackOdds({ toHit: 5, parts: [{ dice: parseDice('1d8')!, type: 'slashing' }] }, 10, 'normal', def).unclear).toBe(true);
  });

  it('концентрация: DC 10 или половина урона; +2 после 30 урона — DC 15, удержит в 40%', () => {
    expect(concentrationHoldChance(2, 30)).toBeCloseTo(0.4, 12);
    expect(concentrationHoldChance(2, 4)).toBeCloseTo(0.65, 12);
  });

  it('срок концентрации из duration SRD (ROADMAP 5.5): Hunter\'s Mark — 1 час, раунд — 6 с; у всех заклинаний с концентрацией разбирается', () => {
    expect(concentrationSec(SPELLS['hunters-mark'])).toBe(3600);
    expect(concentrationSec(SPELLS['hold-person'])).toBe(60);
    expect(concentrationSec(SPELLS['fireball'])).toBeUndefined();
    const conc = SPELL_LIST.filter(s => s.concentration);
    expect(conc.filter(s => concentrationSec(s) === undefined).map(s => s.duration)).toEqual([]);
    expect(conc.filter(s => concentrationSec(s) === 6)).toHaveLength(1);
  });

  it('спасбросок в тексте действия и заклинания', () => {
    expect(saveInText('Each creature in that area must make a DC 13 Dexterity saving throw')).toEqual({ dc: 13, ability: 'dex' });
    expect(spellSaveAbility('The target must succeed on a dexterity saving throw or take 1d8 radiant damage.')).toBe('dex');
    expect(spellSaveAbility('You create a sound')).toBeNull();
  });

  it('подписи: проценты и среднее с запятой', () => {
    expect(percent(0.35)).toBe('35%');
    expect(percent(0.0025)).toBe('<1%');
    expect(percent(0.9975)).toBe('>99%');
    expect(meanText(2.925)).toBe('2,9');
    expect(meanText(4)).toBe('4');
  });
});
