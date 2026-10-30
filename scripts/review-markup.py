# Разбор глазами строк ночной разметки, где модели не сошлись: L1 (класс подписи растра) и L2 (расстояния из вики).
# Страница — scripts/review-markup.html; решения пишутся журналом в content/maps/toril-review.jsonl (в git: это ручная
# работа владельца, её не пересчитать; последнее решение по id главнее). В L1.jsonl / L2.jsonl они попадают только через
# --apply: строка становится done, how: human, ответы моделей остаются в строке, прежнее значение — в reviewed.was.
#
# Решение L1 — класс и, когда OCR прочёл подпись неверно (29.10.2026, владелец: «catli» вместо Itzcatli, «Glacier of»
# вместо Glacier of the Dragon), поправка подписи: name — имя целиком; absorb — id соседних строк, которые на самом деле
# части этой подписи («Two-Form» + «Glacier»): они становятся status merged; split — подпись, в которой OCR склеил две
# («Ahn BayODilapan»): строка берёт первую часть, остальные — новые строки «<id>#2…» с той же точкой. Имена поправок
# справочник карты пока не читает (gazetteer-from-map.py пересобирает toril-rest.json из OCR) — они живут в L1.jsonl
# (name, name_ocr) и в журнале.
#
# Запуск: .venv/bin/python scripts/review-markup.py [--port 8790]   → http://127.0.0.1:8790/
#         .venv/bin/python scripts/review-markup.py --apply          перенести решения в maps/llm/L1.jsonl и L2.jsonl
#         .venv/bin/python scripts/review-markup.py --translate      перевод предложений L2 на русский переводчиком macOS
#           (scripts/translate-ru.swift) → maps/llm/L2-ru.json; имена собственные остаются латиницей. Перевод — чтобы
#           читать; пары ставятся по английскому оригиналу.
import importlib.util, json, os, re, subprocess, sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LLM = os.path.join(ROOT, 'maps/llm')
DECISIONS = os.path.join(ROOT, 'content/maps/toril-review.jsonl')
TILES = os.path.join(ROOT, 'maps/tiles/toril')
REST = os.path.join(ROOT, 'maps/ocr/toril-rest.json')
PAGE = os.path.join(ROOT, 'scripts/review-markup.html')
RU_CACHE = os.path.join(LLM, 'L2-ru.json')
TRANSLATE = os.path.join(ROOT, 'scripts/translate-ru.swift')
FONTS = os.path.join(ROOT, 'node_modules/@fontsource')

# Классы L1 — из llm-markup.py, одним списком с ночным прогоном (копия разошлась бы молча). Единицы и способы пути L2 —
# как в L2_PROMPT там же.
_mk = importlib.util.spec_from_file_location('llm_markup', os.path.join(ROOT, 'scripts/llm-markup.py'))
_llm = importlib.util.module_from_spec(_mk)
_mk.loader.exec_module(_llm)
CLASSES = _llm.CLASSES
UNITS = ['mile', 'league', 'day', 'hour', 'tenday']
MODES = ['foot', 'horse', 'ship', 'caravan', '']


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    rows = []
    for line in open(path, encoding='utf-8'):
        try:
            rows.append(json.loads(line))
        except ValueError:
            pass
    return rows


def write_jsonl(path, rows):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    os.replace(tmp, path)


def decisions():
    """Последнее решение по id. «reopen» снимает решение."""
    out = {}
    for d in read_jsonl(DECISIONS):
        if d.get('action') == 'reopen':
            out.pop(d['id'], None)
        else:
            out[d['id']] = d
    return out


def l1_item(r, rest):
    e = rest.get(r['id'].split('#')[0], {})
    return {'id': r['id'], 'name': r.get('name', ''), 'name_ocr': r.get('name_ocr'), 'status': r.get('status'), 'kind': r.get('kind'),
            'how': r.get('how'), 'a': {'model': r.get('model') or r.get('how'), 'kind': r.get('kind'), 'said': r.get('said')},
            'b': {'model': (r.get('second') or {}).get('model'), 'kind': (r.get('second') or {}).get('kind')},
            'label': {k: e.get(k) for k in ('x', 'y', 'w', 'lh', 'color', 'caps', 'spaced', 'terrain')}}


