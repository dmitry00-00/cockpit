// Черновик персонажа: всё, что игрок или мастер выбирает в редакторе, — данные формы, не события. Лист становится
// актёром одним ACTOR_SPAWNED, когда deriveCharacter принял черновик. Здесь — чистые правила формы:
//   • характеристики point buy (книга игрока, «настройка характеристик»: 27 очков, 8–15 — в SRD 5.1 этого варианта
//     нет, источник книга) или стандартный набор 15 14 13 12 10 8 раскладкой с обменом;
//   • раса → подраса → гибкие бонусы расы (Q11: «+1 к двум на выбор» — из таблицы и правила SRD);
//   • класс → уровень → подкласс; увеличения по уровням ASI;
//   • навыки класса и предыстории; выборы умений (боевой стиль, избранный враг, компетентность…);
//   • заговоры и заклинания из списков SRD; стартовое снаряжение SRD вариантами (a)/(b)/(c), что надето.
// Что предлагать и сколько — campaign/build.ts (те же функции читает derive); «сколько осталось» — deriveDraft.
import type { PcSpec } from '../../campaign/derive';
import type { PortraitRef } from '../../art/portrait';
import { deriveDraft, srdClassOf } from '../../campaign/derive';
import { inventoryOf, picksNeeded, spellcastingOf, startingKitOf, type KitSelection } from '../../campaign/build';
import { ABILITY_IDS, SKILL_IDS, type AbilityId, type SkillId } from '../../rules/srd/abilities';
import { ARMOR, type ArmorId } from '../../rules/srd/armor';
import { armorIdOfItem } from '../../rules/srd/equipment';
import { backgroundById, classById, featById, raceById, type Asi, type CharacterClass, type Race } from '../../rules/compendium';

export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
/** Цена очка характеристики от 8 до 15 (книга игрока, «Настройка характеристик»). */
export const POINT_BUY_COST: Readonly<Record<number, number>> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
/** Стандартный набор — те же 27 очков, разложенные заранее. */
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

export type AbilityMethod = 'pointbuy' | 'array';

export interface Draft {
  name: string;
  /** Built-in id or compact user-supplied image stored with the campaign. */
  portrait?: PortraitRef;
  alignment: string;
  height: string;
  weight: string;
  age: string;
  raceId: string;
  subraceId?: string;
  /** Гибкие бонусы расы: характеристика → +1. */
  asiChoice: Asi;
  classId: string;
  subclassId?: string;
  level: number;
  method: AbilityMethod;
  base: Record<AbilityId, number>;
  /** Увеличения по уровням ASI: уровень → +2 к одной или +1 к двум. */
  improvements: Record<number, Asi>;
  backgroundId?: string;
  /** Навыки, выбранные у класса (предыстория и раса — сверх них). */
  skills: SkillId[];
  /** Выборы умений: id выбора (build.ts) → id вариантов. */
  choices: Record<string, string[]>;
  /** Заклинания SRD по id: заговоры и заклинания 1-го круга и выше вместе. */
  spells: string[];
  /** Черты: «race» или уровень ASI → черта и +1 к характеристике. Пустой id — выбран режим «черта», черты ещё нет. */
  feats: Record<string, { id: string; asi?: AbilityId }>;
  /** Стартовое снаряжение: номер выбора SRD → вариант и взятое из категорий. */
  kit: Record<number, KitSelection>;
  armor: ArmorId | null;
  shield: boolean;
  mageArmor: boolean;
  /**
   * Божество (E8) и подклассы жреца по его доменам 5e — домены нужны, чтобы проверить выбор без справочника богов:
   * сменил домен в шаге «Класс» — черновик сам видит, что бог его не даёт.
   */
  deity?: { id: string; name: string; domains: readonly string[] };
}

/** Жрец — класс компендиума «jrec»: ему бог обязателен, и домен подкласса должен быть у бога (SRD: Divine Domain). */
export const CLERIC_CLASS = 'jrec';

