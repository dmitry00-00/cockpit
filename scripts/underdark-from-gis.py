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
import glob, importlib.util, json, math, os, sqlite3, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
_spec = importlib.util.spec_from_file_location('gazetteer', os.path.join(ROOT, 'scripts/gazetteer-from-map.py'))
gaz = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gaz)

# Владения, формы, озёра, покров и именованные области Подземья.
LAYERS = ('udk_nat_domains_pg', 'udk_nat_landforms_pg', 'udk_nat_lakes_pg', 'udk_nat_underground_cover_pg', 'udk_con_named_regions_pg')
SIGMA, SMOOTH = 900, 0.02
SIMPLIFY = 3  # px: Дуглас — Пекер; ошибка привязки на порядок больше

LEVELS = [
    {'id': 'Upperdark', 'nameRu': 'Верхнее Подземье', 'order': 1, 'minDepthMiles': 0, 'maxDepthMiles': 3, 'sourceTitle': 'Underdark (3e)', 'sourcePages': '117'},
    {'id': 'Middledark', 'nameRu': 'Среднее Подземье', 'order': 2, 'minDepthMiles': 3, 'maxDepthMiles': 10, 'sourceTitle': 'Underdark (3e)', 'sourcePages': '118'},
    {'id': 'Lowerdark', 'nameRu': 'Нижнее Подземье', 'order': 3, 'minDepthMiles': 10, 'maxDepthMiles': None, 'sourceTitle': 'Underdark (3e)', 'sourcePages': '120'},
]

