// Повышение уровня во вкладке «Путь» (Q10, Д8): хиты — среднее SRD или бросок кости (вводом или системой), подкласс —
// там, где класс его даёт, увеличение характеристик — +2 к одной или +1 к двум на уровнях SRD. Что даст уровень —
// строкой над формой. Тупой: план и колбэки — пропсами; черновик — состояние формы, не событие. Черты вместо
// увеличения, заклинания и их замена используют существующие проверки; предпросмотр не пишет событие.
import { useState } from 'react';
import type { LevelUpChoice, LevelUpPlan } from '../campaign/levelUp';
import type { LevelUpPreview } from '../campaign/levelUpPreview';
import { ABILITIES, ABILITY_IDS, type AbilityId } from '../rules/srd/abilities';
import { SPELLS } from '../rules/srd/spells';
import { levelUpFeatEffectOf } from '../campaign/featEffects';
import { ARCHERY_STYLE, DEFENSE_STYLE } from '../campaign/derive';
import { FEAT_EFFECT_LABELS } from '../rules/compendium/views';
import type { FeatEffectKind, Source } from '../rules/compendium';

export interface LevelUpFormProps {
  plan: LevelUpPlan;
  /** Обновляет требования выбора при смене только что выбранного подкласса. */
  planForSubclass?: (subclassId: string) => LevelUpPlan;
  abilities: Readonly<Record<AbilityId, number>>;
  onLevelUp?: (choice: LevelUpChoice) => void;
  /** Бросок кости хитов системой (DICE_ROLLED); вернуть выпавшее. */
  onRoll?: (formula: string, label: string) => number;
  /** Почему не вышло (от расчёта) — строкой под формой. */
  error?: string | null;
  /** Чистая проекция тех же решений до подтверждения. Не бросает кости и не пишет в журнал. */
  onPreview?: (choice: LevelUpChoice) => LevelUpPreview;
  /** Локальный режим: сохранить решение в черновик плана, не вызывать кампанийное повышение. */
  intent?: 'apply' | 'plan';
  onPlanChoice?: (choice: LevelUpChoice) => void;
  /** Восстановить локальный выбор при редактировании сохранённого шага плана. */
  initialChoice?: LevelUpChoice;
}

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const FIELD = 'h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const SUPPORTED_FIGHTING_STYLES = new Set([ARCHERY_STYLE, DEFENSE_STYLE]);
const OPTION_SOURCE_LABEL: Readonly<Record<Source, string>> = { srd: 'SRD 5.1', book: 'книга · издание не указано', hb: 'домашнее правило' };

function featureChoiceSourceLabel(choice: LevelUpPlan['featureChoices'][number]) {
  if (choice.source === 'srd') return 'Источник: SRD 5.1';
  if (choice.source === 'book') return `Источник: книга · владелецкие таблицы ${choice.ruleset?.version ?? ''} (издание книги не отмечено)`;
  const sources = [...new Set(choice.options.map(option => option.source))].map(source => OPTION_SOURCE_LABEL[source]);
  return `Источники по вариантам: ${sources.join(' / ') || 'не указаны'}`;
}

