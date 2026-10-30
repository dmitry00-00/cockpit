#!/usr/bin/env python3
# Товары держав и мест для торговли (SIMULATION.md С3, research/world-models.md §5): поля exports и imports
# карточек Forgotten Realms Wiki (CC BY-SA 3.0 — только внутри, решение пользователя 30.10.2026) сводятся к 12
# товарам GOODS (src/engine/state.ts). Словарь — правило, без модели.
#
#   .venv/bin/python -I scripts/econ-from-wiki.py [--wiki <fr-wiki-places.jsonl>] [--out <файл>]
#
# Читает content/world/kingdoms.json (import-kingdoms.py) и, если есть, выжимку мест вики (wiki-extract.py, по
# умолчанию самая свежая /Volumes/внешний/datasets/fr-wiki-*/fr-wiki-places.jsonl) — поле box.exports у карточек,
# чей заголовок совпадает с именем места справочника карты (content/maps/toril-places.json). Пишет
# content/world/econ.json: { kingdoms: { id: { x: [...], m: [...] } }, places: { id: { x: [...] } } } — x — вывоз,
# m — ввоз.
#
# Как сводится строка:
#   * склейка вики «FabricSlavesMedicine» режется по заглавным;
#   * строка режется по «,», «;», « and », « or », «/», «&», скобкам и точке;
#   * термин сводится к товару по первому ключу TERMS, ключ — начало слова («grain» берёт «grains»). Порядок важен:
#     ловушки подстрок впереди («furniture» — не мех, «silverymoon blue wine» — не серебро, «olive oil» — еда,
#     «lamp oil» — ремесло, «magic weapons» — магия);
#   * люди и услуги (рабы, наёмники, маги, «smuggling») — не товар: их читает world/kingdoms.ts peopleTrade;
#   * общие слова (goods, items, crafts) — ремесло (`gear`).
# Что не свелось, печатается; термин без товара, который встречается REST_MAX раз и чаще, — ошибка: словарь открыт,
# классы закрыты (§5.2).
import argparse
import glob
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REST_MAX = 3

GOODS = ('weapons', 'armor', 'gear', 'food', 'mounts', 'potions', 'wine', 'cloth', 'timber', 'metal', 'precious', 'spices')

