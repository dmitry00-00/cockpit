#!/usr/bin/env python3
# Поселения GIS, которых нет в справочнике карты (реестр поселений компендиума, пользователь 30.10.2026): точки Toril
# GIS поселенческих классов, которые разметка растра не поставила, — с причиной из реестра карты (map-registry.py):
# misread — рядом подпись, похожая на имя, но OCR прочёл иначе; far — подпись этим именем далеко от подсказки;
# absent — рядом ничего похожего; underdark — слой Подземья; outside — вне растра. Позиция — подсказка привязки GIS.
#
#   .venv/bin/python -I scripts/missing-places.py [content/maps/toril.json]
#
# Читает maps/ocr/<id>-registry.json (не в git), пишет content/maps/<id>-missing.json:
#   { places: [[id, name, class, status, x, y, ocr?], …] } — ocr — что прочитано рядом (misread). Нет реестра — сказать
# и выйти с 0.
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Те же классы, что SETTLEMENT_KINDS в src/world/registry.ts (у GIS — только заглавные).
SETTLEMENT = {'City', 'Town', 'Village', 'Fortification', 'Temple', 'Monastic Site', 'Mine', 'Inn', 'Oasis'}


def main():
    passport = json.loads((ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'content/maps/toril.json')).read_text())
    mid = passport['id']
    src = ROOT / f'maps/ocr/{mid}-registry.json'
    if not src.exists():
        print(f'Нет {src.relative_to(ROOT)} — сначала map-registry.py; пропущенных поселений нет.')
        return 0
    out = []
    for e in json.loads(src.read_text())['entries']:
        if e['kind'] != 'point' or e.get('class') not in SETTLEMENT or e['status'] == 'placed' or not e.get('pred'):
            continue
        row = [e['id'], e['name'], e['class'], e['status'], *e['pred']]
        if e.get('ocr'):
            row.append(e['ocr'])
        out.append(row)
    out.sort(key=lambda r: (r[1], r[0]))
    places = json.loads((ROOT / f'content/maps/{mid}-places.json').read_text())
    (ROOT / f'content/maps/{mid}-missing.json').write_text(json.dumps({
        'map': mid, 'source': places['source'], 'attribution': places['attribution'],
        'note': 'поселения GIS не в справочнике карты: [id, имя, класс, причина, x, y, прочитано рядом?], scripts/missing-places.py',
        'places': out,
    }, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Пропущенных поселений: {len(out)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
