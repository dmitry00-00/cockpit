#!/usr/bin/env python3
# Граф мира для симуляции (SIMULATION.md С2): поселения справочника карты — узлы, связи по дорогам и по воде — рёбра
# с милями. По нему ходят караваны, войска и вести (С3–С8); путь похода по-прежнему считает routeTerrain.
#
#   .venv/bin/python scripts/graph-from-grids.py content/maps/toril.json [--optional] [--out <файл>]
#
# Читает maps/tiles/<id>/roads.png (roads-from-map.py: 255 — дорога, клетка 4 px) и дороги schema.json
# (schema-from-grids.py: сшиты через разрывы пунктира — рисуются поверх сетки), terrain.png (terrain-from-map.py:
# код класса × 25, клетка 8 px; вода — код 0) и content/maps/<id>-places.json; пишет maps/tiles/<id>/graph.json рядом
# со схемой — его грузит симуляция по требованию.
#
# Узлы — места поселенческих классов (SETTLEMENT): города, городки, деревни, крепости, постоялые дворы, храмы,
# оазисы, рудники. Урочища, руины и природные объекты — не узлы: торговать и воевать там не с кем.
# Дороги: место привязывается к ближайшей клетке дороги не дальше ROAD_SNAP клеток; от всех мест разом идёт
# Дейкстра по клеткам дорог (соседи до ROAD_JUMP клеток — пунктир растра рвётся), каждая клетка достаётся ближайшему
# месту. Две соседние клетки разных мест — ребро между ними, длина — путь через эту пару; из всех пар — кратчайший.
# Так рёбра идут только между соседями по дороге: Waterdeep — Daggerford, а не Waterdeep — Baldur's Gate.
# Места на одной клетке дороги связываются прямо, длина — по прямой.
# Вода: гавань — место, у которого вода растра не дальше WATER_SNAP клеток сетки воды (WATER_CELL px); та же Дейкстра
# по клеткам воды между гаванями. Озёра — тоже вода: лодки ходят и там. Реками (тонкая вода) суда не ходят — их на
# сетке местности нет.
#
# Напрямик (замер 30.10: дорожная сеть растра — 52 куска, Suzail и Arabel не связаны: пунктир рвётся у подписей на
# 30–60 px): каждое место связано с LAND_NEAREST ближайшими не дальше LAND_MAX, если прямая не идёт по воде и
# дороги между ними нет. У ребра — доля трудной местности на прямой: войско и караван выберут дорогу сами по цене.
#
# Мили — пиксели исходника × milesPerPixel паспорта. Нет сеток — сказать и выйти с 0 (setup.command).
import heapq
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SETTLEMENT = {'City', 'Town', 'Village', 'Fortification', 'Inn', 'Monastic Site', 'Temple', 'Oasis', 'Mine'}
ROAD_SNAP = 6      # клеток дороги (4 px): 24 px ≈ 9 миль — значок места стоит рядом с дорогой, а не на ней
ROAD_JUMP = 3      # клеток: разрывы пунктира до 12 px ≈ 4 миль перепрыгиваются
WATER_CELL = 16    # px исходника на клетку воды: 2 × 2 клетки местности
WATER_SNAP = 2     # клеток воды: 32 px ≈ 12 миль от значка до воды — гавань
LAND_NEAREST = 4   # «напрямик» — к стольким ближайшим соседям…
LAND_MAX = 300     # …не дальше px исходника (≈ 111 миль)
LAND_WATER = 0.1   # доля воды на прямой, выше — не напрямик, а по воде
DIFFICULT = {3, 4, 5, 7}  # f, m, s, i — коды трудной местности, как DIFFICULT в src/map/terrain.ts


def offsets(radius):
    """Соседи в круге radius без центра: (dy, dx, длина)."""
    return [(dy, dx, math.hypot(dy, dx)) for dy in range(-radius, radius + 1) for dx in range(-radius, radius + 1)
            if (dy or dx) and dy * dy + dx * dx <= radius * radius]


def nearest(mask, y, x, radius):
    """Ближайшая клетка маски в круге radius: (y, x, длина) или None."""
    h, w = mask.shape
    best = None
    for dy, dx, d in [(0, 0, 0.0)] + offsets(radius):
        yy, xx = y + dy, x + dx
        if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and (best is None or d < best[2]):
            best = (yy, xx, d)
    return best


