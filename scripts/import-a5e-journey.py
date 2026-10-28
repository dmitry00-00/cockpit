# Правила похода A5E SRD (EN Publishing, CC BY 4.0) — основа режима похода по карте (решение владельца 27.10.2026):
# регионы (описание, местности, уровни, погода d20, особенности, модификаторы занятий) с таблицами встреч d100 по
# уровням 0–4, занятия в пути с исходами, темп A5E и правила (припасы, укрытие, марш-бросок, DC занятий, погода)
# дословно. Пишет content/a5e/journey.json; руками не править — перезапустить.
#
# Запуск: .venv/bin/python -I scripts/import-a5e-journey.py <a5e_srd_14_4_exploration.pdf>
#   PDF — https://a5esrd.com/a5esrd («14. Exploration»), лежит на /Volumes/внешний/datasets/a5e-srd/.
#   Текст снимает scripts/pdf-text.swift (PDFKit). Таблицы встреч в PDF свёрстаны в две колонки и при извлечении
#   перемешиваются, поэтому их строки берутся из HTML тех же глав на a5e.tools (сайт EN Publishing; страницы
#   <регион>.html рядом с PDF, в папке a5e-tools/), а лицензия — у SRD: каждое имя строки обязано найтись в тексте
#   PDF, таблица — покрывать 1–100; иначе ошибка импорта.
import html, json, os, re, subprocess, sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'content/a5e/journey.json')
SOURCE = 'A5E SRD (CC BY 4.0) · https://a5esrd.com/a5esrd — 14. Exploration'
ATTRIBUTION = ('This work includes material taken from the A5E System Reference Document (A5ESRD) by EN Publishing and '
               'available at A5ESRD.com, based on Level Up: Advanced 5th Edition, available at www.levelup5e.com. '
               'The A5ESRD is licensed under the Creative Commons Attribution 4.0 International License.')

REGIONS = ['Blasted Badlands', 'Country Shire', 'Feywood', 'Fiery Hellscape', 'Flowing River', 'Frozen Wastes',
           'Haunted Lands', 'Lofty Mountains', 'Open Roads', 'Parched Sands', 'Restless Sea', 'Rolling Grasslands',
           'Tangled Forest', 'Urban Township', 'Underland Realm', 'Unrelenting Marsh', 'Wartorn Kingdom', 'Dungeons']
# Навык занятия — из первой фразы его текста (факт правила, а не текст).
ACTIVITIES = {
    'Befriend Animal': ['animal-handling'], 'Busk': ['acrobatics', 'athletics', 'performance'], 'Chronicle': ['history'],
    'Cook': ['survival'], 'Cover Tracks': ['survival'], 'Entertain': ['performance'], 'Gather Components': ['arcana', 'nature'],
    'Gossip': ['investigation', 'persuasion'], 'Harvest': ['medicine', 'nature'], 'Hunt and Gather': ['survival'],
    'Pray': ['religion'], 'Rob': ['intimidation', 'sleight-of-hand'], 'Scout': ['perception'], 'Track': ['survival'],
}
OUTCOMES = ['Critical Failure', 'Failure', 'Success', 'Critical Success']


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def pdf_lines(pdf):
    text = subprocess.run(['swift', os.path.join(ROOT, 'scripts/pdf-text.swift'), pdf], check=True, capture_output=True,
                          text=True).stdout
    # PDFKit рвёт кернинговую пару «T» + строчная: «T angled Forest», «T able», «T o».
    lines = [re.sub(r'\bT (?=[a-z])', 'T', l.rstrip()) for l in text.split('\n')]
    # Колонтитул и номер страницы — не текст правил.
    return [l for l in lines if l and not l.startswith('=== page') and l != 'A5E System Reference Document']


def prose(lines):
    t = ' '.join(lines)
    t = re.sub(r'(\w)- (\w)', r'\1-\2', t)  # перенос «Medium- sized» склеивает в «Medium-sized»
    return re.sub(r'\s+', ' ', t).strip()


def section(text, head, nxt):
    m = re.search(re.escape(head) + r'\s(.*?)\s' + re.escape(nxt) + r'\s', text)
    if not m:
        raise SystemExit(f'нет раздела «{head}»')
    return m.group(1).strip()


