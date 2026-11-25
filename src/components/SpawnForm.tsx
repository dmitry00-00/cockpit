// Появление противника в сессии (ACTOR_SPAWNED): блок из списка (SRD, Black Flag, A5E — с подписью библиотеки), имя, сколько штук. Компонент тупой —
// список блоков, подсказка имени и колбэк приходят пропсами; снимок актёра собирает страница (spawnMonsters),
// здесь только выбор. Блок — кнопка с CR, AC и хитами: за столом выбирают по силе, а не по алфавиту.
// Имя подставляется из подсказки при смене блока, пока мастер его не тронул; несколько штук — с номерами.
// У гуманоида — кнопка «Имя»: имя из округи партии (страница отдаёт suggestName, world/names), считается правкой мастера.
// Фильтры (ROADMAP 0.5, M15): библиотека — SRD, Black Flag, A5E — и CR «от» и «до»; initial — блок, выбранный заранее
// (итог встречи A5E «Появился»).
import { useState, type KeyboardEvent } from 'react';
import { Icon } from '../icons/Icon';
import { ArtImage, type ArtId } from '../art/ArtImage';
import './SpawnForm.css';

export interface SpawnOption {
  id: string;
  name: string;
  cr: string;
  ac: number;
  hp: number;
  size?: string;
  /** Creature type without optional parenthesized subtypes. */
  creatureType?: string;
  /** Movement modes explicitly present in the stat block. */
  movement?: readonly ('walk' | 'fly' | 'swim' | 'climb' | 'burrow')[];
  legendary?: boolean;
  token?: ArtId;
  /** User-owned/local token art in public/; relative to BASE_URL, with source note alongside the asset. */
  tokenSrc?: string;
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

export interface SpawnFilter { origin?: string; crMin?: string; crMax?: string; creatureType?: string; size?: string; movement?: string; legendary?: boolean }

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
  return options.filter(o => (!q || o.name.toLowerCase().includes(q)) && (!filter.origin || o.origin === filter.origin) &&
    (!filter.creatureType || o.creatureType === filter.creatureType) && (!filter.size || o.size === filter.size) &&
    (!filter.movement || o.movement?.includes(filter.movement as NonNullable<SpawnOption['movement']>[number])) &&
    (filter.legendary === undefined || Boolean(o.legendary) === filter.legendary) && crValue(o.cr) >= lo && crValue(o.cr) <= hi);
}

