import type { State } from '../engine/state';
import { EDITION_ORDER, type Era } from '../campaign/era';
import { poolLabel, resourcePoolsOf } from '../campaign/resources';
import { SKILL_LABEL } from '../components/labels';
import { classById } from '../rules/compendium';
import type { Deity, DeityField, Edition } from '../cosmos/deities';
import { CONDITIONS } from '../rules/srd/conditions';
import { orgUrl, type Organization, type OrganizationMemberCitation, type PlaceFaith } from '../world/organizations';
import type { Resident } from '../world/people';
import { kingdomUrl, rulerName, rulersShown, type Kingdom, type KingdomHistoryLine } from '../world/kingdoms';
import type { GazetteerPlace } from '../map/gazetteer';
import type { ScaleLevel } from '../engine/events';
import { ref } from './ref';
import { validateSubjectEnvelope } from './subjectContract';
import type {
  AnySubjectEnvelope, SubjectAudience, SubjectCitation, SubjectCompositionMember, SubjectCount, SubjectEnvelope, SubjectPosition, SubjectProvenance, SubjectReference, SubjectRelation, SubjectText,
  SubjectTimelineEntry,
} from './subjectContract';

/** Deduplicate one derived list without merging different relationship kinds or slots. */
function uniqueIds(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}

/** Player character projection. Non-party and non-PC actors are never exposed through the player adapter. */
export function characterSubjectEnvelope<A extends SubjectAudience>(
  state: State,
  actorId: string,
  audience: A,
): SubjectEnvelope<'character', A> | null {
  const actor = state.actors[actorId];
  if (!actor || (audience === 'players' && (actor.kind !== 'pc' || !state.party.includes(actorId)))) return null;
  const actorRef = ref('actor', actor.id);
  const source = (path: string): SubjectProvenance => ({ layer: 'event-state', sourceId: path });
  const reference = (kind: Parameters<typeof ref>[0], id: string, label: string, provenance: SubjectProvenance): SubjectReference => ({
    kind: 'reference', value: ref(kind, id), label, provenance, visibility: 'players',
  });
  const conditions = Object.entries(actor.conditions).flatMap(([id, snapshot]) => {
    if (!snapshot) return [];
    const condition = CONDITIONS[id as keyof typeof CONDITIONS];
    return [{
      id, label: condition?.label ?? id, ...(snapshot.level !== undefined ? { level: snapshot.level } : {}),
      ...(snapshot.untilSec !== undefined ? { expiresAtWorldSec: snapshot.untilSec } : {}),
      provenance: source(`state.actors.${actor.id}.conditions.${id}`), visibility: 'players' as const,
    }];
  });
  const known = state.knowledge?.[actorRef]?.facts ?? [];
  const campaignFacts = Object.values(state.facts).filter(fact => fact.subjectId === actorRef && fact.visibility === 'players');
  const secretFacts = audience === 'dm'
    ? Object.values(state.facts).filter(fact => fact.subjectId === actorRef && fact.visibility === 'dm')
    : [];
  const knowledge = [
    ...known.map((fact, index) => ({
      factId: `known:${index}:${fact.sec}`, label: fact.label,
      value: { kind: 'text' as const, value: fact.value, provenance: source(`state.knowledge.${actorRef}.facts.${index}`), visibility: 'players' as const },
      audience: 'players' as const,
    })),
    ...campaignFacts.map(fact => ({
      factId: fact.id, label: fact.id,
      value: { kind: 'text' as const, value: fact.text, provenance: source(`state.facts.${fact.id}`), visibility: 'players' as const },
      audience: 'players' as const,
    })),
  ];
  const secrets = secretFacts.map(fact => ({
    id: fact.id, label: fact.id,
    value: { kind: 'text' as const, value: fact.text, provenance: source(`state.facts.${fact.id}`), visibility: 'dm' as const },
    audience: 'dm' as const,
  }));
  const sheet = actor.sheet;
  const resourceVisibility = actor.kind === 'pc' ? 'players' as const : 'dm' as const;
  const resources = resourcePoolsOf(actor).map(pool => ({
    id: pool.id,
    label: poolLabel(pool),
    current: pool.available,
    maximum: pool.max,
    unit: pool.kind === 'slots' ? 'ячейка' : pool.kind === 'pool' ? 'HP' : 'использование',
    provenance: {
      layer: 'derived' as const,
      sourceId: `campaign.resources.resourcePoolsOf(actor:${actor.id})#${pool.id}`,
      citation: { title: pool.source, license: 'CC BY 4.0' },
    },
    visibility: resourceVisibility,
  }));
  const slots = {
    core: { status: 'present', values: { name: actor.name, actorKind: actor.kind, ref: reference('actor', actor.id, actor.name, source(`state.actors.${actor.id}`)) } },
    indicators: audience === 'players' && actor.kind === 'pc'
      ? { status: 'present', values: {
        hp: { kind: 'hit-points', current: actor.hp.current, max: actor.hp.max, temporary: actor.hp.temp, provenance: source(`state.actors.${actor.id}.hp`), visibility: 'players' },
        ac: { kind: 'measure', value: actor.ac, provenance: source(`state.actors.${actor.id}.ac`), visibility: 'players' },
        passivePerception: { kind: 'measure', value: actor.passivePerception, provenance: source(`state.actors.${actor.id}.passivePerception`), visibility: 'players' },
      } }
      : audience === 'dm' ? { status: 'present', values: {
        hp: { kind: 'hit-points', current: actor.hp.current, max: actor.hp.max, temporary: actor.hp.temp, provenance: source(`state.actors.${actor.id}.hp`), visibility: 'dm' },
        ac: { kind: 'measure', value: actor.ac, provenance: source(`state.actors.${actor.id}.ac`), visibility: 'dm' },
        passivePerception: { kind: 'measure', value: actor.passivePerception, provenance: source(`state.actors.${actor.id}.passivePerception`), visibility: 'dm' },
      } }
      : { status: 'empty' },
    characteristics: sheet ? { status: 'present', values: {
      abilities: sheet.abilities,
      skills: sheet.skills.map(id => reference('skill', id, SKILL_LABEL[id as keyof typeof SKILL_LABEL] ?? id, source(`state.actors.${actor.id}.sheet.skills`))),
      class: reference('class', sheet.classId, classById(sheet.classId)?.nameRu ?? sheet.classId, source(`state.actors.${actor.id}.sheet.classId`)),
      level: { kind: 'count', value: sheet.level, provenance: source(`state.actors.${actor.id}.sheet.level`), visibility: 'players' },
    } } : { status: 'empty' },
    resources: resources.length ? { status: 'present', values: resources } : { status: 'empty' },
    conditions: conditions.length ? { status: 'present', values: conditions } : { status: 'empty' },
    capabilities: sheet?.features.length ? { status: 'present', values: sheet.features.map(feature => reference('feature', feature.id, feature.name, source(`state.actors.${actor.id}.sheet.features`))) } : { status: 'empty' },
    composition: { status: 'not-applicable' },
    relations: sheet?.deity ? { status: 'present', values: [{
      kind: 'worships', direction: 'outgoing', target: reference('deity', sheet.deity.id, sheet.deity.name, source(`state.actors.${actor.id}.sheet.deity`)),
      provenance: source(`state.actors.${actor.id}.sheet.deity`), visibility: 'players',
    }] } : { status: 'empty' },
    position: actor.locationId && state.world.locations[actor.locationId]
      && (audience === 'dm' || state.world.locations[actor.locationId].revealed)
      ? { status: 'present', values: [{
        kind: 'place', place: reference('location', actor.locationId, state.world.locations[actor.locationId].name, source(`state.actors.${actor.id}.locationId`)),
        scale: state.world.locations[actor.locationId].scale, provenance: source(`state.actors.${actor.id}.locationId`), visibility: 'players',
      }] }
      : { status: 'empty' },
    history: { status: 'empty' },
    knowledge: knowledge.length ? { status: 'present', values: knowledge } : { status: 'empty' },
    ...(audience === 'dm' ? { secrets: secrets.length ? { status: 'present', values: secrets } : { status: 'empty' } } : {}),
  };
  const envelope: AnySubjectEnvelope = { contractVersion: 1, profileId: 'character', subjectId: actorRef, audience, slots } as AnySubjectEnvelope;
  const issues = validateSubjectEnvelope(envelope);
  if (issues.length) throw new Error(`Character adapter violated Subject v1: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
  return envelope as SubjectEnvelope<'character', A>;
}

/** A campaign location is a city profile only when its audience can see it. */
export function citySubjectEnvelope<A extends SubjectAudience>(state: State, locationId: string, audience: A): SubjectEnvelope<'city', A> | null {
  const location = state.world.locations[locationId];
  if (!location || (audience === 'players' && !location.revealed)) return null;
  const source = (path: string): SubjectProvenance => ({ layer: 'event-state', sourceId: path });
  const reference: SubjectReference = {
    kind: 'reference', value: location.ref ?? ref('location', location.id), label: location.name,
    provenance: source(location.ref ? `state.world.locations.${location.id}.ref` : `state.world.locations.${location.id}`),
    visibility: 'players',
  };
  const present = <T,>(value: T) => ({ status: 'present' as const, values: value });
  const childPlaces: SubjectCompositionMember[] = Object.values(state.world.locations)
    .filter(child => child.parentId === location.id && (audience === 'dm' || child.revealed))
    .map(child => ({ relation: 'child-place' as const, target: { kind: 'reference' as const, value: ref('location', child.id), label: child.name,
      provenance: source(`state.world.locations.${child.id}`), visibility: 'players' as const },
      provenance: source(`state.world.locations.${child.id}.parentId`), visibility: 'players' as const }));
  const position = [
    ...(location.parentId && state.world.locations[location.parentId]
      && (audience === 'dm' || state.world.locations[location.parentId].revealed)
      ? [{ kind: 'linked-place' as const, role: 'parent' as const,
        place: { kind: 'reference' as const, value: ref('location', location.parentId), label: state.world.locations[location.parentId].name,
          provenance: source(`state.world.locations.${location.id}.parentId`), visibility: 'players' as const },
        provenance: source(`state.world.locations.${location.id}.parentId`), visibility: 'players' as const }]
      : []),
    ...(location.geo ? [{ kind: 'map-point' as const, mapId: location.geo.map, x: location.geo.x, y: location.geo.y,
      ...(location.geo.r !== undefined ? { radius: location.geo.r } : {}), ...(location.geo.ry !== undefined ? { radiusY: location.geo.ry } : {}),
      provenance: source(`state.world.locations.${location.id}.geo`), visibility: 'players' as const }] : []),
    ...(audience === 'dm' && state.world.settlementPlans?.[location.id]
      ? [{ kind: 'settlement-plan' as const, locationId: location.id, mapId: state.world.settlementPlans[location.id].mapId,
        provenance: source(`state.world.settlementPlans.${location.id}`), visibility: 'dm' as const }]
      : []),
  ];
  const slots = {
    core: present({ name: location.name, scale: location.scale, referenceRef: reference }),
    indicators: location.revealed !== undefined || location.danger !== undefined || location.haven !== undefined || location.pricePercent !== undefined
      ? present({
        ...(location.revealed !== undefined ? { revealed: { kind: 'boolean' as const, value: location.revealed, provenance: source(`state.world.locations.${location.id}.revealed`), visibility: 'players' as const } } : {}),
        ...(location.danger !== undefined ? { danger: { kind: 'text' as const, value: location.danger, provenance: source(`state.world.locations.${location.id}.danger`), visibility: 'players' as const } } : {}),
        ...(location.haven !== undefined ? { haven: { kind: 'boolean' as const, value: location.haven, provenance: source(`state.world.locations.${location.id}.haven`), visibility: 'players' as const } } : {}),
        ...(location.pricePercent !== undefined ? { marketIndex: { kind: 'measure' as const, value: location.pricePercent, unit: '%', provenance: source(`state.world.locations.${location.id}.pricePercent`), visibility: 'players' as const } } : {}),
      }) : { status: 'empty' as const },
    characteristics: location.population !== undefined
      ? present({ population: { kind: 'count' as const, value: location.population, unit: 'людей', provenance: source(`state.world.locations.${location.id}.population`), visibility: 'players' as const } })
      : { status: 'empty' as const },
    resources: { status: 'not-applicable' as const }, conditions: { status: 'not-applicable' as const },
    capabilities: { status: 'not-applicable' as const }, composition: childPlaces.length ? present(childPlaces) : { status: 'empty' as const }, relations: { status: 'empty' as const },
    position: position.length ? present(position) : { status: 'empty' as const }, history: { status: 'empty' as const }, knowledge: { status: 'empty' as const },
    ...(audience === 'dm' ? { secrets: { status: 'empty' as const } } : {}),
  };
  const envelope: AnySubjectEnvelope = { contractVersion: 1, profileId: 'city', subjectId: ref('location', location.id), audience, slots } as AnySubjectEnvelope;
  const issues = validateSubjectEnvelope(envelope);
  if (issues.length) throw new Error(`City adapter violated Subject v1: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
  return envelope as SubjectEnvelope<'city', A>;
}

export interface GazetteerPlaceSubjectContext {
  /** These records must already be scoped to the represented place and campaign year. */
  faith?: PlaceFaith;
  organizations?: readonly Pick<Organization, 'id' | 'name'>[];
  residents?: readonly Resident[];
  deityNames?: Readonly<Record<string, string>>;
}

/**
 * Static gazetteer place adapter. Map and scale are explicit because neither is encoded by a GazetteerPlace.
 * Player projections are built only from facts already recorded in their campaign knowledge.
 */
export function gazetteerPlaceSubjectEnvelope<A extends SubjectAudience>(
  state: State,
  place: GazetteerPlace,
  mapId: string,
  scale: ScaleLevel,
  audience: A,
  context: GazetteerPlaceSubjectContext = {},
): SubjectEnvelope<'city', A> | null {
  const placeRef = ref('place', place.id);
  const known = audience === 'players' ? state.knowledge?.[placeRef] : undefined;
  if (audience === 'players' && !known) return null;

  const file = place.card ? `${mapId}-cards.json` : `${mapId}-places.json`;
  const sourceId = `content/maps/${file}#${place.id}`;
  const sourceUrl = place.sources?.find(source => /^https?:\/\//.test(source));
  const citation = {
    title: place.name,
    ...(sourceUrl ? { url: sourceUrl } : {}),
    ...(place.card ? { license: 'CC BY-SA 3.0' } : {}),
  };
  const provenance = (suffix = ''): SubjectProvenance => audience === 'players'
    ? { layer: 'event-state', sourceId: `state.knowledge.${placeRef}${suffix}` }
    : { layer: 'reference', sourceId: `${sourceId}${suffix}`, citation };
  const text = (value: string | undefined, suffix: string): SubjectText | undefined => value ? {
    kind: 'text', value, provenance: provenance(suffix), visibility: 'dm',
  } : undefined;
  const knownFacts = (known?.facts ?? []).map((fact, index) => ({
    factId: `known:${index}:${fact.sec}`, label: fact.label,
    value: { kind: 'text' as const, value: fact.value, provenance: { layer: 'event-state' as const, sourceId: `state.knowledge.${placeRef}.facts.${index}` }, visibility: 'players' as const },
    audience: 'players' as const,
  }));
  const campaignFacts = Object.values(state.facts).filter(fact => fact.subjectId === placeRef && fact.visibility === 'players').map(fact => ({
    factId: fact.id, label: fact.id,
    value: { kind: 'text' as const, value: fact.text, provenance: { layer: 'event-state' as const, sourceId: `state.facts.${fact.id}` }, visibility: 'players' as const },
    audience: 'players' as const,
  }));
  const positions: SubjectPosition[] = audience === 'dm' && !place.approx && !place.label
    ? [{ kind: 'map-point', mapId, x: place.x, y: place.y, provenance: provenance('.x,.y'), visibility: 'dm' }]
    : [];
  const composition: SubjectCompositionMember[] = audience === 'dm' ? [
    ...(context.organizations ?? []).map((organization, order) => ({
      relation: 'organization' as const,
      target: { kind: 'reference' as const, value: ref('organization', organization.id), label: organization.name,
        provenance: { layer: 'reference' as const, sourceId: `content/world/organizations.json#${organization.id}` }, visibility: 'dm' as const },
      order, provenance: { layer: 'reference' as const, sourceId: `content/world/organizations.json#${organization.id}.places` }, visibility: 'dm' as const,
    })),
    ...(context.residents ?? []).map(([id, name], order) => ({
      relation: 'resident' as const,
      target: { kind: 'reference' as const, value: ref('person', id), label: name,
        provenance: { layer: 'reference' as const, sourceId: `content/world/people-index.json#${place.id}` }, visibility: 'dm' as const },
      order: order + (context.organizations?.length ?? 0), provenance: { layer: 'reference' as const, sourceId: `content/world/people-index.json#${place.id}` }, visibility: 'dm' as const,
    })),
  ] : [];
  const faithSource = `content/world/place-faiths.json#${place.id}`;
  const faithProvenance: SubjectProvenance = { layer: 'reference', sourceId: faithSource,
    citation: { title: place.name, license: 'CC BY-SA 3.0' } };
  const faithText: SubjectText | undefined = audience === 'dm' && context.faith?.text
    ? { kind: 'text', value: context.faith.text, provenance: faithProvenance, visibility: 'dm' } : undefined;
  const faithRelations: SubjectRelation[] = audience === 'dm' && context.faith
    ? (context.faith.deities ?? []).flatMap(deityId => {
      const deityName = context.deityNames?.[deityId];
      if (!deityName) return [];
      const source = faithProvenance;
      return [{ kind: 'religion', direction: 'outgoing' as const,
        target: { kind: 'reference' as const, value: ref('deity', deityId), label: deityName, provenance: source, visibility: 'dm' as const },
        ...(faithText ? { value: faithText } : {}), provenance: source, visibility: 'dm' as const }];
    }) : [];
  const dmFacts = audience === 'dm' ? [
    text(place.card?.what, '.card.what'),
    text(place.card?.ruler, '.card.ruler'),
    text(place.card?.summary, '.card.summary'),
  ].flatMap((value, index) => value ? [{
    factId: `${place.id}:description:${index}`, label: ['Описание', 'Правитель', 'Сводка'][index], value, audience: 'dm' as const,
  }] : []) : [];
  const campaignSecrets = audience === 'dm' ? Object.values(state.facts).filter(fact => fact.subjectId === placeRef && fact.visibility === 'dm').map(fact => ({
    id: fact.id, label: fact.id,
    value: { kind: 'text' as const, value: fact.text, provenance: { layer: 'event-state' as const, sourceId: `state.facts.${fact.id}` }, visibility: 'dm' as const },
    audience: 'dm' as const,
  })) : [];
  const envelope: AnySubjectEnvelope = {
    contractVersion: 1, profileId: 'city', subjectId: placeRef, audience,
    slots: {
      core: { status: 'present', values: { name: known?.name ?? place.name, scale,
        referenceRef: { kind: 'reference', value: placeRef, label: known?.name ?? place.name, provenance: provenance(), visibility: 'players' } } },
      indicators: audience === 'dm' && place.card?.danger
        ? { status: 'present', values: { danger: { kind: 'text', value: place.card.danger, provenance: provenance('.card.danger'), visibility: 'dm' } } }
        : { status: 'empty' },
      characteristics: audience === 'dm' && (place.kind || faithText)
        ? { status: 'present', values: {
          ...(place.kind ? { type: { kind: 'text' as const, value: place.kind, provenance: provenance('.kind'), visibility: 'dm' as const } } : {}),
          ...(faithText ? { faith: faithText } : {}),
        } }
        : { status: 'empty' },
      resources: { status: 'not-applicable' }, conditions: { status: 'not-applicable' }, capabilities: { status: 'not-applicable' },
      composition: composition.length ? { status: 'present', values: composition } : { status: 'empty' },
      relations: faithRelations.length ? { status: 'present', values: faithRelations } : { status: 'empty' },
      position: positions.length ? { status: 'present', values: positions } : { status: 'empty' },
      history: { status: 'empty' },
      knowledge: knownFacts.length || campaignFacts.length
        ? { status: 'present', values: [...knownFacts, ...campaignFacts] }
        : { status: 'empty' },
      ...(audience === 'dm' ? { secrets: dmFacts.length || campaignSecrets.length
        ? { status: 'present', values: [
          ...dmFacts.map(({ factId, label, value }) => ({ id: factId, label, value, audience: 'dm' as const })),
          ...campaignSecrets,
        ] }
        : { status: 'empty' } } : {}),
    },
  } as AnySubjectEnvelope;
  const issues = validateSubjectEnvelope(envelope);
  if (issues.length) throw new Error(`Gazetteer place adapter violated Subject v1: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
  return envelope as SubjectEnvelope<'city', A>;
}

type RefKind = Parameters<typeof ref>[0];

function subjectReference(kind: RefKind, id: string, label: string, sourceId: string, visibility: 'players' | 'dm' = 'players', citation?: SubjectProvenance['citation']): SubjectReference {
  return { kind: 'reference', value: ref(kind, id), label, provenance: { layer: 'reference', sourceId, ...(citation ? { citation } : {}) }, visibility };
}

function campaignKnowledge(state: State, subjectRef: string, audience: SubjectAudience) {
  const known = audience === 'players' ? state.knowledge?.[subjectRef as keyof NonNullable<State['knowledge']>] : undefined;
  if (audience === 'players' && !known) return null;
  const facts = audience === 'players'
    ? (known?.facts ?? []).map((fact, index) => ({
      factId: `known:${index}:${fact.sec}`, label: fact.label,
      value: { kind: 'text' as const, value: fact.value, provenance: { layer: 'event-state' as const, sourceId: `state.knowledge.${subjectRef}.facts.${index}` }, visibility: 'players' as const },
      audience: 'players' as const,
    }))
    : Object.values(state.facts).filter(fact => fact.subjectId === subjectRef && fact.visibility === 'players').map(fact => ({
      factId: fact.id, label: fact.id,
      value: { kind: 'text' as const, value: fact.text, provenance: { layer: 'event-state' as const, sourceId: `state.facts.${fact.id}` }, visibility: 'players' as const },
      audience: 'players' as const,
    }));
  const secrets = audience === 'dm' ? Object.values(state.facts).filter(fact => fact.subjectId === subjectRef && fact.visibility === 'dm').map(fact => ({
    id: fact.id, label: fact.id,
    value: { kind: 'text' as const, value: fact.text, provenance: { layer: 'event-state' as const, sourceId: `state.facts.${fact.id}` }, visibility: 'dm' as const },
    audience: 'dm' as const,
  })) : [];
  return { name: known?.name, facts, secrets };
}

function validatedEnvelope<P extends 'deity' | 'organization' | 'kingdom', A extends SubjectAudience>(
  envelope: AnySubjectEnvelope,
  profile: P,
): SubjectEnvelope<P, A> {
  const issues = validateSubjectEnvelope(envelope);
  if (issues.length) throw new Error(`${profile} adapter violated Subject v1: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
  return envelope as unknown as SubjectEnvelope<P, A>;
}

export interface DeitySubjectContext {
  deityNames?: Readonly<Record<string, string>>;
  pantheonNames?: Readonly<Record<string, string>>;
  planeNames?: Readonly<Record<string, string>>;
}

/** Canon facts are available to the DM; players receive only deity facts explicitly learned into the campaign notebook. */
export function deitySubjectEnvelope<A extends SubjectAudience>(state: State, deity: Deity, era: Era, audience: A, context: DeitySubjectContext = {}): SubjectEnvelope<'deity', A> | null {
  const deityRef = ref('deity', deity.id);
  const knowledge = campaignKnowledge(state, deityRef, audience);
  if (!knowledge) return null;
  const src = `content/cosmos/deities.json#${deity.id}`;
  const fact = (field: DeityField) => {
    for (const edition of EDITION_ORDER[era] as readonly Edition[]) {
      const cell = deity.fields[field]?.[edition];
      if (cell) return { edition, cell };
    }
    return undefined;
  };
  const text = (field: DeityField) => {
    const selected = fact(field);
    return selected ? {
      kind: 'text' as const, value: selected.cell.t,
      provenance: { layer: 'reference' as const, sourceId: `${src}.${field}.${selected.edition}`, citation: { title: deity.name, edition: selected.edition, url: deity.url } },
      visibility: 'players' as const,
    } : undefined;
  };
  const relations = (field: 'serves' | 'servedby') => {
    const selected = fact(field);
    return (selected?.cell.d ?? []).map(id => ({
      kind: field, direction: field === 'serves' ? 'outgoing' as const : 'incoming' as const,
      target: subjectReference('deity', id, context.deityNames?.[id] ?? id, `${src}.${field}.${selected!.edition}`),
      value: { kind: 'text' as const, value: selected!.cell.t, provenance: { layer: 'reference' as const, sourceId: `${src}.${field}.${selected!.edition}` }, visibility: 'players' as const },
      provenance: { layer: 'reference' as const, sourceId: `${src}.${field}.${selected!.edition}` }, visibility: 'players' as const,
    }));
  };
  // Canonical deity relationships belong to the DM reference projection. Players get
  // only the facts explicitly recorded in their campaign knowledge below.
  const relationValues = audience === 'dm' ? [
    ...relations('serves'), ...relations('servedby'),
    ...(deity.aspects ?? []).map(id => ({
      kind: 'aspect', direction: 'outgoing' as const,
      target: subjectReference('deity', id, context.deityNames?.[id] ?? id, `${src}.aspects`),
      provenance: { layer: 'reference' as const, sourceId: `${src}.aspects` }, visibility: 'players' as const,
    })),
  ] : [];
  const positions: SubjectPosition[] = audience === 'dm' ? (['homeplane', 'realm'] as const).flatMap(field => {
    const selected = fact(field);
    return (selected?.cell.p ?? []).map(planeId => ({
      kind: 'plane' as const,
      plane: subjectReference('plane', planeId, context.planeNames?.[planeId] ?? planeId, `${src}.${field}.${selected!.edition}`),
      field, edition: selected!.edition,
      provenance: { layer: 'reference' as const, sourceId: `${src}.${field}.${selected!.edition}`, citation: { title: deity.name, edition: selected!.edition, url: deity.url } },
      visibility: 'dm' as const,
    }));
  }) : [];
  const secrets = knowledge.secrets;
  const envelope = {
    contractVersion: 1, profileId: 'deity', subjectId: deityRef, audience,
    slots: {
      core: { status: 'present', values: { name: knowledge.name ?? deity.name, ref: subjectReference('deity', deity.id, knowledge.name ?? deity.name, src) } },
      indicators: audience === 'dm' && (fact('power') || deity.died)
        ? { status: 'present', values: {
          ...(text('power') ? { powerRank: text('power') } : {}),
          ...(deity.died ? { aliveStatus: { kind: 'text', value: `умер: ${deity.died}`, provenance: { layer: 'reference', sourceId: `${src}.died` }, visibility: 'dm' as const } } : {}),
        } }
        : { status: 'empty' },
      characteristics: audience === 'dm' ? { status: 'present', values: {
        ...(text('alignment') ? { alignment: text('alignment') } : {}),
        ...(text('portfolio') ? { portfolio: text('portfolio') } : {}),
        ...(text('symbol') ? { symbol: text('symbol') } : {}),
        ...(text('domains') ? { domains: [{ kind: 'text' as const, value: fact('domains')!.cell.t, provenance: { layer: 'reference' as const, sourceId: `${src}.domains.${fact('domains')!.edition}` }, visibility: 'players' as const }] } : {}),
      } } : { status: 'empty' },
      resources: { status: 'not-applicable' }, conditions: { status: 'not-applicable' },
      capabilities: audience === 'dm' && (text('worshipers') || text('holydays')) ? { status: 'present', values: {
        ...(text('worshipers') ? { worshippers: text('worshipers') } : {}),
        ...(text('holydays') ? { holyDays: text('holydays') } : {}),
      } } : { status: 'empty' },
      composition: audience === 'dm' && deity.pantheons?.length ? { status: 'present', values: deity.pantheons.map(id => ({
        relation: 'pantheon-membership' as const, target: subjectReference('pantheon', id, context.pantheonNames?.[id] ?? id, src),
        provenance: { layer: 'reference' as const, sourceId: `${src}.pantheons` }, visibility: 'players' as const,
      })) } : { status: 'empty' },
      relations: relationValues.length ? { status: 'present', values: relationValues } : { status: 'empty' },
      position: positions.length ? { status: 'present', values: positions } : { status: 'empty' }, history: { status: 'empty' },
      knowledge: knowledge.facts.length ? { status: 'present', values: knowledge.facts } : { status: 'empty' },
      ...(audience === 'dm' ? { secrets: secrets.length ? { status: 'present', values: secrets } : { status: 'empty' } } : {}),
    },
  } as unknown as AnySubjectEnvelope;
  return validatedEnvelope<'deity', A>(envelope, 'deity');
}

export interface OrganizationSubjectContext {
  /** Names resolved from the currently loaded map gazetteer; preserve the source id when no place is found. */
  placeNames?: Readonly<Record<string, string>>;
  /** Canonical directory names keyed by entity ref, e.g. `organization:harpers`. */
  relatedNames?: Readonly<Record<string, string>>;
}

/** Organization directory facts and campaign faction state are kept separate; faction goals are never projected to players. */
export function organizationSubjectEnvelope<A extends SubjectAudience>(
  state: State,
  organization: Organization,
  audience: A,
  members: readonly Resident[] = [],
  memberCitation?: OrganizationMemberCitation,
  context: OrganizationSubjectContext = {},
): SubjectEnvelope<'organization', A> | null {
  const orgRef = ref('organization', organization.id);
  const knowledge = campaignKnowledge(state, orgRef, audience);
  if (!knowledge) return null;
  const campaignFaction = Object.values(state.world.factions).find(faction => faction.ref === orgRef);
  const src = `content/world/organizations.json#${organization.id}`;
  const citation = { title: organization.name, url: orgUrl(organization), license: 'CC BY-SA 3.0' };
  const referenceValue = (field: string) => ({ layer: 'reference' as const, sourceId: `${src}.${field}`, citation });
  const characteristics = audience === 'dm' ? {
    ...(organization.type ? { type: { kind: 'text' as const, value: organization.type, provenance: referenceValue('type'), visibility: 'players' as const } } : {}),
    ...(organization.base ? { base: { kind: 'text' as const, value: organization.base, provenance: referenceValue('base'), visibility: 'players' as const } } : {}),
    ...(organization.leaders?.some(leader => leader.person) ? { leaders: organization.leaders.filter(leader => leader.person).map(leader => subjectReference('person', leader.person!, leader.t, `${src}.leaders`, 'players', citation)) } : {}),
    ...(organization.leaders?.length ? { leaderNames: organization.leaders.map((leader, index) => ({
      kind: 'text' as const, value: leader.when ? `${leader.t} (${leader.when})` : leader.t,
      provenance: referenceValue(`leaders.${index}`), visibility: 'players' as const,
    })) } : {}),
    ...(organization.formed !== undefined ? { founded: { kind: 'count' as const, value: organization.formed, unit: 'DR', provenance: referenceValue('formed'), visibility: 'players' as const } } : {}),
    ...(organization.disbanded !== undefined ? { dissolved: { kind: 'count' as const, value: organization.disbanded, unit: 'DR', provenance: referenceValue('disbanded'), visibility: 'players' as const } } : {}),
    ...(organization.alignment ? { alignment: { kind: 'text' as const, value: organization.alignment, provenance: referenceValue('alignment'), visibility: 'players' as const } } : {}),
    ...(organization.races ? { races: { kind: 'text' as const, value: organization.races, provenance: referenceValue('races'), visibility: 'players' as const } } : {}),
    ...(organization.symbol ? { symbol: { kind: 'text' as const, value: organization.symbol, provenance: referenceValue('symbol'), visibility: 'players' as const } } : {}),
    ...(organization.members ? { members: { kind: 'text' as const, value: organization.members, provenance: referenceValue('members'), visibility: 'players' as const } } : {}),
    ...(organization.church !== undefined ? { church: { kind: 'boolean' as const, value: organization.church, provenance: referenceValue('church'), visibility: 'players' as const } } : {}),
  } : {};
  const relationValues = audience === 'dm' ? [
    ...(organization.allies ?? []).map(id => ({ kind: 'ally', direction: 'outgoing' as const, target: subjectReference('organization', id, context.relatedNames?.[`organization:${id}`] ?? id, `${src}.allies`, 'players', citation), provenance: referenceValue('allies'), visibility: 'players' as const })),
    ...(organization.enemies ?? []).map(id => ({ kind: 'enemy', direction: 'outgoing' as const, target: subjectReference('organization', id, context.relatedNames?.[`organization:${id}`] ?? id, `${src}.enemies`, 'players', citation), provenance: referenceValue('enemies'), visibility: 'players' as const })),
    ...(organization.deities ?? []).map(id => ({ kind: 'dedicated-to', direction: 'outgoing' as const, target: subjectReference('deity', id, context.relatedNames?.[`deity:${id}`] ?? id, `${src}.deities`, 'players', citation), provenance: referenceValue('deities'), visibility: 'players' as const })),
  ] : [];
  const campaignRelations = audience === 'dm' && campaignFaction ? Object.entries(campaignFaction.relations ?? {}).flatMap(([otherId, value]) => {
    const other = state.world.factions[otherId];
    return other ? [{
      kind: 'campaign-relation', direction: 'symmetric' as const,
      target: subjectReference('faction', other.id, other.name, `state.world.factions.${other.id}`),
      value: { kind: 'text' as const, value: String(value), provenance: { layer: 'event-state' as const, sourceId: `state.world.factions.${campaignFaction.id}.relations.${otherId}` }, visibility: 'dm' as const },
      provenance: { layer: 'event-state' as const, sourceId: `state.world.factions.${campaignFaction.id}.relations.${otherId}` }, visibility: 'dm' as const,
    }] : [];
  }) : [];
  const positions: SubjectPosition[] = audience === 'dm' ? (organization.places ?? []).map(id => ({
    kind: 'linked-place', role: 'associated', place: subjectReference('place', id, context.placeNames?.[id] ?? id, `${src}.places`, 'players', citation),
    provenance: referenceValue('places'), visibility: 'dm',
  })) : [];
  const uniqueMembers = [...new Map(members.map(member => [member[0], member] as const)).values()];
  const composition: SubjectCompositionMember[] = audience === 'dm' ? uniqueMembers.map(([id, name], index) => ({
    relation: 'organization-membership', target: subjectReference('person', id, name, `content/world/org-members.json#${organization.id}`, 'dm', memberCitation),
    order: index, certainty: 'category-ever-member',
    provenance: { layer: 'reference', sourceId: `content/world/org-members.json#${organization.id}`, ...(memberCitation ? { citation: memberCitation } : {}) }, visibility: 'dm',
  })) : [];
  const envelope = {
    contractVersion: 1, profileId: 'organization', subjectId: orgRef, audience,
    slots: {
      core: { status: 'present', values: { name: knowledge.name ?? organization.name, referenceRef: subjectReference('organization', organization.id, knowledge.name ?? organization.name, src), ...(audience === 'dm' && campaignFaction ? { campaignRef: subjectReference('faction', campaignFaction.id, campaignFaction.name, `state.world.factions.${campaignFaction.id}`) } : {}) } },
      indicators: audience === 'dm' && campaignFaction ? { status: 'present', values: {
        renown: { kind: 'count', value: campaignFaction.renown, unit: 'известность', provenance: { layer: 'event-state', sourceId: `state.world.factions.${campaignFaction.id}.renown` }, visibility: 'dm' },
        ...(campaignFaction.standing !== undefined ? { standing: { kind: 'count', value: campaignFaction.standing, unit: 'standing', provenance: { layer: 'event-state', sourceId: `state.world.factions.${campaignFaction.id}.standing` }, visibility: 'dm' } } : {}),
        ...(campaignFaction.influencePercent !== undefined ? { influence: { kind: 'measure', value: campaignFaction.influencePercent, unit: '%', provenance: { layer: 'event-state', sourceId: `state.world.factions.${campaignFaction.id}.influencePercent` }, visibility: 'dm' } } : {}),
        ...(campaignFaction.trend !== undefined ? { trend: { kind: 'measure', value: campaignFaction.trend, unit: 'за шаг', provenance: { layer: 'event-state', sourceId: `state.world.factions.${campaignFaction.id}.trend` }, visibility: 'dm' } } : {}),
      } } : { status: 'empty' },
      characteristics: Object.keys(characteristics).length ? { status: 'present', values: characteristics } : audience === 'dm' ? { status: 'empty' } : { status: 'empty' },
      resources: { status: 'not-applicable' }, conditions: { status: 'not-applicable' }, capabilities: { status: 'not-applicable' },
      composition: composition.length ? { status: 'present', values: composition } : { status: 'empty' },
      relations: relationValues.length || campaignRelations.length ? { status: 'present', values: [...relationValues, ...campaignRelations] } : { status: 'empty' },
      position: positions.length ? { status: 'present', values: positions } : { status: 'empty' }, history: { status: 'empty' },
      knowledge: knowledge.facts.length ? { status: 'present', values: knowledge.facts } : { status: 'empty' },
      ...(audience === 'dm' ? { secrets: knowledge.secrets.length ? { status: 'present', values: knowledge.secrets } : { status: 'empty' } } : {}),
    },
  } as unknown as AnySubjectEnvelope;
  return validatedEnvelope<'organization', A>(envelope, 'organization');
}

export interface KingdomSubjectContext {
  /** Existing map names for linked territory places; unresolved ids are omitted from the display. */
  placeNames?: Readonly<Record<string, string>>;
  /** Canonical directory names keyed by entity ref, e.g. `organization:harpers`. */
  relatedNames?: Readonly<Record<string, string>>;
}

/** Kingdom history is shown only from a source record; campaign faction values stay DM-only. */
export function kingdomSubjectEnvelope<A extends SubjectAudience>(
  state: State,
  kingdom: Kingdom,
  audience: A,
  year: number | null,
  historyLines: readonly KingdomHistoryLine[] = [],
  context: KingdomSubjectContext = {},
): SubjectEnvelope<'kingdom', A> | null {
  const kingdomRef = ref('kingdom', kingdom.id);
  const knowledge = campaignKnowledge(state, kingdomRef, audience);
  if (!knowledge) return null;
  const campaignFaction = Object.values(state.world.factions).find(faction => faction.ref === kingdomRef);
  const src = `content/world/kingdoms.json#${kingdom.id}`;
  const citation = { title: kingdom.name, url: kingdomUrl(kingdom), license: 'CC BY-SA 3.0' };
  const referenceValue = (field: string): SubjectProvenance => ({ layer: 'reference', sourceId: `${src}.${field}`, citation });
  const text = (field: string, value: string | undefined): SubjectText | undefined => value ? {
    kind: 'text', value, provenance: referenceValue(field), visibility: 'players',
  } : undefined;
  const count = (field: string, value: number | undefined): SubjectCount | undefined => value !== undefined ? {
    kind: 'count', value, unit: 'DR', provenance: referenceValue(field), visibility: 'players',
  } : undefined;
  const history: SubjectTimelineEntry[] = audience === 'dm' ? [
    ...(kingdom.milestones ?? []).flatMap((milestone, index) => {
      const date = milestone.when ?? (milestone.year !== undefined ? `${milestone.year} DR` : undefined);
      return date ? [{
        at: { kind: 'canonical-date' as const, value: date, provenance: referenceValue(`milestones.${index}`), visibility: 'players' as const },
        text: { kind: 'text' as const, value: milestone.t, provenance: referenceValue(`milestones.${index}`), visibility: 'players' as const },
      }] : [];
    }),
    ...historyLines.map(line => {
      const date = line.when ?? (line.to !== undefined && line.to !== line.year
        ? `${line.year}–${line.to} DR`
        : `${line.year} DR`);
      const citations: SubjectCitation[] = [
        ...(line.sourceTitle ? [{ title: line.sourceTitle, ...(line.sourceUrl ? { url: line.sourceUrl } : {}), license: 'CC BY-SA 3.0' }] : []),
        ...(line.cites ?? []).map(title => ({ title, license: 'CC BY-SA 3.0' })),
      ];
      const provenance: SubjectProvenance = {
        ...referenceValue(`events.${line.id}`),
        ...(citations.length ? { citation: citations[0], ...(citations.length > 1 ? { citations: citations.slice(1) } : {}) } : {}),
      };
      return {
        at: { kind: 'canonical-date' as const, value: date, provenance, visibility: 'players' as const },
        text: { kind: 'text' as const, value: line.text, provenance, visibility: 'players' as const },
      };
    }),
  ] : [];
  const rulerResult = audience === 'dm' && year !== null ? rulersShown(kingdom, year) : { rulers: [] };
  const rulers = rulerResult.rulers.filter(ruler => ruler.person);
  const rulerNames = rulerResult.rulers.map((ruler, index) => ({
    kind: 'text' as const,
    value: rulerResult.note ? `${rulerName(ruler)} (${rulerResult.note})` : rulerName(ruler),
    provenance: referenceValue(`rulers.${year ?? 'unspecified'}.${index}`),
    visibility: 'players' as const,
  }));
  const characteristics = audience === 'dm' ? {
    ...(text('type', kingdom.type) ? { type: text('type', kingdom.type) } : {}),
    ...(text('government', kingdom.government) ? { government: text('government', kingdom.government) } : {}),
    ...(kingdom.capitalPlace ? { capital: subjectReference('place', kingdom.capitalPlace, kingdom.capital ?? kingdom.capitalPlace, `${src}.capitalPlace`, 'players', citation) } : {}),
    ...(text('population', kingdom.population) ? { populationText: text('population', kingdom.population) } : {}),
    ...(kingdom.languages?.length ? { languages: kingdom.languages.map((value, index) => ({ kind: 'text' as const, value, provenance: referenceValue(`languages.${index}`), visibility: 'players' as const })) } : {}),
    ...(rulers.length ? { rulers: rulers.map(ruler => subjectReference('person', ruler.person!, ruler.t, `${src}.rulers.${year ?? 'unspecified'}`, 'players', citation)) } : {}),
    ...(rulerNames.length ? { rulerNames } : {}),
    ...(text('races', kingdom.races) ? { races: text('races', kingdom.races) } : {}),
    ...(text('currency', kingdom.currency) ? { currency: text('currency', kingdom.currency) } : {}),
    ...(text('exports', kingdom.exports) ? { exports: text('exports', kingdom.exports) } : {}),
    ...(text('imports', kingdom.imports) ? { imports: text('imports', kingdom.imports) } : {}),
    ...(text('deityText', kingdom.deityText) ? { deityText: text('deityText', kingdom.deityText) } : {}),
    ...(text('region', kingdom.region) ? { region: text('region', kingdom.region) } : {}),
    ...(text('continent', kingdom.continent) ? { continent: text('continent', kingdom.continent) } : {}),
    ...(text('demonym', kingdom.demonym) ? { demonym: text('demonym', kingdom.demonym) } : {}),
    ...(count('founded', kingdom.founded) ? { founded: count('founded', kingdom.founded) } : {}),
    ...(count('dissolved', kingdom.dissolved) ? { dissolved: count('dissolved', kingdom.dissolved) } : {}),
    ...(text('summary', kingdom.summary) ? { summary: text('summary', kingdom.summary) } : {}),
  } : {};
  const relationValues = audience === 'dm' ? [
    ...(kingdom.allies ?? []).map(id => ({ kind: 'ally', direction: 'outgoing' as const, target: subjectReference('kingdom', id, context.relatedNames?.[`kingdom:${id}`] ?? id, `${src}.allies`, 'players', citation), provenance: referenceValue('allies'), visibility: 'players' as const })),
    ...(kingdom.enemies ?? []).map(id => ({ kind: 'enemy', direction: 'outgoing' as const, target: subjectReference('kingdom', id, context.relatedNames?.[`kingdom:${id}`] ?? id, `${src}.enemies`, 'players', citation), provenance: referenceValue('enemies'), visibility: 'players' as const })),
    ...(kingdom.allyOrgs ?? []).map(id => ({ kind: 'ally', direction: 'outgoing' as const, target: subjectReference('organization', id, context.relatedNames?.[`organization:${id}`] ?? id, `${src}.allyOrgs`, 'players', citation), provenance: referenceValue('allyOrgs'), visibility: 'players' as const })),
    ...(kingdom.enemyOrgs ?? []).map(id => ({ kind: 'enemy', direction: 'outgoing' as const, target: subjectReference('organization', id, context.relatedNames?.[`organization:${id}`] ?? id, `${src}.enemyOrgs`, 'players', citation), provenance: referenceValue('enemyOrgs'), visibility: 'players' as const })),
    ...(kingdom.deities ?? []).map(id => ({ kind: 'associated-with', direction: 'outgoing' as const, target: subjectReference('deity', id, context.relatedNames?.[`deity:${id}`] ?? id, `${src}.deities`, 'players', citation), provenance: referenceValue('deities'), visibility: 'players' as const })),
    ...(kingdom.predecessors ?? []).map(id => ({ kind: 'predecessor', direction: 'incoming' as const, target: subjectReference('kingdom', id, context.relatedNames?.[`kingdom:${id}`] ?? id, `${src}.predecessors`, 'players', citation), provenance: referenceValue('predecessors'), visibility: 'players' as const })),
    ...(kingdom.successors ?? []).map(id => ({ kind: 'successor', direction: 'outgoing' as const, target: subjectReference('kingdom', id, context.relatedNames?.[`kingdom:${id}`] ?? id, `${src}.successors`, 'players', citation), provenance: referenceValue('successors'), visibility: 'players' as const })),
  ] : [];
  const campaignRelations = audience === 'dm' && campaignFaction ? Object.entries(campaignFaction.relations ?? {}).flatMap(([otherId, value]) => {
    const other = state.world.factions[otherId];
    return other ? [{
      kind: 'campaign-relation', direction: 'symmetric' as const,
      target: subjectReference('faction', other.id, other.name, `state.world.factions.${other.id}`),
      value: { kind: 'text' as const, value: String(value), provenance: { layer: 'event-state' as const, sourceId: `state.world.factions.${campaignFaction.id}.relations.${otherId}` }, visibility: 'dm' as const },
      provenance: { layer: 'event-state' as const, sourceId: `state.world.factions.${campaignFaction.id}.relations.${otherId}` }, visibility: 'dm' as const,
    }] : [];
  }) : [];
  const territoryPlaces = uniqueIds(kingdom.places).flatMap(id => {
    const name = context.placeNames?.[id];
    return name ? [{ relation: 'territory-place' as const, target: subjectReference('place', id, name, `${src}.places`, 'dm', citation), provenance: referenceValue('places'), visibility: 'dm' as const }] : [];
  });
  const compositions: SubjectCompositionMember[] = audience === 'dm' ? [
    ...territoryPlaces,
    ...uniqueIds(kingdom.orgs).map(id => ({ relation: 'organization' as const, target: subjectReference('organization', id, context.relatedNames?.[`organization:${id}`] ?? id, `${src}.orgs`, 'dm', citation), provenance: referenceValue('orgs'), visibility: 'dm' as const })),
    ...uniqueIds(kingdom.within).map(id => ({ relation: 'within' as const, target: subjectReference('kingdom', id, context.relatedNames?.[`kingdom:${id}`] ?? id, `${src}.within`, 'dm', citation), provenance: referenceValue('within'), visibility: 'dm' as const })),
  ] : [];
  const positions: SubjectPosition[] = audience === 'dm' ? [
    ...(kingdom.capitalPlace ? [{ kind: 'linked-place' as const, role: 'capital' as const, place: subjectReference('place', kingdom.capitalPlace, kingdom.capital ?? kingdom.capitalPlace, `${src}.capitalPlace`, 'dm', citation), provenance: referenceValue('capitalPlace'), visibility: 'dm' as const }] : []),
    ...(kingdom.place ? [{ kind: 'linked-place' as const, role: 'represented' as const, place: subjectReference('place', kingdom.place, kingdom.name, `${src}.place`, 'dm', citation), provenance: referenceValue('place'), visibility: 'dm' as const }] : []),
    ...territoryPlaces.map(member => ({ kind: 'linked-place' as const, role: 'represented' as const, place: member.target, provenance: referenceValue('places'), visibility: 'dm' as const })),
  ] : [];
  const envelope = {
    contractVersion: 1, profileId: 'kingdom', subjectId: kingdomRef, audience,
    slots: {
      core: { status: 'present', values: { name: knowledge.name ?? kingdom.name, referenceRef: subjectReference('kingdom', kingdom.id, knowledge.name ?? kingdom.name, src, 'players', citation), ...(audience === 'dm' && campaignFaction ? { campaignRef: subjectReference('faction', campaignFaction.id, campaignFaction.name, `state.world.factions.${campaignFaction.id}`) } : {}) } },
      indicators: audience === 'dm' && campaignFaction ? { status: 'present', values: {
        renown: { kind: 'count', value: campaignFaction.renown, unit: 'известность', provenance: { layer: 'event-state', sourceId: `state.world.factions.${campaignFaction.id}.renown` }, visibility: 'dm' },
        ...(campaignFaction.standing !== undefined ? { standing: { kind: 'count', value: campaignFaction.standing, unit: 'standing', provenance: { layer: 'event-state', sourceId: `state.world.factions.${campaignFaction.id}.standing` }, visibility: 'dm' } } : {}),
        ...(campaignFaction.influencePercent !== undefined ? { influence: { kind: 'measure', value: campaignFaction.influencePercent, unit: '%', provenance: { layer: 'event-state', sourceId: `state.world.factions.${campaignFaction.id}.influencePercent` }, visibility: 'dm' } } : {}),
        ...(campaignFaction.trend !== undefined ? { trend: { kind: 'measure', value: campaignFaction.trend, unit: 'за шаг', provenance: { layer: 'event-state', sourceId: `state.world.factions.${campaignFaction.id}.trend` }, visibility: 'dm' } } : {}),
      } } : { status: 'empty' },
      characteristics: Object.keys(characteristics).length ? { status: 'present', values: characteristics } : { status: 'empty' },
      resources: { status: 'not-applicable' }, conditions: { status: 'not-applicable' }, capabilities: { status: 'not-applicable' },
      composition: compositions.length ? { status: 'present', values: compositions } : { status: 'empty' },
      relations: relationValues.length || campaignRelations.length ? { status: 'present', values: [...relationValues, ...campaignRelations] } : { status: 'empty' },
      position: positions.length ? { status: 'present', values: positions } : { status: 'empty' },
      history: history.length ? { status: 'present', values: history } : { status: 'empty' },
      knowledge: knowledge.facts.length ? { status: 'present', values: knowledge.facts } : { status: 'empty' },
      ...(audience === 'dm' ? { secrets: knowledge.secrets.length ? { status: 'present', values: knowledge.secrets } : { status: 'empty' } } : {}),
    },
  } as unknown as AnySubjectEnvelope;
  return validatedEnvelope<'kingdom', A>(envelope, 'kingdom');
}

/** Read-only adapter for the campaign party. It never treats the last journey or a fallback map focus as current position. */
export function partySubjectEnvelope<A extends SubjectAudience>(state: State, audience: A): SubjectEnvelope<'party', A> {
  const members = [...new Set(state.party)]
    .map(id => state.actors[id])
    .filter(actor => actor && !actor.removed);
  const derived = (sourceId: string): SubjectProvenance => ({ layer: 'derived', sourceId });
  const stateRef = (kind: 'actor' | 'location', id: string, sourceId: string, label: string): SubjectReference => ({
    kind: 'reference', value: ref(kind, id), label, provenance: { layer: 'event-state', sourceId }, visibility: 'players',
  });

  const locations = members.map(member => member.locationId ? state.world.locations[member.locationId] : undefined);
  const firstLocation = locations[0];
  const sharedLocation = firstLocation && locations.every(location => location?.id === firstLocation.id) ? firstLocation : undefined;
  const visibleLocation = sharedLocation && (audience === 'dm' || sharedLocation.revealed)
    ? sharedLocation
    : undefined;
  const position: SubjectPosition[] = visibleLocation ? [{
    kind: 'place',
    place: stateRef('location', visibleLocation.id, `state.world.locations.${visibleLocation.id}`, visibleLocation.name),
    scale: visibleLocation.scale,
    provenance: { layer: 'event-state', sourceId: `state.world.locations.${visibleLocation.id}` },
    visibility: 'players',
  }] : [];

  const supply = {
    id: 'party-supply', label: 'Запас партии', current: state.supply ?? 0, unit: 'Supply',
    provenance: state.supply === undefined
      ? derived('state.supply ?? 0 (legacy default)')
      : { layer: 'event-state' as const, sourceId: 'state.supply' },
    visibility: 'players' as const,
  };
  const slots = {
    core: { status: 'present', values: { memberCount: {
      kind: 'count', value: members.length, unit: 'участник', provenance: derived('active State.party members'), visibility: 'public',
    } } },
    indicators: { status: 'empty' },
    characteristics: { status: 'not-applicable' },
    resources: { status: 'present', values: [supply] },
    conditions: { status: 'not-applicable' },
    capabilities: { status: 'not-applicable' },
    composition: members.length
      ? { status: 'present', values: members.map((member, order) => ({
        relation: 'party-member' as const, target: stateRef('actor', member.id, `state.actors.${member.id}`, member.name), order,
        provenance: { layer: 'event-state' as const, sourceId: `state.party.${order}` }, visibility: 'players' as const,
      })) }
      : { status: 'empty' },
    relations: { status: 'empty' },
    position: position.length ? { status: 'present', values: position } : { status: 'empty' },
    history: { status: 'empty' },
    knowledge: { status: 'empty' },
    ...(audience === 'dm' ? { secrets: { status: 'empty' } } : {}),
  };
  const envelope: AnySubjectEnvelope = {
    contractVersion: 1,
    profileId: 'party',
    subjectId: 'party',
    audience,
    slots,
  } as AnySubjectEnvelope;
  const issues = validateSubjectEnvelope(envelope);
  if (issues.length) throw new Error(`Party adapter violated Subject v1: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
  return envelope as SubjectEnvelope<'party', A>;
}
