import { describe, expect, it } from 'vitest';
import { MAGIC_ITEMS, MAGIC_ITEM_LIST } from './magicItems';

describe('магические предметы SRD 5.1', () => {
  it('весь SRD: 239 предметов без вариантов API; у каждого источник CC-BY-4.0, редкость из строки вида и текст', () => {
    expect(MAGIC_ITEM_LIST).toHaveLength(239);
    for (const m of MAGIC_ITEM_LIST) {
      expect(m.source, m.id).toContain('CC-BY-4.0');
      expect(m.text.length, m.id).toBeGreaterThan(0);
      if (m.rarity !== 'varies') expect(m.typeLine.toLowerCase(), m.id).toContain(m.rarity);
      expect(m.attunement.required, m.id).toBe(m.typeLine.includes('requires attunement'));
      expect(`${m.typeLine} ${m.text}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(MAGIC_ITEM_LIST.some(m => /, \+1$/.test(m.name))).toBe(false);
  });

  it('дословно: строка вида, настройка с классами, варианты внутри предмета', () => {
    expect(MAGIC_ITEMS['ring-of-protection'].typeLine).toBe('Ring, rare (requires attunement)');
    expect(MAGIC_ITEMS['staff-of-the-magi'].attunement).toEqual({ required: true, by: 'a sorcerer, warlock, or wizard' });
    expect(MAGIC_ITEMS['bag-of-holding'].text).toContain('The bag can hold up to 500 pounds, not exceeding a volume of 64 cubic feet.');
    expect(MAGIC_ITEMS['ring-of-shooting-stars'].attunement).toEqual({ required: true, when: 'outdoors at night' });
    expect(MAGIC_ITEMS.armor.variants).toEqual(['Armor, +1', 'Armor, +2', 'Armor, +3']);
    expect(MAGIC_ITEMS['potion-of-healing'].rarity).toBe('varies');
  });
});
