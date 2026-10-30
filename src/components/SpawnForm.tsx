// Появление противника в сессии (ACTOR_SPAWNED): блок из списка (SRD, Black Flag, A5E — с подписью библиотеки), имя, сколько штук. Компонент тупой —
// список блоков, подсказка имени и колбэк приходят пропсами; снимок актёра собирает страница (spawnMonsters),
// здесь только выбор. Блок — кнопка с CR, AC и хитами: за столом выбирают по силе, а не по алфавиту.
// Имя подставляется из подсказки при смене блока, пока мастер его не тронул; несколько штук — с номерами.
// У гуманоида — кнопка «Имя»: имя из округи партии (страница отдаёт suggestName, world/names), считается правкой мастера.
// Фильтры (ROADMAP 0.5, M15): библиотека — SRD, Black Flag, A5E — и CR «от» и «до»; initial — блок, выбранный заранее
// (итог встречи A5E «Появился»).
import { useState, type KeyboardEvent } from 'react';
import { Icon } from '../icons/Icon';

export interface SpawnOption {
  id: string;
  name: string;
  cr: string;
  ac: number;
  hp: number;
  /** Библиотека блока за столом: «SRD», «Black Flag», «A5E» — одноимённые блоки (Bandit) различаются ею. */
  origin?: string;
  /** Подсказка имени для этого блока — от страницы: «Bandit 4», если трое уже есть. */
  suggested: string;
  /** Гуманоид: ему можно дать имя из округи. */
  humanoid?: boolean;
}

export interface SpawnFormProps {
  options: readonly SpawnOption[];
  onSpawn: (monsterId: string, name: string, count: number) => void;
  /** Имя из округи партии для блока; null — рядом нет жителей с именами (место партии не на карте). */
  suggestName?: (monsterId: string) => Promise<string | null>;
  /** Блок, выбранный при открытии: встреча A5E «Появился». */
  initial?: string;
  className?: string;
}

/** CR числом для сравнения: «1/8» → 0,125. */
export const crValue = (cr: string): number => {
  const [a, b] = cr.split('/').map(Number);
  return b ? a / b : a;
};

export interface SpawnFilter { origin?: string; crMin?: string; crMax?: string }

/** Черновик числа штук → 1–20; иное — null, кнопка недоступна. */
export function parseCount(raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 1 && n <= 20 ? n : null;
}

const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:hover:from-pl enabled:hover:to-pl enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
/* Блок — корешок на плите: выбранный — золото и левая грань чудовища (форма, не только цвет). */
const OPT = 'flex items-center gap-2 w-full px-2 py-1 text-left bg-linear-to-b from-pl to-cd cursor-pointer hover:text-tx';
const OPT_OFF = 'text-t2 shadow-bevel focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_3px_0_0_var(--ent-monster)] focus-visible:shadow-[var(--bevel),inset_3px_0_0_var(--ent-monster),var(--glow-gold)]';
const BTN_NAME = 'h-7 flex-none px-2 type-body-sm text-t2 bg-linear-to-b from-pl to-cd shadow-bevel cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const INPUT = 'h-7 px-2 type-body-sm text-tx bg-wl shadow-bevel-in placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

/** Поиск по имени блока (подстрока без учёта регистра) и фильтры библиотеки и CR; пустое — все. */
export function filterOptions(options: readonly SpawnOption[], query: string, filter: SpawnFilter = {}): SpawnOption[] {
  const q = query.trim().toLowerCase();
  const lo = filter.crMin !== undefined ? crValue(filter.crMin) : -Infinity;
  const hi = filter.crMax !== undefined ? crValue(filter.crMax) : Infinity;
  return options.filter(o => (!q || o.name.toLowerCase().includes(q)) && (!filter.origin || o.origin === filter.origin) && crValue(o.cr) >= lo && crValue(o.cr) <= hi);
}

const SELECT = 'h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const OPT_LIB = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd';