/** Стартовый черновик: человек-воин 1-го уровня со стандартным набором по порядку STR…CHA — всё меняется. */
export function initialDraft(): Draft {
  return {
    name: '',
    portrait: undefined,
    alignment: '',
    height: '',
    weight: '',
    age: '',
    raceId: 'celovek',
    asiChoice: {},
    classId: 'voin',
    level: 1,
    method: 'array',
    base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    improvements: {},
    skills: [],
    choices: {},
    feats: {},
    spells: [],
    kit: {},
    armor: null,
    shield: false,
    mageArmor: false,
  };
}

/* ---------- Характеристики ---------- */

export const pointsUsed = (base: Readonly<Record<AbilityId, number>>): number => ABILITY_IDS.reduce((s, ab) => s + (POINT_BUY_COST[base[ab]] ?? 0), 0);
export const pointsLeft = (base: Readonly<Record<AbilityId, number>>): number => POINT_BUY_TOTAL - pointsUsed(base);

/** Можно ли поднять характеристику на очко: не выше 15 и хватает очков. */
export function canIncrease(base: Readonly<Record<AbilityId, number>>, ab: AbilityId): boolean {
  const next = base[ab] + 1;
  if (next > POINT_BUY_MAX) return false;
  return POINT_BUY_COST[next] - POINT_BUY_COST[base[ab]] <= pointsLeft(base);
}

export const canDecrease = (base: Readonly<Record<AbilityId, number>>, ab: AbilityId): boolean => base[ab] > POINT_BUY_MIN;

/** Стандартный набор: значение ставится характеристике, а та, у которой оно было, получает прежнее — обмен. */
export function assignArray(base: Readonly<Record<AbilityId, number>>, ab: AbilityId, value: number): Record<AbilityId, number> {
  const other = ABILITY_IDS.find(x => x !== ab && base[x] === value);
  const out = { ...base, [ab]: value };
  if (other) out[other] = base[ab];
  return out;
}

/** Раскладка — перестановка стандартного набора? Иначе переход на «набор» раскладывает его по порядку. */
export const isStandardArray = (base: Readonly<Record<AbilityId, number>>): boolean =>
  [...ABILITY_IDS.map(ab => base[ab])].sort((a, b) => b - a).join() === STANDARD_ARRAY.join();

export function withMethod(draft: Draft, method: AbilityMethod): Draft {
  if (method === draft.method) return draft;
  const base = method === 'array' && !isStandardArray(draft.base) ? initialDraft().base : draft.base;
  return { ...draft, method, base };
}

/* ---------- Раса ---------- */

/** Подрасы, которые раса требует выбрать (того же источника — SRD: «choose one of these subraces»). */
export function subraceRequired(race: Race): boolean {
  return race.subraces.some(s => s.source === race.source);
}

/** Гибкие бонусы, которые предлагает раса с подрасой: у подрасы свои, без подрасы — расы. */
export function asiChoiceOf(draft: Pick<Draft, 'raceId' | 'subraceId'>) {
  const race = raceById(draft.raceId);
  const sub = race?.subraces.find(s => s.id === draft.subraceId);
  return sub ? sub.asiChoice : race?.asiChoice;
}

/** Смена расы: подраса — первая обязательная того же источника, иначе никакой; гибкие бонусы и навыки расы — заново. */
export function withRace(draft: Draft, raceId: string): Draft {
  const race = raceById(raceId);
  const subraceId = race && subraceRequired(race) ? race.subraces.find(s => s.source === race.source)?.id : undefined;
  const feats = { ...draft.feats };
  delete feats.race;
  const choices = Object.fromEntries(Object.entries(draft.choices).filter(([k]) => !k.startsWith('race-')));
  return settle({ ...draft, raceId, subraceId, asiChoice: {}, choices, feats });
}

export function withSubrace(draft: Draft, subraceId: string | undefined): Draft {
  return settle({ ...draft, subraceId, asiChoice: {} });
}

/** Клик по характеристике гибкого бонуса: снять или добавить (+amount), пока не набрано count. */
export function toggleAsiChoice(draft: Draft, ab: AbilityId): Draft {
  const flex = asiChoiceOf(draft);
  if (!flex || !flex.from.includes(ab)) return draft;
  if (draft.asiChoice[ab]) {
    const next = { ...draft.asiChoice };
    delete next[ab];
    return { ...draft, asiChoice: next };
  }
  if (Object.values(draft.asiChoice).filter(Boolean).length >= flex.count) return draft;
  return { ...draft, asiChoice: { ...draft.asiChoice, [ab]: flex.amount } };
}