# (ключ, товар); None — не товар. Первый совпавший выигрывает.
TERMS = [
    # ловушки подстрок и составные — впереди
    ('furniture', 'gear'), ('furnishings', 'gear'), ('carpet', 'cloth'), ('whalebone', 'gear'),
    ('sheepskin', 'cloth'), ('steel weapon', 'weapons'), ('exotic goods', 'gear'), ('silverymoon blue wine', 'wine'), ('musical instrument', 'gear'),
    ('water-clock', 'gear'), ('field glass', 'gear'), ('oil of stars', 'potions'), ('olive', 'food'), ('lamp oil', 'gear'),
    ('whale oil', 'gear'), ('tree oil', 'gear'), ('seed oil', 'food'), ('ginyak weed', 'spices'), ('pipeweed', 'spices'),
    ('magic weapon', 'potions'), ('metal armor', 'armor'), ('mining equipment', 'gear'), ('smithing equipment', 'gear'),
    ('precious metal', 'precious'), ('precious stone', 'precious'), ('leather goods', 'cloth'), ('leatherwork', 'cloth'),
    ('wood carving', 'gear'), ('calantra carving', 'gear'), ('wood products', 'timber'), ('wood items', 'timber'),
    ('wooden goods', 'timber'), ('spiced sausage', 'food'), ('rothe wool', 'cloth'), ('body dye', 'cloth'),
    ('blank spellbook', 'gear'), ('scrying device', 'potions'), ('netherese artifact', 'potions'),
    ('relics from other planes', 'potions'), ('carved ivory', 'precious'), ('beasts of burden', 'mounts'),
    ('trained animal', 'mounts'), ('riding lizard', 'mounts'), ('sea craft', 'mounts'), ('trade-coinage', 'precious'),
    ('mintar gold', 'precious'), ('iron from', 'metal'), ('drink from', 'wine'), ('agricultural', 'food'),
    ('agricutlural', 'food'), ('animal products', 'food'), ('everything needed', None), ('trade services', None),
    ('trade goods', 'gear'), ('luxury goods', 'gear'), ('caravan', 'gear'), ('surface produce', 'food'),
    ('knucklehead trout', 'food'), ('soya sauce', 'food'), ('rice candies', 'food'), ('yak-butter', 'food'),
    ('flying snake', 'mounts'), ('cured hide', 'cloth'), ('clay ware', 'gear'), ('dyed', 'cloth'),
    ('magical innovation', 'potions'), ('beast of burden', 'mounts'), ('sled dog', 'mounts'), ('medicinal plant', 'spices'),
    ('military equipment', 'weapons'), ('alchemical', 'potions'), ('date palm', 'food'), ('jade', 'precious'),
    # люди и услуги — не товар
    ('slave', None), ('mercenar', None), ('mamluk', None), ('wizard', None), ('mage', None), ('sage', None),
    ('shipbuilder', None), ('crafter', None), ('adventurer', None), ('hero', None), ('smuggling', None),
    ('piracy', None), ('hostel', None), ('entertainment', None), ('technology', None), ('self-sufficient', None),
    ('anything', None), ('essentials', None), ('monsters', None), ('from ', None), ('uther', None), ('trade', None),
    # еда
    ('food', 'food'), ('grain', 'food'), ('produce', 'food'), ('crop', 'food'), ('fish', 'food'), ('seafood', 'food'),
    ('shellfish', 'food'), ('roe', 'food'), ('cheese', 'food'), ('fruit', 'food'), ('grape', 'food'), ('apple', 'food'),
    ('gooseberr', 'food'), ('litchi', 'food'), ('vegetable', 'food'), ('salt', 'food'), ('livestock', 'food'),
    ('cattle', 'food'), ('cow', 'food'), ('beef', 'food'), ('pork', 'food'), ('mutton', 'food'), ('goat', 'food'),
    ('meat', 'food'), ('rice', 'food'), ('bread', 'food'), ('salbread', 'food'), ('noodle', 'food'), ('nut', 'food'),
    ('jam', 'food'), ('syrup', 'food'), ('sugar', 'food'), ('cocoa', 'food'), ('corn', 'food'), ('mayz', 'food'),
    ('potato', 'food'), ('hay', 'food'), ('mushroom', 'food'), ('horticulture', 'food'), ('water', 'food'),
    ('ice', 'food'), ('oil', 'food'), ('barley', 'food'), ('millet', 'food'), ('maize', 'food'), ('sheep', 'food'),
    ('shrimp', 'food'), ('carp', 'food'), ('eel', 'food'), ('sturgeon', 'food'), ('whale', 'food'), ('milk', 'food'),
    ('peach', 'food'), ('beet', 'food'), ('coconut', 'food'), ('raisin', 'food'), ('mustard', 'food'),
    # вино и напитки
    ('wine', 'wine'), ('firewine', 'wine'), ('smokewine', 'wine'), ('zardazil', 'wine'), ('ale', 'wine'),
    ('highwater ale', 'wine'), ('beer', 'wine'), ('tea', 'wine'), ('coffee', 'wine'), ('cider', 'wine'),
    ('liquor', 'wine'), ('alcohol', 'wine'), ('drink', 'wine'), ('long jing', 'wine'), ('stout', 'wine'),
    # ткани и кожи
    ('textile', 'cloth'), ('cloth', 'cloth'), ('fabric', 'cloth'), ('silk', 'cloth'), ('wool', 'cloth'),
    ('cotton', 'cloth'), ('lace', 'cloth'), ('fur', 'cloth'), ('pelt', 'cloth'), ('sheepskin', 'cloth'),
    ('leather', 'cloth'), ('dye', 'cloth'), ('carpet', 'cloth'), ('rug', 'cloth'), ('garment', 'cloth'),
    ('footwear', 'cloth'), ('hat', 'cloth'), ('cloak', 'cloth'), ('sail', 'cloth'), ('linen', 'cloth'), ('canvas', 'cloth'),
    ('tapestr', 'cloth'), ('draper', 'cloth'),
    # лес
    ('timber', 'timber'), ('lumber', 'timber'), ('wood', 'timber'), ('redwood', 'timber'), ('mahogany', 'timber'),
    ('ebony', 'timber'), ('charcoal', 'timber'), ('logging', 'timber'), ('bluewood', 'timber'),
    # руда и металл
    ('iron', 'metal'), ('steel', 'metal'), ('copper', 'metal'), ('tin', 'metal'), ('bronze', 'metal'),
    ('brass', 'metal'), ('nickel', 'metal'), ('electrum', 'metal'), ('adamantine', 'metal'), ('ore', 'metal'),
    ('coal', 'metal'), ('sulfur', 'metal'), ('mineral', 'metal'), ('metal', 'metal'), ('forged', 'metal'),
    ('wire', 'metal'), ('lead', 'metal'), ('pewter', 'metal'), ('chain', 'metal'),
    # драгоценности
    ('gold', 'precious'), ('silver', 'precious'), ('gem', 'precious'), ('jewel', 'precious'), ('pearl', 'precious'),
    ('ivory', 'precious'), ('amber', 'precious'), ('scrimshaw', 'precious'), ('bloodstone', 'precious'),
    ('turquoise', 'precious'), ('crystal', 'precious'), ('obsidian', 'precious'), ('skystone', 'precious'),
    ('rubies', 'precious'), ('ruby', 'precious'), ('jasper', 'precious'), ('chalcedony', 'precious'),
    # пряности и снадобья
    ('spice', 'spices'), ('herb', 'spices'), ('perfume', 'spices'), ('incense', 'spices'), ('frankincense', 'spices'),
    ('myrrh', 'spices'), ('saffron', 'spices'), ('ginger', 'spices'), ('poison', 'spices'), ('narcotic', 'spices'),
    ('illicit', 'spices'), ('medicine', 'spices'), ('ointment', 'spices'), ('pepper', 'spices'), ('vanilla', 'spices'),
    ('tobacco', 'spices'), ('cosmetic', 'spices'),
    # оружие, доспехи
    ('weapon', 'weapons'), ('sword', 'weapons'), ('blade', 'weapons'), ('crossbow', 'weapons'), ('arms', 'weapons'),
    ('arrowhead', 'weapons'), ('arrow', 'weapons'), ('bows', 'weapons'), ('armor', 'armor'), ('armour', 'armor'),
    # верховые, скот и повозки
    ('horse', 'mounts'), ('mule', 'mounts'), ('oxen', 'mounts'), ('wagon', 'mounts'), ('ship', 'mounts'),
    ('boat', 'mounts'), ('barge', 'mounts'), ('animal', 'mounts'), ('saddle', 'mounts'), ('carriage', 'mounts'),
    # зелья и магия
    ('magic', 'potions'), ('spell', 'potions'), ('scroll', 'potions'), ('potion', 'potions'), ('smokepowder', 'potions'),
    # ремесло и снаряжение, общие слова
    ('potter', 'gear'), ('porcelain', 'gear'), ('ceramic', 'gear'), ('pot', 'gear'), ('pan', 'gear'), ('bowl', 'gear'),
    ('glass', 'gear'), ('lens', 'gear'), ('telescope', 'gear'), ('paper', 'gear'), ('parchment', 'gear'),
    ('vellum', 'gear'), ('book', 'gear'), ('ink', 'gear'), ('tool', 'gear'), ('rope', 'gear'), ('net', 'gear'),
    ('glue', 'gear'), ('lantern', 'gear'), ('lamp', 'gear'), ('lock', 'gear'), ('hinge', 'gear'), ('bell', 'gear'),
    ('toy', 'gear'), ('soap', 'gear'), ('cask', 'gear'), ('keg', 'gear'), ('firework', 'gear'), ('instrument', 'gear'),
    ('mechanism', 'gear'), ('art', 'gear'), ('painting', 'gear'), ('carving', 'gear'), ('sculpture', 'gear'),
    ('statu', 'gear'), ('antiquit', 'gear'), ('stone', 'gear'), ('basalt', 'gear'), ('granite', 'gear'),
    ('marble', 'gear'), ('mosaic', 'gear'), ('brick', 'gear'), ('tile', 'gear'), ('clay', 'gear'), ('mirror', 'gear'),
    ('crate', 'gear'), ('wicker', 'gear'), ('hardware', 'gear'), ('feather', 'gear'), ('whalebone', 'gear'), ('augmentation', 'gear'),
    ('goods', 'gear'), ('items', 'gear'), ('craft', 'gear'), ('manufactured', 'gear'), ('exotic', 'gear'),
]
KEYS = [(re.compile(r'(?<![a-z])' + re.escape(k)), g) for k, g in TERMS]
SPLIT = re.compile(r',|;| and | or |/|&|\(|\)|\.(?:\s|$)')


