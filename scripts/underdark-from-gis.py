# Подземье карты мира (ROADMAP 6.3): полигоны Подземья Toril GIS (владения Northdark, Old Shanatar…, бездны, сети
# пещер, Araumycos) — в пиксели растра HandsomeRob. Поход «под землёй» идёт регионом A5E Underland Realm, а эти полигоны
# подсказывают мастеру, под какими владениями лежит путь. На растре Подземья нет — только GIS.
#
# Привязка — как у справочника мест (scripts/gazetteer-from-map.py): аффинная по опорным плюс гладкая поправка. Опорные
# здесь — все места справочника, найденные белым кружком (content/maps/<id>-places.json, ~750), поправка сглаженная:
# точно через каждую опорную она раскачивается (замер «без одной точки» 29.10.2026: радиус 150 px без сглаживания —
# медиана 72 px, p90 317; радиус 900 px со сглаживанием 0,02 — медиана 35, p90 93). Владения Подземья — сотни пикселей,
# для подсказки этого хватает; дороги так не ложатся (scripts/roads-from-map.py — по растру).
#
# Запуск (GDAL из Postgres.app или brew, numpy в ./.venv):
#   .venv/bin/python scripts/underdark-from-gis.py content/maps/toril.json
#   --gis — GeoPackage Toril GIS (по умолчанию maps/gis/toril-gis-*/toril_gis_layers.gpkg, не в git)
#   пишет content/maps/<id>-underdark.json: имя, класс GIS и внешние кольца [x0, y0, x1, y1, …] в пикселях исходника.
import glob, importlib.util, json, math, os, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
_spec = importlib.util.spec_from_file_location('gazetteer', os.path.join(ROOT, 'scripts/gazetteer-from-map.py'))
gaz = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gaz)

# Владения, формы (бездны, сети пещер), покров (Araumycos) и именные области Подземья.
LAYERS = ('udk_nat_domains_pg', 'udk_nat_landforms_pg', 'udk_nat_underground_cover_pg', 'udk_con_named_regions_pg')
SIGMA, SMOOTH = 900, 0.02
SIMPLIFY = 3  # px: Дуглас — Пекер; ошибка привязки на порядок больше


class Warp:
    """lon/lat → пиксель растра: аффинная по опорным + сглаженная гауссова поправка."""

    def __init__(self, ll, px):
        ll, px = np.asarray(ll, float), np.asarray(px, float)
        M = np.c_[ll, np.ones(len(ll))]
        self.coef = np.linalg.lstsq(M, px, rcond=None)[0]
        self.B = M @ self.coef
        K = np.exp(-(np.linalg.norm(self.B[:, None] - self.B[None], axis=2) / SIGMA) ** 2) + SMOOTH * np.eye(len(ll))
        self.W = np.linalg.solve(K, px - self.B)

    def __call__(self, lon, lat):
        q = np.array([lon, lat, 1.0]) @ self.coef
        return q + np.exp(-(np.linalg.norm(self.B - q, axis=1) / SIGMA) ** 2) @ self.W


def simplify(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    n = math.dist(a, b)
    d = [abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / n if n else math.dist(p, a) for p in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] <= eps:
        return [pts[0], pts[-1]]
    return simplify(pts[:i + 1], eps)[:-1] + simplify(pts[i:], eps)


def main():
    passport = json.load(open(sys.argv[1], encoding='utf-8'))
    pid = passport['id']
    gpkg = gaz.arg('--gis') or next(iter(sorted(glob.glob(os.path.join(ROOT, 'maps/gis/toril-gis-*/toril_gis_layers.gpkg')))), None)
    if not gpkg:
        sys.exit('underdark: нет GeoPackage Toril GIS в maps/gis/ (geospatial-grimoire.com/worlds/toril/gis/download/)')
    places = json.load(open(os.path.join(ROOT, f'content/maps/{pid}-places.json'), encoding='utf-8'))['places']
    ll = {p['uuid']: (p['lon'], p['lat']) for p in gaz.gis_points(gpkg)}
    ctl = [(ll[p['id']], (p['x'], p['y'])) for p in places if p['how'] == 'marker' and p['id'] in ll]
    warp = Warp([c[0] for c in ctl], [c[1] for c in ctl])

    rng = np.random.default_rng(0)
    errs = []
    for k in rng.choice(len(ctl), size=min(60, len(ctl)), replace=False):
        rest = ctl[:k] + ctl[k + 1:]
        errs.append(math.dist(Warp([c[0] for c in rest], [c[1] for c in rest])(*ctl[k][0]), ctl[k][1]))
    errs.sort()
    med, p90 = round(errs[len(errs) // 2]), round(errs[int(len(errs) * 0.9)])

    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'u.geojson')
        where = 'layer_id in ({})'.format(','.join(f"'{x}'" for x in LAYERS))
        subprocess.run([gaz.tool('ogr2ogr'), '-f', 'GeoJSON', out, gpkg, 'core.polygons_v', '-where', where,
                        '-select', 'uuid,name_en,feature_class,layer_id'], check=True, capture_output=True)
        feats = json.load(open(out, encoding='utf-8'))['features']
    regions = []
    for f in feats:
        p = f['properties']
        # «Underdark» целиком (Macroregion) — под всем Фаэруном, подсказкой не служит.
        if not p.get('name_en') or p['name_en'] == 'unnamed' or p['feature_class'] == 'Macroregion' or not f.get('geometry'):
            continue
        rings = []
        for poly in f['geometry']['coordinates']:
            ring = simplify([tuple(warp(lon, lat)) for lon, lat in poly[0]], SIMPLIFY)
            if len(ring) >= 3:
                rings.append([v for q in ring for v in (round(q[0]), round(q[1]))])
        if rings:
            regions.append({'id': p['uuid'], 'name': p['name_en'], 'class': p['feature_class'], 'rings': rings})
    regions.sort(key=lambda r: r['name'])

    path = os.path.join(ROOT, f'content/maps/{pid}-underdark.json')
    json.dump({
        'map': pid,
        'source': 'Toril GIS (Geospatial Grimoire, geospatial-grimoire.com): слои Подземья; в пиксели растра HandsomeRob — привязкой по местам справочника',
        'attribution': 'Toril GIS is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.',
        'error': f'привязка «без одной точки» по 60 местам: медиана {med} px, p90 {p90} px исходника',
        'regions': regions,
    }, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'опорных {len(ctl)}; без одной точки: медиана {med} px, p90 {p90} px', file=sys.stderr)
    print(f'Подземье: {len(regions)} областей → {path} ({os.path.getsize(path) // 1024} КБ)', file=sys.stderr)


if __name__ == '__main__':
    main()
