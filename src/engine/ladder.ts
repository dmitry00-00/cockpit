// Лестница масштабов (HANDOFF §3) — проекция мест мира в навигацию: текущий уровень и путь, по одному
// месту на уровень. Навигация — состояние экрана, не событие (CLAUDE.md «Состояние»): в лог не пишется,
// не отменяется, перезагрузку не переживает; страница держит Ladder в useState, а здесь — только чистые
// функции над State. Точка фокуса сохраняется: `[` поднимает уровень, не трогая путь ниже, поэтому `]`
// возвращает туда же. Уровни, которых нет в сеттинге, скрыты: уровень есть, когда на нём есть место;
// бой — пока идёт бой, места у него нет. Подрегион (Triboar Trail внутри Sword Coast North) — тот же
// уровень, что родитель: лестница показывает ближайшее к фокусу место уровня, а не родителя.
import { SCALE_LEVELS, type ScaleLevel, type Tempo } from './events';
import { journalParts, type JournalEntry } from './journal';
import type { Fact, Location, State, WorldDelta, WorldPatch } from './state';

/** Точка фокуса на лестнице: текущий уровень и путь — по одному месту на уровень от Великого Колеса вниз. */
export interface Ladder {
  level: ScaleLevel;
  path: Readonly<Partial<Record<ScaleLevel, string>>>;
}

/** Темп часов уровня (HANDOFF §3): переход на уровень выставляет темп, мастер может сменить его руками. */
export const LEVEL_TEMPO: Readonly<Record<ScaleLevel, Tempo>> = {
  cosmology: 'year',
  plane: 'year',
  system: 'season',
  planet: 'season',
  continent: 'tenday',
  region: 'day',
  settlement: 'hour',
  building: '10min',
  battle: 'round',
};

const levelIndex = (level: ScaleLevel) => SCALE_LEVELS.indexOf(level);

/** Уровни, которые есть в сеттинге: на уровне есть хоть одно место; бой — пока идёт бой. Порядок — SCALE_LEVELS. */
export function ladderLevels(state: State): ScaleLevel[] {
  const present = new Set(Object.values(state.world.locations).map(l => l.scale));
  if (state.encounter.active) present.add('battle');
  return SCALE_LEVELS.filter(l => present.has(l));
}

/** Где партия: место первого персонажа партии с locationId, иначе первое поселение мира. */
export function partyPlaceId(state: State): string | undefined {
  for (const id of state.party) {
    const loc = state.actors[id]?.locationId;
    if (loc && state.world.locations[loc]) return loc;
  }
  return Object.values(state.world.locations).find(l => l.scale === 'settlement')?.id;
}

/** Предки места снизу вверх, без самого места; цикл в данных обрывается. */
export function ancestorsOf(state: State, id: string): Location[] {
  const out: Location[] = [];
  const seen = new Set<string>([id]);
  let cur = state.world.locations[id];
  while (cur?.parentId && !seen.has(cur.parentId)) {
    const parent = state.world.locations[cur.parentId];
    if (!parent) break;
    seen.add(parent.id);
    out.push(parent);
    cur = parent;
  }
  return out;
}

/** Путь к месту: оно само и предки, по одному на уровень — ближайшее к месту (подрегион, а не регион-родитель). */
export function pathTo(state: State, id: string): Partial<Record<ScaleLevel, string>> {
  const place = state.world.locations[id];
  if (!place) return {};
  const out: Partial<Record<ScaleLevel, string>> = { [place.scale]: place.id };
  for (const a of ancestorsOf(state, id)) out[a.scale] ??= a.id;
  return out;
}

/** Прямые дети места — в порядке мира. */
export function childrenOf(state: State, id: string): Location[] {
  return Object.values(state.world.locations).filter(l => l.parentId === id);
}

/** Место внутри корня: оно само или его потомок. */
export function isWithin(state: State, id: string, rootId: string): boolean {
  return id === rootId || ancestorsOf(state, id).some(a => a.id === rootId);
}

/** Потомки места на уровне — любой глубины, в порядке мира. */
export function descendantsAt(state: State, id: string, level: ScaleLevel): Location[] {
  return Object.values(state.world.locations).filter(l => l.scale === level && l.id !== id && isWithin(state, l.id, id));
}

/** Место в фокусе на текущем уровне; у боя места нет. */
export function focusOf(state: State, ladder: Ladder): Location | undefined {
  const id = ladder.path[ladder.level];
  return id ? state.world.locations[id] : undefined;
}

