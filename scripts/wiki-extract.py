# Выжимка Forgotten Realms Wiki (CC BY-SA, дамп Fandom) для ночной разметки карты (TASKS L2, L3): статьи о местах —
# поля карточки {{Location}}, вступление и раздел о географии без разметки, предложения с расстояниями и ссылками на
# места в них; переадресации — варианты имён. Дамп и выжимка лежат на внешнем диске, в репозиторий не идут.
#
# Запуск: .venv/bin/python -I scripts/wiki-extract.py <dump.xml> <out.jsonl>
#   Дамп: https://s3.amazonaws.com/wikia_xml_dumps/f/fo/forgottenrealms_pages_current.xml.7z (Special:Statistics вики).
#   Выход: строка JSON на статью {title, url, box: {поле: текст}, intro, geo, dist: [{text, links}]};
#   последняя строка — {"redirects": {вариант: статья}}.
import html, json, re, sys
import xml.etree.ElementTree as ET

NS = '{http://www.mediawiki.org/xml/export-0.11/}'
# Карточка может стоять не первой: перед ней бывают {{GA}}, {{otheruses4|…}} (Daggerford, Hellgate Keep). Шаблоны те же,
# что у реестра мира (scripts/world-registry.py), плюс старые имена.
BOX = re.compile(r'\{\{\s*(Location|State|Dungeon|Celestial body|Settlement|Region|Building|Country|Body of water|Mountain|Forest|Road|River|Plane|Island|Geography)\s*\n?\s*\|', re.I)
FIELDS = ('type', 'size', 'region', 'location', 'government', 'rulertype', 'ruler', 'head of state', 'population', 'races',
          'religion', 'aliases', 'alt spelling', 'demonym', 'allegiances', 'exports', 'organizations', 'plane', 'realm')
DIST = re.compile(r'\b(\d[\d,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty|a hundred|hundreds of)\s*[- ]?'
                  r'(miles?|leagues?|days?|hours?|tendays?|weeks?)\b', re.I)
GEO_HEAD = re.compile(r'^==+\s*(Geography|Location|Description|Layout|Environs|Notable locations?|Trade routes?|Travel)\s*==+\s*$', re.I | re.M)


def strip_templates(t):
    out, depth, i = [], 0, 0
    while i < len(t):
        if t.startswith('{{', i):
            depth += 1
            i += 2
        elif t.startswith('}}', i) and depth:
            depth -= 1
            i += 2
        else:
            if depth == 0:
                out.append(t[i])
            i += 1
    return ''.join(out)


def links_of(t):
    return [m.group(1).strip() for m in re.finditer(r'\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]', t)
            if not re.match(r'(File|Image|Category|Media):', m.group(1), re.I)]


def clean(t):
    t = re.sub(r'<ref[^>/]*/>', '', t)
    t = re.sub(r'<ref[^>]*>.*?</ref>', '', t, flags=re.S)
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    t = re.sub(r'\{\|.*?\|\}', '', t, flags=re.S)
    t = strip_templates(t)
    t = re.sub(r'\[\[(?:File|Image|Category|Media):[^\]]*(\[\[[^\]]*\]\][^\]]*)*\]\]', '', t, flags=re.I)
    t = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', t)
    t = re.sub(r'\[\[([^\]]+)\]\]', r'\1', t)
    t = re.sub(r'\[https?://\S+\s([^\]]+)\]', r'\1', t)
    t = re.sub(r"'{2,}", '', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t)
    return re.sub(r'[ \t]+', ' ', re.sub(r'\n{2,}', '\n', t)).strip()


def box_fields(text):
    m = BOX.search(text)
    if not m:
        return None, {}, 0
    # Тело карточки — до её парной }}.
    depth, i = 0, m.start()
    start = i
    while i < len(text):
        if text.startswith('{{', i):
            depth += 1
            i += 2
        elif text.startswith('}}', i):
            depth -= 1
            i += 2
            if depth == 0:
                break
        else:
            i += 1
    body = text[start + 2:i - 2]
    fields = {}
    for part in re.split(r'\n\s*\|', body):
        if '=' in part:
            k, v = part.split('=', 1)
            k = k.strip().lower()
            if k in FIELDS:
                v = clean(v.replace('<br/>', '; ').replace('<br />', '; ').replace('<br>', '; '))
                if v:
                    fields[k] = v[:300]
    return m.group(1), fields, i


def sentences(t):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[A-Z"(])', t) if s.strip()]


def main():
    src, out_path = sys.argv[1], sys.argv[2]
    redirects, n, kept = {}, 0, 0
    with open(out_path, 'w', encoding='utf-8') as out:
        for _, el in ET.iterparse(src, events=('end',)):
            if el.tag != NS + 'page':
                continue
            n += 1
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
            kind, box, end = box_fields(text)
            if not kind:
                continue
            body = text[end:]
            head = GEO_HEAD.search(body)
            first_head = re.search(r'^==', body, re.M)
            intro = clean(body[:first_head.start()] if first_head else body)[:1500]
            geo = ''
            if head:
                nxt = re.search(r'^==[^=]', body[head.end():], re.M)
                geo = clean(body[head.end():head.end() + (nxt.start() if nxt else 6000)])[:2500]
            dist = []
            for para in re.split(r'\n', body):
                if not DIST.search(para):
                    continue
                for s in sentences(para):
                    if DIST.search(s):
                        c = clean(s)
                        if DIST.search(c) and len(c) < 600:
                            dist.append({'text': c, 'links': links_of(s)})
            out.write(json.dumps({'title': title, 'url': 'https://forgottenrealms.fandom.com/wiki/' + title.replace(' ', '_'),
                                  'kind': kind, 'box': box, 'intro': intro, 'geo': geo, 'dist': dist[:40]}, ensure_ascii=False) + '\n')
            kept += 1
            if kept % 5000 == 0:
                print(f'статей о местах {kept} из {n}', file=sys.stderr, flush=True)
        out.write(json.dumps({'redirects': redirects}, ensure_ascii=False) + '\n')
    print(f'страниц {n}, статей о местах {kept}, переадресаций {len(redirects)} → {out_path}', file=sys.stderr)


if __name__ == '__main__':
    main()
