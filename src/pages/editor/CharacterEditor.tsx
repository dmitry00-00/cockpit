// Экран создания персонажа: карточка персонажа, которая заполняется по шагам. Слева — шаги (имя → раса → класс →
// божество → характеристики → предыстория и навыки → умения класса → заклинания → снаряжение), у каждого — «осталось N»;
// в середине — выбор текущего шага; справа — редактор-карточка по образцу владельца (EditorCard, 30.10.2026): имя,
// раса, класс, point buy, предыстория и навыки правятся прямо на карте; переключатель «Лист» — та же карточка, что на
// столе (EntityCard и секции листа), живая: числа считает deriveDraft по черновику после каждого клика.
// Шаги идут по порядку, но всё обратимо: любой шаг открывается кликом, смена расы или класса сбрасывает только то,
// что от них зависит. Что предлагать — из таблиц владельца (компендиум) и SRD (campaign/build.ts); ничего не вшито.
// Результат — ACTOR_SPAWNED полным снимком (пишет страница); сам редактор событий не знает.
import { useMemo, useState, type ReactNode } from 'react';
import {
  DeriveError, abilityMod, classArmorProficiency, classSkillChoices, deriveDraft, sheetOf, type DerivedCharacter, type PcSpec,
} from '../../campaign';
import { inventoryOf, picksNeeded, spellcastingOf, startingKitOf, srdIdOf, type FeatureChoice, type SpellcastingOf } from '../../campaign/build';
import { poolLabel, resourcePoolsOf } from '../../campaign/resources';
import {
  ABILITY_LABEL, EntityCard, SKILL_LABEL, SKILLS_BY_ABILITY, SheetAttacks, SheetChoices, SheetEquipment, SheetFeats, SheetSpells, StatTile,
  actorCardProps, choiceValueLabel, itemLabel, signedMod, spellTitle,
} from '../../components';
import type { Actor } from '../../engine/state';
import { Icon } from '../../icons/Icon';
import { ABILITIES, ABILITY_IDS, ARMOR, SKILLS, SRD_CLASSES, isSrdClassId, type AbilityId, type SkillId } from '../../rules/srd';
import { CATEGORY_LABEL, ITEMS, armorIdOfItem, categoryItems, classWeaponProficient, type KitPart } from '../../rules/srd/equipment';
import { SCHOOL_LABEL, SPELLS, spellLevelLabel, type Spell } from '../../rules/srd/spells';
import { BACKGROUNDS, CLASSES, RACES, bySource, classById, raceById, type Asi, type Source } from '../../rules/compendium';
import { SourceBadge, SourceFilter } from '../compendium/parts';
import {
  POINT_BUY_TOTAL, STANDARD_ARRAY, actorIdFor, asiChoiceOf, asiLevelsOf, asiTotal, assignArray, backgroundSkills, bumpAsi, canDecrease,
  canIncrease, draftIssues, initialDraft, pointsLeft, selectKit, setPick, subclassDue, subraceRequired, toSpec, toggleAsiChoice, toggleChoice,
  toggleSkill, toggleSpell, CLERIC_CLASS, withBackground, withClass, withLevel, withMethod, withRace, withSubclass, withSubrace, asiMode, setFeat, setFeatAsi, type Draft,
} from './draft';
import { featBlocked } from '../../campaign/derive';
import { FEATS, type Feat } from '../../rules/compendium';
import { CLASS_START } from '../../rules/srd/equipment';
import { BTN, BTN_MAIN, Field, INPUT, LINK, Left, OPT, OPT_OFF, OPT_ON, Option, STEP, Section } from './parts';
import { DeityStep } from './DeityStep';
import { EditorCard } from './EditorCard';
import type { Era } from '../../campaign/era';

export interface CharacterEditorProps {
  /** Занятые id актёров — новый получит свободный. */
  takenIds: ReadonlySet<string>;
  onCreate: (spec: PcSpec) => void;
  onClose: () => void;
  /** Эпоха кампании — подписи богов в шаге «Божество»; по умолчанию 5e (1492 DR). */
  era?: Era;
  /** Что справа при открытии: редактор-карточка (по умолчанию) или лист целиком. */
  initialFace?: 'card' | 'sheet';
  className?: string;
}

/** «+2 DEX, +1 INT» — бонусы расы одной строкой; гибкие — «+1 на выбор». */
export function asiLabel(asi: Asi | undefined, choice?: { count: number; amount: number }): string {
  const fixed = asi ? (Object.entries(asi) as [AbilityId, number][]).filter(([, v]) => v).map(([ab, v]) => `${signedMod(v)} ${ABILITIES[ab].code}`) : [];
  if (choice) fixed.push(`${signedMod(choice.amount)} ×${choice.count} на выбор`);
  return fixed.join(', ');
}

/** Девять мировоззрений — коротко на кнопке, полностью в поле листа. */
const ALIGNMENTS = [
  ['ЗД', 'Законно-добрый'], ['НД', 'Нейтрально-добрый'], ['ХД', 'Хаотично-добрый'],
  ['ЗН', 'Законно-нейтральный'], ['Н', 'Нейтральный'], ['ХН', 'Хаотично-нейтральный'],
  ['ЗЗ', 'Законно-злой'], ['НЗ', 'Нейтрально-злой'], ['ХЗ', 'Хаотично-злой'],
] as const;

type StepId = 'name' | 'race' | 'class' | 'deity' | 'abilities' | 'skills' | 'features' | 'spells' | 'gear';
interface Step { id: StepId; label: string; left: number }