/** Ближайшее к низу место пути выше уровня боя — откуда бой начался. */
function lowestPathLevel(ladder: Ladder): ScaleLevel | undefined {
  for (let i = SCALE_LEVELS.length - 1; i >= 0; i--) {
    const l = SCALE_LEVELS[i];
    if (l !== 'battle' && ladder.path[l]) return l;
  }
  return undefined;
}

/**
 * Выбор места: уровень — его уровень, путь — его путь вверх; ниже остаются прежние места пути, если они
 * внутри выбранного (иначе `]` увёл бы в чужую ветку). Неизвестное место — лестница не меняется.
 */
export function selectPlace(state: State, ladder: Ladder, id: string): Ladder {
  const place = state.world.locations[id];
  if (!place) return ladder;
  const path: Partial<Record<ScaleLevel, string>> = pathTo(state, id);
  for (const l of SCALE_LEVELS) {
    if (levelIndex(l) <= levelIndex(place.scale) || l === 'battle') continue;
    const below = ladder.path[l];
    if (below && isWithin(state, below, id)) path[l] = below;
  }
  return { level: place.scale, path };
}

/**
 * Прыжок на уровень (клик по крошке): бой — только пока он идёт; выше фокуса — его предок на этом уровне;
 * ниже — место пути, если оно внутри фокуса, иначе первый потомок; нечего показать — лестница не меняется.
 */
export function jumpTo(state: State, ladder: Ladder, level: ScaleLevel): Ladder {
  if (level === ladder.level) return ladder;
  if (level === 'battle') return state.encounter.active ? { ...ladder, level } : ladder;
  const focus = focusOf(state, ladder);
  const from = ladder.level === 'battle' ? lowestPathLevel(ladder) : ladder.level;
  const base = from ? state.world.locations[ladder.path[from] ?? ''] : undefined;
  const anchor = focus ?? base;
  if (!anchor) {
    // Пути нет вовсе — берём первое место уровня.
    const first = Object.values(state.world.locations).find(l => l.scale === level);
    return first ? { level, path: pathTo(state, first.id) } : ladder;
  }
  if (levelIndex(level) < levelIndex(anchor.scale)) {
    const up = pathTo(state, anchor.id)[level];
    return up ? { level, path: { ...ladder.path, ...pathTo(state, anchor.id) } } : ladder;
  }
  if (levelIndex(level) === levelIndex(anchor.scale)) return { ...ladder, level };
  const remembered = ladder.path[level];
  const target = remembered && isWithin(state, remembered, anchor.id) ? remembered : descendantsAt(state, anchor.id, level)[0]?.id;
  return target ? { ...selectPlace(state, ladder, target), level } : ladder;
}

/**
 * Шаг по лестнице: вверх (−1) или вниз (+1). Вниз — сначала туда, где мастер уже был: ближайший уровень
 * ниже с местом пути внутри фокуса, поэтому `[` и `]` возвращают на то же место; иначе — ближайший уровень,
 * где у фокуса есть потомок. Уровни без предка или потомка на этой ветке пропускаются. Некуда — тот же объект.
 */
export function moveLevel(state: State, ladder: Ladder, dir: -1 | 1): Ladder {
  const levels = ladderLevels(state);
  let i = levels.indexOf(ladder.level);
  if (i < 0) i = dir > 0 ? -1 : levels.length;
  const focus = focusOf(state, ladder);
  if (dir > 0 && focus) {
    for (let j = i + 1; j < levels.length; j++) {
      const remembered = ladder.path[levels[j]];
      if (remembered && isWithin(state, remembered, focus.id)) return jumpTo(state, ladder, levels[j]);
    }
  }
  for (let j = i + dir; j >= 0 && j < levels.length; j += dir) {
    const next = jumpTo(state, ladder, levels[j]);
    if (next !== ladder) return next;
  }
  return ladder;
}

/** Лестница на старте: путь — к месту партии, уровень — регион (F1: главная зона — карта региона), если он есть. */
export function initialLadder(state: State, level: ScaleLevel = 'region'): Ladder {
  const party = partyPlaceId(state);
  const path = party ? pathTo(state, party) : {};
  if (path[level]) return { level, path };
  const lowest = lowestPathLevel({ level, path });
  if (lowest) return { level: lowest, path };
  const first = ladderLevels(state)[0];
  const place = first ? Object.values(state.world.locations).find(l => l.scale === first) : undefined;
  return place ? { level: first!, path: pathTo(state, place.id) } : { level, path: {} };
}

