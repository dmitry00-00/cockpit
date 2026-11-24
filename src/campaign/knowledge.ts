// Знание как ресурс (Д6, DESIGN): строка паспорта карточки справочника открывается партии проверкой знаний или волей
// мастера (KNOWLEDGE_REVEALED). Карточка у игроков — их тетрадь: только открытое, снимком из лога. Какой навык у какой
// сущности и какая Сл — правило стола, не SRD: Сл берётся из таблицы типичных DC SRD, навык — по виду сущности (ниже).
// Правила (заклинания, состояния, классы) туман не держит: их игроки знают по книге.
import type { EntityView } from '../entities';
import type { EntityKind } from '../entities/ref';
import { knowledgeHow, type Actor, type KnownEntity, type KnownFact, type State } from '../engine';
import type { SkillId } from '../rules/srd/abilities';
import { DIFFICULTY_CLASSES } from '../rules/srd/checks';
import { MONSTERS } from '../rules/srd/monsters';
import { calendarAdapterForState } from './calendar';
import { sheetViewOf } from './sheetView';

/** Проверки знаний DESIGN Д6: История, Религия, Магия, Природа. */
export const KNOWLEDGE_SKILLS: readonly SkillId[] = ['arcana', 'history', 'nature', 'religion'];

/** Сл по умолчанию — «Medium» таблицы SRD. */
export const KNOWLEDGE_DC = DIFFICULTY_CLASSES.find(d => d.label === 'Medium')!.dc;

export const KNOWLEDGE_RULE = 'правило стола: навык по виду сущности, Сл по таблице типичных DC SRD';

/** Виды знания о мире: на них туман у игроков. */
const LORE_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['monster', 'plane', 'body', 'sphere', 'deity', 'pantheon', 'place', 'person', 'organization', 'kingdom']);

export const isLore = (view: Pick<EntityView, 'kind' | 'source'>): boolean => LORE_KINDS.has(view.kind) && view.source.kind !== 'campaign';

/** Тип монстра SRD → навык (правило стола): звери и растения — Природа, нежить и небожители — Религия, люди — История. */
const MONSTER_SKILL: Readonly<Record<string, SkillId>> = {
  beast: 'nature', plant: 'nature',
  celestial: 'religion', fiend: 'religion', undead: 'religion',
  aberration: 'arcana', construct: 'arcana', dragon: 'arcana', elemental: 'arcana', fey: 'arcana', monstrosity: 'arcana', ooze: 'arcana',
  humanoid: 'history', giant: 'history',
};

/** Навык проверки знаний по сущности — правило стола (KNOWLEDGE_RULE). */
export function knowledgeSkillOf(view: Pick<EntityView, 'kind' | 'subtitle'>): SkillId {
  switch (view.kind) {
    case 'deity': case 'pantheon': return 'religion';
    case 'plane': case 'sphere': case 'body': return 'arcana';
    case 'monster': {
      const type = /^\S+\s+([a-z]+)/i.exec(view.subtitle ?? '')?.[1]?.toLowerCase();
      return (type && MONSTER_SKILL[type]) || 'arcana';
    }
    default: return 'history';
  }
}

/** Пассивная проверка SRD 5.1 (Ability Checks, «Passive Checks»): «10 + all modifiers that normally apply to the check». */
export const passiveScore = (mod: number): number => 10 + mod;

/** Rule-of-table DC for noticing an actor's lie: 10 + its Deception modifier (research/game-mechanics.md §4.5). */
export function deceptionDcOf(actor: Actor): number | undefined {
  const sheetMod = actor.sheet ? sheetViewOf(actor)?.skills.find(skill => skill.id === 'deception')?.mod : undefined;
  if (sheetMod !== undefined) return 10 + sheetMod;
  const monster = actor.monsterId ? MONSTERS[actor.monsterId] : undefined;
  if (!monster) return undefined;
  const modifier = monster.skills.deception ?? Math.floor((monster.abilities.cha - 10) / 2);
  return 10 + modifier;
}

export interface PassiveVoice { id: string; name: string; score: number }

/**
 * Голоса навыков (Д13, идея Disco Elysium на пассивных проверках SRD; решение пользователя 30.10.2026): кто из партии
 * знает без броска — пассивный навык не ниже Сл; по убыванию. Никто — лучший из партии, чтобы мастер видел разрыв.
 */
export function passiveVoices(members: readonly { id: string; name: string; mods: Partial<Record<SkillId, number>> }[], skill: SkillId, dc: number): { knows: PassiveVoice[]; best?: PassiveVoice } {
  const all = members.map(m => ({ id: m.id, name: m.name, score: passiveScore(m.mods[skill] ?? 0) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const knows = all.filter(v => v.score >= dc);
  return knows.length || !all.length ? { knows } : { knows, best: all[0] };
}

/** Что партия знает о сущности: строки тетради по подписи. */
export function knownFacts(state: State, ref: EntityView['ref']): ReadonlyMap<string, KnownFact> {
  return new Map((state.knowledge?.[ref]?.facts ?? []).map(f => [f.label, f]));
}

/**
 * Карточка глазами игроков: у сущности мира — имя, вид и открытые строки снимком из лога; текстов, связей, схемы и
 * подзаголовка (там CR и мировоззрение) нет. Правила и записи кампании — как есть.
 */
export function playersEntityView(view: EntityView, state: State): EntityView {
  if (!isLore(view)) return view;
  const known = state.knowledge?.[view.ref]?.facts ?? [];
  return { ref: view.ref, kind: view.kind, name: view.name, ...(view.nameRu ? { nameRu: view.nameRu } : {}), source: view.source, facts: known.map(f => ({ label: f.label, value: f.value })), sections: [], links: [] };
}

/** Строка тетради словами: «15 Mirtul 1492 DR · Bo Tambernack, Religion 17 против Сл 15». */
export function knownLine(fact: KnownFact, state: State): string {
  return `${calendarAdapterForState(state).formatDateOnly(fact.sec)} · ${knowledgeHow(fact, id => state.actors[id]?.name ?? id)}`;
}

/** Тетрадь партии: сущности, последняя узнанная — сверху; строки — в порядке, в каком узнавали. */
export function notebookOf(state: State): KnownEntity[] {
  const last = (e: KnownEntity) => Math.max(...e.facts.map(f => f.sec));
  return Object.values(state.knowledge ?? {}).sort((a, b) => last(b) - last(a) || a.name.localeCompare(b.name));
}
