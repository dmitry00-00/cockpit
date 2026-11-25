// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { convert35SpellTo5e2014, type Dnd35SpellInput } from './spell35To5e2014';

const magicMissile35: Dnd35SpellInput = {
  id: 'magic-missile',
  name: 'Magic Missile',
  school: 'Evocation',
  classLevels: { sorcerer: 1, wizard: 1 },
  components: ['V', 'S'],
  castingTime: '1 standard action',
  range: 'Medium (100 ft. + 10 ft./level)',
  duration: 'Instantaneous',
  savingThrow: 'None',
  spellResistance: true,
  targeting: { maxSeparationFeet: 15, maxTargetsAtMaximumProgression: 5 },
  progression: {
    baseProjectiles: 1,
    additionalProjectileEveryCasterLevels: 2,
    maxProjectiles: 5,
    damagePerProjectile: '1d4+1',
    damageType: 'force',
  },
  source: {
    title: 'Revised (v3.5) System Reference Document · Magic Missile',
    url: 'https://www.d20srd.org/srd/spells/magicMissile.htm',
    license: 'OGL 1.0a',
    attribution: 'Revised (v3.5) SRD; Open Game Content; reconcile required notices before any export.',
  },
};

describe('draft conversion: D&D 3.5 SRD → D&D 5e / 2014 spell', () => {
  it('matches the local SRD 5.1 record exactly and makes edition changes explicit', () => {
    const original = structuredClone(magicMissile35);
    const result = convert35SpellTo5e2014(magicMissile35);

    expect(magicMissile35).toEqual(original);
    expect(result.status).toBe('converted');
    expect(result.reviewStatus).toBe('pending-manual-review');
    expect(result.profile.status).toBe('draft-owner-policy-not-approved');
    expect(result.profile.matching).toContain('exact normalized name');
    expect(result.distribution).toBe('internal-review');
    expect(result.source.license).toBe('OGL 1.0a');
    expect(result.sourceClassification).toMatchObject({ type: 'spell', bookSection: 'Spells', edition: 'D&D 3.5 SRD' });
    expect(result.targetClassification).toMatchObject({
      type: 'spell', bookSection: 'Spells', edition: 'D&D 5e / 2014', license: 'CC BY 4.0', layer: 'rules',
      basis: 'P1 SRD catalog record', catalogRecordId: 'spell:magic-missile',
    });
    expect(result.targetSource).toMatchObject({
      title: 'System Reference Document 5.1',
      license: 'CC BY 4.0',
      sourceRef: 'content/srd/spells.json#spells[id=magic-missile]',
    });
    expect(result.sourceRecord).toEqual(magicMissile35);
    expect(result.target).toMatchObject({
      name: 'Magic Missile', id: 'magic-missile', level: 1, school: 'evocation',
      castingTime: '1 action', range: '120 feet', components: ['V', 'S'],
      duration: 'Instantaneous', concentration: false, ritual: false,
      higherLevel: expect.any(String), source: 'srd',
    });
    expect(result.target.text).toContain('1d4 + 1 force damage');
    expect(result.losses).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceField: 'range' }),
      expect.objectContaining({ sourceField: 'progression.casterLevel' }),
      expect.objectContaining({ sourceField: 'spellResistance' }),
      expect.objectContaining({ sourceField: 'targeting.maxSeparationFeet', sourceValue: 15 }),
      expect.objectContaining({ sourceField: 'targeting.maxTargetsAtMaximumProgression', sourceValue: 5 }),
    ]));
    expect(result.judgments).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceField: 'range', approval: 'pending' }),
      expect.objectContaining({ sourceField: 'progression.casterLevel', approval: 'pending' }),
      expect.objectContaining({ sourceField: 'spellResistance', approval: 'pending' }),
    ]));
    expect(result.ledger.map(entry => entry.sourceField)).toEqual(expect.arrayContaining([
      'name', 'classLevels', 'school', 'components', 'castingTime', 'duration',
      'savingThrow', 'progression.damagePerProjectile', 'targetRecord',
    ]));
  });

  it('does not guess when there is no exact SRD 5.1 name match', () => {
    expect(() => convert35SpellTo5e2014({ ...magicMissile35, name: 'Unmapped Spell' })).toThrow(/No exact SRD 5.1 spell match/);
  });

  it('records class-list mismatches instead of treating the shared name as full equivalence', () => {
    const result = convert35SpellTo5e2014({ ...magicMissile35, classLevels: { wizard: 1 } });
    expect(result.losses).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceField: 'classes' }),
      expect.objectContaining({ sourceField: 'classLevels' }),
    ]));
    expect(result.judgments).toContainEqual(expect.objectContaining({ sourceField: 'classLevels', approval: 'pending' }));
  });
});
