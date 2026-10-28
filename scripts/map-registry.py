# Реестр карты: всё, что должно быть на карте, и что с каждым стало на каждом шаге разметки. Нужен, чтобы видеть
# пропуски и их причины, а не только найденное: справочник мест показывает 863 найденных места, реестр — ещё и
# ~670 точек GIS, которые не нашлись, с причиной, и подписи растра, которых в GIS нет.
#
# Запуск (после map_ocr.py и gazetteer-from-map.py): .venv/bin/python scripts/map-registry.py content/maps/toril.json
#   Пишет maps/ocr/<id>-registry.json (не в git, записи с id) и maps/ocr/<id>-registry.md (сводка и списки пропусков).
#
# Записи:
#   point  — точка Toril GIS (поселения, места, ориентиры); id — uuid GIS;
#   area   — именованная область GIS (регион, лес, горы, озеро, болото…); позиция — подпись на растре;
#   raster — подпись растра без пары в GIS (кандидат в места M13), значок у неё — если найден;
#   icon   — значок растра без подписи рядом.
# Статусы точек и областей: placed (в справочнике), labeled (область нашла подпись), underdark (слой Подземья — на
# поверхности не рисуется), outside (вне растра), misread (рядом подпись, похожая на имя, — OCR прочёл иначе),
# far (подпись этим именем есть, но далеко от подсказки привязки), absent (рядом ничего похожего: на этой карте места нет
# или подпись не прочитана).
# Задачи разметки (tasks) — что с записью делает ночной прогон LLM: L1 класс подписи, L3 карточка (L2 — расстояния —
# идёт по предложениям вики, а не по записям реестра);
# итог задачи берётся из maps/llm/*.jsonl ({"id", "task", "status", …}), если прогон уже был.
import difflib, glob, importlib.util, json, math, os, subprocess, sys, tempfile
from collections import Counter, defaultdict
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from map_ocr import crop  # noqa: E402

_spec = importlib.util.spec_from_file_location('gazetteer', os.path.join(ROOT, 'scripts/gazetteer-from-map.py'))
gz = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gz)

FIELDS = 'uuid,name_en,name_ru,name_alt_en,feature_class,feature_rank,layer_id,dnd_editions,source,is_labeled,descr_en,url_en'
# Не места карты: служебные линии и пояса GIS.
SKIP_CLASS = {'Time Zone', 'Meridian', 'Parallel', 'Equator', 'Tropic Circle', 'Polar Circle', 'Prime Meridian'}
STATUS_RU = {
    'placed': 'в справочнике', 'labeled': 'подпись найдена', 'underdark': 'Подземье', 'outside': 'вне растра',
    'misread': 'подпись прочитана иначе', 'far': 'подпись далеко от подсказки', 'absent': 'на растре не найдено',
    'raster_only': 'только на растре', 'fragment': 'обрывок OCR', 'icon_only': 'значок без подписи',
}


def export(gpkg, table):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'x.geojson')
        subprocess.run([gz.tool('ogr2ogr'), '-f', 'GeoJSON', out, gpkg, table, '-select', FIELDS,
                        '-where', "name_en IS NOT NULL AND name_en <> '' AND name_en <> 'unnamed'"], check=True, capture_output=True)
        return json.load(open(out, encoding='utf-8'))['features']


def rings(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    return [np.asarray(p[0], float) for p in polys if p and len(p[0]) >= 3]


def area_shape(geom):
    """Центр самого большого кольца и рамка всех колец, lon/lat."""
    rs = rings(geom)
    if not rs:
        return None
    def ring_area(r):
        x, y = r[:, 0], r[:, 1]
        return abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))) / 2
    big = max(rs, key=ring_area)
    allp = np.vstack(rs)
    return big.mean(0), allp.min(0), allp.max(0)


def alt_names(p):
    raw = p.get('name_alt_en') or []
    if isinstance(raw, str):
        raw = raw.replace(';', ',').split(',')
    alts = [a.strip() for a in raw if isinstance(a, str) and a.strip()]
    return [p['name_en']] + [a for a in alts if a != p['name_en']]


