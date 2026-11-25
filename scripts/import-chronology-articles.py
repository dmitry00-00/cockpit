# Хронология сверх статей-годов (ROADMAP Х, 30.10.2026): события из других статей Forgotten Realms Wiki (CC BY-SA 3.0)
# отдельным слоем — content/chronology/articles/. Основной слой (content/chronology/index.json и events/ —
# import-chronology.py) не трогается: формат src/world/chronology.ts прежний.
#
# Откуда (замер 30.10 по дампу 2026-10-21):
#   * timeline — статьи-летописи списком «; [[N DR]] : строка» и «: строка» под ним (History of Cormyr (timeline),
#     History of Impiltur, History of the Moonshae Isles… — 20 статей, 411 заголовков лет) и «'''{{Yearlink|N}}'''»
#     с пунктами «*» (Crown Wars timeline). «List of … in chronological order» — изданное, не события: не берётся;
#   * conflict — карточки {{Conflict}} с годом DR в date (127 из 164): строка — первое предложение статьи как есть,
#     год начала и конца — из date, стороны (combatantN) — ссылками;
#   * event — карточки {{Event}} с годом DR в date и без frequency (54): разовые события (Time of Troubles, Karsus's
#     Folly); праздники с частотой — не события года;
#   * history — проза разделов History статей-держав (import-kingdoms.py, is_kingdom) и статей «History of <держава>»:
#     предложение как есть, если оно начинается с указания времени («In 1356 DR, …», «By {{Yearlink|-339}} …», «During
#     …») и в нём ровно один год. Предложение с двумя годами или с годом в середине — не событие: год в нём может
#     быть годом рождения или ссылкой назад (решение кокпита — точность важнее полноты).
#
# Каждое событие несёт src (статья, раздел, откуда), ссылки — как в основном слое (ref — id справочника тем же
# import-chronology.ref_resolver, включая kingdom:), сноски. Вида (kind) статьи-годов у таких строк нет — kind только у
# конфликтов («conflicts»); reviewed редакторские рубрики остальных применяются отдельным слоем по fingerprint.
# Для новых/изменённых строк без reviewed записи kind отсутствует, а не угадывается.
#
# Дубли со статьями-годами: событие того же года (не «изданное»), с которым у строки не меньше трёх общих слов и доля
# общих слов ≥ 0,5 (или ≥ 2 общие ссылки и доля ≥ 0,3), получает same — id события основного слоя. Не удаляется: в статье-летописи
# строка часто подробнее; вид решает, показывать ли её рядом.
#
# Выход: content/chronology/articles/index.json (счётчики, куски по тем же годам, что основной слой) и
# articles/<n>.json. Идёт после import-kingdoms.py и import-chronology.py; import-kingdoms.py — ещё раз после него
# (годы держав по ссылкам этого слоя).
#
# Запуск: .venv/bin/python -I scripts/import-chronology-articles.py <dump.xml> [--classification-file <json>] [--content-root <content-dir>]
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
pp = _load('people', 'import-people.py')
ch = _load('chronology', 'import-chronology.py')
kd = _load('kingdoms', 'import-kingdoms.py')
cc = _load('chronology_classification', 'chronology_classification.py')
NS = sj.NS

YEAR = r'(?:\[\[(-?\d+) DR(?:\|[^\]]*)?\]\]|\{\{\s*Yearlink(?:Name)?\s*\|\s*(-?\d+)[^}]*\}\})'
DL_HEAD = re.compile(r"^;\s*(?:'''|c\.\s*|circa\s*)?" + YEAR + r"[^:\n]*?(?::\s*(.*))?$", re.I)
BOLD_HEAD = re.compile(r"^'''" + YEAR + r"'''\s*$")
TEMPORAL = re.compile(r"^(?:In|By|During|Around|Circa|c\.|Early in|Late in|Later in|Sometime in|At the (?:start|end|beginning) of)\b", re.I)
BOX = re.compile(r'\{\{\s*(Conflict|Event)\s*\n')
SKIP_TITLE = re.compile(r'^List of |in chronological order|\(in-universe\)$')
CHUNKS = ch.CHUNKS


