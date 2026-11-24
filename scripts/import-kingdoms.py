# Державы мира для листа королевства: карточки {{Location}} и {{State}} Forgotten Realms Wiki (CC BY-SA 3.0) — поля
# и первый абзац статьи как есть (по-английски, без разметки; решение владельца 29.10). Шаблонов {{Country}},
# {{Kingdom}}, {{Nation}}, {{Realm}} в дампе нет (замер 30.10): державы лежат в {{Location}} (4 352 статьи) и
# {{State}} (13, перенаправление на Location).
#
# Отбор (замер 30.10: 442 статьи): карточка Location или State и (категория-держава — Countries, Former countries,
# City-states, Empires, Kingdoms, Nations — или тип карточки со словом державы: kingdom, country, nation, empire,
# realm, city-state, republic, confederation, principality, duchy, sultanate, caliphate, imperium, theocracy,
# magocracy, monarchy, khanate, emirate), или категория формы правления (Monarchies, Republics, …) у места, которое не
# поселение по типу карточки (решение кокпита). Планарные и божественные «realm» (Planar realm, divine realm) и «Country
# estate» — не державы. Полный список правил — STATE_CATS, STATE_TYPE, NOT_STATE.
#
# Что куда (ничего не выдумывается — нет поля, нет ключа):
#   * столица, крупнейший город, места внутри — id справочника карты (content/maps/toril-places.json, toril-cards.json);
#     места внутри — статьи категорий «Locations in <держава>» (их строит сам шаблон Location), а не догадка по карте;
#   * правители одним списком: глава государства и правительства (head of state + leader1, head of government +
#     leader2 — с ролью), ruler строками, ruler1…ruler5 с годом «на» (ruleryearN → at и «in N DR»), таблица rulertable
#     ({{Split table}}: кто — когда; отрезок «N DR–M DR» → from/to); кто — id NPC (content/world/people) или
#     организации (Council of Four, House Baenre);
#   * боги — id content/cosmos/deities.json из поля religion, «бывшее» ({{Former}}) не берётся;
#   * союзники — поле allegiances: id держав этого файла или организаций content/world/organizations.json. Поля
#     «враги» у карточки Location нет — врагов в данных нет;
#   * основана, распалась — год DR (если reckoning не DR — годов нет); события карточки (event1…4, start/end event) —
#     как в карточке;
#   * предшественник и наследник — id держав, где есть;
#   * континент — категория «Locations in <континент>» статьи, континенты — имена полигонов Continent Toril GIS;
#     над державой — державы, в чьих «Locations in …» она стоит (герцогства Tethyr — в Tethyr);
#   * GIS — именованный регион Toril GIS (слой srf_con_named_regions_pg) по url_en на статью вики, иначе по имени;
#     подпись схемы — content/maps/toril-labels.json по имени (labels-from-gis.py);
#   * хронология — id событий content/chronology/events (статьи-годы) и content/chronology/articles
#     (import-chronology-articles.py), в чьих ссылках стоит статья державы (через перенаправления), а не подстрока.
#
# Выход: content/world/kingdoms.json (поля — контракт вида kingdom: src/world/kingdoms.ts, сверх него — факты вики и
# GIS: continent, within, place, gis, cats, former, forms, milestones, orgs, events и др.). Порядок запуска: после
# import-organizations.py и import-people.py; затем import-chronology.py (ссылки kingdom: в событиях) и
# import-chronology-articles.py; затем import-kingdoms.py ещё раз — годы и события держав по обоим слоям хронологии.
# Первый проход до статей-хроник использует --skip-chronology-articles, чтобы не читать старые shards.
# После него — econ-from-wiki.py: товары держав для торговли (content/world/econ.json).
#
# Запуск: .venv/bin/python -I scripts/import-kingdoms.py <dump.xml> [--skip-chronology-articles] [--content-root <content-dir>]
import argparse
import csv
import glob
import html
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.parse
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


content_paths = _load('content_paths', 'content-paths.py')
sj = _load('spelljammer', 'import-spelljammer.py')
dz = _load('deities', 'import-deities.py')
pp = _load('people', 'import-people.py')
NS = sj.NS
EMPTY = pp.EMPTY | {'yes', 'extant', 'none known', 'various'}

