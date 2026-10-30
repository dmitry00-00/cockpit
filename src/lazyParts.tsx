// Ленивые части приложения (ROADMAP 0.5): служебные страницы, экран создания персонажа и виды стола по требованию
// («Хроника», «Пульс», схемы космоса, «Сравнить», глобус планеты, слои карты по регионам, схема карты, карта персонажа, карта мира, формы по нажатию) — отдельными кусками. Каждая
// часть — компонент с preload(): в браузере куски догружаются после первой отрисовки (preloadParts в main.tsx), пока
// не пришли — пусто (Suspense без заглушки); тесты зовут preloadParts() в общем setup и рисуют части сразу, как раньше.
import { Suspense, lazy, type ComponentType } from 'react';

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
export const RulesPage = preloadable(() => import('./pages/RulesPage').then(m => m.RulesPage));
export const CharacterEditor = preloadable(() => import('./pages/editor/CharacterEditor').then(m => m.CharacterEditor));
export const ChronologyView = preloadable(() => import('./pages/desk/ChronologyView').then(m => m.ChronologyView));
export const PulseView = preloadable(() => import('./pages/desk/PulseView').then(m => m.PulseView));
export const CompareSheet = preloadable(() => import('./components/CompareSheet').then(m => m.CompareSheet));
export const GreatWheel = preloadable(() => import('./cosmos/GreatWheel').then(m => m.GreatWheel));
export const WorldTree = preloadable(() => import('./cosmos/WorldTree').then(m => m.WorldTree));
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
export const SpawnForm = preloadable(() => import('./components/SpawnForm').then(m => m.SpawnForm));
export const RestForm = preloadable(() => import('./components/RestForm').then(m => m.RestForm));
export const HarptosCalendar = preloadable(() => import('./pages/desk/HarptosCalendar').then(m => m.HarptosCalendar));
export const BranchPanel = preloadable(() => import('./pages/desk/BranchPanel').then(m => m.BranchPanel));
export const ConcentrationForm = preloadable(() => import('./components/ConcentrationForm').then(m => m.ConcentrationForm));
export const LevelUpForm = preloadable(() => import('./components/LevelUpForm').then(m => m.LevelUpForm));
export const TimeView = preloadable(() => import('./pages/desk/TimeView').then(m => m.TimeView));
export const JournalView = preloadable(() => import('./pages/desk/JournalView').then(m => m.JournalView));

const PARTS = [CompendiumPage, TokensPage, RulesPage, CharacterEditor, ChronologyView, PulseView, CompareSheet, GreatWheel, WorldTree, FlowGraph, Planetarium, PlanetGlobe, RegionLayer, SchemaLayer, CharacterCard,
  WorldMap, SpawnForm, RestForm, HarptosCalendar, BranchPanel, ConcentrationForm, LevelUpForm, TimeView, JournalView];

/** Все ленивые части — сразу; повторный вызов — те же промисы. */
export const preloadParts = (): Promise<unknown> => Promise.all(PARTS.map(p => p.preload()));
