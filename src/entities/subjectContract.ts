import { parseRef, type EntityKind, type EntityRef } from './ref';
import type { ScaleLevel } from '../engine/events';

/** Versioned, read-only projection contract. It is deliberately separate from campaign State/events. */
export const SUBJECT_CONTRACT_VERSION = 1 as const;

export const SUBJECT_SLOT_IDS = [
  'core', 'indicators', 'characteristics', 'resources', 'conditions', 'capabilities',
  'composition', 'relations', 'position', 'history', 'knowledge', 'secrets',
] as const;

export type SubjectSlotId = (typeof SUBJECT_SLOT_IDS)[number];
export type SubjectProfileId = 'character' | 'deity' | 'party' | 'organization' | 'city' | 'kingdom';
export type SubjectAudience = 'dm' | 'players';
export type SubjectDataLayer = 'reference' | 'event-state' | 'derived';
export type SubjectVisibility = 'public' | 'players' | 'dm';
export type SubjectRendererId =
  | 'identity' | 'metric-strip' | 'typed-facts' | 'resource-list' | 'condition-list'
  | 'capability-list' | 'membership-list' | 'relation-list' | 'position-view'
  | 'event-timeline' | 'knowledge-list' | 'dm-secret-list' | 'hidden';
export type SubjectValueKind =
  | 'identity' | 'profile-indicators' | 'profile-facts' | 'resource[]' | 'condition[]'
  | 'reference[]' | 'relation[]' | 'position[]' | 'timeline[]' | 'knowledge[]' | 'secret[]';

export interface SubjectCitation {
  title: string;
  edition?: string;
  page?: string;
  url?: string;
  license?: string;
}

export interface SubjectProvenance {
  layer: SubjectDataLayer;
  /** Stable source key, event/patch id, or derived formula id. Not a citation. */
  sourceId: string;
  citation?: SubjectCitation;
  /** Additional sources for a value that has both a primary source page and cited references. */
  citations?: readonly SubjectCitation[];
}

export interface SubjectValue<TKind extends string, TValue> {
  kind: TKind;
  value: TValue;
  unit?: string;
  provenance: SubjectProvenance;
  visibility: SubjectVisibility;
}

export type SubjectSlotState<T> =
  | { status: 'present'; values: T }
  | { status: 'empty' }
  | { status: 'not-applicable' };

