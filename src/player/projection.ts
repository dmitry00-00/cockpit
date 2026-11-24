import type { State, Actor } from '../engine/state';
import { ABILITY_LABEL, SKILL_LABEL } from '../components/labels';
import { classIcon, raceIcon } from '../components/sheetIcons';
import { chipsOf } from '../components/ConditionChip';
import { resolvePortrait } from '../art/portrait';
import { calendarAdapterForState } from '../campaign/calendar';
import { sheetViewOf } from '../campaign/sheetView';
import { poolLabel, resourcePoolsOf } from '../campaign/resources';
import { classById, raceById } from '../rules/compendium';
import { CONDITIONS } from '../rules/srd/conditions';
import { DAMAGE_LABEL, ITEMS } from '../rules/srd/equipment';
import { SPELLS } from '../rules/srd/spells';
import { spellActionsOf } from '../campaign/characterCard';
import { COIN_BY_ID } from '../rules/srd/coins';
import { withPlayerVisibleInventory } from '../engine/inventory';
import { filterJournal, journalEntries } from '../engine/journal';
import { adventureFactRecordId, adventureHandoutsForPlayers } from '../packages/adventure';
import type { DomainEvent } from '../engine/events';
import type { PlayerAdventureNote, PlayerCardProjection, PlayerCondition, PlayerEncounter, PlayerHero, PlayerProjection, PlayerUpdate, PlayerWorldTime } from './types';

const TEMPO_LABEL: Readonly<Record<State['time']['tempo'], string>> = {
  round: 'Раунд', '10min': '10 минут', hour: 'Час', day: 'День', tenday: 'Декада', season: 'Сезон', year: 'Год',
};

function conditionsOf(actor: Actor): PlayerCondition[] {
  return Object.entries(actor.conditions).flatMap(([id, snapshot]) => {
    const condition = CONDITIONS[id as keyof typeof CONDITIONS];
    if (!condition || !snapshot) return [];
    return [{ label: condition.label, ...(id === 'exhaustion' && snapshot.level !== undefined ? { level: snapshot.level } : {}) }];
  });
}

function heroOf(actor: Actor): PlayerHero | null {
  const sheet = actor.sheet;
  if (actor.kind !== 'pc' || !sheet) return null;
  const view = sheetViewOf(actor);
  if (!view) return null;
  const cls = classById(sheet.classId);
  const ancestry = raceById(sheet.raceId);
  const subclass = cls?.subclasses.find(row => row.id === sheet.subclassId);
  const features = [
    ...sheet.features.map(feature => ({ kind: 'class' as const, name: feature.name, level: feature.level })),
    ...sheet.traits.map(trait => ({ kind: 'ancestry' as const, name: trait.name })),
    ...(sheet.feats ?? []).map(feat => ({ kind: 'feat' as const, name: feat.name, ...(typeof feat.at === 'number' ? { level: feat.at } : {}) })),
  ];
  const resourcePools = resourcePoolsOf(actor);
  const pools = resourcePools.map(pool => ({
    label: poolLabel(pool), available: pool.available, maximum: pool.max, restoresOn: pool.restoresOn,
  }));
  const favor = Object.entries(actor.a5eFavor ?? {}).flatMap(([deityRef, amount]) => {
    if (!Number.isSafeInteger(amount) || (amount ?? 0) < 1) return [];
    const deityName = sheet.deity && deityRef === `deity:${sheet.deity.id}` ? sheet.deity.name : deityRef.replace(/^deity:/, '');
    return [{ deity: deityName, amount: amount! }];
  });
  const equipment = (sheet.equipment ?? []).flatMap(line => {
    const item = ITEMS[line.id];
    const coin = COIN_BY_ID[line.id as keyof typeof COIN_BY_ID];
    return item ? [{ name: item.name, quantity: line.qty }] : coin ? [{ name: `${coin.name} (${coin.short})`, quantity: line.qty }] : [];
  });
  const spellcasting = sheet.spellcasting;
  const spells = spellcasting ? (() => {
    const always = new Set(spellcasting.always);
    const cantrips = new Set(spellcasting.cantrips);
    const ids = [...new Set([...spellcasting.cantrips, ...spellcasting.spells, ...spellcasting.always])];
    return ids.flatMap(id => {
      const spell = SPELLS[id];
      if (!spell) return [];
      const kind = cantrips.has(id) ? 'cantrip' as const : always.has(id) ? 'always prepared' as const
        : spellcasting.kind === 'spellbook' ? 'in spellbook' as const : spellcasting.kind;
      return [{ name: spell.name, kind, level: spell.level }];
    });
  })() : [];
  return {
    name: actor.name,
    ancestry: ancestry?.nameRu ?? ancestry?.name ?? 'Происхождение не указано',
    className: cls?.nameRu ?? cls?.name ?? 'Класс не указан',
    ...(subclass?.name ? { subclassName: subclass.name } : {}),
    level: sheet.level,
    hp: { current: actor.hp.current, maximum: actor.hp.max, temporary: actor.hp.temp },
    armorClass: actor.ac,
    abilities: view.abilities.map(ability => ({
      label: ABILITY_LABEL[ability.id], score: ability.score, modifier: ability.mod,
      savingThrow: ability.save, savingThrowProficient: ability.saveProficient,
    })),
    skills: view.skills.map(skill => ({ label: SKILL_LABEL[skill.id], modifier: skill.mod, proficiency: skill.proficiency })),
    attacks: (sheet.attacks ?? []).map(attack => ({
      name: attack.name, toHit: attack.toHit, damage: attack.damage,
      damageType: DAMAGE_LABEL[attack.damageType] ?? attack.damageType,
      ...(attack.range ? { range: attack.range } : {}),
    })),
    resources: pools,
    ...(favor.length ? { favor } : {}),
    conditions: conditionsOf(actor),
    equipment,
    features,
    spells,
  };
}

