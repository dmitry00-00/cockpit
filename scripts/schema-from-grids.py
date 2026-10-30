#!/usr/bin/env python3
# Векторная схема карты (TASKS M16): суша и реки — по цвету воды растра, регионы местности полигонами, дороги линиями.
#
#   .venv/bin/python scripts/schema-from-grids.py content/maps/toril.json [--optional] [--out <файл>]
#
# Читает maps/tiles/<id>/terrain.png (terrain-from-map.py: код класса × 25 на клетку), roads.png (roads-from-map.py:
# 255 — дорога) и тайлы уровня maxZoom − 1 (2 px исходника на пиксель), пишет maps/tiles/<id>/schema.json рядом с
# тайлами — его грузит стол в режиме «Схема».
#
# Суша (с 30.10, замер M16): береговая линия — не из сетки местности (клетка 8 px, сглаженная большинством 5 × 5
# вместе с водой), а из тайлов: вода — правило цвета terrain-from-map.py плюс тёмно-синие буквы морских подписей;
# чёрные буквы и их белый ореол у моря — вода; тонкая вода (уже 10 px — реки) — суша. Сетка суши — 4 px. Так остаются
# острова от 8 × 8 px и озёра того же размера (Red Rocks, малые озёра Подземья в горах), которые сетка 8 px с
# большинством съедала: из 652 островов 16 × 16…50 × 50 px схема держала 36, из 209 таких озёр — 3.
# Регионы: сетка сглаживается большинством в окне только среди классов суши (вода не голосует и не меняется), каждый
# класс выводится в море на COAST_REACH клеток (ближайший класс суши), обводится по границам клеток, упрощается
# (Дуглас — Пекер) и скругляется (Чайкин); стол заливает регионы по маске суши (clip), поэтому край класса у берега —
# береговая линия 4 px, а не ступень сетки 8 px. Кольца каждого класса — один путь с правилом even-odd: дыры сами.
# Реки: та же вода растра, что опускает суша (тонкая — уже 10 px), и малые внутренние воды, через которые она течёт;
# скелет, линии и связка концов — как у дорог. Бледные тонкие ручьи (серо-голубой штрих, Horn Stream) правилом цвета
# воды не берутся — их на схеме нет. Названия рек (тёмно-синий курсив) — не река.
# Дороги: пунктир растра смыкается расширением на клетку, утончается до скелета (Чжан — Суэн), скелет режется
# на линии между концами и развилками; концы, что смотрят друг на друга через разрыв, связываются отрезком.
# Границы держав (borders.png, borders-from-map.py — бордовый штрих-пунктир растра): так же, как дороги, но связка
# концов дальше (BORDER_LINK_PX: граница рвётся под подписью и на перевале шире дороги), и связка, что идёт вдоль уже
# собранной линии (её треть, середина или две трети ближе BORDER_LINK_SIDE), — не разрыв, а хорда петли: прочь.
#
# Координаты — пиксели исходника карты, как у мест сида и паспорта. Нет сеток — сказать и выйти с 0 (setup.command);
# нет тайлов — суша из сетки местности, как до 30.10, без рек.
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CODES = ['o', 'g', 'h', 'f', 'm', 's', 'd', 'i', 'u']  # как TERRAIN_CODES в src/map/terrain.ts
MAJORITY_RADIUS = 2      # окно 5 × 5 клеток
MAJORITY_PASSES = 2
SIMPLIFY = 1.2           # допуск упрощения, клеток
MIN_AREA = {'land': 6, 'default': 24}   # кольца меньше — пропуск, клеток
ROAD_SIMPLIFY = 1.0      # клеток дорожной сетки
ROAD_MIN_LEN = 6         # линии короче — шум, клеток
ROAD_LINK_PX = 60        # концы линий ближе этого, смотрящие друг на друга, — один путь с разрывом пунктира, пиксели исходника
ROAD_CLOSE = 2           # радиус смыкания пунктира, клеток дорожной сетки (разрыв пунктира растра — до 4)
LAND_CELL = 4            # px исходника: клетка сетки суши из тайлов (2 × 2 пикселя уровня maxZoom − 1)
LAND_SIMPLIFY = 1.0      # допуск упрощения берега, клеток сетки суши (4 px)
LAND_MIN_AREA = 4        # острова и озёра меньше — крапины, клеток сетки суши (64 px², 8 × 8 px)
COAST_REACH = 3          # класс суши выводится в море на столько клеток местности (24 px): стол режет регионы сушей
RIVER_THIN = 4           # px исходника: вода уже 2r + 1 = 9 px — река, шире — вода суши
RIVER_CLOSE = 2          # радиус смыкания, клеток сетки суши: река рвётся под подписью, значком, мостом (до ~16 px)
RIVER_MIN_LEN = 4        # клеток сетки суши: отросток короче — шум скелета
RIVER_LINK_PX = 48       # разрыв реки шире смыкания — концы, что смотрят друг на друга, ближе этого
RIVER_MIN_PX = 64        # река целиком (связка линий) короче — крапина цвета воды: значок оазиса, буква, блик
RIVER_SIMPLIFY = 0.8     # клеток сетки суши
TEXT_MAX_AREA = 20000    # px²: кусок «суши» меньше, почти весь у чёрных букв, — подпись в море, а не остров
ICON_R = 5               # px уровня maxZoom − 1 (10 px исходника): вокруг значка места буквы и ореол — не вода
BORDER_LINK_PX = 90      # разрыв границы — концы, что смотрят друг на друга, ближе этого, пиксели исходника
BORDER_LINK_SIDE = 8     # px: связка, что идёт вдоль собранной линии ближе этого, — хорда, а не разрыв


