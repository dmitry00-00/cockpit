// Страницы: рабочий стол (шаг 5) и две служебные — токены и компендиум. Переход между ними — по хэшу,
// не событие домена (HANDOFF §7). Пустой или незнакомый хэш открывает стол: это главный экран.
import { useEffect, useState } from 'react';

export const ROUTES = [
  { id: 'desk', hash: '#/desk', label: 'Стол' },
  { id: 'tokens', hash: '#/tokens', label: 'Токены' },
  { id: 'compendium', hash: '#/compendium', label: 'Компендиум' },
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
