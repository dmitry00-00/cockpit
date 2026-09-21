// Редактор персонажа (шаг B, 21.09.2026): раса → подраса → класс → подкласс из компендиума, point buy как в JSX
// владельца, увеличения по уровням ASI, предыстория и навыки класса, доспех по владению класса. Справа — лист,
// который получится: те же числа, что считает derive.ts для партии §13, поэтому «В партию» невозможна, пока
// лист не сходится. Результат — ACTOR_SPAWNED полным снимком (пишет страница); сам редактор событий не знает,
// его черновик — состояние формы. Данные — из компендиума с фильтром источников; ничего не вшито.
import { useMemo, useState, type ReactNode } from 'react';
import { deriveCharacter, DeriveError, classArmorProficiency, classSkillChoices, abilityMod, type DerivedCharacter, type PcSpec } from '../../campaign/derive';
import { pcActor } from '../../campaign/seed';
import { poolLabel, resourcePoolsOf } from '../../campaign/resources';
import { ABILITY_LABEL, SKILL_LABEL, SKILLS_BY_ABILITY, StatTile, signedMod } from '../../components';
import { Icon } from '../../icons/Icon';
import { ABILITIES, ABILITY_IDS, ARMOR, ARMOR_IDS, SKILLS, SRD_CLASSES, isSrdClassId, type AbilityId, type SkillId } from '../../rules/srd';
import { BACKGROUNDS, CLASSES, RACES, bySource, classById, raceById, type Asi, type Source } from '../../rules/compendium';
import { SourceBadge, SourceFilter } from '../compendium/parts';
import {
  POINT_BUY_TOTAL, actorIdFor, asiLevelsOf, asiTotal, backgroundSkills, bumpAsi, canDecrease, canIncrease, draftIssues, initialDraft,
  pointsLeft, subraceRequired, toSpec, toggleSkill, withBackground, withClass, withLevel, withRace, type Draft,
} from './draft';

export interface CharacterEditorProps {
  /** Занятые id актёров — новый получит свободный. */
  takenIds: ReadonlySet<string>;
  onCreate: (spec: PcSpec) => void;
  onClose: () => void;
  className?: string;
}

const INPUT = 'h-7 px-2 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)] placeholder:text-t3';
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:hover:from-pl enabled:hover:to-pl enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const OPT = 'type-body-sm whitespace-nowrap px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd disabled:cursor-default disabled:opacity-(--op-disabled)';
const OPT_OFF = 'text-t2 shadow-bevel enabled:hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';
const STEP = 'size-6 flex items-center justify-center type-num-15 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-h-15 uppercase text-t2 truncate">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="type-key uppercase text-t2">{label}</span>
      {children}
    </label>
  );
}

/** Кнопка-вариант: нажатая — золотой грань, как у переключателей стола. */
function Option({ on, disabled, title, onClick, children }: { on: boolean; disabled?: boolean; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} title={title} onClick={onClick} className={`${OPT} ${on ? OPT_ON : OPT_OFF}`}>
      {children}
    </button>
  );
}

/** «+2 DEX, +1 INT» — бонусы расы одной строкой. */
export function asiLabel(asi: Asi | undefined): string {
  if (!asi) return '';
  return (Object.entries(asi) as [AbilityId, number][]).filter(([, v]) => v).map(([ab, v]) => `${signedMod(v)} ${ABILITIES[ab].code}`).join(', ');
}

/** Характеристики «как сейчас»: база плюс бонусы расы плюс распределённые увеличения — для подсказок, пока derive молчит. */
function softAbilities(draft: Draft): Record<AbilityId, number> {
  const race = raceById(draft.raceId);
  const racial = (draft.subraceId ? race?.subraces.find(s => s.id === draft.subraceId)?.asi : race?.asi) ?? {};
  const out = { ...draft.base };
  for (const ab of ABILITY_IDS) out[ab] += racial[ab] ?? 0;
  for (const asi of Object.values(draft.improvements)) for (const ab of ABILITY_IDS) out[ab] += asi[ab] ?? 0;
  return out;
}