def majority(codes: np.ndarray, radius: int, fixed: int | None = None) -> np.ndarray:
    """
    Класс клетки — самый частый в окне (2r+1)²; ничья — первый по коду. fixed (вода) не голосует и не меняется: до
    30.10 вода голосовала наравне с сушей, и окно 5 × 5 дважды съедало острова уже 3 клеток и сужало полуострова.
    """
    h, w = codes.shape
    k = 2 * radius + 1
    best = np.zeros((h, w), np.int32)
    out = codes.copy()
    for c in np.unique(codes):
        if c == fixed:
            continue
        m = np.pad((codes == c).astype(np.int32), radius)
        s = m.cumsum(0).cumsum(1)
        s = np.pad(s, ((1, 0), (1, 0)))
        cnt = s[k:, k:] - s[:-k, k:] - s[k:, :-k] + s[:-k, :-k]
        win = cnt > best
        if fixed is not None:
            win &= codes != fixed
        out[win] = c
        best = np.maximum(best, cnt)
    return out


def reach_sea(codes: np.ndarray, water: int, steps: int) -> np.ndarray:
    """Классы суши — в море на steps клеток: клетка воды у суши берёт самый частый класс соседей 3 × 3."""
    out = codes.copy()
    for _ in range(steps):
        wet = out == water
        best = np.zeros(out.shape, np.int32)
        pick = out.copy()
        for c in np.unique(out):
            if c == water:
                continue
            cnt = box_sum(out == c, 1)
            win = wet & (cnt > best)
            pick[win] = c
            best = np.maximum(best, cnt)
        out = pick
    return out


def box_sum(mask: np.ndarray, r: int) -> np.ndarray:
    """Сколько True в окне (2r+1)² — по интегральному изображению; за краем — False."""
    p = np.pad(mask.astype(np.int32), r + 1)
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k])[: mask.shape[0], : mask.shape[1]]


def opening(m: np.ndarray, r: int) -> np.ndarray:
    """Размыкание квадратом (2r+1)²: тоньше окна — прочь."""
    k = (2 * r + 1) ** 2
    return box_sum(box_sum(m, r) == k, r) > 0


