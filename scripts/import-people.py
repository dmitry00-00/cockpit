# NPC мира для карточек и мест (ENTITIES.md, E9; ROADMAP 3.2): карточки {{Person}} Forgotten Realms Wiki
# (CC BY-SA 3.0) — только поля, без текста статей: имя, титул, раса, пол, род занятий, дом, бог-покровитель, годы
# рождения и смерти (DR — для фильтра «жив в год кампании»), сноски. Дом сводится к месту справочника карты
# (content/maps/toril-cards.json, toril-places.json) по статье вики, перенаправлению или имени — первое совпавшее
# из ссылок поля home, «бывшее» ({{Former}}) не считается. Бог — к id справочника богов (content/cosmos/deities.json).
# Организации — по категориям «Members of …» статьи, к id content/world/organizations.json (import-organizations.py
# идёт первым).
#
# Выход кусками (20 тысяч записей — несколько мегабайт): content/world/people/<0–7>.json по хэшу id и два индекса:
# content/world/people-index.json — место → жители (id, имя, годы), чтобы карточка места показывала NPC, не загружая
# всех; content/world/org-members.json — организация → члены.
#
# Запуск: .venv/bin/python -I scripts/import-people.py <dump.xml>
import hashlib
import importlib.util
import json
import os
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sj = _load('spelljammer', 'import-spelljammer.py')
dz = _load('deities', 'import-deities.py')
NS = sj.NS
BUCKETS = 8
# Пусто по смыслу.
EMPTY = {'', 'unknown', 'none', 'n/a', '-', '—', '?'}


def bucket(pid):
    return int(hashlib.sha1(pid.encode()).hexdigest(), 16) % BUCKETS


def scan(path, template='Person'):
    """Статьи с карточкой шаблона (без перенаправлений) и перенаправления ns 0 — один проход дампа."""
    people, redirects = {}, {}
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
                if re.search(r'\{\{\s*' + template + r'\s*\n', text):
                    people[t] = text
        el.clear()
    return people, redirects


def person_box(text, template='Person'):
    m = re.search(r'\{\{\s*' + template + r'\s*\n', text)
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
            # Сноска-примечание с переводами строк рвётся на строки карточки: незакрытая «<ref…>» — до конца значения
            # долой, иначе ссылки из примечания («…faithful of [[Mielikki]]») выглядят полем.
            v = re.sub(r'<ref(?![^>]*/>)[^>]*>(?!.*</ref>).*$', '', v, flags=re.S)
            out[re.sub(r'\s+', ' ', k.strip(' |').lower())] = v.strip()
    return out


def year(v):
    """«1339», «−225», «1,280» → число; диапазоны и «circa» — первое число; нет числа — None."""
    v = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', v, flags=re.S)
    m = re.search(r'(-|−)?\s*(\d[\d,]*)', dz.plain(v))
    if not m:
        return None
    n = int(m.group(2).replace(',', ''))
    return -n if m.group(1) else n


def follower(redirects):
    """Статья по ссылке: через перенаправление, с заглавной первой буквой, как в MediaWiki."""
    return lambda t: redirects.get(t, redirects.get(t[:1].upper() + t[1:], t[:1].upper() + t[1:]))


def place_resolver(follow):
    """Ссылка вики → id места справочника карты: статья карточки L3, затем имя GIS или карточки; нет — None."""
    with open(os.path.join(ROOT, 'content', 'maps', 'toril-cards.json'), encoding='utf-8') as fh:
        cards = json.load(fh)['places']
    with open(os.path.join(ROOT, 'content', 'maps', 'toril-places.json'), encoding='utf-8') as fh:
        gis = json.load(fh)['places']
    place_of_title, place_of_name = {}, {}
    for c in cards:
        for s in c.get('sources', []):
            if s.startswith('https://'):
                place_of_title[urllib.parse.unquote(s.rsplit('/wiki/', 1)[1]).replace('_', ' ')] = c['id']
    for p in [*gis, *cards]:
        place_of_name.setdefault(p['name'], p['id'])

    def place(link):
        for t in (link, follow(link)):
            if t in place_of_title:
                return place_of_title[t]
            if t in place_of_name:
                return place_of_name[t]
        return None
    return place


