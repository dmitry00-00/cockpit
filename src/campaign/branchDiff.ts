// Разница миров для веток «что если» (Д4): основная линия и ветки рядом — только то, что разошлось. Числа мира, а не
// слова: дата, отношения фракций, известность, влияние и тренд, цены и опасность мест, веса встреч, нити, решения по
// предложениям, припасы, где партия. Чистая функция над состояниями.
import { GOODS, partyPlaceId, type State } from '../engine';
import { GOODS_LABEL, RELATION_LABEL } from '../components/labels';
import { formatHarptos } from './calendar';

export type DiffGroup = 'time' | 'relation' | 'faction' | 'location' | 'thread' | 'delta' | 'party';

export interface WorldDiffRow {
  key: string;
  group: DiffGroup;
  label: string;
  /** По одному на состояние, в том же порядке; «—» — записи нет. */
  values: readonly string[];
}

const DELTA_WORD = { pending: 'ждёт', accepted: 'принято', rejected: 'отклонено' } as const;
const DANGER_WORD = { low: 'низкая', medium: 'средняя', high: 'высокая' } as const;
const pct = (n: number | undefined) => (n ? `${n > 0 ? '+' : ''}${n}%` : '0%');
const num = (n: number | undefined) => (n === undefined ? '—' : String(n));

export function diffWorld(states: readonly State[]): WorldDiffRow[] {
  const rows: WorldDiffRow[] = [];
  const add = (key: string, group: DiffGroup, label: string, of: (s: State) => string) => {
    const values = states.map(of);
    if (values.some(v => v !== values[0])) rows.push({ key, group, label, values });
  };
  const union = <T>(pick: (s: State) => Record<string, T>) => [...new Set(states.flatMap(s => Object.keys(pick(s))))].sort();
  const nameOf = (pick: (s: State) => Record<string, { name: string }>, id: string) => states.map(s => pick(s)[id]?.name).find(Boolean) ?? id;

  add('time', 'time', 'Дата', s => formatHarptos(s.time.sec));
  add('party', 'party', 'Где партия', s => { const id = partyPlaceId(s); return id ? s.world.locations[id]?.name ?? id : '—'; });
  add('supply', 'party', 'Припасы', s => String(s.supply ?? 0));

  const factions = union(s => s.world.factions);
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      const [a, b] = [factions[i], factions[j]];
      add(`rel:${a}|${b}`, 'relation', `${nameOf(s => s.world.factions, a)} — ${nameOf(s => s.world.factions, b)}`, s => {
        const v = s.world.factions[a]?.relations?.[b] ?? 0;
        return `${v > 0 ? '+' : ''}${v}${RELATION_LABEL[v] ? ` ${RELATION_LABEL[v]}` : ''}`;
      });
    }
  }
  for (const id of factions) {
    const name = nameOf(s => s.world.factions, id);
    add(`fac:${id}`, 'faction', `${name} · есть в кампании`, s => (s.world.factions[id] ? 'да' : 'нет'));
    add(`fac:${id}:renown`, 'faction', `${name} · известность партии`, s => num(s.world.factions[id]?.renown));
    add(`fac:${id}:influence`, 'faction', `${name} · влияние`, s => (s.world.factions[id]?.influencePercent === undefined ? '—' : `${s.world.factions[id].influencePercent}%`));
    add(`fac:${id}:trend`, 'faction', `${name} · тренд`, s => num(s.world.factions[id]?.trend));
  }
  for (const id of union(s => s.world.locations)) {
    const name = nameOf(s => s.world.locations, id);
    add(`loc:${id}`, 'location', `${name} · есть на карте`, s => (s.world.locations[id] ? 'да' : 'нет'));
    add(`loc:${id}:price`, 'location', `${name} · цены`, s => pct(s.world.locations[id]?.pricePercent));
    add(`loc:${id}:danger`, 'location', `${name} · опасность`, s => { const d = s.world.locations[id]?.danger; return d ? DANGER_WORD[d] : '—'; });
    for (const g of GOODS) add(`loc:${id}:goods:${g}`, 'location', `${name} · ${GOODS_LABEL[g]}`, s => pct(s.world.locations[id]?.prices?.[g]));
    const keys = [...new Set(states.flatMap(s => Object.keys(s.world.locations[id]?.encounters ?? {})))].sort();
    for (const k of keys) add(`loc:${id}:enc:${k}`, 'location', `${name} · ${k}`, s => `×${s.world.locations[id]?.encounters?.[k] ?? 1}`);
  }
  for (const id of union(s => s.world.threads)) {
    add(`thread:${id}`, 'thread', `Нить · ${nameOf(s => s.world.threads, id)}`, s => { const t = s.world.threads[id]; return t ? (t.status === 'open' ? 'открыта' : 'закрыта') : 'нет'; });
  }
  for (const id of union(s => s.deltas)) {
    const subject = states.map(s => s.deltas[id]?.subject).find(Boolean) ?? id;
    add(`delta:${id}`, 'delta', subject, s => { const d = s.deltas[id]; return d ? `${DELTA_WORD[d.status]}${d.status === 'accepted' ? `: ${d.now}` : ''}` : '—'; });
  }
  return rows;
}
