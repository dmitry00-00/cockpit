// Черновик персонажа (шаг B, 21.09.2026): всё, что мастер выбирает в редакторе, — данные формы, не события. Лист
// становится актёром одним ACTOR_SPAWNED, когда deriveCharacter принял черновик. Здесь — чистые правила
// формы: point buy (книга игрока, вариант «настройка характеристик»: 27 очков, 8–15, цена по таблице — в SRD 5.1
// этого варианта нет, потому источник книга), увеличения по уровням ASI класса, подраса и подкласс по уровню,
// навыки класса и предыстории, id актёра из имени. Референс взаимодействия — JSX владельца (point buy, метки
// навыков BG / CL, пунктир «можно выбрать»); данные — из компендиума, а не вшитые.
import type { PcSpec } from '../../campaign/derive';
import { srdClassOf } from '../../campaign/derive';
import { ABILITY_IDS, SKILL_IDS, type AbilityId, type SkillId } from '../../rules/srd/abilities';
import type { ArmorId } from '../../rules/srd/armor';
import { backgroundById, classById, raceById, type Asi, type CharacterClass, type Race } from '../../rules/compendium';

export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
/** Цена очка характеристики от 8 до 15 (книга игрока, «Настройка характеристик»). */
export const POINT_BUY_COST: Readonly<Record<number, number>> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
/** Стандартный набор — те же 27 очков, разложенные заранее. */
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

export interface Draft {
  name: string;
  alignment: string;
  height: string;
  weight: string;
  age: string;
  raceId: string;
  subraceId?: string;
  classId: string;
  subclassId?: string;
  level: number;
  base: Record<AbilityId, number>;
  /** Увеличения по уровням ASI: уровень → +2 к одной или +1 к двум. */
  improvements: Record<number, Asi>;
  backgroundId?: string;
  /** Навыки, выбранные у класса (предыстория и раса — сверх них). */
  skills: SkillId[];
  armor: ArmorId | null;
  shield: boolean;
  mageArmor: boolean;
}

/** Стартовый черновик: человек-воин 1-го уровня со стандартным набором по порядку STR…CHA — всё меняется. */
export function initialDraft(): Draft {
  return {
    name: '',
    alignment: '',
    height: '',
    weight: '',
    age: '',
    raceId: 'celovek',
    classId: 'voin',
    level: 1,
    base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    improvements: {},
    skills: [],
    armor: null,
    shield: false,
    mageArmor: false,
  };
}

export const pointsUsed = (base: Readonly<Record<AbilityId, number>>): number => ABILITY_IDS.reduce((s, ab) => s + (POINT_BUY_COST[base[ab]] ?? 0), 0);
export const pointsLeft = (base: Readonly<Record<AbilityId, number>>): number => POINT_BUY_TOTAL - pointsUsed(base);

/** Можно ли поднять характеристику на очко: не выше 15 и хватает очков. */
export function canIncrease(base: Readonly<Record<AbilityId, number>>, ab: AbilityId): boolean {
  const next = base[ab] + 1;
  if (next > POINT_BUY_MAX) return false;
  return POINT_BUY_COST[next] - POINT_BUY_COST[base[ab]] <= pointsLeft(base);
}

export const canDecrease = (base: Readonly<Record<AbilityId, number>>, ab: AbilityId): boolean => base[ab] > POINT_BUY_MIN;

/** Подрасы, которые раса требует выбрать (того же источника — SRD: «choose one of these subraces»). */
export function subraceRequired(race: Race): boolean {
  return race.subraces.some(s => s.source === race.source);
}

/** Уровни ASI класса не выше уровня листа; класс вне SRD — пусто. */
export function asiLevelsOf(cls: CharacterClass, level: number): number[] {
  try {
    return srdClassOf(cls).asiLevels.filter(l => l <= level);
  } catch {
    return [];
  }
}

export const asiTotal = (asi: Asi): number => Object.values(asi).reduce((s, v) => s + (v ?? 0), 0);

/** Ещё +1 к характеристике в увеличении: пока сумма меньше двух; на 20 сверху не бывает (проверит derive). */
export function bumpAsi(asi: Asi, ab: AbilityId): Asi {
  if (asiTotal(asi) >= 2) return asi;
  return { ...asi, [ab]: (asi[ab] ?? 0) + 1 };
}

