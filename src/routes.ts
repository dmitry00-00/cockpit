// Страницы: рабочий стол (шаг 5) и служебные — токены, компендиум и правила кампании (Д7). Переход между ними — по хэшу,
// не событие домена (HANDOFF §7). Пустой или незнакомый хэш открывает стол: это главный экран.
import { useEffect, useState } from 'react';

export const ROUTES = [
  { id: 'desk', hash: '#/desk', label: 'Стол' },
  { id: 'tokens', hash: '#/tokens', label: 'Токены' },
  { id: 'compendium', hash: '#/compendium', label: 'Компендиум' },
  { id: 'rules', hash: '#/rules', label: 'Правила' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

export const DEFAULT_ROUTE: RouteId = 'desk';

export function routeFromHash(hash: string): RouteId {
  return ROUTES.find(r => hash === r.hash || hash.startsWith(`${r.hash}/`))?.id ?? DEFAULT_ROUTE;
}

export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(globalThis.location?.hash ?? ''));
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export type ProductContext = 'session' | 'world' | 'workshop' | 'library';
export type ProductView = 'desk' | 'time' | 'pulse' | 'chrono' | 'journal' | 'notebook';
export interface ProductRoute { hash?: string; context: ProductContext; view?: ProductView; library?: 'catalog' | 'campaigns' | 'compendium' | 'rules' | 'tokens' | 'graphics' }
export const CONTEXTS = [
  { id: 'session', hash: '#/session/desk', label: 'Сессия' },
  { id: 'world', hash: '#/world/map', label: 'Живой мир' },
  { id: 'workshop', hash: '#/workshop', label: 'Мастерская' },
  { id: 'library', hash: '#/library', label: 'Библиотека' },
] as const;
export function productRoute(hash: string): ProductRoute {
  const [, context, sub] = hash.split('/');
  if (context === 'workshop') return {context:'workshop'};
  if (context === 'library') return {context:'library', library: sub === 'campaigns' || sub === 'compendium' || sub === 'rules' || sub === 'tokens' || sub === 'graphics' ? sub : 'catalog'};
  if (context === 'compendium' || context === 'rules' || context === 'tokens') return {context:'library',library:context};
  if (context === 'world') return {context:'world',view:sub === 'pulse' ? 'pulse' : sub === 'chronology' ? 'chrono' : 'desk'};
  return {context:'session',view: sub === 'time' || sub === 'journal' || sub === 'notebook' ? sub : 'desk'};
}
export function hashForView(view: ProductView, current: ProductContext): string {
  if (view === 'pulse' || view === 'chrono') return `#/world/${view === 'chrono' ? 'chronology' : 'pulse'}`;
  if (view === 'desk' && current === 'world') return '#/world/map';
  return `#/session/${view}`;
}
export function useProductRoute(): ProductRoute {
  const [hash,setHash] = useState(() => globalThis.location?.hash ?? '');
  useEffect(() => { const changed=()=>setHash(location.hash); addEventListener('hashchange',changed); return ()=>removeEventListener('hashchange',changed); },[]);
  return { ...productRoute(hash), hash };
}
