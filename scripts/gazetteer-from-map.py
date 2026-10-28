# Справочник мест карты мира: имена и классы — из Toril GIS (Geospatial Grimoire), позиции — с нашего растра.
#
# Toril GIS снят в основном с карт второй редакции, растр HandsomeRob — с другой основы: взаимное расположение мест
# расходится на десятки пикселей (замер 27.10.2026: аффинная привязка по 23 опорным городам — в среднем 49 px, гладкая
# поправка — 42 px на месте, которого нет среди опорных). Поэтому координаты GIS только подсказывают, где искать, а
# позицию даёт сама карта: Apple Vision читает подписи (scripts/ocr-labels.swift), рядом с подписью ищется белый значок
# поселения, его центр — координата места в пикселях исходника, как у geo в сиде.
#
# Запуск (macOS: Vision, GDAL из Postgres.app или brew, numpy и Pillow в ./.venv):
#   .venv/bin/python scripts/gazetteer-from-map.py content/maps/toril.json --box 7400,1800,10800,5200
#   --gis   GeoPackage Toril GIS (по умолчанию maps/gis/toril-gis-*/toril_gis_layers.gpkg, не в git)
#   --out   content/maps/toril-places.json; --box — область в пикселях исходника (по умолчанию весь растр)
# Опорные точки — content/maps/<id>-control.json (имя → [x, y], отмечены руками по тайлам); найденные места
# уточняют привязку во втором проходе.
# Подписи и значки — из снимка maps/ocr/<id>-labels.json (scripts/map_ocr.py), если он есть; нет — прогон Vision здесь же.
import difflib, glob, json, math, os, re, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image
from map_ocr import crop, load as load_snapshot, markers

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GDAL_DIRS = ['/Applications/Postgres.app/Contents/Versions/latest/bin', '/opt/homebrew/bin', '/usr/local/bin']
BLOCK, OVERLAP = 1024, 128
# Классы GIS, у которых на растре значок; остальное (регионы, горы) — подпись без значка.
SETTLEMENT = {'City', 'Town', 'Village', 'Fortification', 'Ruins', 'Inn', 'Temple', 'Monastic Site', 'Mine', 'Camp', 'Farm', 'Tomb', 'Building'}
# Значки по эталонам (map_ocr.icons) — для мест без белого кружка: какие виды значка подходят классу GIS. Поселение
# бывает отмечено столицей, городом, крепостью (Candlekeep) или руинами (разрушенный город).
ICON_FOR = {
    'City': {'capital', 'city', 'keep', 'ruins'}, 'Town': {'capital', 'city', 'keep', 'ruins'}, 'Village': {'city', 'keep', 'ruins', 'temple'},
    'Fortification': {'keep', 'ruins'}, 'Ruins': {'ruins', 'keep', 'site'}, 'Inn': {'keep', 'site'}, 'Temple': {'temple'},
    'Monastic Site': {'temple', 'keep'}, 'Mine': {'mine'}, 'Camp': {'keep', 'site'}, 'Farm': {'keep', 'site'}, 'Tomb': {'site', 'keep', 'ruins'},
    'Building': {'site', 'keep'}, 'Mountain': {'peak'}, 'Volcano': {'peak'}, 'Water Source': {'well'}, 'Oasis': {'well'},
}
SIGMA = 150  # px: радиус гладкой поправки к аффинной привязке (подобран по проверке «без одной точки»)
SEARCH = 220  # px: дальше от подсказки GIS одноимённая подпись — другое место


def tool(name):
    found = shutil.which(name)
    if found:
        return found
    for d in GDAL_DIRS:
        if os.access(os.path.join(d, name), os.X_OK):
            return os.path.join(d, name)
    sys.exit(f'gazetteer: нет {name} (GDAL)')


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def norm(s):
    return re.sub(r"[^a-z]", '', (s or '').lower())


