// Проекция карты персонажа (TASKS Д9): числа листа для components/CharacterCard.tsx. Отдельно от компонента: страница
// зовёт её в основном куске, а сам компонент — ленивая часть (бюджет основного куска, ROADMAP 2.5).
import type { Actor } from '../engine';
import { chipsOf, type ChipSpec } from '../components/ConditionChip';
import type { PcHeaderData } from '../components/PcSheet';
import type { PortraitRef } from '../art/portrait';
import { poolLabel, resourcePoolsOf } from './resources';
import { sheetViewOf, type AbilityView, type SkillView } from './sheetView';
import { strifeTooltip } from './strife';
import { SPELLS, SCHOOL_LABEL, spellLevelLabel } from '../rules/srd/spells';
import { schoolIcon } from '../components/sheetIcons';
import type { IconName } from '../icons/Icon';

/** Пропорции карты: 63 × 88 мм, как у игральной (решение агента 29.10.2026 — владелец поправит). */
export const CARD_RATIO = 63 / 88;
/** Ширина карты на столе, px; высота — по пропорции. */
export const CARD_WIDTH = 400;

export interface CardPool {
  id: string;
  label: string;
  max: number;
  spent: number;
  kind: 'slots' | 'uses' | 'pool';
  restoresOn: 'short' | 'long' | 'turn';
}

export interface CharacterCardData {
  id: string;
  name: string;
  portrait?: PortraitRef;
  header: PcHeaderData;
  hp: { current: number; max: number; temp: number };
  ac: number;
  initiative: number;
  passivePerception: number;
  /** Кости хитов: кость, осталось и всего — полоса боя карты. */
  hitDice?: { die: number; available: number; total: number };
  abilities: readonly AbilityView[];
  skills: readonly SkillView[];
  proficiencyBonus: number;
  pools: readonly CardPool[];
  chips: readonly ChipSpec[];
  /** DM-only readout of A5E tracked-condition effects; all lower levels stack. */
  strife?: { level: number; title: string };
  attacks: readonly { id: string; name: string; toHit: number; damage: string }[];
  /** Заклинатель: Сл спасброска и бонус атаки заклинанием; не заклинатель — поля нет. */
  spells?: { dc: number; attack: number };
  /** Репертуар для панели быстрых действий. Иконка открывает описание на обороте, но сама не разыгрывает заклинание. */
  spellActions?: readonly { id: string; name: string; icon: IconName; meta: string }[];
}

/** Player-safe summary of a spell already present on the actor's character sheet. */
export function spellActionsOf(actor: Actor): NonNullable<CharacterCardData['spellActions']> {
  const spellcasting = actor.sheet?.spellcasting;
  if (!spellcasting) return [];
  return [...new Set([...spellcasting.cantrips, ...spellcasting.spells, ...spellcasting.always])]
    .flatMap(id => {
      const spell = SPELLS[id];
      if (!spell) return [];
      const always = spellcasting.always.includes(id);
      const availability = spell.level === 0 ? 'заговор' : always ? 'всегда' : spellcasting.kind === 'spellbook' ? 'в книге' : spellcasting.kind === 'prepared' ? 'подготовлено' : 'известно';
      return [{ id, name: spell.name, icon: schoolIcon(spell.school), meta: `${spellLevelLabel(spell.level)} · ${SCHOOL_LABEL[spell.school]} · ${availability}${spell.concentration ? ' · концентрация' : ''}` }];
    });
}

/** Актёр с листом → карта; без листа — undefined (монстр и NPC без листа остаются карточкой). */
export function characterCardProps(actor: Actor, header: PcHeaderData, nowSec: number, dmView = true): CharacterCardData | undefined {
  const view = sheetViewOf(actor);
  if (!view) return undefined;
  return {
    id: actor.id,
    name: actor.name,
    ...(actor.sheet?.portrait ? { portrait: actor.sheet.portrait } : {}),
    header,
    hp: { current: actor.hp.current, max: actor.hp.max, temp: actor.hp.temp },
    ac: actor.ac,
    initiative: view.initiative,
    passivePerception: actor.passivePerception,
    ...(view.hitDice ? { hitDice: view.hitDice } : {}),
    abilities: view.abilities,
    skills: view.skills,
    proficiencyBonus: view.proficiencyBonus,
    pools: resourcePoolsOf(actor).map(p => ({ id: p.id, label: poolLabel(p), max: p.max, spent: p.spent, kind: p.kind, restoresOn: p.restoresOn })),
    chips: chipsOf(actor, nowSec),
    ...(dmView && actor.a5eConditions?.strife ? { strife: { level: actor.a5eConditions.strife, title: strifeTooltip(actor.a5eConditions.strife) } } : {}),
    attacks: (actor.sheet?.attacks ?? []).map(a => ({ id: a.id, name: a.name, toHit: a.toHit, damage: a.damage })),
    ...(actor.sheet?.spellcasting ? {
      spells: { dc: actor.sheet.spellcasting.saveDc, attack: actor.sheet.spellcasting.attack },
      spellActions: spellActionsOf(actor),
    } : {}),
  };
}