export function SpawnForm({ options, onSpawn, suggestName, initial, className = '' }: SpawnFormProps) {
  const first = options.find(o => o.id === initial) ?? options[0];
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SpawnFilter>({});
  const [monsterId, setMonsterId] = useState(first?.id ?? '');
  const [name, setName] = useState(first?.suggested ?? '');
  const [touched, setTouched] = useState(false);
  const [countDraft, setCountDraft] = useState('1');
  const shown = filterOptions(options, query, filter);
  const origins = [...new Set(options.map(o => o.origin).filter((x): x is string => Boolean(x)))];
  const crs = [...new Set(options.map(o => o.cr))].sort((a, b) => crValue(a) - crValue(b));
  const picked = options.find(o => o.id === monsterId);
  const count = parseCount(countDraft);
  // Фильтр мог скрыть выбранный блок — «Добавить» не добавляет невидимое.
  const ready = picked !== undefined && shown.some(o => o.id === picked.id) && count !== null;

  const pick = (o: SpawnOption) => {
    setMonsterId(o.id);
    if (!touched) setName(o.suggested);
  };
  /** Поиск сузил список и выбранный из него выпал — выбирается первый видимый, чтобы «Добавить» не добавил невидимое. */
  const search = (q: string, f: SpawnFilter = filter) => {
    setQuery(q);
    setFilter(f);
    const next = filterOptions(options, q, f);
    if (next.length > 0 && !next.some(o => o.id === monsterId)) pick(next[0]);
  };
  const setF = (patch: SpawnFilter) => search(query, { ...filter, ...patch });
  const submit = () => { if (ready) onSpawn(picked.id, name.trim() || picked.name, count); };
  const [naming, setNaming] = useState(false);
  const [noName, setNoName] = useState(false);
  const nameFromArea = async () => {
    if (!picked || !suggestName) return;
    setNaming(true);
    const n = await suggestName(picked.id).catch(() => null);
    setNaming(false);
    setNoName(n === null);
    if (n) { setTouched(true); setName(n); }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  if (options.length === 0) return null;
  return (
    <div className={`flex w-80 flex-col gap-2 bg-pn p-3 shadow-float ${className}`}>
      <div className="flex items-center gap-2">
        <Icon name="ent-monster" size={16} color="var(--ent-monster)" title="Чудовище" />
        <span className="type-h-17 text-tx">Добавить противника</span>
      </div>
      <input
        type="search"
        autoComplete="off"
        aria-label="Найти блок"
        placeholder={`Найти среди ${options.length}`}
        value={query}
        onChange={e => search(e.target.value)}
        onKeyDown={onKeyDown}
        className={INPUT}
      />
      {origins.length > 1 ? (
        <div role="group" aria-label="Библиотека" className="flex gap-px">
          {[undefined, ...origins].map(o => (
            <button key={o ?? 'all'} type="button" aria-pressed={filter.origin === o} onClick={() => setF({ origin: o })} className={`${OPT_LIB} ${filter.origin === o ? 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)]' : 'text-t2 shadow-bevel hover:text-tx'}`}>
              {o ?? 'все'}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2 type-body-sm text-t2">
        <span>CR</span>
        <select aria-label="CR от" value={filter.crMin ?? ''} onChange={e => setF({ crMin: e.target.value || undefined })} className={SELECT}>
          <option value="">от</option>
          {crs.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="CR до" value={filter.crMax ?? ''} onChange={e => setF({ crMax: e.target.value || undefined })} className={SELECT}>
          <option value="">до</option>
          {crs.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="ml-auto type-key">{shown.length} из {options.length}</span>
      </div>
      <div role="group" aria-label="Блок" className="flex flex-col gap-1 max-h-64 overflow-auto">
        {shown.map(o => (
          <button key={o.id} type="button" aria-pressed={o.id === monsterId} title={`${o.name}${o.origin ? ` (${o.origin})` : ''}: CR ${o.cr}, AC ${o.ac}, ${o.hp} хитов`} onClick={() => pick(o)} className={`${OPT} ${o.id === monsterId ? OPT_ON : OPT_OFF}`}>
            <span className="flex-1 min-w-0 truncate type-body">{o.name}</span>
            {o.origin ? <span className="type-key flex-none text-t2">{o.origin}</span> : null}
            <span className="type-key flex-none">CR {o.cr}</span>
            <span className="type-key flex-none">AC {o.ac}</span>
            <span className="type-key flex-none">HP {o.hp}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoComplete="off"
          aria-label="Имя"
          placeholder={picked?.suggested}
          value={name}
          onChange={e => { setTouched(true); setName(e.target.value); }}
          onKeyDown={onKeyDown}
          className={`${INPUT} flex-1 min-w-0`}
        />
        {suggestName && picked?.humanoid ? (
          <button
            type="button"
            disabled={naming}
            title={noName ? 'Рядом с партией нет жителей с именами: место партии не на карте мира' : 'Имя из округи партии: имя одного жителя вики и фамилия другого — не из канона; ещё раз — другое'}
            onClick={nameFromArea}
            className={`${BTN_NAME} ${noName ? 'text-t3' : ''}`}
          >
            Имя
          </button>
        ) : null}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Сколько"
          title="Сколько штук: 1–20, несколько — с номерами"
          value={countDraft}
          onChange={e => setCountDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onKeyDown={onKeyDown}
          className={`${INPUT} w-10 text-center type-num-15`}
        />
        <span className="type-key text-t2 flex-none">шт.</span>
      </div>
      <div className="flex items-center">
        <button type="button" title="Появился в сессии: в стопку противников, в бою — в порядок инициативы · Enter" disabled={!ready} onClick={submit} className={`ml-auto ${BTN_MAIN}`}>
          Добавить
        </button>
      </div>
    </div>
  );
}

export default SpawnForm;