def years_in(raw):
    """Годы DR в строке вики: ссылки на статьи-годы, {{Yearlink}}, и «N DR» текстом."""
    found = [int(a or b) for a, b in re.findall(YEAR, raw)]
    found += [int(x.replace(',', '')) for x in re.findall(r'(?<![\w\-−])(-?\d[\d,]*) DR\b', kd.render(raw))]
    return list(dict.fromkeys(found))


def scan(path):
    """Один проход: перенаправления и статьи-источники — летописи, Conflict/Event, державы, «History of …»."""
    pages, redirects = {}, {}
    for _, el in ET.iterparse(path, events=('end',)):
        if el.tag != NS + 'page':
            continue
        if el.findtext(NS + 'ns') == '0':
            t = el.findtext(NS + 'title')
            r = el.find(NS + 'redirect')
            if r is not None:
                redirects[t] = r.get('title')
            elif not re.fullmatch(r'-?\d+ DR', t or '') and not SKIP_TITLE.search(t or ''):
                text = el.findtext(f'{NS}revision/{NS}text') or ''
                kinds = set()
                if re.search(r'^(?:;|' + "'''" + r')\s*(?:c\.\s*|circa\s*)?' + YEAR, text, re.M | re.I):
                    kinds.add('timeline')
                if BOX.search(text):
                    kinds.add('box')
                if kd.BOX.search(text) and kd.is_kingdom(text):
                    kinds.add('kingdom')
                if t.startswith('History of '):
                    kinds.add('historyof')
                if kinds:
                    pages[t] = (text, kinds)
        el.clear()
    return pages, redirects


def keep_refs(text):
    """Сноски → метки \\x00n\\x00 (источник строки), многострочные шаблоны без сноски — долой."""
    refs = []

    def keep(m):
        refs.append(m.group(0))
        return f'\x00{len(refs) - 1}\x00'
    text = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', keep, text, flags=re.S)
    return text, refs


def sections(text):
    """[(раздел второго уровня, подраздел, тело)] по заголовкам; до первого — ('', '', вступление)."""
    parts = re.split(r'^(=+)\s*(.*?)\s*\1\s*$', text, flags=re.M)
    out, top = [('', '', parts[0])], ''
    for i in range(1, len(parts) - 2, 3):
        name = kd.render(parts[i + 1])
        if len(parts[i]) <= 2:
            top = name
        out.append((top, name, parts[i + 2]))
    return out


def link_list(raw, ref_of):
    out, seen = [], set()
    for target in kd.links(raw):
        if target in seen:
            continue
        seen.add(target)
        r = ref_of(target)
        out.append({'t': target, **({'ref': r} if r else {})})
    return out


def first_sentence(t):
    m = re.match(r'(.+?[.!?])(?:\s+(?=[A-Z"\'])|$)', t)
    return m.group(1) if m else t