/* ---------- Класс и уровень ---------- */

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

/** Подкласс обязателен, когда класс даёт его на этом уровне (у жреца, колдуна, чародея — с 1-го). */
export function subclassDue(cls: CharacterClass | undefined, level: number): number | null {
  const at = cls?.subclasses.map(s => s.gainedAt).filter((l): l is number => l !== null);
  if (!at?.length) return null;
  const first = Math.min(...at);
  return first <= level ? first : null;
}

/** Смена уровня: увеличения выше нового уровня и подкласс, который ещё не дают, — снимаются. */
export function withLevel(draft: Draft, level: number): Draft {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  const improvements: Record<number, Asi> = {};
  for (const [l, asi] of Object.entries(draft.improvements)) if (Number(l) <= lvl) improvements[Number(l)] = asi;
  const feats = Object.fromEntries(Object.entries(draft.feats).filter(([at]) => at === 'race' || Number(at) <= lvl));
  const cls = classById(draft.classId);
  const sub = cls?.subclasses.find(s => s.id === draft.subclassId);
  const subclassId = sub && sub.gainedAt !== null && sub.gainedAt > lvl ? undefined : draft.subclassId;
  return settle({ ...draft, level: lvl, improvements, subclassId, feats });
}

/** Смена класса: подкласс, навыки, увеличения, выборы умений, заклинания, снаряжение и доспех — заново; предыстория и раса остаются. */
export function withClass(draft: Draft, classId: string): Draft {
  const keep: Record<string, string[]> = Object.fromEntries(Object.entries(draft.choices).filter(([k]) => k.startsWith('race-')));
  const feats: Draft['feats'] = draft.feats.race ? { race: draft.feats.race } : {};
  return { ...draft, classId, subclassId: undefined, skills: [], improvements: {}, choices: keep, feats, spells: [], kit: {}, armor: null, shield: false, mageArmor: false };
}

export function withSubclass(draft: Draft, subclassId: string | undefined): Draft {
  return settle({ ...draft, subclassId });
}

/* ---------- Черты ---------- */

/** Увеличение или черта на уровне ASI: переключение режима снимает другое. */
export function asiMode(draft: Draft, level: number, mode: 'asi' | 'feat'): Draft {
  const improvements = { ...draft.improvements };
  const feats = { ...draft.feats };
  if (mode === 'feat') { delete improvements[level]; feats[level] = feats[level] ?? { id: '' }; }
  else delete feats[level];
  return { ...draft, improvements, feats };
}

/** Черта в месте at («race» или уровень): +1 подставляется сам, если черта даёт одну характеристику. */
export function setFeat(draft: Draft, at: string, id: string): Draft {
  const feat = featById(id);
  const asi = feat && feat.asi.length === 1 ? feat.asi[0] : undefined;
  return { ...draft, feats: { ...draft.feats, [at]: { id, ...(asi ? { asi } : {}) } } };
}

export function setFeatAsi(draft: Draft, at: string, ab: AbilityId): Draft {
  const cur = draft.feats[at];
  if (!cur) return draft;
  return { ...draft, feats: { ...draft.feats, [at]: { ...cur, asi: ab } } };
}

/* ---------- Навыки и выборы ---------- */

/** Навыки предыстории, которые класс не может выбрать повторно. */
export function backgroundSkills(draft: Draft): readonly SkillId[] {
  return draft.backgroundId ? backgroundById(draft.backgroundId)?.skills ?? [] : [];
}

/** Клик по навыку класса: снять, если выбран; добавить, если есть место и он не от предыстории. */
export function toggleSkill(draft: Draft, id: SkillId, count: number): Draft {
  if (draft.skills.includes(id)) return settle({ ...draft, skills: draft.skills.filter(s => s !== id) });
  if (backgroundSkills(draft).includes(id) || draft.skills.length >= count) return draft;
  return { ...draft, skills: [...draft.skills, id] };
}

