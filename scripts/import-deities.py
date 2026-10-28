# Божества и пантеоны для уровня «космология» (ENTITIES.md, E1): карточки {{Deity}} Forgotten Realms Wiki
# (CC BY-SA 3.0) — только факты полей, без текста статей. Поля вики идут по редакциям (5eR, 5e, 4e, 3e, 2e, 1e и без
# пометки); импорт хранит все редакции, а значение для года кампании выбирает src/cosmos/deities.ts по EDITION_ORDER.
#
# Значение поля — текст без ссылок и сносок, «бывшее» ({{Former}}) отбрасывается. Ссылки поля разрешаются: на
# божество (по статье, через перенаправления) и на план — по статьям планов Колеса и Древа (content/cosmos), слою
# плана Колеса или перенаправлению на них. Пантеоны — из поля pantheon и категорий «… pantheon».
#
# Святые дни (E4) разбираются в правила календаря: праздник Харптоса, дата месяца, равноденствие и солнцестояние (даты —
# статья Calendar of Harptos), дни каждого месяца, полнолуние и новолуние. Что не разобралось (Shieldmeet — календарь
# его не ведёт, «Starfall», «varies»), остаётся только текстом карточки. Правила — отдельным маленьким файлом: календарь
# на столе читает их сразу, а не из куска богов.
#
# Запуск: .venv/bin/python -I scripts/import-deities.py <dump.xml>
#   Выход: content/cosmos/deities.json, content/cosmos/holy-days.json.
import importlib.util
import json
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location('spelljammer', os.path.join(ROOT, 'scripts', 'import-spelljammer.py'))
sj = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sj)
NS = sj.NS

EDITIONS = ['5eR', '5e', '4e', '3e', '2e', '1e', '']
# Поля карточки в порядке паспорта: ключ вики → ключ в данных. Ссылки на планы берутся из homeplane и realm; святые
# дни — текстом для календаря (E4).
FIELDS = {'power': 'power', 'alignment': 'alignment', 'symbol': 'symbol', 'homeplane': 'homeplane', 'realm': 'realm',
          'portfolio': 'portfolio', 'domains': 'domains', 'worshipers': 'worshipers', 'serves': 'serves',
          'servedby': 'servedby', 'holy days': 'holydays'}
PLANE_FIELDS = ('homeplane', 'realm')
# Пустое по смыслу: значения нет.
EMPTY = {'', 'unknown', 'n/a', '-', '—', 'none known'}
# Имена планов из старых редакций, которых нет ни статьёй, ни перенаправлением в дампе.
PLANE_ALIASES = {'Layers of the Abyss': 'abyss', 'Concordant Opposition': 'outlands', 'Seven Heavens': 'celestia',
                 'Twin Paradises': 'bytopia', 'Happy Hunting Grounds': 'beastlands', 'Olympus': 'arborea',
                 'Gladsheim': 'ysgard', 'Tarterus': 'carceri', 'Gray Waste': 'hades', 'Nirvana': 'mechanus',
                 'Baator': 'nine-hells', 'Prime Material Plane': 'material'}
TREE_ALIASES = {'Layers of the Abyss': 'abyss'}

# Одна группа под двумя именами: поле статьи и категория.
PANTHEON_ALIASES = {'Orcish pantheon': 'Orc pantheon', 'Norse Pantheon': 'Norse pantheon'}

MONTH_NAMES = ['Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal']
# Праздники Харптоса, которые ведёт календарь стола; Shieldmeet не ведёт (src/campaign/calendar.ts).
FESTIVAL_WORDS = [('Feast of the Moon', 'Feast of the Moon'), ('Highharvestide', 'Highharvestide'), ('Higharvestide', 'Highharvestide'),
                  ('Midwinter', 'Midwinter'), ('Greengrass', 'Greengrass'), ('Midsummer', 'Midsummer')]
# Calendar of Harptos (FR Wiki): Spring Equinox on Ches 19, Summer Solstice on Kythorn 20, Autumn Equinox on Eleint 21,
# Winter Solstice on Nightal 20.
SOLAR = {'spring': ('Ches', 19), 'summer': ('Kythorn', 20), 'autumn': ('Eleint', 21), 'winter': ('Nightal', 20)}