BOX = re.compile(r'\{\{\s*(Location|State)\s*\n')
STATE_CATS = {'Countries', 'Former countries', 'City-states', 'Former city-states', 'Empires', 'Former empires', 'Kingdoms', 'Nations'}
STATE_TYPE = re.compile(r'\b(kingdom|country|countries|nation|empire|realm|city[- ]state|republic|confederation|principality|duchy|'
                        r'sultanate|caliphate|imperium|theocracy|magocracy|monarchy|khanate|emirate)s?\b', re.I)
NOT_STATE = re.compile(r'planar|divine|demiplane|estate', re.I)
# Решение кокпита (30.10): категория формы правления (Monarchies, Republics, …) у статьи-места — тоже держава, если тип
# карточки не поселение: так входят Cormanthyr, долины Dalelands, Afyal, Corsair Domains, а деревня-«монархия» — нет.
SETTLEMENT_TYPE = re.compile(r'village|town|hamlet|settlement|city|port|volcano', re.I)
# Категории-формы правления: имя категории как есть.
FORM_CAT = re.compile(r'^(?:\w+cracies|\w+archies|Republics|Confederations|Monarchies)$')
# Континенты — имена полигонов Continent Toril GIS (замер 30.10); Lopango — без статьи в вики.
CONTINENTS = ['Faerûn', 'Kara-Tur', 'Zakhara', 'Maztica', 'Katashaka', 'Osse', 'Lopango']
GDAL_DIRS = ['/Applications/Postgres.app/Contents/Versions/latest/bin', '/opt/homebrew/bin', '/usr/local/bin']


# ── разбор вики-разметки ──────────────────────────────────────────────────────────────────────────────────────────

def split_top(s, sep='|'):
    """Делит строку по sep вне {{…}} и […]: аргументы шаблона, поля карточки."""
    out, cur, depth, i = [], [], 0, 0
    while i < len(s):
        two = s[i:i + 2]
        if two in ('{{', '[['):
            depth, i = depth + 1, i + 2
            cur.append(two)
        elif two in ('}}', ']]') and depth:
            depth, i = depth - 1, i + 2
            cur.append(two)
        elif s[i] == sep and depth == 0:
            out.append(''.join(cur))
            cur, i = [], i + 1
        else:
            cur.append(s[i])
            i += 1
    out.append(''.join(cur))
    return out


def block_end(text, start):
    """Конец шаблона, открытого в start: позиция после парной «}}»."""
    depth, i = 0, start
    while i < len(text):
        if text.startswith('{{', i):
            depth, i = depth + 1, i + 2
        elif text.startswith('}}', i):
            depth, i = depth - 1, i + 2
            if depth == 0:
                return i
        else:
            i += 1
    return len(text)


