# Дороги карты мира по цвету растра (ROADMAP 6.3, TASKS V6): для региона похода A5E Open Roads — «well-traveled roads».
#
# На растре HandsomeRob дороги — коричнево-красный пунктир в 1–2 px (High Road, Long Road, Trade Way, Iron Road…).
# Слой Pathways Toril GIS для этого не годится: дорог в нём меньше (нет Iron Road, Stone Trail, Delimbiyr Route), а
# ложатся они с ошибкой привязки ~35 px — Waterdeep → Daggerford шла по морю (проверено 29.10.2026 наложением).
#
# Маска: красный выше синего и зелёного, не светлый (скалы гор в бликах того же оттенка — пятнами, а не линией: пятно
# снимается эрозией 3×3 — у линии в 1–2 px сердцевины нет). Клетка 4×4 px исходника — дорога, если в ней два и больше
# пикселей маски; пунктир с разрывами в 3 px на клетке 4 px почти сплошной, остальное добирает допуск похода.
#
# Запуск: .venv/bin/python scripts/roads-from-map.py content/maps/toril.json [--optional] [--out <файл>]
#   Читает тайлы maxZoom (полный размер) из maps/tiles/<id>/<maxZoom>/, пишет maps/tiles/<id>/roads.png (серый, 255 —
#   дорога). --optional — для установки: нет тайлов, numpy или Pillow — сказать и выйти с 0.
import json, math, os, sys

OPTIONAL = '--optional' in sys.argv
try:
    import numpy as np
    from PIL import Image