def queue():
    rest = {f"ocr:{e['x']}_{e['y']}": e for e in json.load(open(REST, encoding='utf-8'))['labels']}
    rows = read_jsonl(os.path.join(LLM, 'L1.jsonl'))
    l1 = [l1_item(r, rest) for r in rows if r.get('status') == 'review']
    # Все строки L1 — для поиска (поправить и готовую: «Paolin» — на деле Paolin Reef) и соседей на карте (склейка).
    l1_all = [l1_item(r, rest) for r in rows if r.get('status') != 'review']
    ru = json.load(open(RU_CACHE, encoding='utf-8')) if os.path.exists(RU_CACHE) else {}
    l2 = []
    for r in read_jsonl(os.path.join(LLM, 'L2.jsonl')):
        if r.get('status') != 'review':
            continue
        l2.append({'id': r['id'], 'article': r.get('article'), 'text': r.get('text'), 'links': r.get('links', []), 'url': r.get('url'),
                   'ru': ru.get(r['id']),
                   'a': {'model': r.get('model'), 'pairs': r.get('pairs', [])},
                   'b': {'model': (r.get('second') or {}).get('model'), 'pairs': (r.get('second') or {}).get('pairs', [])}})
    return {'classes': CLASSES, 'units': UNITS, 'modes': MODES, 'l1': l1, 'l1_all': l1_all, 'l2': l2, 'decisions': decisions()}


def valid_name(n):
    return isinstance(n, str) and 0 < len(n.strip()) <= 120


def valid(d):
    """Решение — ровно то, что можно положить в строку: класс из списка, пары с числом, единицей и способом из списка."""
    if d.get('action') == 'reopen':
        return True
    if d.get('task') == 'L1':
        if d.get('kind') not in CLASSES:
            return False
        if 'name' in d and not valid_name(d['name']):
            return False
        ab = d.get('absorb', [])
        if not (isinstance(ab, list) and len(ab) <= 8 and all(isinstance(i, str) and i.startswith('ocr:') and i != d['id'] for i in ab)):
            return False
        sp = d.get('split')
        return sp is None or (isinstance(sp, list) and 2 <= len(sp) <= 4 and sp[0].get('kind') == d['kind']
                              and all(isinstance(p, dict) and valid_name(p.get('name')) and p.get('kind') in CLASSES for p in sp))
    if d.get('task') == 'L2':
        ps = d.get('pairs')
        return isinstance(ps, list) and all(
            isinstance(p, dict) and str(p.get('from', '')).strip() and str(p.get('to', '')).strip()
            and isinstance(p.get('value'), (int, float)) and p['value'] > 0 and p.get('unit') in UNITS
            and p.get('mode', '') in MODES and isinstance(p.get('approx', False), bool) for p in ps)
    return False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store' if ctype.startswith(('application/json', 'text/html')) else 'max-age=86400')
        self.end_headers()
        self.wfile.write(body)

    def file(self, path, ctype):
        if not os.path.isfile(path):
            return self.send(404, b'', 'text/plain')
        self.send(200, open(path, 'rb').read(), ctype)

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/':
            return self.file(PAGE, 'text/html; charset=utf-8')
        if p == '/tokens.css':
            return self.file(os.path.join(ROOT, 'design/tokens.css'), 'text/css; charset=utf-8')
        if p == '/api/queue':
            return self.send(200, json.dumps(queue(), ensure_ascii=False).encode(), 'application/json; charset=utf-8')
        m = re.fullmatch(r'/tiles/(\d)/(\d+)_(\d+)\.webp', p)
        if m:
            return self.file(os.path.join(TILES, m[1], f'{m[2]}_{m[3]}.webp'), 'image/webp')
        m = re.fullmatch(r'/fonts/(forum|pt-sans|ibm-plex-mono)/((?:files/)?[a-z0-9-]+\.(css|woff2|woff))', p)
        if m:
            return self.file(os.path.join(FONTS, m[1], m[2]), {'css': 'text/css', 'woff2': 'font/woff2', 'woff': 'font/woff'}[m[3]])
        self.send(404, b'', 'text/plain')

    def do_POST(self):
        if self.path != '/api/decide':
            return self.send(404, b'', 'text/plain')
        try:
            d = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        except ValueError:
            return self.send(400, b'{"error":"json"}', 'application/json')
        if not d.get('id') or not valid(d):
            return self.send(400, b'{"error":"invalid"}', 'application/json')
        d['at'] = datetime.now().isoformat(timespec='seconds')
        os.makedirs(os.path.dirname(DECISIONS), exist_ok=True)
        with open(DECISIONS, 'a', encoding='utf-8') as f:
            f.write(json.dumps(d, ensure_ascii=False) + '\n')
        self.send(200, b'{"ok":true}', 'application/json')


