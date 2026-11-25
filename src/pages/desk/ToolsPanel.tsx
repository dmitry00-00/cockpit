import { AdventurePreview } from '../../components/AdventurePreview';
import { adventureLaunchDelta, adventureOutcomeDelta, adventurePartyDelta, adventureRouteStatusDelta } from '../../campaign/adventureSession';
// Панель справа (HANDOFF §4, F9): у мастера — отмена и повтор, «Новая сессия», файл сессии, тост, последний
// бросок, нити, напоминания и входящие, хвост журнала; у игроков — хроника похода, бросок и журнал без секретов.
// Свёрнутая — полоса иконок, раскрытая из полосы — оверлей. Пропсы — те же имена, что на странице: компонент —
// перенос её разметки, состояние держит страница.
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { holyList, inDays, nextFestival, NEAR_SCALES, type NextHolyDay } from '../../campaign';
import {
  IconRail, JournalEntry, JournalReminder, PhysicalDiceInput, ProgressMeter, RollModal, ThreadCard, ThreadFrontEditor, WorldDelta, lastRollOf, rollHistoryOf, toggleIn, worldDeltaProps,
  type IconRailItem, type JournalEntryProps,
} from '../../components';
import {
  causeChain, deltaTargets, publicProcessClocks as publicProcessClocksOf, worldDeltaFreshness, SCALE_LEVELS, type Command, type DomainEvent, type EngineStoreApi, type HomebrewRuntimeEffect, type ImportedContent, type JournalEntry as JournalRecord, type ScaleLevel, type State, type ThreadSummary, type WorldPatch,
} from '../../engine';
import { Icon, type IconName } from '../../icons/Icon';
import { CONDITIONS } from '../../rules/srd';
import { SessionScoreRunner } from '../../workspace/SessionScoreRunner';
import { loadMonsterLibraries, monsterLibrariesLoaded, MONSTER_LIST, type Monster } from '../../rules/srd/monsters';
import { promoteSrdMonsterImport, srdMonsterForImport } from '../../import/promoteMonster';
import { generatedSrdMonsterData, makeGeneratedSrdMonsterContent, validateGeneratedSrdMonster } from '../../import/generatedSrdMonster';
import { generatedSrdCharacterData, generatedSrdCharacterTemplate, makeGeneratedSrdCharacterContent } from '../../import/generatedSrdCharacter';
import { classifyParsedMaterials } from '../../import/materialClassification';
import { localMaterialClassifier } from '../../import/localMaterialClassifier';
import { promoteGeneratedSrdCharacterImport } from '../../import/promoteCharacter';
import { generateLocalMonsterNarrative, MONSTER_NARRATIVE_PROMPT_VERSION } from '../../rules/generation/localMonsterNarrative';
import { generatedCrMonsterData, makeGeneratedCrMonsterContent, validateGeneratedCrMonster } from '../../rules/generation/crMonster';
import type { CrMonsterInput } from '../../rules/generation/crMonster';
import { MONSTER_BENCHMARKS } from '../../rules/convert/a5eMonsterBenchmark';
import { generateLocalCharacterNarrative } from '../../rules/generation/localCharacterNarrative';
import { generateLocalMechanicDraft, type MechanicTargetEdition } from '../../rules/generation/localMechanicDraft';
import { generatedHomebrewMechanicData, makeGeneratedHomebrewMechanicContent, validateGeneratedHomebrewMechanic, type ManualHomebrewNumberInput } from '../../import/generatedHomebrewMechanic';
import { HOMEBREW_RUNTIME_EFFECT_LABELS, homebrewMechanicRuntimeBindingError, homebrewMechanicRuntimeDelta, homebrewMechanicRuntimeDeactivationDelta, homebrewRuntimeAmount, resolveHomebrewMechanicRuntime } from '../../import/homebrewRuntime';
import { generatedWorldMaterialData, makeGeneratedWorldMaterialContent } from '../../import/generatedWorldMaterial';
import { generateLocalWorldMaterial, type WorldMaterialEdition, type WorldMaterialKind } from '../../rules/generation/localWorldMaterialDraft';
import { importedPlaceActivationDelta } from '../../campaign/worldMaterialActivation';
import { classById, raceById } from '../../rules/compendium';
import type { PcSpec } from '../../campaign/derive';
import type { Era } from '../../campaign/era';
import { adventureFactRecordId, parseAdventureBundle } from '../../packages/adventure';
import { threadCardRows, type ConcentrationReminder, type ConditionReminder, type OpenRail } from './helpers';
import { BTN, HEAD, PANEL_OVERLAY_RIGHT, type DeskView } from './styles';
import { MonsterGenerationPanel } from './MonsterGenerationPanel';
import { CrMonsterGenerationPanel } from './CrMonsterGenerationPanel';
import { CharacterGenerationPanel } from './CharacterGenerationPanel';
import { MechanicGenerationPanel } from './MechanicGenerationPanel';
import { WorldMaterialGenerationPanel } from './WorldMaterialGenerationPanel';
import { WorldMaterialMapPreview } from '../../map/WorldMaterialMapPreview';
import { DungeonTacticalPreview } from '../../map/DungeonTacticalPreview';
import { DEFAULT_SETTING_PACKAGE, PACKAGE_REGISTRY } from '../../packages/registry';
import { BUILT_IN_CAMPAIGNS } from '../../packages/campaigns';
import type { EntityRef } from '../../entities';
import { SettingCatalog } from './SettingCatalog';

function patchList(patch: WorldPatch | undefined): WorldPatch[] {
  return patch?.kind === 'batch' ? patch.patches.flatMap(child => patchList(child)) : patch ? [patch] : [];
}

const INPUT = 'min-w-0 bg-wl px-2 py-1 type-body-sm text-tx shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const SETTING_LABELS: Readonly<Record<string, string>> = {
  fr: 'Забытые королевства',
  planetos: 'Песнь льда и пламени',
};

function GeneratedWorldMaterialPreviews({ content }: { content: ImportedContent }) {
  const data = generatedWorldMaterialData(content);
  if (!data) return null;
  return (
    <>
      <WorldMaterialMapPreview data={data} />
      {data.kind === 'dungeon' ? <DungeonTacticalPreview data={data} materialId={content.id} /> : null}
    </>
  );
}

function GeneratedHomebrewMechanicPreview({ content }: { content: ImportedContent }) {
  const data = generatedHomebrewMechanicData(content);
  if (!data || validateGeneratedHomebrewMechanic(content)) return null;
  const fieldLabels = { trigger: 'Условие', effect: 'Эффект', costOrLimit: 'Цена / ограничение', recoveryOrDuration: 'Восстановление / длительность' };
  const originLabel = (claim: (typeof data.numericPolicy.numericAttributions)[number]) => {
    const origin = claim.origin;
    if (origin.kind === 'author-input') return `Авторский ввод · ${origin.ruleset.system} ${origin.ruleset.version} · слой ${origin.ruleset.layer}${origin.note ? ` · ${origin.note}` : ''}`;
    if (origin.kind === 'source') return `${origin.title} · ${origin.system} ${origin.version} · слой ${origin.layer} · ${origin.locator}${origin.excerpt ? ` · «${origin.excerpt}»` : ''}`;
    return `Формула: ${origin.formula} · исходные значения: ${origin.sourceRefs.join('; ')}`;
  };
  return (
    <section aria-label="Черновик HB-механики и числовые атрибуции" className="my-1 flex flex-col gap-1 bg-cd p-2">
      <p className="text-t2">{data.edition} · слой HB · текст предложен локальной моделью; числа введены отдельно. Сама запись остаётся неисполняемой без отдельной принятой runtime-связки.</p>
      <p><strong>{data.proposal.name}</strong> · {data.proposal.purpose}</p>
      <p className="text-t2">Условие: {data.proposal.trigger}</p>
      <p className="text-t2">Эффект: {data.proposal.effect}</p>
      <p className="text-t2">Ограничение: {data.proposal.costOrLimit}</p>
      <p className="text-t2">Восстановление / длительность: {data.proposal.recoveryOrDuration}</p>
      {data.numericPolicy.numericAttributions.length ? (
        <details>
          <summary className="cursor-pointer text-t2">Ручные HB-числа и атрибуция · {data.numericPolicy.numericAttributions.length}</summary>
          <ul className="list-disc pl-4 text-t2">
            {data.numericPolicy.numericAttributions.map(claim => <li key={claim.id}>{fieldLabels[claim.field]} · {claim.label}: <strong>{claim.value}</strong> — {originLabel(claim)}</li>)}
          </ul>
        </details>
      ) : <p className="text-t2">Числовые значения не заданы.</p>}
      <details>
        <summary className="cursor-pointer text-t2">Происхождение текстового предложения</summary>
        <p className="text-t2">Модель {data.model}; prompt {data.promptVersion}; дата {data.generatedAt}. Модель не является источником чисел или подтверждением правил.</p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-t2">{data.rawOutput}</pre>
      </details>
    </section>
  );
}