/** Смена уровня: увеличения выше нового уровня и подкласс, который ещё не дают, — снимаются. */
export function withLevel(draft: Draft, level: number): Draft {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  const improvements: Record<number, Asi> = {};
  for (const [l, asi] of Object.entries(draft.improvements)) if (Number(l) <= lvl) improvements[Number(l)] = asi;
  const cls = classById(draft.classId);
  const sub = cls?.subclasses.find(s => s.id === draft.subclassId);
  const subclassId = sub && sub.gainedAt !== null && sub.gainedAt > lvl ? undefined : draft.subclassId;
  return { ...draft, level: lvl, improvements, subclassId };
}

/** Смена расы: подраса — первая обязательная того же источника, иначе никакой. */
export function withRace(draft: Draft, raceId: string): Draft {
  const race = raceById(raceId);
  const subraceId = race && subraceRequired(race) ? race.subraces.find(s => s.source === race.source)?.id : undefined;
  return { ...draft, raceId, subraceId };
}

/** Смена класса: подкласс, навыки класса, увеличения и доспех — заново; предыстория остаётся. */
export function withClass(draft: Draft, classId: string): Draft {
  return { ...draft, classId, subclassId: undefined, skills: [], improvements: {}, armor: null, shield: false, mageArmor: false };
}

/** Навыки предыстории, которые класс не может выбрать повторно. */
export function backgroundSkills(draft: Draft): readonly SkillId[] {
  return draft.backgroundId ? backgroundById(draft.backgroundId)?.skills ?? [] : [];
}

/** Клик по навыку класса: снять, если выбран; добавить, если есть место и он не от предыстории. */
export function toggleSkill(draft: Draft, id: SkillId, count: number): Draft {
  if (draft.skills.includes(id)) return { ...draft, skills: draft.skills.filter(s => s !== id) };
  if (backgroundSkills(draft).includes(id) || draft.skills.length >= count) return draft;
  return { ...draft, skills: [...draft.skills, id] };
}

/** Смена предыстории: навык класса, совпавший с навыком предыстории, снимается — его даёт предыстория. */
export function withBackground(draft: Draft, backgroundId: string | undefined): Draft {
  const bg = backgroundId ? backgroundById(backgroundId) : undefined;
  const skills = bg ? draft.skills.filter(s => !bg.skills.includes(s)) : draft.skills;
  return { ...draft, backgroundId: bg?.id, skills };
}

const CYR: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** id актёра из имени: латиница и цифры через дефис, кириллица транслитом; занятый — с номером; пустое имя — «pc». */
export function actorIdFor(name: string, taken: ReadonlySet<string>): string {
  const slug = name.toLowerCase().split('').map(ch => CYR[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'pc';
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

/** Черновик → спецификация персонажа; пустые поля не попадают в лист. */
export function toSpec(draft: Draft, id: string): PcSpec {
  const age = /^\d{1,3}$/.test(draft.age.trim()) ? Number(draft.age) : undefined;
  const bio = { ...(draft.height.trim() ? { height: draft.height.trim() } : {}), ...(draft.weight.trim() ? { weight: draft.weight.trim() } : {}), ...(age !== undefined ? { age } : {}) };
  return {
    id,
    name: draft.name.trim(),
    raceId: draft.raceId,
    subraceId: draft.subraceId,
    classId: draft.classId,
    subclassId: draft.subclassId,
    backgroundId: draft.backgroundId,
    level: draft.level,
    base: { ...draft.base },
    improvements: Object.entries(draft.improvements).map(([l, asi]) => ({ level: Number(l), asi })).sort((a, b) => a.level - b.level),
    armor: draft.armor,
    shield: draft.shield,
    mageArmor: draft.mageArmor || undefined,
    skills: [...draft.skills],
    alignment: draft.alignment.trim() || undefined,
    bio: Object.keys(bio).length > 0 ? bio : undefined,
  };
}

/** Что мешает создать персонажа — словами формы, до derive (derive скажет остальное своим DeriveError). */
export function draftIssues(draft: Draft, cls: CharacterClass | undefined, skillCount: number): string[] {
  const out: string[] = [];
  if (!draft.name.trim()) out.push('нет имени');
  if (pointsLeft(draft.base) < 0) out.push('очков характеристик потрачено больше 27');
  if (cls) {
    for (const l of asiLevelsOf(cls, draft.level)) if (asiTotal(draft.improvements[l] ?? {}) !== 2) out.push(`увеличение на ${l}-м уровне не распределено`);
  }
  if (draft.skills.length < skillCount) out.push(`выбрать ещё ${skillCount - draft.skills.length} ${skillCount - draft.skills.length === 1 ? 'навык' : 'навыка'} класса`);
  for (const s of draft.skills) if (!SKILL_IDS.includes(s)) out.push(`нет навыка ${s}`);
  return out;
}