const SELECT = 'h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const OPT_LIB = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd';
const MOVEMENT_LABEL: Readonly<Record<string, string>> = { walk: 'ходьба', fly: 'полёт', swim: 'плавание', climb: 'лазание', burrow: 'рытьё' };

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
  const creatureTypes = [...new Set(options.map(o => o.creatureType).filter((x): x is string => Boolean(x)))].sort();
  const sizeOrder = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Titanic'];
  const sizes = [...new Set(options.map(o => o.size).filter((x): x is string => Boolean(x)))].sort((a, b) => {
    const ai = sizeOrder.indexOf(a), bi = sizeOrder.indexOf(b);
    return (ai < 0 ? sizeOrder.length : ai) - (bi < 0 ? sizeOrder.length : bi) || a.localeCompare(b);
  });
  const movements = [...new Set(options.flatMap(o => o.movement ?? []))];
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
    <div className={`spawn-form min-h-0 gap-2 overflow-hidden bg-pn p-3 shadow-float ${shown.length > 4 ? 'spawn-form--long-list' : ''} ${className}`}>
      <div className="spawn-title flex items-center gap-2">
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
        className={`spawn-search ${INPUT}`}
      />
      <div className="spawn-source-cr flex items-center justify-between gap-2">
        {origins.length > 1 ? (
          <div role="group" aria-label="Библиотека" className="flex gap-px">
            {[undefined, ...origins].map(o => (
              <button key={o ?? 'all'} type="button" aria-pressed={filter.origin === o} onClick={() => setF({ origin: o })} className={`${OPT_LIB} ${filter.origin === o ? 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)]' : 'text-t2 shadow-bevel hover:text-tx'}`}>
                {o ?? 'все'}
              </button>
            ))}
          </div>
        ) : null}
        <div className="spawn-cr-row flex items-center gap-2 type-body-sm text-t2">
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
      </div>
      <div className="spawn-filter-grid grid grid-cols-4 gap-1">
        <select aria-label="Тип существа" value={filter.creatureType ?? ''} onChange={e => setF({ creatureType: e.target.value || undefined })} className={`${SELECT} min-w-0`}>
          <option value="">Все типы</option>
          {creatureTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
        <select aria-label="Размер существа" value={filter.size ?? ''} onChange={e => setF({ size: e.target.value || undefined })} className={`${SELECT} min-w-0`}>
          <option value="">Все размеры</option>
          {sizes.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
        <select aria-label="Передвижение существа" title="Фильтр по указанным в блоке скоростям; это не ареал обитания." value={filter.movement ?? ''} onChange={e => setF({ movement: e.target.value || undefined })} className={`${SELECT} min-w-0`}>
          <option value="">Любое движение</option>
          {movements.map(mode => <option key={mode} value={mode}>{MOVEMENT_LABEL[mode] ?? mode}</option>)}
        </select>
        <select aria-label="Легендарные действия" value={filter.legendary === undefined ? '' : filter.legendary ? 'yes' : 'no'} onChange={e => setF({ legendary: e.target.value === '' ? undefined : e.target.value === 'yes' })} className={`${SELECT} min-w-0`}>
          <option value="">Любые действия</option><option value="yes">Легендарные</option><option value="no">Без легендарных</option>
        </select>
      </div>
      <div aria-hidden="true" className="spawn-table-head grid grid-cols-[36px_minmax(0,1fr)_40px_34px_40px] gap-1 px-2 type-key uppercase text-t3">
        <span /> <span>Существо</span><span className="text-right">CR</span><span className="text-right">AC</span><span className="text-right">HP</span>
      </div>
      <div role="group" aria-label="Блок" className="spawn-option-list flex min-h-24 flex-1 flex-col gap-1 overflow-auto">
        {shown.map(o => (
          <button key={o.id} type="button" aria-pressed={o.id === monsterId} aria-label={`${o.name}, ${o.creatureType ?? 'тип не указан'}, ${o.size ?? 'размер не указан'}${o.origin ? `, ${o.origin}` : ''}, CR ${o.cr}, AC ${o.ac}, HP ${o.hp}`} title={`${o.name}${o.origin ? ` (${o.origin})` : ''}: ${o.creatureType ?? 'тип не указан'}, ${o.size ?? 'размер не указан'}, CR ${o.cr}, AC ${o.ac}, ${o.hp} хитов`} onClick={() => pick(o)} className={`${OPT} grid grid-cols-[36px_minmax(0,1fr)_40px_34px_40px] gap-1 min-h-12 ${o.id === monsterId ? OPT_ON : OPT_OFF}`}>
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-[var(--ent-monster)] bg-wl">
              {o.tokenSrc ? <img src={`${import.meta.env.BASE_URL}${o.tokenSrc}`} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-9 w-9 object-cover" /> : o.token ? <ArtImage asset={o.token} alt="" width={36} sizes="36px" className="h-9 w-9 object-cover" /> : <Icon name="ent-monster" size={24} color="var(--ent-monster)" title="" />}
            </span>
            <span className="flex min-w-0 flex-col justify-center leading-tight">
              <span className="truncate type-body">{o.name}</span>
              <span className="truncate type-key text-t2">{o.creatureType ?? 'тип не указан'} · {o.origin ?? 'SRD'}</span>
            </span>
            <span className="text-right type-key">{o.cr}</span>
            <span className="text-right type-key">{o.ac}</span>
            <span className="text-right type-key">{o.hp}</span>
          </button>
        ))}
      </div>
      <div className="spawn-name-row flex items-center gap-2">
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
        <button type="button" title="Появился в сессии: в стопку противников, в бою — в порядок инициативы · Enter" disabled={!ready} onClick={submit} className={`ml-auto ${BTN_MAIN}`}>
          Добавить
        </button>
      </div>
    </div>
  );
}

export default SpawnForm;
