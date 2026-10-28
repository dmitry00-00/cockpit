# Ночная разметка карты локальной LLM (TASKS L0–L3): очередь задач из реестра карты, итог — maps/llm/<задача>.jsonl
# (не в git), реестр подтягивает его по id записи. Модель только локальная — через llm-gateway (:8711) под именем
# «cockpit»: шлюз его не знает и пускает только к бесплатным бэкендам, платный запасной не включится.
#
# Запуск: .venv/bin/python scripts/llm-markup.py content/maps/toril.json [--tasks L1,L3] [--model local-model|qwen]
#           [--until 07:30] [--limit N] [--sample N] [--out maps/llm] [--force]
#   --sample N — пробный прогон: N случайных записей на задачу, итог в maps/llm/sample-<модель>/, очередь не трогает.
#   --force    — не проверять, запущено ли тяжёлое (тесты, сборка, OCR), и свободна ли память.
#
# Задачи:
#   L1 — класс подписи растра без пары в GIS (реестр: raster_only). Сначала правила (значок, цвет, капитель, слово
#        в имени), модель — только для остатка, пакетами через /v1/classify шлюза.
#   L2 — расстояния из текстов вики: в каждом предложении с милями, лигами или днями пути — пары «место A — место B —
#        число, единица, способ пути». Очередь — предложения выжимки вики (scripts/wiki-extract.py), id «wiki:<статья>#<n>».
#   L3 — карточка места по-русски: что это, кто правит, чем опасно — только из описания GIS и статьи вики (поля карточки,
#        вступление). Нет ни того, ни другого — нет карточки (status no_input), модель не сочиняет. Имена в ответе, которых
#        нет во входе, — status review. Текст вики — CC BY-SA: у карточки source и license.
#   L4 — карточка плана (статьи вики с карточкой Plane) тем же запросом, что L3; id «plane:<статья>». Свойства плана —
#        поля вики, их берёт импортёр, не модель.
#   F  — готовые карточки L4 и L3 по нынешним правилам проверки: регистр — без модели, карточка с переведённым именем —
#        заново (строка на месте, redo: true).
#   R  — второе мнение (--second, по умолчанию qwen) по строкам review: L1 — тот же класс, L3 — имена вне входа
#        оправданы, L2 — те же пары. Согласие — done с полем second, иначе review остаётся. Файлы переписываются.
#   Выжимка вики: --wiki <fr-wiki-places.jsonl>, по умолчанию самая свежая /Volumes/внешний/datasets/fr-wiki-*/.
# Статусы строк: done, review (проверить глазами), no_input, failed. Повторный запуск пропускает done/review/no_input.
import difflib, glob, json, os, random, re, subprocess, sys, time, urllib.request
from collections import defaultdict
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GATEWAY = 'http://127.0.0.1:8711'
CONSUMER = 'cockpit'
HEAVY = ['vitest', 'vite.js build', 'tsc -b', 'map_ocr.py', 'gazetteer-from-map', 'terrain-from-map', 'tile-map.py', 'map-registry.py']

CLASSES = ['settlement', 'fortress', 'ruins', 'temple', 'mine', 'mountain', 'hills', 'forest', 'swamp', 'desert',
           'lake', 'river', 'sea', 'island', 'pass', 'region', 'road', 'other']
L1_SYN = {'ford': 'river', 'marsh': 'swamp', 'marshes': 'swamp', 'bog': 'swamp', 'bay': 'sea', 'gulf': 'sea', 'ocean': 'sea',
          'city': 'settlement', 'town': 'settlement', 'village': 'settlement', 'castle': 'fortress', 'keep': 'fortress',
          'tower': 'fortress', 'shrine': 'temple', 'peak': 'mountain', 'mountains': 'mountain', 'wood': 'forest',
          'jungle': 'forest', 'plains': 'region', 'valley': 'region', 'kingdom': 'region', 'country': 'region',
          # Эхо местности из запроса (TERRAIN): под «water» лежат и острова, и рифы, и заливы — класса не знаем.
          'water': 'other', 'ice': 'region', 'terrain': 'region', 'cave': 'other', 'bridge': 'road'}
TERRAIN = {'o': 'water', 'g': 'plains', 'h': 'hills', 'f': 'forest', 'm': 'mountains', 's': 'swamp', 'd': 'desert', 'i': 'ice', 'u': 'unmapped'}


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


# ---------- предохранители ----------

def preflight():
    """Тяжёлое — по одному: не стартовать, пока идут тесты, сборка или разметка растра; и не при нехватке памяти."""
    ps = subprocess.run(['ps', '-axo', 'command'], capture_output=True, text=True).stdout.splitlines()
    busy = [h for h in HEAVY if any(h in line and 'llm-markup' not in line for line in ps)]
    if busy:
        sys.exit(f'llm-markup: идёт тяжёлое ({", ".join(busy)}) — запустить позже или --force')
    free = re.search(r'free percentage: (\d+)%', subprocess.run(['memory_pressure'], capture_output=True, text=True).stdout)
    if free and int(free.group(1)) < 12:
        sys.exit(f'llm-markup: свободной памяти {free.group(1)}% — мало для модели; закрыть лишнее или --force')
    try:
        health = json.load(urllib.request.urlopen(f'{GATEWAY}/health', timeout=5))
    except OSError as e:
        sys.exit(f'llm-markup: llm-gateway не отвечает ({e}) — ~/core/.venv/bin/llm-gateway serve')
    return health