/** Смена предыстории: навык класса, совпавший с навыком предыстории, снимается — его даёт предыстория. */
export function withBackground(draft: Draft, backgroundId: string | undefined): Draft {
  const bg = backgroundId ? backgroundById(backgroundId) : undefined;
  const skills = bg ? draft.skills.filter(s => !bg.skills.includes(s)) : draft.skills;
  return settle({ ...draft, backgroundId: bg?.id, skills });
}

function dropChoice(choices: Record<string, string[]>, id: string): Record<string, string[]> {
  const next = { ...choices };
  delete next[id];
  return next;
}

/** Клик по варианту выбора: при count 1 — замена, иначе добавить до count или снять. */
export function toggleChoice(draft: Draft, choiceId: string, optionId: string, count: number): Draft {
  const cur = draft.choices[choiceId] ?? [];
  let next: string[];
  if (cur.includes(optionId)) next = cur.filter(x => x !== optionId);
  else if (count === 1) next = [optionId];
  else if (cur.length >= count) return draft;
  else next = [...cur, optionId];
  return settle({ ...draft, choices: next.length ? { ...draft.choices, [choiceId]: next } : dropChoice(draft.choices, choiceId) });
}

/* ---------- Заклинания ---------- */

/** Клик по заклинанию: снять или добавить, пока не набран лимит своего вида (заговоры отдельно от остальных). */
export function toggleSpell(draft: Draft, id: string, isCantrip: (id: string) => boolean, limits: { cantrips: number; leveled: number }): Draft {
  if (draft.spells.includes(id)) return { ...draft, spells: draft.spells.filter(s => s !== id) };
  const cantrip = isCantrip(id);
  const have = draft.spells.filter(s => isCantrip(s) === cantrip).length;
  if (have >= (cantrip ? limits.cantrips : limits.leveled)) return draft;
  return { ...draft, spells: [...draft.spells, id] };
}

/* ---------- Снаряжение ---------- */

/** Инвентарь черновика из стартового набора класса SRD; у книжного класса — пусто. */
export function draftInventory(draft: Draft) {
  const cls = classById(draft.classId);
  const kit = cls ? startingKitOf(cls) : null;
  return kit ? inventoryOf(kit, draft.kit) : { items: [], missing: [] };
}

/**
 * Что надето после смены набора: доспех, которого больше нет в снаряжении, снимается; появился доспех, которым класс
 * владеет, — надевается (первый по списку); щит — так же. Доспехи мага с доспехом не бывают.
 */
export function autoWear(before: Draft, after: Draft, prof: ReadonlySet<string>): Draft {
  const had = draftInventory(before).items;
  const { items } = draftInventory(after);
  const owned = items.map(l => armorIdOfItem(l.id)).filter((a): a is ArmorId => Boolean(a));
  const fresh = owned.filter(a => !had.some(l => armorIdOfItem(l.id) === a));
  let armor = after.armor && owned.includes(after.armor) ? after.armor : null;
  const newWearable = fresh.find(a => prof.has(ARMOR[a].category));
  if (newWearable || !armor) armor = newWearable ?? owned.find(a => prof.has(ARMOR[a].category)) ?? null;
  const hasShield = items.some(l => l.id === 'shield') && prof.has('shield');
  const hadShield = had.some(l => l.id === 'shield');
  const shield = hasShield && (hadShield ? after.shield : true);
  return { ...after, armor, shield, mageArmor: armor ? false : after.mageArmor };
}

/** Выбор варианта стартового набора: взятое из категорий — заново; надетое — по новому снаряжению. */
export function selectKit(draft: Draft, choice: number, option: number, prof: ReadonlySet<string>): Draft {
  return autoWear(draft, { ...draft, kit: { ...draft.kit, [choice]: { option, picks: [] } } }, prof);
}

/** Предмет из категории в варианте: slot — какой по счёту («два воинских оружия» — 0 и 1). */
export function setPick(draft: Draft, choice: number, slot: number, itemId: string, prof: ReadonlySet<string>): Draft {
  const sel = draft.kit[choice];
  if (!sel) return draft;
  const picks = [...sel.picks];
  picks[slot] = itemId;
  return autoWear(draft, { ...draft, kit: { ...draft.kit, [choice]: { ...sel, picks } } }, prof);
}

export { picksNeeded };

/* ---------- Согласование и выход ---------- */

