import { act, fireEvent, render, screen } from '@testing-library/react';
import { Children, isValidElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../../campaign/seed';
import { createEngineStore, memoryStore, type DomainEvent, type Location, type State } from '../../engine';
import { LOCATION } from '../../campaign/world';
import type { LevelMap } from '../../map/levelMap';
import { mapById } from '../../map/maps';
import type { WorldMapProps } from '../../map/WorldMap';
import { LevelZone } from './LevelZone';
import type { AdventureSession } from '../../engine/state';

const worldMapProbe = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('../../lazyParts', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lazyParts')>();
  const React = await import('react');
  return {
    ...actual,
    WorldMap: (unknownProps: unknown) => {
      const props = unknownProps as WorldMapProps;
      worldMapProbe.calls.push(props);
      return React.createElement('div', { 'data-testid': 'world-map-projection' },
        props.pins.map(pin => React.createElement('span', { key: pin.id, 'data-pin-id': pin.id }, pin.name)),
        React.createElement('div', { 'data-testid': 'world-map-tools' }, props.tools));
    },
  };
});

const hiddenId = 'hidden-supply-cache';
const privateFactText = 'Secret cache is guarded by Zhentarim';
const secretFrontName = 'Secret route north';

function fixture() {
  const state = seedState();
  const hidden: Location = {
    id: hiddenId,
    name: 'Hidden Supply Cache',
    scale: 'region',
    parentId: LOCATION.faerun,
    geo: { map: 'toril', x: 8700, y: 2700, r: 30 },
  };
  state.world.locations[hiddenId] = hidden;
  state.facts['secret-cache-fact'] = {
    id: 'secret-cache-fact', text: privateFactText, visibility: 'dm', scale: 'region', subjectId: hiddenId,
  };
  state.world.processes = {
    'secret-war-front': {
      id: 'secret-war-front', kind: 'war', name: 'Private northern front', scale: 'region', stage: 'campaign',
      parties: [], at: hiddenId, startedSec: 0, nextSec: 1, vars: {},
      data: { kind: 'war', version: 1, front: { map: 'toril', nodes: [
        { id: 'front-a', name: secretFrontName, x: 8600, y: 2600 },
        { id: 'front-b', name: 'Secret route south', x: 8800, y: 2800 },
      ] } },
    },
  };

  const passport = mapById('toril')!;
  const map: LevelMap = {
    passport,
    frame: { x0: 0, y0: 0, x1: passport.width, y1: passport.height },
    frameKey: 'continent:test',
    places: [hidden],
    party: { x: 8750, y: 2700 },
  };
  const store = createEngineStore(state, { persist: memoryStore() });
  const events = () => store.getState().events;
  const props = (dmView: boolean, current: State = store.getState().state, currentEvents: readonly DomainEvent[] = events()) => ({
    state: current,
    events: currentEvents,
    ladder: { level: 'continent' as const, path: { planet: LOCATION.toril, continent: LOCATION.faerun } },
    focus: current.world.locations[LOCATION.faerun],
    here: [current.world.locations[hiddenId]],
    dmView,
    combat: false,
    cardInCombat: false,
    counts: new Map([[hiddenId, 1]]),
    pendingIds: dmView ? new Set([hiddenId]) : new Set<string>(),
    map: { ...map, places: [current.world.locations[hiddenId]] },
    terrain: null,
    roads: null,
    schema: null,
    underdark: [],
    gazetteer: [{ id: 'secret-catalog-place', name: 'Private Gazetteer Place', kind: 'settlement' }] as never,
    lens: { year: 1492, marks: new Map([['secret-catalog-place', ['Private canon event']]]), onClear: vi.fn() },
    onScene: vi.fn(),
    planetView: 'map' as const,
    onPlanetView: vi.fn(),
    cosmologyView: 'wheel' as const,
    onCosmologyView: vi.fn(),
    journey: { tier: 2 as const, members: 4, onEncounter: vi.fn(), onWeather: vi.fn() },
    onTravel: vi.fn(),
    goLadder: vi.fn(),
    onPin: vi.fn(),
    onNewPlace: vi.fn(),
    onGeoreference: vi.fn(),
    tensions: [],
    influence: { bases: new Map([['secret-catalog-place', ['Private faction']]]), tensions: new Map() },
    stacks: null,
    card: null,
  });
  return { store, map, props };
}