export type SubjectReference = SubjectValue<'reference', EntityRef> & { label: string };
export type SubjectText = SubjectValue<'text', string>;
export type SubjectCount = SubjectValue<'count', number> & { unit: string };
export type SubjectMeasure = SubjectValue<'measure', number> & { unit: string };
export type SubjectHp = {
  kind: 'hit-points'; current: number; max: number; temporary: number;
  provenance: SubjectProvenance; visibility: SubjectVisibility;
};
export type SubjectResource = {
  id: string; label: string; current: number; maximum?: number; unit: string;
  provenance: SubjectProvenance; visibility: SubjectVisibility;
};
export type SubjectCondition = {
  id: string; label: string; level?: number; expiresAtWorldSec?: number;
  provenance: SubjectProvenance; visibility: SubjectVisibility;
};
export const SUBJECT_COMPOSITION_RELATIONS = [
  'party-member', 'pantheon-membership', 'organization-membership', 'resident',
  'organization', 'child-place', 'territory-place', 'within',
] as const;
export type SubjectCompositionRelation = (typeof SUBJECT_COMPOSITION_RELATIONS)[number];
export type SubjectCompositionMember = {
  relation: SubjectCompositionRelation;
  target: SubjectReference;
  order?: number;
  /** `category-ever-member` means the source category does not prove current membership. */
  certainty?: 'category-ever-member';
  provenance: SubjectProvenance;
  visibility: SubjectVisibility;
};
export const SUBJECT_RELATION_KINDS = [
  'worships', 'religion', 'serves', 'servedby', 'aspect', 'ally', 'enemy', 'dedicated-to', 'associated-with', 'predecessor', 'successor', 'campaign-relation',
] as const;
export type SubjectRelationKind = (typeof SUBJECT_RELATION_KINDS)[number];
const RELATION_TARGET_KINDS: Readonly<Record<SubjectRelationKind, readonly EntityKind[]>> = {
  worships: ['deity'], religion: ['deity'], serves: ['deity'], servedby: ['deity'], aspect: ['deity'],
  ally: ['organization', 'kingdom'], enemy: ['organization', 'kingdom'], 'dedicated-to': ['deity'],
  'associated-with': ['deity'], predecessor: ['kingdom'], successor: ['kingdom'], 'campaign-relation': ['faction'],
};
export type SubjectRelation = {
  kind: SubjectRelationKind; direction: 'outgoing' | 'incoming' | 'symmetric'; target: SubjectReference;
  value?: SubjectText; provenance: SubjectProvenance; visibility: SubjectVisibility;
};
export type SubjectPosition =
  | { kind: 'cell'; spaceId: string; x: number; y: number; provenance: SubjectProvenance; visibility: SubjectVisibility }
  | { kind: 'place'; place: SubjectReference; scale: ScaleLevel; provenance: SubjectProvenance; visibility: SubjectVisibility }
  | { kind: 'linked-place'; place: SubjectReference; role: 'parent' | 'base' | 'associated' | 'capital' | 'represented'; provenance: SubjectProvenance; visibility: SubjectVisibility }
  | { kind: 'map-point'; mapId: string; x: number; y: number; radius?: number; radiusY?: number; provenance: SubjectProvenance; visibility: SubjectVisibility }
  | { kind: 'plane'; plane: SubjectReference; field: 'homeplane' | 'realm'; edition: string; provenance: SubjectProvenance; visibility: SubjectVisibility }
  | { kind: 'settlement-plan'; locationId: string; mapId: string; provenance: SubjectProvenance; visibility: SubjectVisibility }
  | { kind: 'geometry-ref'; mapId: string; geometryId: string; provenance: SubjectProvenance; visibility: SubjectVisibility };
export type SubjectTimelineDate = SubjectValue<'world-time', number> | SubjectValue<'canonical-date', string>;
export type SubjectTimelineEntry = { at: SubjectTimelineDate; text: SubjectText; ref?: SubjectReference };
export type SubjectKnowledge = { factId: string; label: string; value: SubjectText; audience: 'players' | 'dm' };
export type SubjectSecret = { id: string; label: string; value: SubjectText; audience: 'dm' };