def deity_resolver(follow):
    """Ссылка вики → id божества content/cosmos/deities.json; нет — None."""
    with open(os.path.join(ROOT, 'content', 'cosmos', 'deities.json'), encoding='utf-8') as fh:
        of_title = {urllib.parse.unquote(d['url'].rsplit('/wiki/', 1)[1]).replace('_', ' '): d['id'] for d in json.load(fh)['deities']}
    return lambda link: of_title.get(follow(link)) or of_title.get(link)


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: import-people.py <dump.xml>')
    pages, redirects = scan(sys.argv[1])
    follow = follower(redirects)
    place, deity_of = place_resolver(follow), deity_resolver(follow)
    # Организации (ROADMAP 3.1) — из content/world/organizations.json, если импорт организаций уже был: он идёт первым.
    org_path = os.path.join(ROOT, 'content', 'world', 'organizations.json')
    org_of_title = {}
    if os.path.exists(org_path):
        with open(org_path, encoding='utf-8') as fh:
            org_of_title = {o['title']: o['id'] for o in json.load(fh)['organizations']}

    ids, people = {}, []
    taken = set()
    for t in sorted(pages):
        # «Argûl Marammas» и «Argul Marammas» — две статьи с одним slug: вторая по алфавиту получает номер.
        pid, n = dz.slug(t), 2
        while pid in taken:
            pid, n = f'{dz.slug(t)}-{n}', n + 1
        taken.add(pid)
        ids[t] = pid
    for t, text in sorted(pages.items()):
        box = person_box(text)
        names = sj.named_refs(text)
        # «[[Tower of Twilight]],<br />[[Neverwinter Wood]]» — запятая перед переносом строки лишняя.
        field = lambda k: re.sub(r'\s*,\s*;', ';', dz.plain(dz.current(box.get(k, ''))))
        val = lambda k: (lambda v: None if v.lower() in EMPTY else v)(field(k))
        home_raw = dz.current(box.get('home', ''))
        home_place = next((p for p in (place(l) for l in dz.links_of(home_raw)) if p), None)
        # Бог — только первая строка поля: дальше вики пишет прежних и «по редакциям» («[[Gwaeron Windstrom]] (1e)»).
        deity_raw = re.split(r'<br\s*/?>', dz.current(box.get('patron deity', '') or box.get('deity', '')))[0]
        deity = next((d for d in (deity_of(l) for l in dz.links_of(deity_raw)) if d), None)
        # Организации — по категориям «Members of the Zhentarim» статьи: в {{Person}} поля для них нет. Категория не
        # различает нынешних и бывших членов — в карточке это «состоял».
        cats = (re.sub(r'^the ', '', c.strip()) for c in re.findall(r'\[\[Category:Members of ([^\]|]+)', text))
        orgs = list(dict.fromkeys(o for o in (org_of_title.get(follow(c)) or org_of_title.get(follow('The ' + c)) for c in cats) if o))[:6]
        dr = (box.get('reckoning', '') or 'DR').strip().upper().startswith('DR')
        born, died = (year(box.get('dob', '')), year(box.get('death', ''))) if dr else (None, None)
        title = next((x for x in (dz.plain(s) for s in re.split(r'<br\s*/?>', dz.current(box.get('titles', '')))) if x), None)
        refs = sj.refs_in(box.get('basicrefs', '') + box.get('refs5e', '') + box.get('refs3e', '') + box.get('refs2e', ''), names)[:2]
        name = val('name') or re.sub(r' \([^)]*\)$', '', t)
        rec = {
            'id': ids[t], 'name': name, 'title': t,
            **({'t': title} if title else {}),
            **({'race': val('race')} if val('race') else {}),
            **({'sex': val('sex') or val('gender')} if (val('sex') or val('gender')) else {}),
            **({'occ': val('occupation')} if val('occupation') else {}),
            **({'home': val('home')} if val('home') else {}),
            **({'place': home_place} if home_place else {}),
            **({'orgs': orgs} if orgs else {}),
            **({'deity': deity} if deity else ({'deityText': dz.plain(deity_raw)} if dz.plain(deity_raw).lower() not in EMPTY else {})),
            **({'born': born} if born is not None else {}),
            **({'died': died} if died is not None else {}),
            **({'refs': refs} if refs else {}),
        }
        # Длинные поля вики (списки занятий через «;») — первые 120 знаков: карточка, а не статья.
        for k in ('occ', 'home', 'race', 't'):
            if k in rec and len(rec[k]) > 120:
                rec[k] = rec[k][:119].rstrip(' ,;') + '…'
        people.append(rec)

    out_dir = os.path.join(ROOT, 'content', 'world', 'people')
    os.makedirs(out_dir, exist_ok=True)
    chunks = [[] for _ in range(BUCKETS)]
    for p in people:
        chunks[bucket(p['id'])].append(p)
    for i, chunk in enumerate(chunks):
        with open(os.path.join(out_dir, f'{i}.json'), 'w', encoding='utf-8') as fh:
            json.dump({'people': chunk}, fh, ensure_ascii=False, separators=(',', ':'))
            fh.write('\n')
    index = {}
    for p in people:
        if 'place' in p:
            index.setdefault(p['place'], []).append([p['id'], p['name'], p.get('born'), p.get('died')])
    with open(os.path.join(ROOT, 'content', 'world', 'people-index.json'), 'w', encoding='utf-8') as fh:
        json.dump({'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE, 'buckets': BUCKETS,
                   'note': 'Место справочника карты → жители: id, имя, год рождения и смерти (DR). Записи NPC — content/world/people/<хэш id % 8>.json.',
                   'places': dict(sorted(index.items()))}, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    # Организация → члены (ROADMAP 3.1): отдельный файл — карточке места он не нужен.
    members = {}
    for p in people:
        for o in p.get('orgs', []):
            members.setdefault(o, []).append([p['id'], p['name'], p.get('born'), p.get('died')])
    with open(os.path.join(ROOT, 'content', 'world', 'org-members.json'), 'w', encoding='utf-8') as fh:
        json.dump({'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE,
                   'note': 'Организация → NPC по категориям «Members of …» вики: id, имя, год рождения и смерти (DR).',
                   'orgs': dict(sorted(members.items()))}, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    size = sum(os.path.getsize(os.path.join(out_dir, f'{i}.json')) for i in range(BUCKETS)) // 1024
    isize = os.path.getsize(os.path.join(ROOT, 'content', 'world', 'people-index.json')) // 1024
    print(f'{len(people)} NPC: {size} КБ в {BUCKETS} кусках; с местом — {sum(len(v) for v in index.values())} в {len(index)} местах, индекс {isize} КБ; '
          f'с богом — {sum(1 for p in people if "deity" in p)}, с организацией — {sum(1 for p in people if "orgs" in p)}')


if __name__ == '__main__':
    main()
