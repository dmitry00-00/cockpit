# Границы держав по цвету растра (TASKS M16): бордовый штрих-пунктир HandsomeRob → maps/tiles/<id>/borders.png.
#
# На растре граница — бордовый штрих-пунктир в 2–3 px со светлой каймой (штрих, светлая точка, бордовая точка, светлая
# точка). Тем же бордовым написаны подписи держав и долин (CORMYR, EVERMEET, Mistledale, High Dale) — цвет их не
# отличает, отличает форма: у букв тёмная сердцевина штриха (ink [55, 5, 8] OCR), у штриха границы её почти нет.
#
# Маска — как у дорог (roads-from-map.py), своим цветом: бордовый светлый (красный выше зелёного на 70 и синего на 60,
# зелёный < 110) или тёмный (красный 35…85, выше зелёного и синего на 35). Клетка 4 × 4 px исходника — граница, если в
# ней два и больше пикселей маски. Подписи: клетка «у букв» — её пиксели маски почти все в 3 px от тёмной сердцевины;
# куски таких клеток (связность через клетку, как у дорог) снимаются, кроме тех, что сами линия — тонкие (клеток на
# клетку длины ≤ TEXT_LINE_THICK) и длиной от TEXT_LINE_MIN клеток: местами граница целиком тёмная (под Watchwall у
# Glarondar, на перевалах), и без исключения рвалась бы на десятки клеток. Потом перемычки через разрывы пунктира —
# bridge() дорог, и снятие обрывков: кусок меньше MIN_CELLS или толстый (подпись, что не сняло правило сердцевины).
#
# Запуск: .venv/bin/python scripts/borders-from-map.py content/maps/toril.json [--optional] [--out <файл>]
#   Читает тайлы maxZoom, пишет maps/tiles/<id>/borders.png (серый, 255 — граница); линии из неё собирает
#   schema-from-grids.py (поле borders схемы). --optional — для установки: нет тайлов, numpy или Pillow — сказать и
#   выйти с 0.
import importlib.util
import json
import os
import sys
from pathlib import Path

OPTIONAL = '--optional' in sys.argv
try:
    import numpy as np
    from PIL import Image