def gis_points(gpkg):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'p.geojson')
        subprocess.run([tool('ogr2ogr'), '-f', 'GeoJSON', out, gpkg, 'core.points_v', '-select',
                        'uuid,name_en,name_ru,feature_class,feature_rank,layer_id,descr_en,url_en'], check=True, capture_output=True)
        feats = json.load(open(out, encoding='utf-8'))['features']
    pts = []
    for f in feats:
        p = f['properties']
        if not p.get('name_en') or p.get('layer_id', '').startswith('udk_') or not f.get('geometry'):
            continue
        lon, lat = f['geometry']['coordinates'][0]
        pts.append({**p, 'lon': lon, 'lat': lat})
    return pts


class Warp:
    """lon/lat → пиксель растра: аффинная по опорным точкам + гауссова поправка, проходящая через них."""

    def __init__(self, ll, px):
        ll, px = np.asarray(ll, float), np.asarray(px, float)
        M = np.c_[ll, np.ones(len(ll))]
        self.coef = np.linalg.lstsq(M, px, rcond=None)[0]
        self.B = M @ self.coef
        K = np.exp(-(np.linalg.norm(self.B[:, None] - self.B[None], axis=2) / SIGMA) ** 2) + 1e-6 * np.eye(len(ll))
        self.W = np.linalg.solve(K, px - self.B)

    def __call__(self, lon, lat):
        q = np.array([lon, lat, 1.0]) @ self.coef
        return q + np.exp(-(np.linalg.norm(self.B - q, axis=1) / SIGMA) ** 2) @ self.W


def fuzzy_ok(toks, key):
    """
    Слова подписи похожи на имя (OCR прочёл иначе: «Doors of snajar», опечатка самого GIS «Tezilr» — на карте Teziir):
    отношение difflib по склеенным буквам, порог по длине — от 7 букв 0,85, 5–6 букв 0,9, короче — только точно.
    Прилипший к краю значок («oOrpher») отрезается до сравнения.
    """
    a, b = ''.join(toks), ''.join(key)
    if len(b) < 5:
        return False
    thr = 0.85 if len(b) >= 7 else 0.9
    variants = {a, a[1:], a[:-1], a[1:-1]}
    return max(difflib.SequenceMatcher(None, v, b).ratio() for v in variants if v) >= thr