/**
 * Согласовать черновик с тем, что лист даёт теперь: выбранные варианты, которых больше нет (компетентность в
 * снятом навыке, предок дракона без подкласса), и заклинания вне списка (круг ниже после смены уровня) — снимаются.
 */
export function settle(draft: Draft): Draft {
  let derived;
  try {
    derived = deriveDraft(toSpec(draft, 'draft')).derived;
  } catch {
    return draft;
  }
  const choices: Record<string, string[]> = {};
  for (const [id, values] of Object.entries(draft.choices)) {
    const fc = derived.featureChoices.find(c => c.id === id);
    const kept = fc ? values.filter(v => fc.options.some(o => o.id === v)).slice(0, fc.count) : [];
    if (kept.length) choices[id] = kept;
  }
  const cls = classById(draft.classId);
  const plan = cls ? spellcastingOf(cls, draft.level, draft.subclassId, derived.mods) : { kind: 'none' as const };
  const spells = plan.kind === 'plan'
    ? draft.spells.filter(s => plan.options.some(o => o.id === s) && !plan.always.includes(s))
    : [];
  return { ...draft, choices, spells };
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

/** Черновик → спецификация персонажа; пустые поля не попадают в лист. Выборы, заклинания и снаряжение ведутся всегда. */
export function toSpec(draft: Draft, id: string): PcSpec {
  const age = /^\d{1,3}$/.test(draft.age.trim()) ? Number(draft.age) : undefined;
  const bio = { ...(draft.height.trim() ? { height: draft.height.trim() } : {}), ...(draft.weight.trim() ? { weight: draft.weight.trim() } : {}), ...(age !== undefined ? { age } : {}) };
  const asiChoice = Object.fromEntries(Object.entries(draft.asiChoice).filter(([, v]) => v)) as Asi;
  const cls = classById(draft.classId);
  const kit = cls ? startingKitOf(cls) : null;
  return {
    id,
    name: draft.name.trim(),
    ...(draft.portrait ? { portrait: draft.portrait } : {}),
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
    ...(draft.deity ? { deity: { id: draft.deity.id, name: draft.deity.name } } : {}),
    ...(Object.keys(asiChoice).length ? { asiChoice } : {}),
    choices: Object.fromEntries(Object.entries(draft.choices).map(([k, v]) => [k, [...v]])),
    feats: Object.entries(draft.feats).map(([at, f]) => ({ at: at === 'race' ? 'race' as const : Number(at), id: f.id, ...(f.asi ? { asi: f.asi } : {}) })),
    spells: [...draft.spells],
    ...(kit ? { equipment: inventoryOf(kit, draft.kit).items } : {}),
  };
}

/**
 * Что осталось — словами формы: имя, очки, подкласс, снаряжение; остальное («выбрать ещё 2 навыка класса»,
 * «выбрать: Боевой стиль», «заклинания в книгу: ещё 6») скажет deriveDraft.
 */
export function draftIssues(draft: Draft, cls: CharacterClass | undefined): string[] {
  const out: string[] = [];
  if (!draft.name.trim()) out.push('нет имени');
  if (draft.method === 'pointbuy' && pointsLeft(draft.base) < 0) out.push('очков характеристик потрачено больше 27');
  const due = subclassDue(cls, draft.level);
  if (due !== null && !draft.subclassId) out.push(`выбрать подкласс (с ${due}-го уровня)`);
  if (cls) {
    const kit = startingKitOf(cls);
    const missing = kit ? inventoryOf(kit, draft.kit).missing.length : 0;
    if (missing > 0) out.push(`снаряжение: выбрать ещё ${missing}`);
  }
  for (const s of draft.skills) if (!SKILL_IDS.includes(s)) out.push(`нет навыка ${s}`);
  if (draft.classId === CLERIC_CLASS && !draft.deity) out.push('выбрать божество');
  if (draft.classId === CLERIC_CLASS && draft.deity && draft.subclassId && !draft.deity.domains.includes(draft.subclassId)) {
    const sub = cls?.subclasses.find(s => s.id === draft.subclassId);
    out.push(`божество ${draft.deity.name} не даёт домен ${sub?.name ?? draft.subclassId}`);
  }
  return out;
}
