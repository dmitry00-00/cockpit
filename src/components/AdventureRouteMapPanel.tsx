export interface AdventureRouteMapItem {
  id: string;
  name: string;
  status: 'open' | 'closed';
  places: readonly string[];
}

/** Map context for authored route state; topology is shown as a list when no route geometry exists. */
export function AdventureRouteMapPanel({ routes }: { routes: readonly AdventureRouteMapItem[] }) {
  if (!routes.length) return null;
  return <section aria-label="Доступность маршрутов на карте" className="max-w-72 max-h-[40vh] overflow-auto rounded border border-br bg-wl/95 p-2 shadow-plate type-body-xs">
    <h3 className="type-key text-tx">Маршруты приключения</h3>
    <ul className="mt-1 flex flex-col gap-1">
      {routes.map(route => <li key={route.id} className="flex flex-col">
        <span><span aria-hidden="true">{route.status === 'open' ? '●' : '×'}</span> {route.name} · {route.status === 'open' ? 'доступен' : 'закрыт'}</span>
        {route.places.length ? <span className="text-t2">{route.places.join(' → ')}</span> : null}
      </li>)}
    </ul>
    <p className="mt-1 text-t2">Показана авторская топология. Трассы и расстояния не заданы и на карту не нанесены.</p>
  </section>;
}
