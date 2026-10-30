// Проекция карты персонажа (TASKS Д9): числа листа для components/CharacterCard.tsx. Отдельно от компонента: страница
// зовёт её в основном куске, а сам компонент — ленивая часть (бюджет основного куска, ROADMAP 2.5).
import type { Actor } from '../engine';
import { chipsOf, type ChipSpec } from '../components/ConditionChip';
import type { PcHeaderData } from '../components/PcSheet';
import { poolLabel, resourcePoolsOf } from './resources';
import { sheetViewOf, type AbilityView, type SkillView } from './sheetView';

/** Пропорции карты: 63 × 88 мм, как у игральной (решение агента 29.10.2026 — владелец поправит). */
export const CARD_RATIO = 63 / 88;
/** Ширина карты на столе, px; высота — по пропорции. */
export const CARD_WIDTH = 360;

export interface CardPool { id: string; label: string; max: number; spent: number }

export interface CharacterCardData {
  id: string;
  name: string;
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
  attacks: readonly { id: string; name: string; toHit: number; damage: string }[];
  /** Заклинатель: Сл спасброска и бонус атаки заклинанием; не заклинатель — поля нет. */
  spells?: { dc: number; attack: number };
}

/** Актёр с листом → карта; без листа — undefined (монстр и NPC без листа остаются карточкой). */
export function characterCardProps(actor: Actor, header: PcHeaderData, nowSec: number): CharacterCardData | undefined {
  const view = sheetViewOf(actor);
  if (!view) return undefined;
  return {
    id: actor.id,
    name: actor.name,
    header,
    hp: { current: actor.hp.current, max: actor.hp.max, temp: actor.hp.temp },
    ac: actor.ac,
    initiative: view.initiative,
    passivePerception: actor.passivePerception,
    ...(view.hitDice ? { hitDice: view.hitDice } : {}),
    abilities: view.abilities,
    skills: view.skills,
    proficiencyBonus: view.proficiencyBonus,
    pools: resourcePoolsOf(actor).map(p => ({ id: p.id, label: poolLabel(p), max: p.max, spent: p.spent })),
    chips: chipsOf(actor, nowSec),
    attacks: (actor.sheet?.attacks ?? []).map(a => ({ id: a.id, name: a.name, toHit: a.toHit, damage: a.damage })),
    ...(actor.sheet?.spellcasting ? { spells: { dc: actor.sheet.spellcasting.saveDc, attack: actor.sheet.spellcasting.attack } } : {}),
  };
}