function HomebrewRuntimeControls({
  content, state, events, api, setNote,
}: {
  content: ImportedContent;
  state: State;
  events: ToolsPanelProps['events'];
  api: ToolsPanelProps['api'];
  setNote: ToolsPanelProps['setNote'];
}) {
  const data = generatedHomebrewMechanicData(content);
  const claims = data?.numericPolicy.numericAttributions.filter(claim => claim.field === 'effect' && homebrewRuntimeAmount(claim.value) !== undefined) ?? [];
  const [claimId, setClaimId] = useState('');
  const [effect, setEffect] = useState<HomebrewRuntimeEffect | ''>('');
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState('');
  const active = state.world.activeHomebrewMechanics?.[content.id];
  const resolved = active ? resolveHomebrewMechanicRuntime(state, active) : undefined;
  const activeError = active ? homebrewMechanicRuntimeBindingError(state, active) : null;
  const activationPending = Object.values(state.deltas).some(delta => delta.status === 'pending' && patchList(delta.patch).some(patch => patch.kind === 'homebrewMechanicRuntime' && patch.binding.contentId === content.id));
  const deactivationPending = Object.values(state.deltas).some(delta => delta.status === 'pending' && patchList(delta.patch).some(patch => patch.kind === 'removeHomebrewMechanicRuntime' && patch.id === content.id));
  const acceptedEventIdFor = (kind: 'importedContent' | 'homebrewMechanicRuntime') => [...events].reverse().find(event => {
    if (event.type !== 'WORLD_DELTA_ACCEPTED') return false;
    const deltaId = (event as DomainEvent<'WORLD_DELTA_ACCEPTED'>).payload.deltaId;
    const delta = state.deltas[deltaId];
    return patchList(delta?.patch).some(patch => kind === 'importedContent'
      ? patch.kind === 'importedContent' && patch.content.id === content.id
      : patch.kind === 'homebrewMechanicRuntime' && patch.binding.contentId === content.id);
  })?.id;
  const availableActors = Object.values(state.actors).filter(actor => !actor.removed).sort((a, b) => a.name.localeCompare(b.name));

  const proposeActivation = () => {
    setError('');
    try {
      const sourceEventId = acceptedEventIdFor('importedContent');
      if (!sourceEventId) throw new Error('Не найдено событие, принявшее эту механику в каталог.');
      if (!effect) throw new Error('Явно выберите тип мгновенного HP-эффекта.');
      api.propose(homebrewMechanicRuntimeDelta(state, content.id, claimId, effect, sourceEventId));
      setNote(`Предложена отдельная связь «${content.name}» с runtime. Она начнёт действовать только после принятия во «Входящих».`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const applyEffect = () => {
    setError('');
    if (!active || !resolved || activeError) { setError(activeError ?? 'Сначала подключите и примите runtime-связку.'); return; }
    if (!targetId || !state.actors[targetId] || state.actors[targetId].removed) { setError('Выберите существующую цель.'); return; }
    const payload = { targetId, amount: resolved.amount, mechanicId: content.id };
    if (active.effect === 'damage') api.dispatch({ type: 'DAMAGE_APPLIED', payload });
    else if (active.effect === 'healing') api.dispatch({ type: 'HEALING_APPLIED', payload });
    else api.dispatch({ type: 'TEMP_HP_GRANTED', payload });
    setNote(`Применено: ${HOMEBREW_RUNTIME_EFFECT_LABELS[active.effect]} ${resolved.amount} · ${state.actors[targetId].name} · авторская механика HB.`);
  };

  const proposeDeactivation = () => {
    setError('');
    try {
      const sourceEventId = acceptedEventIdFor('homebrewMechanicRuntime');
      if (!sourceEventId) throw new Error('Не найдено событие, принявшее runtime-связку.');
      api.propose(homebrewMechanicRuntimeDeactivationDelta(state, content.id, sourceEventId));
      setNote(`Предложено отключить runtime-связку «${content.name}». Она останется активной, пока предложение не принято.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <section aria-label={`Runtime механики ${content.name}`} className="my-1 flex flex-col gap-2 bg-cd p-2">
      <p className="type-body-xs text-t2">Связка поддерживает только выбранное целое значение для мгновенного урона, лечения или временных хитов. Триггер, цена, дальность, атаки, спасброски, состояния и длительность из текста не исполняются. Кубы и другие числа остаются описательными.</p>
      {active ? (
        <>
          <p role="status" className="type-body-sm text-tx">
            {activeError || !resolved ? `Связка недействительна: ${activeError ?? 'число больше не найдено в каталоге'}` : `Подключено после отдельного принятия: ${HOMEBREW_RUNTIME_EFFECT_LABELS[active.effect]} · ${resolved.claim.label} ${resolved.claim.value} · ${data?.ruleset.system} ${data?.ruleset.version}, слой ${data?.ruleset.layer}.`}
          </p>
          {resolved && !activeError ? (
            <>
              <label className="flex flex-col gap-1 type-body-xs text-t2">
                Цель
                <select aria-label={`Цель механики ${content.name}`} className={INPUT} value={targetId} onChange={event => setTargetId(event.target.value)}>
                  <option value="">Выбрать цель</option>
                  {availableActors.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-1">
                <button type="button" className={BTN} disabled={!targetId} onClick={applyEffect}>Применить {HOMEBREW_RUNTIME_EFFECT_LABELS[active.effect]}</button>
                <button type="button" className={BTN} disabled={deactivationPending} onClick={proposeDeactivation}>{deactivationPending ? 'Отключение ждёт решения' : 'Предложить отключение'}</button>
              </div>
            </>
          ) : null}
        </>
      ) : claims.length ? (
        <>
          <label className="flex flex-col gap-1 type-body-xs text-t2">
            Атрибутированное число эффекта
            <select aria-label={`Числовое значение эффекта для ${content.name}`} className={INPUT} value={claimId} onChange={event => setClaimId(event.target.value)}>
              <option value="">Выбрать число</option>
              {claims.map(claim => <option key={claim.id} value={claim.id}>{claim.label} · {claim.value}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 type-body-xs text-t2">
            Явно подключить как
            <select aria-label={`Тип runtime-эффекта для ${content.name}`} className={INPUT} value={effect} onChange={event => setEffect(event.target.value as HomebrewRuntimeEffect | '')}>
              <option value="">Выбрать эффект</option>
              <option value="damage">Урон</option>
              <option value="healing">Лечение</option>
              <option value="temporary-hp">Временные хиты</option>
            </select>
          </label>
          <button type="button" className={BTN} disabled={!claimId || !effect || activationPending} onClick={proposeActivation}>
            {activationPending ? 'Подключение ждёт решения' : 'Предложить связь с runtime'}
          </button>
        </>
      ) : <p className="type-body-xs text-t2">Нет атрибутированного целого значения в поле «Эффект». Для runtime нужен ручной выбор положительного целого; формулы кубов, DC, расстояния и длительности остаются записью.</p>}
      {error ? <p role="alert" className="type-body-xs text-fx-damage-hi">{error}</p> : null}
    </section>
  );
}

export interface ToolsPanelProps {
  state: State;
  events: Parameters<typeof rollHistoryOf>[0];
  api: ReturnType<EngineStoreApi['getState']>;
  dmView: boolean;
  combat: boolean;
  shownView: DeskView;
  canUndo: boolean;
  canRedo: boolean;
  resetArmed: boolean;
  setResetArmed: (armed: boolean) => void;
  onReset: () => void;
  onNewCampaign?: (settingPackageId: string, campaignPackageId?: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onImportContent: (file: File) => void;
  note: string | null;
  setNote: (note: string | null) => void;
  toast: ReturnType<EngineStoreApi['getState']>['toast'];
  shownRoll: ReturnType<typeof lastRollOf> | null;
  setClosedRollId: (id: string | null) => void;
  hiddenRolls: boolean;
  canRecordPhysicalRoll: boolean;
  setHiddenRolls: Dispatch<SetStateAction<boolean>>;
  openThreads: State['world']['threads'][string][];
  threads: ThreadSummary[];
  filterThreads: string[];
  setFilterThreads: Dispatch<SetStateAction<string[]>>;
  concentrationReminders: ConcentrationReminder[];
  conditionReminders: ConditionReminder[];
  setLaterConcentration: Dispatch<SetStateAction<string[]>>;
  onCommand: (cmd: Command) => void;
  pending: State['deltas'][string][];
  festival?: ReturnType<typeof nextFestival>;
  /** Ближайший годовой святой день (E4): бога партии, если он есть на листах (E8), иначе богов Фаэруна. */
  holy?: NextHolyDay;
  journal: JournalRecord[];
  allEntries: JournalRecord[];
  entryProps: (entry: JournalRecord) => JournalEntryProps;
  railTools: boolean;
  characterOverlayContainer: HTMLElement | null;
  characterEra: Era;
  toolsPin: ReactNode;
  toolsRailItems: IconRailItem[];
  openRail: OpenRail;
  setOpenRail: Dispatch<SetStateAction<OpenRail>>;
  onSettingPackageChanged: () => void;
  onOpenEntity: (ref: EntityRef) => void;
}

export function ToolsPanel({
  state, events, api, dmView, combat, shownView, canUndo, canRedo, resetArmed, setResetArmed, onReset,
  onNewCampaign,
  onExport, onImport, onImportContent, note, setNote, toast, shownRoll, setClosedRollId, hiddenRolls, canRecordPhysicalRoll, setHiddenRolls,
  openThreads, threads, filterThreads, setFilterThreads, concentrationReminders, conditionReminders,
  setLaterConcentration, onCommand, pending, festival, holy, journal, allEntries, entryProps, railTools, toolsPin,
  toolsRailItems, openRail, setOpenRail, characterOverlayContainer, characterEra,
  onSettingPackageChanged, onOpenEntity,
 }: ToolsPanelProps) {
  const imported = Object.values(state.world.importedContent ?? {});
  const [monsterLibraryReady, setMonsterLibraryReady] = useState(monsterLibrariesLoaded);
  const [rightsConfirmed, setRightsConfirmed] = useState<Record<string, boolean>>({});
  const [promotionErrors, setPromotionErrors] = useState<Record<string, string>>({});
  const [monsterGenerationBusy, setMonsterGenerationBusy] = useState(false);
  const [crMonsterGenerationBusy, setCrMonsterGenerationBusy] = useState(false);
  const [characterGenerationBusy, setCharacterGenerationBusy] = useState(false);
  const [mechanicGenerationBusy, setMechanicGenerationBusy] = useState(false);
  const [worldMaterialGenerationBusy, setWorldMaterialGenerationBusy] = useState(false);
  const [worldActivationSelections, setWorldActivationSelections] = useState<Record<string, { scale: ScaleLevel; parentId: string }>>({});
  const [worldActivationErrors, setWorldActivationErrors] = useState<Record<string, string>>({});
  const [adventureErrors, setAdventureErrors] = useState<Record<string, string>>({});
  const [clockSegments, setClockSegments] = useState<Record<string, string>>({});
  const [clockPublic, setClockPublic] = useState<Record<string, boolean>>({});
  const publicProcessClocks = dmView ? [] : publicProcessClocksOf(state);
  const currentSettingPackageId = state.settingPackageId ?? DEFAULT_SETTING_PACKAGE;
  const settingPackages = PACKAGE_REGISTRY.filter(item => item.kind === 'setting');
  const campaignChoices = BUILT_IN_CAMPAIGNS;
  const [settingChoice, setSettingChoice] = useState(currentSettingPackageId);
  const [newCampaignArmed, setNewCampaignArmed] = useState(false);
  const [newCampaignError, setNewCampaignError] = useState('');
  const newCampaignDialogRef = useRef<HTMLDivElement>(null);
  const [newCampaignPackageId, setNewCampaignPackageId] = useState(currentSettingPackageId);
  const [newCampaignScenarioId, setNewCampaignScenarioId] = useState('');
  useEffect(() => setSettingChoice(currentSettingPackageId), [currentSettingPackageId]);
  useEffect(() => setNewCampaignPackageId(currentSettingPackageId), [currentSettingPackageId]);
  useEffect(() => {
    if (!newCampaignArmed) return;
    const dialog = newCampaignDialogRef.current;
    if (!dialog) return;
    dialog.scrollIntoView({ block: 'center', behavior: 'smooth' });
    dialog.focus({ preventScroll: true });
  }, [newCampaignArmed]);
  const placeScales = SCALE_LEVELS.filter(scale => ['planet', 'continent', 'region', 'settlement', 'building'].includes(scale));
  const placeScaleLabel: Partial<Record<ScaleLevel, string>> = { planet: 'Планета', continent: 'Континент', region: 'Регион', settlement: 'Поселение', building: 'Здание' };
  useEffect(() => {
    if (monsterLibraryReady) return;
    let live = true;
    void loadMonsterLibraries().then(() => { if (live) setMonsterLibraryReady(true); });
    return () => { live = false; };
  }, [monsterLibraryReady]);
  const importedKindLabel = (kind: string) => ({ character: 'Персонаж', monster: 'Монстр', mechanic: 'Механика · HB-черновик', dungeon: 'Подземелье', location: 'Место · HB-черновик', scene: 'Сцена', token: 'Токен', adventure: 'Приключение' }[kind] ?? kind);
  const rightsLabel = (rights: ImportedContent['rights']) =>
    rights?.status === 'declared' ? `Заявлено в источнике: ${rights.license ?? 'лицензия не указана'}`
      : rights?.license ? `Не проверено; в файле указано: ${rights.license}` : 'Права не указаны — перед распространением нужна проверка';
  const placePending = pending.filter(d => !d.far && NEAR_SCALES.includes(d.scale));
  const worldPending = pending.filter(d => d.far || !NEAR_SCALES.includes(d.scale));
  const generateMonster = async (base: Monster, concept: string) => {
    setMonsterGenerationBusy(true);
    try {
      const result = await generateLocalMonsterNarrative({
        baseName: base.name,
        size: base.size,
        creatureType: base.type,
        alignment: base.alignment,
        concept,
      });
      if (!result.model.trim() || !result.rawOutput.trim()) throw new Error('Ответ модели не прошёл проверку происхождения.');
      const contentId = `generated-srd-${base.id}-${Date.now().toString(36)}`;
      const content = makeGeneratedSrdMonsterContent(base, result, contentId);
      const [classifiedContent] = await classifyParsedMaterials([content], localMaterialClassifier);
      const generated = generatedSrdMonsterData(classifiedContent)!;
      const deltaId = `d-${content.id}`;
      const sourceRef = `content/srd/monsters.json#/monsters/${base.id}`;
      api.propose({
        id: deltaId,
        scale: 'battle',
        subject: content.name,
        was: 'вариант не создан',
        now: `Вариант ${base.name} · CR ${base.cr} без изменения исходного блока; числовые поля: ${generated.numericAttributions.length}, каждому назначен локатор SRD`,
        cause: `Локальная модель ${result.model}; имя и описания предложены моделью, числа скопированы из ${sourceRef}. Prompt ${MONSTER_NARRATIVE_PROMPT_VERSION}.`,
        causeId: `p7:${content.id}`,
        status: 'pending',
        patch: { kind: 'importedContent', content: classifiedContent },
      });
      setNote(`Предложение «${content.name}» добавлено во «Входящие». Классификация механики: ${classifiedContent.materialAssessment?.status ?? 'не выполнена'}; изменятся только описание и имя, CR и характеристики взяты из ${sourceRef}.`);
    } finally {
      setMonsterGenerationBusy(false);
    }
  };
  const generateCrMonster = async (input: CrMonsterInput, concept: string) => {
    setCrMonsterGenerationBusy(true);
    try {
      const result = await generateLocalMonsterNarrative({
        baseName: 'Новый монстр', size: input.size, creatureType: input.creatureType, alignment: input.alignment, concept, mode: 'cr-candidate',
      });
      if (!result.model.trim() || !result.rawOutput.trim()) throw new Error('Ответ модели не прошёл проверку происхождения.');
      const contentId = `generated-cr-${input.targetCr.replace('/', '-')}-${Date.now().toString(36)}`;
      const content = makeGeneratedCrMonsterContent(input, result, contentId);
      const [classifiedContent] = await classifyParsedMaterials([content], localMaterialClassifier);
      const generated = generatedCrMonsterData(classifiedContent)!;
      api.propose({
        id: `d-${content.id}`,
        scale: 'battle',
        subject: content.name,
        was: 'CR-монстр не создан',
        now: `Черновик HB, цель CR ${input.targetCr}, локальная оценка CR ${generated.estimate.estimatedCr}; атрибутированных числовых полей ${generated.numericAttributions.length}`,
        cause: `Числа выведены локальным профилем из таблицы A5E SRD 19.1 (${generated.benchmarkRef}); вводы мастера отдельно привязаны к снимку сборки. Модель ${result.model} предложила только имя и описание; классификация: ${classifiedContent.materialAssessment?.status ?? 'не выполнена'}.`,
        causeId: `p7-cr-monster:${content.id}`,
        status: 'pending',
        patch: { kind: 'importedContent', content: classifiedContent },
      });
      setNote(`Черновик «${content.name}» добавлен во «Входящие» как каталожный HB-кандидат. Числа сверены с A5E SRD 19.1 и вводами мастера; runtime-активация новых CR-блоков пока не поддерживается.`);
    } finally {
      setCrMonsterGenerationBusy(false);
    }
  };
  const generateCharacter = async (template: PcSpec, concept: string, customBuild = false) => {
    setCharacterGenerationBusy(true);
    try {
      const race = raceById(template.raceId), cls = classById(template.classId);
      if (!race || !cls) throw new Error('Шаблон не найден в локальном SRD-компендиуме.');
      const result = await generateLocalCharacterNarrative({
        baseName: template.name,
        race: race.name,
        characterClass: cls.name,
        level: template.level,
        concept,
      });
      if (!result.model.trim() || !result.rawOutput.trim()) throw new Error('Ответ модели не прошёл проверку происхождения.');
      const contentId = `generated-srd-character-${customBuild ? 'custom' : template.id}-${Date.now().toString(36)}`;
      const content = makeGeneratedSrdCharacterContent(template, result, contentId, customBuild);
      const [classifiedContent] = await classifyParsedMaterials([content], localMaterialClassifier);
      const generated = generatedSrdCharacterData(classifiedContent)!;
      api.propose({
        id: `d-${content.id}`,
        scale: 'settlement',
        subject: content.name,
        was: 'вариант персонажа не создан',
        now: `${customBuild ? 'Произвольная сборка' : 'Кандидат на основе шаблона'}: ${race.nameRu ?? race.name} · ${cls.nameRu} · уровень ${template.level}; числовых полей с атрибуцией ${generated.numericAttributions.length}`,
        cause: `Локальная модель предлагает только биографию; механика пересчитана движком из ${customBuild ? 'снимка сборки пользователя' : 'шаблона'} ${generated.templateRef} и записей ${generated.classRef}, ${generated.raceRef}.`,
        causeId: `p7-character:${content.id}`,
        status: 'pending',
        patch: { kind: 'importedContent', content: classifiedContent },
      });
      setNote(`Предложение персонажа «${content.name}» добавлено во «Входящие». Классификация: ${classifiedContent.materialAssessment?.status ?? 'не выполнена'}; показатели пересчитаны по SRD, выборы и числа сборки атрибутированы отдельно.`);
    } finally {
      setCharacterGenerationBusy(false);
    }
  };
  const generateMechanic = async (concept: string, edition: MechanicTargetEdition, numericInputs: readonly ManualHomebrewNumberInput[]) => {
    setMechanicGenerationBusy(true);
    try {
      const result = await generateLocalMechanicDraft({ concept, edition });
      if (!result.model.trim() || !result.rawOutput.trim()) throw new Error('Ответ модели не прошёл проверку происхождения.');
      const id = `generated-homebrew-mechanic-${Date.now().toString(36)}`;
      const content = makeGeneratedHomebrewMechanicContent(concept, edition, result, id, numericInputs);
      const [classifiedContent] = await classifyParsedMaterials([content], localMaterialClassifier);
      const generated = generatedHomebrewMechanicData(classifiedContent)!;
      api.propose({
        id: `d-${content.id}`,
        scale: 'settlement',
        subject: content.name,
        was: 'черновик механики не создан',
        now: `${generated.edition} · слой HB · чисел введено вручную: ${generated.numericPolicy.numericAttributions.length}; модель не задаёт числа, механика неисполняемая`,
        cause: `Локальная модель ${generated.model}; prompt ${generated.promptVersion}. Модель предложила только качественный текст; числовые записи внесены отдельно с происхождением и требуют проверки мастера.`,
        causeId: `p7-mechanic:${content.id}`,
        status: 'pending',
        patch: { kind: 'importedContent', content: classifiedContent },
      });
      setNote(`Черновик «${content.name}» добавлен во «Входящие» как ${generated.edition}, слой HB. Ручных атрибутированных чисел: ${generated.numericPolicy.numericAttributions.length}. Классификация: ${classifiedContent.materialAssessment?.status ?? 'не выполнена'}. В каталог он попадёт только после принятия и останется неисполняемой записью.`);
    } finally {
      setMechanicGenerationBusy(false);
    }
  };
  const generateWorldMaterial = async (kind: WorldMaterialKind, concept: string, edition: WorldMaterialEdition) => {
    setWorldMaterialGenerationBusy(true);
    try {
      const result = await generateLocalWorldMaterial({ kind, concept, edition });
      if (!result.model.trim() || !result.rawOutput.trim()) throw new Error('Ответ модели не прошёл проверку происхождения.');
      const id = `generated-${kind}-${Date.now().toString(36)}`;
      const content = makeGeneratedWorldMaterialContent(concept, edition, result, id);
      const [classifiedContent] = await classifyParsedMaterials([content], localMaterialClassifier);
      const generated = generatedWorldMaterialData(classifiedContent)!;
      const nodeCount = generated.draft.kind === 'dungeon' ? generated.draft.areas.length : generated.draft.features.length;
      api.propose({
        id: `d-${content.id}`,
        scale: kind === 'dungeon' ? 'building' : 'settlement',
        subject: content.name,
        was: 'черновик не создан',
        now: `${generated.edition} · слой HB · связный описательный граф из ${nodeCount} узлов; числа и игровые правила не генерировались`,
        cause: `Локальная модель ${generated.provenance.model}; prompt ${generated.provenance.promptVersion}. Авторское предложение, не канонический факт. При принятии сохраняется в каталоге без автоматического создания карты или места кампании.`,
        causeId: `p7-${kind}:${content.id}`,
        status: 'pending',
        patch: { kind: 'importedContent', content: classifiedContent },
      });
      setNote(`Черновик «${content.name}» добавлен во «Входящие»: ${nodeCount} связанных узлов, ${generated.edition}, слой HB. Классификация: ${classifiedContent.materialAssessment?.status ?? 'не выполнена'}. Принятие сохранит его в каталоге, но не создаст карту или локацию кампании.`);
    } finally {
      setWorldMaterialGenerationBusy(false);
    }
  };
  const renderDelta = (d: State['deltas'][string]) => {
    const targetIds = deltaTargets(d, state);
    const targetPlace = targetIds.map(id => state.world.locations[id]).find(Boolean);
    const targetFaction = targetIds.map(id => state.world.factions[id]).find(Boolean);
    const targetLabel = targetPlace?.name ?? targetFaction?.name;
    const freshness = worldDeltaFreshness(state, d);
    const staleReason = freshness.current ? undefined : freshness.message;
    const importPatch = d.patch?.kind === 'importedContent'
      ? d.patch
      : d.patch?.kind === 'batch'
        ? d.patch.patches.find((patch): patch is Extract<WorldPatch, { kind: 'importedContent' }> => patch.kind === 'importedContent')
        : undefined;
    const runtimeActivationPatch = patchList(d.patch).find((patch): patch is Extract<WorldPatch, { kind: 'homebrewMechanicRuntime' }> => patch.kind === 'homebrewMechanicRuntime');
    const runtimeBinding = runtimeActivationPatch ? resolveHomebrewMechanicRuntime(state, runtimeActivationPatch.binding) : undefined;
    return <div key={d.id} role="listitem">
      <p className="px-2 pb-1 type-body-xs text-t2">Решение требуется{targetLabel ? ` · ${targetLabel}` : ''}</p>
      {d.patch
        ? <p className="px-2 pb-1 type-body-xs text-t2">Результат при принятии:</p>
        : <p className="px-2 pb-1 type-body-xs text-t2">Сообщение: принятие не меняет данные мира автоматически.</p>}
      <WorldDelta
        {...worldDeltaProps(d)}
        chain={causeChain(d.causeId, allEntries, state, [d.id]).map(c => c.label)}
        staleReason={staleReason}
        onAccept={staleReason ? undefined : () => api.accept(d.id)}
        onReject={() => api.reject(d.id)}
        onReroll={(d.variants?.length ?? 0) > 1 ? () => api.reroll(d.id) : undefined}
      />
      {runtimeActivationPatch ? (
        <section aria-label="Проверка runtime-связки HB" className="mx-2 my-1 flex flex-col gap-1 bg-cd p-2 type-body-xs text-t2">
          <p>Связать «{runtimeBinding?.content.name ?? runtimeActivationPatch.binding.contentId}» как {HOMEBREW_RUNTIME_EFFECT_LABELS[runtimeActivationPatch.binding.effect]}.</p>
          {runtimeBinding ? <p>Число: {runtimeBinding.claim.label} · {runtimeBinding.claim.value}; источник: {runtimeBinding.claim.origin.kind === 'author-input'
            ? `ручной ввод · ${runtimeBinding.claim.origin.ruleset.system} ${runtimeBinding.claim.origin.ruleset.version} · ${runtimeBinding.claim.origin.ruleset.layer}`
            : runtimeBinding.claim.origin.kind === 'source'
              ? `${runtimeBinding.claim.origin.title} · ${runtimeBinding.claim.origin.system} ${runtimeBinding.claim.origin.version} · ${runtimeBinding.claim.origin.layer} · ${runtimeBinding.claim.origin.locator}`
              : `расчёт ${runtimeBinding.claim.origin.formula} · ${runtimeBinding.claim.origin.sourceRefs.join('; ')}`}</p>
            : <p>Связка больше не проходит проверку и не может быть принята.</p>}
          <p>Принятие включает только ручной мгновенный эффект; условие и остальные поля текста не запускаются автоматически.</p>
        </section>
      ) : null}
      {importPatch ? (
        <details className="mt-1 px-2 py-1 bg-pl shadow-plate type-body-sm text-tx">
          <summary className="cursor-pointer text-t2">Просмотреть импорт · {importedKindLabel(importPatch.content.kind)} · {importPatch.content.sourceFormat}</summary>
          <p className="mt-1 text-t2">Файл: {importPatch.content.sourceFile}</p>
          <p className="mt-1 text-t2">{rightsLabel(importPatch.content.rights)}</p>
      {importPatch.content.kind === 'adventure' ? <AdventurePreview data={importPatch.content.data} /> : generatedWorldMaterialData(importPatch.content) ? <GeneratedWorldMaterialPreviews content={importPatch.content} /> : generatedHomebrewMechanicData(importPatch.content) ? <GeneratedHomebrewMechanicPreview content={importPatch.content} /> : <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{JSON.stringify(importPatch.content.data, null, 2)}</pre>}
        </details>
      ) : null}
    </div>;
  };
  return (
    <>
      {railTools ? (
        <IconRail
          side="right"
          label={dmView ? 'Инструменты' : 'Хроника'}
          items={toolsRailItems}
          active={openRail?.side === 'tools' ? openRail.item : undefined}
          onOpen={item => setOpenRail(o => (o?.side === 'tools' ? null : { side: 'tools', item }))}
          className="order-last"
        />
      ) : null}
      {!railTools || openRail?.side === 'tools' ? (
      <aside aria-label={dmView ? 'Журнал и отмена' : 'Хроника похода'} data-overlay={railTools || undefined} className={railTools ? `${PANEL_OVERLAY_RIGHT} overflow-y-auto overflow-x-hidden` : 'w-rail-tools flex-none flex flex-col bg-pn shadow-bevel min-h-0 overflow-y-auto overflow-x-hidden'}>
        {dmView ? (
        <>
        <div className={HEAD}>
          <Icon name="reroll" size={16} color="var(--t2)" title="Отмена и повтор" />
          <span>Действия</span>
          {toolsPin}
        </div>
        <div className="flex items-center gap-1 p-2">
          <button type="button" title="Отменить последнее действие · Ctrl+Z" disabled={!canUndo} onClick={() => api.undo()} className={BTN}>Отменить</button>
          <button type="button" title="Повторить отменённое · Ctrl+Shift+Z" disabled={!canRedo} onClick={() => api.redo()} className={BTN}>Повторить</button>
        </div>
        <SessionScoreRunner state={state} onRevealFact={factId => api.reveal(factId)} onPropose={delta => api.propose(delta)} />
        {canRecordPhysicalRoll ? (
          <PhysicalDiceInput
            hidden={hiddenRolls}
            onRoll={({ sides, face, modifier, label }) => {
              const modText = modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : '';
              api.dispatch({
                type: 'DICE_ROLLED',
                payload: {
                  formula: `1d${sides}${modText}`,
                  dice: [face],
                  mod: modifier,
                  total: face + modifier,
                  hidden: hiddenRolls,
                  label: `${label} · физический`,
                  origin: 'physical-manual',
                },
              });
            }}
          />
        ) : null}
        <details className="mx-2 mb-2 bg-pl shadow-plate">
          <summary className={`${HEAD} cursor-pointer`}>
            <Icon name="journal" size={16} color="var(--t2)" title="Кампания" />
            <span>Кампания</span>
          </summary>
          <section aria-label="Сеттинг кампании" className="mx-2 mb-2 flex flex-col gap-2 bg-cd p-2 shadow-bevel-in">
            <label className="flex flex-col gap-1 type-body-xs text-t2">
              Пакет мира
              <select aria-label="Пакет мира кампании" className={INPUT} value={settingChoice} onChange={event => setSettingChoice(event.currentTarget.value)}>
                {settingPackages.map(item => <option key={item.id} value={item.id}>{SETTING_LABELS[item.id] ?? item.id}</option>)}
              </select>
            </label>
            {settingChoice !== currentSettingPackageId ? (
              <>
                <p className="type-body-xs text-t2">Смена меняет календарь и справочные карточки. Уже созданные места, персонажи и события не переносятся; действие можно отменить.</p>
                <button type="button" className={`${BTN} self-start`} onClick={() => { api.setSettingPackage(settingChoice); onSettingPackageChanged(); }}>Применить пакет мира</button>
              </>
            ) : null}
            {currentSettingPackageId === 'planetos' && !dmView ? (
              <p role="note" className="mx-2 mb-2 type-body-xs text-t2">Каталог Planetos доступен ведущему.</p>
            ) : (
              <SettingCatalog packageId={currentSettingPackageId} onOpen={onOpenEntity} />
            )}
          </section>
          <div aria-label="Действия кампании" className="flex flex-wrap items-center gap-1 px-2 pb-2">
            {onNewCampaign && !newCampaignArmed ? (
              <button type="button" title="Выбрать сеттинг или готовый сценарий и создать кампанию" onClick={() => { setResetArmed(false); setNewCampaignError(''); setNewCampaignPackageId(currentSettingPackageId); setNewCampaignScenarioId(''); setNewCampaignArmed(true); }} className={`${BTN} text-gd-hi font-semibold`}>Новая кампания…</button>
            ) : null}
            <button type="button" title="Сохранить журнал сессии файлом (dm-cockpit-<дата>.json)" onClick={onExport} className={BTN}>Сохранить</button>
            <label title="Открыть журнал сессии из файла: стол соберётся из него, битый файл сессию не тронет" className={`${BTN} inline-flex items-center`}>
              Открыть…
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Файл сессии"
                onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
                className="sr-only"
              />
            </label>
            <label title="Разобрать локальный файл и добавить записи во входящие на проверку" className={`${BTN} inline-flex items-center`}>
              Импорт контента…
              <input
                type="file"
                accept=".json,.dd2vtt,.uvtt,.rptok,.rpmap,.cmpgn,application/json"
                aria-label="Импорт контента"
                onChange={e => { const f = e.target.files?.[0]; if (f) onImportContent(f); e.target.value = ''; }}
                className="sr-only"
              />
            </label>
            {!resetArmed ? (
              <button type="button" title="Сбросить журнал и собрать пустую сессию заново — действие необратимо" onClick={() => setResetArmed(true)} className={BTN}>Сбросить журнал</button>
            ) : null}
          </div>
          {resetArmed ? (
            <div role="alertdialog" aria-label="Сбросить журнал сессии" className="flex flex-col gap-2 mx-2 mb-2 px-2 py-2 bg-pl shadow-plate type-body-sm text-tx">
              <span>Сбросить текущий журнал и открыть пустую сессию? Отменить это будет нельзя. Для новой кампании выберите «Новая кампания…».</span>
              <div className="flex items-center gap-1">
                <button type="button" title="Стереть журнал: стол из сида" onClick={onReset} className={`${BTN} text-fx-damage-hi`}>Стереть</button>
                <button type="button" title="Оставить сессию как есть" onClick={() => setResetArmed(false)} className={BTN}>Оставить</button>
              </div>
            </div>
          ) : null}
          {newCampaignArmed && onNewCampaign ? (
            <div ref={newCampaignDialogRef} tabIndex={-1} role="alertdialog" aria-label="Новая кампания" className="flex flex-col gap-2 mx-2 mb-2 px-2 py-2 bg-pl shadow-plate type-body-sm text-tx">
              <span>Создание заменит текущий журнал. Скачивание ниже сохранит его копию. После создания предложение первого запуска появится во «Входящих» — примите его, чтобы открыть сценарий.</span>
              <label className="flex flex-col gap-1">
                <span>Готовая кампания</span>
                <select aria-label="Готовая кампания" value={newCampaignScenarioId} onChange={event => {
                  const id = event.currentTarget.value;
                  setNewCampaignScenarioId(id);
                  const selected = campaignChoices.find(campaign => campaign.id === id);
                  if (selected) setNewCampaignPackageId(selected.settingPackageId);
                }} className={INPUT}>
                  <option value="">Пустая кампания без сценария</option>
                  {campaignChoices.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}
                </select>
              </label>
              {newCampaignScenarioId ? <p className="type-body-xs text-t2">{campaignChoices.find(campaign => campaign.id === newCampaignScenarioId)?.description}</p> : null}
              {newCampaignError ? <p role="alert" className="type-body-xs text-danger">Кампания не создана: {newCampaignError}</p> : null}
              <label className="flex flex-col gap-1">
                <span>Сеттинг новой кампании</span>
                <select aria-label="Сеттинг новой кампании" value={newCampaignPackageId} disabled={!!newCampaignScenarioId} onChange={e => setNewCampaignPackageId(e.target.value)} className={INPUT}>
                  {settingPackages.map(item => <option key={item.id} value={item.id}>{SETTING_LABELS[item.id] ?? item.id}</option>)}
                </select>
              </label>
              <span>{newCampaignScenarioId ? 'Сценарий добавится в мастерский каталог, а предложение его запуска появится во «Входящих». Его можно начать как мастерскую подготовку без партии; героев и систему правил привяжете отдельно.' : 'Точка открытия берётся из лестницы сеттинга; для Planetos это Винтерфелл. Правила выбираются отдельно.'}</span>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" title="Скачать резервную копию текущего журнала; создание не запускает" onClick={onExport} className={BTN}>Скачать резервную копию</button>
                <button type="button" title="Создать кампанию и добавить предложение первого запуска во входящие" onClick={() => {
                  setNewCampaignError('');
                  try {
                    onNewCampaign(newCampaignPackageId, newCampaignScenarioId || undefined);
                    setNewCampaignArmed(false);
                  } catch (reason) {
                    setNewCampaignError(reason instanceof Error ? reason.message : String(reason));
                  }
                }} className={`${BTN} text-fx-damage-hi`}>Создать кампанию</button>
                <button type="button" title="Не создавать новую кампанию" onClick={() => setNewCampaignArmed(false)} className={BTN}>Отмена</button>
              </div>
            </div>
          ) : null}
          <div className="px-2 pb-2">
            <MonsterGenerationPanel monsters={MONSTER_LIST} ready={monsterLibraryReady} busy={monsterGenerationBusy} onGenerate={generateMonster} />
            <CrMonsterGenerationPanel busy={crMonsterGenerationBusy} onGenerate={generateCrMonster} />
            <CharacterGenerationPanel
              busy={characterGenerationBusy}
              onGenerate={generateCharacter}
              onGenerateBuild={(spec, concept) => generateCharacter(spec, concept, true)}
              takenIds={new Set(Object.keys(state.actors))}
              overlayContainer={characterOverlayContainer}
              era={characterEra}
            />
            <MechanicGenerationPanel busy={mechanicGenerationBusy} onGenerate={generateMechanic} />
            <WorldMaterialGenerationPanel busy={worldMaterialGenerationBusy} onGenerate={generateWorldMaterial} />
          </div>
        </details>
        {/* Живой регион существует всегда: скринридер объявляет изменения внутри него, а не его появление. */}
        <div role="status" aria-live="polite" className={toast ? 'flex items-start gap-2 mx-2 mb-2 px-2 py-1 bg-pl shadow-plate type-body-sm text-tx' : 'sr-only'}>
          {toast ? (
            <>
              <span className="flex-1 min-w-0">{toast}</span>
              <button type="button" aria-label="Скрыть тост" title="Скрыть" onClick={() => api.dismissToast()} className="flex-none text-t2 hover:text-tx">
                <Icon name="cross" size={16} color="currentColor" title="Скрыть" />
              </button>
            </>
          ) : null}
        </div>
        {note ? (
          <div role="note" className="flex items-start gap-2 mx-2 mb-2 px-2 py-1 bg-cd shadow-bevel type-body-sm text-t2">
            <Icon name="note" size={16} color="var(--src-dm)" title="Заметка мастера" className="mt-0.5" />
            <span className="flex-1 min-w-0">{note}</span>
            <button type="button" aria-label="Скрыть заметку" title="Скрыть" onClick={() => setNote(null)} className="flex-none text-t2 hover:text-tx">
              <Icon name="cross" size={16} color="currentColor" title="Скрыть" />
            </button>
          </div>
        ) : null}
        </>
        ) : (
          // Стол игроков (F8): вместо действий мастера — открытые задачи партии, без сроков и секретов.
          <>
            <div className={HEAD}>
              <Icon name="threads" size={16} color="var(--t2)" title="Хроника похода" />
              <span>Хроника похода</span>
              {toolsPin}
            </div>
            {openThreads.length > 0 ? (
              <p className="px-2 py-2 type-body-sm text-tx">
                Открытые задачи: {openThreads.map(t => t.name).join('; ')}.
              </p>
            ) : null}
          </>
        )}
        {shownRoll ? (
          // Последний бросок из лога (DICE_ROLLED); закрытый крестиком не возвращается, следующий бросок — новая карточка.
          // На столе игроков — без переключателя скрытости, переброса и истории со скрытыми бросками.
          <RollModal
            roll={shownRoll.roll}
            history={rollHistoryOf(events).filter(r => r.id !== shownRoll.id && (dmView || !r.hidden))}
            hidden={hiddenRolls}
            onHiddenChange={dmView ? setHiddenRolls : undefined}
            onReroll={dmView ? () => api.rollDice(shownRoll.roll.formula, { label: shownRoll.roll.label, hidden: hiddenRolls }) : undefined}
            onClose={() => setClosedRollId(shownRoll.id)}
            className="mx-auto mb-2 max-w-full"
          />
        ) : null}
        {shownView === 'journal' ? (
          <>
            <div className={HEAD}>
              <Icon name="threads" size={16} color="var(--t2)" title="Нити" />
              <span>Нити</span>
              <span className="ml-auto type-key text-t2" title="Открытых нитей">{threads.length}</span>
            </div>
            <div className="min-h-0 overflow-auto flex flex-col gap-2 p-2">
              {threads.map(t => (
                <div key={t.id} className="flex flex-col gap-1">
                  <ThreadCard
                    id={t.id}
                    name={t.name}
                    count={t.count}
                    rows={threadCardRows(t, dmView)}
                    selected={filterThreads.includes(t.id)}
                    onSelect={id => setFilterThreads(f => toggleIn(f, id, !f.includes(id)))}
                  />
                  {dmView ? (
                    <>
                    <details className="px-2 py-1 bg-pl shadow-plate type-body-xs text-t2">
                      <summary className="cursor-pointer">{t.clock ? 'Перенастроить часы нити' : 'Настроить часы нити'}</summary>
                      <form className="mt-1 flex flex-wrap items-end gap-1" onSubmit={event => {
                        event.preventDefault();
                        const segments = Number(clockSegments[t.id]);
                        if (!Number.isSafeInteger(segments) || segments < 1) return;
                        const filled = Math.min(t.clock?.filled ?? 0, segments);
                        api.propose({
                          id: `thread-clock-config-${t.id}-${crypto.randomUUID()}`,
                          scale: 'region', subject: `Часы нити · ${t.name}`,
                          was: t.clock ? `${t.clock.filled}/${t.clock.segments}` : 'часы не настроены',
                          now: `${filled}/${segments}`,
                          cause: 'Мастер настроил число делений; заполнение часов не создаёт автоматического последствия',
                          causeId: t.id, status: 'pending', threadIds: [t.id],
                          patch: { kind: 'threadClock', id: t.id, clock: { segments, filled, startedSec: state.time.sec, playerVisible: clockPublic[t.id] ?? !!t.clock?.playerVisible } },
                        });
                        setClockSegments(values => ({ ...values, [t.id]: '' }));
                      }}>
                        <label className="flex items-center gap-1">
                          <span>Делений</span>
                          <input aria-label={`Деления часов нити ${t.name}`} type="number" min={1} step={1} required
                            value={clockSegments[t.id] ?? (t.clock ? String(t.clock.segments) : '')} onChange={event => setClockSegments(values => ({ ...values, [t.id]: event.target.value }))}
                            className="w-16 px-1 bg-cd text-tx" />
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={clockPublic[t.id] ?? !!t.clock?.playerVisible}
                            onChange={event => setClockPublic(values => ({ ...values, [t.id]: event.target.checked }))} />
                          <span>Показывать игрокам</span>
                        </label>
                        <button type="submit" className={BTN} disabled={pending.some(delta => delta.subject === `Часы нити · ${t.name}`)}>
                          {pending.some(delta => delta.subject === `Часы нити · ${t.name}`) ? 'Сначала решите входящее' : 'Предложить настройку'}
                        </button>
                      </form>
                      <p className="mt-1">За каждые десять дней без внимания система предложит один тик. Заполнение не закрывает нить и не создаёт последствий автоматически. Игрокам показываются только деления и заполнение.</p>
                    </details>
                    <ThreadFrontEditor
                      state={state}
                      thread={state.world.threads[t.id]}
                      pending={pending.some(delta => delta.subject === `Фронт · ${t.name}` || delta.subject === `Знак фронта · ${t.name}`)}
                      onPropose={delta => api.propose(delta)}
                    />
                    </>
                  ) : null}
                </div>
              ))}
              {publicProcessClocks.length > 0 ? (
                <section aria-label="Открытые часы мира" className="flex flex-col gap-2">
                  <h3 className="type-h-15 text-tx">Часы мира</h3>
                  {publicProcessClocks.map((process, index) => {
                    return (
                      <div key={`${process.label}-${index}`} className="flex flex-col gap-1 bg-cd shadow-bevel px-2 py-1.5" aria-label={`Часы: ${process.label}`}>
                        <span className="type-body-sm text-tx">{process.label}</span>
                        <ProgressMeter value={process} label={`Прогресс: ${process.label}`} />
                      </div>
                    );
                  })}
                </section>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {concentrationReminders.length > 0 || conditionReminders.length > 0 ? (
              // Система предлагает, мастер решает: снять — событие, «Позже» — вид. Пустого списка нет вовсе.
              <div aria-label="Напоминания" role="list" className="flex flex-col px-2 pt-1">
                {conditionReminders.map(r => (
                  <div key={r.key} role="listitem">
                    <JournalReminder
                      inset={false}
                      icon={{ name: `cond-${r.conditionId}` as IconName, color: 'var(--fx-damage-hi)', title: 'Срок вышел' }}
                      action={{ label: 'Снять', title: `Снять состояние «${CONDITIONS[r.conditionId].label}»: срок вышел` }}
                      text={r.text}
                      onReveal={() => onCommand({ type: 'CONDITION_REMOVED', payload: { targetId: r.actorId, conditionId: r.conditionId } })}
                      onLater={() => setLaterConcentration(l => [...l, r.key])}
                    />
                  </div>
                ))}
                {concentrationReminders.map(r => (
                  <div key={r.key} role="listitem">
                    <JournalReminder
                      inset={false}
                      icon={{ name: r.reason === 'unconscious' ? 'cond-unconscious' : 'cond-concentration', color: 'var(--fx-damage-hi)', title: r.reason === 'unconscious' ? 'Без сознания' : 'Срок вышел' }}
                      action={{ label: 'Снять', title: r.reason === 'unconscious' ? 'Снять концентрацию: без сознания' : 'Снять концентрацию: срок вышел' }}
                      text={r.text}
                      onReveal={() => onCommand({ type: 'CONCENTRATION_ENDED', payload: { actorId: r.actorId, reason: r.reason } })}
                      onLater={() => setLaterConcentration(l => [...l, r.key])}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {dmView && pending.length > 0 ? (
              // Входящие — сверху панели инструментов (HANDOFF §4): пока мастер не решил, мир не менялся.
              <>
                <div className={HEAD}>
                  <Icon name="inbox" size={16} color="var(--src-sim)" title="Предложения мира" />
                  <span>Входящие</span>
                  <span className="ml-auto type-key text-t2" title="Ждут решения">{pending.length}</span>
                </div>
                <div aria-label="Входящие" role="list" className="min-h-0 max-h-[45%] overflow-auto flex flex-col gap-2 p-2">
                  <p className="type-body-xs text-t2">Сначала предложения масштаба региона, поселения, здания и боя без метки «дальний мир»; затем дальние и более крупные масштабы. Это порядок по масштабу и метке, не оценка срочности. Внутри групп сохранён порядок предложений. Принятие и отклонение записываются в журнал и отменяются через него.</p>
                  {placePending.length ? <section aria-label="Изменения мест и регионов" className="flex flex-col gap-2">
                    <h3 className="type-h-17 text-tx">Изменения мест и регионов <span className="type-key text-t2">{placePending.length}</span></h3>
                    {placePending.map(renderDelta)}
                  </section> : null}
                  {worldPending.length ? <section aria-label="Сводка мира" className="flex flex-col gap-2">
                    <h3 className="type-h-17 text-tx">Сводка мира <span className="type-key text-t2">{worldPending.length}</span></h3>
                    {worldPending.map(renderDelta)}
                  </section> : null}
                </div>
              </>
            ) : dmView ? (
              // Единственная секция, что показывается пустой (CLAUDE.md): «Мир спокоен», ближайший праздник и святой
              // день богов Фаэруна — луна уже в полосе часов, второй раз не печатается.
              <>
                <div className={HEAD}>
                  <Icon name="inbox" size={16} color="var(--t2)" title="Предложения мира" />
                  <span>Входящие</span>
                </div>
                <p data-part="calm" className="px-2 py-2 type-body-sm text-t2">
                  Мир спокоен.
                  {festival ? <> Ближайший праздник — <span className="text-tx">{festival.festival}</span> {inDays(festival.days)}
                    {holy && holy.sec === festival.sec ? <>; {holy.party ? 'святой день бога партии' : 'святые дни'} — <span className="text-tx">{holyList(holy.holy)}</span>.</>
                      : holy ? <>. Святой день{holy.party ? ' бога партии' : ''} {inDays(holy.days)} — <span className="text-tx">{holyList(holy.holy)}</span>.</> : '.'}</> : null}
                </p>
              </>
            ) : null}
            {dmView && imported.length > 0 ? (
              <details className="mx-2 mb-2 bg-pl shadow-plate" open={imported.some(item => item.id === 'asoiaf-north-pilot')}>
                <summary className={`${HEAD} cursor-pointer`}>
                  <Icon name="journal" size={16} color="var(--t2)" title="Импортированный контент" />
                  <span>Принятые импорты</span>
                  <span className="ml-auto type-key text-t2">{imported.length}</span>
                </summary>
                <ul aria-label="Принятые импорты" className="max-h-48 overflow-auto px-2 pb-2">
                  {imported.map(item => {
                    const monster = item.kind === 'monster' && monsterLibraryReady ? srdMonsterForImport(item) : undefined;
                    const generatedRecord = generatedSrdMonsterData(item);
                    const generatedBase = monsterLibraryReady && generatedRecord ? MONSTER_LIST.find(monster => monster.id === generatedRecord.baseMonsterId) : undefined;
                    const generatedMonster = generatedRecord && generatedBase && !validateGeneratedSrdMonster(item, generatedBase) ? generatedRecord : undefined;
                    const generatedCrRecord = generatedCrMonsterData(item);
                    const generatedCrMonster = generatedCrRecord && !validateGeneratedCrMonster(item) ? generatedCrRecord : undefined;
                    const crBenchmark = generatedCrMonster ? MONSTER_BENCHMARKS.find(row => row.cr === generatedCrMonster.input.targetCr) : undefined;
                    const generatedCharacter = generatedSrdCharacterData(item);
                    const characterTemplate = generatedCharacter ? generatedSrdCharacterTemplate(item) : undefined;
                    const verifiedCharacter = generatedCharacter && characterTemplate ? generatedCharacter : undefined;
                    const generatedMechanicRecord = generatedHomebrewMechanicData(item);
                    const generatedMechanic = generatedMechanicRecord && !validateGeneratedHomebrewMechanic(item) ? generatedMechanicRecord : undefined;
                    const generatedWorld = generatedWorldMaterialData(item);
                    const activatedLocation = item.kind === 'location' || item.kind === 'dungeon' ? state.world.locations[item.id] : undefined;
                    const activationSelection = worldActivationSelections[item.id] ?? { scale: item.kind === 'dungeon' ? 'building' as const : 'settlement' as const, parentId: '' };
                    const eligibleActivationParents = Object.values(state.world.locations)
                      .filter(location => SCALE_LEVELS.indexOf(location.scale) < SCALE_LEVELS.indexOf(activationSelection.scale))
                      .sort((a, b) => a.name.localeCompare(b.name));
                    const actorId = `import-${item.id}`;
                    const alreadySpawned = !!state.actors[actorId];
                    const adventureSession = item.kind === 'adventure' ? Object.values(state.world.adventureSessions ?? {}).find(session => session.contentId === item.id) : undefined;
                    const adventureBundle = item.kind === 'adventure' ? parseAdventureBundle(item.data) : undefined;
                    const startPending = !!adventureBundle && Object.values(state.deltas).some(delta => delta.status === 'pending' && patchList(delta.patch).some(patch => patch.kind === 'adventureSession' && patch.session.id === adventureBundle.id && patch.session.status === 'active'));
                    const pendingOutcomeIds = adventureSession ? Object.values(state.deltas).filter(delta => delta.status === 'pending').flatMap(delta => patchList(delta.patch)).filter((patch): patch is Extract<WorldPatch, {kind:'adventureSession'}> => patch.kind === 'adventureSession' && patch.session.id === adventureSession.id).flatMap(patch => patch.session.resolvedProposalIds ?? []) : [];
                    const pendingRouteStates: Record<string, 'open' | 'closed'> = {};
                    if (adventureSession) for (const delta of Object.values(state.deltas).filter(delta => delta.status === 'pending' && delta.causeId.startsWith('adventure-route:'))) {
                      for (const patch of patchList(delta.patch)) {
                        if (patch.kind !== 'adventureSession' || patch.session.id !== adventureSession.id) continue;
                        for (const [routeId, routeState] of Object.entries(patch.session.routeStates ?? {})) {
                          if (JSON.stringify(routeState) !== JSON.stringify(adventureSession.routeStates?.[routeId])) pendingRouteStates[routeId] = routeState.status;
                        }
                      }
                    }
                    const revealedFactNodeIds = adventureSession?.graph.nodes.flatMap(node => node.kind === 'fact' && state.facts[adventureFactRecordId(adventureSession.id, node.id)]?.visibility === 'players' ? [node.id] : []) ?? [];
                    const adventureParty = state.party.filter(id => !!state.actors[id] && !state.actors[id].removed).map(id => ({ id, name: state.actors[id].name }));
                    return (
                      <li key={item.id} className="border-t border-bd py-1 type-body-sm">
                        <details open={item.kind === 'adventure' && item.id === 'asoiaf-north-pilot'}>
                          <summary className="cursor-pointer">{item.name} <span className="text-t2">· {importedKindLabel(item.kind)} · {item.sourceFormat}</span></summary>
                          <p className="text-t2">Файл: {item.sourceFile}</p>
                          <p className="text-t2">{rightsLabel(item.rights)}</p>
                          {item.materialAssessment ? (
                            <div aria-label="Оценка и классификация материала" className="my-1 flex flex-col gap-1 bg-cd p-2">
                              {item.materialAssessment.status === 'awaiting-classifier' ? (
                                <p className="text-t2">Механическая классификация подготовлена к запуску, но локальный классификатор не подключён. Текстовые фрагменты: {item.materialAssessment.evidenceCount}; покрытие: {item.materialAssessment.evidenceCoverage === 'partial' ? 'частичное' : 'полное'}.</p>
                              ) : item.materialAssessment.status === 'no-evidence' ? (
                                <p className="text-t2">Парсер не нашёл текстовых полей для механической классификации. Это не означает, что в материале нет правил.</p>
                              ) : item.materialAssessment.status === 'classifier-error' ? (
                                <p role="status" className="text-t2">Черновая классификация не получена: {item.materialAssessment.reason}</p>
                              ) : (
                                <>
                                  <p className="text-t2">Черновая классификация ожидает проверки: {item.materialAssessment.kind}; метки: {item.materialAssessment.tags.join(', ') || 'нет'}; уверенность модели {Math.round(item.materialAssessment.confidence * 100)}%.</p>
                                  {item.materialAssessment.evidenceCoverage === 'partial' ? <p className="text-t2">Парсер передал только часть текстовых фрагментов; вывод модели не относится ко всему материалу.</p> : null}
                                  <ul className="list-disc pl-4 text-t2">
                                    {item.materialAssessment.evidence.map((claim, index) => <li key={`${claim.locator}-${index}`}>[{claim.locator}] «{claim.quote}»{claim.tag ? ` · ${claim.tag}` : ''}</li>)}
                                  </ul>
                                  {item.materialAssessment.unknowns.length ? <p className="text-t2">Неизвестно: {item.materialAssessment.unknowns.join('; ')}</p> : null}
                                  <p className="text-t2">Модель: {item.materialAssessment.model}; prompt: {item.materialAssessment.promptVersion}; дата: {item.materialAssessment.generatedAt}; версия источника: {item.materialAssessment.sourceFingerprint}.</p>
                                  <details>
                                    <summary className="cursor-pointer text-t2">Параметры и исходный ответ</summary>
                                    <p className="break-all text-t2">{JSON.stringify(item.materialAssessment.parameters)}</p>
                                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-t2">{item.materialAssessment.rawOutput}</pre>
                                  </details>
                                </>
                              )}
                            </div>
                          ) : null}
                          {generatedMechanic ? <>
                            <GeneratedHomebrewMechanicPreview content={item} />
                            <HomebrewRuntimeControls content={item} state={state} events={events} api={api} setNote={setNote} />
                          </> : generatedMechanicRecord ? <p role="status" className="my-1 bg-cd p-2 text-t2">Проверка блокирует этот HB-черновик: числовая запись или её атрибуция некорректна.</p> : null}
                          {item.kind === 'location' || item.kind === 'dungeon' ? (
                            <div aria-label="Геометрия и активация черновика места" className="my-1 flex flex-col gap-1 bg-cd p-2">
                              {generatedWorld ? (
                                <>
                                  <p className="text-t2">{generatedWorld.edition} · слой HB · {generatedWorld.provenance.model} · {generatedWorld.provenance.promptVersion}. Связный граф процедурно разложен; схема не привязана к карте мира.</p>
                                  <WorldMaterialMapPreview data={generatedWorld} />
                                  {generatedWorld.kind === 'dungeon' ? <DungeonTacticalPreview data={generatedWorld} materialId={item.id} /> : null}
                                </>
                              ) : <p className="text-t2">Материал принят только в каталог; если в исходном файле есть план, его геометрия здесь пока не нормализована.</p>}
                              {activatedLocation ? (
                                <p role="status" className="text-t2">Отдельно активировано в кампании: {activatedLocation.name} · {placeScaleLabel[activatedLocation.scale] ?? activatedLocation.scale}{activatedLocation.parentId ? ` · родитель ${state.world.locations[activatedLocation.parentId]?.name ?? activatedLocation.parentId}` : ' · корневое место'}. Место скрыто от игроков и пока не размещено на географической карте.</p>
                              ) : (
                                <>
                                  <p className="text-t2">Каталоговая запись сама не создаёт место кампании. Для активации будет создано отдельное предложение; оно станет событием только после «Принять» во «Входящих».</p>
                                  <label className="flex flex-col gap-1 text-t2">
                                    Масштаб места
                                    <select aria-label={`Масштаб активации ${item.name}`} className={INPUT} value={activationSelection.scale} onChange={event => {
                                      const scale = event.target.value as ScaleLevel;
                                      const parent = activationSelection.parentId ? state.world.locations[activationSelection.parentId] : undefined;
                                      const parentId = parent && SCALE_LEVELS.indexOf(parent.scale) >= SCALE_LEVELS.indexOf(scale) ? '' : activationSelection.parentId;
                                      setWorldActivationSelections(current => ({ ...current, [item.id]: { scale, parentId } }));
                                    }}>
                                      {placeScales.map(scale => <option key={scale} value={scale}>{placeScaleLabel[scale] ?? scale}</option>)}
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1 text-t2">
                                    Родительское место
                                    <select aria-label={`Родительское место для ${item.name}`} className={INPUT} value={activationSelection.parentId} onChange={event => setWorldActivationSelections(current => ({ ...current, [item.id]: { ...activationSelection, parentId: event.target.value } }))}>
                                      <option value="">Корневое место кампании</option>
                                      {eligibleActivationParents.map(location => <option key={location.id} value={location.id}>{placeScaleLabel[location.scale] ?? location.scale} · {location.name}</option>)}
                                    </select>
                                  </label>
                                  <button type="button" className={BTN} onClick={() => {
                                    try {
                                      api.propose(importedPlaceActivationDelta(state, item, activationSelection.scale, activationSelection.parentId || undefined));
                                      setWorldActivationErrors(current => { const next = { ...current }; delete next[item.id]; return next; });
                                    } catch (error) {
                                      setWorldActivationErrors(current => ({ ...current, [item.id]: error instanceof Error ? error.message : String(error) }));
                                    }
                                  }}>Предложить отдельную активацию</button>
                                  {worldActivationErrors[item.id] ? <p role="alert" className="text-fx-damage-hi">{worldActivationErrors[item.id]}</p> : null}
                                </>
                              )}
                            </div>
                          ) : null}
                          {generatedMonster ? (
                            <div aria-label="Сгенерированная вариация SRD-монстра" className="my-1 flex flex-col gap-1 bg-cd p-2">
                              <p className="text-t2">{generatedMonster.narrative.appearance}</p>
                              <p className="text-t2">Поведение: {generatedMonster.narrative.behavior} · Среда: {generatedMonster.narrative.habitat}</p>
                              <p className="text-t2">CR {generatedMonster.cr} · {generatedMonster.rulesSource.system} {generatedMonster.rulesSource.version}, каталог от {generatedMonster.rulesSource.catalogFetchedAt} · источник: {generatedMonster.crSourceRef}. Механика берётся из базового блока «{generatedMonster.baseMonsterId}».</p>
                              <details>
                                <summary className="cursor-pointer text-t2">Источники чисел · {generatedMonster.numericAttributions.length}</summary>
                                <ul className="max-h-40 overflow-auto list-disc pl-4 text-t2">
                                  {generatedMonster.numericAttributions.map(claim => <li key={claim.path}>{claim.path}: {claim.value} · {claim.sourceRef}</li>)}
                                </ul>
                              </details>
                              <details>
                                <summary className="cursor-pointer text-t2">Локальная модель и исходный ответ</summary>
                                <p className="text-t2">Модель: {generatedMonster.model}; prompt: {generatedMonster.promptVersion}; дата: {generatedMonster.generatedAt}; параметры: {JSON.stringify(generatedMonster.parameters)}</p>
                                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-t2">{generatedMonster.rawOutput}</pre>
                              </details>
                            </div>
                          ) : null}
                          {generatedCrMonster ? (
                            <div aria-label="Сгенерированный CR-монстр" className="my-1 flex flex-col gap-1 bg-cd p-2">
                              <p className="text-t2">{generatedCrMonster.narrative.appearance}</p>
                              <p className="text-t2">Поведение: {generatedCrMonster.narrative.behavior} · Среда: {generatedCrMonster.narrative.habitat}</p>
                              <p className="text-t2">Целевой CR {generatedCrMonster.input.targetCr} · оценка CR {generatedCrMonster.estimate.estimatedCr} (защита {generatedCrMonster.estimate.defensiveCr}, нападение {generatedCrMonster.estimate.offensiveCr}) · AC {generatedCrMonster.block.ac.value} · HP {generatedCrMonster.block.hp.average} ({generatedCrMonster.block.hp.formula}) · PB +{generatedCrMonster.block.proficiencyBonus}.</p>
                              <p className="text-t2">{crBenchmark?.attacks} атаки · DPR {crBenchmark?.damagePerRound} · Урон за удар: {generatedCrMonster.block.actions[0]?.attack?.average} ({generatedCrMonster.block.actions[0]?.attack?.damage}) {generatedCrMonster.input.damageType}; CR — кандидат слоя HB, не SRD-блок.</p>
                              <p className="text-t2">Профиль упрощён: особые способности, спасброски, сопротивления, полёт и заклинания не сгенерированы. Новый CR-блок хранится в каталоге; добавить его актёром в runtime пока нельзя.</p>
                              <p className="text-t2">Источник: {generatedCrMonster.rulesSource.benchmark.name}, {generatedCrMonster.rulesSource.benchmark.table}, {generatedCrMonster.rulesSource.license}; права на распространение записи целиком не заявлены.</p>
                              <details>
                                <summary className="cursor-pointer text-t2">Источники чисел · {generatedCrMonster.numericAttributions.length}</summary>
                                <ul className="max-h-40 overflow-auto list-disc pl-4 text-t2">
                                  {generatedCrMonster.numericAttributions.map((claim, index) => <li key={`${claim.path}-${index}`}>{claim.path}: {claim.value} · {claim.attribution} · {claim.sourceRef} · {claim.ruleSourceRefs.join('; ')}</li>)}
                                </ul>
                              </details>
                              <details>
                                <summary className="cursor-pointer text-t2">Локальная модель и исходный ответ</summary>
                                <p className="text-t2">Модель: {generatedCrMonster.model}; prompt: {generatedCrMonster.promptVersion}; дата: {generatedCrMonster.generatedAt}; параметры: {JSON.stringify(generatedCrMonster.parameters)}</p>
                                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-t2">{generatedCrMonster.rawOutput}</pre>
                              </details>
                            </div>
                          ) : generatedCrRecord ? <p role="status" className="my-1 bg-cd p-2 text-t2">Проверка блокирует этот CR-черновик: запись или числовые атрибуции не совпали с текущим детерминированным профилем.</p> : null}
                          {verifiedCharacter && characterTemplate ? (
                            <div aria-label="Сгенерированная вариация SRD-персонажа" className="my-1 flex flex-col gap-1 bg-cd p-2">
                              <p className="text-t2">{verifiedCharacter.narrative.appearance}</p>
                              <p className="text-t2">Характер: {verifiedCharacter.narrative.personality} · Мотивация: {verifiedCharacter.narrative.motivation}</p>
                              <p className="text-t2">Уровень {verifiedCharacter.mechanics.level} · HP {verifiedCharacter.mechanics.hitPoints} · AC {verifiedCharacter.mechanics.armorClass} · пассивная Внимательность {verifiedCharacter.mechanics.passivePerception}. Механика и выборы совпадают с шаблоном {verifiedCharacter.templateId}.</p>
                              <p className="text-t2">{verifiedCharacter.ruleset.system} {verifiedCharacter.ruleset.version}; каталог компендиума от {verifiedCharacter.ruleset.compendiumImportedAt}.</p>
                              <details>
                                <summary className="cursor-pointer text-t2">Источники чисел · {verifiedCharacter.numericAttributions.length}</summary>
                                <ul className="max-h-40 overflow-auto list-disc pl-4 text-t2">
                                  {verifiedCharacter.numericAttributions.map(claim => <li key={claim.path}>{claim.path}: {claim.value} · {claim.sourceRef} · {claim.ruleSourceRefs.join(', ')}</li>)}
                                </ul>
                                <p className="text-t2">Правила: {verifiedCharacter.ruleset.recordRefs.join('; ')}</p>
                              </details>
                              <details>
                                <summary className="cursor-pointer text-t2">Локальная модель и исходный ответ</summary>
                                <p className="text-t2">Модель: {verifiedCharacter.model}; prompt: {verifiedCharacter.promptVersion}; дата: {verifiedCharacter.generatedAt}; параметры: {JSON.stringify(verifiedCharacter.parameters)}</p>
                                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-t2">{verifiedCharacter.rawOutput}</pre>
                              </details>
                              <label className="flex items-start gap-1">
                                <input type="checkbox" checked={!!rightsConfirmed[item.id]} onChange={event => setRightsConfirmed(current => ({ ...current, [item.id]: event.target.checked }))} disabled={alreadySpawned} />
                                <span>Я проверил право использовать шаблон и описание в текущей кампании.</span>
                              </label>
                              <button type="button" className={BTN} disabled={!rightsConfirmed[item.id] || alreadySpawned} onClick={() => {
                                try {
                                  api.spawn(promoteGeneratedSrdCharacterImport(item, state, !!rightsConfirmed[item.id]));
                                  setPromotionErrors(current => { const next = { ...current }; delete next[item.id]; return next; });
                                } catch (error) {
                                  setPromotionErrors(current => ({ ...current, [item.id]: error instanceof Error ? error.message : String(error) }));
                                }
                              }}>{alreadySpawned ? 'Уже в кампании' : 'Добавить персонажа в кампанию'}</button>
                              {promotionErrors[item.id] ? <p role="alert" className="text-fx-damage-hi">{promotionErrors[item.id]}</p> : null}
                            </div>
                          ) : null}
                          {generatedCharacter && !verifiedCharacter ? <p role="status" className="my-1 bg-cd p-2 text-t2">Шаблон персонажа или его источник изменился; проверка блокирует активацию.</p> : null}
                          {item.kind === 'character' && item.sourceFormat === 'foundry' ? (
                            <p className="my-1 bg-cd p-2 text-t2">Запись Foundry сохранена в каталоге целиком. Активация как персонажа кампании пока недоступна: лист кокпита требует сопоставленных расы, класса, уровня и характеристик, а текущий формат импорта содержит версионные поля системы и вложенные предметы, заклинания и эффекты, которые нельзя преобразовать без потерь.</p>
                          ) : null}
                          {item.kind === 'monster' ? (
                            <div className="my-1 flex flex-col gap-1 bg-cd p-2">
                              <p className="text-t2">{generatedCrMonster ? 'Этот пользовательский блок CR существует только в каталоге. Runtime-модель актёра использует статический реестр монстров, поэтому добавление этого блока в кампанию пока недоступно.' : !monsterLibraryReady ? 'Загружаются блоки монстров…' : monster ? generatedMonster ? `Вариация сохраняет только описательный слой; актёр использует исходные числа ${monster.name}, CR ${monster.cr}.` : `Источник SRD сопоставлен с локальным блоком ${monster.name}; актёр получит числа из блока кокпита, импортированные характеристики не используются.` : 'Можно добавить только монстра с подтверждённым SRD-источником и совпадающим локальным блоком либо проверенную сгенерированную вариацию SRD.'}</p>
                              <label className="flex items-start gap-1">
                                <input
                                  type="checkbox"
                                  checked={!!rightsConfirmed[item.id]}
                                  onChange={e => setRightsConfirmed(current => ({ ...current, [item.id]: e.target.checked }))}
                                  disabled={!monster || alreadySpawned}
                                />
                                <span>Я проверил право использовать этот источник в текущей кампании; распространение не подразумевается.</span>
                              </label>
                              <button
                                type="button"
                                className={BTN}
                                disabled={!monster || !rightsConfirmed[item.id] || alreadySpawned}
                                onClick={() => {
                                  try {
                                    api.spawn(promoteSrdMonsterImport(item, state, !!rightsConfirmed[item.id]));
                                    setPromotionErrors(current => { const next = { ...current }; delete next[item.id]; return next; });
                                  } catch (error) {
                                    setPromotionErrors(current => ({ ...current, [item.id]: error instanceof Error ? error.message : String(error) }));
                                  }
                                }}
                              >
                                {alreadySpawned ? 'Уже в кампании' : 'Добавить монстра в кампанию'}
                              </button>
                              {promotionErrors[item.id] ? <p role="alert" className="text-fx-damage-hi">{promotionErrors[item.id]}</p> : null}
                            </div>
                          ) : null}
                          {item.kind === 'adventure' ? <AdventurePreview
                            data={item.data}
                            session={adventureSession}
                            onOpenEntity={onOpenEntity}
                            onSetParty={adventureSession?.status === 'active' ? () => {
                              try {
                                api.propose(adventurePartyDelta(state, adventureSession));
                                setAdventureErrors(current => { const next = { ...current }; delete next[item.id]; return next; });
                              } catch (error) {
                                setAdventureErrors(current => ({ ...current, [item.id]: error instanceof Error ? error.message : String(error) }));
                              }
                            } : undefined}
                            party={adventureParty}
                            startPending={startPending}
                            pendingOutcomeIds={pendingOutcomeIds}
                            pendingRouteStates={pendingRouteStates}
                            revealedFactNodeIds={revealedFactNodeIds}
                            actionError={adventureErrors[item.id]}
                            onStart={privateUseConfirmed => {
                              try {
                                api.propose(adventureLaunchDelta(state, item, privateUseConfirmed));
                                setAdventureErrors(current => { const next = { ...current }; delete next[item.id]; return next; });
                              } catch (error) {
                                setAdventureErrors(current => ({ ...current, [item.id]: error instanceof Error ? error.message : String(error) }));
                              }
                            }}
                            onOutcome={sceneId => {
                              try {
                                if (!adventureSession) return;
                                api.propose(adventureOutcomeDelta(state, adventureSession, sceneId));
                                setAdventureErrors(current => { const next = { ...current }; delete next[item.id]; return next; });
                              } catch (error) {
                                setAdventureErrors(current => ({ ...current, [item.id]: error instanceof Error ? error.message : String(error) }));
                              }
                            }}
                            onRouteStatus={adventureSession?.status === 'active' ? (routeId, status, reason) => {
                              try {
                                api.propose(adventureRouteStatusDelta(state, adventureSession, routeId, status, reason));
                                setAdventureErrors(current => { const next = { ...current }; delete next[item.id]; return next; });
                              } catch (error) {
                                setAdventureErrors(current => ({ ...current, [item.id]: error instanceof Error ? error.message : String(error) }));
                              }
                            } : undefined}
                            onRevealFact={adventureSession?.status === 'active' ? nodeId => {
                              const factId = adventureFactRecordId(adventureSession.id, nodeId);
                              if (state.facts[factId]?.visibility === 'dm') api.reveal(factId);
                            } : undefined}
                          /> : <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{JSON.stringify(item.data, null, 2)}</pre>}
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : null}
            <div className={HEAD}>
              <Icon name="journal" size={16} color="var(--t2)" title="Журнал" />
              <span>{combat ? 'Журнал боя' : 'Журнал'}</span>
              <span className="ml-auto type-key text-t2" title="Показаны последние записи">последние {journal.length}</span>
            </div>
            <ol aria-label="Записи журнала" className="min-h-0 overflow-auto flex flex-col px-2">
              {journal.map(e => (
                <li key={e.id} data-undone={e.undone || undefined} className="flex flex-col">
                  <JournalEntry {...entryProps(e)} />
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>
      ) : null}
    </>
  );
}

export default ToolsPanel;