def norm_rows(t):
    return re.sub(r'\s+', ' ', t.lower().replace('-', '–'))


def heal_gaps(rows, pdf_rows, where):
    """Дыра в таблице сайта (опечатка «57–58» при «60–61» дальше) — граница берётся из PDF: «57–59 mimic» в тексте SRD."""
    rows.sort(key=lambda r: r['from'])
    for a, b in zip(rows, rows[1:]):
        if b['from'] > a['to'] + 1:
            lo, hi = a['to'] + 1, b['from'] - 1
            if f"{a['from']}–{hi} {a['name'].lower()}" in pdf_rows:
                a['to'] = hi
            elif f"{lo}–{b['to']} {b['name'].lower()}" in pdf_rows:
                b['from'] = lo
            else:
                continue
            print(f'  {where}: дыра {lo}–{hi} закрыта по PDF', file=sys.stderr)


def html_tables(path):
    """Страница региона a5e.tools → {уровень: [строки]}: «<h3>X Exploring Tier n</h3>», строки «1–3 Allosaurus (monster)»."""
    t = open(path, encoding='utf-8').read()
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    out = {}
    for m in re.finditer(r'<h3[^>]*>[^<]*Exploring Tier (\d)</h3>(.*?)(?=<h3|<hr|</div>|<footer|$)', t, flags=re.S):
        body = re.sub(r'<br\s*/?>|</p>', '\n', m.group(2))
        body = html.unescape(re.sub(r'<[^>]+>', '', body))
        # Строка в исходнике HTML разорвана переносами — весь блок в одну строку, строки таблицы — по началу «n–m Имя».
        flat = re.sub(r'\s+', ' ', body).strip()
        flat = re.split(r' ?(?:On an odd|\*|G ?On an odd)', flat)[0]
        rows = []
        for r in re.finditer(r'(\d{1,3})(?:[–-](\d{1,3}))? ([A-Z].*?)(?: \(((?i:monster|exploration|social)[^)]*)\)| (Monster|Exploration|Social))?(?= \d{1,3}(?:[–-]\d{1,3})? [A-Z]|$)', flat):
            # У Dungeons вид без скобок и с заглавной («Rat G Monster»); «Rust monster» — имя, а не вид.
            name, kind = r.group(3).strip().rstrip('*'), (r.group(4) or r.group(5) or '').lower() or None
            # «Rat G» — сноска таблицы: на нечётном броске — гигантская версия существа.
            giant = name.endswith(' G')
            name = name[:-2] if giant else name
            low = name.lower()
            typ = ('scenery' if low.startswith('travel scenery') else 'social' if low.startswith('social encounter') or (kind or '').startswith('social')
                   else 'challenge' if kind == 'exploration' else 'monster')
            rows.append({'from': int(r.group(1)), 'to': int(r.group(2) or r.group(1)), 'name': name, 'type': typ,
                         **({'giant': True} if giant else {})})
        out[int(m.group(1))] = rows
    return out