export function LevelUpForm({ plan, planForSubclass, abilities, onLevelUp, onRoll, error, onPreview, intent = 'apply', onPlanChoice, initialChoice }: LevelUpFormProps) {
  const initialAsi = Object.entries(initialChoice?.asi ?? {}) as [AbilityId, number][];
  const [method, setMethod] = useState<'average' | 'roll'>(initialChoice?.hp.method ?? 'average');
  const [roll, setRoll] = useState(initialChoice?.hp.method === 'roll' ? String(initialChoice.hp.roll) : '');
  const [subclassId, setSubclassId] = useState(initialChoice?.subclassId ?? plan.subclasses?.[0]?.id ?? '');
  const [split, setSplit] = useState<'two' | 'one'>(initialAsi.length === 2 ? 'two' : 'one');
  const [first, setFirst] = useState<AbilityId>(initialAsi[0]?.[0] ?? 'str');
  const [second, setSecond] = useState<AbilityId>(initialAsi[1]?.[0] ?? 'dex');
  const [featId, setFeatId] = useState(initialChoice?.featId ?? '');
  const [featAbility, setFeatAbility] = useState<AbilityId | ''>(initialChoice?.featAbility ?? '');
  const [spells, setSpells] = useState<string[]>([...(initialChoice?.spells ?? [])]);
  const [spellQuery, setSpellQuery] = useState('');
  const [replaceFrom, setReplaceFrom] = useState(initialChoice?.replaceSpell?.from ?? '');
  const [replaceTo, setReplaceTo] = useState(initialChoice?.replaceSpell?.to ?? '');
  const [replaceCantripFrom, setReplaceCantripFrom] = useState(initialChoice?.replaceCantrip?.from ?? '');
  const [replaceCantripTo, setReplaceCantripTo] = useState(initialChoice?.replaceCantrip?.to ?? '');
  const [featureChoices, setFeatureChoices] = useState<Record<string, string[]>>(() => Object.fromEntries(Object.entries(initialChoice?.featureChoices ?? {}).map(([id, values]) => [id, [...values]])));
  const [featureChoiceReplacements, setFeatureChoiceReplacements] = useState<Record<string, { from: string; to: string }>>(() => ({ ...(initialChoice?.featureChoiceReplacements ?? {}) }));
  const choicePlan = planForSubclass && subclassId ? planForSubclass(subclassId) : plan;
  const featureChoicesReady = choicePlan.featureChoices.every(fc => {
    const selected = featureChoices[fc.id] ?? [];
    return selected.length === fc.required && (!fc.selectionGroups || (
      selected.every(id => fc.options.some(option => option.id === id))
      && fc.selectionGroups.every(group => selected.filter(id => group.options.some(option => option.id === id)).length === group.required)
    ));
  });
  const featureReplacementsReady = choicePlan.featureChoices.every(fc => {
    const replacement = featureChoiceReplacements[fc.id];
    return !replacement || Boolean(fc.replacement?.known.some(option => option.id === replacement.from)
      && fc.replacement.options.some(option => option.id === replacement.to)
      && !(featureChoices[fc.id] ?? []).includes(replacement.to));
  });
  const r = Number(roll);
  const rollOk = method === 'average' || (Number.isInteger(r) && r >= 1 && r <= plan.die);
  const asi: Partial<Record<AbilityId, number>> | undefined = !plan.asi ? undefined
    : split === 'one' ? { [first]: 2 } : first === second ? undefined : { [first]: 1, [second]: 1 };
  const feat = choicePlan.feats.find(f => f.id === featId);
  const featHpEffect = feat ? levelUpFeatEffectOf(feat)?.hp : undefined;
  const featAbilityChoice = feat?.asi.length === 1 ? feat.asi[0] : feat?.asi.includes(featAbility as AbilityId) ? featAbility as AbilityId : undefined;
  const featAbilityReady = !feat || feat.asi.length === 0 || featAbilityChoice !== undefined;
  const asiChoice = feat ? undefined : asi;
  const spellCount = (choicePlan.spells?.cantrips ?? 0) + (choicePlan.spells?.spells ?? 0);
  const preparedAbilityIncrease = (choicePlan.prepared ? asiChoice?.[choicePlan.prepared.ability] ?? 0 : 0)
    + (choicePlan.prepared && featAbilityChoice === choicePlan.prepared.ability ? 1 : 0);
  const preparedLimit = choicePlan.prepared
    ? Math.max(1, choicePlan.prepared.base + Math.floor((abilities[choicePlan.prepared.ability] + preparedAbilityIncrease - 10) / 2))
    : undefined;
  const ready = rollOk && (!plan.asi || feat !== undefined || asiChoice !== undefined) && featAbilityReady && spells.length === spellCount && (!replaceFrom || !!replaceTo) && (!replaceCantripFrom || !!replaceCantripTo) && featureChoicesReady && featureReplacementsReady && !choicePlan.featureChoices.some(fc => fc.unavailableReason) && (intent === 'plan' || choicePlan.unsupportedChoices.length === 0);
  const choice: LevelUpChoice = { hp: method === 'average' ? { method } : { method, roll: r }, ...(plan.subclasses ? { subclassId } : {}), ...(asiChoice ? { asi: asiChoice } : {}), ...(feat ? { featId: feat.id, ...(featAbilityChoice ? { featAbility: featAbilityChoice } : {}) } : {}), ...(spells.length ? { spells } : {}), ...(replaceFrom && replaceTo ? { replaceSpell: { from: replaceFrom, to: replaceTo } } : {}), ...(replaceCantripFrom && replaceCantripTo ? { replaceCantrip: { from: replaceCantripFrom, to: replaceCantripTo } } : {}), ...(Object.keys(featureChoices).length ? { featureChoices } : {}), ...(Object.keys(featureChoiceReplacements).length ? { featureChoiceReplacements } : {}) };
  const preview = ready ? onPreview?.(choice) : undefined;
  const canApply = intent === 'plan' ? rollOk : ready && preview?.kind !== 'invalid';
  const pending = [
    ...(!rollOk ? [`Введите бросок от 1 до ${plan.die}.`] : []),
    ...(plan.asi && !feat && !asiChoice ? ['Выберите две разные характеристики.'] : []),
    ...(feat && feat.asi.length > 1 && !featAbilityChoice ? ['Выберите характеристику для +1 от черты.'] : []),
    ...(spells.length !== spellCount ? ['Выберите новые заклинания по счётчикам выше.'] : []),
    ...(replaceFrom && !replaceTo ? ['Выберите замену известного заклинания.'] : []),
    ...(replaceCantripFrom && !replaceCantripTo ? ['Выберите новый заговор Изобретателя для замены.'] : []),
    ...choicePlan.featureChoices.filter(fc => featureChoiceReplacements[fc.id]?.from && !featureChoiceReplacements[fc.id]?.to).map(fc => `Выберите новый вариант для замены в «${fc.label}».`),
    ...choicePlan.featureChoices.filter(fc => (featureChoices[fc.id]?.length ?? 0) !== fc.required).map(fc => `Выберите ${fc.required} вариант(а) для «${fc.label}».`),
    ...choicePlan.featureChoices.filter(fc => fc.selectionGroups && !fc.selectionGroups.every(group => (featureChoices[fc.id] ?? []).filter(id => group.options.some(option => option.id === id)).length === group.required)).map(fc => `Заполните все категории выбора для «${fc.label}».`),
    ...choicePlan.featureChoices.filter(fc => fc.unavailableReason).map(fc => fc.unavailableReason!),
    ...choicePlan.unsupportedChoices,
  ];
  const formTitle = intent === 'plan' ? `Решение плана для ${plan.level}-го уровня` : `Повышение до ${plan.level}-го уровня`;
  const submit = () => {
    if (!canApply) return;
    if (intent === 'plan') onPlanChoice?.(choice);
    else onLevelUp?.(choice);
  };
  const abOpt = (ab: AbilityId) => <option key={ab} value={ab}>{ABILITIES[ab].code} {abilities[ab]}</option>;
  return (
    <form aria-label={formTitle} className="flex flex-col gap-2 bg-pn shadow-bevel p-2" data-part={intent === 'plan' ? 'level-plan-step' : 'level-up'} onSubmit={e => { e.preventDefault(); submit(); }}>
      <span className="type-h-15 text-tx">{intent === 'plan' ? `Шаг плана · ${plan.level}-й уровень` : `Повышение до ${plan.level}-го уровня`}</span>
      <fieldset className="flex flex-wrap items-center gap-2 type-body-sm">
        <legend className="type-key text-t2">Хиты: d{plan.die} {plan.conMod >= 0 ? '+' : '−'} {Math.abs(plan.conMod)} CON</legend>
        <label className="flex items-center gap-1"><input type="radio" name="hp" checked={method === 'average'} onChange={() => setMethod('average')} /> среднее {plan.average}</label>
        <label className="flex items-center gap-1"><input type="radio" name="hp" checked={method === 'roll'} onChange={() => setMethod('roll')} /> бросок</label>
        {method === 'roll' ? (
          <>
            <input aria-label="Выпало" inputMode="numeric" value={roll} onChange={e => setRoll(e.target.value.replace(/\D/g, ''))} className={`${FIELD} w-12`} />
            {onRoll ? <button type="button" className={BTN} onClick={() => setRoll(String(onRoll(`1d${plan.die}`, `Хиты, ${plan.level}-й уровень`)))}>d{plan.die}</button> : null}
          </>
        ) : null}
      </fieldset>
      {plan.subclasses ? (
        <label className="flex items-center gap-2 type-body-sm">
          <span className="text-t2">Подкласс</span>
          <select aria-label="Подкласс" value={subclassId} onChange={e => { setSubclassId(e.target.value); setFeatureChoices({}); setFeatureChoiceReplacements({}); }} className={FIELD}>
            {plan.subclasses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      ) : null}
      {choicePlan.subclassSpellNotes?.length ? <section aria-label="Заклинания подкласса из таблицы" data-part="subclass-spell-notes" className="flex flex-col gap-1 border-l-2 border-l-gd pl-2 type-body-sm">
        <h4 className="type-key text-gd">Заклинания подкласса, открывающиеся на этом уровне</h4>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-tx">
          {choicePlan.subclassSpellNotes.map((spell, index) => <li key={`${spell.level}:${spell.name}:${index}`}>
            {spell.name} · {spell.progression === 'class' ? `${spell.level}-й уровень класса` : `${spell.level}-й круг`}
          </li>)}
        </ul>
        <p className="type-body-xs text-t3">Источник: {choicePlan.subclassSpellNotes[0].source === 'book' ? 'таблица книги владельца' : choicePlan.subclassSpellNotes[0].source === 'srd' ? 'SRD 5.1' : 'правило стола'}. Издание книги не указано. Имена пока не связаны с ID заклинаний SRD и не добавляются в лист автоматически.</p>
      </section> : null}
      {choicePlan.featureChoices.map(fc => {
        const selectedIds = featureChoices[fc.id] ?? [];
        const showMechanicsNote = fc.mechanicalSupport === 'informational'
          && (fc.id !== 'fighting-style' || selectedIds.some(id => !SUPPORTED_FIGHTING_STYLES.has(id)));
        return <fieldset key={fc.id} className="flex flex-col gap-1 type-body-sm">
        <legend className="type-key text-t2">{fc.label}: выбрать {fc.required}{fc.cumulativeCount ? ` · всего по схеме ${fc.cumulativeCount}` : ''} · {featureChoiceSourceLabel(fc)}</legend>
        {fc.text ? <p className="type-body-xs text-t3">{fc.text}</p> : null}
        {fc.unavailableReason ? <p role="status" className="type-body-sm text-hp-low">{fc.unavailableReason}</p> : null}
        {fc.replacement?.known.length ? <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">Заменить известный вариант
            <select aria-label={`Заменить известный вариант · ${fc.label}`} value={featureChoiceReplacements[fc.id]?.from ?? ''} onChange={e => setFeatureChoiceReplacements(current => {
              const next = { ...current };
              if (!e.target.value) delete next[fc.id];
              else next[fc.id] = { from: e.target.value, to: current[fc.id]?.to ?? '' };
              return next;
            })} className={FIELD}>
              <option value="">Не заменять</option>
              {fc.replacement.known.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          {featureChoiceReplacements[fc.id]?.from ? <label className="flex items-center gap-1">Новый вариант
            <select aria-label={`Новый вариант для замены · ${fc.label}`} value={featureChoiceReplacements[fc.id]?.to ?? ''} onChange={e => setFeatureChoiceReplacements(current => ({ ...current, [fc.id]: { ...current[fc.id], from: current[fc.id]?.from ?? '', to: e.target.value } }))} className={FIELD}>
              <option value="">Выбрать</option>
              {fc.replacement.options.filter(option => !(featureChoices[fc.id] ?? []).includes(option.id)).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label> : null}
        </div> : null}
        {fc.selectionGroups ? <div className="flex flex-wrap gap-2" role="group" aria-label={fc.label}>
          {fc.selectionGroups.map(group => {
            const ids = new Set(group.options.map(option => option.id));
            const selected = (featureChoices[fc.id] ?? []).find(id => ids.has(id)) ?? '';
            return <label key={group.id} className="flex flex-col gap-1 text-t2">
              <span>{group.label}</span>
              {group.required === 1 ? <select aria-label={group.label} value={selected} onChange={e => setFeatureChoices(current => {
                const values = current[fc.id] ?? [];
                const next = values.filter(id => !ids.has(id));
                if (e.target.value) next.push(e.target.value);
                return { ...current, [fc.id]: next };
              })} className={FIELD}>
                <option value="">Выбрать…</option>
                {group.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select> : null}
            </label>;
          })}
        </div> : <div role="group" aria-label={fc.label} className="flex flex-wrap gap-2">
          {fc.options.map(option => {
            const selected = featureChoices[fc.id] ?? [];
            const on = selected.includes(option.id);
            const full = selected.length >= fc.required;
            return <label key={option.id} className="flex items-center gap-1 text-t2" title={option.text || option.name}>
              <input type="checkbox" checked={on} disabled={!on && (full || featureChoiceReplacements[fc.id]?.to === option.id)} onChange={() => setFeatureChoices(current => {
                const values = current[fc.id] ?? [];
                const next = values.includes(option.id) ? values.filter(id => id !== option.id) : [...values, option.id];
                return { ...current, [fc.id]: next };
              })} />
              <span>{option.name}</span>
              {!fc.source || option.source !== fc.source ? <span className="type-key text-t3">{OPTION_SOURCE_LABEL[option.source]}</span> : null}
            </label>;
          })}
        </div>}
        {showMechanicsNote ? <p className="type-body-xs text-t3">Выбор будет записан с источником и уровнем. Для неподдержанного механического эффекта предпросмотр покажет предупреждение.</p> : null}
        {fc.notes?.map(note => <p key={note} className="type-body-xs text-t3">{note}</p>)}
      </fieldset>;
      })}
      {plan.asi ? (
        <fieldset className="flex flex-wrap items-center gap-2 type-body-sm">
          <legend className="type-key text-t2">Увеличение (SRD) или черта</legend>
          {choicePlan.feats.length ? <label className="flex items-center gap-1"><input type="radio" name="asi-or-feat" checked={!featId} onChange={() => setFeatId('')} /> увеличение</label> : null}
          {choicePlan.feats.length ? <label className="flex items-center gap-1"><input type="radio" name="asi-or-feat" checked={Boolean(featId)} onChange={() => setFeatId(choicePlan.feats[0].id)} /> черта</label> : null}
          {featId ? <select aria-label="Черта" value={featId} onChange={e => { setFeatId(e.target.value); setFeatAbility(''); }} className={FIELD}>{choicePlan.feats.map(f => <option key={f.id} value={f.id}>{f.nameRu} · {f.source === 'srd' ? 'SRD 5.1' : 'таблица владельца · книга'}</option>)}</select> : null}
          {feat ? <div role="note" className="type-body-xs text-t2 basis-full">
            <p>Источник: {feat.source === 'srd' ? 'SRD 5.1' : 'таблица владельца, версия 2026.10.31; издание книги не указано'}.</p>
            {feat.text ? <p>{feat.text}</p> : null}
            {Object.entries(feat.effects).map(([kind, effect]) => effect ? <p key={kind}><strong>{FEAT_EFFECT_LABELS[kind as FeatEffectKind]}:</strong> {effect}</p> : null)}
            {featHpEffect ? <p>Максимум хитов: +{featHpEffect.onAcquisitionPerCharacterLevel * choicePlan.level} при получении этой черты, затем +{featHpEffect.perFutureLevel} за каждый следующий уровень. Этот эффект будет рассчитан.</p>
              : <p>Текст и происхождение сохраняются в листе. Остальные эффекты черты автоматически не применяются.</p>}
            {feat.asi.length > 1 ? <label className="flex items-center gap-2">Характеристика для +1
              <select aria-label="Характеристика черты" value={featAbility} onChange={e => setFeatAbility(e.target.value as AbilityId | '')} className={FIELD}>
                <option value="">Выбрать…</option>
                {feat.asi.map(ab => <option key={ab} value={ab}>{ABILITIES[ab].code} {abilities[ab]}</option>)}
              </select>
            </label> : null}
            {feat.asi.length === 1 ? <p>Черта даёт +1 к {ABILITIES[feat.asi[0]].code}.</p> : null}
          </div> : null}
          {!featId ? <>
          <select aria-label="Как увеличить" value={split} onChange={e => setSplit(e.target.value as 'one' | 'two')} className={FIELD}>
            <option value="one">+2 к одной</option>
            <option value="two">+1 к двум</option>
          </select>
          <select aria-label="Характеристика" value={first} onChange={e => setFirst(e.target.value as AbilityId)} className={FIELD}>{ABILITY_IDS.map(abOpt)}</select>
          {split === 'two' ? <select aria-label="Вторая характеристика" value={second} onChange={e => setSecond(e.target.value as AbilityId)} className={FIELD}>{ABILITY_IDS.map(abOpt)}</select> : null}
          </> : null}
        </fieldset>
      ) : null}
      {choicePlan.prepared ? <p className="type-body-sm text-t2">Подготовлено: {choicePlan.prepared.current} / {preparedLimit}. ASI обновит лимит; текущий список сохраняется.</p> : null}
      {choicePlan.bookSpellcasting ? <section aria-label="Заклинания класса из книги" className="flex flex-col gap-1 border-l-2 border-l-gd pl-2 type-body-sm">
        <h4 className="type-key text-gd">Заклинания Изобретателя · {choicePlan.bookSpellcasting.ruleset.version}</h4>
        <p className="text-t2">Характеристика: INT · подготовка: {preparedLimit} · заговоров по таблице: {choicePlan.bookSpellcasting.cantrips ?? 'не подтверждено'} · доступен круг: {choicePlan.bookSpellcasting.maxSpellLevel || 'нет ячеек'}.</p>
        {choicePlan.bookSpellcasting.newCantrips !== null && choicePlan.bookSpellcasting.newCantrips > 0 ? <p role="status" className="type-body-xs text-t3">По таблице на этом уровне прибавляется заговоров: {choicePlan.bookSpellcasting.newCantrips}. Выберите их в списке ниже.</p> : null}
        {choicePlan.bookSpellcasting.newCantrips === null ? <p role="status" className="type-body-xs text-t3">Число заговоров для этого уровня не подтверждено выбранным источником.</p> : null}
        {choicePlan.bookSpellcasting.unavailableCantripNames.length ? <p className="type-body-xs text-t3">В списке Tasha’s также есть варианты, которых пока нет в каталоге: {choicePlan.bookSpellcasting.unavailableCantripNames.join(', ')}.</p> : null}
        {choicePlan.bookSpellcasting.cantripReplacement.known.length ? <fieldset className="flex flex-wrap items-center gap-2 type-body-sm">
          <legend className="type-key text-t2">Необязательная замена одного известного заговора при повышении</legend>
          <select aria-label="Заменить известный заговор Изобретателя" value={replaceCantripFrom} onChange={e => { setReplaceCantripFrom(e.target.value); setReplaceCantripTo(''); }} className={FIELD}>
            <option value="">Не заменять</option>
            {choicePlan.bookSpellcasting.cantripReplacement.known.map(spell => <option key={spell.id} value={spell.id}>{spell.name}</option>)}
          </select>
          {replaceCantripFrom ? <select aria-label="Новый заговор Изобретателя" value={replaceCantripTo} onChange={e => setReplaceCantripTo(e.target.value)} className={FIELD}>
            <option value="">Выбрать заговор</option>
          {choicePlan.bookSpellcasting.cantripReplacement.options.filter(spell => spell.id !== replaceCantripFrom && !spells.includes(spell.id)).map(spell => <option key={spell.id} value={spell.id}>{spell.name}</option>)}
          </select> : null}
        </fieldset> : null}
        <p className="type-body-xs text-t3">Источники: {choicePlan.bookSpellcasting.reference}; {choicePlan.bookSpellcasting.spellListReference}. Ячейки берутся из таблицы класса владельца.</p>
      </section> : null}
      {choicePlan.spells && spellCount > 0 ? (
        <fieldset className="flex flex-col gap-1 type-body-sm">
          <legend className="type-key text-t2">{choicePlan.spells.list === 'known' ? 'Новые известные заклинания' : choicePlan.spells.list === 'spellbook' ? 'Новые заклинания в книгу' : 'Новые заговоры класса'}: заговоров {choicePlan.spells.cantrips}, заклинаний {choicePlan.spells.spells}</legend>
          {choicePlan.spells.list === 'prepared' ? <p className="type-body-xs text-t3">Подготовленные заклинания при повышении не выбираются; здесь добавляются только заговоры по таблице класса.</p> : null}
          <input aria-label="Найти заклинание" value={spellQuery} onChange={e => setSpellQuery(e.target.value)} placeholder="Поиск по названию" className={`${FIELD} max-w-64`} />
          <div className="max-h-40 overflow-auto flex flex-col gap-1" role="group" aria-label="Варианты новых заклинаний">
            {choicePlan.spells.options.filter(s => s.name.toLowerCase().includes(spellQuery.trim().toLowerCase())).map(s => {
              const selected = spells.includes(s.id);
              const sameKind = (s.level === 0 ? spells.filter(id => SPELLS[id]?.level === 0).length < choicePlan.spells!.cantrips : spells.filter(id => (SPELLS[id]?.level ?? 0) > 0).length < choicePlan.spells!.spells);
              return <label key={s.id} className="flex items-center gap-2 text-t2">
              <input type="checkbox" checked={selected} disabled={!selected && !sameKind} onChange={() => {
                if (selected) setSpells(current => current.filter(id => id !== s.id));
                else {
                  if (s.id === replaceCantripTo) setReplaceCantripTo('');
                  setSpells(current => [...current, s.id]);
                }
              }} />
                <span>{s.name} <span className="text-t3">{s.level === 0 ? 'заговор' : `${s.level}-й круг`}</span></span>
              </label>;
            })}
          </div>
          <span className="type-body-xs text-t3">Выбрано: {spells.filter(id => SPELLS[id]?.level === 0).length}/{choicePlan.spells.cantrips} заговоров, {spells.filter(id => (SPELLS[id]?.level ?? 0) > 0).length}/{choicePlan.spells.spells} заклинаний</span>
        </fieldset>
      ) : null}
      {choicePlan.replacement && choicePlan.replacement.known.length > 0 ? (
        <fieldset className="flex flex-wrap items-center gap-2 type-body-sm">
          <legend className="type-key text-t2">Необязательная замена одного известного заклинания</legend>
          <select aria-label="Заменить известное заклинание" value={replaceFrom} onChange={e => { setReplaceFrom(e.target.value); setReplaceTo(''); }} className={FIELD}>
            <option value="">Не заменять</option>
            {choicePlan.replacement.known.map(s => <option key={s.id} value={s.id}>{s.name} · {s.level}-й круг</option>)}
          </select>
          {replaceFrom ? <select aria-label="Новое известное заклинание" value={replaceTo} onChange={e => setReplaceTo(e.target.value)} className={FIELD}>
            <option value="">Выбрать заклинание</option>
            {choicePlan.replacement.options.filter(s => s.id !== replaceFrom && !choicePlan.replacement!.known.some(k => k.id === s.id) && !spells.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.name} · {s.level}-й круг</option>)}
          </select> : null}
        </fieldset>
      ) : null}
      {choicePlan.features.length ? <p className="type-body-sm text-t2">Умения уровня: <span className="text-tx">{choicePlan.features.join(', ')}</span></p> : null}
      {onPreview ? <section aria-label="Результат повышения" aria-live="polite" className="bg-wl shadow-bevel-in p-2 flex flex-col gap-2 min-w-0">
        <h4 className="type-h-20 text-tx">Результат повышения</h4>
        <p className="type-body-xs text-t2">{intent === 'plan' ? 'Локальный расчёт. Кампания и журнал событий не меняются.' : 'Предпросмотр. Персонаж изменится после нажатия «Повысить».'}</p>
        {pending.map(text => <p key={text} className="type-body-sm text-t2">{text}</p>)}
        {preview?.kind === 'invalid' ? <p className="type-body-sm text-hp-low">{preview.reason}</p> : null}
        {preview?.kind === 'ready' ? <>
          <table aria-label="Изменения показателей" className="type-body-sm w-full table-fixed text-left">
            <thead><tr><th scope="col" className="w-1/2 text-t2">Показатель</th><th scope="col" className="text-t2">Сейчас</th><th scope="col" className="text-t2">После</th></tr></thead>
            <tbody>{preview.lines.map(l => <tr key={l.label}><th scope="row" className="font-normal text-t2 py-1 [overflow-wrap:anywhere]">{l.label}</th><td className="text-t2 py-1 [overflow-wrap:anywhere]">{l.before}</td><td className="text-tx py-1 [overflow-wrap:anywhere]">{l.after}</td></tr>)}</tbody>
          </table>
          <p className="type-body-xs text-t2">Прибавка к максимуму добавится и к текущим хитам — правило стола. Временные хиты и потраченные ресурсы сохраняются.</p>
          {preview.gained.length ? <p className="type-body-sm text-tx">Добавится: {preview.gained.join(' · ')}</p> : null}
          {preview.warnings.map(text => <p key={text} className="type-body-sm text-t2">{text}</p>)}
        </> : null}
      </section> : null}
      {error ? <p role="status" className="type-body-sm text-hp-low">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button type="submit" className={BTN_MAIN} disabled={!canApply || (intent === 'plan' ? !onPlanChoice : !onLevelUp)}>{intent === 'plan' ? 'Сохранить в план' : 'Повысить'}</button>
        <span className="type-body-xs text-t3">{intent === 'plan' ? 'Решение хранится только в этом просмотре' : 'Выборы записываются в лист персонажа и отменяются вместе с повышением'}</span>
      </div>
    </form>
  );
}

export default LevelUpForm;
