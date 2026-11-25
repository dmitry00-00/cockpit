// «Уровень × подкласс» — лист класса из таблицы: слева бонус мастерства, ресурсы и умения класса,
// справа по колонке на подкласс; в клетке — умения, которые подкласс даёт на этом уровне.
import { useMemo } from 'react';
import { CLASSES, type CharacterClass, type Source } from '../../rules/compendium';
import { asiLevels, classLevelGrid, isSlotKey } from '../../rules/compendium/views';
import { Chip, Empty, Segmented, SourceBadge, type Detail } from './parts';
import srdClassOptionData from '../../../content/srd/class-options.json';

type SrdInvocationPrerequisite = {
  type: string;
  level?: number;
  feature?: string;
  spell?: string;
};
type SrdInvocationReference = {
  index: string;
  name: string;
  level?: number;
  prerequisites?: readonly SrdInvocationPrerequisite[];
};
type SrdClassOptionRecord = {
  id: string;
  classId: string;
  name: string;
  level?: number;
  choices?: {
    subfeature_options?: {
      choose?: number;
      from?: {
        options?: readonly { item?: { index?: string; name?: string } }[];
      };
    };
  };
};
type SrdClassChoiceReference = {
  id: string;
  classId: string;
  name: string;
  level?: number;
  choose: number;
  options: readonly { id: string; name: string }[];
};
const SRD_WARLOCK_INVOCATIONS = (srdClassOptionData as unknown as { classOptions: readonly {
  id: string;
  classId: string;
  choices?: { invocations?: readonly SrdInvocationReference[] };
}[] }).classOptions.find(option => option.id === 'eldritch-invocations' && option.classId === 'warlock')?.choices?.invocations ?? [];
const SRD_SORCERER_METAMAGIC = (srdClassOptionData as unknown as { classOptions: readonly SrdClassOptionRecord[] }).classOptions
  .filter(option => option.classId === 'sorcerer' && option.name === 'Metamagic')
  .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
const SRD_CLASS_CHOICE_REFERENCES = (srdClassOptionData as unknown as { classOptions: readonly SrdClassOptionRecord[] }).classOptions
  .flatMap((record): SrdClassChoiceReference[] => {
    const choice = record.choices?.subfeature_options;
    const options = choice?.from?.options;
    if (record.name === 'Metamagic' || typeof choice?.choose !== 'number' || !options?.length ||
        options.some(option => typeof option.item?.index !== 'string' || typeof option.item.name !== 'string')) return [];
    return [{
      id: record.id,
      classId: record.classId,
      name: record.name,
      ...(typeof record.level === 'number' ? { level: record.level } : {}),
      choose: choice.choose,
      options: options.map(option => ({ id: option.item!.index!, name: option.item!.name! })),
    }];
  });

const PROF_LABELS: Readonly<Record<string, string>> = {
  skills: 'Навыки', armor: 'Доспехи', weapons: 'Оружие', tools: 'Инструменты', equipment: 'Снаряжение', asiRule: 'Правило ASI',
};

function invocationPrerequisiteLabel(prerequisite: SrdInvocationPrerequisite): string | null {
  if (prerequisite.type === 'level' && typeof prerequisite.level === 'number') {
    return `Уровень ${prerequisite.level}`;
  }
  const reference = prerequisite.feature ?? prerequisite.spell;
  if ((prerequisite.type === 'feature' || prerequisite.type === 'spell') && reference) {
    const slug = reference.split('/').filter(Boolean).at(-1) ?? reference;
    const name = slug.split('-').map((part, index) => {
      const lower = part.toLowerCase();
      return index > 0 && ['of', 'the', 'and'].includes(lower)
        ? lower
        : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    }).join(' ');
    return prerequisite.type === 'spell' ? `Заклинание: ${name}` : `Умение: ${name}`;
  }
  return null;
}

function selectedVariantCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun = mod10 === 1 && mod100 !== 11 ? 'вариант'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'варианта'
      : 'вариантов';
  return `${count} ${noun}`;
}