type AbilityId = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export interface CharacterSubjectSlots {
  core: { name: string; actorKind: 'pc' | 'npc' | 'monster'; ref: SubjectReference };
  indicators?: { hp?: SubjectHp; ac?: SubjectMeasure; passivePerception?: SubjectMeasure };
  characteristics?: { abilities?: Partial<Record<AbilityId, number>>; skills?: readonly SubjectReference[]; class?: SubjectReference; level?: SubjectCount };
  resources?: readonly SubjectResource[];
  conditions?: readonly SubjectCondition[];
  capabilities?: readonly SubjectReference[];
  relations?: readonly SubjectRelation[];
  position?: readonly SubjectPosition[];
  history?: readonly SubjectTimelineEntry[];
  knowledge?: readonly SubjectKnowledge[];
  secrets?: readonly SubjectSecret[];
}
export interface DeitySubjectSlots {
  core: { name: string; ref: SubjectReference };
  indicators?: { powerRank?: SubjectText; aliveStatus?: SubjectText };
  characteristics?: { alignment?: SubjectText; portfolio?: SubjectText; domains?: readonly SubjectText[]; symbol?: SubjectText };
  capabilities?: { worshippers?: SubjectText; holyDays?: SubjectText };
  composition?: readonly SubjectCompositionMember[];
  relations?: readonly SubjectRelation[];
  position?: readonly SubjectPosition[];
  history?: readonly SubjectTimelineEntry[];
  knowledge?: readonly SubjectKnowledge[];
  secrets?: readonly SubjectSecret[];
}
export interface PartySubjectSlots {
  core: { memberCount: SubjectCount };
  indicators?: { supply?: SubjectMeasure; sharedLocation?: SubjectReference | { kind: 'mixed' } };
  resources?: readonly SubjectResource[];
  composition: readonly SubjectCompositionMember[];
  relations?: readonly SubjectRelation[];
  position?: readonly SubjectPosition[];
  history?: readonly SubjectTimelineEntry[];
  knowledge?: readonly SubjectKnowledge[];
  secrets?: readonly SubjectSecret[];
}
export interface OrganizationSubjectSlots {
  core: { name: string; referenceRef?: SubjectReference; campaignRef?: SubjectReference };
  indicators?: { renown?: SubjectCount; standing?: SubjectCount; influence?: SubjectMeasure; trend?: SubjectMeasure };
  characteristics?: {
    type?: SubjectText; base?: SubjectText; leaders?: readonly SubjectReference[]; leaderNames?: readonly SubjectText[]; founded?: SubjectCount; dissolved?: SubjectCount;
    alignment?: SubjectText; races?: SubjectText; symbol?: SubjectText; members?: SubjectText;
    church?: SubjectValue<'boolean', boolean>;
  };
  composition?: readonly SubjectCompositionMember[];
  relations?: readonly SubjectRelation[];
  position?: readonly SubjectPosition[];
  history?: readonly SubjectTimelineEntry[];
  knowledge?: readonly SubjectKnowledge[];
  secrets?: readonly SubjectSecret[];
}
export interface CitySubjectSlots {
  core: { name: string; scale: ScaleLevel; referenceRef?: SubjectReference; campaignRef?: SubjectReference };
  indicators?: { revealed?: SubjectValue<'boolean', boolean>; danger?: SubjectText; haven?: SubjectValue<'boolean', boolean>; marketIndex?: SubjectMeasure };
  characteristics?: { population?: SubjectText | SubjectCount; government?: SubjectText; faith?: SubjectText; type?: SubjectText };
  composition?: readonly SubjectCompositionMember[];
  relations?: readonly SubjectRelation[];
  position?: readonly SubjectPosition[];
  history?: readonly SubjectTimelineEntry[];
  knowledge?: readonly SubjectKnowledge[];
  secrets?: readonly SubjectSecret[];
}
export interface KingdomSubjectSlots {
  core: { name: string; referenceRef?: SubjectReference; campaignRef?: SubjectReference };
  indicators?: { renown?: SubjectCount; standing?: SubjectCount; influence?: SubjectMeasure; trend?: SubjectMeasure };
  characteristics?: {
    type?: SubjectText; government?: SubjectText; capital?: SubjectReference; populationText?: SubjectText; languages?: readonly SubjectText[]; rulers?: readonly SubjectReference[];
    races?: SubjectText; currency?: SubjectText; exports?: SubjectText; imports?: SubjectText; deityText?: SubjectText; rulerNames?: readonly SubjectText[];
    region?: SubjectText; continent?: SubjectText; demonym?: SubjectText; founded?: SubjectCount; dissolved?: SubjectCount; summary?: SubjectText;
  };
  composition?: readonly SubjectCompositionMember[];
  relations?: readonly SubjectRelation[];
  position?: readonly SubjectPosition[];
  history?: readonly SubjectTimelineEntry[];
  knowledge?: readonly SubjectKnowledge[];
  secrets?: readonly SubjectSecret[];
}

export interface SubjectSlotsByProfile {
  character: CharacterSubjectSlots;
  deity: DeitySubjectSlots;
  party: PartySubjectSlots;
  organization: OrganizationSubjectSlots;
  city: CitySubjectSlots;
  kingdom: KingdomSubjectSlots;
}

