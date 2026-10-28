# Реестр локаций мира в рамках одной игровой системы (5e, Forgotten Realms): всё, что знают Forgotten Realms Wiki (статьи
# с карточкой места, CC BY-SA 3.0) и Toril GIS (именованные объекты, CC BY-SA 4.0), — по лестнице масштабов кокпита:
# космос (планы, кристаллические сферы) → система (солнца, планеты, луны) → мир (континенты, океаны) → регион (страны,
# области, моря, хребты, леса) → местность (поселения, острова, озёра, реки, перевалы) → место (здания, кварталы, улицы,
# уровни подземелий). У каждой записи — область (Toril, Подземье, планы, космос, другой мир), родитель, ссылки на
# источники и статус на растровой карте Toril (из maps/ocr/<id>-registry.json). Только факты: имена, виды,
# принадлежность; тексты статей не берём.
#
# Запуск: .venv/bin/python -I scripts/world-registry.py <dump.xml> [--gpkg <gpkg>] [--map maps/ocr/toril-registry.json]
#   Дамп вики — см. scripts/wiki-extract.py. Выход: maps/world/locations.json и maps/world/locations.md (не в git).
import json, os, re, sqlite3, sys, unicodedata
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NS = '{http://www.mediawiki.org/xml/export-0.11/}'
BOXES = ('Location', 'Building', 'Road', 'Body of water', 'Mountain', 'Plane', 'Celestial body', 'Dungeon', 'State')
BOX = re.compile(r'\{\{\s*(' + '|'.join(BOXES) + r')\s*\n?\s*\|')
KEEP = ('type', 'size', 'region', 'location', 'type class', 'size class', 'satellite of', 'cluster', 'level of',
        'river mouth', 'tributary of', 'capital', 'aliases', 'alt spelling', 'other names', 'othernames')
LEVELS = ('cosmos', 'system', 'world', 'region', 'locale', 'site')
LEVEL_RU = {'cosmos': 'космос', 'system': 'система', 'world': 'мир', 'region': 'регион', 'locale': 'местность', 'site': 'место'}
DOMAIN_RU = {'toril': 'Toril', 'underdark': 'Подземье', 'planes': 'планы', 'space': 'космос', 'other': 'другие миры',
             'unknown': 'не определено'}

