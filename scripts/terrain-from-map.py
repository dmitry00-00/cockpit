# Местность карты мира по цвету растра: класс на клетку 8×8 px исходника (уровень z4 пирамиды тайлов) — для похода
# по SRD («dense forests, deep swamps, steep mountains, ice-covered ground — difficult terrain», вдвое дольше).
#
# Запуск: .venv/bin/python scripts/terrain-from-map.py content/maps/toril.json [--optional]
#   --optional — для установки: нет тайлов, numpy или Pillow — сказать и выйти с 0.
#   Читает тайлы z4 из maps/tiles/<id>/4/, пишет maps/tiles/<id>/terrain.png (серый, значение = код класса × 25,
#   ширина и высота — как у уровня z4); сервер стола отдаёт его вместе с тайлами. Без тайлов — выходит с ошибкой.
#
# Классы — по ближайшему центру в признаках «сглаженный цвет + фактура». Центры сняты 27.10.2026 k-means по суше
# растра HandsomeRob (14 кластеров) и названы по совпадению с покровом Toril GIS (леса, горы, болота, пески, лёд,
# перенесённые на растр по 753 найденным поселениям) и глазами по тайлам Sword Coast. Toril GIS снят с другой
# основы и ложится с ошибкой ~30 px, поэтому классы — с растра, GIS только подсказал имена кластеров. Это
# центры одной карты: для другой (Planetos) их надо снимать заново.
import json, os, sys

OPTIONAL = '--optional' in sys.argv
try:
    import numpy as np
    from PIL import Image, ImageFilter
except ImportError as e:
    print(f'terrain: нет {e.name} (zsh setup-python.command ставит numpy и Pillow) — поход без карты местности, по галочке мастера')
    sys.exit(0 if OPTIONAL else 1)

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Коды: порядок — как TERRAIN_CODES в src/map/terrain.ts.
CODES = {'o': 0, 'g': 1, 'h': 2, 'f': 3, 'm': 4, 's': 5, 'd': 6, 'i': 7, 'u': 8}
# (R, G, B сглаженные, фактура × 1.5) → класс; «r» — серые линии рек и берегов, решается по соседям ниже.
CENTROIDS = [
    ([188.5, 184.1, 147.3, 27.2], 'h'),
    ([112.2, 118.4, 84.3, 28.9], 'f'),
    ([194.3, 198.1, 201.4, 43.9], 'i'),
    ([215.6, 201.1, 171.0, 14.1], 'd'),
    ([172.1, 172.3, 172.3, 0.1], 'u'),
    ([162.8, 156.8, 140.8, 79.0], 'm'),
    ([152.4, 161.6, 97.6, 10.6], 'g'),
    ([126.8, 144.6, 149.4, 23.6], 's'),
    ([193.1, 190.0, 149.9, 4.9], 'g'),
    ([169.3, 171.4, 171.8, 18.4], 'r'),
    ([216.3, 221.3, 221.0, 13.6], 'i'),
    ([160.2, 161.0, 123.7, 35.6], 'h'),
    ([124.0, 119.5, 98.1, 72.6], 'm'),
    ([84.7, 94.0, 56.4, 11.1], 'f'),
]
Z = 4


def box(mask, r):
    """Доля True в окне (2r+1)² — сумма по интегральному изображению."""
    m = np.pad(mask.astype(np.int32), r + 1)
    c = m.cumsum(0).cumsum(1)
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s[: mask.shape[0], : mask.shape[1]] / (k * k)


def main():
    passport = json.load(open([a for a in sys.argv[1:] if not a.startswith('--')][0], encoding='utf-8'))
    tiles = os.path.join(ROOT, passport['tiles'].lstrip('/'))
    k = 2 ** (passport['maxZoom'] - Z)
    W, H = -(-passport['width'] // k), -(-passport['height'] // k)
    img = Image.new('RGB', (W, H))
    zdir = os.path.join(tiles, str(Z))
    if not os.path.isdir(zdir):
        print(f'terrain: нет тайлов {zdir} — сначала scripts/tile-map.py')
        sys.exit(0 if OPTIONAL else 1)
    for f in os.listdir(zdir):
        if f.endswith('.webp'):
            x, y = map(int, f[:-5].split('_'))
            img.paste(Image.open(os.path.join(zdir, f)).convert('RGB'), (x * 256, y * 256))
    a = np.asarray(img).astype(float)
    water = (a[..., 2] > 140) & (a[..., 2] > a[..., 0] + 50) & (a[..., 2] > a[..., 1] + 15)
    sm = np.asarray(img.filter(ImageFilter.BoxBlur(2))).astype(float)
    lum = a.mean(2)
    mean = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.BoxBlur(2))).astype(float)
    sq = np.asarray(Image.fromarray(np.clip(lum ** 2 / 255, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(2))).astype(float) * 255
    feat = np.dstack([sm, np.sqrt(np.clip(sq - mean ** 2, 0, None))[..., None] * 1.5]).reshape(-1, 4)
    C = np.array([c for c, _ in CENTROIDS])
    names = np.array([n for _, n in CENTROIDS])
    lab = np.empty(len(feat), '<U1')
    for i in range(0, len(feat), 300000):
        lab[i:i + 300000] = names[np.argmin(((feat[i:i + 300000, None] - C[None]) ** 2).sum(2), 1)]
    lab = lab.reshape(H, W)
    lab[water] = 'o'
    # Тот же серо-бирюзовый цвет каймой идёт вдоль берегов и озёр: у воды болото — только сплошным пятном
    # (Mere of Dead Men на берегу), тонкая кайма — суша.
    near_water = box(water, 2) > 0
    solid = box(lab == 's', 3) > 0.45
    lab[(lab == 's') & near_water & ~solid] = 'g'
    # Серые линии — реки и береговые обводки, если рядом нет большой серой «не нанесённой» земли.
    unch = box(lab == 'u', 3) > 0.3
    lab[(lab == 'r') & unch] = 'u'
    lab[lab == 'r'] = 'g'
    # Подписи и значки дают крапины: класс клетки — большинство в окне 5×5 (воду не трогаем).
    codes = np.vectorize(CODES.get)(lab).astype(np.uint8)
    votes = np.stack([box(codes == c, 2) for c in range(len(CODES))])
    major = votes.argmax(0).astype(np.uint8)
    out = np.where(codes == 0, 0, np.where(major == 0, codes, major)).astype(np.uint8)
    path = os.path.join(tiles, 'terrain.png')
    Image.fromarray(out * 25, 'L').save(path, optimize=True)
    share = {c: round(float((out == v).mean()), 3) for c, v in CODES.items()}
    print(f'местность {W}×{H} (клетка {k} px) → {path}; доли: {share}')


if __name__ == '__main__':
    main()