export type SubjectIdByProfile = {
  character: `actor:${string}`;
  deity: `deity:${string}`;
  party: 'party';
  organization: `organization:${string}` | `faction:${string}`;
  city: `place:${string}` | `location:${string}`;
  kingdom: `kingdom:${string}` | `faction:${string}`;
};

type SlotShape<S> = {
  [K in SubjectSlotId]: K extends keyof S ? SubjectSlotState<NonNullable<S[K]>> : { status: 'not-applicable' }
};
type AudienceSlotShape<S, A extends SubjectAudience> = A extends 'players' ? Omit<SlotShape<S>, 'secrets'> : SlotShape<S>;

export type SubjectEnvelope<P extends SubjectProfileId = SubjectProfileId, A extends SubjectAudience = SubjectAudience> = {
  contractVersion: typeof SUBJECT_CONTRACT_VERSION;
  profileId: P;
  subjectId: SubjectIdByProfile[P];
  audience: A;
  slots: AudienceSlotShape<SubjectSlotsByProfile[P], A>;
};

export type AnySubjectEnvelope = { [P in SubjectProfileId]: { [A in SubjectAudience]: SubjectEnvelope<P, A> }[SubjectAudience] }[SubjectProfileId];

export interface SubjectSlotSpec {
  id: SubjectSlotId;
  order: number;
  label: string;
  purpose: string;
  valueKind: SubjectValueKind;
  layers: readonly SubjectDataLayer[];
  visibility: SubjectVisibility | 'per-value';
  renderer: SubjectRendererId;
}

export const SUBJECT_SLOT_SPECS: readonly SubjectSlotSpec[] = [
  { id: 'core', order: 1, label: 'Основа', purpose: 'Идентичность и принадлежность профилю', valueKind: 'identity', layers: ['reference', 'event-state', 'derived'], visibility: 'public', renderer: 'identity' },
  { id: 'indicators', order: 2, label: 'Показатели', purpose: 'Изменяемое текущее состояние', valueKind: 'profile-indicators', layers: ['event-state', 'derived'], visibility: 'per-value', renderer: 'metric-strip' },
  { id: 'characteristics', order: 3, label: 'Характеристики', purpose: 'Подтверждённые характеристики профиля', valueKind: 'profile-facts', layers: ['reference', 'event-state'], visibility: 'per-value', renderer: 'typed-facts' },
  { id: 'resources', order: 4, label: 'Ресурсы', purpose: 'Ограниченные ресурсы с источником максимума', valueKind: 'resource[]', layers: ['event-state', 'derived'], visibility: 'per-value', renderer: 'resource-list' },
  { id: 'conditions', order: 5, label: 'Состояния', purpose: 'Срочные эффекты и срок', valueKind: 'condition[]', layers: ['event-state'], visibility: 'per-value', renderer: 'condition-list' },
  { id: 'capabilities', order: 6, label: 'Возможности', purpose: 'Явно определённые способности, действия или услуги', valueKind: 'reference[]', layers: ['reference', 'derived'], visibility: 'per-value', renderer: 'capability-list' },
  { id: 'composition', order: 7, label: 'Состав', purpose: 'Членство и состав с типизированной ролью связи', valueKind: 'reference[]', layers: ['reference', 'event-state', 'derived'], visibility: 'per-value', renderer: 'membership-list' },
  { id: 'relations', order: 8, label: 'Связи', purpose: 'Направленные или симметричные связи с источником', valueKind: 'relation[]', layers: ['reference', 'event-state', 'derived'], visibility: 'per-value', renderer: 'relation-list' },
  { id: 'position', order: 9, label: 'Положение', purpose: 'Положение в пространстве уровня субъекта', valueKind: 'position[]', layers: ['reference', 'event-state', 'derived'], visibility: 'per-value', renderer: 'position-view' },
  { id: 'history', order: 10, label: 'История', purpose: 'Датированные канонические и принятые кампанийные события', valueKind: 'timeline[]', layers: ['reference', 'event-state', 'derived'], visibility: 'per-value', renderer: 'event-timeline' },
  { id: 'knowledge', order: 11, label: 'Знания', purpose: 'Сведения с явно заданной аудиторией', valueKind: 'knowledge[]', layers: ['reference', 'event-state', 'derived'], visibility: 'per-value', renderer: 'knowledge-list' },
  { id: 'secrets', order: 12, label: 'Секреты', purpose: 'Только заметки и сведения мастера', valueKind: 'secret[]', layers: ['event-state'], visibility: 'dm', renderer: 'dm-secret-list' },
];

