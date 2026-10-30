# Растр карты мира без подписей и значков (30.10.2026): подложка, поверх которой стол сам кладёт подписи и значки по
# координатам (content/maps/<id>-labels.json, <id>-places.json).
#
# Запуск (нужны OpenCV и PyTorch — их нет в ./.venv; отдельное окружение, см. ниже):
#   $PY -I scripts/clean-map.py content/maps/toril.json [--box x0,y0,x1,y1] [--out <файл.tif>] [--device cpu|mps] [--threads 6]
#     [--remask] — пересчитать маску и вернуть исходник там, где она сузилась (заливка не повторяется)
#     [--resume | --from Y] — продолжить прерванный прогон (буфер <out>.raw, прогресс <out>.raw.progress.json)
#   $PY = /Volumes/внешний/venvs/map-clean-2026-10-30/bin/python (numpy, pillow, opencv-contrib-python-headless, torch)
#   Модель — big-lama (TorchScript, Apache-2.0): /Volumes/внешний/datasets/big-lama-2026-10-30/big-lama.pt, там же ИСТОЧНИК.txt.
#   Пишет «<исходник>-clean.tif» рядом с исходником (не в git) и maps/tiles/<id>/clean-mask.png (клетка 4 px, 255 —
#   в клетке есть закрашенный пиксель). Тайлы — scripts/tile-map.py content/maps/<id>-clean.json.
#   --box — только область (пилот, проверка): пишет <out> размером с область, маску не пишет.
#
# Маска — пиксели, а не рамки (рамка наклонной подписи — полкарты леса):
#   буквы и обводки значков — тёмный тонкий штрих с сильным контрастом (black top-hat яркости, замыкание 7 px > 115)
#   и толстые нейтрально-тёмные штрихи крупных букв вразрядку (top-hat 17 px); кусок штриха — буква, только если
#   касается белого ореола (мин. канал > 185, серый): у фактуры леса и теней гор ореола нет, у подписей и значков есть
#   всегда. Так ловятся и наклонные подписи, которых Vision не читает (TASKS V2). Внутри рамок строк Vision порог ниже (70).
#   Бордовое: тёмная сердцевина — буква, светлый штрих вдали от неё — граница (правило borders-from-map.py);
#   бордовая заливка крупных букв (CORMYR) — толстые бордовые пятна, что наполовину уже в маске.
#   Тёмно-синие капители морей — map_ocr.blue_mask. Значки без ореола у подписи: чисто-чёрные метки (треугольник,
#   квадрат, точки руин, кирки) в 30 px от букв, бирюзовые источники; диски r 9 по значкам снимка (maps/ocr) и местам.
#   Маска — штрихи, расширенные на 4 px (ореол и мягкая тень).
# Линии: пиксели дорог, границ и рек у наших векторов (schema.json) вне ореола и букв из маски выводятся, если их кусок
#   продолжается за маской (островок цвета линии внутри подписи модель размазывает в пятно). Где вектор идёт через
#   маску, а цвета линии рядом нет, линия дорисовывается стилем растра (цвет — медиана той же линии рядом, штрих,
#   у границы — светлая кайма) до заливки — как подсказка модели — и ещё раз после, где она не продолжила.
# Заливка — big-lama (замер пилота 30.10: OpenCV Telea/NS размазывает фактуру леса и гор пятнами, LaMa её
#   продолжает). Окна 1024 с полями 128 по порядку строк; уже очищенные пиксели соседей — известные, шва нет.
#
# Растр HandsomeRob — только для стола владельца (SOURCES.md, «стол»); очищенный — так же, никуда не публикуется.
import importlib.util, json, math, os, subprocess, sys, tempfile, time
import numpy as np
import cv2
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GT_DIRS = ['/Applications/Postgres.app/Contents/Versions/latest/bin', '/opt/homebrew/bin', '/usr/local/bin']
LAMA_PT = '/Volumes/внешний/datasets/big-lama-2026-10-30/big-lama.pt'
CORE, MARGIN = 576, 64   # окно 704: на CPU ~12 с; MPS занят локальной LLM (замер 30.10) — см. --device
CELL = 4

