import type { ReactNode } from 'react';
import { ABILITY_LABEL } from './labels';
import { SCALE_LABELS } from './scales';
import { isEntityRef, type EntityRef } from '../entities/ref';
import { useOpenEntity } from './openEntity';
import { SemanticMark } from '../art/SemanticMark';
import { ORGANIZATION_ART } from '../art/semanticBindings';
import {
  subjectProfileSlotSpecs, validateSubjectEnvelope,
  type AnySubjectEnvelope, type SubjectCompositionRelation, type SubjectRelationKind, type SubjectSlotId,
} from '../entities/subjectContract';

const PROFILE_LABEL: Readonly<Record<AnySubjectEnvelope['profileId'], string>> = {
  character: 'Персонаж', deity: 'Божество', party: 'Группа', organization: 'Организация', city: 'Город', kingdom: 'Держава',
};
const FIELD_LABEL: Readonly<Record<string, string>> = {
  str: ABILITY_LABEL.str, dex: ABILITY_LABEL.dex, con: ABILITY_LABEL.con,
  int: ABILITY_LABEL.int, wis: ABILITY_LABEL.wis, cha: ABILITY_LABEL.cha,
  name: 'Имя', actorKind: 'Тип', memberCount: 'Участники', hp: 'Хиты', ac: 'КД', passivePerception: 'Пассивная Внимательность',
  abilities: 'Характеристики', skills: 'Навыки', class: 'Класс', level: 'Уровень', powerRank: 'Ранг силы', aliveStatus: 'Статус',
  alignment: 'Мировоззрение', portfolio: 'Сфера', domains: 'Домены', symbol: 'Знак', worshippers: 'Почитатели', holyDays: 'Святые дни',
  supply: 'Припасы', sharedLocation: 'Общее место', renown: 'Известность', standing: 'Отношение', influence: 'Влияние', trend: 'Изменение',
  type: 'Тип', base: 'Основание', leaders: 'Руководители', leaderNames: 'Руководители по источнику', founded: 'Основана', dissolved: 'Распущена', revealed: 'Открыта игрокам',
  races: 'Народы', members: 'Численность или состав', church: 'Церковь',
  danger: 'Опасность', haven: 'Укрытие', marketIndex: 'Индекс рынка', population: 'Население', government: 'Правительство', faith: 'Вера',
  capital: 'Столица', populationText: 'Население', languages: 'Языки', rulers: 'Правители', rulerNames: 'Правители',
  currency: 'Валюта', exports: 'Экспорт', imports: 'Импорт', deityText: 'Вера', region: 'Регион', continent: 'Континент',
  demonym: 'Жители', summary: 'Сводка', target: 'Субъект', relation: 'Связь',
  position: 'Положение', place: 'Место', scale: 'Масштаб', x: 'X', y: 'Y', radius: 'Радиус', radiusY: 'Радиус Y', text: 'Сведения',
  current: 'Текущее', maximum: 'Максимум', unit: 'Единица', label: 'Название',
};
const RELATION_LABEL: Readonly<Record<SubjectRelationKind | SubjectCompositionRelation, string>> = {
  worships: 'Почитает', religion: 'Почитает', serves: 'Служит', servedby: 'Ему служат', aspect: 'Аспект',
  ally: 'Союзник', enemy: 'Противник', 'dedicated-to': 'Посвящена божеству', 'associated-with': 'Связано с божеством',
  predecessor: 'Предшественник', successor: 'Преемник', 'campaign-relation': 'Отношение фракций',
  'party-member': 'Участник группы', 'pantheon-membership': 'Участник пантеона', 'organization-membership': 'Член организации',
  resident: 'Житель', organization: 'Организация', 'child-place': 'Часть места', 'territory-place': 'Территория', within: 'Находится внутри',
};
const META_KEYS = new Set(['provenance', 'visibility', 'audience', 'sourceId', 'citation', 'citations', 'factId', 'order', 'certainty', 'id']);

