// Экран «Компендиум»: три матрицы, снятые с таблиц-первоисточников, поверх content/compendium/*.json.
// Это второй способ ориентироваться в расах, классах и чертах — рядом с прозой книги, а не вместо неё.
import { useState } from 'react';
import { COMPENDIUM_META, CLASSES, FEATS, RACES, type Source } from '../../rules/compendium';
import { SOURCES } from '../../rules/compendium/views';
import { ClassGrid } from './ClassGrid';
import { FeatTable } from './FeatTable';
import { RaceMatrix } from './RaceMatrix';
import { DetailPane, Segmented, SourceFilter, type Detail } from './parts';

type View = 'races' | 'classes' | 'feats';

const VIEWS: readonly { id: View; label: string; hint: string }[] = [
  { id: 'races', label: 'Расы × фасеты', hint: 'лист «Кратко»: что даёт раса, по колонкам' },
  { id: 'classes', label: 'Уровни × подклассы', hint: 'лист класса: ресурсы и умения по уровням' },
  { id: 'feats', label: 'Черты × эффекты', hint: 'лист «Нерасовые черты»' },
];

/** «#/compendium/classes/volsebnik» — стартовая матрица и класс из адреса; дальше адрес не трогаем. */
function fromHash(): { view: View; classId: string } {
  const parts = (globalThis.location?.hash ?? '').split('/').filter(Boolean); // ['#', 'compendium', 'classes', 'volsebnik']
  const view = VIEWS.find(v => v.id === parts[2])?.id ?? 'races';
  const classId = CLASSES.find(c => c.id === parts[3])?.id ?? CLASSES[0]?.id ?? '';
  return { view, classId };
}

export function CompendiumPage() {
  const [start] = useState(fromHash);
  const [view, setView] = useState<View>(start.view);
  const [sources, setSources] = useState<Source[]>([...SOURCES]);
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState(start.classId);
  const [selected, setSelected] = useState<{ id: string; detail: Detail } | null>(null);

  const select = (id: string, detail: Detail) => setSelected(prev => (prev?.id === id ? null : { id, detail }));
  const subraces = RACES.reduce((n, r) => n + r.subraces.length, 0);
  const subclasses = CLASSES.reduce((n, c) => n + c.subclasses.length, 0);

  return (
    <main className="min-h-full p-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="type-h-28 text-gd">Компендиум</h1>
        <span className="type-num-12 text-t2">{RACES.length} рас · {subraces} подрас · {CLASSES.length} классов · {subclasses} подклассов · {FEATS.length} черт</span>
        <span className="type-body-xs text-t3">импорт {COMPENDIUM_META.importedAt} из {Object.values(COMPENDIUM_META.sources).join(' и ')}</span>
        {/* Таблицы не висят сами по себе: из них собирается персонаж — редактор на столе (#/desk/new). */}
        <a
          href="#/desk/new"
          title="Экран создания персонажа на столе: раса, класс, умения, заклинания и снаряжение из этих таблиц и SRD"
          className="ml-auto type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi hover:from-pl hover:to-pl focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)]"
        >
          Создать персонажа
        </a>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Segmented label="Матрица" items={VIEWS} value={view} onChange={v => { setView(v); setSelected(null); }} />
        <SourceFilter value={sources} onChange={setSources} />
        {view !== 'classes' && (
          <label className="flex items-center gap-2">
            <span className="type-body-xs text-t3">поиск</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={view === 'races' ? 'раса или подраса' : 'название или текст'}
              className="type-body-sm text-tx bg-cd shadow-bevel-in px-2 py-1 w-[220px] placeholder:text-t4"
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
        <div className="min-w-0">
          {view === 'races' && <RaceMatrix sources={sources} query={query} selectedId={selected?.id ?? null} onSelect={select} />}
          {view === 'classes' && <ClassGrid classId={classId} onClassChange={setClassId} sources={sources} selectedId={selected?.id ?? null} onSelect={select} />}
          {view === 'feats' && <FeatTable sources={sources} query={query} selectedId={selected?.id ?? null} onSelect={select} />}
        </div>
        <div className="sticky top-6">
          <DetailPane detail={selected?.detail ?? null} onClose={() => setSelected(null)} />
        </div>
      </div>

      <footer className="type-body-xs text-t3">{COMPENDIUM_META.license}</footer>
    </main>
  );
}
