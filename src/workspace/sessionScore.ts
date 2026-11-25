import { adventureSceneRunSheet } from '../packages/adventureRunSheet';
import type { AdventureBundle, AdventureNode } from '../packages/adventure';
import type { PackageManifest } from '../packages/manifest';

export const SESSION_SCORE_FORMAT = 'dm-cockpit.session-score/1' as const;
export type SessionScoreStatus = 'draft' | 'ready';
export type SessionPacing = 'measured' | 'balanced' | 'brisk';

export interface SessionScoreBranch { targetSceneId: string; label: string }
export interface SessionScoreBeat {
  id: string;
  sceneId: string;
  /** GM estimate in minutes; a planning estimate, not a rule or world clock. */
  expectedMinutes: number | null;
  gmCue: string;
  branches: readonly SessionScoreBranch[];
}
export interface SessionScorePackagePin {
  id: string;
  kind: PackageManifest['kind'];
  title: string;
  version: string | null;
}
export interface SessionScoreDraft {
  format: typeof SESSION_SCORE_FORMAT;
  id: string;
  status: SessionScoreStatus;
  title: string;
  campaign: { scope: string; settingPackageId: string; partyActorIds: readonly string[] };
  adventure: { id: string; version: string; entrySceneId: string };
  packagePins: readonly SessionScorePackagePin[];
  targetMinutes: number | null;
  pacing: SessionPacing;
  beats: readonly SessionScoreBeat[];
}
export type SessionScoreCatalogEntry = Pick<PackageManifest, 'id' | 'kind' | 'title' | 'titleRu' | 'version'>;
export interface SessionScoreSceneAnalysis {
  beatId: string;
  sceneId: string;
  sceneName: string;
  places: readonly AdventureNode[];
  plans: readonly AdventureNode[];
  participants: readonly AdventureNode[];
  threads: readonly AdventureNode[];
  facts: readonly AdventureNode[];
  items: readonly AdventureNode[];
  proposals: readonly AdventureNode[];
  summary: string;
  preparation: string | null;
  missingMaterials: readonly string[];
  sources: readonly string[];
  materialSources: readonly string[];
}
export interface SessionScoreAnalysis {
  packagePins: readonly { id: string; title: string; pinnedVersion: string | null; currentVersion?: string; status: 'ready' | 'missing' | 'version-mismatch' }[];
  scenes: readonly SessionScoreSceneAnalysis[];
  estimatedMinutes: number;
  unestimatedScenes: number;
  durationComplete: boolean;
  canMarkReady: boolean;
  blockers: readonly string[];
}

const packageTitle = (entry: SessionScoreCatalogEntry | undefined, id: string) => entry?.titleRu ?? entry?.title ?? id;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const safeMinutes = (value: unknown) => value === null || (Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 1000);

function packagePinsFor(bundle: AdventureBundle, catalog: readonly SessionScoreCatalogEntry[]): SessionScorePackagePin[] {
  return [...new Set([bundle.setting, ...bundle.rules])].map(id => {
    const entry = catalog.find(item => item.id === id);
    return { id, kind: entry?.kind ?? (id === bundle.setting ? 'setting' : 'rules'), title: packageTitle(entry, id), version: entry?.version ?? null };
  });
}

export function sessionScoreStorageKey(scope: string, adventureId: string): string {
  return 'dm-cockpit:session-score:' + encodeURIComponent(scope) + ':' + encodeURIComponent(adventureId);
}

/** Create a local preparation draft from the package entry scene and current campaign references. */
export function newSessionScoreDraft(
  bundle: AdventureBundle,
  campaign: { scope: string; settingPackageId: string; partyActorIds: readonly string[] },
  catalog: readonly SessionScoreCatalogEntry[],
): SessionScoreDraft {
  const entry = bundle.nodes.find(node => node.id === bundle.entry && node.kind === 'scene');
  if (!entry) throw new Error('В графе приключения нет сцены входа.');
  return {
    format: SESSION_SCORE_FORMAT,
    id: 'score-' + bundle.id,
    status: 'draft',
    title: 'Подготовка · ' + bundle.title,
    campaign: { ...campaign, partyActorIds: [...campaign.partyActorIds] },
    adventure: { id: bundle.id, version: bundle.version, entrySceneId: bundle.entry },
    packagePins: packagePinsFor(bundle, catalog),
    targetMinutes: null,
    pacing: 'balanced',
    beats: [{ id: 'beat-' + entry.id + '-1', sceneId: entry.id, expectedMinutes: null, gmCue: '', branches: [] }],
  };
}