const PROFILE_IDS: readonly SubjectProfileId[] = ['character', 'deity', 'party', 'organization', 'city', 'kingdom'];
export const SUBJECT_PROFILE_SLOT_IDS: Readonly<Record<SubjectProfileId, readonly SubjectSlotId[]>> = {
  character: ['core', 'indicators', 'characteristics', 'resources', 'conditions', 'capabilities', 'relations', 'position', 'history', 'knowledge', 'secrets'],
  deity: ['core', 'indicators', 'characteristics', 'capabilities', 'composition', 'relations', 'position', 'history', 'knowledge', 'secrets'],
  party: ['core', 'indicators', 'resources', 'composition', 'relations', 'position', 'history', 'knowledge', 'secrets'],
  organization: ['core', 'indicators', 'characteristics', 'composition', 'relations', 'position', 'history', 'knowledge', 'secrets'],
  city: ['core', 'indicators', 'characteristics', 'composition', 'relations', 'position', 'history', 'knowledge', 'secrets'],
  kingdom: ['core', 'indicators', 'characteristics', 'composition', 'relations', 'position', 'history', 'knowledge', 'secrets'],
};

export interface SubjectProfileSlotSpec extends SubjectSlotSpec {
  applicability: 'applicable' | 'not-applicable';
}

/** Static renderer metadata for one profile/audience; dynamic empty/present state stays in the envelope. */
export function subjectProfileSlotSpecs(profileId: SubjectProfileId, audience: SubjectAudience): readonly SubjectProfileSlotSpec[] {
  const applicable = new Set(SUBJECT_PROFILE_SLOT_IDS[profileId]);
  return SUBJECT_SLOT_SPECS.flatMap(spec => {
    if (audience === 'players' && spec.id === 'secrets') return [];
    const applies = applicable.has(spec.id);
    return [{
      ...spec,
      applicability: applies ? 'applicable' as const : 'not-applicable' as const,
      renderer: applies ? spec.renderer : 'hidden' as const,
    }];
  });
}

export interface SubjectContractIssue { path: string; message: string }

