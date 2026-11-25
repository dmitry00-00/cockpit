import type { ArtId } from './registry.generated';

/** Curated, explicit links for the first Lost Mine of Phandelver art queue.
 * These illustrations are authored material, not book art, maps, tokens, or rules data. */
export const FIRST_PACK_NODE_ART = {
  // Named NPC portraits; Iarno is only the public-facing interpretation.
  gundren: 'codex-npc-gundren-v1',
  sildar: 'codex-npc-sildar-v1',
  linene: 'codex-npc-linene-v1',
  qelline: 'codex-npc-qelline-v1',
  carp: 'codex-npc-carp-v1',
  toblen: 'codex-npc-toblen-v1',
  iarno: 'codex-npc-iarno-v1',

  // Six creature types, distinct from named NPC/creature portraits such as Klarg or Yeemik.
  goblin: 'codex-creature-goblin-v1',
  wolf: 'codex-creature-wolf-v1',
  bugbear: 'codex-creature-bugbear-v1',
  redbrand: 'codex-creature-redbrand-v1',
  nothic: 'codex-creature-nothic-v1',
  skeleton: 'codex-creature-skeleton-v1',

  // Scenic mood only; none of these files is a map or a geographic source.
  ambush: 'codex-scene-road-v1',
  trail: 'codex-scene-forest-v1',
  arrival: 'codex-scene-village-v1',
  rumours: 'codex-scene-town-v1',
  'under-manor': 'codex-scene-ruins-v1',
  'hamun-investigation': 'codex-scene-camp-fixed-v1',

  // Exact potion nodes in the source graph; the image does not encode rules/effects.
  'iarno-healing-potion': 'kimi-item-item-healing-potion',
  'hamun-healing-potion': 'kimi-item-item-healing-potion',
  'thundertree-healing-potion': 'kimi-item-item-healing-potion',
  'grol-healing-potions': 'kimi-item-item-healing-potion',
  'cragmaw-healing-potion': 'kimi-item-item-healing-potion',
  'nezznar-healing-potion': 'kimi-item-item-healing-potion',
} as const satisfies Partial<Record<string, ArtId>>;

/** Generic shopkeeper concept. It stays unattached to Elmar/Elmina's identity. */
export const FIRST_PACK_GENERIC_SHOPKEEPER_ART: ArtId = 'codex-npc-frontier-shopkeeper-v1';

/** Twelve approved-direction item motifs connected to exact SRD equipment entries. */
export const FIRST_PACK_ITEM_ART = {
  'chain-mail': 'kimi-item-item-chainmail-v1',
  dagger: 'kimi-item-item-dagger-v1',
  amulet: 'kimi-item-item-holy-symbol-generic-v1',
  longbow: 'kimi-item-item-longbow-v1',
  'rations-1-day': 'kimi-item-item-rations-v1',
  'rope-hempen-50-feet': 'kimi-item-item-rope-v1',
  shield: 'kimi-item-item-shield-v1',
  shortsword: 'kimi-item-item-shortsword-v1',
  spellbook: 'kimi-item-item-spellbook-v1',
  warhammer: 'kimi-item-item-warhammer-v1',
  'potion-of-healing': 'kimi-item-item-healing-potion',
  'lantern-hooded': 'kimi-item-item-lantern',
} as const satisfies Readonly<Record<string, ArtId>>;

/** Exact additional inventory id from the travel-object series. */
export const TRAVEL_ITEM_ART = {
  waterskin: 'codex-travel-waterskin-v1',
} as const satisfies Readonly<Record<string, ArtId>>;

export function firstPackItemArtwork(itemId: string): ArtId | undefined {
  return FIRST_PACK_ITEM_ART[itemId as keyof typeof FIRST_PACK_ITEM_ART]
    ?? TRAVEL_ITEM_ART[itemId as keyof typeof TRAVEL_ITEM_ART];
}