const DANGER_LABEL: Readonly<Record<string, string>> = { low: 'низкая', medium: 'средняя', high: 'высокая' };
const POSITION_ROLE_LABEL: Readonly<Record<string, string>> = {
  parent: 'Родительское место', base: 'База', associated: 'Связанное место', capital: 'Столица', represented: 'Представленное место',
};
const COUNT_UNIT_FORMS: Readonly<Record<string, readonly [string, string, string]>> = {
  участник: ['участник', 'участника', 'участников'],
  ячейка: ['ячейка', 'ячейки', 'ячеек'],
  использование: ['использование', 'использования', 'использований'],
  Supply: ['припас', 'припаса', 'припасов'],
};

function unitForCount(count: number, unit: string): string {
  const forms = COUNT_UNIT_FORMS[unit];
  if (!forms) return unit;
  const n = Math.abs(Math.trunc(count));
  const ones = n % 10, tens = n % 100;
  return tens >= 11 && tens <= 14 ? forms[2] : ones === 1 ? forms[0] : ones >= 2 && ones <= 4 ? forms[1] : forms[2];
}

function display(value: unknown, key?: string): string {
  if (typeof value === 'string') {
    if (key === 'scale' && Object.hasOwn(SCALE_LABELS, value)) return SCALE_LABELS[value as keyof typeof SCALE_LABELS];
    if (key === 'danger' && Object.hasOwn(DANGER_LABEL, value)) return DANGER_LABEL[value];
    return value;
  }
  if (typeof value === 'number') return new Intl.NumberFormat('ru-RU').format(value);
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return '';
}

