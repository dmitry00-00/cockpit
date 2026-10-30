#!/usr/bin/env python3
# Подписи схемы карты (TASKS M16): державы и области, моря, природные области и места — именами, как на растре.
#
#   .venv/bin/python scripts/labels-from-gis.py content/maps/toril.json [--gis <gpkg>]
#
# Откуда что (ничего не выдумывается):
#   * области, державы, моря, леса, горы — полигоны Toril GIS (слой srf_*, с именем), приведённые к растру HandsomeRob
#     той же привязкой, что Подземье (scripts/underdark-from-gis.py: все места справочника на значке — опорные).
#     Точка подписи — самая глубокая точка полигона (дальше всего от края), а у природных — самая глубокая точка той же
#     местности схемы внутри полигона (лес GIS ∩ лес terrain.png): подпись леса стоит в лесу, моря — в воде, державы —
#     на суше. Нет пересечения — глубина самого полигона. r — радиус вписанного круга, по нему стол решает, влезает ли
#     подпись на экран;
#   * державы, которых нет полигоном в GIS (Evermeet, Durpar, Kozakura…), — подписи растра из карточек справочника
#     (content/maps/<id>-cards.json, label: середина подписи растра), только если в описании карточки — государство;
#   * места — content/maps/<id>-places.json (имя и класс GIS, точка — значок растра); поселения, найденные только
#     подписью растра (карточки, label), — без точки, в середине своей подписи.
# Пишет content/maps/<id>-labels.json: [имя, вид, x, y, r, ранг] в пикселях исходника. Нет GeoPackage — сказать и выйти.
import glob, importlib.util, json, math, os, re, subprocess, sys, tempfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ud = _load('underdark', 'underdark-from-gis.py')
gaz = ud.gaz

CODES = ['o', 'g', 'h', 'f', 'm', 's', 'd', 'i', 'u']  # как TERRAIN_CODES в src/map/terrain.ts
# Класс GIS → вид подписи и местность схемы, в которой подпись ищет глубину (None — суша целиком, 'o' — вода).
KINDS = {
    'Continent': ('continent', 'land'),
    'Macroregion': ('region', 'land'), 'Region': ('region', 'land'), 'Subregion': ('region', 'land'),
    'Water/Oceanic expanse': ('ocean', 'o'), 'Oceanic Expanse': ('ocean', 'o'),
    'Water/Coastal sea': ('sea', 'o'), 'Coastal Sea': ('sea', 'o'), 'Bay': ('sea', 'o'),
    'Lake': ('lake', 'o'), 'Island': ('island', 'land'),
    'Mountains': ('mountains', 'm'), 'Hills': ('hills', 'h'), 'Upland': ('hills', 'h'),
    'Temperate Forest': ('forest', 'f'), 'Boreal Forest': ('forest', 'f'), 'Tropical Forest': ('forest', 'f'),
    'Swamp': ('swamp', 's'), 'Marsh': ('swamp', 's'), 'Wetland': ('swamp', 's'),
    'Sand': ('desert', 'd'), 'Wastes': ('desert', 'd'), 'Glacier': ('ice', 'i'), 'Ice Sheet': ('ice', 'i'),
}
# Описание карточки — держава: государство, королевство, нация, империя и т. п. (тексты карточек — по-русски, L3).
STATE = re.compile(r'государств|королевств|наци[яи]|импери|стран[аы]|княжеств|баронств|герцогств|духеств|провинци|конфедераци|теократи|монархи|олигархи|плутократи|магократи|магиократи', re.I)
SETTLEMENT_CARD = {'settlement', 'Town', 'City', 'fortress', 'Fortification', 'ruins', 'Ruins', 'Village'}
DOT_KIND = {3: 'city', 4: 'town'}
MIN_R = 6  # px: вписанный круг меньше — подписи негде стоять (острова-точки, ручьи)
SAME_PX = 600  # px исходника: одно имя ближе — одна подпись (повторы растра и GIS)
WATER_REACH = 48  # px: кайма поиска воды вокруг озера и моря GIS — больше ошибки привязки (~35 px)
NATURE = {'forest', 'mountains', 'hills', 'swamp', 'desert', 'ice', 'lake'}


