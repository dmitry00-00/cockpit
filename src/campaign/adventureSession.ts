import { adventureFactRecordId, parseAdventureBundle } from '../packages/adventure';
import { DEFAULT_SETTING_PACKAGE } from '../packages/settings';
import { PACKAGE_INDEX } from '../packages/index.generated';
import type { AdventureRouteState, AdventureSession, Fact, ImportedContent, State, WorldDelta } from '../engine/state';
import { authoredRoutePaths } from './adventureRoutes';

const nextDeltaId = (state: State, base: string) => {
  let id = base;
  let suffix = 2;
  while (state.deltas[id]) id = `${base}-${suffix++}`;
  return id;
};

/** Start a source-indexed package through the same pending → accept → undo campaign path as other world changes. */
export function adventureLaunchDelta(state: State, content: ImportedContent, privateTableUseConfirmed: boolean): WorldDelta {
  if (content.kind !== 'adventure' || state.world.importedContent?.[content.id]?.kind !== 'adventure') throw new Error('Сначала примите пакет приключения в каталог.');
  const bundle = parseAdventureBundle(content.data);
  if (bundle.distribution === 'table' && !privateTableUseConfirmed) throw new Error('Для table-only пакета подтвердите использование только в закрытой игровой сессии.');
  if (!PACKAGE_INDEX.some(entry => entry.id === bundle.setting && entry.kind === 'setting')) throw new Error(`Не найден пакет сеттинга ${bundle.setting}.`);
  if (bundle.rules.some(id => !PACKAGE_INDEX.some(entry => entry.id === id && entry.kind === 'rules'))) throw new Error('В пакете указано правило, которого нет в реестре подключённых пакетов.');
  const settingPackageId = state.settingPackageId ?? DEFAULT_SETTING_PACKAGE;
  if (bundle.setting !== settingPackageId) throw new Error(`Пакет требует сеттинг ${bundle.setting}, а в кампании выбран ${settingPackageId}.`);
  if (state.world.adventureSessions?.[bundle.id]) throw new Error('Этот пакет уже запущен в кампании.');
  const partyIds = state.party.filter(id => !!state.actors[id] && !state.actors[id].removed);
  if (!partyIds.length && bundle.rules.length) throw new Error('Для запуска с выбранными правилами нужна действующая партия.');
  const secret = bundle.nodes.find(node => node.id === 'drag-marks' && node.kind === 'fact')
    ?? bundle.nodes.find(node => node.kind === 'fact' && node.audience === 'dm');
  if (!secret) throw new Error('В пакете нет факта мастера, который можно подготовить как секрет.');
  const entry = bundle.nodes.find(node => node.id === bundle.entry)!;
  const secretFactId = adventureFactRecordId(bundle.id, secret.id);
  const adventureFacts: Fact[] = bundle.nodes.flatMap(node => node.kind === 'fact' ? [{
    id: adventureFactRecordId(bundle.id, node.id),
    text: `${node.name}: ${node.summary}`,
    visibility: 'dm' as const,
  }] : []);
  const session: AdventureSession = {
    id: bundle.id,
    contentId: content.id,
    graph: bundle,
    title: bundle.title,
    distribution: bundle.distribution,
    settingPackageId,
    rulesPackageIds: bundle.rules,
    partyIds,
    entrySceneId: entry.id,
    secretFactId,
    startedSec: state.time.sec,
    status: 'active',
    resolvedProposalIds: [],
    routeStates: {},
  };
  return {
    id: nextDeltaId(state, `adventure-start-${bundle.id}`),
    scale: 'settlement',
    subject: bundle.title,
    was: 'только локальный каталог',
    now: `активная сессия · ${entry.name}`,
    cause: 'мастер запускает размеченный пакет вручную',
    causeId: `adventure-start:${bundle.id}`,
    status: 'pending',
    patch: { kind: 'batch', patches: [...adventureFacts.map(fact => ({ kind: 'newFact' as const, fact })), { kind: 'adventureSession', session }] },
  };
}