function Proficiencies({ cls }: { cls: CharacterClass }) {
  const entries = Object.entries(cls.proficiencies).filter(([key, value]) => value && !(key === 'equipment' && cls.startingEquipmentPlan));
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 bg-cd shadow-bevel p-3">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="type-key text-t3">{PROF_LABELS[k] ?? k}</dt>
          <dd className="type-body-xs text-tx whitespace-pre-line">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function StartingEquipment({ cls }: { cls: CharacterClass }) {
  const plan = cls.startingEquipmentPlan;
  if (!plan) return null;
  return (
    <section className="bg-pn shadow-bevel p-3" aria-label="Стартовое снаряжение">
      <header className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="type-h-15 text-tx">Стартовое снаряжение</h2>
        <SourceBadge source={cls.source} />
        <span className="type-key text-t3">{plan.sourceSheet} · {plan.sourceCell}</span>
      </header>
      <p className="mb-2 type-body-xs text-t3">Разбиение исходной строки для чтения; выбор снаряжения персонажа здесь не выполняется.</p>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <div className="bg-cd shadow-bevel-in p-2">
          <h3 className="mb-1 type-key text-t2">В списке снаряжения</h3>
          <ul className="flex flex-col gap-1 type-body-xs text-tx">
            {plan.granted.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
          </ul>
        </div>
        {plan.choices.map(group => (
          <div key={group.name} className="bg-cd shadow-bevel-in p-2">
            <h3 className="mb-1 type-key text-t2">{group.name} · варианты в источнике</h3>
            <ul className="flex flex-col gap-1 type-body-xs text-tx">
              {group.options.map((option, index) => <li key={`${index}-${option}`}>{(['а', 'б', 'в'][index] ?? `${index + 1}`)}) {option}</li>)}
            </ul>
          </div>
        ))}
        <div className="bg-cd shadow-bevel-in p-2">
          <h3 className="mb-1 type-key text-t2">Альтернатива всему списку</h3>
          <p className="type-body-xs text-tx">{plan.wholeSetAlternative}</p>
        </div>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer type-key text-t3">Исходная строка</summary>
        <p className="mt-1 type-body-xs text-t3">{plan.raw}</p>
      </details>
    </section>
  );
}

export function ClassGrid({ classId, onClassChange, sources, selectedId, onSelect }: {
  classId: string;
  onClassChange: (id: string) => void;
  sources: readonly Source[];
  selectedId: string | null;
  onSelect: (id: string, detail: Detail) => void;
}) {
  const classes = useMemo(() => CLASSES.filter(c => sources.includes(c.source)), [sources]);
  const cls = classes.find(c => c.id === classId) ?? classes[0];
  const grid = useMemo(() => (cls ? classLevelGrid(cls, sources) : null), [cls, sources]);

  if (!cls || !grid) return <Empty text="Ни одного класса под фильтром." />;

  const slotKeys = grid.resourceKeys.filter(isSlotKey);
  const otherKeys = grid.resourceKeys.filter(k => !isSlotKey(k));
  const featureCount = cls.levels.reduce((n, l) => n + l.features.length, 0);
  const subFeatureCount = grid.subclasses.reduce((n, s) => n + s.features.length, 0);
  const asiAt = asiLevels(cls.id);
  const invocationReference = cls.id === 'koldun' && sources.includes('srd') ? SRD_WARLOCK_INVOCATIONS : [];
  const srdClassChoices = sources.includes('srd')
    ? SRD_CLASS_CHOICE_REFERENCES.filter(option => option.classId === cls.name.toLowerCase()).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name))
    : [];
  const optionBlocks = (cls.options ?? [])
    .map(block => ({ ...block, items: block.items.filter(item => sources.includes(item.source)) }))
    .filter(block => block.items.length > 0);
  const cell = 'px-2 py-1.5 align-top';
  const line = { boxShadow: 'inset 0 -1px 0 var(--lo)' };

  return (
    <div className="flex flex-col gap-3">
      <Segmented label="Класс" items={classes.map(c => ({ id: c.id, label: c.nameRu, hint: c.name }))} value={cls.id} onChange={onClassChange} />
      <div className="flex items-baseline gap-3">
        <span className="type-h-17 text-tx">{cls.nameRu}</span>
        {cls.name !== cls.nameRu && <span className="type-key text-t3">{cls.name}</span>}
        <SourceBadge source={cls.source} />
        <span className="type-num-12 text-t2">{grid.subclasses.length} подклассов · {featureCount} умений класса · {subFeatureCount} умений подклассов</span>
        {slotKeys.length > 0 && <span className="type-body-xs text-t3">цифры в шапке — круги ячеек заклинаний, 0 — заговоры; золотой уровень — повышение характеристик</span>}
      </div>
      <Proficiencies cls={cls} />
      <StartingEquipment cls={cls} />
      <div className="bg-pn shadow-bevel overflow-auto max-h-[70vh]">
        <table className="border-separate border-spacing-0 min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2">Ур.</th>
              <th className="sticky top-0 z-10 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2" title="бонус мастерства">БМ</th>
              {otherKeys.map(k => (
                <th key={k} className="sticky top-0 z-10 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2 max-w-[120px]"><span className="block truncate" title={k}>{k}</span></th>
              ))}
              {slotKeys.map(k => (
                <th key={k} className="sticky top-0 z-10 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2" title={k === '0' ? 'заговоры' : `ячейки ${k}-го круга`}>{k}</th>
              ))}
              <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[200px]">Умения класса</th>
              {grid.subclasses.map(s => (
                <th key={s.id} className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 min-w-[180px]">
                  <div className="flex flex-col gap-0.5">
                    <span className="type-h-15 text-t2">{s.name}</span>
                    <span className="flex items-baseline gap-2 whitespace-nowrap">
                      <SourceBadge source={s.source} />
                      {s.gainedAt !== null && <span className="type-key text-t4">с {s.gainedAt} ур.</span>}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map(row => {
              const asi = asiAt.has(row.level);
              return (
                <tr key={row.level}>
                  <td className={`sticky left-0 z-10 bg-cd ${cell} text-right`} style={line} title={asi ? 'повышение характеристик (SRD)' : undefined}><span className={`type-num-15 ${asi ? 'text-gd' : 'text-tx'}`}>{row.level}</span></td>
                  <td className={`bg-pn ${cell} text-right`} style={line}><span className="type-num-12 text-t2">{row.proficiencyBonus === null ? '—' : `+${row.proficiencyBonus}`}</span></td>
                  {otherKeys.map(k => (
                    <td key={k} className={`bg-pn ${cell} text-right`} style={line}><span className="type-num-12 text-tx">{row.resources[k] ?? ''}</span></td>
                  ))}
                  {slotKeys.map(k => (
                    <td key={k} className={`bg-pn ${cell} text-right`} style={line}><span className={`type-num-12 ${row.resources[k] ? 'text-tx' : 'text-t4'}`}>{row.resources[k] ?? '·'}</span></td>
                  ))}
                  <td className={`bg-pn ${cell}`} style={line}>
                    <div className="flex flex-col gap-1">
                      {row.features.map((f, i) => (
                        <Chip
                          key={`${f.id}-${i}`}
                          label={f.name}
                          text={f.text}
                          selected={selectedId === `${cls.id}#${row.level}#${f.id}`}
                          onSelect={() => onSelect(`${cls.id}#${row.level}#${f.id}`, { title: f.name, subtitle: `${cls.nameRu} · ${row.level} уровень`, source: cls.source, text: f.text })}
                        />
                      ))}
                    </div>
                  </td>
                  {grid.subclasses.map(s => (
                    <td key={s.id} className={`bg-pn ${cell}`} style={line}>
                      <div className="flex flex-col gap-1">
                        {row.bySubclass[s.id].map((f, i) => (
                          <div key={`${f.id}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <Chip
                              label={f.name}
                              text={f.text}
                              selected={selectedId === `${s.id}#${row.level}#${f.id}`}
                              onSelect={() => onSelect(`${s.id}#${row.level}#${f.id}`, { title: f.name, subtitle: `${cls.nameRu} · ${s.name} · ${row.level} уровень`, source: s.source, text: f.text })}
                            />
                            {f.nameEn && <span className="type-key text-t4">SRD: {f.nameEn}{f.srdId ? ` · ${f.srdId}` : ''}</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {optionBlocks.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Варианты класса">
          <h2 className="type-h-15 text-tx">Варианты класса</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {optionBlocks.map(block => {
              const subclassName = block.subclassId
                ? cls.subclasses.find(subclass => subclass.id === block.subclassId)?.name
                : undefined;
              const metamagicSchedule = cls.id === 'carodey' && sources.includes('srd') && block.id === 'metamagia'
                ? SRD_SORCERER_METAMAGIC
                : [];
              return (
                <article key={block.id} className="bg-pn shadow-bevel p-3 flex flex-col gap-2">
                  <header className="flex flex-col gap-1">
                    <h3 className="type-h-15 text-tx">{block.name}</h3>
                    {subclassName && <span className="type-key text-t3">{subclassName}</span>}
                    {block.text && <p className="type-body-xs text-t2 whitespace-pre-line">{block.text}</p>}
                  </header>
                  {metamagicSchedule.length > 0 && (
                    <div className="bg-cd shadow-bevel-in px-2 py-1.5 flex flex-col gap-1" aria-label="Справочное расписание выбора Метамагии SRD 5.1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="type-key text-t2">Расписание выбора · SRD 5.1</span>
                        <SourceBadge source="srd" />
                      </div>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1">
                        {metamagicSchedule.map(option => {
                          const level = option.level;
                          const choose = option.choices?.subfeature_options?.choose;
                          if (typeof level !== 'number' || typeof choose !== 'number') return null;
                          return (
                            <li key={option.id} className="type-body-xs text-tx">
                              {level}-й уровень — {level > 3 ? 'ещё ' : 'выбрать '}{choose} {choose === 1 ? 'вариант' : 'варианта'}
                            </li>
                          );
                        })}
                      </ul>
                      <span className="type-key text-t4">Справочная запись SRD; выбор персонажа здесь не выполняется.</span>
                    </div>
                  )}
                  {typeof block.choose === 'number' && (
                    <span className="type-body-xs text-t2">При каждом получении: выбрать {selectedVariantCount(block.choose)}</span>
                  )}
                  <ul className="flex flex-col gap-1.5">
                    {block.items.map(item => {
                      const id = `${cls.id}#option#${block.id}#${item.id}`;
                      const subtitle = [cls.nameRu, block.name, subclassName].filter(Boolean).join(' · ');
                      return (
                        <li key={item.id} className="bg-cd shadow-bevel-in px-2 py-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <Chip
                            label={item.name}
                            text={item.text}
                            selected={selectedId === id}
                            onSelect={() => onSelect(id, {
                              title: item.name,
                              subtitle,
                              source: item.source,
                              text: item.text,
                              cell: item.cell,
                            })}
                          />
                          <SourceBadge source={item.source} />
                          {item.srdName && <span className="type-key text-t4">SRD: {item.srdName}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {srdClassChoices.length > 0 && (
        <section className="bg-pn shadow-bevel p-3" aria-label="Справочные выборы класса из SRD 5.1">
          <header className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="type-h-15 text-tx">Выборы в записях SRD 5.1</h2>
            <SourceBadge source="srd" />
          </header>
          <p className="mb-2 type-body-xs text-t2">Показаны только записи, где SRD явно задаёт число выбора и перечень вариантов. Это справка по источнику, не выбор персонажа и не утверждение о доступности подкласса.</p>
          <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {srdClassChoices.map(choice => (
              <li key={choice.id} className="bg-cd shadow-bevel-in px-2 py-1.5 flex flex-col gap-1 type-body-xs text-tx">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span>{choice.name}</span>
                  <span className="type-key text-t3">{typeof choice.level === 'number' ? `Уровень в записи SRD: ${choice.level}` : 'Уровень в записи не указан'}</span>
                </div>
                <span className="type-key text-t2">Выбрать {choice.choose} из {choice.options.length}</span>
                <details>
                  <summary className="cursor-pointer type-key text-t3">Показать варианты</summary>
                  <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {choice.options.map(option => <li key={option.id}>{option.name}</li>)}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
      {invocationReference.length > 0 && (
        <section className="bg-pn shadow-bevel p-3" aria-label="Воззвания колдуна из SRD 5.1">
          <header className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="type-h-15 text-tx">Воззвания колдуна · SRD 5.1</h2>
            <SourceBadge source="srd" />
            <span className="type-key text-t3">{invocationReference.length} записей; справочный список, пустые условия не подтверждают их отсутствие</span>
          </header>
          <ul className="grid max-h-[38vh] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {invocationReference.map(invocation => {
              const prerequisites = (invocation.prerequisites ?? [])
                .map(invocationPrerequisiteLabel)
                .filter((value): value is string => value !== null);
              return (
                <li key={invocation.index} className="bg-cd shadow-bevel-in px-2 py-1.5 flex flex-col gap-1 type-body-xs text-tx">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span>{invocation.name.replace(/^Eldritch Invocation:\s*/, '')}</span>
                    {typeof invocation.level === 'number' && <span className="type-key text-t3">Уровень в записи SRD: {invocation.level}</span>}
                  </div>
                  {prerequisites.length > 0
                    ? <span className="type-key text-t3">Требования: {prerequisites.join(' и ')}</span>
                    : <span className="type-key text-t4">Условия не указаны в этой записи</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