# Вид из поля type → уровень. Первое совпавшее слово решает: «city district» — место, «city» — местность.
TYPE_LEVEL = [
    (r'crystal sphere|cosmolog|plane\b|demiplane|layer', 'cosmos'),
    (r'planet|moon|sun\b|star\b|asteroid|comet|constellation', 'system'),
    (r'continent|ocean|supercontinent|subcontinent', 'world'),
    (r'district|ward|quarter|neighbo|street|alley|avenue|lane|courtyard|plaza|market|gate|bridge|landmark|building|inn|'
     r'tavern|shop|temple|shrine|tower|keep|castle|palace|manor|estate|guild|monaster|abbey|library|school|tomb|crypt|'
     r'warehouse|stable|mill|house|residence|festhall|club|den|store|dock|harbor|harbour|pier|arena|park|garden|'
     r'cave|cavern|grotto|mine|dungeon|level|lair|pool|waterfall|spring|well|statue|monument|portal|stairs|tunnel', 'site'),
    (r'kingdom|country|nation|realm|empire|province|region|territor|domain|duchy|confedera|alliance|caliphate|'
     r'sultanate|principalit|wilderness|forest|jungle|wood|desert|wastes?\b|tundra|glacier|ice|swamp|marsh|bog|'
     r'mountain range|mountains|range|archipelago|peninsula|plains|steppe|sea\b|seas\b|gulf|reach|coast|isles|'
     r'netherese enclave|underdark', 'region'),
    (r'settlement|village|city|town|hamlet|metropolis|thorp|outpost|fort|citadel|stronghold|ruin|island|isle|lake|'
     r'river|creek|stream|brook|bay|strait|lagoon|oasis|mountain|peak|volcano|hill|mesa|pass|valley|canyon|gorge|'
     r'road|trail|route|path|crater|cliff|plateau|moor|field|meadow|camp|enclave|colony', 'locale'),
]
GIS_LEVEL = {
    'Continent': 'world', 'Water/Oceanic expanse': 'world', 'Oceanic Expanse': 'world',
    'Macroregion': 'region', 'Region': 'region', 'Subregion': 'region', 'Domain': 'region', 'Mountains': 'region',
    'Tropical Forest': 'region', 'Temperate Forest': 'region', 'Boreal Forest': 'region', 'Swamp': 'region',
    'Glacier': 'region', 'Ice Sheet': 'region', 'Sand': 'region', 'Wastes': 'region', 'Water/Coastal sea': 'region',
    'Coastal Sea': 'region', 'Upland': 'region', 'Hills': 'region', 'Cavern Network': 'region', 'Abyss': 'region',
    'Fungal Forest': 'region', 'Moor': 'region', 'Marsh': 'region', 'Plain': 'region', 'Plateau': 'region',
    'Inn': 'site', 'Temple': 'site', 'Tomb': 'site', 'Cave': 'site', 'Cavern': 'site', 'Portal': 'site',
    'Shipwreck': 'site', 'Monastic Site': 'site', 'Farm': 'site', 'Mine': 'site', 'Water Source': 'site',
}
SKIP_CLASS = {'Time Zone', 'Meridian', 'Parallel', 'Equator', 'Tropic Circle', 'Polar Circle', 'Prime Meridian'}
PLANAR = re.compile(r'Planes?\b|Abyss|Nine Hells|Astral|Ethereal|Shadowfell|Feywild|Sigil|Outlands|Limbo|Mechanus|Arborea|'
                    r'Arvandor|Celestia|Gehenna|Hades|Carceri|Acheron|Pandemonium|Ysgard|Elysium|Bytopia|Beastlands|Fugue|'
                    r'Shadow Plane|Plane of|Elemental|Far Realm|Demiplane|Great Wheel|World Tree|World Axis|Faerie|Hells')
SPACE = re.compile(r'Wildspace|Realmspace|[Cc]rystal sphere|Phlogiston|Spelljammer|Greyspace|Krynnspace|Astromundi|'
                   r'Clusterspace|Winterspace|Celestial bod')
OTHER_WORLD = re.compile(r'\bon (Abeir|Oerth|Krynn|Mystara|Athas|Eberron|Ravenloft|the Moon|Selûne|Coliar|Karpri|Chandos|'
                         r'Glyth|Garden|H\'Catha|Anadia|Toril\'s moon)|in (Greyhawk|Dragonlance|Krynn|Ravenloft|Athas)')


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in s if not unicodedata.combining(c)).lower())


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def strip_markup(v):
    v = re.sub(r'<ref[^>/]*/>|<ref[^>]*>.*?</ref>|<!--.*?-->', '', v, flags=re.S)
    v = re.sub(r'\{\{[^{}]*\}\}', '', v)
    v = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', v)
    v = re.sub(r'<br\s*/?>', '; ', v)
    return re.sub(r"'{2,}|<[^>]+>", '', v).strip(' ;,')


def first_link(v):
    m = re.search(r'\[\[([^\]|#]+)', v or '')
    return m.group(1).strip() if m else None


def box_of(text):
    m = BOX.search(text[:5000])
    if not m:
        return None, {}
    depth, i = 0, m.start()
    while i < len(text):
        if text.startswith('{{', i):
            depth, i = depth + 1, i + 2
        elif text.startswith('}}', i):
            depth, i = depth - 1, i + 2
            if depth == 0:
                break
        else:
            i += 1
    body = text[m.start() + 2:i - 2]
    # Поля — по «|» в начале строки верхнего уровня (вложенные шаблоны держат свои «|» внутри фигурных скобок).
    fields, depth, cur = {}, 0, []
    parts = []
    for line in body.split('\n'):
        if depth == 0 and line.lstrip().startswith('|'):
            parts.append(''.join(cur))
            cur = [line.lstrip()[1:]]
        else:
            cur.append('\n' + line)
        depth += line.count('{{') - line.count('}}')
    parts.append(''.join(cur))
    for p in parts[1:]:
        if '=' in p:
            k, v = p.split('=', 1)
            k = k.strip().lower()
            if k in KEEP and v.strip():
                fields[k] = v.strip()
    return m.group(1), fields