def similar(name, text):
    """Похожесть имени на подпись: лучшее отношение difflib по группам из 1–3 соседних слов подписи (буквы без знаков)."""
    n = gz.norm(name)
    ws = [gz.norm(w) for w in text.split()]
    ws = [w for w in ws if w]
    best = 0.0
    for i in range(len(ws)):
        for k in (1, 2, 3):
            if i + k <= len(ws):
                best = max(best, difflib.SequenceMatcher(None, n, ''.join(ws[i:i + k])).ratio())
    return best


def main():
    passport = json.load(open([a for a in sys.argv[1:] if not a.startswith('--')][0], encoding='utf-8'))
    pid, W, H = passport['id'], passport['width'], passport['height']
    gpkg = next(iter(sorted(glob.glob(os.path.join(ROOT, 'maps/gis/toril-gis-*/toril_gis_layers.gpkg')))), None)
    if not gpkg:
        sys.exit('registry: нет Toril GIS в maps/gis/')
    snap = json.load(open(os.path.join(ROOT, 'maps/ocr', f'{pid}-labels.json'), encoding='utf-8'))
    places = json.load(open(os.path.join(ROOT, 'content/maps', f'{pid}-places.json'), encoding='utf-8'))['places']
    labels, lines, marks, icons = snap['labels'], snap['lines'], snap['marks'], snap.get('icons', [])
    tiles = os.path.join(ROOT, passport['tiles'].lstrip('/'), str(passport['maxZoom']))

    pts = export(gpkg, 'core.points_v')
    polys = export(gpkg, 'core.polygons_v')
    by_uuid = {f['properties']['uuid']: f for f in pts}
    name_count = Counter(f['properties']['name_en'] for f in pts)

    # Привязка — как в последнем проходе справочника: опорные точки руками и места на белых кружках с уникальным именем.
    control = json.load(open(os.path.join(ROOT, 'content/maps', f'{pid}-control.json'), encoding='utf-8'))['points']
    anchors = {}
    for f in pts:
        p = f['properties']
        if p['name_en'] in control and name_count[p['name_en']] == 1:
            anchors[p['uuid']] = (f['geometry']['coordinates'][0], control[p['name_en']])
    for pl in places:
        f = by_uuid.get(pl['id'])
        if f and pl['how'] == 'marker' and name_count[pl['name']] == 1 and pl['id'] not in anchors:
            anchors[pl['id']] = (f['geometry']['coordinates'][0], (pl['x'], pl['y']))
    warp = gz.Warp([a[0][:2] for a in anchors.values()], [a[1] for a in anchors.values()])

    def blank(x, y):
        if not (0 <= x < W and 0 <= y < H):
            return True
        return np.asarray(crop(tiles, int(x), int(y), int(x) + 1, int(y) + 1)).max() == 0

    grid = defaultdict(list)
    for i, l in enumerate(labels):
        grid[(int((l['x'] + l['w'] / 2) // 256), int((l['y'] + l['h'] / 2) // 256))].append(i)

    def labels_near(x, y, r):
        out = []
        for gx in range(int((x - r) // 256), int((x + r) // 256) + 1):
            for gy in range(int((y - r) // 256), int((y + r) // 256) + 1):
                for i in grid.get((gx, gy), []):
                    l = labels[i]
                    if math.dist((l['x'] + l['w'] / 2, l['y'] + l['h'] / 2), (x, y)) <= r:
                        out.append(i)
        return out

    placed = {pl['id']: pl for pl in places}
    used_labels = set()
    entries = []

    def why(names, pred, r, exact_far):
        """Причина пропуска: подпись похожа (misread) → подпись этим именем далеко (far) → ничего (absent)."""
        best = (0.0, None)
        for i in labels_near(pred[0], pred[1], r):
            s = max(similar(n, labels[i]['t']) for n in names)
            if s > best[0]:
                best = (s, i)
        if best[0] >= 0.75:
            l = labels[best[1]]
            return 'misread', {'ocr': l['t'], 'similar': round(best[0], 2), 'x': round(l['x'] + l['w'] / 2), 'y': round(l['y'] + l['h'] / 2)}
        if exact_far:
            return 'far', {'ocr_at': exact_far}
        return 'absent', {}

    # Точки GIS.
    for f in pts:
        p = f['properties']
        if p['feature_class'] in SKIP_CLASS:
            continue
        lon, lat = f['geometry']['coordinates'][0][:2]
        pred = warp(lon, lat)
        e = {'id': p['uuid'], 'kind': 'point', 'name': p['name_en'], 'nameRu': p.get('name_ru') or None, 'class': p['feature_class'],
             'layer': p['layer_id'], 'editions': p.get('dnd_editions'), 'gisLabeled': p.get('is_labeled'),
             'pred': [round(pred[0]), round(pred[1])]}
        alts = alt_names(p)
        if len(alts) > 1:
            e['alt'] = alts[1:]
        if p['uuid'] in placed:
            pl = placed[p['uuid']]
            e.update(status='placed', how=pl['how'], x=pl['x'], y=pl['y'])
        elif p['layer_id'].startswith('udk_'):
            e['status'] = 'underdark'
        elif blank(*pred):
            e['status'] = 'outside'
        else:
            far = None
            for sp in gz.spans(lines, p['name_en']):
                far = [round((sp['x0'] + sp['x1']) / 2), round(sp['yc'])]
                break
            st, extra = why(alts, pred, gz.SEARCH, far)
            e.update(status=st, **extra)
        entries.append(e)

    # Области GIS: позиция — подпись на растре рядом с центром (окно — по размеру области, не меньше SEARCH).
    for f in polys:
        p = f['properties']
        if p['feature_class'] in SKIP_CLASS or not f.get('geometry'):
            continue
        shape = area_shape(f['geometry'])
        if shape is None:
            continue
        c, lo, hi = shape
        pred = warp(*c)
        a, b = warp(lo[0], lo[1]), warp(hi[0], hi[1])
        r = max(gz.SEARCH, 0.6 * math.dist(a, b))
        e = {'id': p['uuid'], 'kind': 'area', 'name': p['name_en'], 'nameRu': p.get('name_ru') or None, 'class': p['feature_class'],
             'layer': p['layer_id'], 'editions': p.get('dnd_editions'), 'gisLabeled': p.get('is_labeled'),
             'pred': [round(pred[0]), round(pred[1])], 'span': round(math.dist(a, b))}
        alts = alt_names(p)
        if len(alts) > 1:
            e['alt'] = alts[1:]
        if p['layer_id'].startswith('udk_'):
            e['status'] = 'underdark'
            entries.append(e)
            continue
        hit = None
        for i in labels_near(pred[0], pred[1], r):
            l = labels[i]
            t = gz.norm(l['t'])
            exact = any(gz.norm(n) and gz.norm(n) in t for n in alts)
            # Имя вразрядку прочитано с пропусками букв («SEMBIF», «JIREN») — нестрого.
            loose = l.get('spaced') and max(similar(n, l['t']) for n in alts) >= 0.7
            if exact or loose:
                d = math.dist((l['x'] + l['w'] / 2, l['y'] + l['h'] / 2), pred)
                if hit is None or (exact, -d) > (hit[0], -hit[1]):
                    hit = (exact, d, i)
        if hit:
            l = labels[hit[2]]
            used_labels.add(hit[2])
            e.update(status='labeled', how='exact' if hit[0] else 'spaced', ocr=l['t'], x=round(l['x'] + l['w'] / 2), y=round(l['y'] + l['h'] / 2))
        elif all(blank(*q) for q in (pred, a, b)):
            e['status'] = 'outside'
        else:
            st, extra = why(alts, pred, r, None)
            e.update(status=st, **extra)
            if st == 'misread':
                used_labels.add(next(i for i in labels_near(pred[0], pred[1], r) if labels[i]['t'] == extra['ocr']))
        entries.append(e)

    # Подписи растра без пары: из maps/ocr/<id>-rest.json (справочник), минус подписи, отданные областям.
    rest_path = os.path.join(ROOT, 'maps/ocr', f'{pid}-rest.json')
    rest = json.load(open(rest_path, encoding='utf-8'))['labels'] if os.path.exists(rest_path) else []
    taken = {(round(labels[i]['x'] + labels[i]['w'] / 2), round(labels[i]['y'] + labels[i].get('lh', labels[i]['h']) / 2)) for i in used_labels}
    used_icons = set()
    for r_ in rest:
        if (r_['x'], r_['y']) in taken:
            continue
        n = gz.norm(r_['t'])
        frag = len(n) < 4 or (len(r_['t'].split()) == 1 and r_['t'][:1].islower())
        e = {'id': f"ocr:{r_['x']}_{r_['y']}", 'kind': 'raster', 'name': r_['t'], 'status': 'fragment' if frag else 'raster_only',
             'x': r_['x'], 'y': r_['y'], **{k: r_[k] for k in ('rows', 'lh', 'ink', 'caps', 'spread', 'spaced', 'color', 'icon', 'terrain') if k in r_}}
        if r_.get('icon'):
            used_icons.add((r_['icon']['x'], r_['icon']['y']))
        entries.append(e)

    # Значки без подписи: белые кружки и значки по эталонам, у которых нет ни места справочника, ни подписи.
    taken_pts = [(pl['x'], pl['y']) for pl in places] + list(used_icons)
    tg = defaultdict(list)
    for x, y in taken_pts:
        tg[(int(x // 16), int(y // 16))].append((x, y))

    def free(x, y):
        return not any(math.dist((x, y), q) <= 4 for gx in (-1, 0, 1) for gy in (-1, 0, 1) for q in tg.get((int(x // 16) + gx, int(y // 16) + gy), []))

    # Просвет буквы (o, e, a в подписи на белой обводке) детектор кружков принимает за значок: центр внутри рамки слова,
    # дальше буквы от её краёв, — это буква. Значок, прилипший к краю слова («Triboaro»), остаётся.
    wg = defaultdict(list)
    for ln in lines:
        for w in ln.get('words', []):
            cw = w['w'] / max(len(w['t']), 1)
            box = (w['x'] + cw, w['y'] - 1, w['x'] + w['w'] - cw, w['y'] + w['h'] + 1)
            if box[2] > box[0]:
                wg[(int(w['x'] // 128), int(w['y'] // 128))].append(box)

    def in_word(x, y):
        return any(b[0] <= x <= b[2] and b[1] <= y <= b[3]
                   for gx in (-1, 0, 1) for gy in (-1, 0, 1) for b in wg.get((int(x // 128) + gx, int(y // 128) + gy), []))

    for m in marks:
        if free(m[0], m[1]) and not in_word(m[0], m[1]):
            entries.append({'id': f'icon:{round(m[0])}_{round(m[1])}', 'kind': 'icon', 'name': '', 'status': 'icon_only',
                            'icon': 'city' if m[3] else 'village', 'x': round(m[0]), 'y': round(m[1])})
    for ic in icons:
        if free(ic['x'], ic['y']):
            entries.append({'id': f"icon:{ic['x']}_{ic['y']}", 'kind': 'icon', 'name': '', 'status': 'icon_only',
                            'icon': ic['kind'], 'x': ic['x'], 'y': ic['y']})

    # Задачи разметки и их итог из maps/llm/*.jsonl.
    done = defaultdict(dict)
    for fpath in glob.glob(os.path.join(ROOT, 'maps/llm', '*.jsonl')):
        for row in open(fpath, encoding='utf-8'):
            try:
                r_ = json.loads(row)
            except ValueError:
                continue
            if r_.get('id') and r_.get('task'):
                done[r_['id']][r_['task']] = r_.get('status', 'done')
    # L3 — и местам со статьёй вики (28.10): то же правило, что у ночного прогона (llm-markup.wants_l3).
    _mk = importlib.util.spec_from_file_location('llm_markup', os.path.join(ROOT, 'scripts/llm-markup.py'))
    mk = importlib.util.module_from_spec(_mk)
    _mk.loader.exec_module(mk)
    wiki = mk.load_wiki(next(iter(sorted(glob.glob('/Volumes/внешний/datasets/fr-wiki-*/fr-wiki-places.jsonl'), reverse=True)), None))
    for e in entries:
        tasks = []
        if e['status'] == 'raster_only':
            tasks.append('L1')
        if e['status'] in ('placed', 'labeled') or mk.wants_l3({'name': e['name'], 'alt': e.get('alt', [])}, wiki, entries):
            tasks.append('L3')
        if tasks:
            e['tasks'] = {t: done[e['id']].get(t, 'todo') for t in tasks}
        for k in [k for k, v in e.items() if v is None]:
            del e[k]

    out = os.path.join(ROOT, 'maps/ocr', f'{pid}-registry.json')
    json.dump({'map': pid, 'anchors': len(anchors), 'entries': entries}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    report(pid, entries, os.path.join(ROOT, 'maps/ocr', f'{pid}-registry.md'))
    c = Counter((e['kind'], e['status']) for e in entries)
    print(f'реестр: {len(entries)} записей → {out}', file=sys.stderr)
    for (k, s), n in sorted(c.items()):
        print(f'  {k:6} {STATUS_RU[s]:28} {n}', file=sys.stderr)


def report(pid, entries, path):
    """Сводка для чтения глазами: таблица статусов по видам и классам, списки пропусков с причиной."""
    L = [f'# Реестр карты {pid}', '', 'Собран scripts/map-registry.py из Toril GIS, снимка подписей (maps/ocr) и справочника мест. '
         'Перегенерируется; руками не править.', '']
    for kind, title in (('point', 'Точки GIS'), ('area', 'Области GIS')):
        es = [e for e in entries if e['kind'] == kind]
        sts = [s for s in STATUS_RU if any(e['status'] == s for e in es)]
        L += [f'## {title}: {len(es)}', '', '| класс | всего | ' + ' | '.join(STATUS_RU[s] for s in sts) + ' |',
              '|---|---|' + '---|' * len(sts)]
        by = defaultdict(Counter)
        for e in es:
            by[e['class']][e['status']] += 1
        for cls, cnt in sorted(by.items(), key=lambda kv: -sum(kv[1].values())):
            L.append(f'| {cls} | {sum(cnt.values())} | ' + ' | '.join(str(cnt.get(s, '')) for s in sts) + ' |')
        L.append('')
    for st in ('misread', 'far', 'absent'):
        es = [e for e in entries if e['status'] == st and e['kind'] in ('point', 'area')]
        if not es:
            continue
        L += [f'## {STATUS_RU[st]}: {len(es)}', '']
        for e in sorted(es, key=lambda e: (e['class'], e['name'])):
            extra = f" — OCR «{e['ocr']}» ({e['similar']})" if st == 'misread' else (f" — подпись у {e['ocr_at']}" if st == 'far' else '')
            L.append(f"- {e['name']} ({e['class']}, {e['kind']}, подсказка {e['pred']}){extra}")
        L.append('')
    es = [e for e in entries if e['kind'] == 'raster']
    L += [f'## Только на растре: {len(es)}', '', '| значок | подписей |', '|---|---|']
    for k, n in Counter((e.get('icon') or {}).get('kind', '—') for e in es if e['status'] == 'raster_only').most_common():
        L.append(f'| {k} | {n} |')
    L += ['', f"Обрывков OCR: {sum(1 for e in es if e['status'] == 'fragment')}.", '']
    es = [e for e in entries if e['kind'] == 'icon']
    L += [f'## Значки без подписи: {len(es)}', '', ', '.join(f'{k} {n}' for k, n in Counter(e['icon'] for e in es).most_common()), '']
    tasks = Counter((t, s) for e in entries for t, s in e.get('tasks', {}).items())
    L += ['## Задачи разметки', '', '| задача | ' + ' | '.join(sorted({s for _, s in tasks})) + ' |', '|---|' + '---|' * len({s for _, s in tasks})]
    for t in sorted({t for t, _ in tasks}):
        L.append(f'| {t} | ' + ' | '.join(str(tasks.get((t, s), '')) for s in sorted({s for _, s in tasks})) + ' |')
    open(path, 'w', encoding='utf-8').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main()