function worldTimeOf(state: State): PlayerWorldTime {
  const calendar = calendarAdapterForState(state);
  return {
    date: calendar.formatDateOnly(state.time.sec),
    time: calendar.formatTime(state.time.sec),
    tempo: TEMPO_LABEL[state.time.tempo],
  };
}

function encounterOf(state: State): PlayerEncounter {
  if (!state.encounter.active) return { active: false, currentTurn: null };
  const currentId = state.encounter.order[state.encounter.turnIndex];
  const current = currentId ? state.actors[currentId] : undefined;
  return {
    active: true,
    round: state.encounter.round,
    currentTurn: current?.kind === 'pc' ? 'party' : 'opponents',
  };
}

function adventureNotesOf(state: State, actorId: string): PlayerAdventureNote[] {
  return Object.values(state.world.adventureSessions ?? {}).flatMap(session => {
    if (session.status !== 'active' || !session.partyIds.includes(actorId)) return [];
    const revealed = new Set(session.graph.nodes.flatMap(node => node.kind === 'fact' && state.facts[adventureFactRecordId(session.id, node.id)]?.visibility === 'players' ? [node.id] : []));
    return adventureHandoutsForPlayers(session.graph, revealed).map(handout => ({
      id: `${session.id}:${handout.id}`,
      adventureTitle: session.title,
      title: handout.name,
      summary: handout.summary,
      entries: handout.entries,
    }));
  });
}

