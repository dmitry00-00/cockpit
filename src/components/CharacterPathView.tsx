// БА27: интерактивная проекция таблицы, без записи в кампанию и собственного движка повышения.
import { useEffect, useId, useRef, useState } from 'react';
import { pathFeatureKind, pathFeatureState, type CharacterPath } from '../campaign/path';
import type { ClassFeature } from '../rules/compendium';
import { classById } from '../rules/compendium';
import { importedChoicesOf, type AdaptedChoice } from '../campaign/importedChoice';
import type { Actor } from '../engine';
import { LevelPlan } from './LevelPlan';
import { ClassEmblem } from '../art/ClassEmblem';
import { classIcon } from './sheetIcons';
import './CharacterPathView.css';

const SOURCE = { srd: 'SRD', book: 'Книга', hb: 'Авторский материал' };
const STATUS = { acquired: 'Есть в листе', unconfirmed: 'Не подтверждено листом', comparison: 'Другая ветвь', next: 'Следующий уровень', future: 'Будущий уровень' };
const FIELD = 'bg-wl text-tx shadow-bevel-in type-body-sm px-2 py-1 min-w-0 max-w-full focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
type Selection = { level: number; feature?: ClassFeature; branch?: string };

function choiceSourceAttribution(choice: AdaptedChoice) {
  if (choice.source === 'srd') {
    const version = choice.ruleset?.version ?? 'SRD';
    return { label: version, sentence: `из ${version}` };
  }
  if (choice.source === 'book') {
    const version = choice.ruleset?.version;
    const ownerTables = version ? `владелецкие таблицы ${version}` : 'владелецкие таблицы';
    return {
      label: `книга · ${ownerTables} · издание не указано`,
      sentence: `из импортированной книги (${ownerTables}); точное издание не размечено`,
    };
  }
  if (choice.source === 'hb') {
    return { label: 'авторский материал', sentence: 'из авторского материала' };
  }
  const labels = [...new Set(choice.allOptions.map(option => option.source))].map(source => SOURCE[source]);
  const sources = labels.join(' / ') || 'не указаны';
  return { label: `источники по вариантам: ${sources}`, sentence: `по источникам отдельных вариантов: ${sources}` };
}