def holy_rules(text):
    """«The Divine Death (Eleasis 13); Midsummer» → правила календаря; неразобранное не попадает в правила."""
    rules = []
    parts = []
    for seg in re.split(r'\s*;\s*', text):
        # «The Retreat (Midwinter's day) and The Queen's Gambit (Tarsakh 1)» — у каждой скобки своё имя: последний
        # кусок перед ней после «and», «plus» или запятой. Остаток строки без скобок разбирается без имени.
        for m in re.finditer(r'([^()]*?)\s*\(([^()]+)\)', seg):
            name = re.split(r'\band\b|\bplus\b|,', m.group(1))[-1].strip(' .')
            parts.append((name or None, m.group(2)))
        parts.append((None, re.sub(r'\([^()]*\)', '', seg)))
    for label, seg in parts:
        found = []
        months = '|'.join(MONTH_NAMES)
        for m in re.finditer(rf'\b({months})\s+(\d{{1,2}})\b', seg):
            found.append({'month': m.group(1), 'day': int(m.group(2))})
        for m in re.finditer(rf'\b(\d{{1,2}})(?:st|nd|rd|th)?\s+of\s+({months})\b', seg):
            found.append({'month': m.group(2), 'day': int(m.group(1))})
        if re.search(r'first day of (each|every) month', seg, re.I):
            found.append({'monthly': [1]})
        elif m := re.search(r'((?:\d{1,2}(?:st|nd|rd|th)[,&\s]*(?:and\s+)?)+)of (?:each|every) month', seg, re.I):
            found.append({'monthly': [int(x) for x in re.findall(r'\d+', m.group(1))]})
        for word, fest in FESTIVAL_WORDS:
            if re.search(rf'\b{word}\b', seg, re.I) and not any(r.get('festival') == fest for r in found):
                found.append({'festival': fest})
        if re.search(r'equinox', seg, re.I):
            sides = [k for k, pat in (('spring', r'spring|vernal'), ('autumn', r'autumn|fall')) if re.search(pat, seg, re.I)] or ['spring', 'autumn']
            found += [{'month': SOLAR[k][0], 'day': SOLAR[k][1], 'solar': k} for k in sides]
        for k in ('summer', 'winter'):
            if re.search(rf'{k} solstice', seg, re.I):
                found.append({'month': SOLAR[k][0], 'day': SOLAR[k][1], 'solar': k})
        # «Third full moon of the year» — одно полнолуние в году, не каждое: не правило.
        if re.search(r'full moon', seg, re.I) and not re.search(r'\b(first|second|third|fourth|blood)\s+full moon', seg, re.I):
            found.append({'moon': 'full'})
        if re.search(r'new moon', seg, re.I):
            found.append({'moon': 'new'})
        for r in found:
            if 'month' in r and not 1 <= r['day'] <= 30:
                continue
            if label:
                r['label'] = label
            if r not in rules:
                rules.append(r)
    return rules


def slug(title):
    t = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def scan(path):
    """Один проход по дампу: статьи с {{Deity}}, перенаправления, заголовки статей и категорий (ns 0 и 14)."""
    deities, redirects, titles = {}, {}, set()
    for _, el in ET.iterparse(path, events=('end',)):
        if el.tag != NS + 'page':
            continue
        ns, t = el.findtext(NS + 'ns'), el.findtext(NS + 'title')
        if ns in ('0', '14'):
            r = el.find(NS + 'redirect')
            if r is not None:
                redirects[t] = r.get('title')
            else:
                titles.add(t)
                text = el.findtext(f'{NS}revision/{NS}text') or ''
                if ns == '0' and re.search(r'\{\{\s*Deity\s*\n', text):
                    deities[t] = text
        el.clear()
    return deities, redirects, titles


def deity_box(text):
    m = re.search(r'\{\{\s*Deity\s*\n', text)
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
    out = {}
    for part in re.split(r'\n\s*\|', text[m.end():i - 2]):
        if '=' in part:
            k, v = part.split('=', 1)
            out[re.sub(r'\s+', ' ', k.strip().lower())] = v.strip()
    return out


def current(v):
    """Без «бывшего»: в каждой строке всё от {{Former}} до конца строки отбрасывается."""
    segs = (re.split(r'\{\{\s*former\s*\}\}', s, flags=re.I)[0] for s in re.split(r'<br\s*/?>', v))
    return '<br/>'.join(s for s in segs if s.strip())


