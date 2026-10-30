# Проверка класса подписей (TASKS L1) по чужой разметке: атлас AideDD (aidedd.org/atlas/faerun) — у ~1440 меток Фаэруна
# класс задан цветом. Берутся только пары «имя — класс» (факты), тексты атласа не используются и не хранятся.
#
# Запуск: .venv/bin/python -I scripts/l1-eval.py <dataF.js> <L1.jsonl> [<L1.jsonl> …]
#   Итог: сколько подписей L1 нашли пару в атласе, точность правил и модели, частые путаницы.
import json, re, sys
from collections import Counter

# Цвет метки атласа → допустимые классы L1 (воды и болота — одним цветом, область и остров — тоже).
COLOR = {
    'FF0000': {'settlement'}, 'FF8080': {'settlement'}, '6600CC': {'ruins'}, 'CC99FF': {'fortress'}, '9999FF': {'fortress'},
    'FF8000': {'mountain', 'hills'}, '33CC33': {'forest'}, '58ACFA': {'lake', 'river', 'sea', 'bay', 'reef', 'swamp'},
    'FFFFFF': {'region', 'island', 'archipelago', 'peninsula', 'hills', 'desert', 'pass'}, 'CCCCCC': {'region'},
}


def norm(s):
    return re.sub(r'[^a-z]', '', (s or '').lower())


def atlas(path):
    out = {}
    for m in re.finditer(r'name:\s*"([^"]+)",\s*color:\s*"#([0-9A-Fa-f]{6})"', open(path, encoding='utf-8').read()):
        name, col = m.group(1), m.group(2).upper()
        if name != 'GROUP' and col in COLOR:
            out[norm(name)] = (name, COLOR[col])
    return out


def main():
    ref = atlas(sys.argv[1])
    rows = [json.loads(l) for p in sys.argv[2:] for l in open(p, encoding='utf-8')]
    rows = [r for r in rows if r.get('task') == 'L1' and r.get('kind')]
    score = Counter()
    confusion = Counter()
    for r in rows:
        n = norm(r['name'])
        # Имя целиком: по вхождению «Lake Sember» сошлось бы с посёлком Sember.
        hit = ref.get(n)
        if not hit:
            continue
        ok = r['kind'] in hit[1]
        score[(r['how'], ok)] += 1
        if not ok:
            confusion[(r['kind'], '/'.join(sorted(hit[1])))] += 1
    print(f'атлас: {len(ref)} имён с классом; L1: {len(rows)} строк, с парой в атласе {sum(score.values())}')
    for how in ('rule', 'llm'):
        good, bad = score[(how, True)], score[(how, False)]
        if good + bad:
            print(f'  {how}: верно {good} из {good + bad} ({100 * good // (good + bad)} %)')
    for (got, want), n in confusion.most_common(12):
        print(f'  путаница: {got} вместо {want} — {n}')


if __name__ == '__main__':
    main()