def post(path, body, timeout=900):
    req = urllib.request.Request(f'{GATEWAY}{path}', data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {CONSUMER}'})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def chat(model, system, user, max_tokens=700):
    r = post('/v1/chat/completions', {'model': model, 'temperature': 0, 'max_tokens': max_tokens,
                                      'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]})
    text = r['choices'][0]['message']['content']
    if not (text or '').strip():
        raise RuntimeError('пустой ответ модели')
    return text


def loads(text):
    m = re.search(r'\{.*\}', text, re.S)
    return json.loads(m.group(0)) if m else None


# ---------- L1: класс подписи ----------

WORDS = [
    (r'\b(mountains?|mts?\.?|peaks?|range|spires?|mount|crags?)\b', 'mountain'),
    (r'\b(hills?|downs|heights?|ridge|highlands?|uplands?|escarpment|plateau|mesa)\b', 'hills'),
    (r'\b(wood|woods|forest|jungle|grove|weald|thicket)\b', 'forest'),
    (r'\b(marsh|swamp|fen|bog|mire|moor|morass|wetlands?|mere of)\b', 'swamp'),
    (r'\b(desert|sands?|dunes?|wastes?|barrens?|salt flats?)\b', 'desert'),
    (r'\b(lake|loch|pond|pool|tarn|lagoon|lac)\b', 'lake'),
    (r'\b(river|stream|creek|brook|falls|rapids)\b', 'river'),
    (r'\b(sea|ocean|bay|gulf|strait|sound|channel|bight|cove|harbou?r|shoals?)\b', 'sea'),
    (r'\b(isle|island|islands|isles|atoll|archipelago)\b', 'island'),
    (r'\b(pass|gap|gorge|canyon|vale|valley|dale)\b', 'pass'),
    (r'\b(road|way|trail|route|highway)\b', 'road'),
    (r'\b(castle|keep|fort|citadel|tower|hold|stronghold|garrison|fortress|bastion)\b', 'fortress'),
    (r'\b(ruins?|ruined|tomb|crypt|barrow|necropolis)\b', 'ruins'),
    (r'\b(temple|shrine|abbey|monastery|priory|cloister|church|sanctuary|seminary)\b', 'temple'),
    (r'\b(mines?|delve|quarry)\b', 'mine'),
]
ICON_CLASS = {'village': 'settlement', 'city': 'settlement', 'capital': 'settlement', 'keep': 'fortress', 'ruins': 'ruins',
              'temple': 'temple', 'mine': 'mine', 'peak': 'mountain', 'well': 'lake', 'site': 'fortress'}


def ink_kind(ink):
    if not ink:
        return 'unknown'
    r, g, b = ink
    if b > r + 25 and b > g:
        return 'blue'
    if r > g + 30 and r > b + 30:
        return 'red'
    if max(ink) < 70:
        return 'black'
    return 'olive' if g > b + 15 else 'grey'


def rule_class(e):
    """Класс без модели и почему: значок у подписи, слово в имени, капитель (страны — красные, моря — синие)."""
    t = e['name'].lower()
    for pat, cls in WORDS:
        if re.search(pat, t):
            return cls, f'слово в имени'
    if e.get('icon') and e['icon']['kind'] in ICON_CLASS:
        return ICON_CLASS[e['icon']['kind']], f"значок {e['icon']['kind']}"
    ink = ink_kind(e.get('ink'))
    if e.get('color') == 'red' or (e.get('spaced') and ink == 'red'):
        return 'region', 'красная капитель'
    if e.get('color') == 'blue' or (ink == 'blue' and (e.get('caps') or 0) > 0.9):
        return 'sea', 'синяя капитель'
    return None, ''


def neighbours(entries):
    """Соседи записи в 250 px: имя и класс — модели легче, когда рядом «Neverwinter Wood (forest)»."""
    grid = defaultdict(list)
    for e in entries:
        if 'x' in e and e.get('name'):
            grid[(e['x'] // 250, e['y'] // 250)].append(e)

    def near(e):
        out = []
        for gx in (-1, 0, 1):
            for gy in (-1, 0, 1):
                for o in grid.get((e['x'] // 250 + gx, e['y'] // 250 + gy), []):
                    if o is not e and abs(o['x'] - e['x']) < 250 and abs(o['y'] - e['y']) < 250:
                        out.append(o)
        out.sort(key=lambda o: abs(o['x'] - e['x']) + abs(o['y'] - e['y']))
        return [f"{o['name']}" + (f" ({o['class']})" if o.get('class') else '') for o in out[:6]]
    return near


L1_PROMPT = (
    'You classify labels of a fantasy world map (Forgotten Realms, Toril). For each item decide what the label names. '
    f'Allowed kinds: {", ".join(CLASSES)}. '
    'settlement = city, town or village; fortress = castle, keep, tower, inn or other building; region = country, kingdom, '
    'land or named area; other = not a place or OCR garbage. Use the facts given: the icon next to the label, ink colour '
    '(blue ink names water, red capitals name countries and regions), terrain under the label and the neighbouring labels. '
    'Items are numbered [1], [2], …. Answer only JSON: {"results": [{"id": <item number>, "kind": "<kind>", "confidence": 0..1}]} '
    '— one result per item, in order.'
)


def l1_text(e, near):
    bits = [f"label: {e['name']}"]
    if e.get('rows'):
        bits.append(f"lines: {' / '.join(e['rows'])}")
    bits.append(f"icon next to label: {e['icon']['kind'] if e.get('icon') else 'none'}")
    bits.append(f"ink: {ink_kind(e.get('ink'))}{', spaced capitals' if e.get('spaced') else ', capitals' if (e.get('caps') or 0) > 0.9 else ''}")
    if e.get('terrain'):
        bits.append(f"terrain under label: {TERRAIN.get(e['terrain'], e['terrain'])}")
    ns = near(e)
    if ns:
        bits.append(f"nearby labels: {'; '.join(ns)}")
    return '\n'.join(bits)


def run_l1(entries, model, out, until, limit, done):
    near = neighbours(entries)
    todo = [e for e in entries if e.get('tasks', {}).get('L1') and e['id'] not in done]
    if limit:
        todo = todo[:limit]
    rest = []
    n_rule = 0
    with open(out, 'a', encoding='utf-8') as f:
        for e in todo:
            cls, why = rule_class(e)
            if cls:
                f.write(json.dumps({'id': e['id'], 'task': 'L1', 'status': 'done', 'kind': cls, 'how': 'rule', 'why': why,
                                    'name': e['name'], 'at': datetime.now().isoformat(timespec='seconds')}, ensure_ascii=False) + '\n')
                n_rule += 1
            else:
                rest.append(e)
        print(f'L1: правилами {n_rule}, модели {len(rest)}', file=sys.stderr, flush=True)
        for i in range(0, len(rest), 100):
            if past(until):
                print('L1: время вышло', file=sys.stderr)
                return
            chunk = rest[i:i + 100]
            res = post('/v1/classify', {'model': model, 'prompt': L1_PROMPT, 'labels': CLASSES, 'batch': 20, 'max_chars': 900,
                                        'items': [{'id': e['id'], 'text': l1_text(e, near)} for e in chunk]})
            by = {r['id']: r for r in res['results']}
            for e in chunk:
                r = by.get(e['id'], {})
                row = {'id': e['id'], 'task': 'L1', 'name': e['name'], 'model': res['stats'].get('model'), 'how': 'llm',
                       'at': datetime.now().isoformat(timespec='seconds')}
                if r.get('kind') in CLASSES:
                    conf = r.get('confidence') or 0
                    row.update(status='done' if conf >= 0.6 else 'review', kind=r['kind'], confidence=conf)
                elif (m := re.search(r"вне словаря: '(\w+)'", r.get('error') or '')) and m.group(1) in L1_SYN:
                    # Шлюз отбрасывает метку вне словаря; явные синонимы («ford», «marsh») — на проверку с нашим классом.
                    row.update(status='review', kind=L1_SYN[m.group(1)], confidence=0.5, said=m.group(1))
                else:
                    row.update(status='failed', error=r.get('error') or f"kind {r.get('kind')!r}")
                f.write(json.dumps(row, ensure_ascii=False) + '\n')
            f.flush()
            print(f'L1: модель {min(i + 100, len(rest))}/{len(rest)}', file=sys.stderr, flush=True)


# ---------- вики ----------

def load_wiki(path):
    if not path or not os.path.exists(path):
        return {}, {}
    rows = [json.loads(line) for line in open(path, encoding='utf-8')]
    redirects = rows[-1].get('redirects', {}) if rows and 'redirects' in rows[-1] else {}
    return {r['title']: r for r in rows if 'title' in r}, redirects


_LOOSE = {}


def wiki_page(pages, redirects, names, taken=frozenset()):
    # taken — главные имена других мест карты: переадресация «Ithmong» → «Darromar» не годится для того Ithmong, что в
    # Lapaliiya, если Darromar на карте свой.
    for n in names:
        if n in pages:
            return pages[n]
        if redirects.get(n) in pages and redirects[n] not in taken:
            return pages[redirects[n]]
    # Запасные пути: регистр («Ojy-Do» на карте, «Ojy-do» в вики) и единственная статья-место с уточнением
    # («Amphail» → «Amphail (village)», «Ithmong» → «Ithmong (Lapaliiya)»). Две и больше — не угадываем.
    if id(pages) not in _LOOSE:
        loose = {}
        for t in pages:
            loose.setdefault(t.lower(), set()).add(t)
            base = re.sub(r' \([^)]*\)$', '', t)
            if base != t:
                loose.setdefault(base.lower(), set()).add(t)
        _LOOSE.clear()
        _LOOSE[id(pages)] = loose
    loose = _LOOSE[id(pages)]
    for n in names:
        hit = loose.get(n.lower(), set())
        if len(hit) == 1:
            return pages[next(iter(hit))]
    return None


def wants_l3(e, wiki, entries, _taken={}):
    """Нужна ли месту карточка L3, если её ещё не назначил реестр: есть статья вики. Ставит tasks.L3 и отвечает True."""
    if (e.get('tasks') or {}).get('L3') or not wiki[0]:
        return False
    key = id(entries)
    if key not in _taken:
        _taken.clear()
        _taken[key] = {x['name'] for x in entries}
    if wiki_page(*wiki, [e['name']] + e.get('alt', []), _taken[key] - {e['name']}):
        e.setdefault('tasks', {})['L3'] = 'todo'
        return True
    return False


# ---------- L2: расстояния из вики ----------

L2_PROMPT = (
    'You extract travel distances between places from a sentence of the Forgotten Realms wiki. The sentence comes from the '
    'article named in "Article". For every distance stated between two named places return a pair; "it" or the town itself '
    'means the article subject. Do not compute or guess: only distances written in the sentence. Units: mile, league, day, '
    'hour, tenday. Route: road name if the distance is along a road or river, "direct" if as the crow flies, "" if unknown. '
    'Answer only JSON: {"pairs": [{"from": "...", "to": "...", "value": number, "unit": "mile", "approx": true|false, '
    '"route": "...", "mode": "foot|horse|ship|caravan|"}]}. No distances — {"pairs": []}.'
)


def run_l2(wiki, model, out, until, limit, done):
    pages, _ = wiki
    todo = [(f"wiki:{t}#{i}", p, d) for t, p in pages.items() for i, d in enumerate(p.get('dist', []))]
    todo = [x for x in todo if x[0] not in done]
    if limit:
        todo = todo[:limit]
    n = 0
    with open(out, 'a', encoding='utf-8') as f:
        for wid, page, d in todo:
            if past(until):
                print('L2: время вышло', file=sys.stderr)
                return
            row = {'id': wid, 'task': 'L2', 'article': page['title'], 'text': d['text'], 'links': d['links'], 'url': page['url'],
                   'license': 'CC BY-SA 3.0 (Forgotten Realms Wiki)', 'at': datetime.now().isoformat(timespec='seconds')}
            try:
                res = loads(chat(model, L2_PROMPT, f"Article: {page['title']}\nSentence: {d['text']}", max_tokens=500))
            except Exception as ex:
                res, row['error'] = None, str(ex)[:200]
            if res is None or not isinstance(res.get('pairs'), list):
                row['status'] = 'failed'
            else:
                pairs = [p for p in res['pairs'] if isinstance(p, dict) and p.get('from') and p.get('to') and isinstance(p.get('value'), (int, float))]
                # Число в паре должно стоять в предложении: «225» из «about 225 miles» — да, посчитанное моделью — нет.
                bad = [p for p in pairs if not re.search(rf"\b{re.escape(str(p['value']).rstrip('0').rstrip('.') if isinstance(p['value'], float) else str(p['value']))}\b", d['text'].replace(',', ''))]
                row.update(status='review' if bad else 'done', pairs=pairs, model=model)
            f.write(json.dumps(row, ensure_ascii=False) + '\n')
            f.flush()
            n += 1
            if n % 50 == 0:
                print(f'L2: {n}/{len(todo)}', file=sys.stderr, flush=True)


# ---------- L3: карточка места ----------

L3_PROMPT = (
    'Ты помогаешь мастеру D&D (Forgotten Realms). По описанию места на английском составь короткую карточку по-русски. '
    'Используй только факты из описания; чего в описании нет — оставь поле пустой строкой, не додумывай. '
    # 28.10: «ЛАТИНИЦЕЙ» капсом gemma понимала как «капсом» — «LIMBO», «ХЕКАТЫ» в каждой четвёртой карточке L4.
    'Имена собственные (места, страны, люди, организации, божества, моря, горы) пиши латиницей ровно как во входе, в том '
    'же регистре, не переводи и не склоняй: «в Amn», а не «в Амне»; «Sword Coast», а не «Берег Мечей»; «Hecate», а не '
    '«HECATE» и не «Геката»; «столица — Darromar». '
    'Пустое поле — пустая строка "", а не «не указано». '
    'Ответ — только JSON: {"what": "что это, одна фраза", "ruler": "кто правит или владеет", '
    '"danger": "чем опасно", "summary": "2–3 предложения, до 300 знаков"}.'
)


EMPTY = {'не указано', 'неизвестно', 'нет данных', 'нет', 'не указан', 'не указана', '-', '—', 'n/a', 'none'}


def latin_names(text):
    return set(re.findall(r"\b[A-Z][a-zA-Z'’-]{2,}(?:\s+[A-Z][a-zA-Z'’-]{2,})*", text or ''))


L3_REPAIR = ('\n\nТвой прошлый ответ: {card}\nВ нём имена переведены, искажены или взяты не из входа: {names}. '
             'Верни тот же JSON, где каждое имя собственное — латиницей ровно как во входе; имени, которого во входе нет, не пиши.')


# «Великое колесо», «Мировое древо» — названия моделей космологии, которые и стол пишет по-русски; второе слово — со строчной.
RU_COSMOLOGY = re.compile(r'((?:Велик|Миров)[а-яё]+) ([КкДд])(олес|рев)([а-яё]*)')


def normalize(card, src):
    """Регистр без модели: латинское слово капсом («LIMBO»), которое во входе есть в обычном написании, — к нему;
    «Великого Колеса» — «Великого колеса»."""
    forms = {}
    for w in re.findall(r"[A-Za-z][A-Za-z'’-]+", src):
        if not w.isupper():
            forms.setdefault(w.lower(), w)
    fix = lambda v: RU_COSMOLOGY.sub(lambda m: f'{m[1]} {m[2].lower()}{m[3]}{m[4]}', re.sub(
        r"(?<![A-Za-z])[A-Z][A-Z'’-]{2,}(?![A-Za-z])", lambda m: forms.get(m[0].lower(), m[0]), v))
    return {k: fix(str(v)) for k, v in card.items()}


def l3_check(card, src):
    card = {k: ('' if str(v).strip().lower().rstrip('.') in EMPTY else str(v).strip()) for k, v in card.items()}
    text = RU_COSMOLOGY.sub('', ' '.join(card.values()))
    # Латинское слово с заглавной, которого нет во входе (без учёта регистра: в GIS области капсом), — модель что-то
    # добавила или исказила; кириллица с заглавной в середине предложения — скорее всего, переведённое имя («в Амне»).
    low = src.lower()
    extra = sorted({w.strip("'’-") for n in latin_names(text) for w in n.split() if w.strip("'’-").lower() not in low})
    ru = set(re.findall(r'(?<=[a-zа-яё,;:—–-] )[А-ЯЁ][а-яё]+', text))
    # Кириллица капсом («ХЕКАТЫ», «ПАНДЕМОНИУМа») — переведённое имя где угодно, и в начале фразы.
    ru |= set(re.findall(r'[А-ЯЁ]{3,}[а-яё]*', text))
    # В начале фразы заглавная обычна, поэтому там — только слово, которое транслитом похоже на латинское имя входа
    # (проба L4 28.10: «Абисс» — Abyss, «Аверн» — Avernus).
    # Имя — латинское слово с заглавной, которое во входе ни разу не пишется со строчной: «Mirabar» — да, «Ruins» и
    # «Oligarchy» (есть и «ruins», «oligarchy») — нет.
    lower = set(re.findall(r"\b[a-z][a-z'’-]{3,}", src))
    names = {w.lower() for n in latin_names(src) for w in n.split()
             if len(w) >= 4 and w.lower() not in lower and w.lower() not in BOX_WORDS}
    for w in set(re.findall(r'[А-ЯЁ][а-яё]{3,}', text)) - ru:
        lat = translit(w)
        # Начало имени, а не случайный слог: «Семь» — не Sembia, «Король» — не Korolnor.
        if any(len(lat) >= 0.7 * len(n) and difflib.SequenceMatcher(None, lat, n[:len(lat) + 1]).ratio() >= 0.75 for n in names):
            ru.add(w)
    return card, extra, sorted(ru)


# Общие слова, которые в полях карточки вики пишутся с заглавной: формы правления, титулы, виды мест.
BOX_WORDS = {'ruins', 'oligarchy', 'monarchy', 'theocracy', 'magocracy', 'plutocracy', 'republic', 'council', 'emperor',
             'empress', 'king', 'kings', 'queen', 'lord', 'lords', 'lady', 'sultan', 'caliph', 'trolls', 'bandits',
             'seven', 'sylvan', 'boreal', 'region', 'oasis', 'kingdom', 'empire', 'city', 'town', 'village', 'none'}


TRANSLIT = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm',
                'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'kh', 'ts', 'ch', 'sh', 'sch', '', 'y', '', 'e', 'yu', 'ya']))


def translit(w):
    return ''.join(TRANSLIT.get(c, c) for c in w.lower())


def l3_source(e, gis, wiki, taken):
    """Вход карточки места: описание GIS и статья вики. (src, sources, page) или (None, [], None) — входа нет."""
    pages, redirects = wiki
    descr = (gis.get(e['id']) or {}).get('descr_en') or ''
    page = wiki_page(pages, redirects, [e['name']] + e.get('alt', []), taken - {e['name']}) if pages else None
    parts = [f"Description (Toril GIS): {descr[:1500]}"] if len(descr) >= 40 else []
    if page:
        box = '; '.join(f'{k}: {v}' for k, v in page.get('box', {}).items())
        parts += [f"Wiki infobox: {box}"] if box else []
        parts += [f"Wiki article: {page['intro'][:1500]}"] if page.get('intro') else []
    if not parts:
        return None, [], None
    # Подпись растра капителью (ADBAR ROAD) модель переносит в текст как есть — имя берём из заголовка статьи.
    name = page['title'] if page and e['name'].isupper() and page['title'].lower() == e['name'].lower() else e['name']
    src = f"Name: {name}\nClass: {e.get('class', '')}\n" + '\n'.join(parts)
    return src, (['Toril GIS'] if len(descr) >= 40 else []) + ([page['url']] if page else []), page


def make_card(model, src, row):
    """Карточка по входу с проверкой имён и одним повтором; дописывает в row status, card и что нашла проверка."""
    try:
        card = loads(chat(model, L3_PROMPT, src))
    except Exception as ex:  # сеть, окно модели, кривой JSON
        card, row['error'] = None, str(ex)[:200]
    if not card or not card.get('summary'):
        row['status'] = 'failed'
        return row
    card, extra, ru = l3_check(normalize(card, src), src)
    if extra or ru:
        # Проба 27.10: gemma переводит известные имена («Берег Мечей», «Чулт») даже при запрете — один
        # повтор с её же ответом и списком нарушений; остаётся ответ с меньшим числом нарушений.
        try:
            again = loads(chat(model, L3_PROMPT, src + L3_REPAIR.format(
                card=json.dumps(card, ensure_ascii=False), names=', '.join(extra + ru))))
        except Exception:
            again = None
        if again and again.get('summary'):
            card2, extra2, ru2 = l3_check(normalize(again, src), src)
            if len(extra2) + len(ru2) < len(extra) + len(ru):
                card, extra, ru = card2, extra2, ru2
                row['repaired'] = True
    row.update(status='review' if extra or ru else 'done', card=card, model=model,
               **({'unknown_names': extra} if extra else {}), **({'cyrillic_names': ru} if ru else {}))
    return row


def run_l3(entries, gis, wiki, model, out, until, limit, done):
    taken = {e['name'] for e in entries}
    todo = [e for e in entries if e.get('tasks', {}).get('L3') and e['id'] not in done]
    todo.sort(key=lambda e: (0 if 7400 <= e.get('x', 0) <= 10800 and 1800 <= e.get('y', 0) <= 5200 else 1, e['name']))
    if limit:
        todo = todo[:limit]
    n, streak = 0, [0]
    with open(out, 'a', encoding='utf-8') as f:
        for e in todo:
            if past(until):
                print('L3: время вышло', file=sys.stderr)
                return
            row = {'id': e['id'], 'task': 'L3', 'name': e['name'], 'model': model, 'at': datetime.now().isoformat(timespec='seconds')}
            src, sources, page = l3_source(e, gis, wiki, taken)
            if src is None:
                row['status'] = 'no_input'
            else:
                row['sources'] = sources
                if page:
                    row['license'] = 'CC BY-SA 3.0 (Forgotten Realms Wiki)'
                make_card(model, src, row)
            f.write(json.dumps(row, ensure_ascii=False) + '\n')
            f.flush()
            n += 1
            if n % 20 == 0:
                print(f'L3: {n}/{len(todo)}', file=sys.stderr, flush=True)
            if stalled(row, streak):
                print(f'L3: {MAX_FAILS} отказов подряд — модель не отвечает, остановка', file=sys.stderr)
                return


MAX_FAILS = 10


def stalled(row, streak):
    """Отказы подряд: после MAX_FAILS модель, скорее всего, упала (LM Studio, память) — дальше пойдут одни отказы,
    и прогон останавливается, а не пишет сотни failed (28.10: 402 строки L3 и 276 L4)."""
    streak[0] = streak[0] + 1 if row.get('status') == 'failed' else 0
    return streak[0] >= MAX_FAILS


# ---------- L4: карточка плана ----------

def plane_source(page):
    box = '; '.join(f'{k}: {v}' for k, v in page.get('box', {}).items() if v.lower() != 'yes')
    return (f"Name: {page['title']}\nClass: plane of existence (D&D cosmology)\n" + (f"Wiki infobox: {box}\n" if box else '')
            + f"Wiki article: {page['intro'][:1800]}")


def run_l4(wiki, model, out, until, limit, done):
    """Планы и слои (статьи вики с карточкой Plane): та же карточка, что у места. Свойства плана (гравитация, время,
    изменчивость…) карточка вики даёт полями — их берёт импортёр, не модель; модели — только русский текст."""
    pages, _ = wiki
    todo = [p for t, p in sorted(pages.items()) if p.get('kind') == 'Plane' and f'plane:{t}' not in done]
    if limit:
        todo = todo[:limit]
    n, streak = 0, [0]
    with open(out, 'a', encoding='utf-8') as f:
        for page in todo:
            if past(until):
                print('L4: время вышло', file=sys.stderr)
                return
            row = {'id': f"plane:{page['title']}", 'task': 'L4', 'name': page['title'], 'model': model, 'sources': [page['url']],
                   'license': 'CC BY-SA 3.0 (Forgotten Realms Wiki)', 'at': datetime.now().isoformat(timespec='seconds')}
            if len(page.get('intro') or '') < 40:
                row['status'] = 'no_input'
            else:
                make_card(model, plane_source(page), row)
            f.write(json.dumps(row, ensure_ascii=False) + '\n')
            f.flush()
            n += 1
            if n % 20 == 0:
                print(f'L4: {n}/{len(todo)}', file=sys.stderr, flush=True)
            if stalled(row, streak):
                print(f'L4: {MAX_FAILS} отказов подряд — модель не отвечает, остановка', file=sys.stderr)
                return


# ---------- F: готовые карточки по нынешним правилам ----------

def run_fix(entries, gis, wiki, model, outdir, until):
    """Карточки L4 и L3 по нынешним правилам проверки (28.10: капс, кириллица капсом, «Великое колесо»). Регистр
    правится без модели; карточка с переведённым именем — заново тем же запросом, строка на месте. Имена вне входа
    модель не переделывает: это вопрос второго мнения (R), и строка, которую R уже подтвердил, остаётся готовой."""
    pages, _ = wiki
    by_id = {e['id']: e for e in entries}
    taken = {e['name'] for e in entries}
    for task in ('L4', 'L3'):
        path = os.path.join(outdir, f'{task}.jsonl')
        if not os.path.exists(path):
            continue
        rows = [json.loads(line) for line in open(path, encoding='utf-8')]
        redo, fixed = [], 0
        for i, r in enumerate(rows):
            if r.get('status') not in ('done', 'review') or not r.get('card'):
                continue
            src = plane_source(pages[r['name']]) if task == 'L4' and r['name'] in pages else \
                l3_source(by_id[r['id']], gis, wiki, taken)[0] if task == 'L3' and r['id'] in by_id else None
            if not src:
                continue
            card, extra, ru = l3_check(normalize(r['card'], src), src)
            if 'second' in r:
                extra = []
            if ru:
                redo.append((i, src))
                continue
            was = (r['card'], r['status'])
            r.update(card=card, status='review' if extra else 'done')
            r.pop('cyrillic_names', None)
            if (card, r['status']) != was:
                fixed += 1
        rewrite(path, rows)
        print(f'F {task}: поправлено без модели {fixed}, заново {len(redo)}', file=sys.stderr, flush=True)
        for k, (i, src) in enumerate(redo):
            if past(until):
                print('F: время вышло', file=sys.stderr)
                return
            r = rows[i]
            row = {key: r[key] for key in ('id', 'task', 'name', 'sources', 'license') if key in r}
            row.update(model=model, at=datetime.now().isoformat(timespec='seconds'), redo=True)
            rows[i] = make_card(model, src, row)
            if (k + 1) % 10 == 0 or k + 1 == len(redo):
                rewrite(path, rows)
                print(f'F {task}: {k + 1}/{len(redo)}', file=sys.stderr, flush=True)


# ---------- R: второе мнение по строкам «на проверку» ----------

L3_VERIFY = (
    'You check a short Russian card about a Forgotten Realms place against its English source. For each listed word '
    'used in the card, decide: "ok" if it is in the source, is a regular derived form of a name in the source '
    '(Sembian from Sembia, Cormyrean from Cormyr), or an ordinary English word; "bad" if the name is not supported by '
    'the source. Answer only JSON: {"ok": ["..."], "bad": ["..."]}.'
)


def rewrite(path, rows):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    os.replace(tmp, path)


def pair_key(pairs):
    return sorted((str(p.get('from', '')).lower(), str(p.get('to', '')).lower(), float(p.get('value', 0)), str(p.get('unit', '')).rstrip('s'))
                  for p in pairs if isinstance(p, dict))


def run_recheck(entries, gis, wiki, model, outdir, until):
    """Строки «на проверку» L1, L3, L2 — второй модели. Согласие двух моделей — done (с полем second), несогласие —
    остаётся review, ответ второй модели рядом. Строка с second повторно не проверяется; отказ модели second не пишет. Файлы переписываются на месте."""
    by_id = {e['id']: e for e in entries}
    taken = {e['name'] for e in entries}
    near = neighbours(entries)
    for task in ('L1', 'L3', 'L2'):
        path = os.path.join(outdir, f'{task}.jsonl')
        if not os.path.exists(path):
            continue
        rows = [json.loads(line) for line in open(path, encoding='utf-8')]
        todo = [i for i, r in enumerate(rows) if r.get('status') == 'review' and 'second' not in r]
        if task == 'L3':
            # Переведённое имя («в Амне») — нарушение правила, а не вопрос мнения: такие строки — глазами.
            todo = [i for i in todo if rows[i].get('unknown_names') and not rows[i].get('cyrillic_names')]
        print(f'R {task}: {len(todo)} строк', file=sys.stderr, flush=True)
        agreed = 0
        for k in range(0, len(todo), 20):
            if past(until):
                rewrite(path, rows)
                print('R: время вышло', file=sys.stderr)
                return
            chunk = todo[k:k + 20]
            if task == 'L1':
                items = [{'id': rows[i]['id'], 'text': l1_text(by_id[rows[i]['id']], near)} for i in chunk if rows[i]['id'] in by_id]
                try:
                    res = {r['id']: r for r in post('/v1/classify', {'model': model, 'prompt': L1_PROMPT, 'labels': CLASSES,
                                                                       'batch': 20, 'max_chars': 900, 'items': items})['results']}
                except Exception as ex:
                    res = {}
                    print(f'R L1: {ex}', file=sys.stderr)
                for i in chunk:
                    r2 = res.get(rows[i]['id'])
                    if not r2 or r2.get('error'):
                        continue   # отказ модели — не мнение: строка останется на следующий проход
                    agree = r2.get('kind') == rows[i].get('kind')
                    rows[i]['second'] = {'model': model, 'kind': r2.get('kind'), 'error': r2.get('error'), 'agree': agree}
            for i in (chunk if task != 'L1' else []):
                r = rows[i]
                try:
                    if task == 'L3':
                        e = by_id.get(r['id'])
                        src = l3_source(e, gis, wiki, taken)[0] if e else None
                        if not src:
                            continue
                        res = loads(chat(model, L3_VERIFY, f"Source:\n{src}\n\nCard: {json.dumps(r['card'], ensure_ascii=False)}\n\nWords: {', '.join(r['unknown_names'])}", max_tokens=300)) or {}
                        if 'ok' not in res and 'bad' not in res:
                            raise ValueError('ответ без ok/bad')
                        bad = [w for w in r['unknown_names'] if w not in (res.get('ok') or []) or w in (res.get('bad') or [])]
                        r['second'] = {'model': model, 'bad': bad, 'agree': not bad}
                    else:
                        res = loads(chat(model, L2_PROMPT, f"Article: {r['article']}\nSentence: {r['text']}", max_tokens=500))
                        if res is None:
                            raise ValueError('ответ не JSON')
                        pairs = [p for p in res.get('pairs') or [] if isinstance(p, dict) and p.get('from') and p.get('to') and isinstance(p.get('value'), (int, float))]
                        r['second'] = {'model': model, 'pairs': pairs, 'agree': bool(pairs) and pair_key(pairs) == pair_key(r.get('pairs') or [])}
                except Exception as ex:
                    print(f'R {task} {r["id"]}: {ex}', file=sys.stderr)   # без second — повторится в следующий проход
            for i in chunk:
                if rows[i].get('second', {}).get('agree'):
                    rows[i]['status'] = 'done'
                    agreed += 1
            rewrite(path, rows)
            print(f'R {task}: {min(k + 20, len(todo))}/{len(todo)}, согласились {agreed}', file=sys.stderr, flush=True)


# ---------- общее ----------

def past(until):
    if not until:
        return False
    h, m = map(int, until.split(':'))
    now = datetime.now()
    # Запуск вечером, срок утром: срок «прошёл», только когда сейчас между ним и полуднем.
    return (now.hour, now.minute) >= (h, m) and now.hour < 12


def GPKG():
    return next(iter(sorted(glob.glob(os.path.join(ROOT, 'maps/gis/toril-gis-*/toril_gis_layers.gpkg')))))


def gis_texts(gpkg):
    sys.path.insert(0, os.path.join(ROOT, 'scripts'))
    import importlib.util
    spec = importlib.util.spec_from_file_location('registry', os.path.join(ROOT, 'scripts/map-registry.py'))
    reg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reg)
    out = {}
    for table in ('core.points_v', 'core.polygons_v'):
        for f in reg.export(gpkg, table):
            out[f['properties']['uuid']] = f['properties']
    return out


def main():
    passport = json.load(open([a for a in sys.argv[1:] if not a.startswith('--') and not a[:1].isdigit()][0], encoding='utf-8'))
    pid = passport['id']
    tasks = arg('--tasks', 'L1,L3,L2').split(',')
    model = arg('--model', 'local-model')
    until = arg('--until')
    limit = int(arg('--limit', '0'))
    sample = int(arg('--sample', '0'))
    if '--force' not in sys.argv:
        preflight()
    entries = json.load(open(os.path.join(ROOT, 'maps/ocr', f'{pid}-registry.json'), encoding='utf-8'))['entries']
    wiki_path = arg('--wiki') or next(iter(sorted(glob.glob('/Volumes/внешний/datasets/fr-wiki-*/fr-wiki-places.jsonl'), reverse=True)), None)
    wiki = load_wiki(wiki_path)
    print(f'вики: {len(wiki[0])} статей о местах ({wiki_path})' if wiki[0] else 'вики: нет выжимки — L2 пропускается, L3 только по GIS', file=sys.stderr)
    # L3 — и всем местам реестра, у которых есть статья вики, а не только привязанным на растре (28.10); то же правило
    # в map-registry.py (wants_l3).
    added = sum(wants_l3(e, wiki, entries) for e in entries)
    if added:
        print(f'L3: статья вики есть ещё у {added} мест — в очередь', file=sys.stderr)
    outdir = arg('--out', os.path.join(ROOT, 'maps/llm', f'sample-{model}' if sample else ''))
    os.makedirs(outdir, exist_ok=True)
    if sample:
        rnd = random.Random(27)
        picked = []
        for t in tasks:
            pool = [e for e in entries if e.get('tasks', {}).get(t)]
            if t == 'L3':
                gis = gis_texts(GPKG())
                pool = [e for e in pool if len((gis.get(e['id']) or {}).get('descr_en') or '') >= 40 or wiki_page(*wiki, [e['name']])]
            if t == 'L2':
                continue
            picked += rnd.sample(pool, min(sample, len(pool)))
        ids = {e['id'] for e in picked}
        entries = [e if e['id'] in ids else {**e, 'tasks': {}} for e in entries]
        for t in tasks:
            p = os.path.join(outdir, f'{t}.jsonl')
            if os.path.exists(p):
                os.remove(p)
    t0 = time.time()
    for t in tasks:
        out = os.path.join(outdir, f'{t}.jsonl')
        done = set()
        if os.path.exists(out):
            for line in open(out, encoding='utf-8'):
                r = json.loads(line)
                if r.get('status') in ('done', 'review', 'no_input'):
                    done.add(r['id'])
        if t == 'L1':
            run_l1(entries, model, out, until, limit, done)
        elif t == 'L3':
            run_l3(entries, gis_texts(GPKG()), wiki, model, out, until, limit, done)
        elif t == 'L4':
            run_l4(wiki, model, out, until, limit, done)
        elif t == 'F':
            run_fix(entries, gis_texts(GPKG()), wiki, model, outdir, until)
        elif t == 'R':
            run_recheck(entries, gis_texts(GPKG()), wiki, arg('--second', 'qwen'), outdir, until)
        elif t == 'L2':
            if not wiki[0]:
                print('L2: нет выжимки вики — пропуск', file=sys.stderr)
                continue
            if sample:
                pages = dict(random.Random(27).sample(sorted((k, v) for k, v in wiki[0].items() if v.get('dist')), sample))
                run_l2((pages, {}), model, out, until, sample, done)
            else:
                run_l2(wiki, model, out, until, limit, done)
    print(f'llm-markup: {round(time.time() - t0)} с, итог в {outdir}', file=sys.stderr)


if __name__ == '__main__':
    main()
