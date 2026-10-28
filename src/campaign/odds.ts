// Шансы за столом (ROADMAP 5.2–5.3, DESIGN Д1): математика d20 из rules/srd/odds.ts над актёрами стола. Атака или
// спасбросок блока монстра — против каждого из партии; атака и заклинание со спасброском с листа — против противников.
// Только числа SRD и листа: мультиатаку не складываем (её состав — текст), чужого не досчитываем. Чистые функции.
import type { Actor } from '../engine';
import { ABILITY_IDS, MONSTERS, type AbilityId, type Monster, type MonsterAction } from '../rules/srd';
import { SPELLS } from '../rules/srd/spells';
import {
  attackOdds, attackProfileOf, parseDice, saveFailChance, saveInText, spellSaveAbility, type Defenses, type RollMode,
} from '../rules/srd/odds';
import { abilityMod } from './derive';
import { sheetViewOf } from './sheetView';

/** Цель числами: AC, спасброски, защита от типов урона (у персонажа её в листе нет — поля нет). */
export interface OddsTarget {
  id: string;
  name: string;
  ac: number;
  saves?: Readonly<Record<AbilityId, number>>;
  defenses?: Defenses;
}

/** Спасброски блока: напечатанные — как есть, остальные — модификатор характеристики. */
export function monsterSaves(m: Monster): Record<AbilityId, number> {
  return Object.fromEntries(ABILITY_IDS.map(id => [id, m.savingThrows[id] ?? abilityMod(m.abilities[id])])) as Record<AbilityId, number>;
}

export function oddsTargetOf(actor: Actor): OddsTarget {
  const base = { id: actor.id, name: actor.name, ac: actor.ac };
  const m = actor.monsterId ? MONSTERS[actor.monsterId] : undefined;
  if (m) {
    return { ...base, saves: monsterSaves(m), defenses: { resistances: m.damageResistances, immunities: m.damageImmunities, vulnerabilities: m.damageVulnerabilities } };
  }
  const view = sheetViewOf(actor);
  if (!view) return base;
  return { ...base, saves: Object.fromEntries(view.abilities.map(a => [a.id, a.save])) as Record<AbilityId, number> };
}

export interface AttackRow { target: OddsTarget; hit: number; damage?: number; unclear: boolean }
export interface SaveRow { target: OddsTarget; fail: number }

/** Шансы одного действия: атака — попадание и средний урон по каждой цели; спасбросок — шанс провала. */
export type ActionOdds =
  | { kind: 'attack'; name: string; toHit: number; rows: AttackRow[] }
  | { kind: 'save'; name: string; dc: number; ability: AbilityId; rows: SaveRow[] };

function attackRows(toHit: number, damage: string | undefined, damageType: string | undefined, text: string, targets: readonly OddsTarget[], mode: RollMode): AttackRow[] {
  const profile = attackProfileOf({ toHit, damage, damageType }, text);
  return targets.map(t => {
    const o = attackOdds(profile, t.ac, mode, t.defenses);
    return { target: t, hit: o.hit, ...(o.damage !== undefined ? { damage: o.damage } : {}), unclear: o.unclear };
  });
}

function saveRows(dc: number, ability: AbilityId, targets: readonly OddsTarget[], mode: RollMode): SaveRow[] {
  return targets.filter(t => t.saves).map(t => ({ target: t, fail: saveFailChance(t.saves![ability], dc, mode) }));
}

/** Действие блока → шансы против целей; ни атаки, ни DC в тексте — null. Режим — у бросающего (атака) или у цели (спасбросок). */
export function actionOdds(action: MonsterAction, targets: readonly OddsTarget[], mode: RollMode = 'normal'): ActionOdds | null {
  if (action.attack) return { kind: 'attack', name: action.name, toHit: action.attack.toHit, rows: attackRows(action.attack.toHit, action.attack.damage, action.attack.damageType, action.text, targets, mode) };
  const save = saveInText(action.text);
  if (!save) return null;
  const rows = saveRows(save.dc, save.ability, targets, mode);
  return rows.length ? { kind: 'save', name: action.name, dc: save.dc, ability: save.ability, rows } : null;
}

/** Атаки оружием с листа против целей. */
export function sheetAttackOdds(actor: Actor, targets: readonly OddsTarget[], mode: RollMode = 'normal'): ActionOdds[] {
  // Универсальное оружие лист пишет «1d8 + 3 / 1d10 + 3»: одной рукой и двумя — две строки.
  return (actor.sheet?.attacks ?? []).flatMap(a => a.damage.split(' / ').flatMap((dmg, i) => (parseDice(dmg)
    ? [{ kind: 'attack' as const, name: i === 0 ? a.name : `${a.name} · двумя руками`, toHit: a.toHit, rows: attackRows(a.toHit, dmg, a.damageType, '', targets, mode) }]
    : [])));
}

/** Заклинания листа со спасброском в тексте SRD: DC листа против спасбросков целей. Атаки заклинаниями — по `attack` листа. */
export function sheetSpellOdds(actor: Actor, targets: readonly OddsTarget[], mode: RollMode = 'normal'): ActionOdds[] {
  const sc = actor.sheet?.spellcasting;
  if (!sc) return [];
  const ids = [...new Set([...sc.cantrips, ...sc.always, ...sc.spells])];
  return ids.flatMap(id => {
    const spell = SPELLS[id];
    const ability = spell ? spellSaveAbility(spell.text) : null;
    if (!spell || !ability) return [];
    const rows = saveRows(sc.saveDc, ability, targets, mode);
    return rows.length ? [{ kind: 'save' as const, name: spell.name, dc: sc.saveDc, ability, rows }] : [];
  });
}
