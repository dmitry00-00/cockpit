# Отсев пар расстояний L2 правилами — и сверка правил с решениями мастера на странице разметки (content/maps/toril-review.jsonl).
# Классы отсева взяты из разметки 29.10: «сотни миль» без числа, конец пары без собственного имени, размер объекта (высота,
# длина, глубина), длительность процесса в днях; плюс единица не из списка (gp, soldier) и пара места с самим собой. Данные не меняет — только меряет.
#
# Запуск: .venv/bin/python -I scripts/l2-eval.py [maps/llm/L2.jsonl] [content/maps/toril-review.jsonl]
#   Итог: на решённых мастером строках — сколько отсеянных правилами он тоже отклонил (точность) и сколько его отказов
#   правила поймали (полнота); на строках done без разбора — сколько пар правила отсеяли бы и почему.
import json, re, sys
from collections import Counter

UNITS = {'mile': 'mile', 'miles': 'mile', 'league': 'league', 'leagues': 'league', 'kilometer': 'km', 'km': 'km',
         'day': 'day', 'days': 'day', 'tenday': 'tenday', 'tendays': 'tenday', 'hour': 'hour', 'hours': 'hour'}
NUM = r'(?:\d[\d,.]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|a hundred|a few|half a|a)'
VAGUE = re.compile(r'\b(hundreds|thousands|dozens|scores|several|many|countless)\s+(of\s+)?(miles|leagues|kilometers)\b', re.I)
SIZE = re.compile(rf'\b{NUM}[\s-]+(feet|foot|ft\.?|yards?|meters?|metres?)\b|\b{NUM}[\s-]+(miles?|leagues?|kilometers?|km)[\s-]+'
                  r'(long|wide|across|high|tall|deep|in (length|width|diameter|height|depth|circumference|size)|below|beneath|underground|'
                  r'above|around|in radius)\b|\b' + NUM + r'-(mile|league|foot|kilometer)\s+(?!ride|walk|march|journey|trip|trek)[a-z]+', re.I)
DURATION = re.compile(r'\b(lasted|lasting|took|takes|would take|could take|delivery|for (about |some |nearly |over )?'
                      rf'{NUM}[\s-]+(days?|tendays?|weeks?|months?|years?)\b|after (about |some )?{NUM}[\s-]+(days?|tendays?))', re.I)
TRAVEL = re.compile(r'\b(rid(e|ing)|walk\w*|march\w*|journey\w*|travel\w*|sail\w*|voyage\w*|trek\w*|flight|away|from|'
                    r'north\w*|south\w*|east\w*|west\w*|distance)\b', re.I)
# Конец пары — собственное имя: каждое значимое слово с заглавной («Varm lands» — нет, «the retirement home» — нет).
SMALL = {'of', 'the', 'and', 'on', 'in', 'upon', 'de', 'du', 'la', 'le', "'s"}


def named(s):
    words = [w for w in re.split(r'[\s-]+', (s or '').strip()) if w]
    if words and words[0].lower() == 'the':
        words = words[1:]
    sig = [w for w in words if w.lower() not in SMALL]
    return bool(sig) and all(w[0].isupper() or w[0].isdigit() for w in sig)


def reasons(text, pair, article):
    """Почему пара не годится в калибровку; пустой список — годится."""
    out = []
    if UNITS.get(str(pair.get('unit', '')).lower()) is None:
        out.append('единица')
    if VAGUE.search(text):
        out.append('сотни миль')
    if SIZE.search(text):
        out.append('размер')
    unit = UNITS.get(str(pair.get('unit', '')).lower())
    if unit in ('day', 'tenday', 'hour') and DURATION.search(text) and not TRAVEL.search(text):
        out.append('длительность')
    # «it» в паре — подлежащее статьи (так велит промпт L2, модель пишет «it» буквально).
    ends = [article if e.strip().lower() == 'it' else e for e in (pair.get('from', ''), pair.get('to', ''))]
    if ends[0].strip().lower() == ends[1].strip().lower():
        out.append('протяжённость')  # «Thar → Thar, 100 миль» — размер области, а не путь между двумя местами
    elif not all(named(e) for e in ends):
        out.append('без имени')
    return out


def main():
    l2_path = sys.argv[1] if len(sys.argv) > 1 else 'maps/llm/L2.jsonl'
    dec_path = sys.argv[2] if len(sys.argv) > 2 else 'content/maps/toril-review.jsonl'
    rows = {}
    for line in open(l2_path, encoding='utf-8'):
        r = json.loads(line)
        rows[r['id']] = r
    dec = {}
    for line in open(dec_path, encoding='utf-8'):
        d = json.loads(line)
        if d.get('task') == 'L2':
            dec[d['id']] = d  # последнее решение главнее
    # Решения мастера по строкам: оставил хоть одну пару — строка годна.
    tp = fp = fn = tn = 0
    missed, wrong = Counter(), []
    for rid, d in dec.items():
        r = rows.get(rid)
        if not r:
            continue
        pairs = r.get('pairs') or []
        cut = all(reasons(r['text'], p, r['article']) for p in pairs) if pairs else True
        keep = bool(d['pairs'])
        if cut and not keep:
            tp += 1
        elif cut and keep:
            fp += 1
            wrong.append((r['text'], [reasons(r['text'], p, r['article']) for p in pairs]))
        elif not cut and not keep:
            fn += 1
            missed[r['text'][:150]] += 1
        else:
            tn += 1
    print(f'Решения мастера: {len(dec)} строк, отклонено {tp + fn}, оставлено {fp + tn}.')
    print(f'Правила отсеяли {tp + fp}: из них мастер тоже отклонил {tp} (точность {tp / max(tp + fp, 1):.0%}); '
          f'поймали {tp} из {tp + fn} его отказов (полнота {tp / max(tp + fn, 1):.0%}).')
    if wrong:
        print('\nОтсеяно зря (мастер оставил):')
        for t, rs in wrong[:12]:
            print(f'  {rs}  {t[:160]}')
    if missed:
        print('\nНе пойманы (мастер отклонил, правила пропустили), первые 12:')
        for t in list(missed)[:12]:
            print(f'  {t}')
    done = [r for r in rows.values() if r.get('status') == 'done' and r.get('pairs')]
    why, cut_pairs, total = Counter(), 0, 0
    for r in done:
        for p in r['pairs']:
            total += 1
            rs = reasons(r['text'], p, r['article'])
            if rs:
                cut_pairs += 1
                why.update(rs)
    print(f'\nСтроки done без разбора: {len(done)} строк, {total} пар; правила отсеяли бы {cut_pairs} ({cut_pairs / max(total, 1):.0%}).')
    print('  причины (пара может иметь несколько):', ', '.join(f'{k} {v}' for k, v in why.most_common()))


if __name__ == '__main__':
    main()
