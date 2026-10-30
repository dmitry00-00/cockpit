import type { ComponentType } from 'react';
import { DeskPage } from './pages/DeskPage';
import { DeskLease } from './pages/desk/DeskLease';
// Служебные страницы — ленивыми кусками (ROADMAP 0.5); стол — в основном.
import { CompendiumPage, RulesPage, TokensPage } from './lazyParts';
import { ROUTES, useHashRoute, type RouteId } from './routes';
import { useTextsReady } from './rules/texts';

const PAGES: Readonly<Record<RouteId, ComponentType>> = {
  // Стол пишет журнал — одна вкладка на браузер (И2): вторая не монтирует его.
  desk: () => <DeskLease><DeskPage /></DeskLease>,
  tokens: TokensPage,
  compendium: CompendiumPage,
  rules: RulesPage,
};

/**
 * Стол (шаг 5) — главный экран; токены и компендиум остаются служебными страницами. Корень — ровно высота
 * окна и прокрутка внутри: столу нужна известная высота, чтобы тело карточки прокручивалось само,
 * а служебные страницы длиннее экрана прокручиваются в этом же контейнере.
 */
export function App() {
  const route = useHashRoute();
  // Тексты справочников догружаются отдельно (ROADMAP 0.5): по загрузке страница перерисовывается целиком — тексты в тех же объектах.
  const texts = useTextsReady();
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
      <Page key={texts ? 'texts' : 'core'} />
    </div>
  );
}
