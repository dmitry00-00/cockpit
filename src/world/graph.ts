// Граф мира (SIMULATION.md С2): поселения справочника карты — узлы, дороги, вода и «напрямик» — рёбра с милями.
// Собирает scripts/graph-from-grids.py в maps/tiles/<id>/graph.json рядом со схемой; грузится по требованию, только
// ленивыми частями (виды процессов С3+) — в основной кусок не идёт. Цену ребра задаёт тот, кто ходит: караван, войско,
// весть; здесь — только дни пешего пути по SRD (Travel Pace, Difficult Terrain), скорость судов — правило вида.
import { DIFFICULT_TERRAIN_FACTOR, TRAVEL_PACES, type TravelPaceId } from '../rules/srd/travel';

export type GraphMode = 'road' | 'water' | 'land';

export interface GraphNode {
  /** id места справочника карты (content/maps/<id>-places.json). */
  id: string;
  x: number;
  y: number;
  /** Вода растра рядом — у места есть пристань. */
  harbour: boolean;
}

export interface GraphEdge {
  a: string;
  b: string;
  mode: GraphMode;
  miles: number;
  /** Напрямик: доля трудной местности (лес, горы, болото, лёд) на прямой, 0–1. */
  rough?: number;
}

export interface WorldGraph {
  map: string;
  nodes: ReadonlyMap<string, GraphNode>;
  /** Рёбра узла в обе стороны. */
  adj: ReadonlyMap<string, readonly GraphEdge[]>;
  edges: readonly GraphEdge[];
}

const MODES = new Set<GraphMode>(['road', 'water', 'land']);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Разбор файла графа: узлы [id, x, y, гавань], рёбра [i, j, вид, мили, трудная доля?]; битый — ошибка с причиной. */
export function parseGraph(raw: unknown): WorldGraph {
  const o = raw as { map?: unknown; nodes?: unknown; edges?: unknown };
  if (!o || typeof o.map !== 'string' || !Array.isArray(o.nodes) || !Array.isArray(o.edges)) throw new Error('граф мира: ожидались map, nodes и edges');
  const list: GraphNode[] = o.nodes.map((n, i) => {
    if (!Array.isArray(n) || typeof n[0] !== 'string' || !num(n[1]) || !num(n[2])) throw new Error(`граф мира: узел ${i} — ожидалось [id, x, y, гавань]`);
    return { id: n[0], x: n[1], y: n[2], harbour: n[3] === 1 };
  });
  const adj = new Map<string, GraphEdge[]>(list.map(n => [n.id, []]));
  const edges = o.edges.map((e, i): GraphEdge => {
    const [a, b, mode, miles, rough] = Array.isArray(e) ? e : [];
    if (!num(a) || !num(b) || !list[a] || !list[b] || !MODES.has(mode) || !num(miles)) throw new Error(`граф мира: ребро ${i} — ожидалось [i, j, road|water|land, мили]`);
    const edge: GraphEdge = { a: list[a].id, b: list[b].id, mode, miles, ...(num(rough) ? { rough } : {}) };
    adj.get(edge.a)!.push(edge);
    adj.get(edge.b)!.push(edge);
    return edge;
  });
  return { map: o.map, nodes: new Map(list.map(n => [n.id, n])), adj, edges };
}

const cache = new Map<string, Promise<WorldGraph | null>>();
/** Граф карты с сервера стола, один раз на сеанс; нет файла (не собран) — null: симуляция без путей. */
export function loadGraph(url: string): Promise<WorldGraph | null> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(r => (r.ok ? r.json().then(parseGraph) : null)).catch(() => null));
  }
  return cache.get(url)!;
}

/** Сосед по ребру. */
export const across = (e: GraphEdge, from: string) => (e.a === from ? e.b : e.a);

/** Соседи узла: ребро и куда ведёт; вид — фильтром. */
export function neighbours(g: WorldGraph, id: string, modes?: readonly GraphMode[]): { to: string; edge: GraphEdge }[] {
  return (g.adj.get(id) ?? []).filter(e => !modes || modes.includes(e.mode)).map(edge => ({ to: across(edge, id), edge }));
}

/** Цена ребра для того, кто идёт; undefined — не пройти (карета по воде). */
export type EdgeCost = (e: GraphEdge) => number | undefined;

/**
 * Пешие дни по ребру суши, SRD: Travel Pace (24 мили в день обычным темпом) и Difficult Terrain (трудная миля — за две).
 * Дорога трудной не считается, как у похода (routeTerrain); вода — не пешком: undefined.
 */
export const walkDays = (pace: TravelPaceId = 'normal'): EdgeCost => e =>
  e.mode === 'water'
    ? undefined
    // Как travelDaysOver, но без округления на ребре: десятые копились бы по пути.
    : (e.miles + (e.mode === 'land' ? e.miles * (e.rough ?? 0) : 0) * (DIFFICULT_TERRAIN_FACTOR - 1)) / TRAVEL_PACES[pace].milesPerDay;

export interface GraphRoute {
  /** Узлы по порядку, от начала до конца. */
  nodes: readonly string[];
  edges: readonly GraphEdge[];
  cost: number;
  miles: number;
}

/** Кратчайший путь по цене (Дейкстра); куча — по цене, затем по id, так что тот же граф даёт тот же путь. Нет пути — null. */
export function route(g: WorldGraph, from: string, to: string, cost: EdgeCost): GraphRoute | null {
  if (!g.nodes.has(from) || !g.nodes.has(to)) return null;
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, GraphEdge>();
  const done = new Set<string>();
  const heap = new MinHeap();
  heap.push(0, from);
  while (heap.size) {
    const [d, u] = heap.pop()!;
    if (done.has(u)) continue;
    done.add(u);
    if (u === to) break;
    for (const e of g.adj.get(u) ?? []) {
      const c = cost(e);
      if (c === undefined || c < 0) continue;
      const v = across(e, u);
      const nd = d + c;
      const old = dist.get(v);
      if (old === undefined || nd < old) {
        dist.set(v, nd);
        prev.set(v, e);
        heap.push(nd, v);
      }
    }
  }
  if (!done.has(to)) return null;
  const nodes = [to];
  const edges: GraphEdge[] = [];
  while (nodes[0] !== from) {
    const e = prev.get(nodes[0])!;
    edges.unshift(e);
    nodes.unshift(across(e, nodes[0]));
  }
  return { nodes, edges, cost: dist.get(to)!, miles: Math.round(edges.reduce((s, e) => s + e.miles, 0) * 10) / 10 };
}

/** Двоичная куча (цена, id): ничья — по id. */
class MinHeap {
  private a: [number, string][] = [];
  get size() { return this.a.length; }
  private less = (i: number, j: number) => this.a[i][0] < this.a[j][0] || (this.a[i][0] === this.a[j][0] && this.a[i][1] < this.a[j][1]);
  push(k: number, v: string) {
    const a = this.a;
    a.push([k, v]);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): [number, string] | undefined {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
