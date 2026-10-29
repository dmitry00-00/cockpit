import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../rules/srd';
import { actionOdds, monsterSaves, oddsTargetOf, sheetAttackOdds, sheetSpellOdds } from './odds';
import { KORRIN } from './party';
import { pcActor, seedState } from './seed';

const bandit = () => Object.values(seedState().actors).find(a => a.monsterId === 'bandit')!;

describe('шансы за столом (ROADMAP 5.2–5.3)', () => {
  it('цель-монстр: AC, спасброски блока (напечатанные и по характеристике), защита от урона', () => {
    const captain = Object.values(seedState().actors).find(a => a.monsterId === 'bandit-captain')!;
    const t = oddsTargetOf(captain);
    expect(t.ac).toBe(15);
    // Bandit Captain печатает STR +4, DEX +5, WIS +2; остальное — модификатор.
    expect(monsterSaves(MONSTERS['bandit-captain'])).toMatchObject({ str: 4, dex: 5, wis: 2, con: 2, int: 2, cha: 2 });
    expect(t.defenses).toEqual({ resistances: [], immunities: [], vulnerabilities: [] });
  });

  it('цель-персонаж: спасброски листа с владением', () => {
    const t = oddsTargetOf(seedState().actors.korrin);
    expect(t.ac).toBe(18);
    expect(t.saves!.str).toBeGreaterThan(t.saves!.int);
  });

  it('атака блока против партии — строка на каждого; действие без атаки и DC — null', () => {
    const s = seedState();
    const party = s.party.map(id => oddsTargetOf(s.actors[id]));
    const scimitar = MONSTERS['bandit-captain'].actions.find(a => a.name === 'Scimitar')!;
    const odds = actionOdds(scimitar, party)!;
    if (odds.kind !== 'attack') throw new Error('Scimitar — атака');
    expect(odds.rows.map(r => r.target.name)).toEqual(['Bo Tambernack', 'Korrin Battlehammer', 'Lyra Moonwhisper', 'Brother Aldric']);
    // +5 против AC 18 у Korrin: нужно 13+ → 8 граней из 20.
    expect(odds.rows[1].hit).toBe(0.4);
    expect(actionOdds(MONSTERS['bandit-captain'].actions.find(a => a.name === 'Multiattack')!, party)).toBeNull();
  });

  it('действие со спасброском в тексте: шанс провала по спасброскам листа', () => {
    const s = seedState();
    const party = s.party.map(id => oddsTargetOf(s.actors[id]));
    const breath = MONSTERS['young-red-dragon'].actions.find(a => a.name.startsWith('Fire Breath'))!;
    const odds = actionOdds(breath, party)!;
    expect(odds).toMatchObject({ kind: 'save', dc: 17, ability: 'dex' });
    expect(odds.rows).toHaveLength(4);
  });

  it('лист: атака мечом одной рукой и двумя против Bandit; заклинание со спасброском — провал по блоку', () => {
    const fighter = pcActor({ ...KORRIN, equipment: [{ id: 'chain-mail', qty: 1 }, { id: 'longsword', qty: 1 }, { id: 'shield', qty: 1 }] });
    const targets = [oddsTargetOf(bandit())];
    const attacks = sheetAttackOdds(fighter, targets);
    expect(attacks.map(a => a.name)).toEqual(['Longsword', 'Longsword · двумя руками']);
    expect(attacks[0].kind === 'attack' && attacks[0].rows[0].hit).toBeGreaterThan(0.5);
    // Лист с заклинаниями — руками: полная книга волшебника для редактора здесь не нужна.
    const lyra = seedState().actors.lyra;
    const wizard = { ...lyra, sheet: { ...lyra.sheet!, spellcasting: { ability: 'int' as const, saveDc: 14, attack: 6, kind: 'spellbook' as const, maxLevel: 3, cantrips: ['acid-splash', 'fire-bolt'], spells: ['burning-hands'], always: [] } } };
    const spells = sheetSpellOdds(wizard, targets);
    // Acid Splash и Burning Hands — спасбросок Dexterity; Fire Bolt — атака заклинанием, не спасбросок.
    expect(spells.map(s => s.name)).toEqual(['Acid Splash', 'Burning Hands']);
    expect(spells[0]).toMatchObject({ kind: 'save', ability: 'dex', dc: 14 });
    // Bandit: DEX 12 → +1; провал против DC 14 — грани 1…12.
    expect(spells[0].kind === 'save' && spells[0].rows[0].fail).toBeCloseTo(0.6, 12);
  });

  it('снаряжение сида (29.10): у Bo длинный лук с помехой — Маленький с тяжёлым; преимущество её гасит', () => {
    const bo = seedState().actors.bo;
    const targets = [oddsTargetOf(bandit())];
    const names = (mode?: 'advantage') => sheetAttackOdds(bo, targets, mode).map(a => a.name);
    expect(names()).toEqual(['Longbow · с помехой', 'Shortsword']);
    const hit = (i: number, mode?: 'advantage') => {
      const a = sheetAttackOdds(bo, targets, mode)[i];
      return a.kind === 'attack' ? a.rows[0].hit : NaN;
    };
    // +6 против AC 12 у Bandit: нужно 6+ → 0,75 одной костью; с помехой 0,75², с преимуществом и помехой — одна кость.
    expect(hit(0)).toBeCloseTo(0.75 ** 2, 12);
    expect(hit(0, 'advantage')).toBe(0.75);
    expect(hit(1)).toBe(0.75);
  });
});