def spans(lines, name, near=None):
    """
    Где стоит имя: края букв x0, x1, середина строки yc, высота h, окна значка win — в пикселях исходника по рамкам слов Vision. Имя совпадает словами целиком
    (буквы слова без значков по краям: «oLeilon», «Yartaro» — значок, прилипший к слову); extra — сколько ещё слов в
    строке: «Silverymoon» внутри «Silverymoon Pass» — тоже совпадение, но хуже.
    """
    key = [norm(w) for w in re.split(r"[\s-]+", name) if norm(w)]
    out = []
    for ln in lines:
        # Однобуквенное «слово» — значок, прочитанный буквой («Neverwinter o»), не часть подписи.
        ws = [w for w in ln.get('words', []) if len(norm(w['t'])) >= 2]
        toks = [norm(w['t']) for w in ws]
        for i in range(len(toks) - len(key) + 1):
            ok = True
            for j, k in enumerate(key):
                t = toks[i + j]
                # Значок поселения OCR читает буквой («o», «e») в начале или в конце слова.
                if not (t == k or (len(t) == len(k) + 1 and (t[1:] == k or t[:-1] == k))):
                    ok = False
                    break
            fuzzy = False
            if not ok and near is not None:
                # Нестрого — только рядом с подсказкой привязки (near = (x, y, радиус)): похожих имён по карте много.
                if math.dist((ln['x'] + ln['w'] / 2, ln['y'] + ln['h'] / 2), near[:2]) <= near[2] + ln['w'] and fuzzy_ok(toks[i:i + len(key)], key):
                    ok = fuzzy = True
            if ok:
                a, b = ws[i], ws[i + len(key) - 1]
                ta, tb = toks[i], toks[i + len(key) - 1]
                # Края: где кончаются буквы имени и где ждать значок. Прилипший значок — последний (первый) знак слова.
                # Прилип — лишняя буква («oLeilon») или небуквенный знак на краю слова («•Thundertree», «6Conyberry»).
                cwa, cwb = a['w'] / max(len(a['t']), 1), b['w'] / max(len(b['t']), 1)
                # Знак, который Vision оставил в строке, но не в слове («Gate®» → слово «Gate»), — тоже прилип.
                line = ln['t'].strip()
                # Через пробел («Waterdeep ®») — не прилип: значок снаружи рамки.
                glued_l = (ta != key[0] and ta[1:] == key[0]) or not a['t'][:1].isalpha() or (
                    i == 0 and not line[:1].isalpha() and line[1:2] != ' ')
                glued_r = ((tb != key[-1] and tb[:-1] == key[-1]) or not (b['t'][-1:].isalpha() or b['t'][-1:] in "'’")
                           or (i + len(key) == len(ws) and not (line[-1:].isalpha() or line[-1:] in "'’") and line[-2:-1] != ' '))
                x0, x1 = a['x'], b['x'] + b['w']
                yc = (a['y'] + a['h'] / 2 + b['y'] + b['h'] / 2) / 2
                out.append({
                    'x0': x0 + (cwa if glued_l else 0), 'x1': x1 - (cwb if glued_r else 0), 'yc': yc,
                    'h': max(a['h'], b['h'], 8), 'extra': len(ws) - len(key),
                    # Окна значка: прилип — на месте крайнего знака; нет — снаружи края, до 24 px (значок отдельным словом «o Thundertree»).
                    # Рамка слова Vision захватывает значок и тогда, когда в тексте его нет («Westbridge» с кружком
                    # внутри рамки), поэтому окно всегда заходит на крайний знак; внутри рамки годится только пятно
                    # размером со значок (inner), просветы букв меньше.
                    'win': [(x0 - 24, x0 + cwa + 3), (x1 - cwb - 3, x1 + 24)],
                    'inner': [(x0 - 1, x0 + cwa + 3), (x1 - cwb - 3, x1 + 1)],
                    'glued': (glued_l, glued_r),
                    # Где ждать центр значка: прилип — середина крайнего знака, нет — на 8 px снаружи края.
                    'target': (x0 + cwa / 2 if glued_l else x0 - 8, x1 - cwb / 2 if glued_r else x1 + 8),
                    **({'ocr': ' '.join(w['t'] for w in ws[i:i + len(key)])} if fuzzy else {}),
                })
    return out


def ocr_box(passport, tiles, box):
    """Без снимка: Vision и значки по блокам области, как в map_ocr.snapshot."""
    # Блоки 1024 с нахлёстом: подпись на границе целиком попадает хотя бы в один. Пачками по 40 — временные PNG не копятся.
    lines, marks = [], []
    step = BLOCK - OVERLAP
    blocks = [(bx, by) for by in range(box[1], box[3], step) for bx in range(box[0], box[2], step)]
    with tempfile.TemporaryDirectory(prefix='gazetteer-') as tmp:
        for i in range(0, len(blocks), 40):
            files = []
            for bx, by in blocks[i:i + 40]:
                im = crop(tiles, bx, by, min(bx + BLOCK, passport['width']), min(by + BLOCK, passport['height']))
                if np.asarray(im).max() == 0:
                    continue
                f = os.path.join(tmp, f'{bx}_{by}.png')
                im.save(f)
                files.append((f, bx, by))
                marks += [(bx + x, by + y, r, city) for x, y, r, city in markers(im)]
            if not files:
                continue
            res = subprocess.run(['swift', os.path.join(ROOT, 'scripts/ocr-labels.swift')] + [f for f, _, _ in files],
                                 check=True, capture_output=True, text=True).stdout
            offs = {f: (bx, by) for f, bx, by in files}
            for row in res.splitlines():
                r = json.loads(row)
                bx, by = offs[r['file']]
                lines += [{**ln, 'x': ln['x'] + bx, 'y': ln['y'] + by,
                           'words': [{**w, 'x': w['x'] + bx, 'y': w['y'] + by} for w in ln.get('words', [])]} for ln in r['lines']]
            for f, _, _ in files:
                os.remove(f)
            print(f'блоков {min(i + 40, len(blocks))}/{len(blocks)}', file=sys.stderr, flush=True)
    # Нахлёст даёт дубли значков — сливаем ближе 3 px.
    uniq = []
    for m in marks:
        if all(math.dist(m[:2], u[:2]) > 3 for u in uniq):
            uniq.append(m)
    return lines, uniq


