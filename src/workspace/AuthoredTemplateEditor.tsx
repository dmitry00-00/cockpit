import { useState, type FormEvent } from 'react';
import { AUTHOR_LINK_TARGETS, AUTHOR_TEMPLATE_VERSION, type AuthoredTemplate, type AuthorTemplateKind, type AuthoringLink, type AuthoringProvenance } from './packageDraft';
import { BTN } from '../pages/desk/styles';

const FIELD = 'w-full min-w-0 bg-wl shadow-bevel-in text-tx type-body-sm px-2 py-1';
const KIND_LABEL: Record<AuthorTemplateKind, string> = {
  location: 'Место', person: 'Персонаж', path: 'Путь', terrain: 'Местность', event: 'Хронология', rumor: 'Слух', scene: 'Сцена',
};
const RELATION_LABEL: Record<string, string> = {
  contains: 'содержит', within: 'внутри', on: 'на', 'associated-place': 'связан с местом', at: 'находится у', participant: 'участвует',
  route: 'по пути', 'after-scene': 'после сцены', about: 'о', 'heard-at': 'услышан в',
};

interface ProvenanceForm {
  kind: 'author' | 'package' | 'source'; ref: string; version: string; nodeId: string; citation: string; pages: string;
}
interface TemplateForm {
  id: string; kind: AuthorTemplateKind; name: string; summary: string; audience: 'dm' | 'players';
  provenance: ProvenanceForm[]; links: AuthoringLink[];
  category: string; subtype: string; role: string; mode: 'road' | 'rail' | 'sea' | 'air' | 'other'; fromId: string; viaIds: string; toId: string;
  biome: string; landform: string; surface: string; areaEnabled: boolean; areaMapId: string; areaGeometryId: string; areaSource: string;
  mapPointEnabled: boolean; mapId: string; mapKey: string; mapX: string; mapY: string; coordinateSpace: 'source-pixel' | 'map-unit'; mapSource: string;
  statement: string; claim: string; rumorStatus: 'unverified' | 'confirmed' | 'disproved'; trigger: string; procedure: string;
  timeKind: 'not-specified' | 'unknown' | 'absolute' | 'relative'; calendarId: string; year: string; month: string; day: string; precision: 'year' | 'month' | 'day';
  timeRelation: 'before' | 'after' | 'during'; anchorId: string; offsetValue: string; offsetUnit: 'day' | 'month' | 'year';
}

function provenanceForm(value: AuthoringProvenance): ProvenanceForm {
  return { kind: value.kind, ref: value.ref, version: value.kind === 'package' ? value.version : '', nodeId: value.kind === 'package' ? value.nodeId : '', citation: value.kind === 'source' ? value.citation ?? '' : '', pages: value.kind === 'source' ? value.pages?.join(', ') ?? '' : '' };
}

function timeFields(time: { kind: string; calendarId?: string; year?: number; month?: number; day?: number; precision?: 'year' | 'month' | 'day'; relation?: 'before' | 'after' | 'during'; anchorId?: string; offset?: { value: number; unit: 'day' | 'month' | 'year' } } | undefined) {
  return {
    timeKind: (time?.kind ?? 'not-specified') as TemplateForm['timeKind'], calendarId: time?.calendarId ?? '', year: time?.year === undefined ? '' : String(time.year),
    month: time?.month === undefined ? '' : String(time.month), day: time?.day === undefined ? '' : String(time.day), precision: time?.precision ?? 'day',
    timeRelation: time?.relation ?? 'after', anchorId: time?.anchorId ?? '', offsetValue: time?.offset ? String(time.offset.value) : '', offsetUnit: time?.offset?.unit ?? 'day',
  };
}