P = dict(
    HALO_MIN=185,     # мин. канал белого ореола букв
    HALO_SHARE=0.25,  # доля куска штриха в 2 px от ореола
    BTH_SMALL=115,    # black top-hat, замыкание 7 px: тонкий тёмный штрих с сильным контрастом
    BTH_BIG=110,      # black top-hat, замыкание 17 px, только нейтрально-тёмное: крупные буквы вразрядку
    DARK_MAX=70,      # нейтрально-тёмное (буквы печатны чёрным и серым, тени местности тонированы)
    HALO=4,           # px расширения штриха: ореол и мягкая тень
    BOX_PAD=3,        # px вокруг рамки строки Vision
    BOX_BTH=70,       # порог top-hat внутри рамки строки
    ICON_R=9,         # px: диск по значку снимка и месту справочника
    ICON_BLACK=45,    # макс. канал чисто-чёрной метки
    ICON_NEAR=30,     # px от букв: чёрная метка ближе — значок подписи
    LINE_CLEAR=2,     # px от ореола: ближе пиксель цвета линии может быть буквой (подпись реки) — не сохраняется
)


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


borders = load('borders_from_map', 'borders-from-map.py')   # border_masks: бордовое и тёмная сердцевина букв
roads = load('roads_from_map', 'roads-from-map.py')          # road_mask: пунктир дорог
map_ocr = load('map_ocr', 'map_ocr.py')                     # blue_mask: тёмно-синие капители морей


def tool(name):
    import shutil
    for d in GT_DIRS:
        if os.access(os.path.join(d, name), os.X_OK):
            return os.path.join(d, name)
    return shutil.which(name) or sys.exit(f'clean-map: нет {name} (GDAL)')


