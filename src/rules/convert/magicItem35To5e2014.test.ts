// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { convert35ProtectionRingTo5e2014, type Dnd35ProtectionRingInput } from './magicItem35To5e2014';

const protectionPlusOne: Dnd35ProtectionRingInput = {
  id: 'protection-plus-one',
  name: 'Protection +1',
  slot: 'ring',
  enhancementBonus: 1,
  bonusType: 'deflection',
  treasureCategory: 'minor',
  marketPriceGp: 2000,
  source: {
    title: 'D&D 3.5 SRD · Magic Rings',
    url: 'https://www.d20srd.org/srd/magicItems/rings.htm',
    license: 'OGL 1.0a',
    attribution: 'D&D 3.5 SRD; Open Game Content; preserve license notices on export.',
  },
};

describe('draft conversion: D&D 3.5 SRD → D&D 5e / 2014 magic item', () => {
  it('uses the explicit alias and carries P1 classification with separate losses and judgments', () => {
    const original = structuredClone(protectionPlusOne);
    const result = convert35ProtectionRingTo5e2014(protectionPlusOne);

    expect(protectionPlusOne).toEqual(original);
    expect(result).toMatchObject({
      status: 'converted',
      reviewStatus: 'pending-manual-review',
      profile: { status: 'draft-owner-policy-not-approved', matching: 'explicit alias only; no fuzzy matching' },
      source: { license: 'OGL 1.0a', edition: 'D&D 3.5 SRD' },
      sourceClassification: { type: 'magic-item', bookSection: 'Magic Rings', license: 'OGL 1.0a' },
      targetClassification: {
        id: 'magic-item:ring-of-protection',
        type: 'magic-item',
        bookSection: 'Magic Items',
        source: 'System Reference Document 5.1',
        edition: 'D&D 5e / 2014',
        license: 'CC BY 4.0',
        layer: 'rules',
        basis: 'P1 SRD catalog record',
        catalogRecordId: 'magic-item:ring-of-protection',
      },
      distribution: 'internal-review',
      target: {
        id: 'ring-of-protection',
        name: 'Ring of Protection',
        rarity: 'rare',
        attunement: { required: true },
      },
    });
    expect(result.losses.map(loss => loss.sourceField)).toEqual([
      'bonusType', 'marketPriceGp', 'treasureCategory',
    ]);
    expect(result.judgments.map(judgment => judgment.sourceField)).toEqual([
      'target.savingThrows', 'target.attunement',
    ]);
  });

  it('rejects unsupported aliases and enhancement values instead of guessing', () => {
    expect(() => convert35ProtectionRingTo5e2014({ ...protectionPlusOne, name: 'Protection Ring' }))
      .toThrow('No explicit 3.5 SRD item alias');
    expect(() => convert35ProtectionRingTo5e2014({ ...protectionPlusOne, enhancementBonus: 2 }))
      .toThrow('only maps the +1 protection ring');
  });
});
