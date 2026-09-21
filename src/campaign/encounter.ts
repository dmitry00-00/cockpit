// Бой за живым столом: кто появляется и с какой инициативой. Чистые функции над состоянием — событий
// не пишут, стор не трогают; страница вызывает их и отправляет ACTOR_SPAWNED / INITIATIVE_SET / ENCOUNTER_STARTED.
// Броски инициативы игроков за столом делают сами игроки — мастер вводит числа; монстрам бросает система
// по d20 + DEX (SRD: initiative = Dexterity check), и бросок — DICE_ROLLED в логе, как любой другой.
import type { InitiativeEntry } from '../engine/events';
import type { Actor, State } from '../engine/state';
import { MONSTERS, type MonsterId } from '../rules/srd/monsters';
import { abilityMod } from './derive';
import { monsterActor } from './seed';

/** Модификатор инициативы — DEX: у персонажа из листа, у монстра из блока SRD; у NPC без листа — 0. */
export function initiativeMod(actor: Actor): number {
  if (actor.sheet) return abilityMod(actor.sheet.abilities.dex);
  if (actor.monsterId) return abilityMod(MONSTERS[actor.monsterId].abilities.dex);
  return 0;
}

/** Актёры, которым место в порядке инициативы: все, кто не выбыл, партия первой — как в корешке. */
export function encounterCandidates(state: State): Actor[] {
  const party = state.party.map(id => state.actors[id]).filter((a): a is Actor => a !== undefined && !a.removed);
  const rest = Object.values(state.actors).filter(a => !a.removed && !state.party.includes(a.id));
  return [...party, ...rest];
}

/**
 * Порядок из записей: по убыванию инициативы; при равенстве — как переданы (партия раньше монстров,
 * старые участники раньше новых). Сортировка устойчива, поэтому уже отсортированный порядок не перетасовывается.
 */
export function sortInitiative(entries: readonly InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => b.initiative - a.initiative);
}

/** Текущий порядок боя как записи — чтобы вписать новичка, не потеряв чужие броски. */
export function currentOrder(state: State): InitiativeEntry[] {
  return state.encounter.order.flatMap(actorId => {
    const a = state.actors[actorId];
    return a ? [{ actorId, initiative: a.initiative ?? 0 }] : [];
  });
}

/** Сколько актёров этого блока уже есть (включая выбывших: id не переиспользуются, номера не повторяются). */
function countOf(state: State, monsterId: MonsterId): number {
  return Object.values(state.actors).filter(a => a.monsterId === monsterId).length;
}

/** Первый свободный id вида `bandit-4`: сид занял `bandit-1…3` и `captain`, выбывшие остаются в состоянии. */
export function nextActorId(state: State, monsterId: MonsterId, taken: ReadonlySet<string> = new Set()): string {
  for (let n = countOf(state, monsterId) + 1; ; n++) {
    const id = `${monsterId}-${n}`;
    if (!state.actors[id] && !taken.has(id)) return id;
  }
}

/** Имя по умолчанию: первый такой — по блоку («Wolf»), следующие — с номером («Bandit 4»), чтобы за столом их различали. */
export function suggestMonsterName(state: State, monsterId: MonsterId): string {
  const n = countOf(state, monsterId);
  return n === 0 ? MONSTERS[monsterId].name : `${MONSTERS[monsterId].name} ${n + 1}`;
}

/**
 * Актёры для ACTOR_SPAWNED: `count` штук одного блока. Один — с именем как есть; несколько — с номерами
 * от следующего свободного («Wolf 1», «Wolf 2»; при уже живом Wolf — «Wolf 2», «Wolf 3»). Хиты — среднее из блока.
 */
export function spawnMonsters(state: State, monsterId: MonsterId, name: string, count: number): Actor[] {
  const base = name.trim() || MONSTERS[monsterId].name;
  const n = Math.max(1, Math.min(20, Math.floor(count)));
  const taken = new Set<string>();
  const from = countOf(state, monsterId) + 1;
  return Array.from({ length: n }, (_, i) => {
    const id = nextActorId(state, monsterId, taken);
    taken.add(id);
    return monsterActor(id, monsterId, n === 1 ? base : `${base} ${from + i}`);
  });
}
