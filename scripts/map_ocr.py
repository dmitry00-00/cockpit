# Снимок подписей и значков растровой карты (TASKS V1): один прогон Apple Vision по всему растру → maps/ocr/<id>-labels.json
# (не в git). Справочник мест (gazetteer-from-map.py) и ночная разметка подписей читают снимок, а не растр: прогон —
# около 8 минут, разбор снимка — секунды.
#
# Запуск: .venv/bin/python scripts/map_ocr.py content/maps/toril.json [--relabel | --glyphs]
#   --relabel — не читать растр заново, пересобрать labels из lines готового снимка (правила склейки и дублей);
#   --glyphs  — заново только имена вразрядку (glyph_labels, ~минута), Vision по блокам не гонять;
#   --icons   — заново только значки по эталонам content/maps/<id>-icons.json.
# Имя через подчёркивание: gazetteer-from-map.py импортирует отсюда crop, markers и load.
#
# В снимке:
#   lines  — строки Vision как есть, по блокам 1024 с нахлёстом 128 (дубли из нахлёста сохранены: справочник считает по ним);
#            у строки — цвет букв ink (средний RGB самых тёмных 15 % пикселей рамки) и edge (рамка у края блока — подпись
#            могла обрезаться);
#   marks  — белые значки поселений [x, y, r, город], дубли из нахлёста слиты;
#   glyphs — имена вразрядку (страны красным, моря синим): буквы по цвету, цепочкой в полоску, полоска — в Vision;
#   icons  — значки по эталонам у подписей: столица, город, крепость, руины, храм, шахта, вершина, источник;
#   labels — подписи без дублей, многострочные склеены, с признаками для разметки: высота букв h, доля заглавных caps,
#            разрядка spread (ширина / (букв × высота): у капителей вразрядку больше), цвет ink.
import json, math, os, re, subprocess, sys, tempfile
from collections import Counter
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOCK, OVERLAP = 1024, 128


