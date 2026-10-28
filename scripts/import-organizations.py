# Организации мира (ROADMAP 3.1): карточки {{Organization}} Forgotten Realms Wiki (CC BY-SA 3.0) — только поля, без
# текста статей: тип, база (→ место справочника карты), глава (→ NPC content/world/people), союзники и враги (→ другие
# организации), бог (favored deity → божество content/cosmos/deities.json), мировоззрение, расы, символ, численность,
# год основания и роспуска (DR — для фильтра «есть в год кампании»), сноски. «Бывшее» ({{Former}}) не берётся.
#
# Церковь — организация с богом, которая по типу или имени религиозная («Religious organization», «Church of Lathander»):
# у Harpers тоже есть боги, но это не церковь.
#
# Выход: content/world/organizations.json. Идёт перед import-people.py: NPC берёт из него свои организации.
#
# Боги поселений (ROADMAP 3.4): поле religion карточек мест из выжимки вики (scripts/wiki-extract.py) — к месту
# справочника карты и id божеств; content/world/place-faiths.json. Имя, которого нет в справочнике богов, остаётся
# только в тексте поля. Года у поля нет: вики перечисляет богов разных эпох одной строкой.
#
# Запуск: .venv/bin/python -I scripts/import-organizations.py <dump.xml> [<fr-wiki-places.jsonl>]
#   выжимка по умолчанию — самая свежая /Volumes/внешний/datasets/fr-wiki-*/fr-wiki-places.jsonl
import glob
import importlib.util
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sj = _load('spelljammer', 'import-spelljammer.py')
dz = _load('deities', 'import-deities.py')
pp = _load('people', 'import-people.py')
TEMPLATE = r'Organi[sz]ation'
CHURCH_TYPE = re.compile(r'relig|church|clergy|priest|temple|faith|cult|monast', re.I)
CHURCH_NAME = re.compile(r'^(?:Church|Clergy|Faith|Priesthood|Temple|Cult|Followers|Worshipers) of ', re.I)


def lines(raw):
    """Нынешнее значение поля строками: до {{Former}}, по <br>."""
    return [x for x in re.split(r'<br\s*/?>', dz.current(raw)) if x.strip()]


def leaders(raw, person_of):
    """Глава: «{{Split table|кто||когда||кто||когда}}» — парами, иначе строками поля. До четырёх."""
    m = re.match(r'\s*\{\{\s*Split table\s*\|(.*)\}\}\s*$', raw, re.S)
    if m:
        cells = m.group(1).split('||')
        pairs = [(cells[i], cells[i + 1] if i + 1 < len(cells) else '') for i in range(0, len(cells), 2)]
    else:
        pairs = [(x, '') for x in lines(raw)]
    out = []
    for who, when in pairs:
        t = dz.plain(who)
        if not t or t.lower() in pp.EMPTY:
            continue
        person = next((p for p in (person_of(l) for l in dz.links_of(who)) if p), None)
        out.append({'t': t[:120], **({'when': dz.plain(when)} if dz.plain(when) else {}), **({'person': person} if person else {})})
    return out[:4]