def deepest(rings_px, terrain, cell_t, want, size=None, reach=True, whole=False):
    """
    Самая глубокая точка области: растр полигона (even-odd по всем кольцам) ∩ местность want, расстояние до края —
    послойной эрозией. size — (ширина, высота) исходника: точка — только внутри карты (до 30.10 три океана — Eastern
    Sea, Southern и Western Ocean — вставали за её краем: их полигоны шире растра). Возвращает (x, y, r) в пикселях
    исходника; пусто — None.
    """
    xs = [v for r in rings_px for v in r[0::2]]
    ys = [v for r in rings_px for v in r[1::2]]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    reach = reach and want == 'o'
    if reach:
        # Озеро GIS лежит рядом с озером растра (ошибка привязки ~35 px): ищем воду и в кайме WATER_REACH вокруг.
        x0, y0, x1, y1 = x0 - WATER_REACH, y0 - WATER_REACH, x1 + WATER_REACH, y1 + WATER_REACH
    side = max(x1 - x0, y1 - y0)
    cell = max(4.0, side / 160)
    w, h = int((x1 - x0) / cell) + 3, int((y1 - y0) / cell) + 3
    im = Image.new('1', (w, h), 0)
    d = ImageDraw.Draw(im)
    for r in rings_px:
        pts = [((r[i] - x0) / cell + 1, (r[i + 1] - y0) / cell + 1) for i in range(0, len(r), 2)]
        if len(pts) >= 3:
            # even-odd: каждое кольцо переворачивает то, что под ним (дыры озёр, острова в них).
            ring = Image.new('1', (w, h), 0)
            ImageDraw.Draw(ring).polygon(pts, fill=1)
            im = Image.fromarray(np.asarray(im) ^ np.asarray(ring))
    poly = np.array(im, bool)
    gy, gx = np.mgrid[0:h, 0:w]
    if size:
        px, py = (gx - 1 + 0.5) * cell + x0, (gy - 1 + 0.5) * cell + y0
        poly &= (px >= 0) & (px < size[0]) & (py >= 0) & (py < size[1])
    if not poly.any():
        return None
    sx = np.clip(((gx - 1 + 0.5) * cell + x0) // cell_t, 0, terrain.shape[1] - 1).astype(int)
    sy = np.clip(((gy - 1 + 0.5) * cell + y0) // cell_t, 0, terrain.shape[0] - 1).astype(int)
    t = terrain[sy, sx]
    water = CODES.index('o')
    on = (t != water) if want == 'land' else (t == CODES.index(want))
    mask = poly & on
    if reach and mask.sum() < 0.1 * poly.sum():
        grown = poly.copy()
        for _ in range(int(math.ceil(WATER_REACH / cell))):
            p = np.pad(grown, 1)
            grown = grown | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
        if (grown & on).sum() >= 0.1 * poly.sum():
            mask = grown & on
    # Пересечение — меньше десятой полигона: GIS и растр здесь не сошлись, глубина — самого полигона.
    if whole or mask.sum() < 0.1 * poly.sum():
        mask = poly
    depth = np.zeros(mask.shape, np.int32)
    cur = mask.copy()
    k = 0
    while cur.any():
        k += 1
        depth[cur] = k
        p = np.pad(cur, 1)
        cur = cur & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    best = depth.max()
    cy, cx = np.nonzero(depth == best)
    # Среди равных — ближайшая к середине области: подпись не уезжает к краю плато.
    my, mx = np.nonzero(mask)
    i = int(np.argmin((cx - mx.mean()) ** 2 + (cy - my.mean()) ** 2))
    return ((cx[i] - 1 + 0.5) * cell + x0, (cy[i] - 1 + 0.5) * cell + y0, best * cell)


def land_of_schema(path, shape, cell):
    """Суша схемы на сетке местности (even-odd по кольцам land); нет схемы — None."""
    if not os.path.exists(path):
        return None
    h, w = shape
    out = np.zeros((h, w), bool)
    for r in json.load(open(path, encoding='utf-8'))['land']:
        xs, ys = np.asarray(r[0::2], float) / cell, np.asarray(r[1::2], float) / cell
        if len(xs) < 3:
            continue
        x0, y0 = max(0, int(xs.min())), max(0, int(ys.min()))
        x1, y1 = min(w, int(np.ceil(xs.max())) + 1), min(h, int(np.ceil(ys.max())) + 1)
        if x1 <= x0 or y1 <= y0:
            continue
        m = Image.new('1', (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(m).polygon(list(zip((xs - x0).tolist(), (ys - y0).tolist())), fill=1)
        out[y0:y1, x0:x1] ^= np.asarray(m, bool)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    passport = json.load(open(args[0] if args else os.path.join(ROOT, 'content/maps/toril.json'), encoding='utf-8'))
    pid = passport['id']
    gpkg = gaz.arg('--gis') or next(iter(sorted(glob.glob(os.path.join(ROOT, 'maps/gis/toril-gis-*/toril_gis_layers.gpkg')))), None)
    if not gpkg:
        print('labels: нет GeoPackage Toril GIS в maps/gis/ — подписи не собраны (geospatial-grimoire.com/worlds/toril/gis/download/)')
        return
    tp = os.path.join(ROOT, passport['tiles'].lstrip('/'), 'terrain.png')
    if not os.path.exists(tp):
        print(f'labels: нет сетки местности {tp} — сначала terrain-from-map.py')
        return
    terrain = (np.asarray(Image.open(tp), np.int32) + 12) // 25
    cell_t = passport['terrain']['cell']
    # Вода и суша — по схеме, если она собрана (scripts/schema-from-grids.py): с 30.10 её берег — по воде растра с
    # клеткой 4 px, и малые озёра в ней есть, а в сетке местности 8 px их нет (замер: 43 подписи из 79 озёр стояли на
    # суше схемы). Классы суши — по-прежнему сетка местности.
    schema_land = land_of_schema(os.path.join(ROOT, passport['tiles'].lstrip('/'), 'schema.json'), terrain.shape, cell_t)
    if schema_land is not None:
        water = CODES.index('o')
        terrain = np.where(schema_land, np.where(terrain == water, CODES.index('g'), terrain), water)
    places = json.load(open(os.path.join(ROOT, f'content/maps/{pid}-places.json'), encoding='utf-8'))['places']
    cards = json.load(open(os.path.join(ROOT, f'content/maps/{pid}-cards.json'), encoding='utf-8'))['places']

    ll = {p['uuid']: (p['lon'], p['lat']) for p in gaz.gis_points(gpkg)}
    ctl = [(ll[p['id']], (p['x'], p['y'])) for p in places if p['how'] == 'marker' and p['id'] in ll]
    warp = ud.Warp([c[0] for c in ctl], [c[1] for c in ctl])

    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'p.geojson')
        where = "layer_id like 'srf_%' and name_en is not null and feature_class in ({})".format(','.join(f"'{k}'" for k in KINDS))
        subprocess.run([gaz.tool('ogr2ogr'), '-f', 'GeoJSON', out, gpkg, 'core.polygons_v', '-where', where,
                        '-select', 'uuid,name_en,feature_class,feature_rank'], check=True, capture_output=True)
        feats = json.load(open(out, encoding='utf-8'))['features']

    # Одна область бывает несколькими записями GIS (лес кусками, Chult — Macroregion и Region): кольца — вместе,
    # подпись одна — в самом глубоком месте.
    groups = {}
    for f in feats:
        p = f['properties']
        name = (p.get('name_en') or '').strip()
        g = f.get('geometry')
        if not name or name.lower() == 'unnamed' or not g:
            continue
        kind, want = KINDS[p['feature_class']]
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        grp = groups.setdefault((name, kind), {'want': want, 'rings': [], 'rank': 9})
        grp['rings'] += [[v for lon, lat in ring for v in warp(lon, lat)] for poly in polys for ring in poly]
        if p.get('feature_rank') is not None:
            grp['rank'] = min(grp['rank'], p['feature_rank'])
    labels = []
    skipped = 0
    for (name, kind), grp in groups.items():
        at = deepest(grp['rings'], terrain, cell_t, grp['want'], (passport['width'], passport['height']))
        if (not at or at[2] < MIN_R) and grp['want'] == 'o':
            # Вода рядом есть, но узкая (озеро в пару клеток): подпись — в глубине полигона GIS, как до 30.10.
            at = deepest(grp['rings'], terrain, cell_t, grp['want'], (passport['width'], passport['height']), reach=False, whole=True)
        if not at or at[2] < MIN_R:
            skipped += 1
            continue
        labels.append([name, kind, round(at[0]), round(at[1]), round(at[2]), grp['rank']])

    names = {l[0] for l in labels}
    realms = 0
    for c in cards:
        what = (c.get('card') or {}).get('what', '')
        if c['kind'] in ('region', 'Region', 'Country', 'country') and c.get('label') and not c.get('approx') and c['name'] not in names and STATE.search(what):
            labels.append([c['name'], 'realm', round(c['x']), round(c['y']), 0, 9])
            names.add(c['name'])
            realms += 1
    on_map = set()
    for p in places:
        kind = DOT_KIND.get(p.get('rank'), 'site')
        if p['class'] == 'City':
            kind = 'city'
        labels.append([p['name'], kind, p['x'], p['y'], 0, p.get('rank', 9)])
        on_map.add(p['id'])
    only_label = 0
    for c in cards:
        if c['id'] in on_map or c['kind'] not in SETTLEMENT_CARD or c.get('approx') or not c.get('label'):
            continue
        labels.append([c['name'], 'label', round(c['x']), round(c['y']), 0, 9])
        only_label += 1
    # Одно имя — одна подпись: область вокруг моря (Lake of Steam, Moonsea) уступает воде, город-государство
    # (Waterdeep) — городу.
    water = {l[0] for l in labels if l[1] in ('ocean', 'sea', 'lake')}
    towns = {l[0] for l in labels if l[1] in ('city', 'town', 'site', 'label')}
    dropped = [l for l in labels if l[1] == 'region' and (l[0] in water or l[0] in towns)]
    labels = [l for l in labels if l not in dropped]
    # Повторы рядом (решение кокпита, замер 30.10: 17 имён дважды, 10 пар ближе 300 px): подпись поселения только
    # растром уступает любой другой записи того же имени ближе SAME_PX (Nor Takt — озеро, Firepeaks — горы) и своей
    # же копии (Konigheim, Tchinggult — две подписи растра); область уступает лесу или горам того же имени ближе
    # SAME_PX (Chondalwood, Smoking Mountains) — природная подпись стоит в своей местности.
    near = lambda a, b: math.hypot(a[2] - b[2], a[3] - b[3]) < SAME_PX
    twins = []
    for i, l in enumerate(labels):
        for j, m in enumerate(labels):
            if i == j or l[0] != m[0] or not near(l, m):
                continue
            if l[1] == 'label' and (m[1] != 'label' or j < i):
                twins.append(i)
                break
            if l[1] == 'region' and m[1] in NATURE:
                twins.append(i)
                break
    labels = [l for i, l in enumerate(labels) if i not in set(twins)]

    labels.sort(key=lambda l: (l[1], l[0]))
    path = os.path.join(ROOT, f'content/maps/{pid}-labels.json')
    json.dump({
        'map': pid,
        'source': 'Области, моря и природные области — полигоны Toril GIS (Geospatial Grimoire, geospatial-grimoire.com), приведённые к растру HandsomeRob привязкой по местам справочника; державы без полигона и подписи поселений — подписи растра из карточек справочника; места — content/maps/' + pid + '-places.json. scripts/labels-from-gis.py',
        'attribution': 'Toril GIS is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.',
        'note': '[имя, вид, x, y, r, ранг]: x, y — пиксели исходника; r — радиус вписанного круга области (0 — точка); ранг — feature_rank GIS (у мест — rank справочника), 9 — нет',
        'labels': labels,
    }, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    by = {}
    for l in labels:
        by[l[1]] = by.get(l[1], 0) + 1
    print(f'опорных {len(ctl)}; записей GIS {len(feats)}, областей {len(groups)}, без места под подпись {skipped}; держав из карточек {realms}; поселений подписью {only_label}; областей уступили имя воде или городу {len(dropped)}; повторов рядом снято {len(set(twins))}')
    print(', '.join(f'{k} {v}' for k, v in sorted(by.items())))
    print(f'{path}: {os.path.getsize(path) // 1024} КБ')


if __name__ == '__main__':
    main()