def terms(s):
    s = re.sub(r'(?<=[a-z])(?=[A-Z])', ', ', s)
    return [t.strip(' .').lower() for t in SPLIT.split(s) if t.strip(' .')]


def goods_of(s, rest):
    out = set()
    for t in terms(s):
        hit = next((g for rx, g in KEYS if rx.search(t)), 'rest')
        if hit == 'rest':
            rest[t] += 1
        elif hit:
            out.add(hit)
    return sorted(out, key=GOODS.index)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--wiki', default=next(iter(sorted(glob.glob('/Volumes/внешний/datasets/fr-wiki-*/fr-wiki-places.jsonl'), reverse=True)), None))
    ap.add_argument('--out', default=str(ROOT / 'content/world/econ.json'))
    a = ap.parse_args()
    src = ROOT / 'content/world/kingdoms.json'
    if not src.exists():
        print('Нет content/world/kingdoms.json — сначала import-kingdoms.py; товаров нет.')
        return 0
    file = json.loads(src.read_text())
    rest = Counter()
    kingdoms = {}
    for k in file['kingdoms']:
        rec = {key: g for key, field in (('x', 'exports'), ('m', 'imports')) if k.get(field) and (g := goods_of(k[field], rest))}
        if rec:
            kingdoms[k['id']] = rec
    places = {}
    if a.wiki and Path(a.wiki).exists():
        by_name = {}
        for p in json.loads((ROOT / 'content/maps/toril-places.json').read_text())['places']:
            by_name.setdefault(p['name'], []).append(p['id'])
        for line in open(a.wiki, encoding='utf-8'):
            r = json.loads(line)
            v = (r.get('box') or {}).get('exports')
            ids = by_name.get(r.get('title'))
            if v and ids and (g := goods_of(v, rest)):
                for pid in ids:
                    places[pid] = {'x': g}
    else:
        print('Выжимки мест вики нет — товары только держав.')
    for t, n in rest.most_common():
        print(f'  без товара: {t} ×{n}')
    bad = [t for t, n in rest.items() if n >= REST_MAX]
    if bad:
        print(f'Термины без товара встречаются {REST_MAX} раз и чаще — допишите TERMS: {", ".join(sorted(bad))}', file=sys.stderr)
        return 1
    count = Counter(g for r in kingdoms.values() for side in r.values() for g in side)
    print(f'Держав с товарами: {len(kingdoms)}, мест: {len(places)}; по товарам: ' + ', '.join(f'{g} {count[g]}' for g in GOODS))
    Path(a.out).write_text(json.dumps({
        'attribution': file['attribution'], 'license': file['license'],
        'note': 'exports/imports карточек вики → GOODS, scripts/econ-from-wiki.py',
        'kingdoms': kingdoms, 'places': places,
    }, ensure_ascii=False, separators=(',', ':')) + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