def level_of(box, f, cats):
    t = strip_markup(f.get('type') or f.get('type class') or f.get('size') or '').lower()
    if box == 'Plane':
        return 'cosmos', t or 'plane'
    if box == 'Celestial body':
        return ('cosmos' if 'sphere' in t else 'system'), t or 'celestial body'
    if box in ('Building', 'Dungeon'):
        return 'site', t or box.lower()
    for pat, lvl in TYPE_LEVEL:
        if t and re.search(pat, t):
            return lvl, t
    if box == 'Road':
        return 'locale', t or 'road'
    if box == 'Body of water':
        return 'locale', t or 'water'
    if box == 'Mountain':
        return 'locale', t or 'mountain'
    if box == 'State':
        return 'region', t or 'state'
    if any(c in ('Countries', 'Regions', 'Kingdoms', 'Nations', 'Empires') for c in cats):
        return 'region', t or 'region'
    if any(c in ('Settlements', 'Cities', 'Towns', 'Villages', 'Islands') for c in cats):
        return 'locale', t or 'settlement'
    return 'locale', t or 'location'


def domain_of(box, cats):
    places = [c for c in cats if c.startswith(('Locations in', 'Locations on', 'Locations of'))]
    joined = ' | '.join(places)
    if box == 'Celestial body' or SPACE.search(joined):
        return 'space'
    # Maztica и Zakhara в 4e переносились на Abeir — категория «on Abeir» у них есть, но место всё равно на Toril.
    if OTHER_WORLD.search(joined) and not re.search(r'Toril|Faerûn|Kara-Tur|Zakhara|Maztica', joined):
        return 'other'
    if 'Underdark' in joined or 'Northdark' in joined or 'Middledark' in joined or 'Lowerdark' in joined:
        return 'underdark'
    if box == 'Plane' or PLANAR.search(joined) or 'demiplane' in joined.lower():
        return 'planes'
    if 'Toril' in joined or 'Faerûn' in joined or places:
        return 'toril'
    return 'unknown'


def read_wiki(path):
    pages, redirects, cat_size = [], {}, Counter()
    for _, el in ET.iterparse(path, events=('end',)):
        if el.tag != NS + 'page':
            continue
        ns = el.findtext(NS + 'ns')
        title = el.findtext(NS + 'title') or ''
        red = el.find(NS + 'redirect')
        text = el.findtext(f'{NS}revision/{NS}text') or ''
        el.clear()
        if ns != '0':
            continue
        if red is not None:
            redirects[title] = red.get('title')
            continue
        box, f = box_of(text)
        if not box:
            continue
        cats = [c.strip() for c in re.findall(r'\[\[Category:([^\]|]+)', text)]
        for c in cats:
            cat_size[c] += 1
        pages.append({'title': title, 'box': box, 'f': f, 'cats': cats})
    return pages, redirects, cat_size


def parent_of(p, cat_size):
    f = p['f']
    for k in ('satellite of', 'cluster', 'level of', 'location', 'tributary of', 'region'):
        link = first_link(f.get(k))
        if link and link != p['title']:
            return link
    # План: слой — родителю («Layers of the Nine Hells»), иначе группа планов; River Styx течёт через многие планы.
    if p['box'] == 'Plane':
        for c in p['cats']:
            m = re.match(r'(?:Layers|Realms|Domains) (?:of|in) (?:the )?(.+)', c)
            if m:
                return m.group(1)
        for c in p['cats']:
            m = re.match(r'(?:Locations (?:in|on) )?(?:the )?((?:Outer|Inner|Transitive|Lower|Upper|Elemental|Energy|Great Wheel|'
                         r'World Tree|World Axis|Astral|Ethereal|Shadow)\b.*?[Pp]lanes?)$', c)
            if m:
                return m.group(1)
    # Самая узкая категория «Locations in X» — родитель по вики.
    places = [c for c in p['cats'] if re.match(r'Locations (in|on) ', c) and 'River Styx' not in c]
    if places:
        c = min(places, key=lambda c: cat_size[c])
        return re.sub(r'^Locations (in|on) (the )?', '', c)
    return None