function playerRumorsOf(state: State): { text: string; location: string }[] {
  const locationCounts = new Map<string, number>();
  for (const id of state.party) {
    const actor = state.actors[id];
    if (actor && !actor.removed && actor.locationId) locationCounts.set(actor.locationId, (locationCounts.get(actor.locationId) ?? 0) + 1);
  }
  const locationId = [...locationCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const location = locationId ? state.world.locations[locationId] : undefined;
  const nearby = new Set<string>();
  let current: State['world']['locations'][string] | undefined = location;
  while (current && !nearby.has(current.id)) {
    nearby.add(current.id);
    current = current.parentId ? state.world.locations[current.parentId] : undefined;
  }
  const descendants = [location].filter((item): item is NonNullable<typeof item> => !!item);
  while (descendants.length) {
    const parent = descendants.pop()!;
    for (const child of Object.values(state.world.locations)) {
      if (child.parentId !== parent.id || nearby.has(child.id)) continue;
      nearby.add(child.id);
      descendants.push(child);
    }
  }
  return Object.values(state.facts)
    .filter(fact => fact.category === 'rumor' && fact.visibility === 'players' && !!fact.subjectId && nearby.has(fact.subjectId))
    .map(fact => ({ text: fact.text, location: state.world.locations[fact.subjectId!]?.name ?? 'рядом' }))
    .sort((a, b) => a.text.localeCompare(b.text, 'ru'));
}

/**
 * Build a positive-allowlist view for one assigned PC. Never serialize an Actor, CharacterSheet or State directly.
 * This must run on the trusted host before data crosses the player transport boundary.
 */
export function projectPlayer(
  state: State, actorId: string, revision = 0, now = Date.now(), events: readonly DomainEvent[] = [],
  precomputedUpdates?: readonly PlayerUpdate[],
): PlayerProjection | null {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('revision must be a non-negative safe integer');
  const actor = state.actors[actorId];
  if (!actor || actor.removed || !state.party.includes(actorId)) return null;
  const projectedActor = state.inventory ? withPlayerVisibleInventory(actor, state.inventory) : actor;
  const hero = heroOf(projectedActor);
  if (!hero) return null;
  const activeId = state.encounter.active ? state.encounter.order[state.encounter.turnIndex] : undefined;
  const party = state.party.flatMap(id => {
    const member = state.actors[id];
    if (!member || member.kind !== 'pc' || member.removed) return [];
    return [{
      name: member.name,
      hp: { current: member.hp.current, maximum: member.hp.max, temporary: member.hp.temp },
      conditions: conditionsOf(member),
      currentTurn: member.id === activeId,
    }];
  });
  const updates = precomputedUpdates ?? publicPlayerUpdatesOf(state, events);
  const adventureNotes = adventureNotesOf(state, actorId);
  const rumors = playerRumorsOf(state);
  return {
    schemaVersion: 1,
    revision,
    updatedAt: new Date(now).toISOString(),
    hero,
    party,
    worldTime: worldTimeOf(state),
    encounter: encounterOf(state),
    updates,
    ...(adventureNotes.length ? { adventureNotes } : {}),
    ...(rumors.length ? { rumors } : {}),
  };
}

/** Positive allowlist for the shared mobile card UI, separate from the original projection contract. */
export function playerCardProjectionOf(state: State, actorId: string, nowSec = state.time.sec): PlayerCardProjection | null {
  const actor = state.actors[actorId];
  if (!actor || actor.removed || !state.party.includes(actorId) || actor.kind !== 'pc' || !actor.sheet) return null;
  const projectedActor = state.inventory ? withPlayerVisibleInventory(actor, state.inventory) : actor;
  const sheet = projectedActor.sheet!;
  const view = sheetViewOf(projectedActor);
  if (!view) return null;
  const cls = classById(sheet.classId);
  const ancestry = raceById(sheet.raceId);
  const subrace = ancestry?.subraces.find(row => row.id === sheet.subraceId);
  const subclass = cls?.subclasses.find(row => row.id === sheet.subclassId);
  const portrait = resolvePortrait(sheet.portrait);
  const spellcasting = sheet.spellcasting;
  return {
    title: [ancestry?.nameRu ?? ancestry?.name, subrace?.nameRu, cls?.nameRu ?? cls?.name, subclass?.name].filter(Boolean).join(' · '),
    emblems: [
      { icon: raceIcon(sheet.raceId), title: ancestry?.nameRu ?? ancestry?.name ?? 'Происхождение' },
      { icon: classIcon(sheet.classId), title: cls?.nameRu ?? cls?.name ?? 'Класс' },
    ],
    ...(portrait ? { portrait } : {}),
    initiative: view.initiative,
    passivePerception: projectedActor.passivePerception,
    proficiencyBonus: view.proficiencyBonus,
    ...(view.hitDice ? { hitDice: view.hitDice } : {}),
    abilities: view.abilities,
    skills: view.skills,
    pools: resourcePoolsOf(projectedActor).map(pool => ({
      id: pool.id, label: poolLabel(pool), max: pool.max, spent: pool.spent, kind: pool.kind, restoresOn: pool.restoresOn,
    })),
    chips: chipsOf(projectedActor, nowSec).map(({ id, key, label, icon, kind, timer, level }) => ({
      id, key, label, icon, ...(kind ? { kind } : {}), ...(timer ? { timer } : {}), ...(level !== undefined ? { level } : {}),
    })),
    attacks: (sheet.attacks ?? []).map(attack => ({ id: attack.id, name: attack.name, toHit: attack.toHit, damage: attack.damage })),
    ...(spellcasting ? { spells: { dc: spellcasting.saveDc, attack: spellcasting.attack }, spellActions: spellActionsOf(projectedActor) } : {}),
  };
}

/** Build a positive allowlist once per host publication; event IDs and secrets never cross this boundary. */
export function publicPlayerUpdatesOf(state: State, events: readonly DomainEvent[]): PlayerUpdate[] {
  return filterJournal(journalEntries(events, state), { dmView: false }).slice(-20).map(entry => ({
    id: entry.id, at: entry.at, worldSec: entry.worldSec, text: entry.text,
  }));
}
