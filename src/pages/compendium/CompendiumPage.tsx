// Экран «Компендиум»: три матрицы, снятые с таблиц-первоисточников, поверх content/compendium/*.json, и боги
// импорта вики (E2, отдельным куском). Это второй способ ориентироваться в расах, классах, чертах и пантеонах —
// рядом с прозой книги, а не вместо неё.
import { Suspense, lazy, useState } from 'react';
import { COMPENDIUM_META, CLASSES, FEATS, RACES, type Source } from '../../rules/compendium';
import { SOURCES } from '../../rules/compendium/views';
import { ClassGrid } from './ClassGrid';
import { FeatTable } from './FeatTable';
import { RaceMatrix } from './RaceMatrix';
import { DetailPane, Segmented, SourceFilter, type Detail } from './parts';

// Боги — 0,5 МБ данных: матрица грузится, только когда её открыли.
const DeityTable = lazy(() => import('./DeityTable'));
// Державы (вид `kingdom:`, 30.10.2026) — тоже отдельным куском с данными.
const KingdomTable = lazy(() => import('./KingdomTable'));
// Поселения — реестр заполненности справочника карты (пользователь 30.10.2026), тоже своим куском.
const PlaceTable = lazy(() => import('./PlaceTable'));
// Единый индекс SRD 5.1 — отдельный chunk, чтобы не загружать каталог на других матрицах.
const SrdCatalog = lazy(() => import('./SrdCatalog').then(module => ({ default: module.SrdCatalog })));

type View = 'srd' | 'races' | 'classes' | 'feats' | 'deities' | 'kingdoms' | 'places';

const VIEWS: readonly { id: View; label: string; hint: string }[] = [
  { id: 'srd', label: 'Каталог SRD', hint: 'единый индекс: тип записи, раздел книги и происхождение' },
  { id: 'races', label: 'Расы × фасеты', hint: 'лист «Кратко»: что даёт раса, по колонкам' },
  { id: 'classes', label: 'Уровни × подклассы', hint: 'лист класса: ресурсы и умения по уровням' },
  { id: 'feats', label: 'Черты × эффекты', hint: 'лист «Нерасовые черты»' },
  { id: 'deities', label: 'Боги × пантеоны', hint: 'карточки {{Deity}} Forgotten Realms Wiki: поля по эпохе, служение схемой' },
  { id: 'kingdoms', label: 'Державы', hint: 'статьи-державы Forgotten Realms Wiki: столица, правитель на год, народ, торговля, соседи' },
  { id: 'places', label: 'Поселения', hint: 'реестр городов и поселений Toril: что заполнено, что пусто, чего нет на карте' },
];

/** «#/compendium/classes/volsebnik» — стартовая матрица и класс из адреса; дальше адрес не трогаем. */
function fromHash(): { view: View; classId: string } {
  const parts = (globalThis.location?.hash ?? '').split('/').filter(Boolean); // ['#', 'compendium', 'classes', 'volsebnik']
  if (parts[1] === 'library') parts.splice(1, 1);
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
        {view !== 'deities' && view !== 'kingdoms' && view !== 'places' && view !== 'srd' && <SourceFilter value={sources} onChange={setSources} />}
        {view !== 'classes' && view !== 'srd' && (
          <label className="flex items-center gap-2">
            <span className="type-body-xs text-t3">поиск</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={view === 'races' ? 'раса или подраса' : view === 'deities' ? 'имя, титул или сфера' : view === 'kingdoms' ? 'имя, столица или регион' : view === 'places' ? 'имя или держава' : 'название или текст'}
              className="type-body-sm text-tx bg-cd shadow-bevel-in px-2 py-1 w-[220px] placeholder:text-t4"
            />
          </label>
        )}
      </div>

      {view === 'srd' ? (
        <Suspense fallback={<p className="type-body-sm text-t2">Каталог SRD загружается…</p>}>
          <SrdCatalog />
        </Suspense>
      ) : view === 'deities' ? (
        <Suspense fallback={<p className="type-body-sm text-t2">Боги загружаются…</p>}>
          <DeityTable query={query} />
        </Suspense>
      ) : view === 'kingdoms' ? (
        <Suspense fallback={<p className="type-body-sm text-t2">Державы загружаются…</p>}>
          <KingdomTable query={query} />
        </Suspense>
      ) : view === 'places' ? (
        <Suspense fallback={<p className="type-body-sm text-t2">Поселения загружаются…</p>}>
          <PlaceTable query={query} />
        </Suspense>
      ) : (
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
      )}

      <footer className="type-body-xs text-t3">{COMPENDIUM_META.license}</footer>
    </main>
  );
}