/**
 * Лестница, приведённая к сеттингу: уровень боя после конца боя (или отмены его начала) — на место,
 * откуда бой начался; уровень, которого больше нет, — на ближайший снизу, где место пути ещё существует.
 * Ничего не менять — вернуть тот же объект.
 */
export function normalizeLadder(state: State, ladder: Ladder): Ladder {
  if (ladderLevels(state).includes(ladder.level) && (ladder.level === 'battle' || focusOf(state, ladder))) return ladder;
  for (let i = SCALE_LEVELS.length - 1; i >= 0; i--) {
    const l = SCALE_LEVELS[i];
    const id = ladder.path[l];
    if (l !== 'battle' && id && state.world.locations[id]) return { ...ladder, level: l };
  }
  return initialLadder(state);
}

/**
 * Какие из названных сущностей упомянуты в тексте — по границам слова, длинные имена раньше коротких и без
 * наложений, как у @упоминаний журнала: «Neverwinter Wood» не зажигает «Neverwinter».
 */
export function namedIn(text: string, named: readonly { id: string; name: string }[]): string[] {
  const boundary = (i: number) => i < 0 || i >= text.length || !/[\p{L}\p{N}]/u.test(text[i]);
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => taken.every(([s, e]) => b <= s || a >= e);
  const out: string[] = [];
  for (const n of [...named].filter(n => n.name.length > 0).sort((a, b) => b.name.length - a.name.length)) {
    for (let from = 0; ; ) {
      const start = text.indexOf(n.name, from);
      if (start < 0) break;
      const end = start + n.name.length;
      if (boundary(start - 1) && boundary(end) && free(start, end)) { taken.push([start, end]); if (!out.includes(n.id)) out.push(n.id); }
      from = end;
    }
  }
  return out;
}

/** Места и фракции мира — что можно назвать в теме предложения. */
const namedOf = (state: State) => [...Object.values(state.world.locations), ...Object.values(state.world.factions)];

/** Цели одного предложения: место, фракция или нить из патча, а также места и фракции, названные в теме. */
export function deltaTargets(d: WorldDelta, state: State): string[] {
  const out = namedIn(d.subject, namedOf(state));
  for (const id of d.patch ? patchTargets(d.patch).reverse() : []) if (!out.includes(id)) out.unshift(id);
  return out;
}

/** Что патч трогает в мире: запись, обе фракции отношения; у нового места — место, куда оно встанет. */
export function patchTargets(patch: WorldPatch): string[] {
  switch (patch.kind) {
    case 'relation': return [patch.id, patch.other];
    case 'newLocation': return patch.location.parentId ? [patch.location.parentId] : [];
    default: return [patch.id];
  }
}

/**
 * Кого ждёт решение: цели всех ждущих предложений. Карточка и корешок цели пульсируют glow-sim
 * (CLAUDE.md «Правила экрана»: симуляция не выглядит свершившимся фактом, но затронутое видно).
 */
export function pendingTargets(state: State): Set<string> {
  const out = new Set<string>();
  for (const d of Object.values(state.deltas)) if (d.status === 'pending') for (const id of deltaTargets(d, state)) out.add(id);
  return out;
}

/** Ждущие предложения, целящие в сущность, — для карточки места или фракции: «ждёт решения». */
export function pendingFor(state: State, id: string): WorldDelta[] {
  return Object.values(state.deltas).filter(d => d.status === 'pending' && deltaTargets(d, state).includes(id));
}

/**
 * Сколько записей о каждом месте: упоминания в записях журнала (те же @упоминания, что в тексте) плюс
 * факты о месте из переданного множества. Ноль не пишется — у пина без записей бейджа нет.
 */
export function placeCounts(entries: readonly JournalEntry[], state: State, facts: readonly Fact[]): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (id: string) => out.set(id, (out.get(id) ?? 0) + 1);
  for (const e of entries) {
    const seen = new Set<string>();
    for (const p of journalParts(e, state)) if (p.kind === 'mention' && p.entity === 'location' && !seen.has(p.id)) { seen.add(p.id); bump(p.id); }
  }
  for (const f of facts) if (f.subjectId && state.world.locations[f.subjectId]) bump(f.subjectId);
  return out;
}