def voronoi_edges(mask, seeds, step):
    """
    Дейкстра от всех семян разом по клеткам mask (соседи — offsets(step)). seeds: {клетка: (узел, стартовая длина)}.
    Ребро a–b: соседние клетки разных узлов, длина — dist(u) + |uv| + dist(v), из всех пар — кратчайшая. Клетки.
    """
    h, w = mask.shape
    nbr = offsets(step)
    dist = {}
    owner = {}
    heap = []
    for cell, (node, d0) in seeds.items():
        dist[cell] = d0
        owner[cell] = node
        heap.append((d0, cell))
    heapq.heapify(heap)
    while heap:
        d, (y, x) = heapq.heappop(heap)
        if d > dist[(y, x)]:
            continue
        o = owner[(y, x)]
        for dy, dx, l in nbr:
            yy, xx = y + dy, x + dx
            if not (0 <= yy < h and 0 <= xx < w) or not mask[yy, xx]:
                continue
            nd = d + l
            if nd < dist.get((yy, xx), math.inf):
                dist[(yy, xx)] = nd
                owner[(yy, xx)] = o
                heapq.heappush(heap, (nd, (yy, xx)))
    edges = {}
    for (y, x), a in owner.items():
        for dy, dx, l in nbr:
            b = owner.get((y + dy, x + dx))
            if b is None or b <= a:
                continue
            length = dist[(y, x)] + l + dist[(y + dy, x + dx)]
            if length < edges.get((a, b), math.inf):
                edges[(a, b)] = length
    return edges, owner