def gis_features(gpkg):
    c = sqlite3.connect(gpkg)
    out = []
    for table, geom in (('core.points_v', 'point'), ('core.polygons_v', 'area'), ('core.linestrings_v', 'line')):
        q = (f'select uuid, name_en, name_ru, name_alt_en, feature_class, layer_id, location_paths, url_en from "{table}" '
             "where name_en is not null and name_en <> '' and name_en <> 'unnamed'")
        for uuid, en, ru, alt, cls, layer, paths, url in c.execute(q):
            if cls in SKIP_CLASS:
                continue
            try:
                alt = json.loads(alt) if alt and alt.startswith('[') else ([alt] if alt else [])
            except ValueError:
                alt = [alt]
            try:
                path = (json.loads(paths) or {}).get('en', []) if paths else []
            except ValueError:
                path = []
            out.append({'uuid': uuid, 'name': en, 'nameRu': ru, 'alt': [a for a in alt if a], 'class': cls, 'geom': geom,
                        'layer': layer or '', 'path': path, 'url': url})
    return out


def main():
    dump = sys.argv[1]
    gpkg = arg('--gpkg', os.path.join(ROOT, 'maps/gis/toril-gis-2026-09-24_1/toril_gis_layers.gpkg'))
    map_reg = arg('--map', os.path.join(ROOT, 'maps/ocr/toril-registry.json'))
    out_dir = os.path.join(ROOT, 'maps/world')
    os.makedirs(out_dir, exist_ok=True)

    pages, redirects, cat_size = read_wiki(dump)
    print(f'вики: статей с карточкой места {len(pages)}, переадресаций {len(redirects)}', file=sys.stderr, flush=True)
    alias = defaultdict(list)
    for src, dst in redirects.items():
        alias[dst].append(src)

    entries, by_key = [], {}
    for p in pages:
        lvl, kind = level_of(p['box'], p['f'], p['cats'])
        names = [p['title']] + alias.get(p['title'], [])
        for k in ('aliases', 'alt spelling', 'other names', 'othernames'):
            names += [s.strip() for s in re.split(r'[;,]', strip_markup(p['f'].get(k, ''))) if 2 < len(s.strip()) < 60]
        e = {'id': 'wiki:' + p['title'], 'name': p['title'], 'alt': sorted(set(names[1:]) - {p['title']})[:12],
             'level': lvl, 'domain': domain_of(p['box'], p['cats']), 'kind': kind[:40], 'box': p['box'],
             'parent': parent_of(p, cat_size),
             'wiki': 'https://forgottenrealms.fandom.com/wiki/' + p['title'].replace(' ', '_'), 'sources': ['FR Wiki']}
        entries.append(e)
        for n in names:
            by_key.setdefault(norm(n), e)

    # Toril GIS: та же точка — пара по имени или варианту; иначе своя запись (в вики статьи о ней нет).
    reg = {}
    if os.path.exists(map_reg):
        for r in json.load(open(map_reg, encoding='utf-8'))['entries']:
            reg[r['id']] = r['status']
    n_gis = n_pair = 0
    for g in gis_features(gpkg) if os.path.exists(gpkg) else []:
        n_gis += 1
        e = next((by_key[k] for k in [norm(g['name'])] + [norm(a) for a in g['alt']] if k in by_key), None)
        under = g['layer'].startswith('udk_')
        if e and (e['domain'] in ('toril', 'underdark', 'unknown')) and 'gis' not in e:
            n_pair += 1
            if e['domain'] == 'unknown':
                e['domain'] = 'underdark' if under else 'toril'
        else:
            lvl = GIS_LEVEL.get(g['class'], 'locale')
            e = {'id': g['uuid'], 'name': g['name'], 'alt': g['alt'][:12], 'level': lvl,
                 'domain': 'underdark' if under else 'toril', 'kind': g['class'].lower(), 'box': None,
                 'parent': g['path'][-1] if g['path'] else None, 'sources': []}
            entries.append(e)
        e['gis'] = g['uuid']
        e['gisClass'] = g['class']
        if g['nameRu']:
            e['nameRu'] = g['nameRu']
        if g['path']:
            e['path'] = g['path']
        if reg.get(g['uuid']):
            e['map'] = reg[g['uuid']]
        e['sources'] = e['sources'] + ['Toril GIS']
    print(f'GIS: именованных объектов {n_gis}, с парой в вики {n_pair}', file=sys.stderr)

    entries.sort(key=lambda e: (LEVELS.index(e['level']), e['domain'], e['name']))
    meta = {'built': __import__('datetime').date.today().isoformat(),
            'sources': {'FR Wiki': 'Forgotten Realms Wiki, CC BY-SA 3.0 — https://forgottenrealms.fandom.com',
                        'Toril GIS': 'Toril GIS (Geospatial Grimoire), CC BY-SA 4.0 + WotC Fan Content Policy'},
            'count': len(entries)}
    json.dump({'meta': meta, 'entries': entries}, open(os.path.join(out_dir, 'locations.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0)
    report(entries, meta, os.path.join(out_dir, 'locations.md'))
    print(f'реестр: {len(entries)} записей → {out_dir}/locations.json, locations.md', file=sys.stderr)


def report(entries, meta, path):
    L = [f'# Реестр локаций — {meta["built"]}', '',
         'Forgotten Realms Wiki (статьи с карточкой места, CC BY-SA 3.0) + Toril GIS (CC BY-SA 4.0). '
         'Генерирует scripts/world-registry.py; руками не править.', '',
         f'Всего записей: {len(entries)}.', '', '## Уровни × области', '',
         '| уровень | ' + ' | '.join(DOMAIN_RU[d] for d in DOMAIN_RU) + ' | всего |',
         '|---|' + '---|' * (len(DOMAIN_RU) + 1)]
    grid = Counter((e['level'], e['domain']) for e in entries)
    for lvl in LEVELS:
        row = [grid[(lvl, d)] for d in DOMAIN_RU]
        L.append(f'| {LEVEL_RU[lvl]} | ' + ' | '.join(str(n) for n in row) + f' | {sum(row)} |')
    tor = [e for e in entries if e['domain'] in ('toril', 'underdark') and e['level'] in ('region', 'locale')]
    L += ['', '## Покрытие Toril и Подземья (регионы и местности)', '',
          f'- в вики и GIS: {sum(1 for e in tor if "gis" in e and "wiki" in e)}',
          f'- только вики (нет в GIS): {sum(1 for e in tor if "gis" not in e)}',
          f'- только GIS (нет статьи): {sum(1 for e in tor if "wiki" not in e)}',
          f'- на растре Toril (статус реестра карты): ' +
          ', '.join(f'{k} {v}' for k, v in Counter(e.get('map', '—') for e in tor).most_common())]
    for lvl in ('cosmos', 'system', 'world', 'region'):
        L += ['', f'## {LEVEL_RU[lvl].capitalize()}', '']
        groups = defaultdict(list)
        for e in entries:
            if e['level'] == lvl:
                groups[e['domain']].append(e)
        for d in DOMAIN_RU:
            if not groups[d]:
                continue
            L += [f'### {DOMAIN_RU[d]} — {len(groups[d])}', '']
            by_parent = defaultdict(list)
            for e in groups[d]:
                by_parent[e.get('parent') or '—'].append(e)
            for par in sorted(by_parent, key=lambda k: (-len(by_parent[k]), k)):
                items = ', '.join(f"{e['name']}" + (f" ({e['kind']})" if e['kind'] and lvl != 'region' else '')
                                  for e in sorted(by_parent[par], key=lambda e: e['name']))
                L.append(f'- **{par}**: {items}')
            L.append('')
    L += ['## Местности и места по родителю (сколько)', '']
    for lvl in ('locale', 'site'):
        cnt = Counter(e.get('parent') or '—' for e in entries if e['level'] == lvl)
        L.append(f'**{LEVEL_RU[lvl]}** — {sum(cnt.values())}: ' + ', '.join(f'{k} {v}' for k, v in cnt.most_common(60)))
        L.append('')
    open(path, 'w', encoding='utf-8').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main()