REF = re.compile(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', re.S)


def box_of(text, pat=BOX):
    """Карточка Location/State (или шаблона pat): поля (ключ в нижнем регистре → сырое значение со сносками), шаблон, конец карточки.
    Поля делятся по «|» вне вложенных шаблонов и ссылок — {{Split table|…}} на несколько строк не рвётся."""
    m = pat.search(text)
    if not m:
        return None
    end = block_end(text, m.start())
    body = text[m.end():end - 2]
    refs = []

    def keep(r):
        refs.append(r.group(0))
        return f'\x00{len(refs) - 1}\x00'
    body = REF.sub(keep, body)
    fields = {}
    for part in split_top(body):
        if '=' not in part:
            continue
        k, v = part.split('=', 1)
        v = re.sub(r'\x00(\d+)\x00', lambda r: refs[int(r.group(1))], v).strip()
        fields[re.sub(r'\s+', ' ', k.strip().lower())] = v
    return {'template': m.group(1), 'fields': fields, 'end': end}


def template(name, args, years):
    """Шаблон вики → текст, как его показывает статья; неизвестный — пусто (оформление, не факт)."""
    n = name.strip().lower()
    pos = [a.strip() for a in args if not re.match(r'\s*[\w ]+\s*=', a)]
    named = dict((k.strip().lower(), v.strip()) for k, v in (a.split('=', 1) for a in args if re.match(r'\s*[\w ]+\s*=', a)))
    if n == 'yearlink' and pos:
        return f"{pos[0]} {named.get('reckoning') or 'DR'}"
    if n == 'yearlinkname' and pos:
        # Шаблон пишет имя года из Roll of years и сам год; имени нет — только год.
        try:
            nm = years.get(int(pos[0]))
        except ValueError:
            nm = None
        return f'{nm}, {pos[0]} DR' if nm else f'{pos[0]} DR'
    if n in ('st', 'nd', 'rd', 'th'):
        return n
    if n == 'small' and pos:
        return pos[0]
    if n == 'si' and pos:
        return ' '.join(pos[:2])
    if n == 'percentage table':
        return ', '.join(f'{pos[i]} {pos[i + 1]}%' for i in range(0, len(pos) - 1, 2))
    if n == 'currency table' and pos:
        return ' = '.join(p for p in pos if p)
    if n == 'alignment grid':
        return ', '.join(c for c, on in zip(['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'], pos) if on == 'on')
    if n == 'split table':
        return '; '.join(' — '.join(x for x in (pos[i], pos[i + 1] if i + 1 < len(pos) else '') if x) for i in range(0, len(pos), 2))
    return ''


def strip_files(v):
    """[[File:…|thumb|…[[ссылка]]…]] целиком — со вложенными ссылками в подписи."""
    out, i = [], 0
    while True:
        m = re.compile(r'\[\[\s*(?:File|Image):', re.I).search(v, i)
        if not m:
            out.append(v[i:])
            return ''.join(out)
        out.append(v[i:m.start()])
        depth, j = 0, m.start()
        while j < len(v):
            if v.startswith('[[', j):
                depth, j = depth + 1, j + 2
            elif v.startswith(']]', j):
                depth, j = depth - 1, j + 2
                if depth == 0:
                    break
            else:
                j += 1
        i = j


def render(v, years=None):
    """Значение вики → текст: без сносок и файлов, шаблоны — как их пишет статья, ссылки — подписью."""
    years = years or {}
    v = REF.sub('', v)
    v = re.sub(r'<!--.*?-->', '', v, flags=re.S)
    v = strip_files(v)
    while True:
        m = re.search(r'\{\{([^{}]*)\}\}', v)
        if not m:
            break
        parts = split_top(m.group(1))
        v = v[:m.start()] + template(parts[0], parts[1:], years) + v[m.end():]
    v = re.sub(r'\[\[:?(?:Category|Wikipedia|wikipedia|w):[^\]|]*\|([^\]]*)\]\]', r'\1', v)
    v = re.sub(r'\[\[:?Category:[^\]]*\]\]', '', v, flags=re.I)
    v = re.sub(r'\[\[[^\]|]*\|([^\]]*)\]\]', r'\1', v)
    v = re.sub(r'\[\[([^\]]*)\]\]', r'\1', v)
    v = re.sub(r'\[https?://\S+\s+([^\]]*)\]', r'\1', v)
    v = re.sub(r"'''?", '', v)
    v = re.sub(r'<br\s*/?>', '; ', v)
    v = re.sub(r'<[^>]+>', '', v)
    v = html.unescape(v).replace('\xa0', ' ')
    v = re.sub(r'\(\s*[,;]?\s*\)', '', v)
    v = re.sub(r'\s+([,;.])', r'\1', v)
    v = re.sub(r',\s*;', ';', v)
    return re.sub(r'\s+', ' ', v).strip(' ;,')


def links(v):
    """Цели ссылок значения, без сносок, файлов и категорий, по порядку и без повторов."""
    v = REF.sub('', v)
    out = []
    for t in re.findall(r'\[\[([^\]|#]+)', v):
        t = t.strip()
        if t and not re.match(r':?(category|file|image|wikipedia|w):', t, re.I) and t not in out:
            out.append(t)
    return out


def lead(text, end, years=None):
    """Первый абзац статьи после карточки: до первого заголовка, без шаблонов, файлов и сносок."""
    body = text[end:]
    body = re.split(r'^==', body, flags=re.M)[0]
    for para in re.split(r'\n\s*\n', body):
        t = render(para, years)
        # Остатки служебных строк: «__NOTOC__», одиночные подписи.
        t = re.sub(r'__\w+__', '', t).strip()
        if len(t) > 40 and re.search(r'[a-z]', t):
            return t
    return None


def templates_in(v, name):
    """Аргументы каждого шаблона name верхнего уровня в значении (их бывает несколько подряд)."""
    v, out, i = REF.sub('', v), [], 0
    pat = re.compile(r'\{\{\s*' + re.escape(name) + r'\s*\|', re.I)
    while (m := pat.search(v, i)):
        end = block_end(v, m.start())
        out.append(split_top(v[m.end():end - 2]))
        i = end
    return out


def raw_lines(v):
    """Строки значения по <br>; строка-уточнение «{{Small|(before the fall)}}» прилипает к предыдущей. Пустые — долой."""
    out = []
    for line in re.split(r'<br\s*/?>', v):
        t = render(line)
        if not t or t.lower() in EMPTY:
            continue
        if out and t.startswith('('):
            out[-1] += ' ' + line
        else:
            out.append(line)
    return out


def year_of(v):
    return pp.year(render(v)) if render(v) else None


# ── отбор ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def categories(text):
    return [c.strip() for c in re.findall(r'\[\[Category:([^\]|]+)', text)]


def is_kingdom(text):
    """Статья — держава: карточка Location/State и категория-держава или тип карточки со словом державы."""
    box = box_of(text)
    if not box:
        return None
    kind = render(box['fields'].get('type', ''))
    cats = set(categories(text)) & STATE_CATS
    if NOT_STATE.search(kind):
        return None
    if cats or STATE_TYPE.search(kind):
        return box
    if any(FORM_CAT.match(c) for c in categories(text)) and not SETTLEMENT_TYPE.search(kind):
        return box
    return None


def scan(path):
    """Один проход дампа: статьи с карточкой Location/State, перенаправления, членство в категориях «Locations in/on …»,
    «Organizations in/on …» (ns 0)."""
    boxed, redirects, members = {}, {}, {}
    for _, el in ET.iterparse(path, events=('end',)):
        if el.tag != NS + 'page':
            continue
        if el.findtext(NS + 'ns') == '0':
            t = el.findtext(NS + 'title')
            r = el.find(NS + 'redirect')
            if r is not None:
                redirects[t] = r.get('title')
            else:
                text = el.findtext(f'{NS}revision/{NS}text') or ''
                for c in categories(text):
                    if re.match(r'(Locations|Organizations) (in|on) ', c):
                        members.setdefault(c, []).append(t)
                if BOX.search(text):
                    boxed[t] = text
        el.clear()
    return boxed, redirects, members


def gis_regions(gpkg_override=None, skip_gis=False):
    """Именованные регионы Toril GIS: uuid, имя, класс, url_en, путь. Нет GeoPackage или GDAL — пусто."""
    if skip_gis:
        print('kingdoms: GIS-вход отключён профилем — без связи с полигонами')
        return []
    gpkg = gpkg_override or next(iter(sorted(glob.glob(os.path.join(ROOT, 'maps/gis/toril-gis-*/toril_gis_layers.gpkg')))), None)
    if gpkg_override and not os.path.isfile(gpkg_override):
        raise FileNotFoundError(f'GeoPackage не найден: {gpkg_override}')
    ogr = shutil.which('ogr2ogr') or next((os.path.join(d, 'ogr2ogr') for d in GDAL_DIRS if os.access(os.path.join(d, 'ogr2ogr'), os.X_OK)), None)
    if gpkg_override and not ogr:
        raise RuntimeError('ogr2ogr не найден для явно заданного GeoPackage Toril GIS')
    if not gpkg or not ogr:
        print('kingdoms: нет GeoPackage Toril GIS или ogr2ogr — без связи с полигонами')
        return []
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'r.csv')
        subprocess.run([ogr, '-f', 'CSV', out, gpkg, 'core.polygons_v', '-where', "layer_id = 'srf_con_named_regions_pg'",
                        '-select', 'uuid,name_en,feature_class,url_en,location_paths'], check=True, capture_output=True)
        with open(out, encoding='utf-8') as fh:
            rows = list(csv.DictReader(fh))
    return [r for r in rows if r.get('name_en')]


