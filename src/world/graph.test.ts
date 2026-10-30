// Граф мира (SIMULATION.md С2): разбор файла, соседи, кратчайший путь по цене идущего — дорога против напрямик по
// лесу, вода не пешком, ничья по id; граф с диска — дороги Sword Coast по канону, Cormyr связан хотя бы напрямик.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { neighbours, parseGraph, route, walkDays, type GraphEdge } from './graph';

const raw = {
  map: 't',
  nodes: [['a', 0, 0, 1], ['b', 10, 0, 0], ['c', 20, 0, 1], ['d', 10, 10, 0]],
  edges: [[0, 1, 'road', 30], [1, 2, 'road', 30], [0, 2, 'land', 40, 1], [0, 2, 'water', 20], [0, 3, 'land', 24, 0], [3, 2, 'land', 36, 0]],
};

describe('граф мира', () => {
  it('разбор: узлы и рёбра в обе стороны; битое — ошибка с номером', () => {
    const g = parseGraph(raw);
    expect(g.nodes.get('a')).toEqual({ id: 'a', x: 0, y: 0, harbour: true });
    expect(neighbours(g, 'a').map(n => `${n.to}:${n.edge.mode}`)).toEqual(['b:road', 'c:land', 'c:water', 'd:land']);
    expect(neighbours(g, 'a', ['water']).map(n => n.to)).toEqual(['c']);
    expect(() => parseGraph({ ...raw, edges: [[0, 9, 'road', 1]] })).toThrow(/ребро 0/);
    expect(() => parseGraph({ ...raw, edges: [[0, 1, 'air', 1]] })).toThrow(/ребро 0/);
    expect(() => parseGraph({ ...raw, nodes: [[1, 0, 0]] })).toThrow(/узел 0/);
    expect(() => parseGraph({})).toThrow(/map, nodes и edges/);
  });

  it('пешком: дорога 60 миль (2,5 дня) — дешевле напрямик 40 миль сплошь по лесу (80 трудных — 3,3 дня); вода не пешком', () => {
    const g = parseGraph({ ...raw, edges: raw.edges.filter(e => e[1] !== 3 && e[0] !== 3) });
    const r = route(g, 'a', 'c', walkDays())!;
    expect(r.nodes).toEqual(['a', 'b', 'c']);
    expect(r.cost).toBe(2.5);
    expect(r.miles).toBe(60);
    // Судно: вода — по своей скорости вида; суша — не пройти.
    const ship = (e: GraphEdge) => (e.mode === 'water' ? e.miles / 48 : undefined);
    expect(route(g, 'a', 'c', ship)?.edges.map(e => e.mode)).toEqual(['water']);
    expect(route(g, 'a', 'b', ship)).toBeNull();
    expect(route(g, 'a', 'nowhere', walkDays())).toBeNull();
  });

  it('ничья цен — тот же путь при каждом вызове: кто раньше дошёл, тот и предок', () => {
    const g = parseGraph(raw);
    // a→b→c и a→d→c — по 60 миль, по 2,5 дня.
    const flat = (e: GraphEdge) => (e.mode === 'water' || e.rough ? undefined : e.miles);
    expect(route(g, 'a', 'c', flat)?.nodes).toEqual(['a', 'd', 'c']);
    expect(route(g, 'a', 'c', flat)).toEqual(route(g, 'a', 'c', flat));
  });

  const FILE = 'maps/tiles/toril/graph.json';
  it.skipIf(!existsSync(FILE))('Toril с диска: Waterdeep — Baldur\'s Gate по дорогам 550–800 миль, Neverwinter — Waterdeep через Leilon, Suzail — Arabel связаны', () => {
    const g = parseGraph(JSON.parse(readFileSync(FILE, 'utf8')));
    const id = { waterdeep: 'e37dd71f-f84a-4ba1-a21c-2c98f6ad3cc2', bg: '0543bb91-3dd2-43f0-aea9-889787538ad4', neverwinter: '7e243b80-8918-42fa-b60e-03cec8bdb184', leilon: '0598e6f0-5933-41cf-b00b-bf8c97334031', suzail: 'd1fbe904-0436-468c-88c4-2e11039d5dc5', arabel: 'd5c174c8-79e5-434e-aff0-a2969ca2f9c6' };
    const roads = (e: GraphEdge) => (e.mode === 'road' ? e.miles : undefined);
    // Канон: около 750 миль по Trade Way (паспорт карты); граф идёт короче — по Coast Way через Soubar.
    const wb = route(g, id.waterdeep, id.bg, roads)!;
    expect(wb.miles).toBeGreaterThan(550);
    expect(wb.miles).toBeLessThan(800);
    expect(route(g, id.neverwinter, id.waterdeep, roads)?.nodes).toContain(id.leilon);
    // Пунктир дорог Cormyr рвётся у подписей — связь есть напрямик.
    expect(route(g, id.suzail, id.arabel, roads)).toBeNull();
    expect(route(g, id.suzail, id.arabel, walkDays())?.miles).toBeLessThan(150);
    expect(g.nodes.get(id.waterdeep)?.harbour).toBe(true);
  });
});