/** Reject corrupted or stale local drafts; never resolve scene names heuristically. */
export function validateSessionScoreDraft(value: unknown, bundle: AdventureBundle, expectedScope?: string): SessionScoreDraft {
  if (!record(value) || value.format !== SESSION_SCORE_FORMAT) throw new Error('Неизвестный формат партитуры.');
  if (!nonEmpty(value.id) || !nonEmpty(value.title) || (value.status !== 'draft' && value.status !== 'ready')) throw new Error('В партитуре неверны ID, название или статус.');
  if (!record(value.campaign) || !nonEmpty(value.campaign.scope) || !nonEmpty(value.campaign.settingPackageId) ||
      !Array.isArray(value.campaign.partyActorIds) || !value.campaign.partyActorIds.every(nonEmpty)) {
    throw new Error('В партитуре неверно указана кампания или партия.');
  }
  if (expectedScope && value.campaign.scope !== expectedScope) throw new Error('Черновик относится к другой кампании.');
  if (!record(value.adventure) || value.adventure.id !== bundle.id || value.adventure.version !== bundle.version || value.adventure.entrySceneId !== bundle.entry) {
    throw new Error('Версия пакета приключения изменилась; откройте новый черновик и перенесите подготовку вручную.');
  }
  if (!Array.isArray(value.packagePins) || !value.packagePins.every(pin => record(pin) && nonEmpty(pin.id) && nonEmpty(pin.title) && ['rules', 'setting', 'shared', 'campaign'].includes(String(pin.kind)) && (pin.version === null || nonEmpty(pin.version)))) {
    throw new Error('В партитуре неверно закреплены версии пакетов.');
  }
  const expectedPackageIds = [...new Set([bundle.setting, ...bundle.rules])].sort();
  const pinnedPackageIds = (value.packagePins as Array<{ id: string }>).map(pin => pin.id).sort();
  if (JSON.stringify(expectedPackageIds) !== JSON.stringify(pinnedPackageIds)) throw new Error('Список пакетов партитуры не совпадает с графом приключения.');
  if (!safeMinutes(value.targetMinutes) || !['measured', 'balanced', 'brisk'].includes(String(value.pacing)) || !Array.isArray(value.beats)) {
    throw new Error('В партитуре неверны темп, длительность или список сцен.');
  }
  const sceneIds = new Set(bundle.nodes.filter(node => node.kind === 'scene').map(node => node.id));
  const beatIds = new Set<string>();
  const plannedSceneIds = new Set<string>();
  for (const rawBeat of value.beats) {
    if (record(rawBeat) && typeof rawBeat.sceneId === 'string') plannedSceneIds.add(rawBeat.sceneId);
  }
  for (const rawBeat of value.beats) {
    if (!record(rawBeat) || !nonEmpty(rawBeat.id) || beatIds.has(String(rawBeat.id)) || !nonEmpty(rawBeat.sceneId) || !sceneIds.has(String(rawBeat.sceneId)) ||
        !safeMinutes(rawBeat.expectedMinutes) || typeof rawBeat.gmCue !== 'string' || rawBeat.gmCue.length > 5000 || !Array.isArray(rawBeat.branches)) {
      throw new Error('В партитуре есть некорректная сцена, оценка времени или заметка мастера.');
    }
    beatIds.add(String(rawBeat.id));
    const branchIds = new Set<string>();
    for (const rawBranch of rawBeat.branches) {
      if (!record(rawBranch) || !nonEmpty(rawBranch.targetSceneId) || !sceneIds.has(String(rawBranch.targetSceneId)) || !plannedSceneIds.has(String(rawBranch.targetSceneId)) || rawBranch.targetSceneId === rawBeat.sceneId ||
          !nonEmpty(rawBranch.label) || String(rawBranch.label).length > 160 || branchIds.has(String(rawBranch.targetSceneId))) {
        throw new Error('В партитуре есть неверная или повторная развилка.');
      }
      branchIds.add(String(rawBranch.targetSceneId));
    }
  }
  return structuredClone(value) as unknown as SessionScoreDraft;
}