def main():
    if len(sys.argv) not in (2, 3):
        sys.exit('usage: import-organizations.py <dump.xml> [<fr-wiki-places.jsonl>]')
    pages, redirects = pp.scan(sys.argv[1], TEMPLATE)
    follow = pp.follower(redirects)
    place, deity_of = pp.place_resolver(follow), pp.deity_resolver(follow)
    person_of_title = {}
    for path in glob.glob(os.path.join(ROOT, 'content', 'world', 'people', '*.json')):
        with open(path, encoding='utf-8') as fh:
            person_of_title.update({p['title']: p['id'] for p in json.load(fh)['people']})
    person_of = lambda link: person_of_title.get(follow(link)) or person_of_title.get(link)

    ids, taken = {}, set()
    for t in sorted(pages):
        oid, n = dz.slug(t), 2
        while oid in taken:
            oid, n = f'{dz.slug(t)}-{n}', n + 1
        taken.add(oid)
        ids[t] = oid
    org_of = lambda link: ids.get(follow(link)) or ids.get(link)

    orgs = []
    for t, text in sorted(pages.items()):
        box = pp.person_box(text, TEMPLATE)
        names = sj.named_refs(text)
        field = lambda k: re.sub(r'\s*,\s*;', ';', dz.plain(dz.current(box.get(k, ''))))
        # Значение с «=» или «|» — вложенная таблица по редакциям («3e = |-| 2e =»), не факт.
        val = lambda k: (lambda v: None if v.lower() in pp.EMPTY or re.search(r'[=|]', v) else v[:120])(field(k))
        links = lambda k, of: list(dict.fromkeys(x for x in (of(l) for l in dz.links_of(dz.current(box.get(k, '')))) if x and x != ids[t]))
        deities = links('favored deity', deity_of)[:12]
        kind = val('type')
        name = val('name') or re.sub(r' \([^)]*\)$', '', t)
        aliases = [a for a in (dz.plain(x) for x in re.split(r'<br\s*/?>|,', dz.current(box.get('aliases', '')))) if a and a.lower() not in pp.EMPTY][:3]
        dr = (box.get('reckoning', '') or 'DR').strip().upper().startswith('DR')
        formed, disbanded = (pp.year(box.get('formed', '')), pp.year(box.get('disbanded', ''))) if dr else (None, None)
        church = bool(deities) and bool(CHURCH_TYPE.search(kind or '') or CHURCH_NAME.match(t))
        refs = sj.refs_in(box.get('basicrefs', '') + box.get('relrefs', '') + box.get('memrefs', ''), names)[:2]
        head = leaders(box.get('leader', ''), person_of)
        rec = {
            'id': ids[t], 'name': name, 'title': t,
            **({'aliases': aliases} if aliases else {}),
            **({'type': kind} if kind else {}),
            **({'church': True} if church else {}),
            **({'base': val('base')} if val('base') else {}),
            **({'places': p} if (p := links('base', place)[:3]) else {}),
            **({'leaders': head} if head else {}),
            **({'deities': deities} if deities else {}),
            **({'allies': a} if (a := links('allegiances', org_of)[:12]) else {}),
            **({'enemies': e} if (e := links('enemies', org_of)[:12]) else {}),
            **({'alignment': val('alignment')} if val('alignment') else {}),
            **({'races': val('races')} if val('races') else {}),
            **({'symbol': val('symbol')} if val('symbol') else {}),
            **({'members': val('members')} if val('members') else {}),
            **({'formed': formed} if formed is not None else {}),
            **({'disbanded': disbanded} if disbanded is not None else {}),
            **({'refs': refs} if refs else {}),
        }
        orgs.append(rec)

    out = os.path.join(ROOT, 'content', 'world', 'organizations.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE,
                   'note': 'Поля карточек {{Organization}}: места — id справочника карты, глава — id NPC, союзники и враги — id организаций, боги — id божеств.',
                   'organizations': orgs}, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    count = lambda k: sum(1 for o in orgs if k in o)
    print(f'{len(orgs)} организаций, {os.path.getsize(out) // 1024} КБ: церквей {count("church")}, с местом {count("places")}, '
          f'с главой-NPC {sum(1 for o in orgs if any("person" in h for h in o.get("leaders", [])))}, с богом {count("deities")}, '
          f'с союзниками {count("allies")}, с врагами {count("enemies")}, распущены {count("disbanded")}')

    extract = sys.argv[2] if len(sys.argv) == 3 else next(iter(sorted(glob.glob('/Volumes/внешний/datasets/fr-wiki-*/fr-wiki-places.jsonl'), reverse=True)), None)
    if extract:
        faiths(extract, place, deity_of)


def faiths(extract, place, deity_of):
    """Поле religion статей о местах → место справочника карты: боги id и текст поля."""
    out = {}
    with open(extract, encoding='utf-8') as fh:
        for line in fh:
            page = json.loads(line)
            text = (page.get('box') or {}).get('religion', '').strip()
            pid = place(page['title']) if text else None
            if not pid or pid in out:
                continue
            # «Helm, Selûne (c. 1372 DR); Torm and Tyr» — имена через запятую, «;» и «and», пояснения в скобках долой.
            names = [n.strip(' .') for n in re.split(r',|;|\band\b|/', re.sub(r'\([^)]*\)', '', text))]
            deities = list(dict.fromkeys(d for d in (deity_of(n) for n in names if n) if d))
            out[pid] = {**({'deities': deities} if deities else {}), 'text': text[:200]}
    path = os.path.join(ROOT, 'content', 'world', 'place-faiths.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE,
                   'note': 'Поле religion карточек мест вики: место справочника карты → боги (id божеств) и текст поля; без года.',
                   'places': dict(sorted(out.items()))}, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    print(f'боги поселений: {len(out)} мест, с богом из справочника {sum(1 for v in out.values() if "deities" in v)}, '
          f'{os.path.getsize(path) // 1024} КБ')


if __name__ == '__main__':
    main()
