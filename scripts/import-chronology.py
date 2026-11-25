# Хронология канона (DESIGN Д5, решение владельца 29.10.2026): статьи-годы Forgotten Realms Wiki («1479 DR», CC BY-SA 3.0)
# → события по годам. Строки — английские, как в вики (решение владельца 29.10: «английские строки вики как есть»), без
# сносок; к каждой — дата Харптоса, если вики её пишет («'''2 Mirtul:'''», «[[Hammer (month)|Hammer]]:»), вид раздела
# ({{Yearbox/in-conflicts}} → conflicts), ссылки на сущности справочника (NPC, организации, места карты, божества,
# державы content/world/kingdoms.json — только после прохода import-kingdoms.py) и
# источники-сноски. Своего не добавляем: нет даты — нет даты, нет ссылки — только заголовок статьи.
#
# Выход: content/chronology/index.json — годы (имя в Roll of years, эпоха, счётчики по видам), эпохи, куски;
# content/chronology/events/<n>.json — события кусками по годам (грузятся по требованию, как NPC).
# Запуск: .venv/bin/python -I scripts/import-chronology.py <dump.xml> [--skip-kingdoms] [--content-root <content-dir>]
#
import argparse
import glob
import importlib.util
import json
import os
import re
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

MONTHS = ['Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn', 'Flamerule', 'Eleasias', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal']
# Праздники Харптоса — между месяцами; month — номер месяца, после которого праздник (как в calendar.ts).
FESTIVALS = {'Midwinter': 1, 'Greengrass': 4, 'Midsummer': 7, 'Shieldmeet': 7, 'Highharvestide': 9, 'Feast of the Moon': 11}
DAY = r'(\d{1,2})(?:st|nd|rd|th)?'
WHEN = re.compile(
    rf'^(?:(?:early|mid|late|end of|beginning of|the end of)\s+)?(?:{DAY}\s+)?({"|".join(MONTHS + list(FESTIVALS))})(?:\s+{DAY})?$', re.I)

# Разделы {{Yearbox/…}} → вид события; «in-publications» — не событие мира, а что из изданного происходит в этот год.
KIND = {
    'in-politics': 'politics', 'in-conflicts': 'conflicts', 'deaths': 'deaths', 'births': 'births', 'misc': 'misc',
    'in-magic': 'magic', 'in-people': 'people', 'in-environment': 'environment', 'in-organizations': 'organizations',
    'in-organisations': 'organizations', 'in-publications': 'publications', 'migrations': 'migrations',
    'in-migrations': 'migrations', 'in-deities': 'deities', 'in-Realmspace': 'realmspace', 'on-Abeir': 'abeir',
    'in-wildlife': 'wildlife',
}

# Куски событий по годам: границы подобраны под ~равный вес (больше всего событий — 1300–1490 DR).
CHUNKS = [-10**6, -1000, 0, 500, 1000, 1250, 1350, 1370, 1400, 1480, 10**6]


def scan(path):
    """Статьи-годы «N DR» (без перенаправлений) и перенаправления ns 0 — один проход дампа."""
    years, redirects = {}, {}
    for _, el in ET.iterparse(path, events=('end',)):
        if el.tag != NS + 'page':
            continue
        if el.findtext(NS + 'ns') == '0':
            t = el.findtext(NS + 'title')
            r = el.find(NS + 'redirect')
            if r is not None:
                redirects[t] = r.get('title')
            elif re.fullmatch(r'-?\d+ DR', t or ''):
                years[t] = el.findtext(f'{NS}revision/{NS}text') or ''
        el.clear()
    return years, redirects


def when_of(head):
    """«2 Mirtul», «Hammer», «Mirtul 27», «Late Eleint», «Midsummer» → (месяц 1–12 или праздник, день); иначе None."""
    m = WHEN.match(head.strip())
    if not m:
        return None
    name = next(n for n in MONTHS + list(FESTIVALS) if n.lower() == m.group(2).lower())
    day = m.group(1) or m.group(3)
    if name in FESTIVALS:
        return {'festival': name}
    return {'month': MONTHS.index(name) + 1, **({'day': int(day)} if day and 1 <= int(day) <= 30 else {})}


def split_date(line):
    """Строка события → (дата или None, строка без даты). Дата — жирным в начале или ссылкой на месяц с двоеточием."""
    m = re.match(r"\s*'''(.{1,40}?)'''\s*:?\s*", line)
    if m:
        head = re.sub(r':\s*$', '', sj.delink(m.group(1))).strip()
        d = when_of(head)
        if d:
            return {**d, 'when': head}, line[m.end():]
    m = re.match(r'\s*((?:\[\[[^\]]{1,40}\]\]|[\w ]){1,40}?)\s*:\s*', line)
    if m:
        head = sj.delink(m.group(1)).strip()
        d = when_of(head)
        if d:
            return {**d, 'when': head}, line[m.end():]
    return None, line


def text_of(raw):
    """Вики-строка → английский текст: без сносок, ссылки — их подписью, шаблоны годов — «N DR»."""
    v = re.sub(r'\{\{\s*Yearlink\s*\|\s*(-?\d+)[^}]*\}\}', r'\1 DR', raw, flags=re.I)
    v = re.sub(r'\{\{\s*(st|nd|rd|th)\s*\}\}', r'\1', v)
    v = re.sub(r'\{\{\s*PAGENAME\s*\}\}', '', v)
    v = re.sub(r'\{\{[^{}]*\}\}', '', re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', v, flags=re.S))
    return sj.clean(v)


def eras_of(years):
    """Эпохи по меткам «age» статей-годов. Метки в вики непоследовательны («Present Age» вкраплено в «Age of Humanity»,
    «Era of Upheaval» у 1234 DR), поэтому не отрезки подряд, а большинство: эпохи (метки хотя бы у десяти лет; «Age of the Proud Peoples» — шесть лет внутри Founding Time — подэпоха, не граница) — по
    медиане года, граница между соседними — там, где меньше всего лет с чужой меткой. Метка самого года не меняется."""
    by = {}
    for y in years:
        if y.get('age'):
            by.setdefault(y['age'], []).append(y['year'])
    names = sorted((a for a, ys in by.items() if len(ys) >= 10), key=lambda a: sorted(by[a])[len(by[a]) // 2])
    eras = []
    for i, a in enumerate(names):
        lo = min(by[a]) if i == 0 else eras[-1]['to'] + 1
        if i + 1 < len(names):
            b = names[i + 1]
            pts = sorted(set(y for y in by[a] + by[b] if y >= lo))
            # Граница — первый год следующей эпохи: слева должны быть a, справа b; ошибки — чужие метки по обе стороны.
            best = min(pts, key=lambda c: sum(1 for y in by[a] if y >= c) + sum(1 for y in by[b] if lo <= y < c))
            eras.append({'name': a, 'from': lo, 'to': best - 1})
        else:
            eras.append({'name': a, 'from': lo, 'to': max(by[a])})
    return eras


def ref_resolver(follow, include_kingdoms=True):
    """Ссылка вики → «вид:id» справочника (NPC, организация, божество, место карты, держава) или None."""
    place, deity = pp.place_resolver(follow), pp.deity_resolver(follow)
    person_of_title = {}
    for path in glob.glob(content_paths.content_path(ROOT, 'world', 'people', '*.json')):
        with open(path, encoding='utf-8') as fh:
            person_of_title.update({p['title']: p['id'] for p in json.load(fh)['people']})
    with open(content_paths.content_path(ROOT, 'world', 'organizations.json'), encoding='utf-8') as fh:
        org_of_title = {o['title']: o['id'] for o in json.load(fh)['organizations']}
    # Державы (вид kingdom:, решение пользователя 30.10.2026) — последними: держава, которая уже место справочника карты
    # (Cormyr, Waterdeep), остаётся place: — по нему линза года ставит пины и сцена берёт канон места; kingdom: получают
    # ссылки, которые раньше не разрешались. Файла нет (import-kingdoms.py не запускался) — без держав.
    kingdom_of_title = {}
    kingdom_path = content_paths.content_path(ROOT, 'world', 'kingdoms.json')
    if include_kingdoms and os.path.exists(kingdom_path):
        with open(kingdom_path, encoding='utf-8') as fh:
            kingdom_of_title = {k['title']: k['id'] for k in json.load(fh)['kingdoms']}

    def ref_of(link):
        t = follow(link)
        for kind, of in (('person', lambda x: person_of_title.get(x)), ('organization', lambda x: org_of_title.get(x)),
                         ('deity', deity), ('place', place), ('kingdom', lambda x: kingdom_of_title.get(x))):
            hit = of(t) or of(link)
            if hit:
                return f'{kind}:{hit}'
        return None

    return ref_of


def main():
    parser = argparse.ArgumentParser(description='Импорт событий и дат из FR Wiki.')
    parser.add_argument('dump', help='XML-дамп вики')
    parser.add_argument('--content-root', help='корень слоёв content; по умолчанию <корень проекта>/content')
    parser.add_argument(
        '--skip-kingdoms',
        action='store_true',
        help='не читать ранее существующий слой держав до его импорта',
    )
    args = parser.parse_args()
    content_paths.set_content_root(args.content_root)
    pages, redirects = scan(args.dump)
    follow = pp.follower(redirects)
    ref_of = ref_resolver(follow, include_kingdoms=not args.skip_kingdoms)

    years, events = [], []
    for title, text in pages.items():
        year = int(title.split()[0])
        roll = re.search(r'\{\{\s*Roll of years\s*\|[^|}]*\|([^|}]+)', text)
        age = re.search(r'\|\s*age\s*=\s*([^\n|}]+)', text)
        names = sj.named_refs(text)
        body = re.split(r'^==\s*(?:Appendix|References|Notes)\s*==', text, flags=re.M)[0]
        counts, n = {}, 0
        # Разделы по {{Yearbox/…}}; до первого раздела событий нет (шапка года).
        parts = re.split(r'\{\{\s*Yearbox/([^}|]+?)\s*\}\}', body)
        for name, chunk in zip(parts[1::2], parts[2::2]):
            kind = KIND.get(name.strip())
            if not kind:
                continue
            group, parent = None, None
            # Сноски и шаблоны тянутся на несколько строк («<ref>{{Cite book\n| author = …}}</ref>») — вырезаем их до
            # разбивки на строки: сноска остаётся меткой \x00n\x00 (источник события), шаблон без сноски — долой.
            refs = []

            def keep(m):
                refs.append(m.group(0))
                return f'\x00{len(refs) - 1}\x00'
            chunk = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', keep, chunk, flags=re.S)
            while re.search(r'\{\{[^{}]*\n[^{}]*\}\}', chunk):
                chunk = re.sub(r'\{\{[^{}]*\n[^{}]*\}\}', '', chunk)
            for line in chunk.split('\n'):
                if line.startswith(';'):
                    group = text_of(line[1:]) or None
                    continue
                m = re.match(r'^(\*+)\s*(.*)$', line)
                if not m or not m.group(2).strip():
                    continue
                nested = len(m.group(1)) > 1
                own = ''.join(refs[int(i)] for i in re.findall(r'\x00(\d+)\x00', m.group(2)))
                date, rest = split_date(re.sub(r'\x00\d+\x00', '', m.group(2)))
                t = text_of(rest)
                if not t:
                    # «* '''5 Flamerule:'''» без текста — заголовок даты для вложенных строк.
                    if date:
                        parent = {'id': None, 'date': date}
                    continue
                if nested and parent and not date:
                    date = parent['date']
                links, seen = [], set()
                for target, label in re.findall(r'\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]', rest):
                    target = target.strip()
                    if target.lower().startswith(('category:', ':category:', 'file:', 'image:')) or target in seen:
                        continue
                    seen.add(target)
                    r = ref_of(target)
                    links.append({'t': target, **({'ref': r} if r else {})})
                cites = sj.refs_in(own, names)[:3]
                n += 1
                eid = f'y{year}-{n}'
                ev = {
                    'id': eid, 'year': year, 'kind': kind, 'text': t,
                    **({'month': date['month']} if date and 'month' in date else {}),
                    **({'day': date['day']} if date and 'day' in date else {}),
                    **({'festival': date['festival']} if date and 'festival' in date else {}),
                    **({'when': date['when']} if date else {}),
                    **({'group': group} if group else {}),
                    **({'parent': parent['id']} if nested and parent and parent['id'] else {}),
                    **({'links': links} if links else {}),
                    **({'cites': cites} if cites else {}),
                }
                events.append(ev)
                counts[kind] = counts.get(kind, 0) + 1
                if not nested:
                    parent = {'id': eid, 'date': date}
        years.append({
            'year': year,
            **({'name': f"Year of {roll.group(1).strip()}" if not roll.group(1).strip().lower().startswith('year of') else roll.group(1).strip()} if roll else {}),
            **({'age': age.group(1).strip()} if age and age.group(1).strip() else {}),
            **({'counts': counts} if counts else {}),
        })
    years.sort(key=lambda y: y['year'])
    events.sort(key=lambda e: (e['year'], e.get('month', 13), e.get('day', 31), int(e['id'].split('-')[-1])))

    eras = eras_of(years)

    out = content_paths.content_path(ROOT, 'chronology')
    os.makedirs(os.path.join(out, 'events'), exist_ok=True)
    for old in glob.glob(os.path.join(out, 'events', '*.json')):
        os.remove(old)
    chunks = []
    for i, (lo, hi) in enumerate(zip(CHUNKS, CHUNKS[1:])):
        part = [e for e in events if lo <= e['year'] < hi]
        if not part:
            continue
        with open(os.path.join(out, 'events', f'{i}.json'), 'w', encoding='utf-8') as fh:
            json.dump({'events': part}, fh, ensure_ascii=False, separators=(',', ':'))
            fh.write('\n')
        chunks.append({'n': i, 'from': part[0]['year'], 'to': part[-1]['year'], 'events': len(part)})
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump({'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE,
                   'note': 'Статьи-годы Forgotten Realms Wiki: строки событий по-английски, как в вики, без сносок; ссылки — id справочника.',
                   'eras': eras, 'chunks': chunks, 'years': years}, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    linked = sum(1 for e in events if any('ref' in l for l in e.get('links', [])))
    dated = sum(1 for e in events if 'month' in e or 'festival' in e)
    print(f'{len(years)} лет, {len(events)} событий: с датой {dated}, со ссылкой на справочник {linked}; эпох {len(eras)}; '
          f'куски {[(c["n"], c["events"], os.path.getsize(os.path.join(out, "events", f"{c[chr(110)]}.json")) // 1024) for c in chunks]} КБ; '
          f'индекс {os.path.getsize(os.path.join(out, "index.json")) // 1024} КБ')


if __name__ == '__main__':
    main()