def land_edges(nodes, terrain, t_cell, roads):
    """Напрямик: {(i, j): (длина px, доля трудной местности)} — к ближайшим соседям, мимо воды и дорог."""
    xy = np.array([[p['x'], p['y']] for p in nodes], dtype=float)
    h, w = terrain.shape
    out = {}
    for i in range(len(nodes)):
        d = np.hypot(*(xy - xy[i]).T)
        d[i] = math.inf
        for j in np.argsort(d)[:LAND_NEAREST]:
            j = int(j)
            a, b = min(i, j), max(i, j)
            if d[j] > LAND_MAX or (a, b) in roads or (a, b) in out:
                continue
            n = max(2, int(d[j] // t_cell))
            ts = np.linspace(0, 1, n)
            ys = np.clip(((xy[i, 1] + (xy[j, 1] - xy[i, 1]) * ts) // t_cell).astype(int), 0, h - 1)
            xs = np.clip(((xy[i, 0] + (xy[j, 0] - xy[i, 0]) * ts) // t_cell).astype(int), 0, w - 1)
            codes = terrain[ys, xs] // 25
            if (codes == 0).mean() > LAND_WATER:
                continue
            land = codes[codes != 0]
            out[(a, b)] = (float(d[j]), round(float(np.isin(land, list(DIFFICULT)).mean()) if len(land) else 0.0, 2))
    return out


ROOT = Path(__file__).resolve().parent.parent


def build(passport, places):
    base = ROOT / 'maps/tiles' / passport['id']
    roads = np.array(Image.open(base / 'roads.png')) == 255
    road_cell = passport['roads']['cell']
    schema = base / 'schema.json'
    if schema.exists():
        # Дороги схемы сшиты через разрывы пунктира (schema-from-grids.py): их линии — поверх сетки.
        im = Image.new('L', (roads.shape[1], roads.shape[0]), 0)
        draw = ImageDraw.Draw(im)
        for line in json.loads(schema.read_text())['roads']:
            draw.line([(line[i] / road_cell, line[i + 1] / road_cell) for i in range(0, len(line), 2)], fill=255, width=1)
        roads |= np.array(im) == 255
    terrain = np.array(Image.open(base / 'terrain.png'))
    t_cell = passport['terrain']['cell']
    k = WATER_CELL // t_cell
    hh, ww = terrain.shape[0] // k, terrain.shape[1] // k
    # Клетка воды — вода, если вода растра в большинстве её клеток местности: одиночные клетки воды — шум.
    water = (terrain[:hh * k, :ww * k] == 0).reshape(hh, k, ww, k).mean(axis=(1, 3)) >= 0.5
    mpp = passport['milesPerPixel']

    nodes = [p for p in places if p.get('class') in SETTLEMENT]
    nodes.sort(key=lambda p: p['id'])
    index = {p['id']: i for i, p in enumerate(nodes)}

    road_seeds = {}
    direct = {}
    snapped = 0
    for i, p in enumerate(nodes):
        hit = nearest(roads, int(p['y'] // road_cell), int(p['x'] // road_cell), ROAD_SNAP)
        if not hit:
            continue
        snapped += 1
        cell, d = (hit[0], hit[1]), hit[2]
        prev = road_seeds.get(cell)
        if prev:
            # Два места на одной клетке дороги — прямая связь, клетка — ближнему.
            j = prev[0]
            q = nodes[j]
            a, b = min(i, j), max(i, j)
            direct[(a, b)] = math.hypot(p['x'] - q['x'], p['y'] - q['y']) / road_cell
            if d >= prev[1]:
                continue
        road_seeds[cell] = (i, d)
    road_edges, _ = voronoi_edges(roads, road_seeds, ROAD_JUMP)
    for key, length in direct.items():
        road_edges[key] = min(road_edges.get(key, math.inf), length)

    water_seeds = {}
    harbours = set()
    for i, p in enumerate(nodes):
        hit = nearest(water, int(p['y'] // WATER_CELL), int(p['x'] // WATER_CELL), WATER_SNAP)
        if not hit:
            continue
        harbours.add(i)
        cell = (hit[0], hit[1])
        if cell not in water_seeds or hit[2] < water_seeds[cell][1]:
            water_seeds[cell] = (i, hit[2])
    water_edges, _ = voronoi_edges(water, water_seeds, 1)

    edges = [[a, b, 'road', round(l * road_cell * mpp, 1)] for (a, b), l in sorted(road_edges.items())]
    edges += [[a, b, 'water', round(l * WATER_CELL * mpp, 1)] for (a, b), l in sorted(water_edges.items())]
    land = land_edges(nodes, terrain, t_cell, set(road_edges))
    edges += [[a, b, 'land', round(l * mpp, 1), rough] for (a, b), (l, rough) in sorted(land.items())]
    out = {
        'map': passport['id'],
        'note': 'scripts/graph-from-grids.py: узлы [id, x, y, гавань 0/1], рёбра [i, j, road|water|land, мили, доля трудной местности у land]',
        'nodes': [[p['id'], p['x'], p['y'], 1 if i in harbours else 0] for i, p in enumerate(nodes)],
        'edges': edges,
    }
    stats = {'nodes': len(nodes), 'onRoad': snapped, 'harbours': len(harbours),
             'roadEdges': len(road_edges), 'waterEdges': len(water_edges), 'landEdges': len(land)}
    return out, stats, index


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    optional = '--optional' in argv
    out_path = argv[argv.index('--out') + 1] if '--out' in argv else None
    if out_path:
        args.remove(out_path)
    if not args:
        print('usage: graph-from-grids.py content/maps/<id>.json [--optional] [--out <файл>]', file=sys.stderr)
        return 2
    passport = json.loads(Path(args[0]).read_text())
    base = ROOT / 'maps/tiles' / passport['id']
    places_file = Path(args[0]).with_name(f"{passport['id']}-places.json")
    missing = [str(f) for f in (base / 'roads.png', base / 'terrain.png', places_file) if not f.exists()]
    if missing:
        print(f"граф мира: нет {', '.join(missing)} — граф не собран", file=sys.stderr)
        return 0 if optional else 1
    places = json.loads(places_file.read_text())['places']
    graph, stats, _ = build(passport, places)
    target = Path(out_path) if out_path else base / 'graph.json'
    target.write_text(json.dumps(graph, ensure_ascii=False, separators=(',', ':')))
    print(f"граф мира: {target} — узлов {stats['nodes']}, у дороги {stats['onRoad']}, гаваней {stats['harbours']}, "
          f"рёбер по дорогам {stats['roadEdges']}, по воде {stats['waterEdges']}, напрямик {stats['landEdges']}")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