export function addScoreBeat(draft: SessionScoreDraft, bundle: AdventureBundle, sceneId: string): SessionScoreDraft {
  const scene = bundle.nodes.find(node => node.id === sceneId && node.kind === 'scene');
  if (!scene) throw new Error('Сцена ' + sceneId + ' отсутствует в закреплённом графе.');
  let count = draft.beats.filter(beat => beat.sceneId === sceneId).length + 1;
  let id = 'beat-' + sceneId + '-' + count;
  while (draft.beats.some(beat => beat.id === id)) {
    count += 1;
    id = 'beat-' + sceneId + '-' + count;
  }
  return { ...draft, status: 'draft', beats: [...draft.beats, { id, sceneId, expectedMinutes: null, gmCue: '', branches: [] }] };
}

export function moveScoreBeat(draft: SessionScoreDraft, beatId: string, offset: -1 | 1): SessionScoreDraft {
  const index = draft.beats.findIndex(beat => beat.id === beatId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= draft.beats.length) return draft;
  const beats = [...draft.beats];
  [beats[index], beats[target]] = [beats[target], beats[index]];
  return { ...draft, status: 'draft', beats };
}

export function removeScoreBeat(draft: SessionScoreDraft, beatId: string): SessionScoreDraft {
  const removed = draft.beats.find(beat => beat.id === beatId);
  if (!removed) return draft;
  const beats = draft.beats.filter(beat => beat.id !== beatId);
  const remainingScenes = new Set(beats.map(beat => beat.sceneId));
  return {
    ...draft,
    status: 'draft',
    beats: beats.map(beat => ({
      ...beat,
      branches: beat.branches.filter(branch => remainingScenes.has(branch.targetSceneId)),
    })),
  };
}

export function addScoreBranch(draft: SessionScoreDraft, bundle: AdventureBundle, beatId: string, targetSceneId: string, label: string): SessionScoreDraft {
  const beat = draft.beats.find(item => item.id === beatId);
  const target = bundle.nodes.find(node => node.id === targetSceneId && node.kind === 'scene');
  const cleanLabel = label.trim();
  if (!beat || !target || !draft.beats.some(item => item.sceneId === targetSceneId) || targetSceneId === beat.sceneId || !cleanLabel || cleanLabel.length > 160 || beat.branches.some(branch => branch.targetSceneId === targetSceneId)) {
    throw new Error('Укажите существующую сцену и уникальную подпись развилки.');
  }
  const branches = beat.branches.concat({ targetSceneId, label: cleanLabel });
  return { ...draft, status: 'draft', beats: draft.beats.map(item => item.id === beatId ? { ...item, branches } : item) };
}

