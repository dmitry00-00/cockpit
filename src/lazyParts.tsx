// Ленивые части приложения (ROADMAP 0.5): служебные страницы, экран создания персонажа и виды стола по требованию
// («Хроника», «Пульс», схемы космоса, «Сравнить», глобус планеты, слои карты по регионам, схема карты, карта персонажа, карта мира, формы по нажатию) — отдельными кусками. Каждая
// часть — компонент с preload(): в браузере куски догружаются при отображении нужной поверхности, пока
// не пришли — пусто (Suspense без заглушки); тесты зовут preloadParts() в общем setup и рисуют части сразу, как раньше.
import { Suspense, lazy, type ComponentType } from 'react';
import type { RulesPageProps } from './pages/RulesPage';

function preloadable<P extends object>(load: () => Promise<ComponentType<P>>) {
  let Loaded: ComponentType<P> | null = null;
  let promise: Promise<ComponentType<P>> | null = null;
  const preload = () => (promise ??= load().then(c => (Loaded = c)));
  const Lazy = lazy(() => preload().then(c => ({ default: c })));
  function Part(props: P) {
    return Loaded ? <Loaded {...props} /> : <Suspense fallback={null}><Lazy {...props} /></Suspense>;
  }
  return Object.assign(Part, { preload });
}

export const CompendiumPage = preloadable(() => import('./pages/compendium/CompendiumPage').then(m => m.CompendiumPage));
export const TokensPage = preloadable(() => import('./pages/TokensPage').then(m => m.TokensPage));
export const RulesPage = preloadable<RulesPageProps>(() => import('./pages/RulesPage').then(m => m.RulesPage));
export const CharacterEditor = preloadable(() => import('./pages/editor/CharacterEditor').then(m => m.CharacterEditor));
export const ChronologyView = preloadable(() => import('./pages/desk/ChronologyView').then(m => m.ChronologyView));
export const PlanetosChronologyView = preloadable(() => import('./pages/desk/PlanetosChronologyView').then(m => m.PlanetosChronologyView));
export const PulseView = preloadable(() => import('./pages/desk/PulseView').then(m => m.PulseView));
export const CompareSheet = preloadable(() => import('./components/CompareSheet').then(m => m.CompareSheet));
export const GreatWheel = preloadable(() => import('./cosmos/GreatWheel').then(m => m.GreatWheel));
export const WorldTree = preloadable(() => import('./cosmos/WorldTree').then(m => m.WorldTree));
export const PostSpellplagueFr4e = preloadable(() => import('./cosmos/PostSpellplagueFr4e').then(m => m.PostSpellplagueFr4e));
export const FlowGraph = preloadable(() => import('./cosmos/FlowGraph').then(m => m.FlowGraph));
export const Planetarium = preloadable(() => import('./cosmos/Planetarium').then(m => m.Planetarium));
export const PlanetGlobe = preloadable(() => import('./map/PlanetGlobe').then(m => m.PlanetGlobe));
export const RegionLayer = preloadable(() => import('./map/RegionLayer').then(m => m.RegionLayer));
export const SchemaLayer = preloadable(() => import('./map/SchemaLayer').then(m => m.SchemaLayer));
export const CharacterCard = preloadable(() => import('./components/CharacterCard').then(m => m.CharacterCard));
// Карта мира и то, что открывается только по нажатию (TASKS Q18): формы «Добавить» и «Отдых», календарь Харптоса,
// ветки «Пульса», формы концентрации и повышения, виды «Время» и «Журнал». До первой отрисовки не
// нужны; карта приходит вместе со своими тайлами.
export const WorldMap = preloadable(() => import('./map/WorldMap').then(m => m.WorldMap));
export const Astrolabe = preloadable(() => import('./components/Astrolabe').then(m => m.Astrolabe));
export const SpawnForm = preloadable(() => import('./components/SpawnForm').then(m => m.SpawnForm));
export const RestForm = preloadable(() => import('./components/RestForm').then(m => m.RestForm));
export const HarptosCalendar = preloadable(() => import('./pages/desk/HarptosCalendar').then(m => m.HarptosCalendar));
export const BranchPanel = preloadable(() => import('./pages/desk/BranchPanel').then(m => m.BranchPanel));
export const ConcentrationForm = preloadable(() => import('./components/ConcentrationForm').then(m => m.ConcentrationForm));
export const LevelUpForm = preloadable(() => import('./components/LevelUpForm').then(m => m.LevelUpForm));
export const TimeView = preloadable(() => import('./pages/desk/TimeView').then(m => m.TimeView));
export const JournalView = preloadable(() => import('./pages/desk/JournalView').then(m => m.JournalView));
export const LevelZone = preloadable(() => import('./pages/desk/LevelZone').then(m => m.LevelZone));
export const ToolsPanel = preloadable(() => import('./pages/desk/ToolsPanel').then(m => m.ToolsPanel));
export const CharacterPathView = preloadable(() => import('./components/CharacterPathView').then(m => m.CharacterPathView));
export const PartyPanel = preloadable(() => import('./pages/desk/PartyPanel').then(m => m.PartyPanel));
export const TimeStepReview = preloadable(() => import('./pages/desk/TimeStepReview').then(m => m.TimeStepReview));
export const NotebookView = preloadable(() => import('./pages/desk/NotebookView').then(m => m.NotebookView));
export const BattleGrid = preloadable(() => import('./components/BattleGrid').then(m => m.BattleGrid));
export const SceneView = preloadable(() => import('./components/SceneView').then(m => m.SceneView));
export const JourneyActivities = preloadable(() => import('./components/JourneyActivities').then(m => m.JourneyActivities));
export const KnowledgeCheck = preloadable(() => import('./components/KnowledgeCheck').then(m => m.KnowledgeCheck));