# ── импорт ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Импорт держав Forgotten Realms.')
    parser.add_argument('dump', help='XML-дамп вики')
    parser.add_argument('--content-root', help='корень слоёв content; по умолчанию <корень проекта>/content')
    parser.add_argument('--gis-package', help='GeoPackage Toril GIS; если задан, автоматический поиск не используется')
    parser.add_argument('--skip-gis', action='store_true', help='не читать GeoPackage и не искать GIS в каталоге проекта')
    parser.add_argument(
        '--skip-chronology-articles',
        action='store_true',
        help='не читать старые статьи-хроники на первом проходе до их импорта',
    )
    args = parser.parse_args()
    if args.gis_package and args.skip_gis:
        parser.error('--gis-package и --skip-gis нельзя использовать вместе')
    content_paths.set_content_root(args.content_root)
    boxed, redirects, members = scan(args.dump)
    follow = pp.follower(redirects)
    place, deity_of = pp.place_resolver(follow), pp.deity_resolver(follow)
    with open(content_paths.content_path(ROOT, 'chronology', 'index.json'), encoding='utf-8') as fh:
        years = {y['year']: y['name'] for y in json.load(fh)['years'] if y.get('name')}
    person_of_title = {}
    for path in glob.glob(content_paths.content_path(ROOT, 'world', 'people', '*.json')):
        with open(path, encoding='utf-8') as fh:
            person_of_title.update({p['title']: p['id'] for p in json.load(fh)['people']})
    with open(content_paths.content_path(ROOT, 'world', 'organizations.json'), encoding='utf-8') as fh:
        org_of_title = {o['title']: o['id'] for o in json.load(fh)['organizations']}
    of = lambda table: (lambda link: table.get(follow(link)) or table.get(link))
    person_of, org_of = of(person_of_title), of(org_of_title)

    pages = {t: (text, box) for t, text in boxed.items() if (box := is_kingdom(text))}
    ids, taken = {}, set()
    for t in sorted(pages):
        kid, n = dz.slug(t), 2
        while kid in taken:
            kid, n = f'{dz.slug(t)}-{n}', n + 1
        taken.add(kid)
        ids[t] = kid
    kingdom_of = of(ids)

    # Категория «Locations in <имя>» — как её строит шаблон Location: usethe, useon, linkname или name.
    def cat_names(t, f):
        name = render(f.get('linkname', '')) or render(f.get('name', '')) or t
        the = 'the ' if f.get('usethe', '').strip() else ''
        prep = ['on'] if f.get('useon', '').strip() else ['in']
        if f.get('usein+on', '').strip():
            prep = ['in', 'on']
        return [(p, f'{the}{n}') for p in prep for n in dict.fromkeys([name, t])]

    # Державы, в чьих «Locations in …» стоит статья, — над ней.
    parent_cat = {}
    for t, (text, box) in pages.items():
        for p, n in cat_names(t, box['fields']):
            parent_cat[f'Locations {p} {n}'] = t

    regions = gis_regions(args.gis_package, args.skip_gis)
    gis_of = {}
    for r in regions:
        url = r.get('url_en') or ''
        title = url.rsplit('/wiki/', 1)[-1].replace('_', ' ') if '/wiki/' in url else ''
        title = follow(urllib.parse.unquote(title)) if title else ''
        k = ids.get(title) if title else None
        k = k or kingdom_of(r['name_en'])
        if k and k not in gis_of:
            path = json.loads(r.get('location_paths') or '{}').get('en') or []
            gis_of[k] = {'uuid': r['uuid'], 'name': r['name_en'], 'class': r['feature_class'], **({'path': path} if path else {})}
    with open(content_paths.content_path(ROOT, 'maps', 'toril-labels.json'), encoding='utf-8') as fh:
        labels = {}
        for name, kind, x, y, *_ in json.load(fh)['labels']:
            if kind in ('region', 'realm', 'city', 'town', 'label', 'island', 'site'):
                labels.setdefault(name, {'name': name, 'kind': kind, 'x': x, 'y': y})

    # Хронология: событие → державы по ссылкам (через перенаправления).
    chrono = {}
    layers = ('events',) if args.skip_chronology_articles else ('events', 'articles')
    for layer in layers:
        for path in sorted(glob.glob(content_paths.content_path(ROOT, 'chronology', layer, '*.json'))):
            with open(path, encoding='utf-8') as fh:
                for e in json.load(fh).get('events', []):
                    for k in dict.fromkeys(x for x in (kingdom_of(l['t']) for l in e.get('links', [])) if x):
                        chrono.setdefault(k, []).append((e['year'], e['id']))

    out = []
    for t, (text, box) in sorted(pages.items()):
        f = box['fields']
        kid = ids[t]
        names = sj.named_refs(text)
        cur = lambda k: dz.current(f.get(k, ''))
        val = lambda k: (lambda v: None if v.lower() in EMPTY else v)(render(cur(k), years))
        dr = (f.get('reckoning', '') or 'DR').strip().upper().startswith('DR')
        yr = lambda k: year_of(f.get(k, '')) if dr and f.get(k, '').strip() else None

        def who(raw):
            """Запись правителя: текст и id NPC, организации или державы — первая ссылка, что разрешилась."""
            rec = {'t': render(raw, years)[:120]}
            for l in links(raw):
                if (p := person_of(l)):
                    return {**rec, 'person': p}
                if (o := org_of(l)):
                    return {**rec, 'org': o}
            return rec

        # Правитель «сейчас» (поле ruler — раздел Politics карточки) и история правителей (ruler1…5 «на год»,
        # rulertable — «кто — когда») — разные поля карточки: собираются порознь, в запись — одним списком ниже.
        rulers = [who(line) for line in raw_lines(cur('ruler'))]
        history = []
        for i in range(1, 10):
            raw = cur(f'ruler{i}')
            if render(raw).lower() in EMPTY:
                continue
            y = pp.year(f.get(f'ruleryear{i}', '')) if dr and f.get(f'ruleryear{i}', '').strip() else None
            history.append({**who(raw), **({'year': y} if y is not None else {})})
        for args in templates_in(f.get('rulertable', ''), 'split table'):
            cells = [c.strip() for c in args if not re.match(r'\s*[\w ]+\s*=', c)]
            for i in range(0, len(cells) - 1, 2):
                if render(cells[i]).lower() not in EMPTY:
                    history.append({**who(cells[i]), **({'when': render(cells[i + 1], years)} if render(cells[i + 1]) else {})})
        heads = []
        for role_k, who_k, default in (('head of state', 'leader1', 'Head of State'), ('head of government', 'leader2', 'Head of Government')):
            for line in raw_lines(cur(who_k)):
                heads.append({'role': render(f.get(role_k, ''), years) or default, **who(line)})

        # Население: populationN «в год popyearN» (раздел History карточки) или поле population строками.
        pops = [{'t': render(line, years)[:120]} for line in raw_lines(cur('population'))]
        for i in range(1, 6):
            p = val(f'population{i}')
            if p:
                y = pp.year(f.get(f'popyear{i}', '')) if dr and f.get(f'popyear{i}', '').strip() else None
                pops.append({'t': p[:120], **({'year': y} if y is not None else {})})
        for p in pops:
            # «1,360,800 (as of 1372 DR)», «14,020 in 1372 DR» — год строки, если она его пишет; число — если оно точное.
            if 'year' not in p and (m := re.search(r'(?:as of|in|circa|c\.)\s*(-?\d+) DR', p['t'])):
                p['year'] = int(m.group(1))
            if (m := re.match(r'([\d,]+)(?:\s|$)', p['t'])):
                p['n'] = int(m.group(1).replace(',', ''))

        # Валюта: {{Currency table|1pp|1 "tricrown"|10 gold "lions"|…}} — монета и равные ей; таблиц бывает несколько.
        currency = [{'base': c[0], 'coins': [x for x in c[1:] if x]} for c in
                    ([render(a, years) for a in args] for args in templates_in(f.get('currency', ''), 'currency table')) if c and c[0]]
        if not currency and val('currency'):
            currency = [{'t': val('currency')}]

        milestones = []
        for ek, dk in [('start event', 'start date'), *((f'event{i}', f'date{i}') for i in range(1, 6)), ('end event', 'end date')]:
            ev = render(f.get(ek, ''), years)
            if ev and ev.lower() not in EMPTY:
                d = render(f.get(dk, ''), years)
                y = pp.year(f.get(dk, '')) if dr and d else None
                milestones.append({'t': ev[:200], **({'when': d} if d else {}), **({'year': y} if y is not None else {})})

        cats = categories(text)
        allies, ally_orgs = [], []
        for l in links(cur('allegiances') + '<br/>' + cur('allegiance')):
            if (k := kingdom_of(l)):
                if k != kid and k not in allies:
                    allies.append(k)
            elif (o := org_of(l)) and o not in ally_orgs:
                ally_orgs.append(o)
        seq = lambda key: list(dict.fromkeys(k for k in (kingdom_of(l) for l in links(cur(key))) if k and k != kid))
        inside, orgs, total = [], [], 0
        for p, n in cat_names(t, f):
            for m_t in members.get(f'Locations {p} {n}', []):
                total += 1
                pid = place(m_t)
                if pid and pid not in inside:
                    inside.append(pid)
            for m_t in members.get(f'Organizations {p} {n}', []):
                o = org_of(m_t)
                if o and o not in orgs:
                    orgs.append(o)
        parents = list(dict.fromkeys(ids[parent_cat[c]] for c in cats if c in parent_cat and parent_cat[c] != t))
        continent = next((c for c in CONTINENTS if f'Locations in {c}' in cats or f'Locations on {c}' in cats), None)
        name = val('name') or re.sub(r' \([^)]*\)$', '', t)
        aliases = [a for a in (render(x, years) for x in re.split(r'<br\s*/?>', cur('aliases'))) if a and a.lower() not in EMPTY][:6]
        capital = '; '.join(render(x, years) for x in raw_lines(cur('capital')))
        cap_place = next((p for p in (place(l) for l in links(cur('capital'))) if p), None)
        largest = next((p for p in (place(l) for l in links(cur('largest city'))) if p), None)
        deities = list(dict.fromkeys(d for d in (deity_of(l) for l in links(cur('religion') + cur('religions'))) if d))
        religion = val('religion') or val('religions')
        langs = [x.strip() for x in re.split(r'[,;]', val('languages') or '') if x.strip()]
        refs = sj.refs_in(''.join(f.get(k, '') for k in ('georefs', 'socrefs', 'comrefs', 'govrefs', 'histrefs')) +
                          ''.join(v for v in f.values()), names)[:8]
        ev = sorted(set(chrono.get(kid, [])))
        # Правители одним списком: глава государства и правительства (head of state + leader1, с ролью), ruler — «сейчас»
        # по карточке, история — ruler1…5 («in 1372 DR», как пишет карточка) и rulertable («1353 DR–1375 DR»).
        # from/to — из «when», только если это отрезок «N DR–M DR» (или «N DR–» без конца); at — год «на» из ruleryearN.
        all_rulers = []
        for r in heads + rulers + history:
            r = dict(r)
            if 'year' in r:
                # «Szass Tam in 1372 DR» — так карточка пишет ruler1/ruleryear1: правитель на этот год, не начало правления.
                r['at'] = r.pop('year')
                r['when'] = f"in {r['at']} DR"
            if (m := re.fullmatch(r'(-?\d+)(?: DR)?\s*[–-]\s*(?:(-?\d+)(?: DR)?|\?)?', r.get('when', ''))):
                r['from'] = int(m.group(1))
                if m.group(2):
                    r['to'] = int(m.group(2))
            if not any(x['t'] == r['t'] and x.get('when') == r.get('when') for x in all_rulers):
                all_rulers.append(r)
        pop = '; '.join(p['t'] + (f" in {p['year']} DR" if 'year' in p and not re.search(r'-?\d+ DR', p['t']) else '') for p in pops)
        cur_text = '; '.join(' = '.join([c['base'], *c['coins']]) if 'base' in c else c['t'] for c in currency)
        founded = yr('established') if f.get('established', '').strip() else yr('founded')
        dissolved = yr('disestablished') if f.get('disestablished', '').strip() else yr('destroyed')
        label = labels.get(t) or labels.get(name)
        rec = {
            # ── контракт карточки kingdom: (координатор, 30.10) ──
            'id': kid, 'name': name, 'title': t,
            **({'aliases': aliases} if aliases else {}),
            **({'type': val('type')[:80]} if val('type') else {}),
            **({'capital': capital[:160]} if capital else {}),
            **({'capitalPlace': cap_place} if cap_place else {}),
            **({'government': val('government')[:160]} if val('government') else {}),
            **({'rulers': all_rulers[:40]} if all_rulers else {}),
            **({'population': pop[:240]} if pop else {}),
            **({'languages': langs[:20]} if langs else {}),
            **({'deities': deities[:30]} if deities else {}),
            **({'deityText': religion[:400]} if religion and not deities else {}),
            **({'races': val('races')[:300]} if val('races') else {}),
            **({'currency': cur_text[:300]} if cur_text else {}),
            **({'exports': val('exports')[:300]} if val('exports') else {}),
            **({'imports': val('imports')[:300]} if val('imports') else {}),
            **({'allies': allies} if allies else {}),
            **({'allyOrgs': ally_orgs} if ally_orgs else {}),
            **({'founded': founded} if founded is not None else {}),
            **({'dissolved': dissolved} if dissolved is not None else {}),
            **({'region': val('region')[:160]} if val('region') else {}),
            **({'places': inside} if inside else {}),
            **({'label': label['name']} if label else {}),
            **({'summary': s} if (s := lead(text, box['end'], years)) else {}),
            **({'refs': refs} if refs else {}),
            **({'years': sorted(set(y for y, _ in ev))} if ev else {}),
            # ── сверх контракта: факты вики и GIS, которые карточке пригодятся ──
            **({'religion': religion[:400]} if religion and deities else {}),
            **({'rulerType': val('rulertype')[:80]} if val('rulertype') else {}),
            **({'cats': sorted(set(cats) & STATE_CATS)} if set(cats) & STATE_CATS else {}),
            **({'former': True} if {'Former countries', 'Former city-states', 'Former empires'} & set(cats) else {}),
            **({'forms': [c for c in cats if FORM_CAT.match(c)]} if any(FORM_CAT.match(c) for c in cats) else {}),
            **({'continent': continent} if continent else {}),
            **({'within': parents} if parents else {}),
            **({'place': p} if (p := place(t)) else {}),
            **({'largestCity': val('largest city')[:120]} if val('largest city') else {}),
            **({'largestCityPlace': largest} if largest else {}),
            **({'demonym': val('demonym')[:120]} if val('demonym') else {}),
            **({'alignment': val('alignment')} if val('alignment') else {}),
            **({'legislature': val('legislature')[:160]} if val('legislature') else {}),
            **({'judiciary': val('judiciary')[:160]} if val('judiciary') else {}),
            **({'executive': val('executive')[:160]} if val('executive') else {}),
            **({'milestones': milestones} if milestones else {}),
            **({'predecessors': p} if (p := seq('predecessor')) else {}),
            **({'successors': s} if (s := seq('successor')) else {}),
            **({'locations': total} if total else {}),
            **({'orgs': orgs} if orgs else {}),
            **({'gis': gis_of[kid]} if kid in gis_of else {}),
            **({'events': [e for _, e in ev]} if ev else {}),
        }
        out.append(rec)

    path = content_paths.content_path(ROOT, 'world', 'kingdoms.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE,
                   'note': 'Державы из карточек {{Location}}/{{State}} вики: поля и первый абзац статьи по-английски, как в вики; '
                           'места — id справочника карты, правители — id NPC или организаций, боги — id божеств, союзники — id держав '
                           'или организаций (allyOrgs), gis — именованный регион Toril GIS, label — имя подписи content/maps/toril-labels.json, '
                           'years и events — годы и id событий content/chronology, в чьих ссылках стоит статья державы.',
                   'gisAttribution': 'Toril GIS (Geospatial Grimoire, geospatial-grimoire.com) — unofficial Fan Content permitted under the Fan Content Policy.',
                   'kingdoms': out}, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    count = lambda k: sum(1 for k_ in out if k in k_)
    print(f'{len(out)} держав, {os.path.getsize(path) // 1024} КБ: с описанием {count("summary")}, столицей {count("capital")} '
          f'(место карты {count("capitalPlace")}), правителями {count("rulers")} (с датой {sum(1 for k in out if any("when" in r for r in k.get("rulers", [])))}, '
          f'NPC {sum(1 for k in out if any("person" in r for r in k.get("rulers", [])))}), населением {count("population")}, '
          f'богами {count("deities")}, валютой {count("currency")}, союзниками {count("allies") + 0}/{count("allyOrgs")}, '
          f'основана {count("founded")}, распалась {count("dissolved")}, бывших {count("former")}; полигон GIS {count("gis")}, '
          f'подпись схемы {count("label")}, место карты {count("place")}, места внутри {count("places")} '
          f'({sum(len(k.get("places", [])) for k in out)}), континент {count("continent")}, в хронологии {count("years")} '
          f'({sum(len(k.get("events", [])) for k in out)} событий)')

if __name__ == '__main__':
    main()
