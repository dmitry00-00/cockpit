// Memory-only visual QA for the alternate PartyPortraits mode; never opens saved campaign data.
import { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '@fontsource/ibm-plex-mono';
import '../../../src/styles/index.css';
import { DeskPage } from '../../../src/pages/DeskPage';
import { seedEngine } from '../../../src/campaign/seed';
import { memoryStore } from '../../../src/engine/persist';
import type { UiTheme } from '../../../src/uiTheme';

const persist = memoryStore();
const store = seedEngine({ persist });

function PartyPortraitsFixture() {
  const [theme, setTheme] = useState<UiTheme>('flat');
  return (
    <div className="app-shell flex h-full flex-col overflow-hidden" data-ui-theme={theme}>
      <nav aria-label="Тема QA" className="flex flex-none items-center justify-end gap-2 bg-pn px-3 py-1">
        <span className="type-key text-t2">Проверка PartyPortraits</span>
        {(['flat', 'material'] as const).map(value => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            className="type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 focus-visible:shadow-[var(--bevel),var(--glow-gold)]"
          >
            {value === 'flat' ? 'Плоская 2D' : 'Материалы'}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<p className="p-4 type-body text-t2">Открываю проверку…</p>}>
          <DeskPage store={store} persist={persist} cardFace="sheet" />
        </Suspense>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<PartyPortraitsFixture />);