except ImportError as e:
    print(f'borders: нет {e.name} (zsh setup-python.command ставит numpy и Pillow) — схема без границ')
    sys.exit(0 if OPTIONAL else 1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 4
CORE_NEAR = 3          # px: бордовое в стольких пикселях от тёмной сердцевины — буква
TEXT_LINE_THICK = 1.8  # клеток на клетку длины: тоньше — линия (тёмный участок границы), толще — подпись
TEXT_LINE_MIN = 8      # клеток длины: короче — буква или слово, даже если тонкое
MIN_CELLS = 12         # кусок короче (48 px, ~18 миль) — обрывок: буква, значок, кайма
THICK = 2.6            # кусок толще (клеток на клетку длины) и короче THICK_MAX — подпись
THICK_MAX = 80


def load(name, file):
    """Соседний скрипт как модуль: имя с дефисом не импортируется, а -I не кладёт scripts/ в путь."""
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


roads = load('roads_from_map', 'roads-from-map.py')     # components, bridge — связность через клетку и перемычки
grids = load('schema_from_grids', 'schema-from-grids.py')  # strips, box_sum


def border_masks(a):
    """Бордовое растра и тёмная сердцевина букв того же цвета — две маски пикселей полосы RGB."""
    r, g, b = (a[..., i].astype(np.int16) for i in range(3))
    bright = (r - g > 70) & (r - b > 60) & (r >= 85) & (g < 110)
    dark = (r < 85) & (r >= 35) & (r - g >= 35) & (r - b >= 35)
    return bright | dark, dark


def piece_shape(ys, xs, inv):
    """По кускам (inv — номер куска клетки): число клеток, длина по главной оси и толщина (клеток на клетку длины)."""
    size = np.bincount(inv)
    length = np.ones(len(size))
    order = np.argsort(inv, kind='stable')
    starts = np.r_[0, np.cumsum(size)]
    for k in range(len(size)):
        sel = order[starts[k]:starts[k + 1]]
        if len(sel) < 3:
            length[k] = len(sel)
            continue
        P = np.c_[ys[sel], xs[sel]].astype(float)
        c = P - P.mean(0)
        ax = np.linalg.eigh(np.cov(c.T))[1][:, -1]
        proj = c @ ax
        length[k] = proj.max() - proj.min() + 1
    return size, length, size / length


def pieces(m):
    ys, xs, _, roots = roads.components(m)
    if not len(ys):
        return ys, xs, np.zeros(0, np.int64)
    return ys, xs, np.unique(roots, return_inverse=True)[1]


def drop_text(grid, text):
    """Клетки у букв (text) кусками; кусок, что не линия, — прочь из grid. Возвращает (grid, снято клеток, кусков)."""
    ys, xs, inv = pieces(text)
    if not len(ys):
        return grid, 0, 0
    size, length, thick = piece_shape(ys, xs, inv)
    line = (thick <= TEXT_LINE_THICK) & (length >= TEXT_LINE_MIN)
    kill = ~line[inv]
    grid = grid.copy()
    grid[ys[kill], xs[kill]] = False
    return grid, int(kill.sum()), int((~line).sum())


def drop_noise(grid):
    """Обрывки (меньше MIN_CELLS) и толстые короткие куски (подписи) — прочь. Возвращает (grid, снято клеток)."""
    ys, xs, inv = pieces(grid)
    if not len(ys):
        return grid, 0
    size, length, thick = piece_shape(ys, xs, inv)
    bad = (size < MIN_CELLS) | ((thick > THICK) & (length < THICK_MAX))
    kill = bad[inv]
    grid = grid.copy()
    grid[ys[kill], xs[kill]] = False
    return grid, int(kill.sum())


def main():
    args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and sys.argv[i - 1] != '--out']
    passport = json.load(open(args[0] if args else os.path.join(ROOT, 'content/maps/toril.json'), encoding='utf-8'))
    tiles = os.path.join(ROOT, passport['tiles'].lstrip('/'))
    z = passport['maxZoom']
    zdir = os.path.join(tiles, str(z))
    if not os.path.isdir(zdir):
        print(f'borders: нет тайлов {zdir} — сначала scripts/tile-map.py')
        sys.exit(0 if OPTIONAL else 1)
    W, H, T = passport['width'], passport['height'], passport['tileSize']
    cw, ch = -(-W // CELL), -(-H // CELL)
    grid = np.zeros((ch, cw), bool)
    text = np.zeros((ch, cw), bool)
    pad = CORE_NEAR + 1
    for y, a, top in grids.strips(Path(zdir), T, W, H, pad):
        m, dark = border_masks(a)
        near = grids.box_sum(dark, CORE_NEAR) > 0
        n = min(T, H - y)

        def cells(mask):
            mm = np.zeros((-(-n // CELL) * CELL, cw * CELL), bool)
            mm[:n, :W] = mask[top:top + n]
            return mm.reshape(mm.shape[0] // CELL, CELL, cw, CELL).sum((1, 3))
        on, inked = cells(m), cells(m & near)
        r0 = y // CELL
        k = min(on.shape[0], ch - r0)
        grid[r0:r0 + k] |= (on >= 2)[:k]
        # Клетка у букв: бордовых пикселей не у сердцевины — меньше двух (иначе в ней есть штрих границы).
        text[r0:r0 + k] |= ((on >= 2) & (on - inked < 2))[:k]
    raw = int(grid.sum())
    grid, text_cells, text_pieces = drop_text(grid, text)
    grid, bridges = roads.bridge(grid)
    grid, noise = drop_noise(grid)
    out = np.where(grid, 255, 0).astype(np.uint8)
    path = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--out' and i + 1 < len(sys.argv)), os.path.join(tiles, 'borders.png'))
    Image.fromarray(out, 'L').save(path, optimize=True)
    print(f'границы {cw}×{ch} (клетка {CELL} px): бордовых клеток {raw}, у букв снято {text_cells} ({text_pieces} кусков), '
          f'перемычек {bridges}, обрывков снято {noise}, осталось {int(grid.sum())} → {path} ({os.path.getsize(path) // 1024} КБ)')


if __name__ == '__main__':
    main()