def disk(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def near(m, r):
    return cv2.dilate(m.astype(np.uint8), disk(r)) > 0


def water(a):
    """Вода — правило terrain-from-map.py плюс тёмно-синее (как schema-from-grids.py)."""
    r, g, b = (a[..., i].astype(np.int16) for i in range(3))
    return ((b > 140) & (b > r + 50) & (b > g + 15)) | ((b > r + 60) & (b > g + 50))


class Data:
    """Снимок подписей и значков (maps/ocr), места справочника, векторная схема — с сеткой для выборки по окну."""

    def __init__(self, passport):
        mid = passport['id']
        snap = json.load(open(os.path.join(ROOT, f'maps/ocr/{mid}-labels.json'), encoding='utf-8'))
        places = json.load(open(os.path.join(ROOT, f'content/maps/{mid}-places.json'), encoding='utf-8'))['places']
        self.schema = json.load(open(os.path.join(ROOT, passport['tiles'].lstrip('/'), 'schema.json'), encoding='utf-8'))
        self.lines = [(ln['x'], ln['y'], ln['w'], ln['h']) for ln in snap['lines']]
        pts = [(i['x'], i['y']) for i in snap['icons']] + [(m[0], m[1]) for m in snap['marks']]
        pts += [(p['x'], p['y']) for p in places if p.get('how') in ('marker', 'icon') and p.get('x') is not None]
        self.points = np.array(pts, float).reshape(-1, 2)
        # буквы имён вразрядку (glyphs снимка) — рамками: на серой «неведомой» земле только они и строки Vision дают буквы
        self.glyph_boxes = [(x - g['lh'], y - g['lh'], 2 * g['lh'], 2 * g['lh']) for g in snap['glyphs'] for x, y in g['letters']]
        # местность (terrain-from-map.py, клетка 8 px): «u» — серая неведомая земля, шум с ореолом по всей площади
        self.terrain = np.asarray(Image.open(os.path.join(ROOT, passport['tiles'].lstrip('/'), 'terrain.png'))) // 25
        self.polys = {k: [np.array(ln, np.float64).reshape(-1, 2) for ln in self.schema[k]] for k in ('roads', 'borders', 'rivers')}
        self.bbox = {k: np.array([[p[:, 0].min(), p[:, 1].min(), p[:, 0].max(), p[:, 1].max()] for p in v]).reshape(-1, 4)
                     for k, v in self.polys.items()}

    def boxes_in(self, x0, y0, w, h):
        return [b for b in self.lines if not (b[0] + b[2] < x0 or b[0] > x0 + w or b[1] + b[3] < y0 or b[1] > y0 + h)]

    def points_in(self, x0, y0, w, h):
        P_ = self.points
        sel = (P_[:, 0] >= x0 - 12) & (P_[:, 0] <= x0 + w + 12) & (P_[:, 1] >= y0 - 12) & (P_[:, 1] <= y0 + h + 12)
        return P_[sel]

    def polys_in(self, kind, x0, y0, w, h, pad=8):
        B = self.bbox[kind]
        sel = np.nonzero(~((B[:, 2] < x0 - pad) | (B[:, 0] > x0 + w + pad) | (B[:, 3] < y0 - pad) | (B[:, 1] > y0 + h + pad)))[0]
        return [self.polys[kind][i] for i in sel]

    def band(self, kind, x0, y0, w, h, thick):
        m = np.zeros((h, w), np.uint8)
        for pts in self.polys_in(kind, x0, y0, w, h):
            cv2.polylines(m, [np.round(pts - [x0, y0]).astype(np.int32)], False, 1, thick)
        return m > 0


def halo_backed(seeds, nh, share):
    """Куски штриха, что касаются белого ореола: у букв и значков он есть, у крапин леса и рельефа — нет."""
    n, lab = cv2.connectedComponents(seeds.astype(np.uint8), connectivity=8)
    area = np.bincount(lab.ravel(), minlength=n)
    hal = np.bincount(lab.ravel(), weights=nh.ravel(), minlength=n)
    keep = hal >= np.maximum(2, share * area)
    keep[0] = False
    return keep[lab]


def ink_seeds(a, p=P):
    ai = a.astype(np.int16)
    lum = a.astype(np.float32).mean(2)
    mx, mn = ai.max(2), ai.min(2)
    bth7 = cv2.morphologyEx(lum, cv2.MORPH_CLOSE, disk(3)) - lum
    bth17 = cv2.morphologyEx(lum, cv2.MORPH_CLOSE, disk(8)) - lum
    neutral = (mx - mn) < 45
    halo = (mn > p['HALO_MIN']) & ((mx - mn) < 50)
    s_small = bth7 > p['BTH_SMALL']
    # крупные буквы: толстый нейтрально-тёмный штрих (крапины леса в 1–3 px размыкание не переживают)
    s_big = cv2.morphologyEx((neutral & (mx < p['DARK_MAX']) & (bth17 > p['BTH_BIG'])).astype(np.uint8), cv2.MORPH_OPEN, disk(1)) > 0
    maroon, core = borders.border_masks(a)
    border_line = maroon & ~near(core, borders.CORE_NEAR)
    blue = map_ocr.blue_mask(a)
    seeds = halo_backed((s_small | s_big) & ~border_line, near(halo, 2), p['HALO_SHARE']) | blue
    return seeds, dict(halo=halo, bth7=bth7, border_line=border_line, maroon=maroon, mx=mx, mn=mn)


def line_pixels(a, x0, y0, parts, letters, data, p=P):
    """Пиксели дорог, границ и рек у векторов схемы, не у букв: в маску не идут."""
    h, w = a.shape[:2]
    clear = ~near(parts['halo'], p['LINE_CLEAR']) & ~near(letters, 1)
    road = roads.road_mask(a) & data.band('roads', x0, y0, w, h, 7)
    border = parts['border_line'] & data.band('borders', x0, y0, w, h, 7)
    river = water(a) & data.band('rivers', x0, y0, w, h, 9)
    return (road | river) & clear | border & ~near(letters, 3)


def build_mask(a, x0, y0, data, p=P):
    """Маска подписей и значков окна a (левый верхний угол — x0, y0 в пикселях исходника)."""
    h, w = a.shape[:2]
    seeds, parts = ink_seeds(a, p)
    mx, mn = parts['mx'], parts['mn']
    box = np.zeros((h, w), bool)
    for bx, by, bw, bh in data.boxes_in(x0, y0, w, h):
        c0, r0 = int(bx - x0 - p['BOX_PAD']), int(by - y0 - p['BOX_PAD'])
        c1, r1 = int(bx + bw - x0 + p['BOX_PAD']) + 1, int(by + bh - y0 + p['BOX_PAD']) + 1
        box[max(r0, 0):max(r1, 0), max(c0, 0):max(c1, 0)] = True
    inbox = halo_backed(box & (parts['bth7'] > p['BOX_BTH']) & ~parts['border_line'], near(parts['halo'], 2), p['HALO_SHARE'])
    # Серая неведомая земля (класс «u», 7 % карты) — чёрно-белый шум: каждая крапина «буква с ореолом» (замер 30.10:
    # 66 % клеток первой маски были этим шумом, 89 % класса). На ней буквы — только в рамках строк Vision и имён вразрядку.
    k = 8
    ty0, tx0 = y0 // k, x0 // k
    tz = data.terrain[ty0:ty0 + -(-(h + y0 % k) // k), tx0:tx0 + -(-(w + x0 % k) // k)] == 8
    if tz.any():
        uz = np.repeat(np.repeat(tz, k, 0), k, 1)[y0 % k:y0 % k + h, x0 % k:x0 % k + w]
        uz = np.pad(uz, ((0, h - uz.shape[0]), (0, w - uz.shape[1])))
        uz = near(uz, 12)
        gb = box.copy()
        for bx, by, bw, bh in [g for g in data.glyph_boxes if not (g[0] + g[2] < x0 or g[0] > x0 + w or g[1] + g[3] < y0 or g[1] > y0 + h)]:
            gb[max(int(by - y0), 0):max(int(by + bh - y0), 0), max(int(bx - x0), 0):max(int(bx + bw - x0), 0)] = True
        seeds &= ~uz | near(gb, 6)
    ink = seeds | inbox
    mask = near(ink, p['HALO'])
    close = near(ink, p['ICON_NEAR'])

    def small_near(m, maxwh, minarea):
        n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
        ok = (st[:, 2] <= maxwh) & (st[:, 3] <= maxwh) & (st[:, 4] >= minarea)
        ok &= np.bincount(lab.ravel(), weights=close.ravel(), minlength=n) > 0
        ok[0] = False
        return ok[lab]
    # значки без ореола у подписи: чёрные метки (тонкие и сплошные на тёмной земле), бирюзовые источники
    blk = small_near((mx <= p['ICON_BLACK']) & ((mx - mn) < 40) & (parts['bth7'] > p['BTH_SMALL']) & ~ink, 20, 2)
    blk |= small_near(cv2.morphologyEx((mx <= 20).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0, 22, 9)
    r, g, b = (a[..., i].astype(np.int16) for i in range(3))
    cyan = (r < 100) & (g > 150) & (b > 190) & (g - r > 90)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(cyan.astype(np.uint8), connectivity=8)
    ok2 = (st2[:, 2] <= 18) & (st2[:, 3] <= 18) & (st2[:, 4] >= 6)
    ok2[0] = False
    mask |= near(blk, 3) | near(ok2[lab2], 3)
    icon = np.zeros((h, w), np.uint8)
    for x, y in data.points_in(x0, y0, w, h):
        cv2.circle(icon, (int(round(x - x0)), int(round(y - y0))), p['ICON_R'], 1, -1)
    mask |= icon > 0
    # бордовая заливка крупных букв: толстые бордовые пятна, что на треть и больше в маске
    maroon = parts['maroon']
    thick = cv2.morphologyEx(maroon.astype(np.uint8), cv2.MORPH_OPEN, disk(1)) > 0
    n4, lab4, st4, _ = cv2.connectedComponentsWithStats(maroon.astype(np.uint8), connectivity=8)
    inside = np.bincount(lab4.ravel(), weights=mask.ravel(), minlength=n4)
    thk = np.bincount(lab4.ravel(), weights=thick.ravel(), minlength=n4)
    ok4 = (st4[:, 4] >= 25) & (thk >= 8) & (inside >= 0.3 * st4[:, 4]) & (st4[:, 2] <= 80) & (st4[:, 3] <= 80)
    ok4[0] = False
    letters = near(ok4[lab4], 2)
    mask |= letters
    # линии: только куски, что продолжаются за маской
    protect = line_pixels(a, x0, y0, parts, ink | letters, data, p) & mask
    n5, lab5 = cv2.connectedComponents((protect | ~mask).astype(np.uint8), connectivity=8)
    outside = np.zeros(n5, bool)
    outside[np.unique(lab5[~mask])] = True
    protect &= outside[lab5]
    pn, plab, pst, _ = cv2.connectedComponentsWithStats(protect.astype(np.uint8), connectivity=8)
    protect &= (pst[:, 4] >= 3)[plab]
    return mask & ~protect


# Стиль линий растра: (цвет по умолчанию, ширина, (штрих, пробел) px или None, кайма (цвет, ширина) или None).
STYLE = {
    'rivers': ((70, 130, 225), 2.0, None, None),
    'roads': ((150, 85, 60), 1.4, (6, 4), None),
    'borders': ((150, 20, 30), 2.2, (8, 3), ((235, 232, 225), 4.5)),
}
COLOUR = {'roads': lambda a: roads.road_mask(a), 'borders': lambda a: borders.border_masks(a)[0], 'rivers': water}


def redraw(img, mask, x0, y0, data, outside_only=False, r=2):
    """Векторы схемы через маску, где цвета линии рядом (r px) нет, — стилем растра; меняются только пиксели маски.
    Возвращает (картинка, {вид: пикселей}, альфа нарисованного)."""
    h, w = mask.shape
    out = img.astype(np.float32)
    drawn, total = {}, np.zeros((h, w), np.float32)
    S = 4
    for kind in ('rivers', 'roads', 'borders'):
        polys = data.polys_in(kind, x0, y0, w, h)
        if not polys:
            continue
        col0, width, dash, edging = STYLE[kind]
        fn = COLOUR[kind]
        line = fn(img)
        band = data.band(kind, x0, y0, w, h, 9)
        px = img[line & band & ~mask]
        col = tuple(int(v) for v in np.median(px, 0)) if len(px) >= 20 else col0
        if kind == 'rivers':
            rv = (water(img) & band & ~mask).astype(np.uint8)
            axis = data.band(kind, x0, y0, w, h, 1)
            if rv.sum() > 30:
                dt = cv2.distanceTransform(rv, cv2.DIST_L2, 3)
                sel = (dt > 0) & axis
                if sel.any():
                    width = float(np.clip(2 * np.median(dt[sel]), 1.5, 4))
        present = near(line & ~mask, r) if outside_only else near(line, r)
        canvas = np.zeros((h * S, w * S), np.uint8)
        ecanvas = np.zeros_like(canvas)
        for pts in polys:
            pts = pts - [x0, y0]
            seg = np.diff(pts, axis=0)
            L = np.hypot(seg[:, 0], seg[:, 1])
            s0 = np.r_[0, np.cumsum(L)[:-1]]
            for a_, d_, l_, s_ in zip(pts[:-1], seg, L, s0):
                n = max(1, int(l_))
                t = np.arange(n) / n
                P0 = a_ + d_ * t[:, None]
                P1 = a_ + d_ * ((np.arange(n) + 1) / n)[:, None]
                s = s_ + l_ * t
                xi, yi = np.round(P0[:, 0]).astype(int), np.round(P0[:, 1]).astype(int)
                ok = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
                ok[ok] = mask[yi[ok], xi[ok]] & ~present[yi[ok], xi[ok]]
                for i in np.nonzero(ok)[0]:
                    q0, q1 = tuple((P0[i] * S).astype(int)), tuple((P1[i] * S).astype(int))
                    if edging is not None:
                        cv2.line(ecanvas, q0, q1, 255, max(1, int(edging[1] * S)), cv2.LINE_AA)
                    if dash is None or (s[i] % (dash[0] + dash[1])) < dash[0]:
                        cv2.line(canvas, q0, q1, 255, max(1, int(width * S)), cv2.LINE_AA)
        alpha = cv2.resize(canvas, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255 * mask
        if edging is not None:
            ea = cv2.resize(ecanvas, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255 * 0.8 * mask
            out = out * (1 - ea[..., None]) + np.array(edging[0], np.float32) * ea[..., None]
            total = np.maximum(total, ea)
        out = out * (1 - alpha[..., None]) + np.array(col, np.float32) * alpha[..., None]
        total = np.maximum(total, alpha)
        drawn[kind] = int((alpha > 0.3).sum())
    return np.clip(out + 0.5, 0, 255).astype(np.uint8), drawn, total


_lama = None
DEVICE = sys.argv[sys.argv.index('--device') + 1] if '--device' in sys.argv else 'cpu'
THREADS = int(sys.argv[sys.argv.index('--threads') + 1]) if '--threads' in sys.argv else 6


def lama(a, mask):
    """big-lama на окно (дополнение до кратного 8 отражением); пиксели вне маски возвращаются как были."""
    global _lama
    import torch
    if _lama is None:
        dev = DEVICE
        torch.set_num_threads(THREADS)
        _lama = (torch.jit.load(LAMA_PT, map_location='cpu').eval().to(dev), dev)
    m, dev = _lama
    if not mask.any():
        return a.copy()
    h, w = mask.shape
    ph, pw = (-h) % 8, (-w) % 8
    img = np.pad(a, ((0, ph), (0, pw), (0, 0)), mode='reflect')
    mk = np.pad(mask, ((0, ph), (0, pw)))
    with torch.no_grad():
        ti = torch.from_numpy(img).permute(2, 0, 1)[None].float().div(255).to(dev)
        tm = torch.from_numpy(mk.astype(np.float32))[None, None].to(dev)
        o = m(ti, tm)[0].permute(1, 2, 0).float().cpu().numpy()
    o = np.clip(o * 255 + 0.5, 0, 255).astype(np.uint8)[:h, :w]
    res = a.copy()
    res[mask] = o[mask]
    return res


def clean(img, orig, x0, y0, data, done=None):
    """Окно: маска по исходнику, подсказки линий, LaMa, дорисовка. img — текущее состояние (очищенные соседи),
    done — пиксели окна, уже записанные соседями (известные). Возвращает (картинка, маска, сведения)."""
    mask = build_mask(orig, x0, y0, data)
    eff = mask & ~done if done is not None else mask
    hinted, d0, al = redraw(img, eff, x0, y0, data, outside_only=True)
    out = lama(hinted, eff & ~(al > 0.5))
    out, d1, _ = redraw(out, eff, x0, y0, data)
    return out, mask, {'hint': d0, 'post': d1}


def read_rows(src, y0, y1, W):
    with tempfile.TemporaryDirectory(prefix='clean-map-') as tmp:
        p = os.path.join(tmp, 's.tif')
        subprocess.run([tool('gdal_translate'), '-q', '-of', 'GTiff', '-srcwin', '0', str(y0), str(W), str(y1 - y0), src, p], check=True)
        return np.asarray(Image.open(p).convert('RGB')).copy()


def put_cells(cells, mk, rx, ry):
    c = np.zeros((-(-mk.shape[0] // CELL) * CELL, -(-mk.shape[1] // CELL) * CELL), bool)
    c[:mk.shape[0], :mk.shape[1]] = mk
    cc = c.reshape(c.shape[0] // CELL, CELL, c.shape[1] // CELL, CELL).any((1, 3))
    cells[ry // CELL:ry // CELL + cc.shape[0], rx // CELL:rx // CELL + cc.shape[1]] = cc * 255


def remask(passport, data, src, out_tif):
    """--remask: маска пересчитана тем же разбиением окон, а заливка — нет: пиксели, что выпали из маски, берутся из
    исходника, остальные — из готового <out_tif>. Для правки маски, что только сужается (серая земля 30.10)."""
    W, H = passport['width'], passport['height']
    tmp = os.path.splitext(out_tif)[0] + '.remask.raw'
    buf = np.memmap(tmp, mode='w+', dtype=np.uint8, shape=(H, W, 3))
    cells = np.zeros((-(-H // CELL), -(-W // CELL)), np.uint8)
    restored = kept = 0
    t0 = time.time()
    for ry in range(0, H, CORE):
        sy0, sy1 = max(0, ry - MARGIN), min(H, ry + CORE + MARGIN)
        strip, done = read_rows(src, sy0, sy1, W), read_rows(out_tif, ry, min(ry + CORE, H), W)
        orig_core = strip[ry - sy0:ry - sy0 + done.shape[0]]
        out = done.copy()
        for rx in range(0, W, CORE):
            wx0, wx1 = max(0, rx - MARGIN), min(W, rx + CORE + MARGIN)
            mask = build_mask(strip[:, wx0:wx1], wx0, sy0, data)
            cx1 = min(rx + CORE, W)
            mk = mask[ry - sy0:ry - sy0 + done.shape[0], rx - wx0:cx1 - wx0]
            back = ~mk & (done[:, rx:cx1] != orig_core[:, rx:cx1]).any(2)
            out[:, rx:cx1][back] = orig_core[:, rx:cx1][back]
            restored += int(back.sum())
            kept += int(mk.sum())
            put_cells(cells, mk, rx, ry)
        buf[ry:ry + out.shape[0]] = out
        print(f'ряд {ry}: возвращено из исходника {restored}, в маске {kept}, {time.time() - t0:.0f} с', flush=True)
    buf.flush()
    del buf
    to_tiff(tmp, W, H, out_tif)
    os.remove(tmp)
    mp = os.path.join(ROOT, passport['tiles'].lstrip('/'), 'clean-mask.png')
    Image.fromarray(cells, 'L').save(mp, optimize=True)
    st = os.path.splitext(out_tif)[0] + '.stats.json'
    stats = json.load(open(st)) if os.path.exists(st) else {}
    stats.update(remask={'restored_px': restored, 'mask_px': kept, 'seconds': round(time.time() - t0)}, mask_px=kept, mask_share=round(kept / (W * H), 4))
    json.dump(stats, open(st, 'w'), ensure_ascii=False, indent=1)
    print(f'готово: {out_tif}, маска → {mp}; {json.dumps(stats["remask"])}')


def to_tiff(raw, w, h, out_tif):
    """Сырой RGB-буфер → TIFF (LZW, предиктор) через VRT поверх буфера."""
    vrt = raw + '.vrt'
    open(vrt, 'w').write(
        f'<VRTDataset rasterXSize="{w}" rasterYSize="{h}">' + ''.join(
            f'<VRTRasterBand dataType="Byte" band="{b + 1}" subClass="VRTRawRasterBand"><SourceFilename relativetoVRT="1">'
            f'{os.path.basename(raw)}</SourceFilename><ImageOffset>{b}</ImageOffset><PixelOffset>3</PixelOffset>'
            f'<LineOffset>{w * 3}</LineOffset></VRTRasterBand>' for b in range(3)) + '</VRTDataset>')
    part = out_tif + '.part.tif'
    subprocess.run([tool('gdal_translate'), '-q', '-co', 'COMPRESS=LZW', '-co', 'PREDICTOR=2', vrt, part], check=True)
    os.replace(part, out_tif)
    os.remove(vrt)


def main():
    args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and sys.argv[i - 1] not in ('--box', '--out', '--device', '--threads', '--from')]
    passport = json.load(open(args[0], encoding='utf-8'))
    src = os.path.join(ROOT, passport['source']['file'])
    W, H = passport['width'], passport['height']
    opt = lambda f: sys.argv[sys.argv.index(f) + 1] if f in sys.argv else None
    box = [int(v) for v in opt('--box').split(',')] if opt('--box') else [0, 0, W, H]
    out_tif = opt('--out') or os.path.splitext(src)[0] + '-clean.tif'
    full = box == [0, 0, W, H]
    data = Data(passport)
    if '--remask' in sys.argv:
        return remask(passport, data, src, out_tif)
    bx0, by0, bx1, by1 = box
    bw, bh = bx1 - bx0, by1 - by0
    work = os.path.splitext(out_tif)[0] + '.raw'
    progress = work + '.progress.json'
    cells_path = work + '.cells.png'
    # Продолжение прерванного прогона: --resume берёт ряд из <raw>.progress.json (пишется после каждого ряда),
    # --from Y — явно (для буфера без файла прогресса). Ряды выше — из буфера как есть; их клетки маски, если файла
    # клеток нет, пересчитываются маской без заливки.
    start = by0
    if '--resume' in sys.argv or opt('--from'):
        start = int(opt('--from')) if opt('--from') else json.load(open(progress))['next_row']
        buf = np.memmap(work, mode='r+', dtype=np.uint8, shape=(bh, bw, 3))
    else:
        buf = np.memmap(work, mode='w+', dtype=np.uint8, shape=(bh, bw, 3))
    cells = np.zeros((-(-H // CELL), -(-W // CELL)), np.uint8)
    t0 = time.time()
    stats = {'windows': 0, 'lama_windows': 0, 'mask_px': 0, 'hint': {}, 'post': {}}
    if start > by0 and os.path.exists(progress) and os.path.exists(cells_path) and not opt('--from'):
        stats = json.load(open(progress))['stats']
        cells = np.asarray(Image.open(cells_path)).copy()
    elif start > by0:
        stats['resumed_from'] = start
    rows = range(by0, by1, CORE)
    for ry in rows:
        sy0, sy1 = max(0, ry - MARGIN), min(H, ry + CORE + MARGIN)
        if ry < start and 'resumed_from' not in stats:
            continue
        strip = read_rows(src, sy0, sy1, W)
        if ry < start:
            # ряд уже залит: только клетки маски и её площадь
            for rx in range(bx0, bx1, CORE):
                wx0, wx1 = max(0, rx - MARGIN), min(W, rx + CORE + MARGIN)
                mask = build_mask(strip[:, wx0:wx1], wx0, sy0, data)
                cx1, cy1 = min(rx + CORE, bx1), min(ry + CORE, by1)
                mk = mask[ry - sy0:cy1 - sy0, rx - wx0:cx1 - wx0]
                stats['windows'] += 1
                stats['mask_px'] += int(mk.sum())
                stats['lama_windows'] += int(mk.any())
                if full:
                    put_cells(cells, mk, rx, ry)
            print(f'ряд {ry}: уже залит, маска пересчитана, {time.time() - t0:.0f} с', flush=True)
            continue
        # буфер: строки полосы, уже записанные (выше ry), берутся из буфера
        for rx in range(bx0, bx1, CORE):
            wx0, wx1 = max(0, rx - MARGIN), min(W, rx + CORE + MARGIN)
            orig = strip[:, wx0:wx1]
            img = orig.copy()
            done = np.zeros(orig.shape[:2], bool)
            # уже очищенное: всё выше ry (в пределах области) и левее rx в строках ядра
            ya, yb = max(sy0, by0), min(sy1, by1)
            xa, xb = max(wx0, bx0), min(wx1, bx1)
            if ry > by0:
                yy1 = min(ry, sy1)
                img[ya - sy0:yy1 - sy0, xa - wx0:xb - wx0] = buf[ya - by0:yy1 - by0, xa - bx0:xb - bx0]
                done[ya - sy0:yy1 - sy0, xa - wx0:xb - wx0] = True
            if rx > bx0:
                cy0, cy1 = ry, min(ry + CORE, by1)
                img[cy0 - sy0:cy1 - sy0, xa - wx0:rx - wx0] = buf[cy0 - by0:cy1 - by0, xa - bx0:rx - bx0]
                done[cy0 - sy0:cy1 - sy0, xa - wx0:rx - wx0] = True
            out, mask, info = clean(img, orig, wx0, sy0, data, done)
            cx1, cy1 = min(rx + CORE, bx1), min(ry + CORE, by1)
            core = (slice(ry - sy0, cy1 - sy0), slice(rx - wx0, cx1 - wx0))
            buf[ry - by0:cy1 - by0, rx - bx0:cx1 - bx0] = out[core]
            mk = mask[core]
            stats['windows'] += 1
            stats['mask_px'] += int(mk.sum())
            stats['lama_windows'] += int(mk.any())
            for k in ('hint', 'post'):
                for kk, v in info[k].items():
                    stats[k][kk] = stats[k].get(kk, 0) + v
            if full:
                put_cells(cells, mk, rx, ry)
        buf.flush()
        if full:
            Image.fromarray(cells, 'L').save(cells_path)
        json.dump({'next_row': ry + CORE, 'stats': stats}, open(progress, 'w'), ensure_ascii=False)
        print(f'ряд {ry}/{by1}: окон {stats["windows"]}, маска {stats["mask_px"] / max(1, (min(ry + CORE, by1) - by0) * bw):.3f}, '
              f'{time.time() - t0:.0f} с', flush=True)
    buf.flush()
    del buf
    to_tiff(work, bw, bh, out_tif)
    for f in (work, progress, cells_path):
        if os.path.exists(f):
            os.remove(f)
    if full:
        mp = os.path.join(ROOT, passport['tiles'].lstrip('/'), 'clean-mask.png')
        Image.fromarray(cells, 'L').save(mp, optimize=True)
        print(f'маска → {mp}')
    stats['seconds'] = round(time.time() - t0)
    stats['mask_share'] = round(stats['mask_px'] / (bw * bh), 4)
    json.dump(stats, open(os.path.splitext(out_tif)[0] + '.stats.json', 'w'), ensure_ascii=False, indent=1)
    print(f'готово: {out_tif}; {json.dumps(stats, ensure_ascii=False)}')


if __name__ == '__main__':
    main()