function describe(value: unknown, key?: string): string[] {
  const prefix = key ? `${FIELD_LABEL[key] ?? key}: ` : '';
  const actorKind = key === 'actorKind' && typeof value === 'string'
    ? ({ pc: 'персонаж игрока', npc: 'неигровой персонаж', monster: 'противник' } as const)[value as 'pc' | 'npc' | 'monster']
    : undefined;
  const scalar = actorKind ?? display(value, key);
  if (scalar) return [`${prefix}${scalar}`];
  if (Array.isArray(value)) return value.flatMap(item => describe(item, key));
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  if (record.kind === 'reference' && typeof record.label === 'string') return [`${prefix}${record.label}`];
  if (record.kind === 'linked-place' && record.place && typeof record.place === 'object') {
    const place = record.place as { label?: unknown };
    const role = typeof record.role === 'string' ? POSITION_ROLE_LABEL[record.role] ?? 'Связанное место' : 'Связанное место';
    return typeof place.label === 'string' ? [`${prefix}${role}: ${place.label}`] : [];
  }
  if (record.kind === 'map-point' && typeof record.mapId === 'string' && typeof record.x === 'number' && typeof record.y === 'number') {
    const point = `${display(record.x)}, ${display(record.y)}`;
    const radius = typeof record.radius === 'number' ? ` · радиус ${display(record.radius)}` : '';
    const radiusY = typeof record.radiusY === 'number' ? ` · радиус Y ${display(record.radiusY)}` : '';
    return [`${prefix}Карта ${record.mapId}: ${point}${radius}${radiusY}`];
  }
  if (record.kind === 'place' && record.place && typeof record.place === 'object') {
    const place = record.place as { label?: unknown };
    const scale = typeof record.scale === 'string' ? display(record.scale, 'scale') : '';
    return typeof place.label === 'string' ? [`${prefix}${place.label}${scale ? ` · ${scale}` : ''}`] : [];
  }
  if (record.kind === 'plane' && record.plane && typeof record.plane === 'object') {
    const plane = record.plane as { label?: unknown };
    const field = record.field === 'homeplane' ? 'Домашний план' : record.field === 'realm' ? 'Обитель' : 'План';
    const edition = typeof record.edition === 'string' ? ` · ${record.edition}` : '';
    return typeof plane.label === 'string' ? [`${prefix}${field}: ${plane.label}${edition}`] : [];
  }
  if (record.kind === 'cell' && typeof record.x === 'number' && typeof record.y === 'number') {
    return [`${prefix}Клетка ${display(record.x)}, ${display(record.y)}`];
  }
  if (record.kind === 'settlement-plan') return [`${prefix}План поселения`];
  if (record.kind === 'geometry-ref') return [`${prefix}Геометрия места`];
  if (record.kind === 'world-time' && typeof record.value === 'number') return [`${prefix}${display(record.value)} сек. мира`];
  if (record.kind === 'canonical-date' && typeof record.value === 'string') return [`${prefix}${record.value}`];
  if (typeof record.current === 'number' && typeof record.label === 'string' && typeof record.id === 'string') {
    const maximum = typeof record.maximum === 'number' ? ` / ${display(record.maximum)}` : '';
    const quantity = typeof record.maximum === 'number' ? record.maximum : record.current;
    const unit = typeof record.unit === 'string' ? ` ${unitForCount(quantity, record.unit)}` : '';
    return [`${prefix}${record.label}: ${display(record.current)}${maximum}${unit}`];
  }
  if (record.at && typeof record.at === 'object' && record.text) {
    const at = (record.at as { value?: unknown }).value;
    const time = typeof at === 'number' ? `${display(at)} сек. мира` : '';
    const text = describe(record.text).join(', ');
    return [text ? `${prefix}${time ? `${time} · ` : ''}${text}` : ''].filter(Boolean);
  }
  if (record.kind === 'hit-points' && typeof record.current === 'number' && typeof record.max === 'number') {
    const temporary = typeof record.temporary === 'number' && record.temporary > 0 ? ` · временные ${display(record.temporary)}` : '';
    return [`${prefix}${display(record.current)} / ${display(record.max)}${temporary}`];
  }
  if ('value' in record && ['text', 'count', 'measure', 'boolean', 'world-time'].includes(String(record.kind))) {
    const rendered = display(record.value, key) || describe(record.value).join(', ');
    const unit = key === 'level' ? undefined : record.unit;
    const unitText = typeof unit === 'string'
      ? ` ${record.kind === 'count' && typeof record.value === 'number' ? unitForCount(record.value, unit) : unit}`
      : '';
    return rendered ? [`${prefix}${rendered}${unitText}`] : [];
  }
  if (typeof record.target === 'object' && record.target && 'label' in record.target) {
    const target = (record.target as { label?: unknown }).label;
    const relationKey = typeof record.relation === 'string' ? record.relation
      : typeof record.kind === 'string' ? record.kind : '';
    const relation = Object.hasOwn(RELATION_LABEL, relationKey)
      ? RELATION_LABEL[relationKey as keyof typeof RELATION_LABEL] : 'Связь';
    const relationValue = record.value && typeof record.value === 'object' && 'value' in record.value
      ? display((record.value as { value: unknown }).value) : '';
    if (typeof target === 'string') return [`${prefix}${relation}: ${target}${relationValue ? ` · ${relationValue}` : ''}`];
  }
  if (typeof record.name === 'string' && typeof record.at === 'object' && record.at) {
    const text = describe(record.text).join(', ');
    return [`${prefix}${record.name}${text ? ` · ${text}` : ''}`];
  }
  if (typeof record.label === 'string' && 'value' in record) {
    const rendered = describe(record.value).join(', ');
    return rendered ? [`${record.label}: ${rendered}`] : [];
  }
  if ('current' in record && ('maximum' in record || 'max' in record)) {
    const current = display(record.current); const maximum = display(record.maximum ?? record.max);
    const label = typeof record.label === 'string' ? `${record.label}: ` : prefix;
    return [`${label}${current}${maximum ? ` / ${maximum}` : ''}${typeof record.unit === 'string' ? ` ${record.unit}` : ''}`];
  }
  return Object.entries(record).flatMap(([childKey, child]) => META_KEYS.has(childKey) ? [] : describe(child, childKey));
}