function latestMapProps(): WorldMapProps {
  return worldMapProbe.calls.at(-1) as WorldMapProps;
}

function playerToolCount(props: WorldMapProps): number {
  if (!isValidElement<{ children?: ReactNode }>(props.tools)) return 0;
  return Children.toArray(props.tools.props.children).length;
}

describe('LevelZone player map projection', () => {
  beforeEach(() => { worldMapProbe.calls.length = 0; });

  it('omits unrevealed locations, reveals and undoes only the player pin, and withholds DM map props', () => {
    const { store, props } = fixture();
    const player = render(<LevelZone {...props(false)} />);
    let playerMap = latestMapProps();
    expect(playerMap.pins.some(pin => pin.id === hiddenId)).toBe(false);
    expect(player.container.querySelector(`[data-pin-id="${hiddenId}"]`)).toBeNull();
    expect(player.container.textContent).not.toContain('Hidden Supply Cache');
    expect(JSON.stringify(playerMap.pins)).not.toContain(privateFactText);
    const playerPropsText = JSON.stringify({ pins: playerMap.pins, warFronts: playerMap.warFronts, processMarkers: playerMap.processMarkers, travel: playerMap.travel });
    expect(playerPropsText).not.toContain(hiddenId);
    expect(playerPropsText).not.toContain('Hidden Supply Cache');
    expect(playerPropsText).not.toContain(privateFactText);
    expect(playerPropsText).not.toContain(secretFrontName);

    const dm = render(<LevelZone {...props(true)} />);
    const dmMap = latestMapProps();
    const dmPin = dmMap.pins.find(pin => pin.id === hiddenId);
    expect(dmPin).toMatchObject({ id: hiddenId, name: 'Hidden Supply Cache', count: 1, pending: true });
    expect(dmPin?.facts).toContainEqual({ id: 'secret-cache-fact', text: privateFactText, secret: true });
    expect(dm.container.querySelector(`[data-pin-id="${hiddenId}"]`)).toHaveTextContent('Hidden Supply Cache');
    expect(dmMap.travel).toBeDefined();
    expect(dmMap.newPlace).toBeDefined();
    expect(dmMap.georeference).toBeDefined();
    expect(dmMap.gazetteer).toBeDefined();
    expect(dmMap.eventMarks).toBeDefined();
    expect(dmMap.influence).toBeDefined();
    expect(dmMap.warFronts?.[0]?.nodes[0]?.name).toBe(secretFrontName);
    expect(dmMap.processMarkers?.[0]?.locationName).toBe('Hidden Supply Cache');
    expect(dmMap.layers?.danger).toBeDefined();

    expect(playerMap.travel).toBeUndefined();
    expect(playerMap.newPlace).toBeUndefined();
    expect(playerMap.georeference).toBeUndefined();
    expect(playerMap.onScene).toBeUndefined();
    expect(playerMap.gazetteer).toBeUndefined();
    expect(playerMap.eventMarks).toBeUndefined();
    expect(playerMap.influence).toBeUndefined();
    expect(playerMap.warFronts).toBeUndefined();
    expect(playerMap.processMarkers).toBeUndefined();
    expect(playerMap.layers?.danger).toBeUndefined();
    expect(playerMap.fog?.forced).toBe(true);
    expect(playerToolCount(playerMap)).toBe(0);
    expect(JSON.stringify({ pins: playerMap.pins, warFronts: playerMap.warFronts, processMarkers: playerMap.processMarkers })).not.toContain(secretFrontName);
    expect(player.container.textContent).not.toContain(secretFrontName);

    act(() => { store.getState().revealPlace(hiddenId); });
    player.rerender(<LevelZone {...props(false, store.getState().state, store.getState().events)} />);
    playerMap = latestMapProps();
    const revealedPin = playerMap.pins.find(pin => pin.id === hiddenId);
    expect(revealedPin).toMatchObject({ name: 'Hidden Supply Cache' });
    expect(revealedPin?.facts).toEqual([]);
    expect(revealedPin?.pending).toBe(false);
    expect(player.container.querySelector(`[data-pin-id="${hiddenId}"]`)).toHaveTextContent('Hidden Supply Cache');
    expect(player.container.textContent).not.toContain(privateFactText);

    act(() => { store.getState().undo(); });
    player.rerender(<LevelZone {...props(false, store.getState().state, store.getState().events)} />);
    playerMap = latestMapProps();
    expect(playerMap.pins.some(pin => pin.id === hiddenId)).toBe(false);
    expect(player.container.querySelector(`[data-pin-id="${hiddenId}"]`)).toBeNull();
    expect(dmMap.pins.some(pin => pin.id === hiddenId)).toBe(true);
  });

  it('adds authored route status to the matching DM map only', () => {
    const { store, props } = fixture();
    const graph = JSON.parse(readFileSync(`${process.cwd()}/research/content-phandelver/first-vertical.json`, 'utf8')) as AdventureSession['graph'];
    const session: AdventureSession = {
      id: graph.id, contentId: 'imported-phandelver', graph, title: graph.title, distribution: graph.distribution,
      settingPackageId: graph.setting, rulesPackageIds: graph.rules, partyIds: ['bo'], entrySceneId: graph.entry,
      secretFactId: 'secret-fact', startedSec: 0, status: 'active',
      routeStates: { 'supply-route': { status: 'closed', causeId: 'route-event', reason: 'мост разрушен', proposedSec: 0 } },
    };
    const state = structuredClone(store.getState().state);
    state.world.adventureSessions = { [session.id]: session };
    const dm = render(<LevelZone {...props(true, state)} />);
    const dmMap = latestMapProps();
    expect(dmMap.children).toBeDefined();
    const mapStatus = render(dmMap.children as ReactNode);
    expect(mapStatus.container.textContent).toContain('Доставка припасов');
    expect(mapStatus.container.textContent).toContain('закрыт');

    const player = render(<LevelZone {...props(false, state)} />);
    expect(latestMapProps().children).toBeUndefined();
    expect(player.container.textContent).not.toContain('Доставка припасов');
    dm.unmount();
    mapStatus.unmount();
    player.unmount();
  });
});

describe('cosmology display lenses', () => {
  it('selects FR 4e as a separate visual lens without writing campaign events or time', async () => {
    const { store, props } = fixture();
    const state = store.getState().state;
    const beforeEvents = store.getState().events;
    const beforeTime = structuredClone(state.time);
    const focus = state.world.locations[LOCATION.greatWheel]!;
    const onCosmologyView = vi.fn();
    const base = {
      ...props(true),
      ladder: { level: 'cosmology' as const, path: { cosmology: LOCATION.greatWheel } },
      focus,
      here: [state.world.locations[LOCATION.material]!],
      onCosmologyView,
    };
    const view = render(<LevelZone {...base} cosmologyView="wheel" />);

    fireEvent.click(screen.getByRole('button', { name: 'FR 4e после Spellplague' }));
    expect(onCosmologyView).toHaveBeenCalledWith('axis');
    view.rerender(<LevelZone {...base} cosmologyView="axis" />);

    expect(await screen.findByRole('img', { name: /FR 4e post-Spellplague/ })).toBeInTheDocument();
    expect(store.getState().events).toEqual(beforeEvents);
    expect(store.getState().state.time).toEqual(beforeTime);
  });
});