/** Attach the current active party after a system-neutral narrative adventure was prepared without one. */
export function adventurePartyDelta(state: State, session: AdventureSession): WorldDelta {
  const current = state.world.adventureSessions?.[session.id];
  if (!current || current.status !== 'active') throw new Error('Сначала запустите активное приключение.');
  const partyIds = state.party.filter(id => !!state.actors[id] && !state.actors[id].removed);
  if (!partyIds.length) throw new Error('В кампании пока нет действующей партии.');
  if (JSON.stringify(partyIds) === JSON.stringify(current.partyIds)) throw new Error('Эта партия уже привязана к приключению.');
  const id = nextDeltaId(state, `adventure-party-${session.id}`);
  return {
    id,
    scale: 'settlement',
    subject: current.title,
    was: current.partyIds.length ? `партия: ${current.partyIds.join(', ')}` : 'партия ещё не привязана',
    now: `партия: ${partyIds.join(', ')}`,
    cause: 'Мастер привязывает действующую партию к системно-нейтральному приключению',
    causeId: `adventure-party:${id}`,
    status: 'pending',
    patch: { kind: 'adventureSession', session: { ...current, partyIds } },
  };
}

/** Change route availability as an ordinary pending world proposal; acceptance is journalled and reversible. */
export function adventureRouteStatusDelta(
  state: State,
  session: AdventureSession,
  routeId: string,
  status: AdventureRouteState['status'],
  reason = '',
): WorldDelta {
  const current = state.world.adventureSessions?.[session.id];
  if (!current || current.status !== 'active') throw new Error('Сначала примите запуск активного приключения.');
  const route = authoredRoutePaths(parseAdventureBundle(current.graph), current.routeStates ?? {}).find(item => item.id === routeId);
  if (!route || route.locationIds.length < 2) throw new Error('У маршрута нет однозначной связи «от → через → до».');
  if (route.status === status) throw new Error(`Маршрут «${route.name}» уже ${status === 'open' ? 'открыт' : 'закрыт'}.`);
  const cleanReason = reason.trim().slice(0, 240);
  const id = nextDeltaId(state, `adventure-route-${session.id}-${routeId}-${status}`);
  const causeId = `adventure-route:${id}`;
  const routeState: AdventureRouteState = { status, causeId, reason: cleanReason, proposedSec: state.time.sec };
  const routeStates = { ...(current.routeStates ?? {}), [routeId]: routeState };
  const label = status === 'open' ? 'открыт' : 'закрыт';
  return {
    id,
    scale: 'region',
    subject: route.name,
    was: route.status === 'open' ? 'маршрут доступен' : 'маршрут недоступен',
    now: status === 'open' ? 'маршрут доступен' : 'маршрут недоступен',
    cause: `Мастер ${label} маршрут «${route.name}»${cleanReason ? `: ${cleanReason}` : ''}`,
    causeId,
    status: 'pending',
    patch: { kind: 'adventureSession', session: { ...current, routeStates } },
  };
}

/** The package's proposal node is inert text until a GM chooses it after its linked scene. */
export function adventureOutcomeDelta(state: State, session: AdventureSession, selectedSceneId: string, selectedProposalId?: string): WorldDelta {
  const current = state.world.adventureSessions?.[session.id];
  if (!current || current.status !== 'active') throw new Error('Сначала примите запуск в кампанию.');
  const bundle = parseAdventureBundle(current.graph);
  const proposal = bundle.nodes.find(node => node.kind === 'proposal' && (!selectedProposalId || node.id === selectedProposalId) && node.links.some(link => link.relation === 'after-scene' && link.target === selectedSceneId));
  const scene = bundle.nodes.find(node => node.id === selectedSceneId && node.kind === 'scene');
  if (!proposal || !scene) throw new Error('Для этой сцены в пакете нет предложения об исходе.');
  const resolvedProposalIds = current.resolvedProposalIds ?? [];
  if (resolvedProposalIds.includes(proposal.id)) throw new Error('Исход этой сцены уже отмечен.');
  return {
    id: nextDeltaId(state, `adventure-outcome-${session.id}-${proposal.id}`),
    scale: 'settlement',
    subject: proposal.name,
    was: `отмечено исходов: ${resolvedProposalIds.length}`,
    now: `отмечено исходов: ${resolvedProposalIds.length + 1}; без автоматической награды и изменений мира`,
    cause: `Решение мастера после сцены «${scene.name}»`,
    causeId: `adventure-scene:${session.id}:${scene.id}`,
    status: 'pending',
    patch: { kind: 'adventureSession', session: { ...current, resolvedProposalIds: [...resolvedProposalIds, proposal.id] } },
  };
}