export function CharacterPathView({ path, next, actor, planScope }: { path: CharacterPath; next?: string | null; actor?: Actor; planScope?: string }) {
  const [branchId, setBranchId] = useState(path.subclassId ?? '');
  const [selection, setSelection] = useState<Selection>({ level: path.level });
  const [planOpen, setPlanOpen] = useState(false);
  const planRegionId = `level-plan-${useId()}`;
  const inspectorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selection.feature) inspectorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selection]);
  const feature = selection.feature;
  const branch = path.branches.find(s => s.id === branchId);
  const comparing = Boolean(branch && branch.id !== path.subclassId);
  const pathClass = classById(path.classId);
  const adaptedChoice = feature && pathClass
    ? importedChoicesOf(pathClass, selection.level, branchId, actor?.sheet?.choices)
      .find(choice => choice.adapter.featureId === feature.id)
    : undefined;
  const adaptedChoiceSource = adaptedChoice ? choiceSourceAttribution(adaptedChoice) : undefined;
  const recordedChoice = adaptedChoice && actor?.sheet?.subclassId === branchId
    ? actor.sheet.choices?.find(choice => choice.id === adaptedChoice.id)?.values ?? []
    : [];
  const row = path.steps.find(s => s.level === selection.level)!;
  const current = path.steps.find(s => s.level === path.level);
  const option = feature?.choice ? path.options.find(o => o.id === feature.choice) : undefined;
  const selectedSource = selection.branch ? branch?.source ?? path.source : path.source;
  const pending = path.steps.filter(s => s.level > path.level && s.level <= selection.level)
    .flatMap(s => [...s.features, ...(branch?.features.filter(f => f.level === s.level) ?? [])])
    .filter(f => pathFeatureKind(f) !== 'level');
  const changes = [...new Set([...Object.keys(current?.resources ?? {}), ...Object.keys(row.resources)])]
    .filter(k => current?.resources[k] !== row.resources[k]);
  const node = (f: ClassFeature, level: number, lane?: string) => {
    const status = pathFeatureState(path, f, level, lane);
    const mode = { review: 'Проверить выбор', choice: 'Выбор', level: 'По уровню' }[pathFeatureKind(f)];
    return <button type="button" key={f.id} className="path-node" data-status={status}
      aria-pressed={selection.level === level && selection.feature?.id === f.id && selection.branch === lane}
      onClick={() => setSelection({ level, feature: f, branch: lane })}>
      <span className="type-body-sm">{f.name}</span>
      <span className="type-body-xs text-t2">{mode} · {STATUS[status]}</span>
    </button>;
  };
  const inspector = (
      <section ref={inspectorRef} className="path-inspector bg-pn p-3 flex flex-col gap-2" aria-label="Описание развития" aria-live="polite">
        <p className="type-body-xs text-t2">{selection.level} уровень класса · {selection.branch ? branch?.name : path.className}</p>
        <h4 className="type-h-20 text-tx">{feature?.name ?? `Сводка ${selection.level}-го уровня`}</h4>
        <p className="type-body-xs text-t2">Источник: {SOURCE[selectedSource]}. Точная редакция в импорте не размечена.</p>
        {feature ? <>
          <p className="type-body-sm text-gd-hi">{STATUS[pathFeatureState(path, feature, selection.level, selection.branch)]}</p>
          <p className="type-body-sm text-t2">{feature.name.includes('/') ? 'В таблице объединены альтернативы. Требуется уточнить вариант; это не две автоматически полученные способности.' : adaptedChoice ? `Проверенная схема выбора подключена ${adaptedChoiceSource?.sentence}. Боевой эффект выбранного варианта отдельно не рассчитывается.` : pathFeatureKind(feature) === 'review' ? 'В описании есть выбор, но его схема не размечена. Требуется проверить варианты по тексту; автоматический выбор недоступен.' : feature.choice ? 'Требуется выбор из вариантов.' : 'Получение по уровню согласно таблице; условия — в описании.'}</p>
          <p className="type-body-sm text-tx whitespace-pre-wrap">{feature.text || 'Полное описание ещё не загружено или отсутствует в исходной таблице.'}</p>
          {adaptedChoice ? <section className="flex flex-col gap-1 border-l-2 border-l-gd pl-2" aria-label={`Варианты выбора: ${adaptedChoice.label}`}>
            <h5 className="type-key text-gd">ВЫБРАТЬ {adaptedChoice.count} · {adaptedChoiceSource?.label}</h5>
            {adaptedChoice.unavailableReason ? <p role="status" className="type-body-xs text-fx-damage-hi">{adaptedChoice.unavailableReason}</p> : null}
            <ul className="flex flex-col gap-1 type-body-sm text-tx">
              {adaptedChoice.allOptions.map(item => {
                const saved = recordedChoice.find(value => value.id === item.id);
                return <li key={item.id}>{item.name}{saved ? <span className="type-key text-gd-hi"> · записан в листе</span> : null}</li>;
              })}
            </ul>
            <p className="type-body-xs text-t2">
              {actor && branchId !== path.subclassId
                ? 'Сравнение другой ветви не меняет лист.'
                : actor
                  ? recordedChoice.length ? 'Выбранный ID и источник показаны по листу. Боевой эффект отдельно не рассчитывается.' : 'В листе нет подтверждённого выбора; просмотр ничего не записывает.'
                  : 'На 3-м уровне выбирается один вариант. Просмотр не записывает его и не рассчитывает боевой эффект.'}
            </p>
          </section> : null}
          {option ? <details className="type-body-sm text-tx"><summary>Варианты: {option.name}</summary>
            <p className="whitespace-pre-wrap">{option.text}</p>
            {option.items.map(o => <details key={o.id}><summary>{o.name} · {SOURCE[o.source]}</summary><p className="whitespace-pre-wrap">{o.text || 'Описание отсутствует.'}</p></details>)}
          </details> : feature.choice ? <p className="type-body-sm text-t2">Список «{feature.choice}» не найден в импорте. Автоматический выбор недоступен.</p> : null}
        </> : <>
          <p className="type-body-sm text-tx">По таблице к этому уровню: {path.steps.filter(s => s.level <= selection.level).reduce((n, s) => n + s.features.length, 0)} записей класса; {branch?.features.filter(f => f.level <= selection.level).length ?? 0} записей ветви.</p>
          <p className="type-body-sm text-t2">Это возможности таблицы, а не расчёт будущего листа: решения, хиты и заклинания проверяет форма повышения.</p>
          {pending.length ? <p className="type-body-sm text-t2">Предстоит разобрать выборы и альтернативы: {[...new Set(pending.map(f => f.name))].join(' · ')}</p> : null}
          {!path.subclassId && path.branches.some(s => s.gainedAt !== null && s.gainedAt <= selection.level) ? <p className="type-body-sm text-t2">Подкласс в листе ещё не выбран. Просмотр ветви не подтверждает выбор.</p> : null}
        </>}
        <h5 className="type-h-17 text-tx">Ресурсы таблицы · {selection.level} ур.</h5>
        {Object.keys(row.resources).length ? <dl className="path-resources type-body-sm">
          {Object.entries(row.resources).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl> : <p className="type-body-sm text-t2">Ресурсы отдельными колонками не указаны.</p>}
        {selection.level !== path.level && changes.length ? <p className="type-body-xs text-t2">Отличия от текущего уровня: {changes.map(k => `${k}: ${current?.resources[k] ?? '—'} → ${row.resources[k] ?? '—'}`).join('; ')}. Значения показаны как в таблице.</p> : null}
        <button type="button" className="path-node type-body-sm text-tx" onClick={() => { setBranchId(path.subclassId ?? ''); setSelection({ level: path.level }); }}>К текущему персонажу</button>
      </section>
  );
  return <section className="class-path flex flex-col gap-3" data-part="path" data-has-branch={branch ? 'true' : 'false'} aria-label={`Развитие: ${path.className}`}>
    <header>
      <h3 className="path-title type-h-20 text-tx">
        <span className="path-emblem" aria-hidden="true"><ClassEmblem icon={classIcon(path.classId)} title="" size={32} /></span>
        <span className="path-title-copy"><span>{path.className}</span><span className="path-title-caption type-num-12">КЛАСС · ПУТЬ ДО 20 УРОВНЯ</span></span>
      </h3>
      <p className="type-body-sm text-t2">Уровень класса {path.level}{path.subclassName ? ` · ${path.subclassName}` : ' · подкласс не выбран'}</p>
      {next ? <p className="type-body-sm text-gd-hi" data-part="path-next">{next}</p> : null}
    </header>
    <label className="type-body-sm text-t2 flex flex-col gap-1">Подкласс для просмотра
      <select className={FIELD} value={branchId} onChange={e => { setBranchId(e.target.value); setSelection({ level: selection.level }); }}>
        <option value="">Только основная линия</option>
        {path.branches.map(s => <option key={s.id} value={s.id}>{s.name} · {SOURCE[s.source]}{s.id === path.subclassId ? ' · выбран' : ''}</option>)}
      </select>
    </label>
    <p className="type-body-xs text-t2">{comparing ? 'Сравнение другой ветви. ' : ''}Просмотр не меняет лист. Линии показывают уровни и принадлежность умений.</p>
    <div className="path-body">
      <div className="path-tree">
        <div className="path-columns type-body-sm text-t2"><span>Ур.</span><span>Класс</span><span>{branch?.name ?? 'Подкласс'}</span></div>
        <ol aria-label={`Путь: ${path.className}`} className="path-levels">
          {path.steps.map(s => <li key={s.level} data-level={s.level} data-state={s.state} aria-current={s.state === 'now' ? 'step' : undefined} className="path-level">
            <button type="button" className="path-level-number type-num-15" aria-label={`Уровень ${s.level}: сводка`} aria-pressed={selection.level === s.level && !feature} onClick={() => setSelection({ level: s.level })}>
              {s.level}<span className="type-body-xs">{s.state === 'now' ? 'сейчас' : s.state === 'next' ? 'далее' : ''}</span>
            </button>
            <div className="path-lane">
              {s.features.map(f => node(f, s.level))}
              {s.asi ? <span className="type-body-xs text-t2">Характеристики или черта · SRD</span> : null}
              <span className="type-body-xs text-t2">Мастерство {s.proficiencyBonus !== null ? `+${s.proficiencyBonus}` : 'не указано'}</span>
            </div>
            <div className="path-lane path-branch">
              {branch?.gainedAt === s.level ? <span className="type-body-xs text-gd-hi">Открытие подкласса · {s.level} ур.</span> : null}
              {!branch && s.subclassPick ? <span className="type-body-xs text-t2">Выбор подкласса</span> : null}
              {branch?.features.filter(f => f.level === s.level).map(f => node(f, s.level, branch.id))}
            </div>
          </li>)}
        </ol>
      </div>
        {inspector}

    </div>
    {actor?.sheet?.classId === path.classId ? <section aria-label="План развития персонажа" className="flex flex-col gap-2">
      <button type="button" className="path-node type-body-sm text-tx" aria-expanded={planOpen} aria-controls={planRegionId} onClick={() => setPlanOpen(open => !open)}>
        {planOpen ? 'Свернуть план развития' : 'Планировать развитие'}
      </button>
      <div id={planRegionId} hidden={!planOpen} className="flex flex-col gap-2">
        <p className="type-body-sm text-t2">План строится по текущему листу и выбранному в нём подклассу. Выбор ветви выше служит для сравнения и не меняет этот план.</p>
        <LevelPlan actor={actor} planScope={planScope} />
      </div>
    </section> : null}
  </section>;
}

export default CharacterPathView;