function formFromTemplate(template: AuthoredTemplate): TemplateForm {
  const data = template.data as Record<string, any>;
  const time = template.kind === 'event' ? template.data.time : template.kind === 'scene' ? template.time : undefined;
  const point = data.mapPoint;
  const area = data.areaRef;
  return {
    id: template.id, kind: template.kind, name: template.name, summary: template.summary, audience: template.audience,
    provenance: template.provenance.map(provenanceForm), links: template.links.map(link => ({ ...link })),
    category: data.category ?? '', subtype: data.subtype ?? '', role: data.role ?? '', mode: data.mode ?? 'road',
    fromId: data.topology?.fromId ?? '', viaIds: data.topology?.viaIds?.join(', ') ?? '', toId: data.topology?.toId ?? '',
    biome: data.biome ?? '', landform: data.landform ?? '', surface: data.surface ?? '', areaEnabled: !!area, areaMapId: area?.mapId ?? '', areaGeometryId: area?.geometryId ?? '', areaSource: area?.source ?? '',
    mapPointEnabled: !!point, mapId: point?.mapId ?? '', mapKey: point?.key ?? '', mapX: point ? String(point.point.x) : '', mapY: point ? String(point.point.y) : '', coordinateSpace: point?.coordinateSpace ?? 'source-pixel', mapSource: point?.source ?? '',
    statement: data.statement ?? '', claim: data.claim ?? '', rumorStatus: data.status ?? 'unverified', trigger: data.trigger ?? '', procedure: data.procedure ?? '',
    ...timeFields(time),
  };
}

export function newAuthoredTemplate(kind: AuthorTemplateKind): AuthoredTemplate {
  const id = `template-${crypto.randomUUID().replaceAll('-', '')}`;
  const common = { id, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, name: '', summary: '', audience: 'dm' as const, provenance: [{ kind: 'author' as const, ref: 'author-draft' }], links: [] };
  switch (kind) {
    case 'location': return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: {} };
    case 'person': return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: {} };
    case 'path': return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: { mode: 'road', topology: { fromId: '', viaIds: [], toId: '' } } };
    case 'terrain': return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: {} };
    case 'event': return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: { time: { kind: 'unknown' } } };
    case 'rumor': return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: { status: 'unverified' } };
    case 'scene': return { ...common, kind, template: { id: kind, version: AUTHOR_TEMPLATE_VERSION }, data: {} };
  }
}

function buildTime(form: TemplateForm) {
  if (form.timeKind === 'not-specified') return undefined;
  if (form.timeKind === 'unknown') return { kind: 'unknown' as const };
  if (form.timeKind === 'relative') return {
    kind: 'relative' as const, relation: form.timeRelation, anchorId: form.anchorId,
    ...(form.offsetValue.trim() ? { offset: { value: Number(form.offsetValue), unit: form.offsetUnit } } : {}),
  };
  return {
    kind: 'absolute' as const, calendarId: form.calendarId, year: Number(form.year), precision: form.precision,
    ...(form.precision !== 'year' ? { month: Number(form.month) } : {}), ...(form.precision === 'day' ? { day: Number(form.day) } : {}),
  };
}

function buildProvenance(forms: ProvenanceForm[]): AuthoringProvenance[] {
  return forms.map(item => {
    if (item.kind === 'package') return { kind: 'package', ref: item.ref, version: item.version, nodeId: item.nodeId };
    if (item.kind === 'source') {
      const pages = item.pages.trim() ? item.pages.split(',').map(page => Number(page.trim())) : undefined;
      return { kind: 'source', ref: item.ref, ...(item.citation.trim() ? { citation: item.citation } : {}), ...(pages ? { pages } : {}) };
    }
    return { kind: 'author', ref: item.ref };
  });
}