interface Citation { title: string; edition?: string; page?: string; url?: string }
function citations(value: unknown, found = new Map<string, Citation>(), seen = new WeakSet<object>()): Citation[] {
  if (Array.isArray(value)) {
    if (seen.has(value)) return [...found.values()];
    seen.add(value);
    value.forEach(item => citations(item, found, seen));
  } else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    const record = value as Record<string, unknown>;
    const provenance = record.provenance;
    if (provenance && typeof provenance === 'object') {
      const provenanceRecord = provenance as Record<string, unknown>;
      const sources = [provenanceRecord.citation, ...(Array.isArray(provenanceRecord.citations) ? provenanceRecord.citations : [])];
      for (const citation of sources) if (citation && typeof citation === 'object') {
        const source = citation as Record<string, unknown>;
        if (typeof source.title === 'string' && source.title.trim()) {
          const item: Citation = {
            title: source.title,
            ...(typeof source.edition === 'string' ? { edition: source.edition } : {}),
            ...(typeof source.page === 'string' ? { page: source.page } : {}),
            ...(typeof source.url === 'string' && /^https?:\/\//i.test(source.url) ? { url: source.url } : {}),
          };
          found.set(`${item.title}|${item.edition ?? ''}|${item.page ?? ''}|${item.url ?? ''}`, item);
        }
      }
    }
    Object.entries(record).forEach(([key, child]) => { if (key !== 'provenance') citations(child, found, seen); });
  }
  return [...found.values()];
}

interface SubjectLink { ref: EntityRef; label: string }
function subjectLinks(value: unknown, found = new Map<string, SubjectLink>(), seen = new WeakSet<object>()): SubjectLink[] {
  if (Array.isArray(value)) {
    if (seen.has(value)) return [...found.values()];
    seen.add(value);
    value.forEach(item => subjectLinks(item, found, seen));
  } else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (record.kind === 'reference' && typeof record.value === 'string' && isEntityRef(record.value) && typeof record.label === 'string') {
      found.set(record.value, { ref: record.value, label: record.label });
    }
    Object.entries(record).forEach(([key, child]) => { if (key !== 'provenance') subjectLinks(child, found, seen); });
  }
  return [...found.values()];
}

function coreName(envelope: AnySubjectEnvelope): string {
  const core = envelope.slots.core;
  if (core.status !== 'present') return PROFILE_LABEL[envelope.profileId];
  const values = core.values as Record<string, unknown>;
  if (typeof values.name === 'string') return values.name;
  if (values.memberCount && typeof values.memberCount === 'object') {
    const count = (values.memberCount as { value?: unknown }).value;
    return `Группа · ${display(count) || 'число участников не указано'}`;
  }
  return PROFILE_LABEL[envelope.profileId];
}

function slotValues(envelope: AnySubjectEnvelope, id: SubjectSlotId): unknown {
  const slot = envelope.slots[id as keyof typeof envelope.slots];
  return slot?.status === 'present' ? slot.values : undefined;
}