# Relations are text-confirmed, but the source material does not provide a line geometry
# for the world map. Never turn these references into a straight-line route.
CONNECTIONS = [
    {'id': 'firelands-peaks-lava-tubes', 'kind': 'surface-access', 'status': 'confirmed-text-unmapped', 'from': 'Burning Rift / Firelands', 'to': 'Peaks of Flame (surface)', 'via': 'lava tubes', 'routeLevels': [], 'surfaceAccess': True, 'levelContext': [{'place': 'Burning Rift', 'featureLevels': ['Lowerdark', 'Middledark', 'Upperdark'], 'sourceRecordUrl': 'https://forgottenrealms.fandom.com/wiki/Burning_Rift', 'basis': 'Toril GIS feature_levels classifies the region across these horizons; this is regional membership, not the depth of the lava-tube route.'}], 'geometry': None, 'evidence': 'A source-backed connection reaches the surface volcanoes. The exact surface entrance and the precise Underdark depth of the connection are not established; GIS lists the Burning Rift across all three horizons, which is not a route trace.', 'sources': [{'title': 'Serpent Kingdoms', 'edition': '3e', 'pages': '35, 133', 'url': 'https://forgottenrealms.fandom.com/wiki/Burning_Rift'}]},
    {'id': 'lake-of-shadows-lake-thoroot-river', 'kind': 'waterway', 'status': 'confirmed-text-unmapped', 'from': 'Lake of Shadows', 'to': 'Lake Thoroot', 'via': 'underground river flowing toward Lake Thoroot', 'routeLevels': [], 'surfaceAccess': False, 'levelContext': [{'place': 'Lake of Shadows', 'featureLevels': ['Middledark'], 'sourceRecordUrl': 'https://forgottenrealms.fandom.com/wiki/Lake_of_Shadows', 'basis': 'Toril GIS feature_levels classifies this lake; the passage level and Lake Thoroot level are not established by this regional record.'}], 'geometry': None, 'evidence': 'A named river joins the two lakes. Lake Thoroot has no mapped feature record in this snapshot, and the GIS layer classification for Lake of Shadows does not establish the river route level.', 'sources': [{'title': 'Extinction', 'edition': '3e novel', 'pages': '233–237', 'url': 'https://forgottenrealms.fandom.com/wiki/Lake_Thoroot'}]},
    {'id': 'fardrimm-lowroad', 'kind': 'tunnel-trade-route', 'status': 'confirmed-text-unmapped', 'from': 'Citadel Felbarr / Fardrimm', 'to': 'Ascore / Netheril', 'via': 'Lowroad tunnel network', 'routeLevels': [], 'surfaceAccess': False, 'levelContext': [{'place': 'Fardrimm', 'featureLevels': ['Middledark'], 'sourceRecordUrl': 'https://forgottenrealms.fandom.com/wiki/Fardrimm', 'basis': 'Toril GIS feature_levels classifies the Fardrimm region; the full Lowroad route is not assigned a verified depth by this record.'}], 'geometry': None, 'evidence': 'Source material describes the Lowroad as an underground trade route joining Delzoun and Netheril; this records the named relation, not a traced centerline or depth for the full route.', 'sources': [{'title': 'Lost Empires of Faerûn', 'edition': '3.5e', 'page': '89', 'url': 'https://forgottenrealms.fandom.com/wiki/Fardrimm'}, {'title': 'The North: Guide to the Savage Frontier', 'edition': '2e', 'pages': '56, 61', 'url': 'https://forgottenrealms.fandom.com/wiki/Fardrimm'}]},
    {'id': 'undrek-thoz-portal-web', 'kind': 'portal-network', 'status': 'confirmed-text-unmapped', 'from': "Undrek'Thoz city segments", 'to': '10 named segments beneath Thay', 'via': 'portal network', 'routeLevels': [], 'surfaceAccess': False, 'levelContext': [{'place': "Undrek'Thoz", 'featureLevels': ['Middledark'], 'sourceRecordUrl': 'https://forgottenrealms.fandom.com/wiki/Undrek%27Thoz', 'basis': 'Toril GIS feature_levels classifies the city; the source does not locate every portal or establish its depth as route geometry.'}], 'geometry': None, 'evidence': 'The ten segments are linked by a web of portals; individual portal pairs, coordinates, and route depths are not encoded as exact map edges.', 'sources': [{'title': 'Underdark', 'edition': '3e', 'page': '181', 'url': 'https://forgottenrealms.fandom.com/wiki/Underdark_(sourcebook)'}]},
]


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
    med = round(float(np.median(errs)))
    p90 = round(float(np.percentile(errs, 90)))

    conn = sqlite3.connect(gpkg)
    conn.row_factory = sqlite3.Row
    source_lookup = {
        row['uuid']: {'id': row['uuid'], 'title': row['title'], 'edition': row['game_edition'], 'url': row['url']}
        for row in conn.execute('SELECT uuid,title,game_edition,url FROM "meta.map_sources"')
    }

    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'u.geojson')
        where = 'layer_id in ({})'.format(','.join(f"'{x}'" for x in LAYERS))
        subprocess.run([gaz.tool('ogr2ogr'), '-f', 'GeoJSON', out, gpkg, 'core.polygons_v', '-where', where,
                        '-select', 'uuid,name_en,name_ru,feature_class,layer_id,feature_levels,source,url_en'], check=True, capture_output=True)
        feats = json.load(open(out, encoding='utf-8'))['features']
        sites_out = os.path.join(tmp, 'sites.geojson')
        subprocess.run([gaz.tool('ogr2ogr'), '-f', 'GeoJSON', sites_out, gpkg, 'core.points_v', '-where', "layer_id LIKE 'udk_%'",
                        '-select', 'uuid,name_en,name_ru,feature_class,layer_id,feature_levels,source,url_en'], check=True, capture_output=True)
        site_features = json.load(open(sites_out, encoding='utf-8'))['features']
    regions = []
    for f in feats:
        p = f['properties']
        # «Underdark» целиком (Macroregion) — под всем Фаэруном, подсказкой не служит.
        if not p.get('name_en') or p['name_en'] == 'unnamed' or p['feature_class'] == 'Macroregion' or not f.get('geometry'):
            continue
        rings = []
        geometry = f['geometry']
        polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else []
        for poly in polygons:
            ring = simplify([tuple(warp(lon, lat)) for lon, lat in poly[0]], SIMPLIFY)
            if len(ring) >= 3:
                rings.append([v for q in ring for v in (round(q[0]), round(q[1]))])
        if rings:
            source = source_lookup[p['source']]
            regions.append({
                'id': p['uuid'], 'name': p['name_en'], 'nameRu': p.get('name_ru'),
                'class': p['feature_class'], 'kind': p['feature_class'], 'rings': rings,
                'featureLevels': p.get('feature_levels') or [], 'source': source, 'sourceRecordUrl': p.get('url_en'),
            })
    regions.sort(key=lambda r: r['name'])

    sites = []
    for f in site_features:
        p = f['properties']
        geometry = f.get('geometry') or {}
        coords = geometry.get('coordinates') or []
        if geometry.get('type') == 'MultiPoint':
            coords = coords[0] if coords else []
        if not coords or geometry.get('type') not in ('Point', 'MultiPoint'):
            continue
        x, y = warp(float(coords[0]), float(coords[1]))
        source = source_lookup[p['source']]
        sites.append({
            'id': p['uuid'], 'name': p.get('name_en') or p.get('name_ru') or 'Без названия',
            'nameRu': p.get('name_ru'), 'kind': p['feature_class'], 'layer': p['layer_id'],
            'featureLevels': p.get('feature_levels') or [], 'x': round(float(x)), 'y': round(float(y)),
            'source': source, 'sourceRecordUrl': p.get('url_en'),
        })
    sites.sort(key=lambda item: (min((next((l['order'] for l in LEVELS if l['id'] == level), 99) for level in item['featureLevels']), default=99), item['name'].casefold()))

    path = os.path.join(ROOT, f'content/maps/{pid}-underdark.json')
    json.dump({
        'map': pid,
        'source': 'Toril GIS (Geospatial Grimoire, geospatial-grimoire.com): слои Подземья; в пиксели растра HandsomeRob — привязкой по местам справочника',
        'attribution': 'Toril GIS is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.',
        'error': f'привязка «без одной точки» по 60 местам: медиана {med} px, p90 {p90} px исходника',
        'schemaVersion': 2,
        'coordinateSystem': {
            'id': 'handsomerob-raster-pixels', 'width': passport.get('width', 30600), 'height': passport.get('height', 13400),
            'sourceCrs': 'Toril GIS / Toril GCS (snapshot 2026-09-24_1)',
            'transform': 'smooth warp from Toril GCS through the existing surface-place control points; sites and region outlines share the map raster pixel frame',
            'controlPoints': len(ctl), 'leaveOneOutSample': len(errs), 'medianErrorPx': med, 'p90ErrorPx': p90,
            'meaning': 'regional context only; this is not surveyed cave geometry or a passage network',
        },
        'levels': LEVELS,
        'provenance': {
            'dataset': 'Toril GIS public snapshot 2026-09-24_1; unofficial reconstructed cartography',
            'featureLevelMeaning': 'feature_levels is the recorded GIS classification of an area or point; it does not prove that a passage follows that level',
            'positionMeaning': 'regional positions warped into the HandsomeRob raster pixel frame; not surveyed cave or tunnel geometry',
            'confidence': 'Toril GIS source IDs and feature URLs are preserved; no per-feature numeric confidence score is supplied in the source snapshot',
            'limitations': ['Underdark polygons are regional context, not cave-volume outlines', 'route-level membership is empty unless a source identifies the route depth', 'connections with unknown geometry are not drawn as map lines'],
        },
        'regions': regions,
        'sites': sites,
        'connections': CONNECTIONS,
    }, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'опорных {len(ctl)}; без одной точки: медиана {med} px, p90 {p90} px', file=sys.stderr)
    print(f'Подземье: {len(regions)} областей, {len(sites)} точек → {path} ({os.path.getsize(path) // 1024} КБ)', file=sys.stderr)


if __name__ == '__main__':
    main()