def apply():
    ps = subprocess.run(['ps', '-axo', 'command'], capture_output=True, text=True).stdout
    if 'llm-markup' in ps:
        sys.exit('review-markup: идёт llm-markup — он переписывает те же файлы; применить после прогона')
    dec = decisions()
    apply_l1([d for d in dec.values() if d.get('task') == 'L1'])
    path = os.path.join(LLM, 'L2.jsonl')
    rows, n, stale = read_jsonl(path), 0, 0
    for r in rows:
        d = dec.get(r.get('id'))
        if not d or d.get('task') != 'L2':
            continue
        # Решение мастера главнее любой модели и любого статуса: L2 перепрогоняется (L2v2, 29.10), решения остаются.
        if r.get('reviewed', {}).get('at') == d['at']:
            stale += 1
            continue
        r['reviewed'] = {'at': d['at'], 'was': r.get('pairs', []), 'was_status': r.get('status')}
        r.update(status='done', pairs=d['pairs'], how='human')
        n += 1
    if n:
        write_jsonl(path, rows)
    left = sum(1 for r in rows if r.get('status') == 'review')
    print(f'L2: применено {n}, уже применено раньше {stale}, осталось на проверку {left}')


def apply_l1(decs):
    """Класс, имя, склейка и разделение. Решение применяется к строке любого статуса (поиском правится и готовая);
    повторно — нет: метка — reviewed.at."""
    path = os.path.join(LLM, 'L1.jsonl')
    rows = read_jsonl(path)
    by = {r['id']: r for r in rows}
    n = renamed = merged = split = stale = 0
    for d in sorted(decs, key=lambda d: d['at']):
        r = by.get(d['id'])
        if not r:
            continue
        if (r.get('reviewed') or {}).get('at') == d['at']:
            stale += 1
            continue
        r['reviewed'] = {'at': d['at'], 'was': r.get('kind'), 'was_status': r.get('status')}
        name = d.get('name') or (d['split'][0]['name'] if d.get('split') else None)
        if name and name != r.get('name'):
            r.setdefault('name_ocr', r.get('name'))
            r['name'] = name
            renamed += 1
        r.update(status='done', kind=d['kind'], how='human')
        for aid in d.get('absorb', []):
            a = by.get(aid)
            if a and a.get('status') != 'merged':
                a['merged'] = {'into': d['id'], 'at': d['at'], 'was_status': a.get('status'), 'was_kind': a.get('kind')}
                a['status'] = 'merged'
                merged += 1
        if d.get('split'):
            r['split'] = [p['name'] for p in d['split']]
            for i, p in enumerate(d['split'][1:], start=2):
                pid = f"{d['id']}#{i}"
                part = by.get(pid)
                if not part:
                    part = {'id': pid, 'task': 'L1'}
                    rows.append(part)
                    by[pid] = part
                part.update(status='done', how='human', kind=p['kind'], name=p['name'], split_from=d['id'], at=d['at'])
                split += 1
        n += 1
    if n:
        write_jsonl(path, rows)
    left = sum(1 for r in rows if r.get('status') == 'review')
    print(f'L1: применено {n} (имя поправлено {renamed}, склеено {merged}, новых частей {split}), '
          f'уже применено раньше {stale}, осталось на проверку {left}')


_WORDS = None