/** Runtime envelope-shape check. Adapters should run this before a projection reaches a renderer. */
export function validateSubjectEnvelope(value: unknown): SubjectContractIssue[] {
  const issues: SubjectContractIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: 'Ожидается объект SubjectEnvelope' }];
  if (value.contractVersion !== SUBJECT_CONTRACT_VERSION) issues.push({ path: 'contractVersion', message: 'Неподдерживаемая версия контракта' });
  if (typeof value.profileId !== 'string' || !PROFILE_IDS.includes(value.profileId as SubjectProfileId)) {
    issues.push({ path: 'profileId', message: 'Неизвестный профиль субъекта' });
  }
  if (value.audience !== 'dm' && value.audience !== 'players') issues.push({ path: 'audience', message: 'Неизвестная аудитория' });
  if (typeof value.subjectId !== 'string' || value.subjectId.length === 0) issues.push({ path: 'subjectId', message: 'Нужен идентификатор субъекта' });
  if (typeof value.profileId === 'string' && PROFILE_IDS.includes(value.profileId as SubjectProfileId) && typeof value.subjectId === 'string') {
    const subjectId = value.subjectId;
    const prefixes: Readonly<Record<SubjectProfileId, readonly string[]>> = {
      character: ['actor:'], deity: ['deity:'], party: ['party'], organization: ['organization:', 'faction:'],
      city: ['place:', 'location:'], kingdom: ['kingdom:', 'faction:'],
    };
    if (!prefixes[value.profileId as SubjectProfileId].some(prefix => prefix === 'party'
      ? subjectId === prefix
      : subjectId.startsWith(prefix) && subjectId.length > prefix.length)) {
      issues.push({ path: 'subjectId', message: 'Идентификатор не соответствует профилю' });
    }
  }
  if (!isRecord(value.slots)) return [...issues, { path: 'slots', message: 'Ожидается объект слотов' }];

  const expected = value.audience === 'players' ? SUBJECT_SLOT_IDS.filter(id => id !== 'secrets') : SUBJECT_SLOT_IDS;
  const expectedSet = new Set<string>(expected);
  const profileSlots = typeof value.profileId === 'string' && PROFILE_IDS.includes(value.profileId as SubjectProfileId)
    ? new Set<string>(SUBJECT_PROFILE_SLOT_IDS[value.profileId as SubjectProfileId])
    : null;
  for (const id of expected) {
    const slot = value.slots[id];
    if (!isRecord(slot)) {
      issues.push({ path: `slots.${id}`, message: 'Объявленный слот отсутствует' });
      continue;
    }
    if (slot.status === 'present') {
      if (!('values' in slot) || slot.values === undefined || slot.values === null) issues.push({ path: `slots.${id}.values`, message: 'Для present нужны values' });
      else if (id === 'composition') validateComposition(slot.values, `slots.${id}.values`, issues);
      else if (id === 'relations') validateRelations(slot.values, `slots.${id}.values`, issues);
    } else if (slot.status === 'empty' || slot.status === 'not-applicable') {
      if ('values' in slot) issues.push({ path: `slots.${id}.values`, message: 'Пустой или неприменимый слот не должен иметь values' });
    } else {
      issues.push({ path: `slots.${id}.status`, message: 'Неизвестный статус слота' });
    }
    if (id === 'core' && slot.status !== 'present') {
      issues.push({ path: 'slots.core.status', message: 'Основа субъекта должна быть present' });
    } else if (id === 'core' && slot.status === 'present' && !isRecord(slot.values)) {
      issues.push({ path: 'slots.core.values', message: 'Основа субъекта должна быть объектом' });
    }
    if (profileSlots && (profileSlots.has(id) === (slot.status === 'not-applicable'))) {
      issues.push({ path: `slots.${id}.status`, message: profileSlots.has(id) ? 'Применимый профильный слот не может быть not-applicable' : 'Неприменимый профильный слот обязан иметь статус not-applicable' });
    }
  }
  for (const id of Object.keys(value.slots)) {
    if (!expectedSet.has(id)) issues.push({ path: `slots.${id}`, message: 'Слот отсутствует в контракте этой аудитории' });
  }
  if (value.audience === 'players') {
    for (const id of Object.keys(value.slots)) {
      findPlayerVisibilityLeaks(value.slots[id], `slots.${id}`, issues, new WeakSet<object>());
    }
  }
  return issues;
}