def main():
    parser = argparse.ArgumentParser(description='Импорт дополнительной хроники FR Wiki.')
    parser.add_argument('dump', help='XML-дамп вики')
    parser.add_argument('--classification-file', help='файл редакторских классификаций; по умолчанию профиль проекта FR')
    parser.add_argument('--content-root', help='корень слоёв content; по умолчанию <корень проекта>/content')
    args = parser.parse_args()
    content_paths.set_content_root(args.content_root)
    pages, redirects = scan(args.dump)
    follow = pp.follower(redirects)
    ref_of = ch.ref_resolver(follow)
    with open(content_paths.content_path(ROOT, 'chronology', 'index.json'), encoding='utf-8') as fh:
        year_names = {y['year']: y['name'] for y in json.load(fh)['years'] if y.get('name')}
    kingdom_titles = {t for t, (_, kinds) in pages.items() if 'kingdom' in kinds}

    events, counts = [], {}

    def add(year, raw, src, names, refs, date=None, kind=None, to=None, text=None):
        own = ''.join(refs[int(i)] for i in re.findall(r'\x00(\d+)\x00', raw))
        raw = re.sub(r'\x00\d+\x00', '', raw)
        # kd.render, а не ch.text_of: {{YearlinkName|1365}} — «Year of …, 1365 DR», а не пусто.
        t = text or kd.render(raw, year_names)
        if not t or len(t) < 12:
            return
        cites = sj.refs_in(own, names)[:3]
        events.append({
            'year': year, **({'to': to} if to is not None and to != year else {}),
            **({'kind': kind} if kind else {}), 'text': t[:600],
            **({'month': date['month']} if date and 'month' in date else {}),
            **({'day': date['day']} if date and 'day' in date else {}),
            **({'festival': date['festival']} if date and 'festival' in date else {}),
            **({'when': date['when']} if date and 'when' in date else {}),
            **({'links': ls} if (ls := link_list(raw, ref_of)) else {}),
            **({'cites': cites} if cites else {}),
            'src': src,
        })
        counts[src['how']] = counts.get(src['how'], 0) + 1

    for title, (text, kinds) in sorted(pages.items()):
        names = sj.named_refs(text)
        body, refs = keep_refs(re.split(r'^==\s*(?:Appendix|References|Notes|Gallery|See also|Further reading)\s*==', text, flags=re.M)[0])
        timeline = False
        if 'timeline' in kinds:
            section, year = '', None
            for line in body.split('\n'):
                if (h := re.match(r'^(=+)\s*(.*?)\s*\1\s*$', line)):
                    section, year = kd.render(h.group(2)), None
                    continue
                if (m := DL_HEAD.match(line)) or (m := BOLD_HEAD.match(line)):
                    year = int(m.group(1) or m.group(2))
                    rest = m.group(3) if m.re is DL_HEAD else None
                    if rest and rest.strip():
                        date, rest = ch.split_date(rest)
                        add(year, rest, {'title': title, **({'section': section} if section else {}), 'how': 'timeline'}, names, refs, date)
                        timeline = True
                    continue
                if year is not None and (m := re.match(r'^(?::+|\*+)\s*(.*)$', line)) and m.group(1).strip():
                    date, rest = ch.split_date(m.group(1))
                    add(year, rest, {'title': title, **({'section': section} if section else {}), 'how': 'timeline'}, names, refs, date)
                    timeline = True
                elif line.startswith(';'):
                    year = None
        if 'box' in kinds:
            m = BOX.search(text)
            box = kd.box_of(text, BOX)
            f = box['fields']
            raw_date = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', f.get('date', ''), flags=re.S)
            ys = years_in(raw_date)
            if ys and not (m.group(1) == 'Event' and f.get('frequency', '').strip()):
                head = re.match(r'^(.*?)[,\s]*(?:\[\[|\{\{|-?\d)', raw_date)
                date = ch.when_of(kd.render(head.group(1))) if head and kd.render(head.group(1)) else None
                if date:
                    date['when'] = kd.render(head.group(1))
                lead = kd.lead(text, box['end'], year_names)
                if lead:
                    sides = ''.join(f.get(f'combatant{i}', '') for i in range(1, 6))
                    raw = f'[[{title}]] ' + sides + ' ' + f.get('place', '') + f.get('location', '')
                    to = ys[1] if len(ys) > 1 and ys[1] >= ys[0] else None
                    add(ys[0], raw, {'title': title, 'how': m.group(1).lower()}, names, [], date,
                        'conflicts' if m.group(1) == 'Conflict' else None, to, first_sentence(lead))
        if not timeline and ('kingdom' in kinds or ('historyof' in kinds and follow(title[11:]) in kingdom_titles)):
            hist = 'historyof' in kinds
            for top, sec, chunk in sections(body):
                if not hist and not re.match(r'History|Timeline', top):
                    continue
                for para in chunk.split('\n'):
                    if not para.strip() or para.lstrip()[:1] in ';:*{|[!#<':
                        continue
                    for sent in re.split(r'(?<=[.!?])((?:\x00\d+\x00)*)\s+(?=[A-Z\[\'"{])', para)[::2]:
                        ys = years_in(sent)
                        plain = kd.render(re.sub(r'\x00\d+\x00', '', sent))
                        if len(ys) == 1 and TEMPORAL.match(plain):
                            add(ys[0], sent, {'title': title, **({'section': sec} if sec else {}), 'how': 'history'}, names, refs)

    # Одна строка в двух статьях (раздел History державы и «History of …») — один раз.
    seen, uniq = set(), []
    for e in events:
        key = (e['year'], re.sub(r'\W+', ' ', e['text'].lower()).strip())
        if key not in seen:
            seen.add(key)
            uniq.append(e)
    dropped = len(events) - len(uniq)
    events = uniq

    # Дубли со статьями-годами.
    base = {}
    for path in glob.glob(content_paths.content_path(ROOT, 'chronology', 'events', '*.json')):
        with open(path, encoding='utf-8') as fh:
            for e in json.load(fh)['events']:
                base.setdefault(e['year'], []).append(e)
    words = lambda t: set(w for w in re.findall(r'[a-zà-ÿ]+', t.lower()) if len(w) > 3)
    same = 0
    for e in events:
        we, le = words(e['text']), {follow(l['t']) for l in e.get('links', [])}
        best, score = None, 0.0
        for b in base.get(e['year'], []):
            if b['kind'] == 'publications':
                continue
            wb = words(b['text'])
            both = len(we & wb)
            share = both / max(1, min(len(we), len(wb)))
            common = len(le & {follow(l['t']) for l in b.get('links', [])})
            # Короткая строка («Moondale was founded», название изданного) совпадает с чем угодно — нужно три общих слова.
            if both >= 3 and (share >= 0.5 or (common >= 2 and share >= 0.3)) and share > score:
                best, score = b['id'], share
        if best:
            e['same'] = best
            same += 1

    events.sort(key=lambda e: (e['year'], e.get('month', 13), e.get('day', 31), e['src']['title']))
    n_of = {}
    for e in events:
        n_of[e['year']] = n_of.get(e['year'], 0) + 1
        e['id'] = f"a{e['year']}-{n_of[e['year']]}"
        # id — первым ключом, как в основном слое.
        e_items = list(e.items())
        e.clear()
        e.update([('id', e_items[-1][1])] + [kv for kv in e_items if kv[0] != 'id'])

    # Editorial categories are source-bound metadata. Changed/new records stay unclassified.
    events, classification_counts = cc.apply_classifications(
        events, cc.load_review(args.classification_file) if args.classification_file else cc.load_review(),
        [e for year_events in base.values() for e in year_events],
    )

    out = content_paths.content_path(ROOT, 'chronology', 'articles')
    os.makedirs(out, exist_ok=True)
    for old in glob.glob(os.path.join(out, '*.json')):
        os.remove(old)
    chunks = []
    for i, (lo, hi) in enumerate(zip(CHUNKS, CHUNKS[1:])):
        part = [e for e in events if lo <= e['year'] < hi]
        if not part:
            continue
        with open(os.path.join(out, f'{i}.json'), 'w', encoding='utf-8') as fh:
            json.dump({'events': part}, fh, ensure_ascii=False, separators=(',', ':'))
            fh.write('\n')
        chunks.append({'n': i, 'from': part[0]['year'], 'to': part[-1]['year'], 'events': len(part)})
    by_how = {}
    for e in events:
        by_how[e['src']['how']] = by_how.get(e['src']['how'], 0) + 1
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump({'attribution': sj.ATTRIBUTION, 'license': sj.LICENSE,
                   'note': 'События из статей вики сверх статей-годов: летописи списком (timeline), карточки Conflict и Event с годом '
                           '(conflict, event), предложения разделов History держав с годом в начале (history). Строки по-английски, как '
                           'в вики; src — статья и раздел; same — id совпадающего события content/chronology/events.',
                   'sources': by_how, 'same': sum(1 for e in events if 'same' in e), 'chunks': chunks,
                   'classification': {'version': cc.VERSION, **classification_counts}},
                  fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    linked = sum(1 for e in events if any('ref' in l for l in e.get('links', [])))
    print(f'{len(events)} событий из {len({e["src"]["title"] for e in events})} статей: {by_how}; повторов внутри слоя снято {dropped}; '
          f'совпало со статьями-годами {same}; со ссылкой на справочник {linked}; с датой Харптоса '
          f'{sum(1 for e in events if "month" in e or "festival" in e)}; куски {[(c["n"], c["events"]) for c in chunks]}')


if __name__ == '__main__':
    main()