function buildTemplate(form: TemplateForm): AuthoredTemplate {
  const base = { id: form.id, kind: form.kind, template: { id: form.kind, version: AUTHOR_TEMPLATE_VERSION }, name: form.name, summary: form.summary, audience: form.audience, provenance: buildProvenance(form.provenance), links: form.links };
  const optional = (key: string, value: string) => value.trim() ? { [key]: value.trim() } : {};
  const time = buildTime(form);
  switch (form.kind) {
    case 'location': return { ...base, kind: form.kind, template: { id: form.kind, version: AUTHOR_TEMPLATE_VERSION }, data: {
      ...optional('category', form.category), ...optional('subtype', form.subtype),
      ...(form.mapPointEnabled ? { mapPoint: { mapId: form.mapId, key: form.mapKey, point: { x: Number(form.mapX), y: Number(form.mapY) }, coordinateSpace: form.coordinateSpace, source: form.mapSource } } : {}),
    } } as AuthoredTemplate;
    case 'person': return { ...base, kind: form.kind, template: { id: form.kind, version: AUTHOR_TEMPLATE_VERSION }, data: { ...optional('role', form.role) } } as AuthoredTemplate;
    case 'path': return { ...base, kind: form.kind, template: { id: form.kind, version: AUTHOR_TEMPLATE_VERSION }, data: { mode: form.mode, topology: { fromId: form.fromId, viaIds: form.viaIds.split(',').map(id => id.trim()).filter(Boolean), toId: form.toId } } } as AuthoredTemplate;
    case 'terrain': return { ...base, kind: form.kind, template: { id: form.kind, version: AUTHOR_TEMPLATE_VERSION }, data: {
      ...optional('biome', form.biome), ...optional('landform', form.landform), ...optional('surface', form.surface),
      ...(form.areaEnabled ? { areaRef: { mapId: form.areaMapId, geometryId: form.areaGeometryId, source: form.areaSource } } : {}),
    } } as AuthoredTemplate;
    case 'event': return { ...base, kind: form.kind, template: { id: form.kind, version: AUTHOR_TEMPLATE_VERSION }, data: { ...optional('statement', form.statement), time: time ?? { kind: 'unknown' } } } as AuthoredTemplate;
    case 'rumor': return { ...base, kind: form.kind, template: { id: form.kind, version: AUTHOR_TEMPLATE_VERSION }, data: { ...optional('claim', form.claim), status: form.rumorStatus } } as AuthoredTemplate;
    case 'scene': return { ...base, kind: form.kind, template: { id: form.kind, version: AUTHOR_TEMPLATE_VERSION }, data: { ...optional('trigger', form.trigger), ...optional('procedure', form.procedure) }, ...(time ? { time } : {}) } as AuthoredTemplate;
  }
}

