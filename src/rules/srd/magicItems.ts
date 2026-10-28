// Магические предметы 5e SRD 5.1 (CC-BY-4.0, см. LICENSE.md) — content/srd/magic-items.json, который пишет
// scripts/import-srd-magic-items.mjs с открытого API (https://www.dnd5eapi.co/api/2014/magic-items): строка вида и
// редкости и текст дословно, на английском. Варианты («Armor, +1») — именами внутри своего предмета, как печатает SRD.
import raw from '../../../content/srd/magic-items.json';

export type MagicItemRarity = 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact' | 'varies';

export interface MagicItem {
  id: string;
  /** Английское имя SRD — по нему ищут в книгах. */
  name: string;
  /** Категория снаряжения API: wondrous-items, weapon, armor, ring, potion, wand, staff, rod, ammunition, scroll. */
  category: string;
  /** Первая строка блока дословно: «Ring, rare (requires attunement by a cleric)». */
  typeLine: string;
  /** «varies» — у предметов с вариантами («Potion of Healing», «Weapon, +1, +2, or +3»): редкость в typeLine. */
  rarity: MagicItemRarity;
  /** Кто может настроиться («a cleric») или когда («outdoors at night»). */
  attunement: { required: boolean; by?: string; when?: string };
  variants: readonly string[];
  /** Абзацы SRD дословно через пустую строку. */
  text: string;
  source: string;
}

const DATA = raw as unknown as { source: string; fetchedAt: string; items: Record<string, MagicItem> };

export const MAGIC_ITEMS: Readonly<Record<string, MagicItem>> = DATA.items;
export const MAGIC_ITEM_LIST: readonly MagicItem[] = Object.values(DATA.items);
export const MAGIC_ITEMS_SOURCE = { source: DATA.source, fetchedAt: DATA.fetchedAt } as const;
