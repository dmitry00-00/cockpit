"""Карточки мест для стола (M12): готовые карточки L3 ночной разметки → content/maps/<id>-cards.json.

Берётся только status done (review — глазами, не на стол). Позиция — из реестра карты: точка растра (x, y), а у
места, которого на растре не нашли, — предсказание по GIS (pred, approx). Подземье пропускается: его нет на карте
поверхности. Имена, которые на растре написаны капителью (ADBAR ROAD), и такие же слова в тексте карточки
приводятся к написанию вики и GIS; чего там нет — к Обычному Регистру.

Текст карточек — пересказ статей Forgotten Realms Wiki (CC BY-SA 3.0): авторство и лицензия — в файле и у
каждой карточки ссылкой на статью.

Запуск (из корня):
  .venv/bin/python -I scripts/export-place-cards.py content/maps/toril.json [--wiki <fr-wiki-places.jsonl>]
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIKI = '/Volumes/внешний/datasets/fr-wiki-2026-10-21/fr-wiki-places.jsonl'
CODES = {'DR', 'NPC', 'AC', 'HP', 'DC', 'CR', 'XP', 'GP'}
CAPS = re.compile(r"\b[A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+)*\b")
ROMAN = re.compile(r'^[IVX]+$')
BROKEN = re.compile(r"\b[A-Z]{2,}[a-z][A-Za-z'’-]*\b")
SMALL = {'of', 'the', 'and', 'in', 'on', 'at', 'to'}


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def read_jsonl(path):
    return [json.loads(line) for line in open(path, encoding='utf-8') if line.strip()]


def spelling(names):
    """Нижний регистр → написание: первое встреченное не-капителью."""
    out = {}
    for n in names:
        if n and not n.isupper():
            out.setdefault(n.lower(), n)
    return out


def recase(text, known):
    """Капитель в тексте: самый длинный известный отрезок слов — по справочнику, остальное — Обычным Регистром."""
    def fix(m):
        words = m.group(0).split()
        out, i = [], 0
        while i < len(words):
            if words[i] in CODES or ROMAN.match(words[i]):
                out.append(words[i])
                i += 1
                continue
            for j in range(len(words), i, -1):
                hit = known.get(' '.join(words[i:j]).lower())
                if hit:
                    out.append(hit)
                    i = j
                    break
            else:
                w = words[i].lower()
                out.append(w if out and w in SMALL else words[i][0] + w[1:])
                i += 1
        return ' '.join(out)
    # Модель иногда рвёт капитель посреди слова (VESPERMOUTh, TRADE WAy): такое слово — по справочнику или
    # Обычным Регистром; законные двойные заглавные (Ffolk) справочник знает.
    def broken(m):
        w = m.group(0)
        return known.get(w.lower()) or w[0] + w[1:].lower()
    return BROKEN.sub(broken, CAPS.sub(fix, text))


def main():
    passport_path = sys.argv[1]
    passport = json.load(open(passport_path, encoding='utf-8'))
    mid = passport['id']
    places = json.load(open(os.path.join(ROOT, 'content', 'maps', f'{mid}-places.json'), encoding='utf-8'))['places']
    reg = {e['id']: e for e in json.load(open(os.path.join(ROOT, 'maps', 'ocr', f'{mid}-registry.json'), encoding='utf-8'))['entries']}
    l1 = {r['id']: r for r in read_jsonl(os.path.join(ROOT, 'maps', 'llm', 'L1.jsonl'))}
    rows = read_jsonl(os.path.join(ROOT, 'maps', 'llm', 'L3.jsonl'))

    titles = []
    wiki = arg('--wiki', WIKI)
    if os.path.exists(wiki):
        lines = read_jsonl(wiki)
        titles = [p['title'] for p in lines if 'title' in p]
        titles += list(lines[-1].get('redirects', {}))
    # Написание — из вики и GIS; подписи растра (OCR) сюда не идут: там бывает и «TRADE WAy».
    known = spelling(titles + [p['name'] for p in places] + [e.get('name', '') for e in reg.values() if e['kind'] in ('point', 'area')])

    by_place = {p['id']: p for p in places}
    out, skipped = [], {}
    for r in rows:
        if r.get('status') != 'done':
            continue
        e = reg.get(r['id'])
        if not e or e.get('status') == 'underdark':
            skipped['подземье или нет в реестре'] = skipped.get('подземье или нет в реестре', 0) + 1
            continue
        p = by_place.get(r['id'])
        label = False
        if p:
            x, y, approx = p['x'], p['y'], False
        elif e.get('x') is not None:
            # Точка растра без пары в GIS — середина подписи, а не значок: значки распознаются с шумом (реестр,
            # icon_only), пару подпись — значок даст нестрогий справочник.
            x, y, approx, label = e['x'], e['y'], False, e.get('how') != 'marker'
        elif e.get('pred'):
            (x, y), approx = e['pred'], True
        else:
            skipped['без позиции'] = skipped.get('без позиции', 0) + 1
            continue
        url = next((s for s in r.get('sources', []) if s.startswith('http')), None)
        name = r['name']
        if name.isupper():
            title = url.rsplit('/wiki/', 1)[-1].replace('_', ' ') if url else ''
            name = title if title.lower() == name.lower() else known.get(name.lower()) or recase(name, known)
        kind = e.get('class') or (l1.get(r['id']) or {}).get('kind') or ''
        card = {k: recase(v, known) for k, v in r['card'].items() if v}
        item = {'id': r['id'], 'name': name, 'kind': kind, 'x': round(x), 'y': round(y)}
        if approx:
            item['approx'] = True
        if label:
            item['label'] = True
        item['card'] = card
        item['sources'] = ['Toril GIS' if s == 'Toril GIS' else s for s in r.get('sources', [])]
        out.append(item)
    out.sort(key=lambda c: c['name'])
    doc = {
        'map': mid,
        'source': 'Карточки мест по-русски: пересказ локальной модели (ночная разметка L3, scripts/llm-markup.py) '
                  'по Forgotten Realms Wiki и описаниям Toril GIS; на стол — только прошедшие проверку имён',
        'license': 'CC BY-SA 3.0 — текст основан на статьях Forgotten Realms Wiki (forgottenrealms.fandom.com), '
                   'ссылка на статью — в sources карточки; Toril GIS — Fan Content, авторов указываем',
        'places': out,
    }
    path = os.path.join(ROOT, 'content', 'maps', f'{mid}-cards.json')
    with open(path + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    os.replace(path + '.tmp', path)
    extra = sum(1 for c in out if c['id'] not in by_place)
    print(f'{path}: {len(out)} карточек ({extra} мест вне справочника, {sum(1 for c in out if c.get("approx"))} '
          f'по предсказанию GIS); пропущено {skipped}', file=sys.stderr)


if __name__ == '__main__':
    main()