function validateComposition(value: unknown, path: string, issues: SubjectContractIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Состав должен быть массивом связей' });
    return;
  }
  const seen = new Set<string>();
  const targetKinds: Readonly<Record<SubjectCompositionRelation, readonly string[]>> = {
    'party-member': ['actor'],
    'pantheon-membership': ['pantheon'],
    'organization-membership': ['person'],
    resident: ['person'],
    organization: ['organization'],
    'child-place': ['location'],
    'territory-place': ['place'],
    within: ['kingdom'],
  };
  value.forEach((member, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(member)) {
      issues.push({ path: itemPath, message: 'Элемент состава должен быть объектом' });
      return;
    }
    const validRelation = typeof member.relation === 'string' && SUBJECT_COMPOSITION_RELATIONS.includes(member.relation as SubjectCompositionRelation);
    if (!validRelation) {
      issues.push({ path: `${itemPath}.relation`, message: 'Неизвестный тип связи состава' });
    }
    if (!isRecord(member.target) || member.target.kind !== 'reference') {
      issues.push({ path: `${itemPath}.target`, message: 'Связь состава должна указывать на типизированный субъект' });
      return;
    }
    const parsed = typeof member.target.value === 'string' ? parseRef(member.target.value) : null;
    if (!parsed) {
      issues.push({ path: `${itemPath}.target.value`, message: 'Нужна ссылка на существующий вид субъекта' });
    } else if (validRelation && !targetKinds[member.relation as SubjectCompositionRelation].includes(parsed.kind)) {
      issues.push({ path: `${itemPath}.target.value`, message: 'Вид цели не подходит для связи состава' });
    }
    if (validRelation && parsed) {
      const key = `${member.relation}\u0000${member.target.value}`;
      if (seen.has(key)) issues.push({ path: itemPath, message: 'Повторяется та же связь состава' });
      seen.add(key);
    }
  });
}

function validateRelations(value: unknown, path: string, issues: SubjectContractIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Связи должны быть массивом' });
    return;
  }
  const seen = new Set<string>();
  value.forEach((relation, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(relation)) {
      issues.push({ path: itemPath, message: 'Связь должна быть объектом' });
      return;
    }
    const validKind = typeof relation.kind === 'string' && SUBJECT_RELATION_KINDS.includes(relation.kind as SubjectRelationKind);
    if (!validKind) {
      issues.push({ path: `${itemPath}.kind`, message: 'Неизвестный тип отношения' });
    }
    const validDirection = relation.direction === 'outgoing' || relation.direction === 'incoming' || relation.direction === 'symmetric';
    if (!validDirection) {
      issues.push({ path: `${itemPath}.direction`, message: 'Неизвестное направление отношения' });
    }
    if (!isRecord(relation.target) || relation.target.kind !== 'reference') {
      issues.push({ path: `${itemPath}.target`, message: 'Отношение должно указывать на типизированный субъект' });
      return;
    }
    const targetValue = relation.target.value;
    const parsed = typeof targetValue === 'string' ? parseRef(targetValue) : null;
    if (!parsed) {
      issues.push({ path: `${itemPath}.target.value`, message: 'Нужна ссылка на существующий вид субъекта' });
    } else if (validKind && !RELATION_TARGET_KINDS[relation.kind as SubjectRelationKind].includes(parsed.kind)) {
      issues.push({ path: `${itemPath}.target.value`, message: 'Вид цели не подходит для отношения' });
    }
    if (typeof relation.target.label !== 'string' || !relation.target.label.trim()) {
      issues.push({ path: `${itemPath}.target.label`, message: 'Нужно название связанного субъекта' });
    }
    if (validKind && validDirection && parsed) {
      const key = `${relation.kind}\u0000${relation.direction}\u0000${targetValue}`;
      if (seen.has(key)) issues.push({ path: itemPath, message: 'Повторяется та же связь субъекта' });
      seen.add(key);
    }
  });
}

function findPlayerVisibilityLeaks(value: unknown, path: string, issues: SubjectContractIssue[], visited: WeakSet<object>): void {
  if (Array.isArray(value)) {
    if (visited.has(value)) return;
    visited.add(value);
    value.forEach((item, index) => findPlayerVisibilityLeaks(item, `${path}[${index}]`, issues, visited));
    return;
  }
  if (!isRecord(value) || visited.has(value)) return;
  visited.add(value);
  if (value.visibility === 'dm' || value.audience === 'dm' || 'secrets' in value) {
    issues.push({ path, message: 'Игроковая проекция содержит данные только для мастера' });
  }
  for (const [key, child] of Object.entries(value)) {
    findPlayerVisibilityLeaks(child, `${path}.${key}`, issues, visited);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
