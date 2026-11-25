import { useId, useRef, useState } from 'react';
import { DeskPage, type DeskPageProps } from './pages/DeskPage';
import { DeskLease } from './pages/desk/DeskLease';
import { CONTEXTS, useProductRoute } from './routes';
import { useTextsReady } from './rules/texts';
import { FeedbackSettings } from './feedback/FeedbackSettings';
import { useFeedbackInteractions } from './feedback/useFeedbackInteractions';
import { readUiTheme, writeUiTheme, type UiTheme } from './uiTheme';

/** All four contexts share the same mounted desk, lease and campaign. */
export function App({store,persist}: Pick<DeskPageProps,'store'|'persist'> = {}) {
  useFeedbackInteractions('master');
  const route = useProductRoute();
  useTextsReady();
  const lastRoutes=useRef<Record<string,string>>({});
  lastRoutes.current[route.context]=route.hash || '#/session/desk';
  const [dmView,setDmView] = useState(true);
  const [uiTheme, setUiTheme] = useState<UiTheme>(readUiTheme);
  const themeGroupId = useId();
  const chooseUiTheme = (theme: UiTheme) => { setUiTheme(theme); writeUiTheme(theme); };
  return <div className="app-shell h-full flex flex-col overflow-hidden" data-ui-theme={uiTheme}>
    <nav className="flex flex-wrap items-center gap-1 px-3 pt-2 flex-none" aria-label="Контексты ширмы">
      {CONTEXTS.filter(c => dmView || c.id === 'session').map(c => <a key={c.id} href={lastRoutes.current[c.id] ?? c.hash}
        aria-current={route.context === c.id ? 'page' : undefined}
        className={`type-body-sm px-3 py-1 ${route.context === c.id ? 'bg-pl shadow-plate text-gd-hi' : 'bg-cd shadow-bevel text-t2 hover:text-tx'}`}>{c.label}</a>)}
      <fieldset className="app-ui-theme-switch" aria-label="Тема интерфейса">
        <legend>Тема интерфейса</legend>
        {(['flat', 'material'] as const).map(theme => <label key={theme}>
          <input type="radio" name={themeGroupId} value={theme} checked={uiTheme === theme} onChange={() => chooseUiTheme(theme)} />
          <span>{theme === 'flat' ? 'Плоская 2D' : 'Материалы'}</span>
        </label>)}
      </fieldset>
      <FeedbackSettings scope="master" />
    </nav>
    <DeskLease><DeskPage store={store} persist={persist} productRoute={route} onAudienceChange={setDmView}/></DeskLease>
  </div>;
}
