# Космос для уровней лестницы «звёздная система» и «план» (HANDOFF §3, F4.2–F4.3): тела Realmspace с орбитами и
# течения флогистона между сферами — только факты из Forgotten Realms Wiki (CC BY-SA 3.0), у каждого числа — книга и
# страница, как их даёт вики. Раскладка схем — своя, в src/cosmos; фанатские карты (Nerik) — только для сверки.
#
# Тела: карточка {{Celestial body}} статьи (вид, класс размера и формы, стихия, расстояние от солнца, сутки, год,
# спутники, жители). Течения: каждое — цитата, которая обязана дословно стоять в статье (ссылки [[a|b]] читаются как b);
# источник — первая <ref> после цитаты. Цитаты нет в дампе — ошибка импорта, частичный файл не пишется.
#
# Запуск: .venv/bin/python -I scripts/import-spelljammer.py <dump.xml>
#   Дамп — см. scripts/wiki-extract.py. Выход: content/cosmos/realmspace.json, content/cosmos/phlogiston.json.
import json, os, re, sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NS = '{http://www.mediawiki.org/xml/export-0.11/}'
WIKI = 'https://forgottenrealms.fandom.com/wiki/'
LICENSE = 'CC BY-SA 3.0'
ATTRIBUTION = 'Forgotten Realms Wiki (forgottenrealms.fandom.com), авторы статей; CC BY-SA 3.0'

# Realmspace от солнца наружу; луны — сразу за своей планетой.
BODIES = [('sun', 'The sun'), ('anadia', 'Anadia'), ('coliar', 'Coliar'), ('toril', 'Toril'), ('selune', 'Selûne (moon)'),
          ('tears', 'Tears of Selûne'), ('karpri', 'Karpri'), ('chandos', 'Chandos'), ('glyth', 'Glyth'),
          ('garden', 'Garden'), ('hcatha', "H'Catha")]
SPHERE = 'Realmspace'

# Сферы флогистона рядом с Realmspace и что о путях между ними пишет вики.
SPHERES = [('realmspace', 'Realmspace', 'Realmspace'), ('greyspace', 'Greyspace', 'Greyspace'),
           ('krynnspace', 'Krynnspace', 'Krynnspace'), ('refuge', 'Refuge', 'Refuge (crystal sphere)'),
           ('pirtelspace', 'Pirtelspace', 'Pirtelspace'), ('darnannon', 'Darnannon', 'Darnannon'),
           ('moragspace', 'Moragspace', 'Moragspace'), ('winterspace', 'Winterspace', 'Winterspace'),
           ('shadowspace', 'Shadowspace', 'Shadowspace'), ('clusterspace', 'Clusterspace', 'Clusterspace'),
           ('vodoni', 'Vodoni Empire', 'Vodoni Empire')]
# from, to, дни (число, [мин, макс] или None), направление: 'two' — течение в обе стороны, 'one' — только from → to,
# '' — путь назван, про обратный вики молчит; статья и цитата.
FLOWS = [
    ('realmspace', 'greyspace', None, 'two', 'Phlogiston',
     'The phlogiston had a strong current that flowed between Realmspace and Greyspace, making two-way travel between the two crystal spheres relatively simple.'),
    ('greyspace', 'krynnspace', None, 'one', 'Phlogiston',
     'There were one-way flows from Greyspace to Krynnspace and from Krynnspace to Realmspace, but not in the opposite directions.'),
    ('krynnspace', 'realmspace', 53, 'one', 'Phlogiston',
     'Recorded travel times indicate that in order for someone to travel from Krynnspace to Realmspace, it would take them around 53 days aboard a spelljammer (SJD).'),
    ('realmspace', 'refuge', 7, 'two', 'Realmspace',
     'From Realmspace to Refuge (and vice-versa), it would take travelers around 7 days.'),
    ('refuge', 'pirtelspace', None, 'two', 'Pirtelspace',
     'Pirtelspace was located halfway between Refugespace and Darnannonspace in the Arcane Inner Flow. The flow currents in the region allowed for two-way travel to both neighboring spheres.'),
    ('pirtelspace', 'darnannon', None, 'two', 'Pirtelspace',
     'Pirtelspace was located halfway between Refugespace and Darnannonspace in the Arcane Inner Flow. The flow currents in the region allowed for two-way travel to both neighboring spheres.'),
    ('moragspace', 'realmspace', 21, '', 'Realmspace',
     'Recorded travel times indicate that in order for someone to travel from Moragspace to Realmspace, it would take travelers around 21 days.'),
    ('realmspace', 'winterspace', 45, '', 'Realmspace',
     'From Realmspace to Winterspace, it would take travelers around 45 days.'),
    ('realmspace', 'shadowspace', [12, 21], '', 'Realmspace',
     'From Realmspace to Shadowspace, it would take travelers around 12 to 21 days.'),
    ('realmspace', 'clusterspace', None, '', 'Realmspace', 'Other connections include Clusterspace and the Vodoni Empire.'),
    ('realmspace', 'vodoni', None, '', 'Realmspace', 'Other connections include Clusterspace and the Vodoni Empire.'),
]
# Группы течений: Arcane Inner Flow и треугольник Realmspace — Greyspace — Krynnspace.
GROUPS = [
    ('inner-flow', 'Arcane Inner Flow', ['refuge', 'pirtelspace', 'darnannon'], 'Phlogiston',
     'It encompassed nearly a dozen crystal spheres, including Refuge, a close neighbor of Realmspace and the site of a spaceport controlled by the Arcane, as well as Pirtelspace and the elven-controlled sphere of Darnannon.'),
    ('triangle', 'Треугольник', ['realmspace', 'greyspace', 'krynnspace'], 'Phlogiston',
     'One such stable configuration was a triangle consisting of Realmspace, in which Toril was located; Greyspace, where the world of Oerth was found; and Krynnspace, home to the world of Krynn.'),
]
TYPICAL = ('Phlogiston', 'Generally, in order for a spelljammer to reach any random crystal sphere from its closest neighbor, it would take any amount of time ranging from 10 days to 100 days, although exceptions to the average did exist.')