export function CharacterEditor({ takenIds, onCreate, onClose, era = '5e', initialFace = 'card', className = '' }: CharacterEditorProps) {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [sources, setSources] = useState<Source[]>(['srd', 'book', 'hb']);
  const [raceQuery, setRaceQuery] = useState('');
  const [spellQuery, setSpellQuery] = useState('');
  const [peek, setPeek] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>('name');
  const [face, setFace] = useState<'card' | 'sheet'>(initialFace);
  const patch = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));

  const race = raceById(draft.raceId);
  const cls = classById(draft.classId);
  const subrace = race?.subraces.find(s => s.id === draft.subraceId);
  const subclass = cls?.subclasses.find(s => s.id === draft.subclassId);
  const races = useMemo(() => {
    const q = raceQuery.trim().toLowerCase();
    return bySource(RACES, sources).filter(r => !q || r.name.toLowerCase().includes(q) || r.nameRu.toLowerCase().includes(q));
  }, [sources, raceQuery]);
  const classes = bySource(CLASSES, sources);
  const subraces = race ? bySource(race.subraces, sources) : [];
  const subclasses = cls ? bySource(cls.subclasses, sources) : [];
  const backgrounds = bySource(BACKGROUNDS, sources);

  // Лист: мягкий вывод — числа есть всегда, несделанное копится словами. Жёсткая ошибка (класс без кости хитов) — отдельно.
  const id = actorIdFor(draft.name, takenIds);
  const spec = toSpec(draft, id);
  let derived: DerivedCharacter | null = null;
  let deriveIssues: string[] = [];
  let hardError: string | null = null;
  try {
    ({ derived, issues: deriveIssues } = deriveDraft(spec));
  } catch (e) {
    hardError = e instanceof DeriveError ? e.message : String(e);
  }
  const formIssues = draftIssues(draft, cls);
  const issues = hardError ? [hardError, ...formIssues] : [...formIssues, ...deriveIssues];
  const ready = Boolean(derived) && issues.length === 0;

  let skillChoice: { count: number; options: readonly SkillId[] | null } = { count: 0, options: [] };
  if (cls) {
    try { skillChoice = classSkillChoices(cls); } catch { /* класс без навыков в таблице — derive скажет */ }
  }
  const armorProf = useMemo(() => {
    const set = new Set<string>(cls ? classArmorProficiency(cls) : []);
    if (draft.subclassId === 'jrec-jizni') set.add('heavy'); // Life Domain: Bonus Proficiency — тяжёлые доспехи
    return set;
  }, [cls, draft.subclassId]);
  const bgSkills = backgroundSkills(draft);
  const flex = asiChoiceOf(draft);
  const flexPicked = Object.values(draft.asiChoice).filter(Boolean).length;
  const asiLevels = cls ? asiLevelsOf(cls, draft.level) : [];
  const due = subclassDue(cls, draft.level);
  const featureChoices = derived?.featureChoices ?? [];
  const raceFcs = featureChoices.filter(f => f.id.startsWith('race-'));
  const classFcs = featureChoices.filter(f => !f.id.startsWith('race-'));
  const chosenCount = (fc: FeatureChoice) => (draft.choices[fc.id] ?? []).length;
  const plan: SpellcastingOf = cls && derived ? spellcastingOf(cls, draft.level, draft.subclassId, derived.mods) : { kind: 'none' };
  const kit = cls ? startingKitOf(cls) : null;
  const inventory = kit ? inventoryOf(kit, draft.kit) : { items: [], missing: [] };
  const srdId = cls ? srdIdOf(cls) : undefined;
  const srdSaves = cls && isSrdClassId(cls.name.toLowerCase()) ? SRD_CLASSES[cls.name.toLowerCase() as keyof typeof SRD_CLASSES].saves : [];
  const cantripsPicked = draft.spells.filter(s => SPELLS[s]?.level === 0).length;
  const leveledPicked = draft.spells.filter(s => (SPELLS[s]?.level ?? 0) > 0).length;

  const steps: Step[] = [
    { id: 'name', label: 'Имя', left: draft.name.trim() ? 0 : 1 },
    { id: 'race', label: 'Раса', left: (race && subraceRequired(race) && !draft.subraceId ? 1 : 0) + (flex ? Math.max(0, flex.count - flexPicked) : 0) + raceFcs.reduce((s, fc) => s + Math.max(0, fc.count - chosenCount(fc)), 0) + (derived && derived.raceFeats > 0 && !draft.feats.race?.id ? 1 : 0) },
    { id: 'class', label: 'Класс', left: due !== null && !draft.subclassId ? 1 : 0 },
    { id: 'deity', label: 'Божество', left: draft.classId === CLERIC_CLASS && !draft.deity ? 1 : 0 },
    { id: 'abilities', label: 'Характеристики', left: (draft.method === 'pointbuy' && pointsLeft(draft.base) < 0 ? 1 : 0) + asiLevels.filter(l => (draft.feats[l] ? !draft.feats[l].id : asiTotal(draft.improvements[l] ?? {}) !== 2)).length },
    { id: 'skills', label: 'Навыки', left: Math.max(0, skillChoice.count - draft.skills.length) },
    ...(classFcs.length ? [{ id: 'features' as const, label: 'Умения класса', left: classFcs.reduce((s, fc) => s + Math.max(0, fc.count - chosenCount(fc)), 0) }] : []),
    ...(plan.kind !== 'none' ? [{ id: 'spells' as const, label: 'Заклинания', left: plan.kind === 'plan' ? Math.max(0, plan.cantrips - cantripsPicked) + Math.max(0, plan.leveled - leveledPicked) : 0 }] : []),
    { id: 'gear', label: 'Снаряжение', left: inventory.missing.length },
  ];
  const current = steps.some(s => s.id === step) ? step : 'name';
  const index = steps.findIndex(s => s.id === current);
  const totalLeft = steps.reduce((s, x) => s + x.left, 0);

  /** Предпросмотр актёра — тот же вид, что получит стол; числа мягкого вывода. */
  const preview: Actor | null = derived ? {
    id, name: draft.name.trim() || 'Новый персонаж', kind: 'pc',
    hp: { current: derived.hpMax, max: derived.hpMax, temp: 0 }, ac: derived.ac, passivePerception: derived.passivePerception,
    conditions: {}, sheet: sheetOf(spec, derived),
  } : null;
  const pools = preview ? resourcePoolsOf(preview) : [];
  const soft = derived?.abilities ?? draft.base;
  const pb = derived?.proficiencyBonus ?? 2;
  const expertise = new Set(derived?.expertise ?? []);
  const skillBonus = (sk: SkillId, proficient: boolean) => abilityMod(soft[SKILLS[sk].ability]) + (proficient ? pb * (expertise.has(sk) ? 2 : 1) : 0);
  const peekSpell: Spell | undefined = peek ? SPELLS[peek] : undefined;
  const feats = bySource(FEATS, sources);
  const featWhy = (f: Feat) => derived ? featBlocked(f, {
    abilities: derived.abilities, level: draft.level, armorProf, martial: srdId ? CLASS_START[srdId].weapons.categories.includes('martial') : false,
    casts: plan.kind === 'plan', cantrips: plan.kind === 'plan' && plan.cantrips > 0,
  }) : null;
  const featPicker = (at: string, label: string) => (
    <FeatPicker
      label={label}
      feats={feats}
      value={draft.feats[at]}
      why={featWhy}
      onFeat={fid => setDraft(d => setFeat(d, at, fid))}
      onAsi={ab => setDraft(d => setFeatAsi(d, at, ab))}
    />
  );
  /** Пункты «что мешает», которых нет в шагах: ошибки, а не «осталось выбрать» (то — строками шагов выше). */
  const REMAINING = /^(нет имени|выбрать|распределить|заклинания (в книгу|подготовить|выучить)|снаряжение: выбрать|увеличение на \d+-м уровне не распределено|черта «.*»: выбрать характеристику)|нужно выбрать подрасу|не выбрано увеличение/;
  const problems = issues.filter(i => !REMAINING.test(i));

  /* ---------- Шаги: выбор ---------- */

  const nameStep = (
    <>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Field label="Имя">
          <input type="text" autoFocus autoComplete="off" aria-label="Имя" placeholder="Как зовут в мире" value={draft.name} onChange={e => patch({ name: e.target.value })} className={INPUT} />
        </Field>
        <Field label="Мировоззрение">
          <input type="text" autoComplete="off" aria-label="Мировоззрение" placeholder="Нейтральный" value={draft.alignment} onChange={e => patch({ alignment: e.target.value })} className={INPUT} />
        </Field>
      </div>
      <div role="group" aria-label="Мировоззрения" className="grid grid-cols-9 gap-1">
        {ALIGNMENTS.map(([code, full]) => (
          <Option key={code} on={draft.alignment === full} title={full} onClick={() => patch({ alignment: draft.alignment === full ? '' : full })} className="text-center type-num-12">{code}</Option>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Рост"><input type="text" autoComplete="off" aria-label="Рост" placeholder="97 см" value={draft.height} onChange={e => patch({ height: e.target.value })} className={INPUT} /></Field>
        <Field label="Вес"><input type="text" autoComplete="off" aria-label="Вес" placeholder="17 кг" value={draft.weight} onChange={e => patch({ weight: e.target.value })} className={INPUT} /></Field>
        <Field label="Возраст"><input type="text" inputMode="numeric" autoComplete="off" aria-label="Возраст" placeholder="26" value={draft.age} onChange={e => patch({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={INPUT} /></Field>
      </div>
      <Section title="Что брать в расчёт" hint="Фильтр источников: «только SRD» — одна кнопка">
        <SourceFilter value={sources} onChange={setSources} />
        <p className="type-body-sm text-t2">Дальше — раса и класс. Справа карточка: она заполняется по ходу, а несделанное в ней видно золотом.</p>
      </Section>
    </>
  );

  const raceStep = (
    <>
      <Section title="Раса" right={<input type="search" aria-label="Поиск расы" placeholder="Найти расу" value={raceQuery} onChange={e => setRaceQuery(e.target.value)} className={`${INPUT} w-40`} />}>
        <div role="group" aria-label="Расы" className="max-h-64 overflow-auto flex flex-col gap-px bg-lo p-px">
          {races.map(r => {
            const on = r.id === draft.raceId;
            return (
              <button key={r.id} type="button" aria-pressed={on} title={`${r.name}: ${asiLabel(r.asi, r.asiChoice) || 'бонусы у подрас'}`} onClick={() => setDraft(d => withRace(d, r.id))} className={`flex items-center gap-2 px-2 py-1 text-left cursor-pointer ${on ? 'bg-pl shadow-plate' : 'bg-cd hover:bg-pl'}`}>
                <span className={`type-body flex-1 min-w-0 truncate ${on ? 'text-gd' : 'text-tx'}`}>{r.nameRu}</span>
                <span className="type-key text-t3 truncate">{r.name}</span>
                <span className="type-num-12 text-t2 flex-none w-36 text-right truncate">{asiLabel(r.asi, r.asiChoice)}</span>
                <SourceBadge source={r.source} />
              </button>
            );
          })}
          {races.length === 0 ? <span className="type-body-sm text-t2 px-2 py-1">Ничего не найдено</span> : null}
        </div>
      </Section>
      {race && subraces.length > 0 ? (
        <Section title="Подраса" right={race && subraceRequired(race) ? <Left n={draft.subraceId ? 0 : 1} /> : <span className="type-key text-t2">по желанию</span>}>
          <div role="group" aria-label="Подраса" className="flex flex-wrap gap-1">
            {!subraceRequired(race) ? <Option on={!draft.subraceId} onClick={() => setDraft(d => withSubrace(d, undefined))}>без подрасы</Option> : null}
            {subraces.map(s => (
              <Option key={s.id} on={s.id === draft.subraceId} title={`${s.name}: ${asiLabel(s.asi, s.asiChoice)}`} onClick={() => setDraft(d => withSubrace(d, s.id))}>
                {s.nameRu} <span className="type-key text-t3">{asiLabel(s.asi, s.asiChoice)}</span>
              </Option>
            ))}
          </div>
        </Section>
      ) : null}
      {flex ? (
        <Section title={`Бонус расы на выбор · +${flex.amount} к ${flex.count}`} right={<Left n={flex.count - flexPicked} />}>
          <div role="group" aria-label="Бонус расы на выбор" className="grid grid-cols-6 gap-1">
            {ABILITY_IDS.map(ab => {
              const on = Boolean(draft.asiChoice[ab]);
              const allowed = flex.from.includes(ab);
              return (
                <Option key={ab} on={on} disabled={!allowed || (!on && flexPicked >= flex.count)} title={allowed ? `+${flex.amount} ${ABILITY_LABEL[ab]}` : `${ABILITY_LABEL[ab]}: бонус расы уже есть`} onClick={() => setDraft(d => toggleAsiChoice(d, ab))} className="text-center type-num-12">
                  {ABILITIES[ab].code}{on ? ` +${flex.amount}` : ''}
                </Option>
              );
            })}
          </div>
        </Section>
      ) : null}
      {raceFcs.map(fc => <ChoiceBlock key={fc.id} fc={fc} picked={draft.choices[fc.id] ?? []} onToggle={o => setDraft(d => toggleChoice(d, fc.id, o, fc.count))} />)}
      {derived && derived.raceFeats > 0 ? featPicker('race', 'Черта расы') : null}
      {derived && derived.traits.length > 0 ? (
        <Section title={`Черты · ${derived.traits.length}`}>
          <p className="type-body-sm text-t2">{derived.traits.map(t => t.name).join(' · ')}</p>
        </Section>
      ) : null}
    </>
  );

  const classStep = (
    <>
      <Section
        title="Класс"
        right={(
          <span className="flex items-center gap-1" role="group" aria-label="Уровень">
            <span className="type-key uppercase text-t2 mr-1">уровень</span>
            <button type="button" aria-label="Уровень ниже" disabled={draft.level <= 1} onClick={() => setDraft(d => withLevel(d, d.level - 1))} className={STEP}>−</button>
            <input type="text" inputMode="numeric" aria-label="Уровень" value={draft.level} onChange={e => { const n = Number(e.target.value.replace(/\D/g, '')); if (n) setDraft(d => withLevel(d, n)); }} className={`${INPUT} w-10 text-center type-num-15`} />
            <button type="button" aria-label="Уровень выше" disabled={draft.level >= 20} onClick={() => setDraft(d => withLevel(d, d.level + 1))} className={STEP}>+</button>
          </span>
        )}
      >
        <div role="group" aria-label="Классы" className="grid grid-cols-3 gap-1">
          {classes.map(c => {
            const srd = srdIdOf(c);
            const hd = srd ? `d${SRD_CLASSES[srd].hitDie}` : '';
            return (
              <Option key={c.id} on={c.id === draft.classId} title={`${c.name} · ${c.source === 'srd' ? 'SRD' : 'книга'}${hd ? ` · кость хитов ${hd}` : ''}${c.proficiencies.armor ? ` · доспехи: ${c.proficiencies.armor}` : ''}`} onClick={() => setDraft(d => withClass(d, c.id))} className="flex items-baseline gap-2">
                <span className="flex-1 min-w-0 truncate">{c.nameRu}</span>
                {hd ? <span className="type-num-12 text-t3">{hd}</span> : null}
                <SourceBadge source={c.source} />
              </Option>
            );
          })}
        </div>
      </Section>
      {cls ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {cls.proficiencies.armor ? <><dt className="type-key uppercase text-t2">Доспехи</dt><dd className="type-body-sm text-tx">{cls.proficiencies.armor}</dd></> : null}
          {cls.proficiencies.weapons ? <><dt className="type-key uppercase text-t2">Оружие</dt><dd className="type-body-sm text-tx">{cls.proficiencies.weapons}</dd></> : null}
          {cls.proficiencies.tools ? <><dt className="type-key uppercase text-t2">Инструменты</dt><dd className="type-body-sm text-tx">{cls.proficiencies.tools}</dd></> : null}
        </dl>
      ) : null}
      {subclasses.length > 0 ? (
        <Section title="Подкласс" right={due !== null ? <Left n={draft.subclassId ? 0 : 1} /> : <span className="type-key text-t2">с {Math.min(...subclasses.map(s => s.gainedAt ?? 99))}-го уровня</span>}>
          <div role="group" aria-label="Подкласс" className="flex flex-wrap gap-1">
            {due === null ? <Option on={!draft.subclassId} onClick={() => setDraft(d => withSubclass(d, undefined))}>без подкласса</Option> : null}
            {subclasses.map(s => {
              const locked = s.gainedAt !== null && s.gainedAt > draft.level;
              const tip = [s.name, locked ? `с ${s.gainedAt}-го уровня` : '', s.affinity?.length ? `подходит: ${s.affinity.join(', ')}` : ''].filter(Boolean).join(' · ');
              return (
                <Option key={s.id} on={s.id === draft.subclassId} disabled={locked} title={tip} onClick={() => setDraft(d => withSubclass(d, s.id))}>
                  {s.name}{s.gainedAt !== null ? <span className="type-key text-t3"> {s.gainedAt} ур.</span> : null}{s.source === 'srd' ? <span className="type-key text-t3"> SRD</span> : null}
                </Option>
              );
            })}
          </div>
          {subclass?.affinity?.length ? <p className="type-body-sm text-t2">Подходит: {subclass.affinity.join(', ')}</p> : null}
        </Section>
      ) : null}
    </>
  );

  const left = pointsLeft(draft.base);
  const abilitiesStep = (
    <Section
      title="Характеристики"
      right={(
        <span className="flex items-center gap-2">
          <span role="group" aria-label="Способ" className="flex gap-1">
            <Option on={draft.method === 'array'} title="Стандартный набор 15 14 13 12 10 8 — раскладка с обменом" onClick={() => setDraft(d => withMethod(d, 'array'))} className="type-num-12">Набор</Option>
            <Option on={draft.method === 'pointbuy'} title="Point buy: 27 очков, 8–15 до бонусов расы (книга игрока)" onClick={() => setDraft(d => withMethod(d, 'pointbuy'))} className="type-num-12">Point buy</Option>
          </span>
          {draft.method === 'pointbuy' ? <span className={`type-key ${left < 0 ? 'text-fx-damage-hi' : 'text-t2'}`} title="Очки: 27 на всё, 8–15 до бонусов расы">осталось {left} из {POINT_BUY_TOTAL}</span> : null}
        </span>
      )}
    >
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="Очки характеристик">
        {ABILITY_IDS.map(ab => {
          const racial = (derived?.abilities[ab] ?? 0) - draft.base[ab] - Object.values(draft.improvements).reduce((s, a) => s + (a[ab] ?? 0), 0);
          const final = derived?.abilities[ab] ?? draft.base[ab];
          return (
            <div key={ab} className="flex flex-col items-center gap-1 p-1 bg-pn shadow-bevel" data-ability={ab}>
              <span className="type-num-12 uppercase text-t2" title={ABILITY_LABEL[ab]}>{ABILITIES[ab].code}</span>
              {draft.method === 'pointbuy' ? (
                <span className="flex items-center gap-1">
                  <button type="button" aria-label={`${ABILITY_LABEL[ab]} ниже`} disabled={!canDecrease(draft.base, ab)} onClick={() => patch({ base: { ...draft.base, [ab]: draft.base[ab] - 1 } })} className={STEP}>−</button>
                  <span className="type-num-15 text-tx w-6 text-center" data-part="base">{draft.base[ab]}</span>
                  <button type="button" aria-label={`${ABILITY_LABEL[ab]} выше`} disabled={!canIncrease(draft.base, ab)} onClick={() => patch({ base: { ...draft.base, [ab]: draft.base[ab] + 1 } })} className={STEP}>+</button>
                </span>
              ) : (
                <select aria-label={`${ABILITY_LABEL[ab]}: значение набора`} value={draft.base[ab]} onChange={e => patch({ base: assignArray(draft.base, ab, Number(e.target.value)) })} className={`${INPUT} w-full type-num-15 text-center`} data-part="base">
                  {STANDARD_ARRAY.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              <span className="type-key text-t3 h-3" title="Бонус расы">{racial ? `${signedMod(racial)} раса` : ''}</span>
              <span className="type-num-24 text-tx" data-part="final" title={`${ABILITY_LABEL[ab]} итогом`}>{final}</span>
              <span className="type-key text-t2" data-part="mod">{signedMod(abilityMod(Math.max(1, Math.min(30, final))))}</span>
            </div>
          );
        })}
      </div>
      {asiLevels.map(l => {
        const asi = draft.improvements[l] ?? {};
        const total = asiTotal(asi);
        const mode = (
          <span role="group" aria-label={`${l}-й уровень: увеличение или черта`} className="flex gap-1 flex-none">
            <Option on={!draft.feats[l]} onClick={() => setDraft(d => asiMode(d, l, 'asi'))} className="type-num-12" title="+2 к одной или +1 к двум характеристикам">ASI</Option>
            <Option on={Boolean(draft.feats[l])} onClick={() => setDraft(d => asiMode(d, l, 'feat'))} className="type-num-12" title="Черта из таблицы вместо увеличения (вариант книги игрока)">Черта</Option>
          </span>
        );
        if (draft.feats[l]) {
          return (
            <div key={l} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className={`type-key uppercase w-24 flex-none ${draft.feats[l].id ? 'text-t2' : 'text-gd'}`}>{l} ур. · черта</span>
                {mode}
              </div>
              {featPicker(String(l), `Черта на ${l}-м уровне`)}
            </div>
          );
        }
        return (
          <div key={l} role="group" aria-label={`Увеличение на ${l}-м уровне`} className="flex items-center gap-1">
            {mode}
            <span className={`type-key uppercase w-24 flex-none ${total === 2 ? 'text-t2' : 'text-gd'}`} title="+2 к одной или +1 к двум">{l} ур. · {total}/2</span>
            {ABILITY_IDS.map(ab => (
              <button key={ab} type="button" aria-pressed={Boolean(asi[ab])} disabled={total >= 2 && !asi[ab]} title={`+1 ${ABILITY_LABEL[ab]} на ${l}-м уровне`} onClick={() => patch({ improvements: { ...draft.improvements, [l]: bumpAsi(asi, ab) } })} className={`${OPT} text-center type-num-12 flex-1 ${asi[ab] ? OPT_ON : OPT_OFF}`}>
                {ABILITIES[ab].code}{asi[ab] ? ` +${asi[ab]}` : ''}
              </button>
            ))}
            <button type="button" aria-label={`Сбросить увеличение на ${l}-м уровне`} title="Сбросить" disabled={total === 0} onClick={() => { const next = { ...draft.improvements }; delete next[l]; patch({ improvements: next }); }} className={BTN}>
              <Icon name="cross" size={16} color="currentColor" title="Сбросить" />
            </button>
          </div>
        );
      })}
    </Section>
  );

  const skillsStep = (
    <>
      <Section title="Предыстория">
        <div role="group" aria-label="Предыстории" className="flex flex-wrap gap-1">
          <Option on={!draft.backgroundId} onClick={() => setDraft(d => withBackground(d, undefined))}>без предыстории</Option>
          {backgrounds.map(b => (
            <Option key={b.id} on={b.id === draft.backgroundId} title={`${b.name}: ${b.skills.map(s => SKILL_LABEL[s]).join(', ')}`} onClick={() => setDraft(d => withBackground(d, b.id))}>
              {b.nameRu} <span className="type-key text-t3">{b.source === 'srd' ? 'SRD' : 'книга'}</span>
            </Option>
          ))}
        </div>
      </Section>
      <Section
        title="Навыки"
        right={<span className={`type-key ${draft.skills.length < skillChoice.count ? 'text-gd' : 'text-t2'}`} title="Навыки класса; предыстория и раса — сверх них">{draft.skills.length < skillChoice.count ? `выбрать ещё ${skillChoice.count - draft.skills.length}` : `класс: ${draft.skills.length} из ${skillChoice.count}`}</span>}
      >
        <div className="grid grid-cols-6 gap-1" role="group" aria-label="Навыки">
          {SKILLS_BY_ABILITY.map(sk => {
            const fromBg = bgSkills.includes(sk);
            const fromRace = derived?.skills.includes(sk) && !fromBg && !draft.skills.includes(sk);
            const chosen = draft.skills.includes(sk);
            const offered = skillChoice.options === null || skillChoice.options.includes(sk);
            const proficient = chosen || fromBg || Boolean(fromRace);
            const locked = !chosen && (fromBg || !offered || draft.skills.length >= skillChoice.count);
            const origin = fromBg ? 'предыстория' : fromRace ? 'раса' : chosen ? 'класс' : offered ? 'можно выбрать' : 'класс не предлагает';
            return (
              <StatTile
                key={sk}
                mode="select"
                label={SKILL_LABEL[sk]}
                mod={skillBonus(sk, proficient)}
                ability={SKILLS[sk].ability}
                owned={proficient}
                selected={chosen}
                disabled={locked}
                title={`${SKILL_LABEL[sk]} (${ABILITIES[SKILLS[sk].ability].code}) ${signedMod(skillBonus(sk, proficient))} · ${origin}`}
                onSelect={() => setDraft(d => toggleSkill(d, sk, skillChoice.count))}
              />
            );
          })}
        </div>
      </Section>
    </>
  );

  const featuresStep = (
    <>
      {classFcs.map(fc => <ChoiceBlock key={fc.id} fc={fc} picked={draft.choices[fc.id] ?? []} onToggle={o => setDraft(d => toggleChoice(d, fc.id, o, fc.count))} />)}
    </>
  );

  const spellsStep = plan.kind === 'nodata' ? (
    <Section title="Заклинания">
      <p className="type-body-sm text-t2">Данных нет: {plan.reason}. Лист оставит раздел пустым — ничего не выдумываем.</p>
      {plan.tableOnly?.length ? <p className="type-body-sm text-t2">В таблице подкласса: {plan.tableOnly.map(s => s.name).join(', ')}.</p> : null}
    </Section>
  ) : plan.kind === 'plan' ? (
    <SpellPicker
      plan={plan}
      picked={draft.spells}
      query={spellQuery}
      onQuery={setSpellQuery}
      onPeek={setPeek}
      peek={peekSpell}
      onToggle={sid => setDraft(d => toggleSpell(d, sid, x => SPELLS[x]?.level === 0, { cantrips: plan.cantrips, leveled: plan.leveled }))}
      tableOnly={plan.tableOnly}
      exclude={draft.choices['race-cantrip'] ?? []}
    />
  ) : null;

  const prof = (part: KitPart) => {
    if (!('item' in part) || !part.ifProficient) return true;
    const it = ITEMS[part.item];
    if (it?.armor) { const a = armorIdOfItem(part.item); return a ? armorProf.has(ARMOR[a].category) : false; }
    return srdId ? classWeaponProficient(srdId, part.item) : false;
  };
  const partLabel = (part: KitPart) => ('item' in part ? itemLabel(part.item, part.qty) : `${part.qty > 1 ? `${part.qty} × ` : ''}${CATEGORY_LABEL[part.pick] ?? part.pick}`);
  const owned = inventory.items.map(l => armorIdOfItem(l.id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const hasShield = inventory.items.some(l => l.id === 'shield');
  const gearStep = (
    <>
      {kit ? (
        <>
          {kit.fixed.length ? (
            <Section title="Всегда в наборе">
              <p className="type-body-sm text-tx">{kit.fixed.map(f => itemLabel(f.item, f.qty)).join(', ')}</p>
            </Section>
          ) : null}
          {kit.choices.map((ch, i) => {
            const sel = draft.kit[i];
            const parts = sel ? ch.options[sel.option] : undefined;
            const need = parts ? picksNeeded(parts) : 0;
            const done = sel && sel.picks.filter(Boolean).length >= need;
            return (
              <Section key={i} title={`Выбор ${i + 1}`} hint={ch.text} right={<Left n={done ? 0 : 1} />}>
                <span className="type-body-xs text-t3" lang="en">{ch.text}</span>
                <div role="group" aria-label={`Снаряжение: выбор ${i + 1}`} className="flex flex-wrap gap-1">
                  {ch.options.map((opt, k) => {
                    const ok = opt.every(prof);
                    return (
                      <Option key={k} on={sel?.option === k} disabled={!ok} title={ok ? opt.map(partLabel).join(' + ') : 'нет владения'} onClick={() => setDraft(d => selectKit(d, i, k, armorProf))}>
                        <span className="type-key text-t3">{String.fromCharCode(97 + k)}) </span>{opt.map(partLabel).join(' + ')}
                      </Option>
                    );
                  })}
                </div>
                {parts && need > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {parts.flatMap(p => ('pick' in p ? Array.from({ length: p.qty }, () => p.pick) : [])).map((cat, slot) => (
                      <select key={slot} aria-label={`${CATEGORY_LABEL[cat] ?? cat}, ${slot + 1}`} value={sel!.picks[slot] ?? ''} onChange={e => setDraft(d => setPick(d, i, slot, e.target.value, armorProf))} className={`${INPUT} min-w-48`}>
                        <option value="">{CATEGORY_LABEL[cat] ?? cat}…</option>
                        {categoryItems(cat).map(it => <option key={it.id} value={it.id}>{it.name}{srdId && it.weapon && !classWeaponProficient(srdId, it.id) ? ' — без владения' : ''}</option>)}
                      </select>
                    ))}
                  </div>
                ) : null}
              </Section>
            );
          })}
        </>
      ) : (
        <Section title="Стартовый набор">
          <p className="type-body-sm text-t2">У класса {cls?.nameRu ?? ''} стартового набора SRD нет{cls?.proficiencies.equipment ? `; в таблице: ${cls.proficiencies.equipment}` : ''}.</p>
        </Section>
      )}
      <Section title="Надето">
        <div role="group" aria-label="Доспех" className="flex flex-wrap gap-1">
          <Option on={draft.armor === null} onClick={() => patch({ armor: null })}>без доспеха</Option>
          {(kit ? owned : (Object.keys(ARMOR) as (keyof typeof ARMOR)[]).filter(a => armorProf.has(ARMOR[a].category))).map(a => (
            <Option key={a} on={draft.armor === a} disabled={!armorProf.has(ARMOR[a].category)} title={`AC ${ARMOR[a].baseAc}${ARMOR[a].strength ? ` · STR ${ARMOR[a].strength}` : ''}${ARMOR[a].stealthDisadvantage ? ' · помеха скрытности' : ''}`} onClick={() => patch({ armor: a, mageArmor: false })}>{ARMOR[a].name}</Option>
          ))}
          {(kit ? hasShield : true) && armorProf.has('shield') ? <Option on={draft.shield} onClick={() => patch({ shield: !draft.shield })}>Щит</Option> : null}
          {draft.armor === null ? <Option on={draft.mageArmor} title="Эффект заклинания Mage Armor: AC 13 + DEX" onClick={() => patch({ mageArmor: !draft.mageArmor })}>Доспехи мага</Option> : null}
        </div>
        {derived?.notes.map(n => <p key={n} className="type-body-sm text-t2">{n}</p>)}
      </Section>
    </>
  );

  const body: Record<StepId, ReactNode> = {
    name: nameStep, race: raceStep, class: classStep, deity: <DeityStep draft={draft} domainName={subclass?.name} era={era} onPick={deity => patch({ deity })} />, abilities: abilitiesStep, skills: skillsStep, features: featuresStep, spells: spellsStep, gear: gearStep,
  };

  /* ---------- Живая карточка ---------- */

  const card = preview && derived ? (
    <EntityCard {...actorCardProps(preview)} tabs={undefined} className="h-full max-h-full" data-part="sheet-card">
      {steps.some(s => s.left > 0) || problems.length > 0 ? (
        <section aria-label="Осталось выбрать" className="flex flex-col gap-1 p-2 bg-pn shadow-bevel-in" data-part="left">
          <span className="type-key uppercase text-gd">Осталось выбрать</span>
          {steps.filter(s => s.left > 0).map(s => (
            <button key={s.id} type="button" onClick={() => setStep(s.id)} className={LINK} title={`Открыть шаг «${s.label}»`}>
              {s.label} · ещё {s.left}
            </button>
          ))}
          {problems.length > 0 ? (
            <ul className="flex flex-col" aria-label="Что мешает">
              {problems.map(i => <li key={i} className="type-body-xs text-tx">{i}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-part="pc-header">
        <dt className="type-key uppercase text-t2">Раса</dt><dd className="type-body-sm text-tx truncate">{subrace ? `${derived.race.nameRu} · ${subrace.nameRu}` : derived.race.nameRu}</dd>
        <dt className="type-key uppercase text-t2">Класс</dt><dd className="type-body-sm text-tx truncate">{derived.cls.nameRu}{subclass ? ` · ${subclass.name}` : ''} · {draft.level} ур.</dd>
        {draft.backgroundId ? <><dt className="type-key uppercase text-t2">Предыстория</dt><dd className="type-body-sm text-tx truncate">{BACKGROUNDS.find(b => b.id === draft.backgroundId)?.nameRu}</dd></> : null}
        {draft.alignment.trim() ? <><dt className="type-key uppercase text-t2">Мировоззрение</dt><dd className="type-body-sm text-tx truncate">{draft.alignment.trim()}</dd></> : null}
        {draft.deity ? <><dt className="type-key uppercase text-t2">Божество</dt><dd className="type-body-sm text-tx truncate">{draft.deity.name}</dd></> : null}
        {derived.speed !== undefined ? <><dt className="type-key uppercase text-t2">Скорость</dt><dd className="type-body-sm text-tx">{derived.speed} фт</dd></> : null}
        <dt className="type-key uppercase text-t2">Кость хитов</dt><dd className="type-body-sm text-tx">d{derived.srdClass.hitDie}</dd>
      </dl>
      <Section title="Характеристики">
        <div className="grid grid-cols-6 gap-1">
          {ABILITY_IDS.map(ab => {
            const ownedSave = (srdSaves as readonly AbilityId[]).includes(ab);
            const save = derived!.mods[ab] + (ownedSave ? derived!.proficiencyBonus : 0);
            return <StatTile key={ab} label={ABILITIES[ab].code} mod={derived!.mods[ab]} score={derived!.abilities[ab]} ability={ab} owned={ownedSave} title={`${ABILITY_LABEL[ab]}: ${signedMod(derived!.mods[ab])} · спасбросок ${signedMod(save)}${ownedSave ? ' (владение)' : ''}`} />;
          })}
        </div>
      </Section>
      {pools.length > 0 ? (
        <Section title="Ресурсы">
          <ul className="flex flex-col gap-0.5" aria-label="Ресурсы листа">
            {pools.map(p => <li key={p.id} className="flex items-baseline gap-2 type-body-sm"><span className="type-num-12 text-gd w-6 flex-none">{p.max}</span><span className="text-tx">{poolLabel(p)}</span></li>)}
          </ul>
        </Section>
      ) : null}
      {derived.skills.length > 0 ? (
        <Section title="Владение навыками">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5" aria-label="Навыки листа">
            {derived.skills.map(sk => (
              <li key={sk} className="flex items-baseline gap-2 type-body-sm min-w-0"><span className="type-num-12 text-gd w-6 flex-none">{signedMod(skillBonus(sk, true))}</span><span className="text-tx truncate">{SKILL_LABEL[sk]}</span>{expertise.has(sk) ? <span className="type-key text-t3" title="Компетентность: бонус мастерства удвоен">×2</span> : null}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      <SheetChoices sheet={preview.sheet!} />
      <SheetFeats sheet={preview.sheet!} />
      <SheetAttacks sheet={preview.sheet!} />
      {preview.sheet!.spellcasting ? (
        <SheetSpells
          sheet={preview.sheet!}
          extra={plan.kind === 'plan' && (plan.cantrips > cantripsPicked || plan.leveled > leveledPicked) ? (
            <button type="button" onClick={() => setStep('spells')} className={LINK}>
              осталось: {[plan.cantrips > cantripsPicked ? `заговоров ${plan.cantrips - cantripsPicked}` : '', plan.leveled > leveledPicked ? `заклинаний ${plan.leveled - leveledPicked}` : ''].filter(Boolean).join(', ')}
            </button>
          ) : undefined}
        />
      ) : null}
      {derived.features.length > 0 ? (
        <Section title={`Умения · ${derived.features.length}`}>
          <ul className="flex flex-col gap-0.5" aria-label="Умения листа">
            {derived.features.map(f => <li key={`${f.level}:${f.id}`} className="flex items-baseline gap-2 type-body-sm"><span className="type-key text-t3 w-10 flex-none whitespace-nowrap">{f.level} ур.</span><span className="text-tx">{f.name}</span></li>)}
          </ul>
        </Section>
      ) : null}
      {derived.traits.length > 0 ? (
        <Section title={`Черты расы · ${derived.traits.length}`}>
          <p className="type-body-sm text-t2">{derived.traits.map(t => t.name).join(', ')}</p>
        </Section>
      ) : null}
      <SheetEquipment sheet={preview.sheet!} />
    </EntityCard>
  ) : (
    <div className="flex flex-col gap-2 p-4 bg-cd shadow-bevel" data-part="issues">
      <div className="flex items-center gap-2">
        <Icon name="pulse" size={16} color="var(--gd)" title="Лист не собирается" />
        <span className="type-h-15 uppercase text-t2">Лист не собирается</span>
      </div>
      <ul className="flex flex-col gap-1" aria-label="Что мешает">
        {issues.map(i => <li key={i} className="type-body-sm text-tx">{i}</li>)}
      </ul>
    </div>
  );

  return (
    <div className={`flex w-editor max-w-full h-full max-h-full flex-col bg-cd shadow-[var(--bevel),var(--frame)] ${className}`} data-part="character-editor">
      <header className="flex items-center gap-4 px-6 py-3 flex-none bg-linear-to-b from-pl to-cd shadow-[inset_0_-3px_0_var(--ent-pc)]">
        <Icon name="ent-pc" size={32} color="var(--ent-pc)" title="Персонаж" />
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="type-h-28 text-tx truncate">{draft.name.trim() || 'Новый персонаж'}</span>
          <span className="type-body-sm text-t2 truncate">{[race?.nameRu, subrace?.nameRu, cls?.nameRu, subclass?.name, `${draft.level} ур.`].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" title="Закрыть редактор · Esc" onClick={onClose} className={BTN}>Закрыть</button>
      </header>

      <div className="min-h-0 flex-1 grid grid-cols-[var(--editor-steps)_minmax(0,1fr)_var(--card-single)] gap-px bg-lo">
        <nav aria-label="Шаги" className="min-h-0 overflow-auto flex flex-col gap-px bg-lo">
          {steps.map((s, i) => {
            const on = s.id === current;
            return (
              <button key={s.id} type="button" aria-label={s.label} aria-current={on ? 'step' : undefined} onClick={() => setStep(s.id)} title={s.left > 0 ? `${s.label}: осталось ${s.left}` : `${s.label}: готово`} className={`flex items-center gap-2 px-3 py-2 text-left cursor-pointer focus-visible:shadow-[var(--glow-gold)] ${on ? 'bg-pl shadow-[var(--plate),inset_3px_0_0_var(--gd)]' : 'bg-pn hover:bg-cd'}`}>
                <span className={`type-num-12 w-4 flex-none ${on ? 'text-gd' : 'text-t2'}`}>{i + 1}</span>
                <span className={`flex-1 min-w-0 truncate type-body-sm ${on ? 'text-gd-hi' : 'text-tx'}`}>{s.label}</span>
                {s.left > 0 ? <span className="type-num-12 text-gd flex-none" aria-label={`осталось ${s.left}`}>{s.left}</span> : <Icon name="check" size={16} color="var(--t2)" title="готово" />}
              </button>
            );
          })}
          <div className="flex-1 bg-pn" />
        </nav>

        <div className="min-h-0 flex flex-col bg-cd" data-part="choices">
          <div className="min-h-0 flex-1 overflow-auto flex flex-col gap-4 p-4" aria-label={steps[index]?.label} role="region">
            {body[current]}
          </div>
          <div className="flex items-center gap-2 px-4 py-2 flex-none bg-pn shadow-plate">
            <button type="button" disabled={index <= 0} onClick={() => setStep(steps[index - 1].id)} className={BTN}>Назад</button>
            <span className="type-key text-t2 flex-1 text-center truncate">{index + 1} из {steps.length} · {steps[index]?.label}</span>
            <button type="button" disabled={index >= steps.length - 1} onClick={() => setStep(steps[index + 1].id)} className={BTN}>Далее</button>
          </div>
        </div>

        <aside aria-label="Лист" className="min-h-0 flex flex-col bg-pn" data-part="sheet">
          <div role="tablist" aria-label="Вид справа" className="flex-none grid grid-cols-2 bg-bg shadow-[inset_0_-2px_0_var(--br)]">
            {([['card', 'Карта', 'Редактор-карточка: правка прямо на карте'], ['sheet', 'Лист', 'Лист целиком, как на столе']] as const).map(([f, label, title]) => (
              <button key={f} type="button" role="tab" aria-selected={face === f} title={title} onClick={() => setFace(f)} className={`py-1 type-key uppercase cursor-pointer focus-visible:shadow-[var(--glow-gold)] ${face === f ? 'text-gd-hi bg-cd shadow-[inset_0_-2px_0_var(--gd)]' : 'text-t2 hover:text-tx'}`}>{label}</button>
            ))}
          </div>
          {face === 'card' ? (
            <div className="min-h-0 flex-1 overflow-y-auto flex justify-center p-2">
              <EditorCard
                draft={draft}
                setDraft={setDraft}
                derived={derived}
                races={races}
                classes={classes}
                backgrounds={backgrounds}
                skillChoice={skillChoice}
                bgSkills={bgSkills}
                asiLabel={r => asiLabel(r.asi, r.asiChoice) || 'бонусы у подрас'}
              />
            </div>
          ) : card}
        </aside>
      </div>

      <footer className="flex items-center gap-3 px-4 py-2 flex-none bg-pn shadow-bevel">
        <span className="type-key text-t3 truncate" title="id актёра в состоянии">{id}</span>
        <span className={`ml-auto type-key ${ready ? 'text-t2' : 'text-gd'}`} data-part="left-total">{ready ? 'лист сходится' : `осталось выбрать: ${Math.max(totalLeft, issues.length ? 1 : 0)}`}</span>
        <button type="button" title={ready ? 'ACTOR_SPAWNED: персонаж появляется в партии' : 'Сначала лист должен сойтись'} disabled={!ready} onClick={() => { if (ready) onCreate(spec); }} className={BTN_MAIN}>
          В партию
        </button>
      </footer>
    </div>
  );
}

/** Черта из таблицы владельца: список с требованиями (недоступные — с причиной), +1 к характеристике, текст черты. */
function FeatPicker({ label, feats, value, why, onFeat, onAsi }: {
  label: string;
  feats: readonly Feat[];
  value: { id: string; asi?: AbilityId } | undefined;
  why: (f: Feat) => string | null;
  onFeat: (id: string) => void;
  onAsi: (ab: AbilityId) => void;
}) {
  const feat = value?.id ? feats.find(f => f.id === value.id) ?? FEATS.find(f => f.id === value.id) : undefined;
  const sorted = [...feats].sort((a, b) => a.nameRu.localeCompare(b.nameRu, 'ru'));
  return (
    <Section title={label} right={<Left n={feat && (!feat.asi.length || value?.asi) ? 0 : 1} />}>
      <select aria-label={label} value={value?.id ?? ''} onChange={e => onFeat(e.target.value)} className={`${INPUT} w-full`}>
        <option value="">выбрать черту…</option>
        {sorted.map(f => {
          const block = why(f);
          return <option key={f.id} value={f.id} disabled={Boolean(block)}>{f.nameRu}{f.source === 'hb' ? ' (хоумбрю)' : ''}{f.asi.length ? ` · +1 ${f.asi.length === 6 ? 'любая' : f.asi.map(a => ABILITIES[a].code).join('/')}` : ''}{block ? ` — ${block}` : ''}</option>;
        })}
      </select>
      {feat && feat.asi.length > 1 ? (
        <div role="group" aria-label={`${label}: +1 к характеристике`} className="flex flex-wrap gap-1">
          {feat.asi.map(ab => <Option key={ab} on={value?.asi === ab} onClick={() => onAsi(ab)} className="type-num-12">{ABILITIES[ab].code} +1</Option>)}
        </div>
      ) : null}
      {feat ? <p className="type-body-sm text-t2 whitespace-pre-line line-clamp-4" title={feat.text}>{feat.text}</p> : null}
    </Section>
  );
}

/** Выбор умения: заголовок со счётчиком, варианты кнопками; пояснение SRD или таблицы — в тултипе и под списком. */
function ChoiceBlock({ fc, picked, onToggle }: { fc: FeatureChoice; picked: readonly string[]; onToggle: (id: string) => void }) {
  const [shown, setShown] = useState<string | null>(null);
  const detail = fc.options.find(o => o.id === shown)?.text;
  return (
    <Section title={fc.count > 1 ? `${fc.label} · ${fc.count}` : fc.label} hint={fc.text} right={<Left n={fc.count - picked.length} />}>
      {fc.text ? <p className="type-body-xs text-t3 line-clamp-2" title={fc.text}>{fc.text}</p> : null}
      <div role="group" aria-label={fc.label} className="flex flex-wrap gap-1">
        {fc.options.map(o => {
          const on = picked.includes(o.id);
          const name = fc.skills ? choiceValueLabel(o.id, o.name) : o.name;
          return (
            <Option key={o.id} on={on} disabled={!on && fc.count > 1 && picked.length >= fc.count} title={o.text ? `${name}: ${o.text.slice(0, 300)}` : name} onClick={() => onToggle(o.id)} onPeek={() => setShown(o.id)}>
              {name}{o.source !== 'srd' && !fc.skills ? <span className="type-key text-t3"> книга</span> : null}
            </Option>
          );
        })}
        {fc.options.length === 0 ? <span className="type-body-sm text-t2">Вариантов пока нет: сначала навыки.</span> : null}
      </div>
      {detail ? <p className="type-body-sm text-t2 whitespace-pre-line">{detail}</p> : null}
    </Section>
  );
}

/** Заговоры и заклинания из списка класса SRD: счётчики, поиск, описание наведённого — дословно из SRD. */
function SpellPicker({ plan, picked, query, onQuery, onPeek, peek, onToggle, tableOnly, exclude }: {
  plan: Extract<SpellcastingOf, { kind: 'plan' }>;
  picked: readonly string[];
  query: string;
  onQuery: (q: string) => void;
  onPeek: (id: string) => void;
  peek: Spell | undefined;
  onToggle: (id: string) => void;
  tableOnly?: { level: number; name: string }[];
  /** Уже известны иначе (заговор расы) — в списке класса не повторяются. */
  exclude: readonly string[];
}) {
  const q = query.trim().toLowerCase();
  const list = plan.options.filter(s => !plan.always.includes(s.id) && !exclude.includes(s.id) && (!q || s.name.toLowerCase().includes(q)));
  const cantrips = picked.filter(s => SPELLS[s]?.level === 0).length;
  const leveled = picked.filter(s => (SPELLS[s]?.level ?? 0) > 0).length;
  const kindLabel = plan.leveledKind === 'spellbook' ? 'В книгу заклинаний' : plan.leveledKind === 'prepared' ? 'Подготовить' : 'Выучить';
  const levels = [...new Set(list.map(s => s.level))];
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="type-key text-t2">{ABILITIES[plan.ability].code} · до {plan.maxLevel} круга</span>
        <input type="search" aria-label="Поиск заклинания" placeholder="Найти заклинание" value={query} onChange={e => onQuery(e.target.value)} className={`${INPUT} ml-auto w-48`} />
      </div>
      {peek ? (
        <section aria-label="Описание заклинания" className="flex flex-col gap-1 p-2 bg-pn shadow-bevel-in" data-part="spell-detail">
          <span className="type-body-bold text-tx">{peek.name} <span className="type-key text-t2">{spellLevelLabel(peek.level)} · {SCHOOL_LABEL[peek.school]}{peek.concentration ? ' · концентрация' : ''}{peek.ritual ? ' · ритуал' : ''}</span></span>
          <span className="type-body-xs text-t2" lang="en">{peek.castingTime} · {peek.range} · {peek.components.join(', ')}{peek.material ? ` (${peek.material})` : ''} · {peek.duration}</span>
          <p className="type-body-sm text-t2 whitespace-pre-line max-h-24 overflow-auto" lang="en">{peek.text}</p>
        </section>
      ) : null}
      {plan.always.length > 0 ? (
        <Section title="Всегда подготовлены">
          <p className="type-body-sm text-tx">{plan.always.map(s => SPELLS[s].name).join(', ')}</p>
        </Section>
      ) : null}
      {tableOnly?.length ? <p className="type-body-sm text-t2">В таблице подкласса (с SRD не связаны): {tableOnly.map(s => s.name).join(', ')}.</p> : null}
      {levels.map(l => {
        const isC = l === 0;
        const limit = isC ? plan.cantrips : plan.leveled;
        const have = isC ? cantrips : leveled;
        if (limit === 0) return null;
        return (
          <Section key={l} title={isC ? `Заговоры · ${have} из ${limit}` : `${l} круг · ${kindLabel.toLowerCase()}: ${have} из ${limit}`} right={<Left n={limit - have} />}>
            <div role="group" aria-label={isC ? 'Заговоры' : `Заклинания ${l} круга`} className="grid grid-cols-2 gap-1">
              {list.filter(s => s.level === l).map(s => {
                const on = picked.includes(s.id);
                return (
                  <Option key={s.id} on={on} disabled={!on && have >= limit} title={spellTitle(s.id)} onClick={() => onToggle(s.id)} onPeek={() => onPeek(s.id)} className="flex items-baseline gap-2">
                    <span className="flex-1 min-w-0 truncate">{s.name}</span>
                    <span className="type-key text-t3 flex-none">{SCHOOL_LABEL[s.school]}{s.concentration ? ' · К' : ''}</span>
                  </Option>
                );
              })}
            </div>
          </Section>
        );
      })}
    </>
  );
}

export default CharacterEditor;