def main():
    lines = pdf_lines(sys.argv[1])
    full = prose(lines)

    rules = {
        'journey': section(full, 'The Journey', 'Navigation'),
        'navigation': section(full, 'Navigation', 'Travel Pace'),
        'forcedMarch': section(full, 'Forced March', 'Mounts and Pack Animals'),
        'mounts': section(full, 'Mounts and Pack Animals', 'Resting and Havens'),
        'havens': section(full, 'Resting and Havens', 'Tracking Supply'),
        'supply': section(full, 'Tracking Supply', 'Vehicles'),
        'vehicles': section(full, 'Vehicles Not all travel', 'Regions A region').replace('', ''),
        'regions': section(full, 'Regions A region', 'Weather Each region').replace('', ''),
        'weather': section(full, 'Weather Each region', 'Encounters Each region'),
        'encounters': section(full, 'Encounters Each region', 'Journey Activities Adventurers'),
        'activities': section(full, 'Journey Activities Adventurers', 'Befriend Animal An adventurer'),
    }
    rules['vehicles'] = 'Not all travel ' + rules['vehicles']
    rules['regions'] = 'A region ' + rules['regions']
    rules['weather'] = 'Each region ' + rules['weather']
    rules['encounters'] = 'Each region ' + rules['encounters']
    rules['activities'] = 'Adventurers ' + rules['activities']

    # Занятия: текст от имени до следующего имени; исходы — по меткам.
    names = list(ACTIVITIES)
    tail = full[full.index('Befriend Animal An adventurer'):full.index('In some campaigns the wilderness')]
    activities = []
    for i, n in enumerate(names):
        start = tail.index(n + ' ')
        end = tail.index(names[i + 1] + ' ', start + len(n)) if i + 1 < len(names) else len(tail)
        body = tail[start + len(n):end].strip()
        parts = re.split(r'\b(Critical Failure|Failure|Success|Critical Success)\.\s?', body)
        intro, outcomes = parts[0].strip(), {}
        for k in range(1, len(parts) - 1, 2):
            key = {'Critical Failure': 'criticalFailure', 'Failure': 'failure', 'Success': 'success',
                   'Critical Success': 'criticalSuccess'}[parts[k]]
            outcomes.setdefault(key, parts[k + 1].strip())
        activities.append({'id': slug(n), 'name': n, 'skills': ACTIVITIES[n], 'text': intro, 'outcomes': outcomes})

    # Регионы: заголовок — строка с именем; описание и поля до первой таблицы региона.
    starts = {}
    for n in REGIONS:
        idx = next((i for i, l in enumerate(lines) if l == n and i > 700), None)
        if idx is None:
            raise SystemExit(f'нет региона «{n}»')
        starts[n] = idx
    order = sorted(REGIONS, key=lambda n: starts[n])
    regions, missing, errors = [], [], []
    pdf_norm = norm(full)
    # Склейка строк PDF, где номер строки таблицы разорван переносом: «57–5» + «9 Mimic» → «57–59 Mimic».
    pdf_rows = ''
    for l in lines:
        pdf_rows += l if pdf_rows and re.search(r'\d$', pdf_rows) and re.match(r'^\d', l) else ' ' + l
    pdf_rows = norm_rows(pdf_rows)
    for k, n in enumerate(order):
        a = starts[n] + 1
        b = starts[order[k + 1]] if k + 1 < len(order) else len(lines)
        block = lines[a:b]
        first_table = next(i for i, l in enumerate(block) if l.startswith('TABLE:'))
        head = prose(block[:first_table])
        head = re.split(r' (?:D100 ENCOUNTER|TABLE:)', head)[0]
        # Поле — «Метка. текст», метка стоит после точки предыдущего предложения. Имя занятия («…to Hunt and Gather.»)
        # выглядит так же, но меткой не считается.
        label = r"(?:[A-Z][a-z’']+)(?: (?:[A-Z][a-z’']+|of|the|and)){0,3}"
        marks = [m for m in re.finditer(r'(?:(?<=\. )|^)(' + label + r')\. ', head) if m.group(1) not in ACTIVITIES]
        fields = {}
        for k, m in enumerate(marks):
            end = marks[k + 1].start() if k + 1 < len(marks) else len(head)
            fields[m.group(1)] = head[m.end():end].strip()
        desc = head.split(' Terrains.')[0] if ' Terrains.' in head else head
        weather = []
        for m in re.finditer(r'(\d+)(?:–(\d+))? ([a-z ]+?)(?:,|\.|$)', fields.get('Weather', '')):
            weather.append({'from': int(m.group(1)), 'to': int(m.group(2) or m.group(1)), 'weather': m.group(3).strip()})
        page = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'a5e-tools', slug(n) + '.html')
        if not os.path.exists(page):
            raise SystemExit(f'нет страницы {page}')
        enc, gaps, overlaps = {}, {}, {}
        for tier, rows in sorted(html_tables(page).items()):
            heal_gaps(rows, pdf_rows, f'{n} {tier}')
            covered = [x for r in rows for x in range(r['from'], r['to'] + 1)]
            if not set(covered) <= set(range(1, 101)):
                errors.append(f'{n} уровень {tier}: строки выходят за 1–100')
            # Пересечение строк есть и в самой книге («66–68 Poisonous snake», «67–69 Lost item») — оставляем как есть:
            # бросок берёт первую строку, в которую попал; пересечения записаны, чтобы их было видно.
            dup = sorted({x for x in covered if covered.count(x) > 1})
            if dup:
                overlaps[str(tier)] = dup
                print(f'  {n} {tier}: строки пересекаются — {dup}', file=sys.stderr)
            # Дыра и в самом SRD (Blasted Badlands, уровень 4: «48–53», «55–60») — остаётся дырой: на ней бросок повторяют.
            holes = sorted(set(range(1, 101)) - set(covered))
            if holes:
                gaps[str(tier)] = holes
                print(f'  {n} {tier}: дыра, по PDF не закрылась — {holes}', file=sys.stderr)
            for r in rows:
                # Пояснение в скобках («Spell-warped chuul (chuul variant)») — не часть имени для сверки.
                if r['type'] in ('monster', 'challenge') and norm(r['name'].split(' (')[0]) not in pdf_norm:
                    r['unverified'] = True
                    missing.append(f'{n} {tier}: {r["name"]}')
            enc[str(tier)] = rows
        regions.append({'id': slug(n), 'name': n, 'description': desc,
                        'fields': {k: v for k, v in fields.items() if k != 'Weather'}, 'weather': weather,
                        'encounters': enc, **({'gaps': gaps} if gaps else {}), **({'overlaps': overlaps} if overlaps else {})})

    pace = [  # TABLE: TRAVEL PACE — числа и эффекты дословно (колонки PDF разорваны, собраны руками по тексту).
        {'id': 'crawl', 'name': 'Crawl', 'feetPerMinute': 50, 'milesPerHour': 0.5, 'milesPerDay': 4,
         'effect': 'Advantage on Survival checks to cover tracks'},
        {'id': 'slow', 'name': 'Slow/Wagon', 'feetPerMinute': 200, 'milesPerHour': 2, 'milesPerDay': 16, 'effect': None},
        {'id': 'normal', 'name': 'Normal', 'feetPerMinute': 300, 'milesPerHour': 3, 'milesPerDay': 24, 'effect': 'Unable to use Stealth'},
        {'id': 'fast', 'name': 'Fast/Mounted', 'feetPerMinute': 400, 'milesPerHour': 4, 'milesPerDay': 32,
         'effect': '–5 penalty to passive Perception and disadvantage on Perception checks'},
        {'id': 'gallop', 'name': 'Gallop', 'feetPerMinute': 800, 'milesPerHour': 8, 'milesPerDay': None,
         'effect': 'Disadvantage on Survival checks to track', 'note': 'A mount can only travel at gallop speed for 1 hour each day. Otherwise it travels at the fast/mounted pace.'},
    ]
    extreme = [{'name': m.group(1).strip(), 'cr': m.group(2)} for m in re.finditer(r'● ([A-Za-z ]+?) \(CR ([\d/]+)\)', rules['weather'])]

    if errors:
        raise SystemExit('\n'.join(errors))
    if missing:
        print(f'имён нет в тексте SRD: {len(missing)} — ' + '; '.join(missing[:40]), file=sys.stderr)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out = {'source': SOURCE, 'license': 'CC BY 4.0', 'attribution': ATTRIBUTION, 'fetchedAt': date.today().isoformat(),
           'activityDc': {'0': 10, '1': 12, '2': 14, '3': 16, '4': 18},
           'dcModifiers': [{'name': 'Inclement Weather', 'dc': 2}, {'name': 'Multitasking', 'dc': 3}, {'name': 'Hostile Territory', 'dc': 4}],
           'pace': pace, 'extremeWeather': extreme, 'rules': rules, 'activities': activities, 'regions': regions}
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    n_rows = sum(len(t) for r in regions for t in r['encounters'].values())
    print(f'регионов {len(regions)}, таблиц {sum(len(r["encounters"]) for r in regions)}, строк {n_rows}, '
          f'занятий {len(activities)} → {OUT}', file=sys.stderr)


if __name__ == '__main__':
    main()