FIELDS = {'type': 'type', 'size class': 'size', 'shape class': 'shape', 'type class': 'element', 'satellites': 'satellites',
          'satellite of': 'parent', 'distance': 'distanceMi', 'radius': 'radiusMi', 'day length': 'day',
          'year length': 'year', 'population': 'population'}


def read_dump(path, titles, optional=()):
    pages = {}
    titles = set(titles) | set(optional)
    for _, el in ET.iterparse(path, events=('end',)):
        if el.tag != NS + 'page':
            continue
        t = el.findtext(NS + 'title')
        if t in titles and el.findtext(NS + 'ns') == '0' and el.find(NS + 'redirect') is None:
            pages[t] = el.findtext(f'{NS}revision/{NS}text') or ''
        el.clear()
    missing = set(titles) - set(optional) - set(pages)
    if missing:
        sys.exit(f'нет статей в дампе: {sorted(missing)}')
    return pages


def delink(t):
    t = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]', r'\1', t)
    return re.sub(r"'{2,}", '', t)


def named_refs(text):
    return {m.group(1): m.group(2) for m in re.finditer(r'<ref name="?([^">/]+)"?\s*>(.*?)</ref>', text, re.S)}


def cite(ref, names):
    """<ref name="X" /> или <ref>{{Cite book/Realmspace|29-31}}</ref> → «Realmspace, с. 29–31»."""
    body = ref
    if m := re.match(r'<ref name="?([^">/]+)"?\s*/>', ref):
        body = names.get(m.group(1), '')
    m = re.search(r'\{\{\s*[Cc]ite (book|dragon|dungeon|web|organized play)/(.+?)\}\}', body)
    if not m:
        return None
    parts = m.group(2).split('|')
    title = ({'dragon': 'Dragon ', 'dungeon': 'Dungeon '}.get(m.group(1).lower(), '')) + parts[0].replace('/', ': ')
    page = next((p for p in parts[1:] if re.fullmatch(r'[\d\-–, ]+', p.strip())), None)
    return f"{title}, с. {page.strip().replace('-', '–')}" if page else title


