/** Versioned allowlist DTO for one assigned player character and public party state. */
import type { PortraitRef } from '../art/portrait';
import type { ChipSpec } from '../components/ConditionChip';
import type { AbilityView, SkillView } from '../campaign/sheetView';
import type { IconName } from '../icons/Icon';
import type { CharacterCardData } from '../campaign/characterCard';

export interface PlayerProjection {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  hero: PlayerHero;
  party: readonly PlayerPartyMember[];
  worldTime: PlayerWorldTime;
  encounter: PlayerEncounter;
  /** Recent journal summaries already filtered for the player audience on the trusted host. */
  /** Optional for offline snapshots created by older schemaVersion 1 clients. */
  updates?: readonly PlayerUpdate[];
  /** Source-indexed adventure handouts contain only facts the DM explicitly opened to players. */
  adventureNotes?: readonly PlayerAdventureNote[];
  /** Rumors opened to players at their current campaign location; source routes and GM metadata are omitted. */
  rumors?: readonly PlayerRumor[];
}

export interface PlayerRumor { text: string; location: string }

export interface PlayerAdventureNote {
  id: string;
  adventureTitle: string;
  title: string;
  summary: string;
  entries: readonly { id: string; name: string; summary: string }[];
}

export interface PlayerUpdate {
  id: string;
  at: number;
  worldSec: number;
  text: string;
}

export interface PlayerHero {
  name: string;
  ancestry: string;
  className: string;
  subclassName?: string;
  level: number;
  hp: { current: number; maximum: number; temporary: number };
  armorClass: number;
  abilities: readonly PlayerAbility[];
  skills: readonly PlayerSkill[];
  attacks: readonly PlayerAttack[];
  resources: readonly PlayerResource[];
  /** Public A5E favor counters, kept separate from recharge-based class resources. */
  favor?: readonly { deity: string; amount: number }[];
  conditions: readonly PlayerCondition[];
  equipment: readonly PlayerEquipment[];
  features: readonly PlayerFeature[];
  spells: readonly PlayerSpell[];
  /** Safe projection for the shared physical character card component; absent in older cached snapshots. */
  card?: PlayerCardProjection;
}

export interface PlayerCardProjection {
  title: string;
  emblems: readonly { icon: IconName; title: string }[];
  portrait?: PortraitRef;
  initiative: number;
  passivePerception: number;
  proficiencyBonus: number;
  hitDice?: { die: number; available: number; total: number };
  abilities: readonly AbilityView[];
  skills: readonly SkillView[];
  pools: readonly {
    id: string;
    label: string;
    max: number;
    spent: number;
    kind: 'slots' | 'uses' | 'pool';
    restoresOn: 'short' | 'long' | 'turn';
  }[];
  chips: readonly Pick<ChipSpec, 'id' | 'key' | 'label' | 'icon' | 'kind' | 'timer' | 'level'>[];
  attacks: readonly { id: string; name: string; toHit: number; damage: string }[];
  spells?: { dc: number; attack: number };
  spellActions?: CharacterCardData['spellActions'];
}

export interface PlayerAbility {
  label: string;
  score: number;
  modifier: number;
  savingThrow: number;
  savingThrowProficient: boolean;
}

export interface PlayerSkill {
  label: string;
  modifier: number;
  proficiency: 'none' | 'proficient' | 'expert';
}

export interface PlayerAttack {
  name: string;
  toHit: number;
  damage: string;
  damageType: string;
  range?: string;
}

export interface PlayerResource {
  label: string;
  available: number;
  maximum: number;
  restoresOn: 'short' | 'long' | 'turn';
}

export interface PlayerCondition {
  label: string;
  level?: number;
}

export interface PlayerEquipment {
  name: string;
  quantity: number;
}

export interface PlayerFeature {
  kind: 'class' | 'ancestry' | 'feat';
  name: string;
  level?: number;
}

export interface PlayerSpell {
  name: string;
  kind: 'cantrip' | 'known' | 'prepared' | 'in spellbook' | 'always prepared';
  level: number;
}

export interface PlayerPartyMember {
  name: string;
  hp: { current: number; maximum: number; temporary: number };
  conditions: readonly PlayerCondition[];
  currentTurn: boolean;
}

export interface PlayerWorldTime {
  date: string;
  time: string;
  tempo: string;
}

export interface PlayerEncounter {
  active: boolean;
  round?: number;
  currentTurn: 'party' | 'opponents' | null;
}

export type PlayerConnectionStatus = 'connecting' | 'online' | 'offline' | 'revoked';
