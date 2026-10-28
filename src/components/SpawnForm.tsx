// Появление противника в сессии (ACTOR_SPAWNED): блок из списка (SRD, Black Flag, A5E — с подписью библиотеки), имя, сколько штук. Компонент тупой —
// список блоков, подсказка имени и колбэк приходят пропсами; снимок актёра собирает страница (spawnMonsters),
// здесь только выбор. Блок — кнопка с CR, AC и хитами: за столом выбирают по силе, а не по алфавиту.
// Имя подставляется из подсказки при смене блока, пока мастер его не тронул; несколько штук — с номерами.
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
}

export interface SpawnFormProps {
  options: readonly SpawnOption[];
  onSpawn: (monsterId: string, name: string, count: number) => void;
  className?: string;
}

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
const INPUT = 'h-7 px-2 type-body-sm text-tx bg-wl shadow-bevel-in placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

/** Поиск по имени блока: подстрока без учёта регистра; пустой запрос — все. */
export function filterOptions(options: readonly SpawnOption[], query: string): SpawnOption[] {
  const q = query.trim().toLowerCase();
  return q ? options.filter(o => o.name.toLowerCase().includes(q)) : [...options];
}

export function SpawnForm({ options, onSpawn, className = '' }: SpawnFormProps) {
  const [query, setQuery] = useState('');
  const [monsterId, setMonsterId] = useState(options[0]?.id ?? '');
  const [name, setName] = useState(options[0]?.suggested ?? '');
  const [touched, setTouched] = useState(false);
  const [countDraft, setCountDraft] = useState('1');
  const shown = filterOptions(options, query);
  const picked = options.find(o => o.id === monsterId);
  const count = parseCount(countDraft);
  const ready = picked !== undefined && count !== null;

  const pick = (o: SpawnOption) => {
    setMonsterId(o.id);
    if (!touched) setName(o.suggested);
  };
  /** Поиск сузил список и выбранный из него выпал — выбирается первый видимый, чтобы «Добавить» не добавил невидимое. */
  const search = (q: string) => {
    setQuery(q);
    const next = filterOptions(options, q);
    if (next.length > 0 && !next.some(o => o.id === monsterId)) pick(next[0]);
  };
  const submit = () => { if (ready) onSpawn(picked.id, name.trim() || picked.name, count); };
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