def refs_in(value, names):
    out = []
    for r in re.findall(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', value, re.S):
        c = cite(r, names)
        if c and c not in out:
            out.append(c)
    return out


def clean(v):
    v = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', v, flags=re.S)
    v = re.sub(r'\{\{SI\|([\d.]+)\|[^}]*\}\}', r'\1', v)
    v = re.sub(r'<br\s*/?>', '; ', v)
    v = re.sub(r'<[^>]+>', '', delink(v))
    v = re.sub(r'\[\[:?category:[^\]|]*\|([^\]]*)\]\]', r'\1', v, flags=re.I)
    return re.sub(r'\s+', ' ', v).strip(' ;,')


def celestial_box(text):
    m = re.search(r'\{\{\s*Celestial body\s*\n', text)
    if not m:
        return None
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
            out[k.strip().lower()] = v.strip()
    return out


def days_of(v):
    """Длина года в днях Toril: «365 days», «8 months» (месяц — 30 дней, как в Harptos), «30d 10h 30min»."""
    if m := re.fullmatch(r'([\d,]+) days?', v):
        return float(m.group(1).replace(',', ''))
    if m := re.fullmatch(r'([\d,]+) months?', v):
        return float(m.group(1).replace(',', '')) * 30
    if m := re.fullmatch(r'(\d+)d (\d+)h (\d+)min', v):
        return int(m.group(1)) + int(m.group(2)) / 24 + int(m.group(3)) / 1440
    return None


def body_of(bid, title, text):
    box = celestial_box(text)
    if box is None:
        sys.exit(f'{title}: нет карточки Celestial body')
    names = named_refs(text)
    b = {'id': bid, 'name': clean(box.get('name', title)), 'url': WIKI + title.replace(' ', '_')}
    refs = refs_in(box.get('class refs', ''), names)
    for k, key in FIELDS.items():
        v = clean(box.get(k, ''))
        if not v:
            continue
        refs += [r for r in refs_in(box[k], names) if r not in refs]
        if key in ('distanceMi', 'radiusMi'):
            num = re.match(r'(?:At least )?([\d.]+)', v)
            b[key] = float(num.group(1)) if num else v
            if key == 'radiusMi' and not v[0].isdigit():
                b['radiusNote'] = v
        else:
            b[key] = v
    if 'year' in b and (d := days_of(b['year'])) is not None:
        b['yearDays'] = round(d, 3)
    b['refs'] = refs
    return b


def find_quote(text, quote, where):
    """Цитата в тексте статьи (ссылки — подписью) и первая <ref> после неё."""
    flat = delink(text)
    i = flat.find(quote)
    if i < 0:
        # Внутри цитаты могут стоять <ref> — сравниваем без них, позицию ищем по последнему слову.
        no_ref = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', flat, flags=re.S)
        if quote not in no_ref:
            sys.exit(f'{where}: цитаты нет в статье: {quote!r}')
        tail = quote[-40:]
        i = flat.find(tail)
        quote = tail
    # Вики ставит сноску в конце предложения или абзаца: первая <ref> до конца абзаца.
    after = flat[i + len(quote):].split('\n', 1)[0]
    m = re.search(r'(<ref[^>]*/>|<ref[^>]*>.*?</ref>)', after, re.S)
    return cite(m.group(1), named_refs(text)) if m else None


def main():
    dump = sys.argv[1]
    # Не у всех сфер есть своя статья в FR Wiki (Refuge, Darnannon — на Spelljammer Wiki): факты о них — в цитатах.
    titles = {t for _, t in BODIES} | {SPHERE} | {f[4] for f in FLOWS} | {g[3] for g in GROUPS} | {TYPICAL[0]}
    pages = read_dump(dump, titles, optional={t for *_, t in SPHERES})

    sphere_box = celestial_box(pages[SPHERE]) or {}
    radius = clean(sphere_box.get('radius', ''))
    realm = {
        'source': f'Forgotten Realms Wiki, дамп {os.path.basename(os.path.dirname(dump))}', 'license': LICENSE,
        'attribution': ATTRIBUTION,
        'note': 'Год в месяцах пересчитан по 30 дней (месяц Harptos). Начальные углы орбит книги не задают — их ставит схема.',
        'sphere': {'id': 'realmspace', 'name': SPHERE, 'url': WIKI + SPHERE, 'radiusMi': float(radius) if radius else None,
                   'refs': refs_in(sphere_box.get('radius', '') + sphere_box.get('class refs', ''), named_refs(pages[SPHERE]))},
        'bodies': [body_of(bid, t, pages[t]) for bid, t in BODIES],
    }

    flows = []
    for a, b, days, way, art, quote in FLOWS:
        ref = find_quote(pages[art], quote, f'{a} → {b}')
        flows.append({'from': a, 'to': b, 'days': days, 'way': way, 'quote': quote, 'url': WIKI + art,
                      'ref': ref})
    groups = [{'id': gid, 'name': name, 'members': members, 'quote': q, 'url': WIKI + art,
               'ref': find_quote(pages[art], q, gid)} for gid, name, members, art, q in GROUPS]
    phlog = {
        'source': f'Forgotten Realms Wiki, дамп {os.path.basename(os.path.dirname(dump))}', 'license': LICENSE,
        'attribution': ATTRIBUTION,
        'typicalDays': [10, 100], 'typicalQuote': TYPICAL[1], 'typicalUrl': WIKI + TYPICAL[0],
        'typicalRef': find_quote(pages[TYPICAL[0]], TYPICAL[1], 'typical'),
        'spheres': [{'id': sid, 'name': name, 'kind': 'empire' if sid == 'vodoni' else 'sphere',
                     **({'url': WIKI + t.replace(' ', '_')} if t in pages else {})}
                    for sid, name, t in SPHERES],
        'flows': flows, 'groups': groups,
    }

    out = os.path.join(ROOT, 'content/cosmos')
    os.makedirs(out, exist_ok=True)
    for name, data in (('realmspace.json', realm), ('phlogiston.json', phlog)):
        with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(f"тел {len(realm['bodies'])}, сфер {len(phlog['spheres'])}, течений {len(flows)} → {out}")
    for b in realm['bodies']:
        print(f"  {b['name']}: {b.get('type')} · {b.get('distanceMi')} mi · год {b.get('year')} ({b.get('yearDays')}) · {b['refs'][:2]}")
    for f_ in flows:
        print(f"  {f_['from']} → {f_['to']}: {f_['days']} {f_['way'] or '—'} · {f_['ref']}")


if __name__ == '__main__':
    main()