def english_words():
    """Словарь macOS (/usr/share/dict/words): слово с заглавной в начале предложения — имя, если его нет там строчными
    (имена в словаре записаны с заглавной: «Ambrose» — имя, «many» — нет)."""
    global _WORDS
    if _WORDS is None:
        p = '/usr/share/dict/words'
        _WORDS = {w.strip() for w in open(p, encoding='utf-8') if w[:1].islower()} if os.path.exists(p) else set()
    return _WORDS


CAPS = re.compile(r"[A-Z][\w'’-]*(?:\s+(?:of|the|and)\s+[A-Z][\w'’-]*|\s+[A-Z][\w'’-]*)*")


def capitalised(text):
    """Имена без ссылки вики (переводчик сделал из Tempus «Темпуса», из Tethir — «Тетира»): слова с заглавной подряд.
    В начале предложения первое слово — имя, только если его нет в словаре («The», «Many», «Together» — нет)."""
    out = []
    for m in CAPS.finditer(text):
        words = m.group().split()
        start = m.start() == 0 or re.search(r'[.!?]["”’)]?\s+$', text[:m.start()])
        if start and words[0].lower() in english_words():
            words = words[1:]
            while words and words[0] in ('of', 'the', 'and'):
                words = words[1:]
        if words:
            out.append(' '.join(words))
    return out


def protect(text, names):
    """Имена собственные → [1], [2] …, чтобы переводчик их не трогал; длинные раньше («Sword Coast» раньше «Sword»).
    Только с заглавной: ссылка вики бывает и словом («tenday»), его переводим."""
    keep = []
    names = [*names, *capitalised(text)]
    for n in sorted({n for n in names if isinstance(n, str) and len(n) > 1 and n[0].isupper()}, key=len, reverse=True):
        if n in text:
            keep.append(n)
            text = text.replace(n, f'[{len(keep)}]')
    return text, keep


def translate():
    cache = json.load(open(RU_CACHE, encoding='utf-8')) if os.path.exists(RU_CACHE) else {}
    items, keeps = [], {}
    for r in read_jsonl(os.path.join(LLM, 'L2.jsonl')):
        if r.get('status') != 'review' or r['id'] in cache:
            continue
        pairs = r.get('pairs', []) + (r.get('second') or {}).get('pairs', [])
        # Имена из пар моделей — только похожие на имя: «Evereska's Shaeradim» да, «The forest» нет.
        named = [n for p in pairs for k in ('from', 'to') if isinstance(n := p.get(k), str)
                 and all(w[:1].isupper() or w in ('of', 'the', 'and') for w in n.split())]
        text, keep = protect(r['text'], [r.get('article'), *r.get('links', []), *named])
        items.append({'id': r['id'], 'text': text})
        keeps[r['id']] = keep
    if not items:
        return print(f'перевод: нечего переводить, в кэше {len(cache)}')
    res = subprocess.run(['swift', TRANSLATE], input=json.dumps(items, ensure_ascii=False), capture_output=True, text=True)
    if res.returncode:
        sys.exit(res.stderr.strip() or f'translate-ru.swift: код {res.returncode}')
    lost = 0
    at = datetime.now().isoformat(timespec='seconds')
    for o in json.loads(res.stdout):
        ru, keep = o['ru'], keeps[o['id']]
        miss = [n for i, n in enumerate(keep, 1) if f'[{i}]' not in ru]
        for i, n in enumerate(keep, 1):
            ru = ru.replace(f'[{i}]', n)
        cache[o['id']] = {'ru': ru, 'at': at, **({'lost': miss} if miss else {})}
        lost += bool(miss)
    tmp = RU_CACHE + '.tmp'
    json.dump(cache, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    os.replace(tmp, RU_CACHE)
    print(f'перевод: {len(items)} предложений, имя потерялось в {lost}; всего в кэше {len(cache)} → {os.path.relpath(RU_CACHE, ROOT)}')


if __name__ == '__main__':
    if '--translate' in sys.argv:
        translate()
    elif '--apply' in sys.argv:
        apply()
    else:
        port = int(arg('--port', 8790))
        print(f'review-markup: http://127.0.0.1:{port}/  (решения → {os.path.relpath(DECISIONS, ROOT)})')
        ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
