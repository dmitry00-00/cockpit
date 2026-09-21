import type { ComponentType } from 'react';
import { DeskPage } from './pages/DeskPage';
import { TokensPage } from './pages/TokensPage';
import { CompendiumPage } from './pages/compendium/CompendiumPage';
import { ROUTES, useHashRoute, type RouteId } from './routes';

const PAGES: Readonly<Record<RouteId, ComponentType>> = {
  desk: DeskPage,
  tokens: TokensPage,
  compendium: CompendiumPage,
};

/**
 * Стол (шаг 5) — главный экран; токены и компендиум остаются служебными страницами. Корень — ровно высота
 * окна и прокрутка внутри: столу нужна известная высота, чтобы тело карточки прокручивалось само,
 * а служебные страницы длиннее экрана прокручиваются в этом же контейнере.
 */
export function App() {
  const route = useHashRoute();
  const Page = PAGES[route];
  return (
    <div className="h-full flex flex-col overflow-auto">
      <nav className="flex items-center gap-1 px-6 pt-4 flex-none" aria-label="Страницы">
        {ROUTES.map(r => (
          <a
            key={r.id}
            href={r.hash}
            aria-current={route === r.id ? 'page' : undefined}
            className={`type-body-sm px-3 py-1 ${route === r.id ? 'bg-pl shadow-plate text-gd' : 'bg-cd shadow-bevel text-t2 hover:text-tx'}`}
          >
            {r.label}
          </a>
        ))}
      </nav>
      <Page />
    </div>
  );
}