export function analyzeSessionScore(
  bundle: AdventureBundle,
  draft: SessionScoreDraft,
  catalog: readonly SessionScoreCatalogEntry[],
  currentCampaign?: { settingPackageId: string; partyActorIds: readonly string[] },
): SessionScoreAnalysis {
  const currentPackages = new Map(catalog.map(entry => [entry.id, entry]));
  const packagePins = draft.packagePins.map(pin => {
    const current = currentPackages.get(pin.id);
    const status = !pin.version || !current ? 'missing' as const : pin.version === current.version ? 'ready' as const : 'version-mismatch' as const;
    return { id: pin.id, title: pin.title, pinnedVersion: pin.version, ...(current ? { currentVersion: current.version } : {}), status };
  });
  const scenes = draft.beats.flatMap(beat => {
    const runSheet = adventureSceneRunSheet(bundle, beat.sceneId);
    if (!runSheet) return [];
    const missingMaterials: string[] = [];
    if (!runSheet.places.length) missingMaterials.push('Не привязано место сцены.');
    for (const place of runSheet.places) {
      const hasPlan = runSheet.plans.some(plan => plan.links.some(link => link.relation === 'depicts' && link.target === place.id) ||
        place.links.some(link => link.relation === 'plan' && link.target === plan.id));
      if (!hasPlan) missingMaterials.push('К месту «' + place.name + '» не привязан план.');
    }
    for (const participant of runSheet.participants) {
      if (participant.kind === 'creature' && !participant.engineBinding) missingMaterials.push('Для противника «' + participant.name + '» не закреплён профиль правил.');
    }
    const sourceById = new Map(bundle.sources.map(source => [source.id, source]));
    const sources = runSheet.scene.evidence.map(evidence => {
      const source = sourceById.get(evidence.source);
      return source ? source.title + (source.sha256 ? ' · sha256 ' + source.sha256.slice(0, 12) : '') +
        (evidence.pages.length ? ' · стр. ' + evidence.pages.join(', ') : '') : 'Неизвестный источник: ' + evidence.source;
    });
    if (!sources.length) missingMaterials.push('У сцены не указана ссылка на источник.');
    if (!runSheet.scene.preparation) missingMaterials.push('Не заполнена подсказка проведения сцены.');
    const materialNodes = [runSheet.scene, ...runSheet.places, ...runSheet.plans, ...runSheet.participants, ...runSheet.threads, ...runSheet.facts, ...runSheet.items, ...runSheet.proposals];
    const materialSources = materialNodes.flatMap(node => node.evidence.map(evidence => {
      const source = sourceById.get(evidence.source);
      return node.name + ' — ' + (source?.title ?? 'неизвестный источник: ' + evidence.source) +
        (source?.sha256 ? ' · sha256 ' + source.sha256.slice(0, 12) : '') +
        (evidence.pages.length ? ' · стр. ' + evidence.pages.join(', ') : '');
    }));
    return [{
      beatId: beat.id, sceneId: runSheet.scene.id, sceneName: runSheet.scene.name,
      places: runSheet.places, plans: runSheet.plans, participants: runSheet.participants,
      threads: runSheet.threads, facts: runSheet.facts, items: runSheet.items, proposals: runSheet.proposals,
      summary: runSheet.scene.summary, preparation: runSheet.scene.preparation ?? null,
      missingMaterials, sources, materialSources,
    }];
  });
  const estimatedMinutes = draft.beats.reduce((sum, beat) => sum + (beat.expectedMinutes ?? 0), 0);
  const unestimatedScenes = draft.beats.filter(beat => beat.expectedMinutes === null).length;
  const blockers: string[] = [];
  if (!draft.beats.length) blockers.push('Добавьте хотя бы одну сцену.');
  if (draft.campaign.settingPackageId !== bundle.setting) blockers.push('Приключение требует сеттинг ' + bundle.setting + ', а в партитуре закреплён ' + draft.campaign.settingPackageId + '.');
  if (currentCampaign && draft.campaign.settingPackageId !== currentCampaign.settingPackageId) {
    blockers.push('Сеттинг текущей кампании изменился. Актуализируйте привязку партитуры.');
  }
  if (currentCampaign && JSON.stringify([...draft.campaign.partyActorIds].sort()) !== JSON.stringify([...currentCampaign.partyActorIds].sort())) {
    blockers.push('Состав партии изменился после подготовки. Актуализируйте привязку перед подтверждением.');
  }
  for (const pin of packagePins) {
    if (pin.status === 'missing') blockers.push('Не установлен требуемый пакет «' + pin.title + '».');
    if (pin.status === 'version-mismatch') blockers.push('Версия «' + pin.title + '» изменилась (' + pin.pinnedVersion + ' → ' + pin.currentVersion + '); обновите привязку перед подтверждением.');
  }
  return {
    packagePins, scenes, estimatedMinutes, unestimatedScenes,
    durationComplete: draft.beats.length > 0 && unestimatedScenes === 0,
    canMarkReady: blockers.length === 0, blockers,
  };
}