except ImportError as e:
    print(f'roads: нет {e.name} (zsh setup-python.command ставит numpy и Pillow) — поход без дорог, регион по местности')
    sys.exit(0 if OPTIONAL else 1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 4
NEAR = [(dy, dx) for dy in range(0, 3) for dx in range(-2, 3) if (dy, dx) > (0, 0)]
MIN_CELLS = 8  # клеток в связном куске: короче 32 px (12 миль) — обрывок бликов скалы, не дорога
# Скалы гор в бликах того же бурого цвета дают куски и длиннее: кусок почти целиком в горах (карта местности,
# terrain.png) должен быть длиннее — дорога через перевал выходит из гор и держится за кусок равнины.
MOUNTAIN_SHARE, MOUNTAIN_MIN_CELLS = 0.8, 60
PAD = 8  # px сверху и снизу полосы: эрозия и снятие пятна не видят шва между полосами
# Перемычки через разрывы пунктира (bridge): до BRIDGE клеток (20 px — значок поселения и бледный штрих на равнине),
# ось куска у конца (радиус LOCAL клеток) — вдоль перемычки не хуже косинуса BRIDGE_ALIGN.
BRIDGE, LOCAL, BRIDGE_ALIGN = 5, 4, 0.6
# Блики рельефа (M16, замер 30.10): кусок меньше RELIEF_CELLS клеток, что лежит на горах (доля ≥ RELIEF_SHARE) или
# комом (вытянутость — корень отношения главных осей — меньше RELIEF_ELONG), и рядом с ним (RELIEF_NEAR клеток) нет
# ни одного места справочника и поселения карточек, — не дорога. По 32 снятым кускам глазами: 31 — гребни, тени и
# кайма подписей, 1 — обрывок дороги у поселений, которых нет в справочнике (Oeble).
RELIEF_CELLS, RELIEF_SHARE, RELIEF_ELONG, RELIEF_NEAR = 40, 0.3, 2.5, 6
SETTLEMENT = {'Town', 'settlement', 'City', 'fortress', 'Fortification', 'Ruins', 'ruins', 'Village', 'pass', 'road'}


def road_mask(a):
    r, g, b = (a[..., i].astype(np.int16) for i in range(3))
    road = (r - b > 45) & (r - g > 22) & (r - g < 60) & (r < 185) & (g >= 60) & (g < 150)
    # Подписи стран и областей (AMN, TETHYR, Purple Marches) — тёмно-малиновые: их сглаженная кайма бывает цвета дороги,
    # поэтому всё в 2 px от малинового снимается.
    crimson = (r - g > 70) & (r > 80)
    return road & ~(shift_all(crimson, 2) > 0)


def shift_all(m, k):
    """Окно (2k+1)² по маске: всё ли в окне True (эрозия) — сумма по интегральному изображению."""
    p = np.pad(m.astype(np.int32), k + 1)
    c = p.cumsum(0).cumsum(1)
    w = 2 * k + 1
    s = c[w:, w:] - c[:-w, w:] - c[w:, :-w] + c[:-w, :-w]
    return s[: m.shape[0], : m.shape[1]]


def small_pieces(m, mountain=None):
    """
    Куски маски меньше MIN_CELLS клеток (в горах — меньше MOUNTAIN_MIN_CELLS). Связность — через клетку: пунктир на зелёной равнине бледнее, и штрихи
    ложатся в клетки через одну — сосед на расстоянии двух клеток тот же кусок. Система непересекающихся множеств.
    """
    ys, xs, idx, roots = components(m)
    size = np.bincount(roots, minlength=len(idx))
    out = np.zeros_like(m)
    small = size[roots] < MIN_CELLS
    if mountain is not None:
        share = np.bincount(roots, weights=mountain[ys, xs], minlength=len(idx)) / np.maximum(size, 1)
        small |= (share[roots] >= MOUNTAIN_SHARE) & (size[roots] < MOUNTAIN_MIN_CELLS)
    out[ys[small], xs[small]] = True
    return out


def relief_noise(m, mountain, near):
    """Куски-блики (RELIEF_*): маска клеток к снятию."""
    ys, xs, idx, roots = components(m)
    out = np.zeros_like(m)
    if not len(ys):
        return out
    u, inv = np.unique(roots, return_inverse=True)
    size = np.bincount(inv)
    share = np.bincount(inv, weights=mountain[ys, xs]) / size if mountain is not None else np.zeros(len(u))
    touch = np.bincount(inv, weights=near[ys, xs])
    for k in np.nonzero((size < RELIEF_CELLS) & (touch == 0))[0]:
        sel = inv == k
        P = np.c_[ys[sel], xs[sel]].astype(float)
        ev = np.linalg.eigvalsh(np.cov((P - P.mean(0)).T)) if len(P) >= 3 else np.array([0.0, 1.0])
        if share[k] >= RELIEF_SHARE or math.sqrt(ev[1] / max(ev[0], 1e-3)) < RELIEF_ELONG:
            out[ys[sel], xs[sel]] = True
    return out


def settlements_near(passport, shape):
    """Клетки в RELIEF_NEAR от мест справочника и поселений карточек (content/maps/<id>-places.json, -cards.json)."""
    near = np.zeros(shape, bool)
    pts = []
    for name, key in ((f'{passport["id"]}-places.json', None), (f'{passport["id"]}-cards.json', SETTLEMENT)):
        f = os.path.join(ROOT, 'content/maps', name)
        if os.path.exists(f):
            pts += [(p['x'], p['y']) for p in json.load(open(f, encoding='utf-8'))['places'] if p.get('x') is not None and (key is None or p.get('kind') in key)]
    r = RELIEF_NEAR
    for x, y in pts:
        cx, cy = int(x // CELL), int(y // CELL)
        near[max(0, cy - r):cy + r + 1, max(0, cx - r):cx + r + 1] = True
    return near, len(pts)


def components(m):
    """Куски маски со связностью через клетку (NEAR): клетки (ys, xs), их индекс и корень куска на каждую."""
    ys, xs = np.nonzero(m)
    idx = {(y, x): i for i, (y, x) in enumerate(zip(ys.tolist(), xs.tolist()))}
    parent = list(range(len(idx)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for (y, x), i in idx.items():
        for dy, dx in NEAR:
            j = idx.get((y + dy, x + dx))
            if j is not None:
                a, b = find(i), find(j)
                if a != b:
                    parent[a] = b
    return ys, xs, idx, np.array([find(i) for i in range(len(idx))], dtype=np.int64)


def bridge(m):
    """
    Разрывы пунктира шире NEAR (бледный штрих на равнине, значок поселения поперёк дороги — до 20 px): конец куска,
    что смотрит на конец другого куска не дальше BRIDGE клеток, соединяется с ним прямой из клеток. «Смотрит» — соседи
    клетки в своём куске лежат позади неё (это конец, а не бок линии), а сама линия куска идёт вдоль перемычки.
    Каждая пара кусков — одной перемычкой, кратчайшей; кольца из перемычек не замыкаются. Возвращает маску и число.
    """
    ys, xs, idx, roots = components(m)
    if not len(ys):
        return m, 0
    near = [(dy, dx) for dy in range(-BRIDGE, BRIDGE + 1) for dx in range(-BRIDGE, BRIDGE + 1)
            if (dy, dx) > (0, 0) and dy * dy + dx * dx <= BRIDGE * BRIDGE and max(abs(dy), abs(dx)) > 2]
    local = {}

    def shape(i):
        """Середина и ось соседей клетки i в её куске (радиус LOCAL): по ним — конец ли это и куда идёт линия."""
        if i in local:
            return local[i]
        y, x, r = ys[i], xs[i], roots[i]
        pts = []
        for dy in range(-LOCAL, LOCAL + 1):
            for dx in range(-LOCAL, LOCAL + 1):
                j = idx.get((y + dy, x + dx))
                if (dy or dx) and j is not None and roots[j] == r:
                    pts.append((dy, dx))
        if len(pts) < 2:
            local[i] = None
            return None
        P = np.asarray(pts, float)
        c = P.mean(0)
        u = np.linalg.eigh(np.cov((P - c).T))[1][:, -1] if len(pts) >= 3 else c / (np.linalg.norm(c) or 1)
        local[i] = (c, u)
        return local[i]

    def looks(i, v):
        s = shape(i)
        if s is None:
            return True   # одиночный штрих: смотреть некуда — годится любой стороной
        c, u = s
        return c @ v < 0 and abs(u @ v) >= BRIDGE_ALIGN

    best = {}
    for i, (y, x) in enumerate(zip(ys.tolist(), xs.tolist())):
        for dy, dx in near:
            j = idx.get((y + dy, x + dx))
            if j is None or roots[j] == roots[i]:
                continue
            key = (min(roots[i], roots[j]), max(roots[i], roots[j]))
            d = dy * dy + dx * dx
            if key in best and best[key][0] <= d:
                continue
            v = np.array([dy, dx], float) / math.sqrt(d)
            if looks(i, v) and looks(j, -v):
                best[key] = (d, i, j)
    joined = {}

    def top(r):
        while joined.get(r, r) != r:
            r = joined[r]
        return r
    used = set()
    n = 0
    for d, i, j in sorted(best.values()):
        a, b = top(roots[i]), top(roots[j])
        if a == b or i in used or j in used:
            continue
        joined[a] = b
        used.update((i, j))
        steps = int(math.ceil(math.sqrt(d))) * 2
        for t in range(steps + 1):
            m[int(round(ys[i] + (ys[j] - ys[i]) * t / steps)), int(round(xs[i] + (xs[j] - xs[i]) * t / steps))] = True
        n += 1
    return m, n


def main():
    passport = json.load(open([a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and sys.argv[i - 1] != '--out'][0], encoding='utf-8'))
    tiles = os.path.join(ROOT, passport['tiles'].lstrip('/'))
    z = passport['maxZoom']
    zdir = os.path.join(tiles, str(z))
    if not os.path.isdir(zdir):
        print(f'roads: нет тайлов {zdir} — сначала scripts/tile-map.py')
        sys.exit(0 if OPTIONAL else 1)
    W, H, T = passport['width'], passport['height'], passport['tileSize']
    cw, ch = -(-W // CELL), -(-H // CELL)
    out = np.zeros((ch, cw), np.uint8)
    cols = -(-W // T)
    for ty in range(-(-H // T)):
        y0, y1 = max(0, ty * T - PAD), min(H, (ty + 1) * T + PAD)
        strip = np.zeros((y1 - y0, cols * T, 3), np.uint8)
        for tyy in range(y0 // T, (y1 - 1) // T + 1):
            for tx in range(cols):
                p = os.path.join(zdir, f'{tx}_{tyy}.webp')
                if not os.path.exists(p):
                    continue
                t = np.asarray(Image.open(p).convert('RGB'))
                sy0 = tyy * T
                a0, a1 = max(sy0, y0), min(sy0 + t.shape[0], y1)
                strip[a0 - y0:a1 - y0, tx * T:tx * T + t.shape[1]] = t[a0 - sy0:a1 - sy0]
        m = road_mask(strip)
        core = shift_all(m, 1) == 9          # сердцевина пятна: весь квадрат 3×3 в маске
        blob = shift_all(core, 3) > 0        # пятно с каймой в 3 px
        m &= ~blob
        top = ty * T - y0
        m = m[top:top + min(T, H - ty * T), :W]
        hh = -(-m.shape[0] // CELL) * CELL
        ww = cw * CELL
        mm = np.zeros((hh, ww), bool)
        mm[:m.shape[0], :m.shape[1]] = m
        cnt = mm.reshape(hh // CELL, CELL, ww // CELL, CELL).sum((1, 3))
        r0 = ty * T // CELL
        out[r0:r0 + cnt.shape[0]] = np.where(cnt >= 2, 255, 0)[: ch - r0]
    tp = os.path.join(tiles, 'terrain.png')
    mountain = None
    if os.path.exists(tp):
        t = np.asarray(Image.open(tp)) // 25 == 4    # код «m» — как CODES в terrain-from-map.py
        k = passport['terrain']['cell'] // CELL
        mountain = np.kron(t, np.ones((k, k), bool))[:ch, :cw]
        mountain = np.pad(mountain, ((0, ch - mountain.shape[0]), (0, cw - mountain.shape[1])))
    # Сначала перемычки, потом снятие обрывков: штрихи дороги за разрывом шире клетки — свои куски меньше MIN_CELLS,
    # и без перемычки их сняло бы вместе с бликами скал (M16: High Road южнее Neverwinter рвалась у Leilon).
    road, bridges = bridge(out > 0)
    road[small_pieces(road, mountain)] = False
    near, n_pts = settlements_near(passport, road.shape)
    noise = relief_noise(road, mountain, near) if n_pts else np.zeros_like(road)
    road[noise] = False
    out = np.where(road, 255, 0).astype(np.uint8)
    path = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--out' and i + 1 < len(sys.argv)), os.path.join(tiles, 'roads.png'))
    Image.fromarray(out, 'L').save(path, optimize=True)
    print(f'дороги {cw}×{ch} (клетка {CELL} px), клеток дороги {int((out > 0).sum())} ({(out > 0).mean():.4f}), перемычек {bridges}, бликов рельефа снято {int(noise.sum())} клеток (мест у дорог {n_pts}) → {path} ({os.path.getsize(path) // 1024} КБ)')


if __name__ == '__main__':
    main()