export function CharacterEditor({ takenIds, onCreate, onClose, className = '' }: CharacterEditorProps) {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [sources, setSources] = useState<Source[]>(['srd', 'book', 'hb']);
  const [raceQuery, setRaceQuery] = useState('');
  const patch = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));

  const race = raceById(draft.raceId);
  const cls = classById(draft.classId);
  const races = useMemo(() => {
    const q = raceQuery.trim().toLowerCase();
    return bySource(RACES, sources).filter(r => !q || r.name.toLowerCase().includes(q) || r.nameRu.toLowerCase().includes(q));
  }, [sources, raceQuery]);
  const classes = bySource(CLASSES, sources);
  const subraces = race ? bySource(race.subraces, sources) : [];
  const subclasses = cls ? bySource(cls.subclasses, sources) : [];
  const backgrounds = bySource(BACKGROUNDS, sources);

  let skillChoice: { count: number; options: readonly SkillId[] | null } = { count: 0, options: [] };
  let skillNote: string | null = null;
  if (cls) {
    try { skillChoice = classSkillChoices(cls); } catch (e) { skillNote = e instanceof DeriveError ? e.message : String(e); }
  }
  const bgSkills = backgroundSkills(draft);
  const armorProf = cls ? classArmorProficiency(cls) : new Set<string>();
  const armors = ARMOR_IDS.filter(id => armorProf.has(ARMOR[id].category));
  const asiLevels = cls ? asiLevelsOf(cls, draft.level) : [];
  const soft = softAbilities(draft);
  const srdSaves = cls && isSrdClassId(cls.name.toLowerCase()) ? SRD_CLASSES[cls.name.toLowerCase() as keyof typeof SRD_CLASSES].saves : [];

  const issues = draftIssues(draft, cls, skillChoice.count);
  if (skillNote) issues.push(skillNote);
  const id = actorIdFor(draft.name, takenIds);
  const spec = toSpec(draft, id);
  let derived: DerivedCharacter | null = null;
  if (issues.length === 0) {
    try { derived = deriveCharacter(spec); } catch (e) { issues.push(e instanceof DeriveError ? e.message : String(e)); }
  }
  const preview = derived ? pcActor(spec) : null;
  const pools = preview ? resourcePoolsOf(preview) : [];
  const left = pointsLeft(draft.base);

  const skillBonus = (sk: SkillId, proficient: boolean) => abilityMod((derived?.abilities ?? soft)[SKILLS[sk].ability]) + (proficient ? (derived?.proficiencyBonus ?? 2) : 0);

  return (
    <div className={`flex w-editor max-h-full flex-col bg-cd shadow-[var(--bevel),var(--frame)] ${className}`} data-part="character-editor">
      <header className="flex items-center gap-4 p-6 flex-none bg-linear-to-b from-pl to-cd shadow-[inset_0_-3px_0_var(--ent-pc)]">
        <Icon name="ent-pc" size={48} color="var(--ent-pc)" title="Персонаж" />
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="type-h-28 text-tx truncate">{draft.name.trim() || 'Новый персонаж'}</span>
          <span className="type-body-sm text-t2 truncate">{[race?.nameRu, cls?.nameRu, `${draft.level} ур.`].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" title="Закрыть редактор · Esc" onClick={onClose} className={BTN}>Закрыть</button>
      </header>

      <div className="min-h-0 flex-1 grid grid-cols-[1fr_320px] gap-px bg-lo">
        {/* Левая колонка: выбор. */}
        <div className="min-h-0 overflow-auto flex flex-col gap-4 p-4 bg-cd" data-part="choices">
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <Field label="Имя">
              <input type="text" autoFocus autoComplete="off" aria-label="Имя" placeholder="Как зовут в мире" value={draft.name} onChange={e => patch({ name: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Мировоззрение">
              <input type="text" autoComplete="off" aria-label="Мировоззрение" placeholder="Нейтральный" value={draft.alignment} onChange={e => patch({ alignment: e.target.value })} className={INPUT} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Рост"><input type="text" autoComplete="off" aria-label="Рост" placeholder="97 см" value={draft.height} onChange={e => patch({ height: e.target.value })} className={INPUT} /></Field>
            <Field label="Вес"><input type="text" autoComplete="off" aria-label="Вес" placeholder="17 кг" value={draft.weight} onChange={e => patch({ weight: e.target.value })} className={INPUT} /></Field>
            <Field label="Возраст"><input type="text" inputMode="numeric" autoComplete="off" aria-label="Возраст" placeholder="26" value={draft.age} onChange={e => patch({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={INPUT} /></Field>
          </div>

          <SourceFilter value={sources} onChange={setSources} />

          <Section title="Раса" right={<input type="search" aria-label="Поиск расы" placeholder="Найти расу" value={raceQuery} onChange={e => setRaceQuery(e.target.value)} className={`${INPUT} w-40`} />}>
            <div role="group" aria-label="Расы" className="max-h-44 overflow-auto flex flex-col gap-px bg-lo p-px">
              {races.map(r => {
                const on = r.id === draft.raceId;
                return (
                  <button key={r.id} type="button" aria-pressed={on} title={`${r.name}: ${asiLabel(r.asi) || 'бонусы у подрас'}`} onClick={() => setDraft(d => withRace(d, r.id))} className={`flex items-center gap-2 px-2 py-1 text-left cursor-pointer ${on ? 'bg-pl shadow-plate' : 'bg-cd hover:bg-pl'}`}>
                    <span className={`type-body flex-1 min-w-0 truncate ${on ? 'text-gd' : 'text-tx'}`}>{r.nameRu}</span>
                    <span className="type-key text-t3 truncate">{r.name}</span>
                    <span className="type-num-12 text-t2 flex-none w-28 text-right truncate">{asiLabel(r.asi)}</span>
                    <SourceBadge source={r.source} />
                  </button>
                );
              })}
              {races.length === 0 ? <span className="type-body-sm text-t2 px-2 py-1">Ничего не найдено</span> : null}
            </div>
            {race && subraces.length > 0 ? (
              <div role="group" aria-label="Подраса" className="flex flex-wrap gap-1">
                {!subraceRequired(race) ? <Option on={!draft.subraceId} onClick={() => patch({ subraceId: undefined })}>без подрасы</Option> : null}
                {subraces.map(s => (
                  <Option key={s.id} on={s.id === draft.subraceId} title={`${s.name}: ${asiLabel(s.asi)}`} onClick={() => patch({ subraceId: s.id })}>
                    {s.nameRu} <span className="type-key text-t3">{asiLabel(s.asi)}</span>
                  </Option>
                ))}
              </div>
            ) : null}
          </Section>

          <Section
            title="Класс и уровень"
            right={(
              <span className="flex items-center gap-1" role="group" aria-label="Уровень">
                <button type="button" aria-label="Уровень ниже" disabled={draft.level <= 1} onClick={() => setDraft(d => withLevel(d, d.level - 1))} className={STEP}>−</button>
                <input type="text" inputMode="numeric" aria-label="Уровень" value={draft.level} onChange={e => { const n = Number(e.target.value.replace(/\D/g, '')); if (n) setDraft(d => withLevel(d, n)); }} className={`${INPUT} w-10 text-center type-num-15`} />
                <button type="button" aria-label="Уровень выше" disabled={draft.level >= 20} onClick={() => setDraft(d => withLevel(d, d.level + 1))} className={STEP}>+</button>
              </span>
            )}
          >
            <div role="group" aria-label="Классы" className="flex flex-wrap gap-1">
              {classes.map(c => (
                <Option key={c.id} on={c.id === draft.classId} title={`${c.name} · ${c.source === 'srd' ? 'SRD' : 'книга'}`} onClick={() => setDraft(d => withClass(d, c.id))}>{c.nameRu}</Option>
              ))}
            </div>
            {subclasses.length > 0 ? (
              <div role="group" aria-label="Подкласс" className="flex flex-wrap gap-1">
                <Option on={!draft.subclassId} onClick={() => patch({ subclassId: undefined })}>без подкласса</Option>
                {subclasses.map(s => {
                  const locked = s.gainedAt !== null && s.gainedAt > draft.level;
                  return (
                    <Option key={s.id} on={s.id === draft.subclassId} disabled={locked} title={locked ? `${s.name}: с ${s.gainedAt}-го уровня` : s.name} onClick={() => patch({ subclassId: s.id })}>
                      {s.name}{s.gainedAt !== null ? <span className="type-key text-t3"> {s.gainedAt} ур.</span> : null}
                    </Option>
                  );
                })}
              </div>
            ) : null}
          </Section>

          <Section
            title="Характеристики · point buy"
            right={(
              <span className="flex items-center gap-2">
                <span className={`type-key ${left < 0 ? 'text-fx-damage-hi' : 'text-t2'}`} title="Очки: 27 на всё, 8–15 до бонусов расы">осталось {left} из {POINT_BUY_TOTAL}</span>
                <button type="button" title="Стандартный набор 15 14 13 12 10 8 по порядку" onClick={() => patch({ base: initialDraft().base })} className={BTN}>Набор</button>
              </span>
            )}
          >
            <div className="grid grid-cols-6 gap-1" role="group" aria-label="Очки характеристик">
              {ABILITY_IDS.map(ab => {
                const racial = soft[ab] - draft.base[ab] - Object.values(draft.improvements).reduce((s, a) => s + (a[ab] ?? 0), 0);
                const final = derived?.abilities[ab] ?? soft[ab];
                return (
                  <div key={ab} className="flex flex-col items-center gap-1 p-1 bg-pn shadow-bevel" data-ability={ab}>
                    <span className="type-num-12 uppercase text-t2" title={ABILITY_LABEL[ab]}>{ABILITIES[ab].code}</span>
                    <span className="flex items-center gap-1">
                      <button type="button" aria-label={`${ABILITY_LABEL[ab]} ниже`} disabled={!canDecrease(draft.base, ab)} onClick={() => patch({ base: { ...draft.base, [ab]: draft.base[ab] - 1 } })} className={STEP}>−</button>
                      <span className="type-num-15 text-tx w-6 text-center" data-part="base">{draft.base[ab]}</span>
                      <button type="button" aria-label={`${ABILITY_LABEL[ab]} выше`} disabled={!canIncrease(draft.base, ab)} onClick={() => patch({ base: { ...draft.base, [ab]: draft.base[ab] + 1 } })} className={STEP}>+</button>
                    </span>
                    <span className="type-key text-t3 h-3" title="Бонус расы">{racial ? `${signedMod(racial)} раса` : ''}</span>
                    <span className="type-num-24 text-tx" data-part="final" title={`${ABILITY_LABEL[ab]} итогом`}>{final}</span>
                    <span className="type-key text-t2" data-part="mod">{signedMod(abilityMod(final))}</span>
                  </div>
                );
              })}
            </div>
            {asiLevels.map(l => {
              const asi = draft.improvements[l] ?? {};
              const total = asiTotal(asi);
              return (
                <div key={l} role="group" aria-label={`Увеличение на ${l}-м уровне`} className="flex items-center gap-1">
                  <span className={`type-key uppercase w-24 flex-none ${total === 2 ? 'text-t2' : 'text-gd'}`} title="+2 к одной или +1 к двум">{l} ур. · {total}/2</span>
                  {ABILITY_IDS.map(ab => (
                    <button key={ab} type="button" aria-pressed={Boolean(asi[ab])} disabled={total >= 2 && !asi[ab]} title={`+1 ${ABILITY_LABEL[ab]} на ${l}-м уровне`} onClick={() => patch({ improvements: { ...draft.improvements, [l]: bumpAsi(asi, ab) } })} className={`${OPT} flex-1 ${asi[ab] ? OPT_ON : OPT_OFF}`}>
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

          <Section title="Доспех">
            <div role="group" aria-label="Доспех" className="flex flex-wrap gap-1">
              <Option on={draft.armor === null} onClick={() => patch({ armor: null })}>без доспеха</Option>
              {armors.map(a => (
                <Option key={a} on={draft.armor === a} title={`AC ${ARMOR[a].baseAc}${ARMOR[a].strength ? ` · STR ${ARMOR[a].strength}` : ''}${ARMOR[a].stealthDisadvantage ? ' · помеха скрытности' : ''}`} onClick={() => patch({ armor: a })}>{ARMOR[a].name}</Option>
              ))}
              {armorProf.has('shield') ? <Option on={draft.shield} onClick={() => patch({ shield: !draft.shield })}>Щит</Option> : null}
              {draft.armor === null ? <Option on={draft.mageArmor} title="Эффект заклинания: AC 13 + DEX" onClick={() => patch({ mageArmor: !draft.mageArmor })}>Доспехи мага</Option> : null}
            </div>
          </Section>
        </div>

        {/* Правая колонка: лист, который получится. */}
        <aside aria-label="Лист" className="min-h-0 overflow-auto flex flex-col gap-4 p-4 bg-pn" data-part="sheet">
          {derived ? (
            <>
              <div className="grid grid-cols-4 gap-px bg-lo shadow-bevel" data-part="stats">
                {[['HP', String(derived.hpMax), 'Хиты'], ['AC', String(derived.ac), 'Класс доспеха'], ['PP', String(derived.passivePerception), 'Пассивная внимательность'], ['БМ', signedMod(derived.proficiencyBonus), 'Бонус мастерства']].map(([k, v, t]) => (
                  <div key={k} title={t} className="flex flex-col items-center py-1 bg-cd">
                    <span className="type-key uppercase text-t2">{k}</span>
                    <span className="type-num-24 text-tx">{v}</span>
                  </div>
                ))}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="type-key uppercase text-t2">Раса</dt><dd className="type-body-sm text-tx truncate">{derived.subrace ? `${derived.race.nameRu} · ${derived.subrace.nameRu}` : derived.race.nameRu}</dd>
                <dt className="type-key uppercase text-t2">Класс</dt><dd className="type-body-sm text-tx truncate">{derived.cls.nameRu}{spec.subclassId ? ` · ${derived.cls.subclasses.find(s => s.id === spec.subclassId)?.name ?? ''}` : ''} · {spec.level} ур.</dd>
                {derived.speed !== undefined ? <><dt className="type-key uppercase text-t2">Скорость</dt><dd className="type-body-sm text-tx">{derived.speed} фт</dd></> : null}
                <dt className="type-key uppercase text-t2">Кость хитов</dt><dd className="type-body-sm text-tx">d{derived.srdClass.hitDie}</dd>
              </dl>
              <div className="grid grid-cols-6 gap-1">
                {ABILITY_IDS.map(ab => {
                  const owned = (srdSaves as readonly AbilityId[]).includes(ab);
                  const save = derived.mods[ab] + (owned ? derived.proficiencyBonus : 0);
                  return <StatTile key={ab} label={ABILITIES[ab].code} mod={derived.mods[ab]} score={derived.abilities[ab]} ability={ab} owned={owned} title={`${ABILITY_LABEL[ab]}: ${signedMod(derived.mods[ab])} · спасбросок ${signedMod(save)}${owned ? ' (владение)' : ''}`} />;
                })}
              </div>
              <Section title="Владение навыками">
                <ul className="flex flex-col gap-0.5" aria-label="Навыки листа">
                  {derived.skills.map(sk => (
                    <li key={sk} className="flex items-baseline gap-2 type-body-sm"><span className="type-num-12 text-gd w-6 flex-none">{signedMod(skillBonus(sk, true))}</span><span className="text-tx">{SKILL_LABEL[sk]}</span><span className="type-key text-t3">{ABILITIES[SKILLS[sk].ability].code}</span></li>
                  ))}
                </ul>
              </Section>
              {pools.length > 0 ? (
                <Section title="Ресурсы">
                  <ul className="flex flex-col gap-0.5" aria-label="Ресурсы листа">
                    {pools.map(p => <li key={p.id} className="flex items-baseline gap-2 type-body-sm"><span className="type-num-12 text-gd w-6 flex-none">{p.max}</span><span className="text-tx">{poolLabel(p)}</span></li>)}
                  </ul>
                </Section>
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
            </>
          ) : (
            <div className="flex flex-col gap-2" data-part="issues">
              <div className="flex items-center gap-2">
                <Icon name="pulse" size={16} color="var(--gd)" title="Лист не сходится" />
                <span className="type-h-15 uppercase text-t2">Лист не сходится</span>
              </div>
              <ul className="flex flex-col gap-1" aria-label="Что мешает">
                {issues.map(i => <li key={i} className="type-body-sm text-tx">{i}</li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <footer className="flex items-center gap-2 p-4 flex-none bg-pn shadow-bevel">
        <span className="type-key text-t3 truncate" title="id актёра в состоянии">{id}</span>
        <button type="button" title={derived ? 'ACTOR_SPAWNED: персонаж появляется в партии' : 'Сначала лист должен сойтись'} disabled={!derived} onClick={() => { if (derived) onCreate(spec); }} className={`ml-auto ${BTN_MAIN}`}>
          В партию
        </button>
      </footer>
    </div>
  );
}

export default CharacterEditor;