function ValueList({ value }: { value: unknown }) {
  const openEntity = useOpenEntity();
  const links = subjectLinks(value);
  const longReferenceList = openEntity && Array.isArray(value) && value.length > 12
    && value.every(row => row && typeof row === 'object' && 'target' in row)
    && links.length >= value.length;
  const lines = longReferenceList ? [] : describe(value);
  if (!lines.length && !links.length) return null;
  return <>
    {lines.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">{lines.map((line, index) => <li key={`${index}:${line}`} className="type-body-md text-tx break-words">{line}</li>)}</ul> : null}
    {openEntity && links.length ? <details className="mt-2 type-body-sm text-t2" data-part="subject-references">
      <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Связанные субъекты · {links.length}</summary>
      <ul className="mt-1 flex list-none flex-wrap gap-1 p-0">{links.map(link => <li key={link.ref}>
        <button type="button" className="px-1.5 py-1 bg-cd text-gd underline underline-offset-2 hover:text-gd-hi focus-visible:shadow-[var(--glow-gold)]" title={`Открыть карточку: ${link.label}`} onClick={() => openEntity(link.ref)}>{link.label}</button>
      </li>)}</ul>
    </details> : null}
  </>;
}

/** Read-only shared profile shell. It renders only present, applicable slots from an audience-safe envelope. */
export function SubjectProfileShell({ envelope }: { envelope: AnySubjectEnvelope }) {
  const issues = validateSubjectEnvelope(envelope);
  if (issues.length) return <section role="alert" className="border border-fx-debuff bg-cd p-4 text-tx">Профиль субъекта не прошёл проверку контракта.</section>;

  const specs = subjectProfileSlotSpecs(envelope.profileId, envelope.audience);
  const visible = specs.filter(spec => spec.id !== 'core' && spec.applicability === 'applicable' && slotValues(envelope, spec.id) !== undefined);
  const core = slotValues(envelope, 'core') as Record<string, unknown>;
  const coreDetails = Object.fromEntries(Object.entries(core).filter(([key]) => !['name', 'ref', 'referenceRef', 'campaignRef'].includes(key)));
  const heading: ReactNode = Object.keys(coreDetails).length ? <ValueList value={coreDetails}/> : null;
  const profileLabel = envelope.profileId === 'city' && typeof core.scale === 'string' && core.scale !== 'settlement'
    ? SCALE_LABELS[core.scale as keyof typeof SCALE_LABELS] ?? PROFILE_LABEL.city
    : PROFILE_LABEL[envelope.profileId];
  const organizationArt = envelope.profileId === 'organization' ? ORGANIZATION_ART[envelope.subjectId] : undefined;

  return <section className="flex h-full min-h-0 flex-col border border-br bg-pn text-tx shadow-bevel" data-subject-profile={envelope.profileId} data-subject-audience={envelope.audience}>
    <header className="flex flex-none items-center justify-between gap-3 border-b border-br bg-linear-to-b from-pl to-cd p-4">
      <div className="flex min-w-0 items-center gap-3">{organizationArt ? <SemanticMark asset={organizationArt} icon="ent-faction" title={coreName(envelope)} size={32} /> : null}<div className="min-w-0"><p className="type-key uppercase text-t2">{profileLabel}</p><h2 className="type-h-24 m-0 truncate text-tx">{coreName(envelope)}</h2></div></div>
      <span className="type-key shrink-0 uppercase text-t2">{envelope.audience === 'dm' ? 'Мастер' : 'Игроки'}</span>
    </header>
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {heading}
      <div className="flex flex-col gap-4">
        {visible.map(spec => <section key={spec.id} data-slot={spec.id} aria-labelledby={`subject-slot-${spec.id}`} className="border-b border-br/50 pb-3 last:border-0">
          <h3 id={`subject-slot-${spec.id}`} className="type-key mb-2 uppercase text-gd">{spec.label}</h3>
          <ValueList value={slotValues(envelope, spec.id)}/>
          {citations(slotValues(envelope, spec.id)).length ? <p className="type-body-sm mt-2 text-t2">
            Источник: {citations(slotValues(envelope, spec.id)).map((source, index) => <span key={`${source.title}:${index}`}>
              {index ? ' · ' : ''}{source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{source.title}</a> : source.title}
              {source.edition ? `, ${source.edition}` : ''}{source.page ? `, с. ${source.page}` : ''}
            </span>)}
          </p> : null}
        </section>)}
      </div>
      {visible.length === 0 ? <p className="type-body-sm text-t2">Для этого профиля пока нет заполненных дополнительных блоков.</p> : null}
    </div>
  </section>;
}