def crop(tiles, x0, y0, x1, y1):
    im = Image.new('RGB', (x1 - x0, y1 - y0))
    for ty in range(y0 // 256, (y1 - 1) // 256 + 1):
        for tx in range(x0 // 256, (x1 - 1) // 256 + 1):
            p = os.path.join(tiles, f'{tx}_{ty}.webp')
            if os.path.exists(p):
                im.paste(Image.open(p).convert('RGB'), (tx * 256 - x0, ty * 256 - y0))
    return im


def markers(im):
    """Белые значки поселений: компактное светлое пятно 4–16 px с тёмной обводкой → [(x, y, r, город)] в пикселях блока."""
    a = np.asarray(im).astype(int)
    white = a.min(2) > 222
    H, W = white.shape
    lab = np.zeros((H, W), bool)
    out = []
    ang = np.linspace(0, 2 * np.pi, 16, endpoint=False)
    for y, x in zip(*np.nonzero(white)):
        if lab[y, x]:
            continue
        st, px = [(y, x)], []
        lab[y, x] = True
        while st and len(px) <= 400:
            cy, cx = st.pop()
            px.append((cy, cx))
            for yy, xx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= yy < H and 0 <= xx < W and white[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = True
                    st.append((yy, xx))
        if not 12 <= len(px) <= 160:
            continue
        P = np.array(px)
        h, w = np.ptp(P[:, 0]) + 1, np.ptp(P[:, 1]) + 1
        if not (4 <= w <= 16 and 4 <= h <= 16 and 0.6 < w / h < 1.6) or len(px) / (w * h) < 0.55:
            continue
        cy, cx = P.mean(0)
        ring = []
        for t in ang:
            ring.append(min(a[int(np.clip(round(cy + (max(w, h) / 2 + dr) * np.sin(t)), 0, H - 1)),
                              int(np.clip(round(cx + (max(w, h) / 2 + dr) * np.cos(t)), 0, W - 1))].min() for dr in (0, 1, 2, 3)))
        if np.mean(ring) <= 90:
            # Город — двойной кружок: за тёмной обводкой ещё одно белое кольцо (на r+2 белого треть окружности,
            # у просвета буквы — почти ничего). Внутренний кружок города мал (r 2.5), признак его и отличает.
            r0 = max(w, h) / 2 + 2
            outer = np.mean([a[int(np.clip(round(cy + r0 * np.sin(t)), 0, H - 1)), int(np.clip(round(cx + r0 * np.cos(t)), 0, W - 1))].min() > 200
                             for t in np.linspace(0, 2 * np.pi, 24, endpoint=False)])
            out.append((float(cx), float(cy), float(max(w, h) / 2), bool(outer >= 0.25)))
    return out


def ink(a, ln):
    """Цвет букв: средний RGB самых тёмных 15 % пикселей рамки строки (фон светлее букв на всей карте)."""
    x0, y0 = max(int(ln['x']), 0), max(int(ln['y']), 0)
    x1, y1 = min(int(ln['x'] + ln['w']) + 1, a.shape[1]), min(int(ln['y'] + ln['h']) + 1, a.shape[0])
    px = a[y0:y1, x0:x1].reshape(-1, 3)
    if not len(px):
        return None
    dark = px[np.argsort(px.sum(1))[: max(1, len(px) * 15 // 100)]]
    return [int(v) for v in dark.mean(0).round()]


def norm(s):
    return re.sub(r"[^a-z]", '', (s or '').lower())


def snapshot(passport):
    """Прогон Vision и детектора значков по всему растру: блоки 1024 с нахлёстом, пачками по 40 PNG."""
    tiles = os.path.join(ROOT, passport['tiles'].lstrip('/'), str(passport['maxZoom']))
    W, H = passport['width'], passport['height']
    lines, marks = [], []
    step = BLOCK - OVERLAP
    blocks = [(bx, by) for by in range(0, H, step) for bx in range(0, W, step)]
    with tempfile.TemporaryDirectory(prefix='map-ocr-') as tmp:
        for i in range(0, len(blocks), 40):
            files = {}
            for bx, by in blocks[i:i + 40]:
                im = crop(tiles, bx, by, min(bx + BLOCK, W), min(by + BLOCK, H))
                a = np.asarray(im)
                if a.max() == 0:
                    continue
                f = os.path.join(tmp, f'{bx}_{by}.png')
                im.save(f)
                files[f] = (bx, by, a)
                marks += [(bx + x, by + y, r, city) for x, y, r, city in markers(im)]
            if not files:
                continue
            res = subprocess.run(['swift', os.path.join(ROOT, 'scripts/ocr-labels.swift')] + list(files),
                                 check=True, capture_output=True, text=True).stdout
            for row in res.splitlines():
                r = json.loads(row)
                bx, by, a = files[r['file']]
                bw, bh = a.shape[1], a.shape[0]
                for ln in r['lines']:
                    # У края блока (не края карты) подпись могла обрезаться — её целая копия в соседнем блоке.
                    edge = ((ln['x'] < 3 and bx > 0) or (ln['y'] < 3 and by > 0)
                            or (ln['x'] + ln['w'] > bw - 3 and bx + bw < W) or (ln['y'] + ln['h'] > bh - 3 and by + bh < H))
                    lines.append({**ln, 'x': ln['x'] + bx, 'y': ln['y'] + by, 'block': [bx, by], 'edge': bool(edge),
                                  'ink': ink(a, ln), 'words': [{**w, 'x': w['x'] + bx, 'y': w['y'] + by} for w in ln.get('words', [])]})
            for f in files:
                os.remove(f)
            print(f'блоков {min(i + 40, len(blocks))}/{len(blocks)}', file=sys.stderr, flush=True)
    # Нахлёст даёт дубли значков — сливаем ближе 3 px (сетка по 8 px вместо перебора всех пар).
    uniq, grid = [], {}
    for m in marks:
        gx, gy = int(m[0] // 8), int(m[1] // 8)
        near = [u for dx in (-1, 0, 1) for dy in (-1, 0, 1) for u in grid.get((gx + dx, gy + dy), [])]
        if all(math.dist(m[:2], u[:2]) > 3 for u in near):
            uniq.append(m)
            grid.setdefault((gx, gy), []).append(m)
    return lines, [list(m) for m in uniq]


def red_mask(a):
    """Тёмно-красная капитель имён стран и регионов (буквы ~(50, 4, 4) в белой обводке); пунктир границ — тот же цвет."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r >= 25) & (r <= 200) & (r > g + 25) & (r > b + 25) & (g < 90)


def blue_mask(a):
    """Тёмно-синяя капитель морей и заливов (THE SHINING SEA): темнее и глуше воды, на которой стоит."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (b > r + 30) & (b > g + 10) & (r < 60) & (b < 170) & (r + g + b < 300)


def glyphs(mask):
    """Связные пятна маски размером с букву: [(x, y, w, h)]. Пунктир границ тоньше и мельче — отсекается."""
    H, W = mask.shape
    seen = np.zeros_like(mask)
    out = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        st, n, x0, y0, x1, y1 = [(y, x)], 0, x, y, x, y
        seen[y, x] = True
        while st:
            cy, cx = st.pop()
            n += 1
            x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
            for yy in (cy - 1, cy, cy + 1):
                for xx in (cx - 1, cx, cx + 1):
                    if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        st.append((yy, xx))
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if 16 <= h <= 90 and w <= 2 * h and n >= 70 and n >= 0.15 * w * h:
            out.append((int(x0), int(y0), int(w), int(h), mask[y0:y1 + 1, x0:x1 + 1].copy()))
    return out


def chains_of(boxes):
    """
    Буквы одного имени вразрядку: шаг до 7 высот, имя идёт прямо, дугой или наискось (THE SHINING SEA, Thunder Peaks).
    Первую пару задаёт ближайшая буква правее (до 80° от горизонтали), дальше каждая следующая держит направление
    (±25°) и шаг (0,5–2,3 первого: пропущенная буква). Кегль ±40 %.
    """
    boxes = sorted(boxes, key=lambda b: (b[0], b[1]))
    C = [(b[0] + b[2] / 2, b[1] + b[3] / 2) for b in boxes]
    grid = {}
    for i, (cx, cy) in enumerate(C):
        grid.setdefault((int(cx // 256), int(cy // 256)), []).append(i)
    used, out = set(), []
    for i in range(len(boxes)):
        if i in used:
            continue
        chain, prev = [i], None
        while True:
            a = chain[-1]
            ah = boxes[a][3]
            reach = int(7 * ah // 256) + 1
            gx, gy = int(C[a][0] // 256), int(C[a][1] // 256)
            best = None
            for j in (j for xx in range(gx - reach, gx + reach + 1) for yy in range(gy - reach, gy + reach + 1) for j in grid.get((xx, yy), [])):
                if j in used or j in chain or not 0.7 <= boxes[j][3] / ah <= 1.4:
                    continue
                dx, dy = C[j][0] - C[a][0], C[j][1] - C[a][1]
                d = math.hypot(dx, dy)
                if not 0.6 * ah <= d <= 7 * ah:
                    continue
                ang = math.atan2(dy, dx)
                if prev is None:
                    if dx <= 0 or abs(ang) > math.radians(80):
                        continue
                else:
                    turn = abs((ang - prev[0] + math.pi) % (2 * math.pi) - math.pi)
                    if turn > math.radians(25) or not 0.5 * prev[1] <= d <= 2.3 * prev[1]:
                        continue
                if best is None or d < best[0]:
                    best = (d, j, ang)
            if best is None:
                break
            chain.append(best[1])
            # Шаг запоминается по первой паре и не растёт от пропусков: иначе цепочка уходит вдаль за чужой буквой.
            prev = (best[2], best[0] if prev is None else min(prev[1], best[0]))
        if len(chain) >= 3:
            used.update(chain)
            out.append([boxes[k] for k in chain])
    return out


def strip(chain):
    """Буквы цепочки вплотную на белом, чёрным по маске, высота букв ~48 px: такую строку Vision читает целиком."""
    h = sorted(b[3] for b in chain)[len(chain) // 2]
    k = 48 / h
    gaps = [math.hypot(b[0] + b[2] / 2 - a[0] - a[2] / 2, b[1] + b[3] / 2 - a[1] - a[3] / 2) for a, b in zip(chain, chain[1:])]
    typical = sorted(gaps)[len(gaps) // 2] if gaps else 0
    pieces, width = [], 24
    for i, (x, y, w, hh, bits) in enumerate(chain):
        g = Image.fromarray(np.where(bits, 0, 255).astype(np.uint8))
        g = g.resize((max(1, round(w * k)), max(1, round(hh * k))))
        if i:
            width += 40 if gaps[i - 1] > 1.7 * typical else 8
        # Буквы — на одну линию по середине: на дуге и наискось Vision иначе путает I с Y.
        pieces.append((width, 20 + round((h * k - g.height) / 2), g))
        width += g.width
    top = max(p[1] + p[2].height for p in pieces) + 20 if pieces else 1
    im = Image.new('L', (width + 24, top), 255)
    for x, y, g in pieces:
        im.paste(g, (x, y))
    return im


def read_ok(t, n):
    """Прочитанное похоже на цепочку: букв столько же (±30–40 %), короткое — только заглавными (не «kDg»)."""
    letters = [c for c in t if c.isalpha()]
    if not 0.7 * n <= len(letters) <= 1.4 * n:
        return False
    return n > 3 or all(c.isupper() for c in letters)


def glyph_labels(passport):
    """
    Имена стран, регионов и морей вразрядку (CORMYR, CALIMSHAN, THE SHINING SEA): Vision на карте их не читает —
    буква одна среди чужих подписей. Буквы находятся по цвету (красный и тёмно-синий) во всех блоках, собираются в
    цепочки по всей карте (имя бывает длиннее блока), цепочка ставится буквами вплотную в полоску и читается отдельно.
    """
    tiles = os.path.join(ROOT, passport['tiles'].lstrip('/'), str(passport['maxZoom']))
    W, H = passport['width'], passport['height']
    step = BLOCK - OVERLAP
    found = {'red': [], 'blue': []}
    for by in range(0, H, step):
        for bx in range(0, W, step):
            a = np.asarray(crop(tiles, bx, by, min(bx + BLOCK, W), min(by + BLOCK, H)))
            if a.max() == 0:
                continue
            for col, mf in (('red', red_mask), ('blue', blue_mask)):
                m = mf(a)
                if m.sum() < 200:
                    continue
                for x, y, w, h, bits in glyphs(m):
                    # Буква на краю блока обрезана — целая есть в соседнем (нахлёст 128 больше буквы).
                    if (x == 0 and bx > 0) or (y == 0 and by > 0) or (x + w >= a.shape[1] and bx + a.shape[1] < W) or (y + h >= a.shape[0] and by + a.shape[0] < H):
                        continue
                    found[col].append((bx + x, by + y, w, h, bits, ink(a, {'x': x, 'y': y, 'w': w, 'h': h})))
        print(f'буквы вразрядку: ряд {by}/{H}', file=sys.stderr, flush=True)
    out = []
    with tempfile.TemporaryDirectory(prefix='map-glyphs-') as tmp:
        jobs = {}
        for col, gl in found.items():
            uniq = {}
            for g in gl:
                uniq.setdefault((g[0], g[1], g[2], g[3]), g)
            for chain in chains_of(list(uniq.values())):
                f = os.path.join(tmp, f'{len(jobs)}.png')
                strip([c[:5] for c in chain]).save(f)
                x0, y0 = min(c[0] for c in chain), min(c[1] for c in chain)
                x1, y1 = max(c[0] + c[2] for c in chain), max(c[1] + c[3] for c in chain)
                jobs[f] = {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'n': len(chain), 'color': col,
                           'lh': sorted(c[3] for c in chain)[len(chain) // 2], 'ink': chain[len(chain) // 2][5],
                           'letters': [[round(c[0] + c[2] / 2), round(c[1] + c[3] / 2)] for c in chain]}
        files = list(jobs)
        for i in range(0, len(files), 200):
            res = subprocess.run(['swift', os.path.join(ROOT, 'scripts/ocr-labels.swift')] + files[i:i + 200],
                                 check=True, capture_output=True, text=True).stdout
            for row in res.splitlines():
                r = json.loads(row)
                t = ' '.join(ln['t'] for ln in sorted(r['lines'], key=lambda ln: ln['x'])).strip()
                j = jobs[r['file']]
                if norm(t) and read_ok(t, j['n']):
                    out.append({**j, 't': t, 'c': round(max(ln['c'] for ln in r['lines']), 2)})
    print(f'букв: красных {len(found["red"])}, синих {len(found["blue"])}; имён вразрядку {len(out)}', file=sys.stderr)
    return out


ICON_R = 7  # px: полуразмер эталона значка (15×15)
ICON_MIN = 0.7  # нормированная корреляция: ниже — фактура леса и буквы


def templates(passport, tiles):
    """Эталоны значков из content/maps/<id>-icons.json: серый 15×15 вокруг центра пятна значка (тёмного; у well — бирюзового)."""
    p = os.path.join(ROOT, f"content/maps/{passport['id']}-icons.json")
    if not os.path.exists(p):
        return []
    out = []
    for kind, pts in json.load(open(p, encoding='utf-8'))['templates'].items():
        for x, y in pts:
            a = np.asarray(crop(tiles, x - 16, y - 16, x + 16, y + 16)).astype(int)
            m = (a[..., 2] > a[..., 0] + 60) if kind == 'well' else (a.max(2) < 100)
            ys, xs = np.nonzero(m)
            sel = (ys - 16) ** 2 + (xs - 16) ** 2 < 100
            cx, cy = round(x - 16 + xs[sel].mean()), round(y - 16 + ys[sel].mean())
            t = np.asarray(crop(tiles, cx - ICON_R, cy - ICON_R, cx + ICON_R + 1, cy + ICON_R + 1)).astype(float).mean(2)
            out.append((kind, (t - t.mean()) / (t.std() + 1e-6)))
    return out


def icons(passport, labels):
    """
    Значки у подписей (TASKS V3): в окне вокруг подписи (±30 px по бокам, ±1,6 строки по высоте — значок бывает под
    подписью, как у Berdusk) — пики корреляции с эталонами выше ICON_MIN. Значок не приписывается подписи: рядом бывает
    значок соседа (город на берегу у подписи реки), кому он — решает справочник по близости. Дубли из соседних окон —
    ближе 5 px, остаётся лучший.
    """
    from numpy.lib.stride_tricks import sliding_window_view
    tiles = os.path.join(ROOT, passport['tiles'].lstrip('/'), str(passport['maxZoom']))
    tm = templates(passport, tiles)
    if not tm:
        return []
    T = np.stack([t for _, t in tm])
    kinds = [k for k, _ in tm]
    found = []
    for n, l in enumerate(labels):
        if l.get('spaced') or l['lh'] > 40:
            continue
        lh, yc = l['lh'], l['y'] + l['lh'] / 2
        x0, y0 = int(l['x'] - 30), int(yc - 1.6 * lh)
        g = np.asarray(crop(tiles, max(x0, 0), max(y0, 0), int(l['x'] + l['w'] + 30), int(yc + 1.6 * lh))).astype(float).mean(2)
        if g.shape[0] < 15 or g.shape[1] < 15:
            continue
        V = sliding_window_view(g, (15, 15))
        mu = V.mean((2, 3), keepdims=True)
        sd = V.std((2, 3), keepdims=True)
        Z = (V - mu) / (sd + 1e-6)
        S = np.einsum('ijab,kab->kij', Z, T) / 225
        S[:, sd[..., 0, 0] < 12] = 0  # ровный фон — не значок
        best = S.max(0)
        kind = S.argmax(0)
        # Значки отпечатаны чистым чёрным (самый тёмный пиксель 0–10), тени гор и фактура леса — от 16: по форме
        # тень похожа на треугольник и квадрат, по цвету — нет. Бирюзовый источник — без этого условия.
        rgb = np.asarray(crop(tiles, max(x0, 0), max(y0, 0), int(l['x'] + l['w'] + 30), int(yc + 1.6 * lh))).max(2)
        black = sliding_window_view(rgb, (15, 15))[:, :, 4:11, 4:11].min((2, 3)) <= 12
        best = np.where(black | (np.array(kinds)[kind] == 'well'), best, 0)
        for _ in range(4):
            i = np.unravel_index(np.argmax(best), best.shape)
            if best[i] < ICON_MIN:
                break
            found.append((float(best[i]), kinds[kind[i]], max(x0, 0) + i[1] + ICON_R, max(y0, 0) + i[0] + ICON_R))
            best[max(i[0] - 6, 0):i[0] + 7, max(i[1] - 6, 0):i[1] + 7] = 0
        if n % 500 == 0:
            print(f'значки: подписей {n}/{len(labels)}', file=sys.stderr, flush=True)
    found.sort(reverse=True)
    out, grid = [], {}
    for s, k, x, y in found:
        cell = (x // 8, y // 8)
        if any(abs(x - o['x']) <= 5 and abs(y - o['y']) <= 5 for dx in (-1, 0, 1) for dy in (-1, 0, 1) for o in grid.get((cell[0] + dx, cell[1] + dy), [])):
            continue
        o = {'kind': k, 'x': int(x), 'y': int(y), 's': round(s, 2)}
        out.append(o)
        grid.setdefault(cell, []).append(o)
    return out


def overlap(a, b):
    """Доля пересечения рамок от меньшей из двух."""
    ix = min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x'])
    iy = min(a['y'] + a['h'], b['y'] + b['h']) - max(a['y'], b['y'])
    if ix <= 0 or iy <= 0:
        return 0.0
    return ix * iy / max(min(a['w'] * a['h'], b['w'] * b['h']), 1e-6)


def caps_of(t):
    letters = [c for c in t if c.isalpha()]
    return sum(c.isupper() for c in letters) / len(letters) if letters else 0.0


def whole_name(t):
    """Два и больше слов с заглавной и без служебного на краю: «Lava Plateau», а не «Great Mount» … «of Ghaethluntar»."""
    w = t.split()
    small = {'of', 'the', 'and', 'de', 'al'}
    return len(w) >= 2 and w[0][:1].isupper() and w[-1].lower() not in small and sum(x[:1].isupper() for x in w) >= 2 \
        and not w[-1][:1].islower()


def features(t, w, h):
    letters = [c for c in t if c.isalpha()]
    caps = sum(c.isupper() for c in letters) / len(letters) if letters else 0.0
    spread = w / (max(len(t.replace(' ', '')), 1) * max(h, 1))
    return {'caps': round(caps, 2), 'spread': round(spread, 2)}


def ink_close(a, b, tol=40):
    return bool(a and b) and max(abs(p - q) for p, q in zip(a, b)) < tol


def spaced_words(labs):
    """
    Имена стран и регионов набраны капителью вразрядку (шаг букв — около трёх высот, часто по дуге), Vision читает их
    по букве: «S», «E», «M», «P»… Цепочка — заглавные обрывки до трёх букв одного цвета и кегля, следующий правее с
    зазором не больше 5 высот (пропущенная буква) и по высоте не дальше 0,9 высоты от предыдущего (дуга). Пропуск вдвое больше обычного шага —
    пробел между словами. Буквы, которые Vision не прочёл, в слове пропадают: «ESSENT» — сверять с GIS нестрого.
    """
    frag = [i for i, l in enumerate(labs)
            if l['h'] >= 14 and 0 < sum(c.isalpha() for c in l['t']) <= 3 and all(c.isupper() for c in l['t'] if c.isalpha())]
    frag.sort(key=lambda i: labs[i]['x'])
    used, chains = set(), []
    for i in frag:
        if i in used:
            continue
        chain = [i]
        while True:
            a = labs[chain[-1]]
            ax, ay = a['x'] + a['w'] / 2, a['y'] + a['h'] / 2
            best = None
            for j in frag:
                b = labs[j]
                if j in used or j in chain:
                    continue
                # Зазор между краями, а не шаг середин: обрывки бывают в букву и в три («T», «HE», «S K»).
                dx = b['x'] - (a['x'] + a['w'])
                if not (b['x'] + b['w'] / 2 > ax and -0.3 * a['h'] <= dx <= 5 * a['h']) or abs(b['y'] + b['h'] / 2 - ay) > 0.9 * a['h']:
                    continue
                if not (0.65 <= b['h'] / a['h'] <= 1.5) or not ink_close(a['ink'], b['ink'], 45):
                    continue
                if best is None or dx < best[0]:
                    best = (dx, j)
            if best is None:
                break
            chain.append(best[1])
        letters = sum(sum(c.isalpha() for c in labs[k]['t']) for k in chain)
        if len(chain) >= 3 and letters >= 4:
            used.update(chain)
            chains.append(chain)
    out = [l for i, l in enumerate(labs) if i not in used]
    for chain in chains:
        ls = [labs[k] for k in chain]
        steps = [(b['x'] + b['w'] / 2) - (a['x'] + a['w'] / 2) for a, b in zip(ls, ls[1:])]
        typical = sorted(steps)[len(steps) // 2]
        t = ls[0]['t'].replace(' ', '')
        for st, l in zip(steps, ls[1:]):
            t += (' ' if st > 1.7 * typical else '') + l['t'].replace(' ', '')
        x0, y0 = min(l['x'] for l in ls), min(l['y'] for l in ls)
        x1, y1 = max(l['x'] + l['w'] for l in ls), max(l['y'] + l['h'] for l in ls)
        h = sorted(l['h'] for l in ls)[len(ls) // 2]
        out.append({'t': t, 'c': min(l['c'] for l in ls), 'x': x0, 'y': y0, 'w': x1 - x0, 'h': h, 'ink': ls[len(ls) // 2]['ink'],
                    'parts': 1, 'spaced': True, 'letters': [[l['t'].replace(' ', ''), round(l['x'] + l['w'] / 2), round(l['y'] + l['h'] / 2)] for l in ls]})
    return out


def with_glyph_names(labs, names):
    """
    Имена вразрядку из glyph_labels — в подписи. Обрывки тех же букв, что Vision прочёл по одной («S», «HE»), уходят;
    имя, которое Vision прочёл целиком (RASHEMEN), остаётся его строкой.
    """
    def inside(p, l):
        return l['x'] - 2 <= p[0] <= l['x'] + l['w'] + 2 and l['y'] - 2 <= p[1] <= l['y'] + l['h'] + 2

    def fragment(l):
        return l.get('spaced') or (0 < sum(c.isalpha() for c in l['t']) <= 3 and all(c.isupper() for c in l['t'] if c.isalpha()))

    drop, add = set(), []
    for g in names:
        pts = g['letters']
        whole = [i for i, l in enumerate(labs) if not fragment(l) and sum(inside(p, l) for p in pts) >= 0.5 * len(pts)]
        if whole:
            continue
        drop.update(i for i, l in enumerate(labs) if fragment(l) and any(inside(p, l) for p in pts))
        add.append({'t': g['t'], 'c': g['c'], 'x': g['x'], 'y': g['y'], 'w': g['w'], 'h': g['lh'], 'ink': g['ink'],
                    'parts': 1, 'spaced': True, 'color': g['color'], 'letters': pts})
    return [l for i, l in enumerate(labs) if i not in drop] + add


def labels_from(lines, marks, names=()):
    """
    Подписи без дублей: из копий одной подписи (нахлёст блоков) остаётся целая и уверенная — не у края блока, выше c.
    Буквы вразрядку собираются в слова (spaced_words). Строки одной подписи («Glacier of» над «Ulutiu», «Land of the»
    над «Snow Spirits») склеиваются, если они одного цвета и кегля, стоят друг под другом с зазором меньше строки и
    середины их рамок по горизонтали не дальше трети ширины. Строка со значком поселения у края не склеивается: это
    поселение, а под ним — соседнее, а не вторая строка того же имени.
    """
    order = sorted(range(len(lines)), key=lambda i: (lines[i]['edge'], -lines[i]['c'], -len(lines[i]['t'])))
    kept, grid = [], {}
    for i in order:
        ln = lines[i]
        cells = [(gx, gy) for gx in range(int(ln['x'] // 256), int((ln['x'] + ln['w']) // 256) + 1)
                 for gy in range(int(ln['y'] // 256), int((ln['y'] + ln['h']) // 256) + 1)]
        if any(overlap(ln, lines[j]) > 0.5 for c in cells for j in grid.get(c, [])):
            continue
        kept.append(i)
        for c in cells:
            grid.setdefault(c, []).append(i)
    labs = [{'t': lines[i]['t'].strip(), 'c': round(lines[i]['c'], 2), 'x': lines[i]['x'], 'y': lines[i]['y'],
             'w': lines[i]['w'], 'h': lines[i]['h'], 'ink': lines[i]['ink'], 'parts': 1} for i in kept]
    labs = with_glyph_names(spaced_words([l for l in labs if norm(l['t'])]), names)
    mgrid = {}
    for m in marks:
        mgrid.setdefault((int(m[0] // 64), int(m[1] // 64)), []).append(m)

    def has_mark(l):
        x0, x1, y0, y1 = l['x'] - 14, l['x'] + l['w'] + 14, l['y'] - 2, l['y'] + l['h'] + 2
        return any(x0 <= m[0] <= x1 and y0 <= m[1] <= y1
                   for gx in range(int(x0 // 64), int(x1 // 64) + 1) for gy in range(int(y0 // 64), int(y1 // 64) + 1)
                   for m in mgrid.get((gx, gy), []))

    def iconish(t):
        # Значок, прочитанный знаком или буквой у края: «House#», «•Thortn», «oLeilon», «Towersg» не ловится — это мешает только склейке.
        w = t.split()
        return bool(w) and (not (t[:1].isalpha() or t[:1] in '"(') or not (t[-1:].isalpha() or t[-1:] in ".'’)")
                            or w[0] in ('o', 'e', 'O') or w[-1] in ('o', 'e', 'O'))

    for l in labs:
        l['mark'] = has_mark(l) or iconish(l['t'])
    labs.sort(key=lambda l: (l['y'], l['x']))
    merged = [False] * len(labs)
    out = []
    for i, a in enumerate(labs):
        if merged[i]:
            continue
        cur, last = dict(a, rows=[a['t']]), a
        while cur['parts'] < 3 and not last['mark']:
            nxt = None
            for j in range(i + 1, len(labs)):
                b = labs[j]
                if b['y'] > last['y'] + 2.2 * last['h']:
                    break
                if merged[j] or b['mark']:
                    continue
                gap = b['y'] - (last['y'] + last['h'])
                same_size = abs(b['h'] - last['h']) < 0.25 * max(b['h'], last['h'])
                centred = abs((b['x'] + b['w'] / 2) - (last['x'] + last['w'] / 2)) < max(last['w'], b['w']) / 3
                # Два законченных имени одно под другим («Spiderhaunt Woods» над «Cothyl's Tower») и капитель под
                # строчными («Vale» над «ULDOON TRAIL») — разные подписи.
                both_whole = whole_name(last['t']) and whole_name(b['t'])
                case_flip = (last.get('caps', caps_of(last['t'])) > 0.9) != (caps_of(b['t']) > 0.9)
                if -0.2 * last['h'] < gap < last['h'] and same_size and ink_close(last['ink'], b['ink']) and centred and not both_whole and not case_flip:
                    nxt = j
                    break
            if nxt is None:
                break
            b = labs[nxt]
            merged[nxt] = True
            x0, y0 = min(cur['x'], b['x']), min(cur['y'], b['y'])
            x1, y1 = max(cur['x'] + cur['w'], b['x'] + b['w']), max(cur['y'] + cur['h'], b['y'] + b['h'])
            cur.update(t=f"{cur['t']} {b['t']}", c=min(cur['c'], b['c']), x=x0, y=y0, w=x1 - x0, h=y1 - y0, parts=cur['parts'] + 1,
                       rows=cur['rows'] + [b['t']])
            last = b
        if cur['parts'] == 1:
            cur.pop('rows')
        out.append({**cur, 'x': round(cur['x'], 1), 'y': round(cur['y'], 1), 'w': round(cur['w'], 1), 'h': round(cur['h'], 1),
                    'lh': round(a['h'], 1), **features(a['t'], a['w'], a['h'])})
    return out


def path_of(passport):
    return os.path.join(ROOT, 'maps/ocr', f"{passport['id']}-labels.json")


def load(passport):
    """Снимок карты, если он есть: (lines, marks, icons) — строки и белые кружки, как их раньше собирал справочник прогоном Vision, и значки по эталонам."""
    p = path_of(passport)
    if not os.path.exists(p):
        return None
    d = json.load(open(p, encoding='utf-8'))
    return d['lines'], [tuple(m) for m in d['marks']], d.get('icons', [])


def main():
    passport = json.load(open([a for a in sys.argv[1:] if not a.startswith('--')][0], encoding='utf-8'))
    out = path_of(passport)
    partial = [f for f in ('--relabel', '--glyphs', '--icons') if f in sys.argv]
    if partial:
        d = json.load(open(out, encoding='utf-8'))
        lines, marks = d['lines'], d['marks']
        names = glyph_labels(passport) if '--glyphs' in sys.argv else d.get('glyphs', [])
    else:
        lines, marks = snapshot(passport)
        names = glyph_labels(passport)
    labs = labels_from(lines, marks, names)
    ics = icons(passport, labs) if not partial or '--icons' in sys.argv else d.get('icons', [])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump({'map': passport['id'], 'block': BLOCK, 'overlap': OVERLAP, 'lines': lines, 'marks': marks, 'glyphs': names,
               'icons': ics, 'labels': labs},
              open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    multi = sum(1 for l in labs if l['parts'] > 1)
    spaced = sum(1 for l in labs if l.get('spaced'))
    kinds = ', '.join(f'{k} {v}' for k, v in sorted(Counter(i['kind'] for i in ics).items(), key=lambda kv: -kv[1]))
    print(f'строк Vision {len(lines)}, подписей {len(labs)} (склеено из строк {multi}, вразрядку {spaced}), белых кружков {len(marks)}, '
          f'значков по эталонам {len(ics)} ({kinds}) → {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