export const PcLore = preloadable(() => import('./pages/desk/bodies').then(m => m.PcLore));
export const PcSpells = preloadable(() => import('./pages/desk/bodies').then(m => m.PcSpells));
export const DmTab = preloadable(() => import('./pages/desk/bodies').then(m => m.DmTab));
export const FactionOverview = preloadable(() => import('./pages/desk/bodies').then(m => m.FactionOverview));
export const MonsterActions = preloadable(() => import('./pages/desk/bodies').then(m => m.MonsterActions));
export const MonsterOverview = preloadable(() => import('./pages/desk/bodies').then(m => m.MonsterOverview));
export const MonsterSeen = preloadable(() => import('./pages/desk/bodies').then(m => m.MonsterSeen));
export const NpcSocialPanel = preloadable(() => import('./pages/desk/bodies').then(m => m.NpcSocialPanel));
export const PersonRelationshipPanel = preloadable(() => import('./pages/desk/bodies').then(m => m.PersonRelationshipPanel));
export const OrgCampaignLine = preloadable(() => import('./pages/desk/bodies').then(m => m.OrgCampaignLine));
export const PcOverview = preloadable(() => import('./pages/desk/bodies').then(m => m.PcOverview));
export const PcSkills = preloadable(() => import('./pages/desk/bodies').then(m => m.PcSkills));
export const PlaceOverview = preloadable(() => import('./pages/desk/bodies').then(m => m.PlaceOverview));

const PARTS = [CompendiumPage, TokensPage, RulesPage, CharacterEditor, ChronologyView, PlanetosChronologyView, PulseView, CompareSheet, GreatWheel, WorldTree, FlowGraph, Planetarium, PlanetGlobe, RegionLayer, SchemaLayer, CharacterCard,
  WorldMap, Astrolabe, SpawnForm, RestForm, HarptosCalendar, BranchPanel, ConcentrationForm, LevelUpForm, TimeView, JournalView, LevelZone, ToolsPanel, CharacterPathView,
  PartyPanel, TimeStepReview, NotebookView, BattleGrid, SceneView, JourneyActivities, KnowledgeCheck, PcLore, PcSpells, DmTab, FactionOverview, MonsterActions, MonsterOverview, MonsterSeen, NpcSocialPanel, PersonRelationshipPanel, OrgCampaignLine, PcOverview, PcSkills, PlaceOverview];

/** Все ленивые части — сразу; повторный вызов — те же промисы. */
export const preloadParts = (): Promise<unknown> => Promise.all(PARTS.map(p => p.preload()));

export const TimelineRibbon = preloadable(() => import('./pages/desk/TimelineRibbon').then(m => m.TimelineRibbon));

export const WorkspaceHub = preloadable(() => import('./workspace/WorkspaceHub').then(m => m.WorkspaceHub));
