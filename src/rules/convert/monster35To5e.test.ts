// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MONSTER_BENCHMARKS } from './a5eMonsterBenchmark';
import { convert35MonsterTo5e2014, type Dnd35MonsterInput } from './monster35To5e';

const wolf35: Dnd35MonsterInput = {
  id: 'wolf',
  name: 'Wolf',
  size: 'Medium',
  type: 'Animal',
  alignment: 'neutral',
  cr: '1',
  ac: 14,
  naturalArmorBonus: 2,
  hp: { average: 13, hitDice: 2, formula: '2d8+4' },
  speedFt: 50,
  languages: '',
  abilities: { str: 13, dex: 15, con: 15, int: 2, wis: 12, cha: 6 },
  saves: { fort: 5, ref: 5, will: 1 },
  skills: [
    { name: 'Hide', ability: 'dex', bonus: 2 },
    { name: 'Listen', ability: 'wis', bonus: 3 },
    { name: 'Move Silently', ability: 'dex', bonus: 3 },
    { name: 'Spot', ability: 'wis', bonus: 3 },
    { name: 'Survival', ability: 'wis', bonus: 1 },
  ],
  senses: { lowLightVision: true, scent: true },
  conditionalSkillBonuses: [{ skill: 'Survival', bonus: 4, condition: 'tracking by scent' }],
  feats: ['Track', 'Weapon Focus (bite)'],
  attacks: [{ name: 'Bite', attackBonus: 3, ability: 'str', damageFormula: '1d6 + 1', effect: 'trip' }],
  source: {
    title: 'Revised (v3.5) System Reference Document · Wolf',
    url: 'https://www.35srd.com/monsters/animals/wolf/',
    license: 'OGL 1.0a',
    attribution: 'Revised (v3.5) System Reference Document; Open Game Content; retain source/license notices on export.',
  },
};

describe('draft conversion: D&D 3.5 SRD → D&D 5e / 2014', () => {
  it('transcribes the complete cited monster-building CR table without interpolation', () => {
    expect(MONSTER_BENCHMARKS).toHaveLength(34);
    expect(MONSTER_BENCHMARKS.find(row => row.cr === '1/4')).toMatchObject({
      ac: 12, hp: 15, proficiencyBonus: 2, abilityBonus: 1,
      attacks: 1, damagePerRound: 5, easyDc: 11, hardDc: 11, xp: 50,
    });
  });

  it('builds a 5e candidate from an open 3.5 wolf, marks every material difference, and estimates CR', () => {
    const original = structuredClone(wolf35);
    const result = convert35MonsterTo5e2014(wolf35, '1/4');

    expect(wolf35).toEqual(original);
    expect(result.status).toBe('converted');
    expect(result.reviewStatus).toBe('pending-manual-review');
    expect(result.profile.status).toBe('draft-owner-policy-not-approved');
    expect(result.distribution).toBe('internal-review');
    expect(result.source.license).toBe('OGL 1.0a');
    expect(result.sourceClassification).toMatchObject({ type: 'monster', bookSection: 'Monsters', edition: 'D&D 3.5 SRD' });
    expect(result.targetClassification).toMatchObject({
      type: 'monster', bookSection: 'Monsters', edition: 'D&D 5e / 2014 candidate format',
      basis: 'P1 taxonomy for derived candidate', license: expect.stringContaining('Unresolved composite'), layer: 'rules',
    });
    expect(result.sourceRecord).toEqual(wolf35);
    expect(result.profile.combatConstruction.license).toBe('CC BY 4.0');
    expect(result.targetCrWasSelectedByCaller).toBe(true);
    expect(result.target).toMatchObject({
      name: 'Wolf', size: 'Medium', type: 'beast', cr: '1/4', xp: 50,
      ac: { value: 14 }, hp: { average: 13, formula: '2d8 + 4' },
      speed: { walk: 50 }, proficiencyBonus: 2,
      abilities: { str: 13, dex: 15, con: 15, int: 2, wis: 12, cha: 6 },
      savingThrows: { con: 4, dex: 4 },
      skills: { Stealth: 4, Perception: 3 },
      actions: [{
        name: 'Bite', attack: { toHit: 3, damage: '1d6 + 1', average: 5, damageType: 'piercing' },
        onHitEffect: { save: { ability: 'str', dc: 11 }, onFailure: 'prone' },
      }],
    });
    expect(result.estimate).toMatchObject({
      defensiveCr: '1/4', offensiveCr: '1/4', estimatedCr: '1/4',
      distanceFromTargetInCrSteps: 0, withinOneCrStep: true,
    });
    expect(result.losses).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceField: 'senses.lowLightVision' }),
      expect.objectContaining({ sourceField: 'feats.Track' }),
      expect.objectContaining({ sourceField: 'feats.Weapon Focus (bite)' }),
    ]));
    expect(result.judgments).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceField: 'senses.scent', approval: 'pending' }),
      expect.objectContaining({ sourceField: 'attacks.Bite.effect', approval: 'pending' }),
      expect.objectContaining({ sourceField: 'conditionalSkillBonuses.Survival', approval: 'pending' }),
    ]));
    expect(result.ledger.map(entry => entry.sourceField)).toEqual(expect.arrayContaining([
      'size/type', 'speed', 'ac/naturalArmorBonus', 'hp.hitDice + CON', 'cr',
      'saves.fort', 'saves.ref', 'saves.will', 'skills.Hide+Move Silently',
      'skills.Listen+Spot', 'attacks.Bite.damageFormula',
    ]));
  });

  it('fails closed when the target CR or type has no profile mapping', () => {
    expect(() => convert35MonsterTo5e2014(wolf35, '3/4')).toThrow(/Unsupported target CR/);
    expect(() => convert35MonsterTo5e2014({ ...wolf35, type: 'unknown' }, '1/4')).toThrow(/No approved type mapping/);
  });
});