def rest_of(passport, labels, places, M, R, CITY, icons, box):
    """
    Подписи снимка, которым не нашлось места в справочнике (TASKS V4): имя без пары в Toril GIS. Для каждой — значок у
    края (белый кружок: village или city; по эталону: его вид) и признаки для разметки: цвет, кегль, капитель,
    разрядка, класс местности под подписью. Класс решает ночная разметка (L1): правилами, остальное — локальная модель.
    """
    names = {norm(p['name']) for p in places}
    terrain = None
    tp = os.path.join(ROOT, passport['tiles'].lstrip('/'), 'terrain.png')
    if passport.get('terrain') and os.path.exists(tp):
        terrain = (np.asarray(Image.open(tp)), passport['terrain']['cell'])
    codes = 'oghfmsdiu'
    out = []
    for l in labels:
        cx, cy = l['x'] + l['w'] / 2, l['y'] + l.get('lh', l['h']) / 2
        if not (box[0] <= cx < box[2] and box[1] <= cy < box[3]):
            continue
        n = norm(l['t'])
        if len(n) < 3 or any(k and k in n for k in names if len(k) >= 4):
            continue
        lh, x0, x1 = l.get('lh', l['h']), l['x'], l['x'] + l['w']
        icon = None
        if not l.get('spaced') and lh <= 40:
            if len(M):
                ok = (np.abs(M[:, 1] - cy) < 0.9 * lh) & (((M[:, 0] > x0 - 24) & (M[:, 0] < x0 + 10)) | ((M[:, 0] > x1 - 10) & (M[:, 0] < x1 + 24)))
                if ok.any():
                    i = int(np.argmin(np.where(ok, np.minimum(abs(M[:, 0] - x0), abs(M[:, 0] - x1)), 1e9)))
                    icon = {'kind': 'city' if CITY[i] else 'village', 'x': round(M[i, 0]), 'y': round(M[i, 1])}
            if icon is None:
                near = [i for i in icons if x0 - 30 <= i['x'] <= x1 + 30 and abs(i['y'] - cy) <= 1.6 * lh]
                if near:
                    i = min(near, key=lambda i: min(abs(i['x'] - x0), abs(i['x'] - x1)) + abs(i['y'] - cy))
                    icon = {'kind': i['kind'], 'x': i['x'], 'y': i['y']}
        t = None
        if terrain:
            g, cell = terrain
            gx, gy = int(cx // cell), int(cy // cell)
            if 0 <= gy < g.shape[0] and 0 <= gx < g.shape[1]:
                t = codes[min(int(round(g[gy, gx] / 25)), len(codes) - 1)]
        out.append({k: v for k, v in {
            't': l['t'], 'rows': l.get('rows'), 'x': round(cx), 'y': round(cy), 'w': round(l['w']), 'lh': lh, 'ink': l.get('ink'),
            'caps': l.get('caps'), 'spread': l.get('spread'), 'spaced': l.get('spaced'), 'color': l.get('color'), 'c': l.get('c'),
            'icon': icon, 'terrain': t,
        }.items() if v is not None})
    return out


def main():
    passport = json.load(open(sys.argv[1], encoding='utf-8'))
    pid = passport['id']
    gpkg = arg('--gis') or next(iter(sorted(glob.glob(os.path.join(ROOT, 'maps/gis/toril-gis-*/toril_gis_layers.gpkg')))), None)
    if not gpkg:
        sys.exit('gazetteer: нет GeoPackage Toril GIS в maps/gis/ (geospatial-grimoire.com/worlds/toril/gis/download/)')
    box = [int(v) for v in (arg('--box') or f"0,0,{passport['width']},{passport['height']}").split(',')]
    out_path = arg('--out', os.path.join(ROOT, f'content/maps/{pid}-places.json'))
    control = json.load(open(os.path.join(ROOT, f'content/maps/{pid}-control.json'), encoding='utf-8'))['points']
    tiles = os.path.join(ROOT, passport['tiles'].lstrip('/'), str(passport['maxZoom']))

    pts = gis_points(gpkg)
    by_name = {}
    for p in pts:
        by_name.setdefault(p['name_en'], []).append(p)
    ctl = [(by_name[n][0], xy) for n, xy in control.items() if n in by_name and len(by_name[n]) == 1]
    warp = Warp([(p['lon'], p['lat']) for p, _ in ctl], [xy for _, xy in ctl])

    snap = load_snapshot(passport)
    if snap:
        # Снимок снят по всему растру; для --box — строки и значки внутри области.
        lines = [ln for ln in snap[0] if box[0] <= ln['x'] + ln['w'] / 2 < box[2] and box[1] <= ln['y'] + ln['h'] / 2 < box[3]]
        marks = [m for m in snap[1] if box[0] <= m[0] < box[2] and box[1] <= m[1] < box[3]]
        icons = [i for i in snap[2] if box[0] <= i['x'] < box[2] and box[1] <= i['y'] < box[3]]
    else:
        lines, marks = ocr_box(passport, tiles, box)
        icons = []
    IC = np.array([[i['x'], i['y']] for i in icons], float).reshape(-1, 2)
    IK = np.array([i['kind'] for i in icons])
    uniq = marks
    M = np.array([m[:2] for m in uniq]) if uniq else np.zeros((0, 2))
    R = np.array([m[2] for m in uniq]) if uniq else np.zeros(0)
    CITY = np.array([m[3] for m in uniq], bool) if uniq else np.zeros(0, bool)
    print(f'{len(lines)} строк OCR, {len(uniq)} значков', file=sys.stderr)

    def locate(p, w):
        pred = w(p['lon'], p['lat'])
        best = None
        found_spans = spans(lines, p['name_en'])
        fuzzy = not found_spans
        if fuzzy:
            found_spans = spans(lines, p['name_en'], near=(pred[0], pred[1], SEARCH))
        # Имя одно в GIS и одно на карте (длиннее пяти букв) — это оно, где бы ни было: так привязка дотягивается до
        # краёв, куда аффинная по Sword Coast не достаёт. Иначе — только рядом с подсказкой.
        unique = not fuzzy and len(by_name[p['name_en']]) == 1 and len(found_spans) == 1 and len(norm(p['name_en'])) > 5
        for sp in found_spans:
            x0, x1, yc, h, extra = sp['x0'], sp['x1'], sp['yc'], sp['h'], sp['extra']
            mid = ((x0 + x1) / 2, yc)
            if not unique and math.dist(mid, pred) > SEARCH + (x1 - x0):
                continue
            pos, how = None, 'label'
            if p['feature_class'] in SETTLEMENT and len(M):
                # Значок — у левого или правого края подписи, по высоте — в пределах строки. OCR часто читает его
                # буквой и включает в слово («Triboaro»), тогда центр значка — на 4–8 px внутри рамки; кружки букв
                # глубже в слове (o в «Longsaddle») — дальше от края, их отсекает ближайший к краю.
                best_d = None
                for (lo, hi), (ilo, ihi), glued, ex in zip(sp['win'], sp['inner'], sp['glued'], sp['target']):
                    inside = (M[:, 0] >= ilo) & (M[:, 0] <= ihi)
                    ok = (np.abs(M[:, 1] - yc) < h * 0.9) & (M[:, 0] >= lo) & (M[:, 0] <= hi) & (glued | ~inside | (R >= 3) | CITY)
                    if ok.any():
                        dist = np.abs(M[:, 0] - ex) + np.abs(M[:, 1] - yc)
                        i = int(np.argmin(np.where(ok, dist, 1e9)))
                        if best_d is None or dist[i] < best_d:
                            best_d, pos, how = dist[i], tuple(M[i]), 'marker'
            if pos is None and len(IC) and p['feature_class'] in ICON_FOR:
                # Нет белого кружка — значок по эталону того вида, что подходит классу: сбоку от подписи, под или над
                # ней (окно — как у поиска значков в map_ocr), ближайший к краю подписи.
                ok = (np.isin(IK, list(ICON_FOR[p['feature_class']])) & (IC[:, 0] >= x0 - 30) & (IC[:, 0] <= x1 + 30)
                      & (np.abs(IC[:, 1] - yc) <= 1.6 * h))
                if ok.any():
                    dist = np.minimum(np.hypot(IC[:, 0] - x0, IC[:, 1] - yc), np.hypot(IC[:, 0] - x1, IC[:, 1] - yc))
                    dist = np.minimum(dist, np.abs(IC[:, 1] - yc) + np.maximum(0, np.maximum(x0 - IC[:, 0], IC[:, 0] - x1)))
                    i = int(np.argmin(np.where(ok, dist, 1e9)))
                    pos, how = tuple(IC[i]), 'icon'
            if pos is None:
                pos = mid
            # Порядок доводов: подпись ровно этим именем (без лишних слов) → у поселения нашёлся значок → ближе к подсказке GIS.
            score = 1000 * min(extra, 1) + math.dist(pos, pred) - (300 if how in ('marker', 'icon') else 0)
            if best is None or score < best[0]:
                best = (score, pos, how, extra, sp.get('ocr'))
        return best, pred

    found = {}
    for rnd in (1, 2, 3):
        for p in pts:
            hit, pred = locate(p, warp)
            if hit and box[0] <= hit[1][0] < box[2] and box[1] <= hit[1][1] < box[3]:
                found[p['uuid']] = (p, hit, pred)
        # Следующий проход: найденные значками поселения — новые опорные точки, привязка точнее, ищем заново.
        if rnd < 3:
            # Опорными становятся только белые кружки: значок по эталону бывает соседским (город у подписи озера),
            # и неверная опорная точка уводит привязку целого края (так терялись Selatan и Akkaido).
            more = [(p, h[1]) for p, h, _ in found.values() if h[2] == 'marker' and not h[4] and len(by_name[p['name_en']]) == 1]
            seen = {p['uuid'] for p, _ in ctl}
            allc = ctl + [(p, xy) for p, xy in more if p['uuid'] not in seen]
            warp = Warp([(p['lon'], p['lat']) for p, _ in allc], [xy for _, xy in allc])
            found = {}

    places = []
    for p, (score, pos, how, _, ocr), pred in found.values():
        places.append({
            'id': p['uuid'], 'name': p['name_en'], **({'nameRu': p['name_ru']} if p.get('name_ru') else {}),
            'class': p['feature_class'], 'rank': p['feature_rank'], 'x': round(pos[0]), 'y': round(pos[1]),
            'how': how, 'shift': round(math.dist(pos, pred)),
            # Подпись прочитана не буква в букву (нестрогое сравнение) — что именно прочёл OCR.
            **({'ocr': ocr} if ocr else {}),
        })
    places.sort(key=lambda r: (r['rank'] or 9, r['name']))
    json.dump({
        'map': pid,
        'source': 'Toril GIS (Geospatial Grimoire, geospatial-grimoire.com) — имена и классы; позиции — подписи и значки растра HandsomeRob',
        'attribution': 'Toril GIS is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.',
        'box': box, 'places': places,
    }, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if snap:
        rest_path = os.path.join(ROOT, 'maps/ocr', f'{pid}-rest.json')
        rest = rest_of(passport, json.load(open(os.path.join(ROOT, 'maps/ocr', f'{pid}-labels.json'), encoding='utf-8'))['labels'],
                       places, M, R, CITY, icons, box)
        json.dump({'map': pid, 'note': 'подписи растра без места в справочнике: вход разметки (TASKS L1)', 'labels': rest},
                  open(rest_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(f'подписей без места: {len(rest)} (со значком {sum(1 for r in rest if r.get("icon"))}) → {rest_path}', file=sys.stderr)
    marker = sum(1 for r in places if r['how'] == 'marker')
    icon = sum(1 for r in places if r['how'] == 'icon')
    print(f'мест: {len(places)} (белым кружком {marker}, значком по эталону {icon}, по подписи {len(places) - marker - icon}) → {out_path}', file=sys.stderr)


if __name__ == '__main__':
    main()