def plain(v):
    """clean() импорта космоса и шаблоны дат вики: {{Yearlink|-1887}} → «-1887 DR», 4{{th}} → «4th»."""
    v = re.sub(r'\{\{\s*Yearlink\s*\|\s*(-?\d+)[^}]*\}\}', r'\1 DR', v, flags=re.I)
    v = re.sub(r'\{\{\s*(st|nd|rd|th)\s*\}\}', r'\1', v)
    v = re.sub(r'\{\{[^{}]*\}\}', '', v)  # прочие шаблоны (сетка мировоззрения и т. п.) — не факты текста
    # Многострочный шаблон или сноска рвутся на строки карточки: хвост от незакрытого «{{» — обрывок, не значение.
    return sj.clean(re.sub(r'(<ref[^>]*>)?\{\{.*$', '', v, flags=re.S))


def links_of(v):
    v = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', v, flags=re.S)
    return [m.strip() for m in re.findall(r'\[\[([^\]|#]+)', v) if not m.lower().startswith(('category:', ':category:', 'file:'))]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__ or 'usage: import-deities.py <dump.xml>')
    pages, redirects, titles = scan(sys.argv[1])
    follow = lambda t: redirects.get(t, redirects.get(t[:1].upper() + t[1:], t[:1].upper() + t[1:]))

    # Планы: статья → id отдельно для Колеса и Древа, слои Колеса → план. Поля 3e пишут дом бога по Древу, остальные
    # редакции — по Колесу: Demonweb Pits в 5e — слой Abyss, а не план Древа. Поле без редакции — по обеим моделям.
    plane_of, layer_of = {'wheel': {}, 'tree': {}}, {}
    for f, model in (('great-wheel', 'wheel'), ('world-tree', 'tree')):
        with open(os.path.join(ROOT, 'content', 'cosmos', f + '.json'), encoding='utf-8') as fh:
            for p in json.load(fh)['planes']:
                plane_of[model][p['url'].rsplit('/', 1)[-1].replace('_', ' ')] = p['id']
                if model == 'wheel':
                    for layer in p.get('layers') or []:
                        layer_of.setdefault(layer, p['id'])

    def plane(link, ed):
        models = ['tree'] if ed == '3e' else ['wheel'] if ed else ['wheel', 'tree']
        if link.endswith(' (layer)'):
            return layer_of.get(link[:-8]) if 'wheel' in models else None
        for t in (link, follow(link)):
            for m in models:
                if t in plane_of[m]:
                    return plane_of[m][t]
            if 'tree' in models and t in TREE_ALIASES:
                return TREE_ALIASES[t]
            if 'wheel' in models and (t in PLANE_ALIASES or t in layer_of):
                return PLANE_ALIASES.get(t) or layer_of[t]
        return None

    ids = {}
    for t in pages:
        sid = slug(t)
        if sid in ids.values():
            sys.exit(f'одинаковый id {sid}: {t}')
        ids[t] = sid

    def deity(link):
        return ids.get(link) or ids.get(follow(link))

    deities, pantheons, unmapped = [], {}, {}
    for t, text in sorted(pages.items()):
        box = deity_box(text)
        names = sj.named_refs(text)
        fields = {}
        for f, key in FIELDS.items():
            by_ed = {}
            for ed in EDITIONS:
                raw = current(box.get(f + ed.lower(), ''))  # ключи карточки — строчными: power5eR → power5er
                txt = plain(raw)
                if txt.lower() in EMPTY:
                    continue
                cell = {'t': txt}
                ls = links_of(raw)
                ds = [d for d in dict.fromkeys(deity(l) for l in ls) if d and d != ids[t]]
                if ds and f in ('serves', 'servedby'):
                    cell['d'] = ds
                if f in PLANE_FIELDS:
                    ps = [p for p in dict.fromkeys(plane(l, ed) for l in ls) if p]
                    if ps:
                        cell['p'] = ps
                    for l in ls:
                        if not plane(l, ed):
                            unmapped[l] = unmapped.get(l, 0) + 1
                by_ed[ed] = cell
            if by_ed:
                fields[key] = by_ed
        refs = {}
        for ed in EDITIONS:
            r = sj.refs_in(box.get('refs' + ed.lower(), ''), names)
            if r:
                refs[ed] = r
        # Пантеоны: поле pantheon (без бывших) и категории.
        pan = re.findall(r'\[\[:?(?:Category:)?([^\]|#]+)', re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', current(box.get('pantheon', '')), flags=re.S))
        pan += re.findall(r'\[\[Category:([^\]|]*[Pp]antheon)\s*(?:\|[^\]]*)?\]\]', text)
        pan_ids = []
        for p in pan:
            name = re.sub(r'^:?Category:', '', follow(p.strip()))
            name = PANTHEON_ALIASES.get(name, name)
            if not name or deity(name) or re.search(r'disambiguation|Wikipedia', name):
                continue
            pid = slug(name)
            pan_ids.append(pid)
            entry = pantheons.setdefault(pid, {'id': pid, 'name': name, 'members': []})
            if 'url' not in entry:
                if name in titles:
                    entry['url'] = sj.WIKI + name.replace(' ', '_')
                elif f'Category:{name}' in titles:
                    entry['url'] = sj.WIKI + 'Category:' + name.replace(' ', '_')
        pan_ids = list(dict.fromkeys(pan_ids))
        for pid in pan_ids:
            pantheons[pid]['members'].append(ids[t])
        title = [plain(x) for x in re.split(r'<br\s*/?>', current(box.get('title', '')))]
        aspects = [deity(l) for l in links_of(current(box.get('aspects', '')))]
        d = {
            'id': ids[t], 'name': sj.clean(box.get('name', '')) or re.sub(r' \([^)]*\)$', '', t),
            'url': sj.WIKI + t.replace(' ', '_'),
            **({'titles': [x for x in title if x][:4]} if any(title) else {}),
            **({'pantheons': pan_ids} if pan_ids else {}),
            **({'aspects': [a for a in dict.fromkeys(aspects) if a and a != ids[t]]} if any(aspects) else {}),
            **({'died': plain(box['died'])} if plain(box.get('died', '')) else {}),
            **({'apotheosis': plain(box['apotheosis'])} if plain(box.get('apotheosis', '')) else {}),
            'fields': fields,
            'refs': refs,
        }
        if not d.get('aspects'):
            d.pop('aspects', None)
        deities.append(d)

    # Одноимённые божества (Mystra и Mystra (Midnight)) различаются уточнением из заголовка статьи.
    seen = {}
    for d in deities:
        seen.setdefault(d['name'], []).append(d)
    for same in (v for v in seen.values() if len(v) > 1):
        for d in same:
            title = d['url'].rsplit('/', 1)[-1].replace('_', ' ')
            if m := re.search(r' \(([^)]*)\)$', title):
                d['name'] = f"{d['name']} ({m.group(1)})"

    # Пантеоны без статьи и категории в дампе не ведут никуда — ссылка на поиск вики.
    for p in pantheons.values():
        p.setdefault('url', sj.WIKI + 'Special:Search?search=' + p['name'].replace(' ', '+'))
    out = {
        'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE,
        'note': 'Факты карточек {{Deity}} по редакциям; значение для года кампании выбирает src/cosmos/deities.ts.',
        'deities': deities,
        'pantheons': sorted(pantheons.values(), key=lambda p: p['name']),
    }
    holy = []
    for d in deities:
        eds = {ed: {'text': c['t'], 'rules': holy_rules(c['t'])} for ed, c in d['fields'].get('holydays', {}).items()}
        if any(e['rules'] for e in eds.values()):
            holy.append({'deity': d['id'], 'name': d['name'], 'url': d['url'], **({'pantheons': d['pantheons']} if d.get('pantheons') else {}), 'editions': eds})
    hpath = os.path.join(ROOT, 'content', 'cosmos', 'holy-days.json')
    with open(hpath, 'w', encoding='utf-8') as fh:
        json.dump({'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE,
                   'note': 'Святые дни из поля holy days карточек {{Deity}}: правила календаря по редакциям; даты равноденствий и солнцестояний — статья Calendar of Harptos.',
                   'deities': holy}, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'святые дни: {len(holy)} богов с правилами календаря → {hpath} ({os.path.getsize(hpath) // 1024} КБ)')

    path = os.path.join(ROOT, 'content', 'cosmos', 'deities.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    print(f'{len(deities)} божеств, {len(pantheons)} пантеонов → {path} ({os.path.getsize(path) // 1024} КБ)')
    print('не разобраны как план (частые):', sorted(unmapped.items(), key=lambda x: -x[1])[:25])


if __name__ == '__main__':
    main()