def components(m: np.ndarray) -> tuple[np.ndarray, int]:
    """Связные куски маски (8-связность) по отрезкам строк, система непересекающихся множеств: метки (0 — фон) и число."""
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    parent = [0]

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    prev: list = []
    for y in range(h):
        d = np.diff(np.r_[0, m[y].astype(np.int8), 0])
        cur = []
        j = 0
        for x0, x1 in zip(np.nonzero(d == 1)[0].tolist(), np.nonzero(d == -1)[0].tolist()):
            idx = len(parent)
            parent.append(idx)
            while j < len(prev) and prev[j][1] + 1 <= x0:
                j += 1
            k = j
            while k < len(prev) and prev[k][0] < x1 + 1:
                a, b = find(prev[k][2]), find(idx)
                if a != b:
                    parent[max(a, b)] = min(a, b)
                k += 1
            lab[y, x0:x1] = idx
            cur.append((x0, x1, idx))
        prev = cur
    roots = np.array([find(i) for i in range(len(parent))], np.int32)
    uniq, inv = np.unique(roots, return_inverse=True)
    return inv.astype(np.int32)[lab], len(uniq) - 1


def strips(zdir: Path, T: int, W: int, H: int, pad: int):
    """Полосы уровня тайлов: (y0 строки полосы без поля, массив RGB с полем pad сверху и снизу, поле сверху)."""
    cols = -(-W // T)
    for ty in range(-(-H // T)):
        y0, y1 = max(0, ty * T - pad), min(H, (ty + 1) * T + pad)
        a = np.zeros((y1 - y0, cols * T, 3), np.uint8)
        for tyy in range(y0 // T, (y1 - 1) // T + 1):
            for tx in range(cols):
                f = zdir / f'{tx}_{tyy}.webp'
                if not f.exists():
                    continue
                t = np.asarray(Image.open(f).convert('RGB'))
                a0, a1 = max(tyy * T, y0), min(tyy * T + t.shape[0], y1)
                a[a0 - y0:a1 - y0, tx * T:tx * T + t.shape[1]] = t[a0 - tyy * T:a1 - tyy * T]
        yield ty * T, a[:, :W], ty * T - y0


def land_from_tiles(passport: dict, tiles: Path):
    """
    Суша и реки по цвету растра. Суша — по тайлам уровня maxZoom − 1 (2 px исходника на пиксель: буквы и ореол
    подписей там цельные), реки — по полному уровню: тонкие (Immerflow, Starwater в 2–3 px) на уровень ниже
    смешиваются с сушей. Клетка — LAND_CELL. Возвращает (суша, реки) — маски клеток; нет тайлов — None.
    """
    z = passport['maxZoom']
    if not (tiles / str(z)).is_dir() or not (tiles / str(z - 1)).is_dir():
        return None
    T = passport['tileSize']
    W, H = passport['width'], passport['height']
    h, w = -(-H // LAND_CELL), -(-W // LAND_CELL)
    river_c = np.zeros((h, w), bool)
    for y, a, top in strips(tiles / str(z), T, W, H, 8):
        # Реки — вода правила terrain-from-map.py, уже 2·RIVER_THIN + 1 px; шире — вода суши.
        r, g, b = (a[..., i].astype(np.int16) for i in range(3))
        light = (b > 140) & (b > r + 50) & (b > g + 15)
        thick = opening(light | ((b > r + 60) & (b > g + 50)), RIVER_THIN)
        rr = (light & ~(box_sum(thick, 2) > 0))[top:top + min(T, H - y)]
        hh = -(-rr.shape[0] // LAND_CELL) * LAND_CELL
        mm = np.zeros((hh, w * LAND_CELL), bool)
        mm[:rr.shape[0], :rr.shape[1]] = rr
        c0 = y // LAND_CELL
        river_c[c0:c0 + hh // LAND_CELL] |= mm.reshape(hh // LAND_CELL, LAND_CELL, w, LAND_CELL).any((1, 3))[: h - c0]
    W, H = -(-W // 2), -(-H // 2)
    k = LAND_CELL // 2                                # пикселей уровня на клетку
    land = np.zeros((H, W), bool)
    text = np.zeros((H, W), bool)
    # Значки мест у берега (белый кружок в чёрном кольце) по цвету — те же буквы с ореолом: без защиты город у моря
    # стоял в выемке воды (замер 30.10: 29 городов из 179 в воде схемы). Значки — места справочника на значке.
    icon = np.zeros((H, W), bool)
    pf = Path(__file__).resolve().parent.parent / 'content/maps' / f'{passport["id"]}-places.json'
    if pf.exists():
        for pl in json.loads(pf.read_text(encoding='utf-8'))['places']:
            if pl.get('how') in ('marker', 'icon'):
                cx, cy = int(pl['x']) // 2, int(pl['y']) // 2
                icon[max(0, cy - ICON_R):cy + ICON_R + 1, max(0, cx - ICON_R):cx + ICON_R + 1] = True
    for y, a, top in strips(tiles / str(z - 1), T, W, H, 16):
        r, g, b = (a[..., i].astype(np.int16) for i in range(3))
        # Вода — правило terrain-from-map.py; тёмно-синие буквы морских подписей (THE GREAT SEA) — тоже вода.
        wet = ((b > 140) & (b > r + 50) & (b > g + 15)) | ((b > r + 60) & (b > g + 50))
        sea0 = opening(wet, 2)                         # тоньше 5 px (10 px исходника) — река, суша
        near = box_sum(sea0, 8) > 0
        # Подписи у моря: буквы — чёрные или тёмные серо-синие (курсив мест: Uthtower, Wolfhill House) — и их белый
        # ореол — вода; щели в рамке подписи — тоже.
        ink = ((a.max(2) < 50) | ((a.max(2) < 130) & (b >= r + 20) & (b >= g + 15)))
        guard = icon[y - top:y - top + a.shape[0]]
        if guard.shape[0] < a.shape[0]:
            guard = np.pad(guard, ((0, a.shape[0] - guard.shape[0]), (0, 0)))
        ink &= ~guard
        halo = (a.min(2) > 140) & (b >= r - 5) & (box_sum(ink, 3) > 0) & near
        # Около букв у моря голубоватые полутона (ореол, смешанный с водой) — подпись; серые острова (синего больше
        # зелёного меньше чем на 15) и тёплая земля HandsomeRob — нет.
        zone = (box_sum(ink, 4) > 0) & near & (b >= g + 15) & (b >= r + 15)
        sea = sea0 | ((ink | halo | wet | zone) & near & ~guard)
        sea |= ~sea & ~opening(~sea, 1) & near & ~guard
        n = min(T, H - y)
        land[y:y + n] = ~sea[top:top + n]
        text[y:y + n] = (box_sum(ink, 3) > 0)[top:top + n]
    # Клетка LAND_CELL: суша — половина пикселей и больше, река — хоть один, «у букв» — больше половины.
    h, w = -(-H // k), -(-W // k)

    def cells(m, need):
        mm = np.zeros((h * k, w * k), bool)
        mm[:H, :W] = m
        return mm.reshape(h, k, w, k).sum((1, 3)) >= need
    land_c, text_c = cells(land, k * k // 2), cells(text, k * k // 2 + 1)
    # Кусок «суши» в море, почти весь у чёрных букв, — рамка подписи, а не остров: прочь всё, кроме клеток не у букв.
    lab, n = components(land_c)
    area = np.bincount(lab.ravel(), minlength=n + 1)
    clean = np.bincount(lab.ravel(), weights=(~text_c).ravel(), minlength=n + 1)
    label_box = (area * LAND_CELL ** 2 < TEXT_MAX_AREA) & (clean < 0.5 * area)
    label_box[0] = False
    land_c &= ~(label_box[lab] & text_c)
    return land_c, river_c & land_c


def trace(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """Кольца границы маски по углам клеток; обход согласован, так что even-odd даёт дыры."""
    h, w = mask.shape
    p = np.pad(mask, 1)
    inside = p[1:-1, 1:-1]
    W = w + 1
    starts: dict[int, list[int]] = {}

    def add(ys, xs, dx0, dy0, dx1, dy1):
        a = (ys + dy0) * W + (xs + dx0)
        b = (ys + dy1) * W + (xs + dx1)
        for u, v in zip(a.tolist(), b.tolist()):
            starts.setdefault(u, []).append(v)

    ys, xs = np.nonzero(inside & ~p[:-2, 1:-1])   # сверху снаружи: вдоль верха справа налево
    add(ys, xs, 1, 0, 0, 0)
    ys, xs = np.nonzero(inside & ~p[2:, 1:-1])    # снизу: слева направо
    add(ys, xs, 0, 1, 1, 1)
    ys, xs = np.nonzero(inside & ~p[1:-1, :-2])   # слева: сверху вниз
    add(ys, xs, 0, 0, 0, 1)
    ys, xs = np.nonzero(inside & ~p[1:-1, 2:])    # справа: снизу вверх
    add(ys, xs, 1, 1, 1, 0)

    rings = []
    while starts:
        start, outs = next(iter(starts.items()))
        ring = [start]
        cur = start
        while True:
            outs = starts.get(cur)
            if not outs:
                break
            nxt = outs.pop()
            if not outs:
                del starts[cur]
            cur = nxt
            if cur == start:
                break
            ring.append(cur)
        if len(ring) >= 4:
            rings.append([(v % W, v // W) for v in ring])
    return rings


def corners(ring):
    """Только углы: вершины, где меняется направление."""
    n = len(ring)
    out = []
    for i in range(n):
        a, b, c = ring[i - 1], ring[i], ring[(i + 1) % n]
        if (b[0] - a[0], b[1] - a[1]) != (c[0] - b[0], c[1] - b[1]):
            out.append(b)
    return out


def dp(pts, tol):
    """Дуглас — Пекер для открытой ломаной; концы остаются."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    t2 = tol * tol
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        ll = dx * dx + dy * dy
        far, idx = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            if ll == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                cr = (px - ax) * dy - (py - ay) * dx
                d = cr * cr / ll
            if d > far:
                far, idx = d, k
        if far > t2:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(ring, tol):
    half = len(ring) // 2
    a = dp(ring[: half + 1], tol)
    b = dp(ring[half:] + [ring[0]], tol)
    return a[:-1] + b[:-1]


def chaikin(ring):
    out = []
    n = len(ring)
    for i in range(n):
        (x0, y0), (x1, y1) = ring[i], ring[(i + 1) % n]
        out.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
        out.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
    return out


def area(ring):
    s = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i - 1]
        x1, y1 = ring[i]
        s += x0 * y1 - x1 * y0
    return abs(s) / 2


def flat(ring, scale):
    return [round(v * scale) for p in ring for v in p]


def rings_of(mask, cell, min_area, tol=SIMPLIFY):
    out = []
    for r in trace(mask):
        r = corners(r)
        if len(r) < 3 or area(r) < min_area:
            continue
        q = simplify_ring(r, tol)
        # Островок в пару клеток Дуглас — Пекер сводит к отрезку — тогда он остаётся углами, без упрощения.
        r = q if len(q) >= 3 else r
        out.append(flat(chaikin(r), cell))
    return out


def thin(img: np.ndarray) -> np.ndarray:
    """Скелет Чжана — Суэна; img — 0/1."""
    m = np.pad(img.astype(np.uint8), 1)
    while True:
        changed = False
        for step in (0, 1):
            P = m
            p2, p3, p4 = P[:-2, 1:-1], P[:-2, 2:], P[1:-1, 2:]
            p5, p6, p7 = P[2:, 2:], P[2:, 1:-1], P[2:, :-2]
            p8, p9 = P[1:-1, :-2], P[:-2, :-2]
            c = P[1:-1, 1:-1]
            nb = [p2, p3, p4, p5, p6, p7, p8, p9]
            b = sum(x.astype(np.int32) for x in nb)
            a = sum(((nb[i] == 0) & (nb[(i + 1) % 8] == 1)).astype(np.int32) for i in range(8))
            if step == 0:
                cond = (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                cond = (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            kill = (c == 1) & (b >= 2) & (b <= 6) & (a == 1) & cond
            if kill.any():
                m[1:-1, 1:-1][kill] = 0
                changed = True
        if not changed:
            return m[1:-1, 1:-1]


RING = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]  # N, NE, E, SE, S, SW, W, NW


def prune_corners(pts: set) -> set:
    """
    Ступеньки скелета: Чжан — Суэн оставляет на косой линии уголки — клетку, чьи два соседа соседи и друг другу. Такая
    клетка — развилка по числу соседей, и линия рвалась на куски по две клетки, которые снимал ROAD_MIN_LEN (M16: High
    Road у Red Cliffs). Снимаются по одной простые клетки (число связности Йокои для 8-связности — 1) с двумя и больше
    соседями: связность и концы линий не меняются.
    """
    pts = set(pts)
    changed = True
    while changed:
        changed = False
        for p in sorted(pts):
            ring = [(p[0] + dy, p[1] + dx) in pts for dy, dx in RING]
            if sum(ring) < 2:
                continue
            x = [not v for v in ring]   # дополнение: Йокои для 8-связности считает по фону
            n8 = sum(x[k] - x[k] * x[(k + 1) % 8] * x[(k + 2) % 8] for k in (0, 2, 4, 6))
            if n8 == 1:
                pts.discard(p)
                changed = True
    return pts


def road_lines(grid: np.ndarray, cell: int, close: int = ROAD_CLOSE, min_len: int = ROAD_MIN_LEN, tol: float = ROAD_SIMPLIFY, link: float = ROAD_LINK_PX):
    on = grid > 127
    # Пунктир дороги — сомкнуть: расширение кругом радиуса close, потом скелет.
    r = close
    d = np.pad(on, r)
    grown = np.zeros_like(on)
    for dy in range(2 * r + 1):
        for dx in range(2 * r + 1):
            if (dy - r) ** 2 + (dx - r) ** 2 <= r * r:
                grown |= d[dy:dy + on.shape[0], dx:dx + on.shape[1]]
    ys, xs = np.nonzero(grown)
    if len(ys) == 0:
        return []
    y0, x0 = ys.min(), xs.min()
    crop = grown[y0:ys.max() + 1, x0:xs.max() + 1]
    sk = thin(crop)
    pts = prune_corners(set(zip(*[a.tolist() for a in np.nonzero(sk)])))
    nbrs = lambda p: [(p[0] + dy, p[1] + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (p[0] + dy, p[1] + dx) in pts]
    deg = {p: len(nbrs(p)) for p in pts}
    nodes = {p for p, k in deg.items() if k != 2}
    seen_edges = set()
    lines = []

    def walk(a, b):
        path = [a, b]
        prev, cur = a, b
        while cur not in nodes:
            nxt = [q for q in nbrs(cur) if q != prev and (cur, q) not in seen_edges]
            if not nxt:
                break
            seen_edges.add((cur, nxt[0]))
            seen_edges.add((nxt[0], cur))
            prev, cur = cur, nxt[0]
            path.append(cur)
            if cur == a:
                break
        return path

    for n in nodes:
        for q in nbrs(n):
            if (n, q) in seen_edges:
                continue
            seen_edges.add((n, q))
            seen_edges.add((q, n))
            lines.append(walk(n, q))
    # Чистые кольца без узлов (объездная вокруг города).
    for p in pts:
        if p in nodes or all((p, q) in seen_edges for q in nbrs(p)):
            continue
        q = next(q for q in nbrs(p) if (p, q) not in seen_edges)
        seen_edges.add((p, q))
        seen_edges.add((q, p))
        nodes.add(p)
        lines.append(walk(p, q))
    out = []
    for ln in lines:
        # Короткая — шум, только если хоть одним концом висит (отросток, обрывок); между двумя развилками — связка
        # перекрёстка, без неё дорога рвётся на каждой развилке.
        if len(ln) < min_len and (deg[ln[0]] <= 1 or deg[ln[-1]] <= 1):
            continue
        xy = [(x + x0 + 0.5, y + y0 + 0.5) for y, x in ln]
        xy = dp(xy, tol)
        out.append([round(v * cell) for p in xy for v in p])
    return link_ends(out, link)


def drop_short(lines, min_px):
    """Связки линий (общий конец ближе 3 px) короче min_px — прочь: река из одного блика — не река."""
    import math
    parent = list(range(len(lines)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    ends = {}
    for i, ln in enumerate(lines):
        for x, y in ((ln[0], ln[1]), (ln[-2], ln[-1])):
            for key in ((x // 3 + dx, y // 3 + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                j = ends.get(key)
                if j is not None:
                    a, b = find(i), find(j)
                    if a != b:
                        parent[a] = b
            ends[(x // 3, y // 3)] = i
    size: dict[int, float] = {}
    for i, ln in enumerate(lines):
        L = sum(math.dist(ln[k:k + 2], ln[k + 2:k + 4]) for k in range(0, len(ln) - 2, 2))
        size[find(i)] = size.get(find(i), 0) + L
    return [ln for i, ln in enumerate(lines) if size[find(i)] >= min_px]


def link_ends(lines, link=ROAD_LINK_PX):
    """Разрывы пунктира, которые не сомкнуло расширение: конец линии, смотрящий на конец другой ближе ROAD_LINK_PX,
    соединяется с ним отрезком. Жадно по расстоянию; у каждого конца — одна связка."""
    import math
    ends = []  # (x, y, ux, uy, line, which)
    for li, ln in enumerate(lines):
        if len(ln) < 4:
            continue
        for which, (a, b) in enumerate([((ln[2], ln[3]), (ln[0], ln[1])), ((ln[-4], ln[-3]), (ln[-2], ln[-1]))]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            n = math.hypot(dx, dy) or 1
            ends.append((b[0], b[1], dx / n, dy / n, li, which))
    cand = []
    for i in range(len(ends)):
        xi, yi, uxi, uyi, li, _ = ends[i]
        for j in range(i + 1, len(ends)):
            xj, yj, uxj, uyj, lj, _ = ends[j]
            if li == lj:
                continue
            dx, dy = xj - xi, yj - yi
            d = math.hypot(dx, dy)
            if d > link or d == 0:
                continue
            # Оба конца смотрят на разрыв: свой путь продолжается через него.
            if (dx * uxi + dy * uyi) / d < 0.5 or (-dx * uxj - dy * uyj) / d < 0.5:
                continue
            cand.append((d, i, j))
    used = set()
    links = []
    for d, i, j in sorted(cand):
        if i in used or j in used:
            continue
        used.update((i, j))
        links.append([ends[i][0], ends[i][1], ends[j][0], ends[j][1]])
    return lines + links


def near_lines(lines, pts, r):
    """Для каждой точки pts — есть ли ближе r точка линий lines (вершины уплотнены через 2 px), по сетке r × r."""
    import math
    grid: dict[tuple[int, int], list] = {}
    for ln in lines:
        for k in range(0, len(ln) - 2, 2):
            x0, y0, x1, y1 = ln[k:k + 4]
            n = max(1, int(math.dist((x0, y0), (x1, y1)) // 2))
            for t in range(n + 1):
                x, y = x0 + (x1 - x0) * t / n, y0 + (y1 - y0) * t / n
                grid.setdefault((int(x // r), int(y // r)), []).append((x, y))
    return [any(math.dist((x, y), q) <= r for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                for q in grid.get((int(x // r) + dx, int(y // r) + dy), ())) for x, y in pts]


def border_lines(grid: np.ndarray, cell: int, link: float = BORDER_LINK_PX, side: float = BORDER_LINK_SIDE):
    """Границы: линии как у дорог, связка концов дальше, без хорд вдоль собранных линий. (линии, связок, снято хорд)."""
    base = road_lines(grid, cell, link=0)
    links = link_ends(base, link)[len(base):]
    probe = lambda f: [(a + (c - a) * f, b + (d - b) * f) for a, b, c, d in links]
    along = [any(v) for v in zip(*(near_lines(base, probe(f), side) for f in (1 / 3, 1 / 2, 2 / 3)))] if links else []
    keep = [ln for ln, bad in zip(links, along) if not bad]
    return base + keep, len(keep), len(links) - len(keep)


def main():
    args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and sys.argv[i - 1] != '--out']
    root = Path(__file__).resolve().parent.parent
    passport = json.loads(Path(args[0] if args else root / 'content/maps/toril.json').read_text(encoding='utf-8'))
    map_id = passport['id']
    tiles = root / 'maps/tiles' / map_id
    terrain_png, roads_png, borders_png = tiles / 'terrain.png', tiles / 'roads.png', tiles / 'borders.png'
    if 'terrain' not in passport or not terrain_png.exists():
        print(f'{map_id}: нет сетки местности ({terrain_png}) — схема не собрана; сначала terrain-from-map.py')
        return
    cell = passport['terrain']['cell']
    codes = (np.asarray(Image.open(terrain_png), np.int32) + 12) // 25
    water = CODES.index('o')
    fine = land_from_tiles(passport, tiles)
    for _ in range(MAJORITY_PASSES):
        codes = majority(codes, MAJORITY_RADIUS, fixed=water if fine is not None else None)
    out = {'map': map_id, 'note': 'scripts/schema-from-grids.py — кольца и линии плоскими [x0, y0, x1, y1, …] в пикселях исходника; регионы заливаются по маске суши (clip)', 'land': [], 'regions': {}, 'roads': [], 'rivers': [], 'borders': []}
    if fine is not None:
        land_c, river_c = fine
        out['land'] = rings_of(land_c, LAND_CELL, LAND_MIN_AREA, LAND_SIMPLIFY)
        out['rivers'] = drop_short(road_lines(np.where(river_c, 255, 0), LAND_CELL, close=RIVER_CLOSE, min_len=RIVER_MIN_LEN, tol=RIVER_SIMPLIFY, link=RIVER_LINK_PX), RIVER_MIN_PX)
        # Класс суши — в море на COAST_REACH клеток: стол режет регионы сушей, край класса у берега — берег 4 px.
        regions_codes = reach_sea(codes, water, COAST_REACH)
        print(f'суша по тайлам: {len(out["land"])} колец, {sum(len(r) for r in out["land"]) // 2} вершин; реки: {len(out["rivers"])} линий, {sum(len(r) for r in out["rivers"]) // 2} вершин')
    else:
        out['land'] = rings_of(codes != water, cell, MIN_AREA['land'])
        regions_codes = codes
        print(f'суша по сетке местности (тайлов нет): {len(out["land"])} колец')
    for i, c in enumerate(CODES):
        if c in ('o', 'g'):
            continue  # вода — фон, равнина — подложка суши
        rings = rings_of(regions_codes == i, cell, MIN_AREA['default'])
        if rings:
            out['regions'][c] = rings
        print(f'{c}: {len(rings)} колец, {sum(len(r) for r in rings) // 2} вершин')
    if 'roads' in passport and roads_png.exists():
        out['roads'] = road_lines(np.asarray(Image.open(roads_png)), passport['roads']['cell'])
        print(f'дороги: {len(out["roads"])} линий, {sum(len(r) for r in out["roads"]) // 2} вершин')
    if borders_png.exists():
        out['borders'], kept, chords = border_lines(np.asarray(Image.open(borders_png)), 4)
        print(f'границы: {len(out["borders"])} линий, {sum(len(r) for r in out["borders"]) // 2} вершин, связок разрывов {kept}, хорд снято {chords}')
    dst = Path(next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--out' and i + 1 < len(sys.argv)), tiles / 'schema.json'))
    dst.write_text(json.dumps(out, separators=(',', ':')))
    print(f'{dst}: {dst.stat().st_size // 1024} КБ')


if __name__ == '__main__':
    main()