export function AuthoredTemplateEditor({ initial, templates, idLocked = false, onSave, onCancel }: {
  initial: AuthoredTemplate; templates: readonly AuthoredTemplate[]; idLocked?: boolean; onSave: (template: AuthoredTemplate) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState(() => formFromTemplate(initial));
  const update = (patch: Partial<TemplateForm>) => setForm(current => ({ ...current, ...patch }));
  const relationOptions = Object.keys(AUTHOR_LINK_TARGETS[form.kind]);
  const locationIds = templates.filter(template => template.kind === 'location').map(template => template.id);
  const timeAnchors = templates.filter(template => template.kind === 'event' || template.kind === 'scene').map(template => template.id);
  const setLink = (index: number, patch: Partial<AuthoringLink>) => update({ links: form.links.map((link, at) => at === index ? { ...link, ...patch } : link) });
  const setProvenance = (index: number, patch: Partial<ProvenanceForm>) => update({ provenance: form.provenance.map((item, at) => at === index ? { ...item, ...patch } : item) });
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(buildTemplate(form)); };
  const timeField = <fieldset className="grid gap-2 border p-2"><legend>Время</legend>
    <label>Сведения о времени<select className={FIELD} value={form.timeKind} onChange={event => update({ timeKind: event.target.value as TemplateForm['timeKind'] })}>
      {form.kind === 'scene' ? <option value="not-specified">Не задано</option> : null}<option value="unknown">Неизвестно</option><option value="absolute">Абсолютная дата</option><option value="relative">Относительно сцены или события</option>
    </select></label>
    {form.timeKind === 'absolute' ? <><label>Календарь ID<input className={FIELD} value={form.calendarId} onChange={event => update({ calendarId: event.target.value })}/></label><label>Год<input className={FIELD} inputMode="numeric" value={form.year} onChange={event => update({ year: event.target.value })}/></label><label>Точность<select className={FIELD} value={form.precision} onChange={event => update({ precision: event.target.value as TemplateForm['precision'] })}><option value="year">Год</option><option value="month">Месяц</option><option value="day">День</option></select></label>{form.precision !== 'year' ? <label>Месяц<input className={FIELD} inputMode="numeric" value={form.month} onChange={event => update({ month: event.target.value })}/></label> : null}{form.precision === 'day' ? <label>День<input className={FIELD} inputMode="numeric" value={form.day} onChange={event => update({ day: event.target.value })}/></label> : null}</> : null}
    {form.timeKind === 'relative' ? <><label>Отношение<select className={FIELD} value={form.timeRelation} onChange={event => update({ timeRelation: event.target.value as TemplateForm['timeRelation'] })}><option value="before">До</option><option value="after">После</option><option value="during">Во время</option></select></label><label>Якорь · ID сцены или события<input className={FIELD} list="template-time-anchor-options" value={form.anchorId} onChange={event => update({ anchorId: event.target.value })} placeholder="Оставьте пустым, если якорь пока неизвестен"/><datalist id="template-time-anchor-options">{timeAnchors.map(id => <option key={id} value={id}/>)}</datalist></label><div className="grid grid-cols-2 gap-2"><label>Смещение<input className={FIELD} inputMode="numeric" value={form.offsetValue} onChange={event => update({ offsetValue: event.target.value })}/></label><label>Единица<select className={FIELD} value={form.offsetUnit} onChange={event => update({ offsetUnit: event.target.value as TemplateForm['offsetUnit'] })}><option value="day">День</option><option value="month">Месяц</option><option value="year">Год</option></select></label></div></> : null}
    {form.timeKind === 'relative' && !timeAnchors.length ? <p role="note">Добавьте сцену или событие в черновик, чтобы выбрать действительный якорь даты.</p> : null}
  </fieldset>;

  return <form className="grid gap-2 bg-wl p-3" aria-label="Шаблон авторского пакета" onSubmit={submit}>
    <h4>{KIND_LABEL[form.kind]} · шаблон {AUTHOR_TEMPLATE_VERSION}</h4>
    <label>Стабильный ID<input required readOnly={idLocked} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={FIELD} value={form.id} onChange={event => update({ id: event.target.value })}/></label>
    <label>Тип шаблона<input className={FIELD} readOnly value={KIND_LABEL[form.kind]}/></label>
    <label>Название<input required maxLength={200} className={FIELD} value={form.name} onChange={event => update({ name: event.target.value })}/></label>
    <label>Краткое описание<input required maxLength={4000} className={FIELD} value={form.summary} onChange={event => update({ summary: event.target.value })}/></label>
    <label>Аудитория<select className={FIELD} value={form.audience} onChange={event => update({ audience: event.target.value as TemplateForm['audience'] })}><option value="dm">Только мастеру</option><option value="players">Игрокам</option></select></label>

    <fieldset className="grid gap-2 border p-2"><legend>Происхождение · сохраняйте источник, если он известен</legend>
      {form.provenance.map((item, index) => <fieldset key={index} className="grid gap-2 border p-2"><legend>Источник {index + 1}</legend>
        <label>Тип происхождения<select className={FIELD} value={item.kind} onChange={event => setProvenance(index, { kind: event.target.value as ProvenanceForm['kind'] })}><option value="author">Авторский материал</option><option value="package">Запись пакета</option><option value="source">Внешний источник</option></select></label>
        <label>{item.kind === 'author' ? 'Ссылка на авторскую заметку' : item.kind === 'package' ? 'ID пакета' : 'Источник'}<input required className={FIELD} value={item.ref} onChange={event => setProvenance(index, { ref: event.target.value })}/></label>
        {item.kind === 'package' ? <><label>Версия пакета<input required className={FIELD} placeholder="1.0.0" value={item.version} onChange={event => setProvenance(index, { version: event.target.value })}/></label><label>ID исходной записи<input required className={FIELD} value={item.nodeId} onChange={event => setProvenance(index, { nodeId: event.target.value })}/></label></> : null}
        {item.kind === 'source' ? <><label>Цитирование<input className={FIELD} value={item.citation} onChange={event => setProvenance(index, { citation: event.target.value })}/></label><label>Страницы · номера через запятую<input className={FIELD} value={item.pages} onChange={event => setProvenance(index, { pages: event.target.value })}/></label></> : null}
        {form.provenance.length > 1 ? <button className={BTN} type="button" onClick={() => update({ provenance: form.provenance.filter((_, at) => at !== index) })}>Убрать источник {index + 1}</button> : null}
      </fieldset>)}
      <button className={BTN} type="button" onClick={() => update({ provenance: [...form.provenance, { kind: 'author', ref: 'author-draft', version: '', nodeId: '', citation: '', pages: '' }] })}>Добавить происхождение</button>
    </fieldset>

    <fieldset className="grid gap-2 border p-2"><legend>Связи с шаблонами черновика</legend>
      {relationOptions.length ? form.links.map((link, index) => {
        const kinds = AUTHOR_LINK_TARGETS[form.kind][link.relation] ?? [];
        const targets = templates.filter(template => kinds.includes(template.kind));
        return <div key={`${index}-${link.relation}`} className="grid gap-2 border p-2"><label>Связь<select className={FIELD} value={link.relation} onChange={event => setLink(index, { relation: event.target.value, target: '' })}>{relationOptions.map(relation => <option key={relation} value={relation}>{RELATION_LABEL[relation] ?? relation}</option>)}</select></label><label>Целевая запись · стабильный ID<input required className={FIELD} list={`template-link-target-${index}`} value={link.target} onChange={event => setLink(index, { target: event.target.value })}/><datalist id={`template-link-target-${index}`}>{targets.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</datalist></label>{!targets.length ? <p>Создайте подходящую запись этого типа; допустимые связи проверяются при внесении.</p> : null}<button className={BTN} type="button" onClick={() => update({ links: form.links.filter((_, at) => at !== index) })}>Убрать связь</button></div>;
      }) : <p>Для пути связи задаются топологией.</p>}
      {relationOptions.length ? <button className={BTN} type="button" onClick={() => update({ links: [...form.links, { relation: relationOptions[0], target: '' }] })}>Добавить связь</button> : null}
    </fieldset>

    {form.kind === 'location' ? <fieldset className="grid gap-2 border p-2"><legend>Сведения о месте</legend><label>Категория<input className={FIELD} placeholder="Неизвестно — можно оставить пустым" value={form.category} onChange={event => update({ category: event.target.value })}/></label><label>Подтип<input className={FIELD} placeholder="Неизвестно — можно оставить пустым" value={form.subtype} onChange={event => update({ subtype: event.target.value })}/></label><label><input type="checkbox" checked={form.mapPointEnabled} onChange={event => update({ mapPointEnabled: event.target.checked })}/> Есть подтверждённая точка карты</label>{form.mapPointEnabled ? <><label>Карта ID<input required className={FIELD} value={form.mapId} onChange={event => update({ mapId: event.target.value })}/></label><label>Ключ точки<input required className={FIELD} value={form.mapKey} onChange={event => update({ mapKey: event.target.value })}/></label><div className="grid grid-cols-2 gap-2"><label>X<input required type="number" min="0" step="any" className={FIELD} value={form.mapX} onChange={event => update({ mapX: event.target.value })}/></label><label>Y<input required type="number" min="0" step="any" className={FIELD} value={form.mapY} onChange={event => update({ mapY: event.target.value })}/></label></div><label>Система координат<select className={FIELD} value={form.coordinateSpace} onChange={event => update({ coordinateSpace: event.target.value as TemplateForm['coordinateSpace'] })}><option value="source-pixel">Пиксель источника</option><option value="map-unit">Единица карты</option></select></label><label>Источник точки<input required className={FIELD} value={form.mapSource} onChange={event => update({ mapSource: event.target.value })}/></label></> : null}</fieldset> : null}

    {form.kind === 'person' ? <fieldset className="grid gap-2 border p-2"><legend>Сведения о персонаже</legend><label>Роль<input className={FIELD} placeholder="Неизвестно — можно оставить пустым" value={form.role} onChange={event => update({ role: event.target.value })}/></label></fieldset> : null}

    {form.kind === 'path' ? <fieldset className="grid gap-2 border p-2"><legend>Топология пути · ID мест из черновика</legend><label>Режим<select className={FIELD} value={form.mode} onChange={event => update({ mode: event.target.value as TemplateForm['mode'] })}>{[['road','Дорога'],['rail','Железная дорога'],['sea','Море'],['air','Воздух'],['other','Другой']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Начало<input required className={FIELD} list="template-location-options" value={form.fromId} onChange={event => update({ fromId: event.target.value })}/></label><label>Промежуточные места · ID через запятую<input className={FIELD} value={form.viaIds} onChange={event => update({ viaIds: event.target.value })}/></label><label>Конец<input required className={FIELD} list="template-location-options" value={form.toId} onChange={event => update({ toId: event.target.value })}/></label><datalist id="template-location-options">{locationIds.map(id => <option key={id} value={id}/>)}</datalist>{!locationIds.length ? <p>Добавьте места в этот пакет: узлы пути должны ссылаться на существующие шаблоны мест.</p> : null}</fieldset> : null}

    {form.kind === 'terrain' ? <fieldset className="grid gap-2 border p-2"><legend>Сведения о местности · пустые поля означают, что это ещё неизвестно</legend><label>Биом<input className={FIELD} placeholder="Можно оставить пустым или указать unknown" value={form.biome} onChange={event => update({ biome: event.target.value })}/></label><label>Форма рельефа<input className={FIELD} placeholder="Можно оставить пустым или указать unknown" value={form.landform} onChange={event => update({ landform: event.target.value })}/></label><label>Поверхность<input className={FIELD} placeholder="Можно оставить пустым или указать unknown" value={form.surface} onChange={event => update({ surface: event.target.value })}/></label><label><input type="checkbox" checked={form.areaEnabled} onChange={event => update({ areaEnabled: event.target.checked })}/> Есть подтверждённая область карты</label>{form.areaEnabled ? <><label>Карта ID<input required className={FIELD} value={form.areaMapId} onChange={event => update({ areaMapId: event.target.value })}/></label><label>Геометрия ID<input required className={FIELD} value={form.areaGeometryId} onChange={event => update({ areaGeometryId: event.target.value })}/></label><label>Источник геометрии<input required className={FIELD} value={form.areaSource} onChange={event => update({ areaSource: event.target.value })}/></label></> : null}</fieldset> : null}

    {form.kind === 'event' ? <><label>Запись хронологии<textarea className={FIELD} rows={3} placeholder="Неизвестно — можно оставить пустым" value={form.statement} onChange={event => update({ statement: event.target.value })}/></label>{timeField}</> : null}
    {form.kind === 'rumor' ? <fieldset className="grid gap-2 border p-2"><legend>Слух</legend><label>Утверждение<textarea className={FIELD} rows={3} placeholder="Неизвестно — можно оставить пустым" value={form.claim} onChange={event => update({ claim: event.target.value })}/></label><label>Статус<select className={FIELD} value={form.rumorStatus} onChange={event => update({ rumorStatus: event.target.value as TemplateForm['rumorStatus'] })}><option value="unverified">Не проверен</option><option value="confirmed">Подтверждён</option><option value="disproved">Опровергнут</option></select></label></fieldset> : null}
    {form.kind === 'scene' ? <><label>Условие запуска<textarea className={FIELD} rows={2} placeholder="Неизвестно — можно оставить пустым" value={form.trigger} onChange={event => update({ trigger: event.target.value })}/></label><label>Порядок сцены<textarea className={FIELD} rows={3} placeholder="Неизвестно — можно оставить пустым" value={form.procedure} onChange={event => update({ procedure: event.target.value })}/></label>{timeField}</> : null}

    <div className="flex flex-wrap gap-2"><button className={BTN} type="submit">Внести шаблон в черновик</button><button className={BTN} type="button" onClick={onCancel}>Отмена шаблона</button></div>
  </form>;
}
