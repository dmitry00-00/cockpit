# Планы Великого колеса для уровней лестницы «космология» и «план» (HANDOFF §3): кольцо внешних планов по
# мировоззрению, Outlands и Sigil в середине, переходные, параллельные и внутренние планы — только факты карточек
# {{Plane}} Forgotten Realms Wiki (CC BY-SA 3.0), поля модели Великого колеса (*-GW): вид, форма и размер, гравитация,
# время, изменчивость, стихии и энергия, магия, слои, сетка мировоззрения. Место на кольце даёт сама сетка: закон
# слева, хаос справа, добро сверху, зло снизу — раскладка своя (src/cosmos/greatWheel.ts), картинок вики не берём.
#
# Значения свойств — по-английски, как в вики, и по-русски по словарю RU ниже: значения без перевода — ошибка
# импорта, частичный файл не пишется. Русская карточка плана — из ночной разметки L4 (maps/llm/L4.jsonl, только
# status done), если она уже есть.
#
# Второй файл — Великое древо (World Tree, модель 1372 DR): небесные планы на самом Древе (корни, ствол, ветви,
# вершина), дьявольские — по River of Blood в порядке течения, нейтральные — только на ветвях Astral, Cynosure и Fugue
# Plane — вне Древа; порталы между планами. Связи — дословные цитаты статьи World Tree cosmology, свойства — поля
# *-WT карточек планов.
#
# Запуск: .venv/bin/python -I scripts/import-planes.py <dump.xml>
#   Выход: content/cosmos/great-wheel.json, content/cosmos/world-tree.json.
import importlib.util
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location('spelljammer', os.path.join(ROOT, 'scripts', 'import-spelljammer.py'))
sj = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sj)

# id, статья, вид в нашей схеме.
PLANES = [
    ('celestia', 'Mount Celestia', 'outer'), ('bytopia', 'Bytopia', 'outer'), ('elysium', 'Elysium', 'outer'),
    ('beastlands', 'Beastlands (plane)', 'outer'), ('arborea', 'Arborea', 'outer'), ('ysgard', 'Ysgard', 'outer'),
    ('limbo', 'Limbo', 'outer'), ('pandemonium', 'Pandemonium', 'outer'), ('abyss', 'Abyss', 'outer'),
    ('carceri', 'Carceri', 'outer'), ('hades', 'Hades', 'outer'), ('gehenna', 'Gehenna', 'outer'),
    ('nine-hells', 'Nine Hells', 'outer'), ('acheron', 'Acheron', 'outer'), ('mechanus', 'Mechanus', 'outer'),
    ('arcadia', 'Arcadia', 'outer'), ('outlands', 'Outlands', 'outer'), ('sigil', 'Sigil', 'realm'),
    ('astral', 'Astral Plane', 'transitive'), ('ethereal', 'Ethereal plane', 'transitive'),
    ('material', 'Prime Material plane', 'material'), ('feywild', 'Feywild', 'parallel'), ('shadowfell', 'Shadowfell', 'parallel'),
    ('air', 'Elemental Plane of Air', 'inner'), ('earth', 'Elemental Plane of Earth', 'inner'),
    ('fire', 'Elemental Plane of Fire', 'inner'), ('water', 'Elemental Plane of Water', 'inner'),
    ('positive', 'Positive Energy plane', 'energy'), ('negative', 'Negative Energy plane', 'energy'),
]
# Имя на схеме: заголовок статьи без пояснения в скобках и без «plane» там, где вики пишет его со строчной.
NAMES = {'Beastlands (plane)': 'Beastlands', 'Ethereal plane': 'Ethereal Plane', 'Prime Material plane': 'Prime Material Plane',
         'Positive Energy plane': 'Positive Energy Plane', 'Negative Energy plane': 'Negative Energy Plane'}
# Связи планов: from, to, вид, статья и цитата — дословно из статьи (ссылки [[a|b]] читаются как b), источник —
# первая сноска после неё. 'astral' и 'ethereal' — переходный план ведёт от Материального к внешним или внутренним,
# 'echo' — план-отражение Материального.
LINKS = [
    ('material', 'astral', 'astral', 'Astral Plane',
     'According to the Great Wheel cosmology model, the Astral plane connected the Prime Material Planes to the first layers of the Outer planes.'),
    ('material', 'ethereal', 'ethereal', 'Ethereal plane',
     'In the Great Wheel cosmology model, the Ethereal plane existed adjacent to the Prime Material Plane and connected it to the Inner planes (the Elemental planes plus the Energy planes).'),
    ('material', 'feywild', 'echo', 'Feywild',
     'was an "echo" of the Prime Material Plane suffused with potent magic and unrestrained emotions.'),
    ('material', 'shadowfell', 'echo', 'Shadowfell',
     'It existed as sort of a counterpart to the Feywild, in the sense that it was a reflection, or "echo", of the Prime Material Plane.'),
]
# Города-врата Outlands: перечень по часовой стрелке вокруг шпиля — одно предложение статьи Gate-town.
GATES_TITLE = 'Gate-town'
GATES_QUOTE = 'Moving clockwise around the spire, the sixteen gate-towns were'
GATES_TRAVEL = 'Such a journey usually took between three and eighteen days, and it did not seem to matter whether the trip were made on foot or on horseback.'
GATES_ALIAS = {'Baator': 'Nine Hells', 'Beastlands (plane)': 'Beastlands (plane)'}
# Сетка мировоззрения {{alignment grid|…}}: девять ячеек по строкам.
GRID = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE']
TRAITS = {'shape': 'shape-size', 'gravity': 'gravity', 'time': 'time', 'morphic': 'morphic',
          'elements': 'element-energy', 'magic': 'magical'}

# Великое древо: id, статья, вид, место на Древе (только у небесных), имя на схеме — как в статье о модели.
WT_TITLE = 'World Tree cosmology'
WT_PLANES = [
    ('gates-of-the-moon', 'Gates of the Moon', 'celestial', 'top', None),
    ('dweomerheart', 'Dweomerheart', 'celestial', 'branch', None),
    ('house-of-the-triad', 'House of the Triad', 'celestial', 'branch', None),
    ('green-fields', 'Green Fields', 'celestial', 'branch', None),
    ('brightwater', 'Brightwater', 'celestial', 'trunk', None),
    ('golden-hills', 'Golden Hills', 'celestial', 'trunk', None),
    ('house-of-knowledge', 'House of Knowledge (plane)', 'celestial', 'trunk', 'House of Knowledge'),
    ('arvandor', 'Arvandor', 'celestial', 'root', None),
    ('dwarfhome', 'Dwarfhome', 'celestial', 'root', None),
    ('dragon-eyrie', 'Dragon Eyrie', 'neutral', None, None),
    ('heliopolis', 'Heliopolis', 'neutral', None, None),
    ('house-of-nature', 'House of Nature', 'neutral', None, None),
    ('jotunheim', 'Jotunheim', 'neutral', None, None),
    ('warriors-rest', "Warrior's Rest", 'neutral', None, None),
    ('abyss', 'Abyss', 'fiendish', None, None),
    ('blood-rift', 'Blood Rift', 'fiendish', None, None),
    ('nine-hells', 'Nine Hells', 'fiendish', None, None),
    ('barrens', 'Banehold', 'fiendish', None, 'Barrens of Doom and Despair'),
    ('clangor', 'Clangor', 'fiendish', None, None),
    ('furys-heart', "Fury's Heart", 'fiendish', None, None),
    ('hammergrim', 'Hammergrim', 'fiendish', None, None),
    ('nishrek', 'Nishrek', 'fiendish', None, None),
    ('deep-caverns', 'Dismal Caverns', 'fiendish', None, 'Deep Caverns'),
    ('fated-depths', 'Fated Depths', 'fiendish', None, None),
    ('demonweb-pits', 'Demonweb Pits', 'fiendish', None, None),
    ('supreme-throne', 'Supreme Throne', 'fiendish', None, None),
    ('cynosure', 'Cynosure (plane)', 'outside', None, 'Cynosure'),
    ('fugue', 'Fugue Plane', 'outside', None, None),
    ('astral', 'Astral Plane', 'transitive', None, None),
    ('ethereal', 'Ethereal plane', 'transitive', None, 'Ethereal Plane'),
    ('shadow', 'Shadowfell', 'transitive', None, 'Plane of Shadow'),
    ('material', 'Prime Material plane', 'material', None, 'Prime Material Plane'),
    ('air', 'Elemental Plane of Air', 'inner', None, None), ('earth', 'Elemental Plane of Earth', 'inner', None, None),
    ('fire', 'Elemental Plane of Fire', 'inner', None, None), ('water', 'Elemental Plane of Water', 'inner', None, None),
    ('positive', 'Positive Energy plane', 'energy', None, 'Positive Energy Plane'),
    ('negative', 'Negative Energy plane', 'energy', None, 'Negative Energy Plane'),
]
WT_TREE = ('The roots reached into Arvandor and Dwarfhome from the trunk, which touched Brightwater, the Golden Hills, and the '
           'House of Knowledge. Extending from the trunk were branches to Dweomerheart, the House of the Triad, and Green '
           'Fields, with the top of the Tree terminating in the Gates of the Moon.')
WT_RIVER = ("The River of Blood was thought to originate in the Abyss and flow in order through Blood Rift, the Nine Hells, "
            "the Barrens of Doom and Despair, Clangor, Fury's Heart, Hammergrim, Nishrek, and the Deep Caverns before "
            "cascading into the Fated Depths.")
WT_RIVER_ORDER = ['abyss', 'blood-rift', 'nine-hells', 'barrens', 'clangor', 'furys-heart', 'hammergrim', 'nishrek',
                  'deep-caverns', 'fated-depths']
# Группы и переходные планы: что о них пишет статья.
WT_NOTES = {
    'astral': 'all branches of the tree-shaped Astral Plane only led to or from the Prime Material Plane',
    'inner': 'the major difference being that they were connected to the Prime Material Plane via the Astral Plane instead of the Ethereal Plane',
    'neutral': 'were connected to the Astral Plane in the usual fashion but were host to neither a branch of the World Tree nor a channel of the River of Blood.',
    'outside': "In the World Tree cosmology model there were two planes that, from a mortal's point of view, existed outside the model, disconnected from the Astral tree structure",
    'ethereal': 'The Ethereal Plane was coexistent with the Prime Material Plane, touching it at every point.',
    'shadow': 'The Shadow Plane coexisted with the Material Plane and could be used as a transitive plane for rapidly traveling long distances between points on the Prime.',
}
# Порталы: пары и предложение статьи, где они названы. 'intermittent' — связь непостоянная.
WT_PORTALS = [
    (['brightwater', 'dragon-eyrie', 'house-of-nature', 'gates-of-the-moon'], 'arvandor', 'portal',
     'Known portals included passages to Brightwater, Dragon Eyrie, the House of Nature, and the Gates of the Moon.'),
    (['green-fields', 'heliopolis'], 'brightwater', 'portal',
     'Connections were known to exist between this plane and Arvandor, Green Fields, and Heliopolis.'),
    (['house-of-knowledge'], 'golden-hills', 'portal',
     'The only known portal in the Golden Hills connected to Gond\'s realm in the House of Knowledge.'),
    (['barrens', 'clangor', 'demonweb-pits', 'fugue', 'hammergrim'], 'abyss', 'portal',
     'Known portals existed between the Abyss and the Barrens of Doom and Despair, Clangor, the Demonweb Pits, the Fugue Plane, and Hammergrim.'),
    (['fated-depths', 'deep-caverns'], 'abyss', 'intermittent', 'Intermittent connections also existed to the Fated Depths and Deep Caverns.'),
    (['hammergrim'], 'barrens', 'portal', 'Portals existed to Hammergrim and the Abyss'),
    (['nine-hells'], 'clangor', 'portal', 'portals to the Abyss and the Nine Hells existed'),
    (['water'], 'fated-depths', 'portal',
     'The Elemental Plane of Water and layers of the Abyss that were water-dominant or that had wide or deep bodies of water were connected by portal to this plane.'),
    (['furys-heart'], 'fated-depths', 'portal', "A portal to Umberlee's home in Fury's Heart was also known to cosmologists."),
    (['barrens'], 'nine-hells', 'portal', 'portals were known to exist leading to the Barrens of Doom and Despair and Clangor.'),
    (['heliopolis'], 'dragon-eyrie', 'portal', 'had a portal to another realm in Heliopolis.'),
    (['fire'], 'jotunheim', 'portal', "The only known portal to this plane connected Surtr's domain to the Elemental Plane of Fire."),
    (['nine-hells'], 'fugue', 'portal', 'The only portals were the ones sanctioned by Kelemvor to the Nine Hells'),
]

RU = {
    # форма и размер
    'Innumerable, immeasurable layers': 'бесчисленные слои неизмеримой величины',
    'Infinite void, four layers shaped like floating blocks': 'бесконечная пустота; четыре слоя — парящие глыбы',
    'Three infinite layers': 'три бесконечных слоя', 'Five infinite layers': 'пять бесконечных слоёв',
    'Four infinite layers': 'четыре бесконечных слоя', 'Seven infinite layers': 'семь бесконечных слоёв',
    'Nine infinite layers': 'девять бесконечных слоёв', 'Infinite': 'бесконечен', 'Infinite Size': 'бесконечен',
    'Two layers that share the same sky': 'два слоя под общим небом',
    'Six layers, each a string of planetoids floating in air': 'шесть слоёв, каждый — цепь планетоидов в воздухе',
    'Infinite or the same size as its coexistent plane': 'бесконечен или равен плану, с которым сосуществует',
    'One infinite layer, but with a definite center': 'один бесконечный слой с определённым центром',
    'Three layers filled with rivers of earth': 'три слоя, полные рек земли',
    'Torus; Diameter: 5; Circumference: 20': 'тор: диаметр 5 миль, окружность 20 миль',
    # гравитация
    'Normal': 'обычная', 'None': 'нет', 'Heavy': 'сильная', 'Light': 'слабая',
    'Normal, varies between layers': 'обычная, по слоям разная',
    'Subjective Directional': 'субъективная: низ там, где решишь', 'Subjective directional': 'субъективная: низ там, где решишь',
    'Objective directional': 'направленная',
    'Objective Directional: toward the surface of each floating block': 'направленная: к поверхности каждой глыбы',
    'Objective Directional: both layers, in opposite directions': 'направленная: на двух слоях — в противоположные стороны',
    'Objective directional: at a 45° angle to the level of the ground': 'направленная: под углом 45° к земле',
    'Subjective Directional: normal when touching a solid object, otherwise No Gravity': 'субъективная: обычная, пока касаешься твёрдого, иначе нет',
    'Objective Directional: normal to the surface of each cog': 'направленная: к поверхности каждой шестерни',
    'Objective Directional: away from the center of passages and caverns': 'направленная: от середины ходов и пещер',
    'Objective directional: normal to one side of a river': 'направленная: к одному берегу реки',
    # время
    'Normal Time': 'обычное', 'Erratic': 'непостоянное',
    'Flowing (1000 real years = 1 subjective day)': 'течёт иначе: 1000 лет снаружи — 1 день здесь',
    # изменчивость
    'Divinely': 'меняют только боги', 'Alterable': 'поддаётся изменению', 'Alterable Morphic': 'поддаётся изменению',
    'Highly': 'легко меняется', 'Magically': 'меняется магией', 'Highly on large scale': 'легко меняется в крупном',
    'Highly (special); Divinely (minor)': 'легко меняется (по-особому), боги — в малом',
    # стихии и энергия
    'Mixed': 'смешанные', 'Air-dominant': 'преобладает воздух', 'Earth-dominant': 'преобладает земля',
    'Fire-dominant': 'преобладает огонь', 'Water-dominant': 'преобладает вода',
    'Minor positive-dominant': 'слабо преобладает положительная энергия', 'Fire-dominant (partial)': 'местами преобладает огонь',
    'Air-Earth-Fire-Water-Dominant, in pockets': 'карманами преобладают воздух, земля, огонь, вода',
    'Major Negative-Dominant with some Minor Dominant regions': 'сильно преобладает отрицательная энергия, местами слабее',
    'Major Positive-Dominant with some Minor Dominant regions': 'сильно преобладает положительная энергия, местами слабее',
    'None, but with exceptions': 'нет, с исключениями',
    'None, but some minor negative-dominant areas': 'нет, местами слабо преобладает отрицательная энергия',
    # магия
    'Normal with special cases': 'обычная, с особыми случаями',
    'Limited (by the mortai): air and weather spells': 'ограничена (mortai): заклинания воздуха и погоды',
    'Enhanced: air-related; Impeded: earth-related': 'усилена — воздух, ослаблена — земля',
    'Enhanced: earth-related; Impeded: air-related': 'усилена — земля, ослаблена — воздух',
    'Enhanced: fire-related; Impeded: water-related': 'усилена — огонь, ослаблена — вода',
    'Enhanced: water-related; Impeded: fire-related': 'усилена — вода, ослаблена — огонь',
    'Enhanced (arcane)': 'усилена — тайная магия',
    # Великое древо
    'One infinite layer': 'один бесконечный слой', 'Finite': 'конечен', 'Normal gravity': 'обычная', 'Timeless': 'безвременье',
    'Alterable morphic, divine realms were divinely morphic': 'поддаётся изменению; владения богов меняют только боги',
    'Alterable (divine realms were divinely morphic)': 'поддаётся изменению; владения богов меняют только боги',
    'Alterable (realms were divinely morphic)': 'поддаётся изменению; владения богов меняют только боги',
    'Alterable morphic. Each divine realm was divinely morphic.': 'поддаётся изменению; владения богов меняют только боги',
    'Alterable (each realm was divinely morphic)': 'поддаётся изменению; владения богов меняют только боги',
    'Alterable (each realm is divinely morphic)': 'поддаётся изменению; владения богов меняют только боги',
    'Alterable (divine realms divinely morphic)': 'поддаётся изменению; владения богов меняют только боги',
    'Alterable (each realm divinely morphic)': 'поддаётся изменению; владения богов меняют только боги',
    'Varies, usually Alterable Morphic': 'по-разному, обычно поддаётся изменению',
    'Alterable morphic; Divinely morphic': 'поддаётся изменению; меняют и боги', 'Highly and divinely': 'легко меняется, меняют и боги',
    'Static': 'неизменен',
    'Mildly good-aligned and mildly chaos-aligned': 'слабо добрый и слабо хаотичный', 'Mildly good-aligned': 'слабо добрый',
    'Strongly law-aligned; Mildly good-aligned': 'сильно законный, слабо добрый', 'Mildly chaotic and mildly evil': 'слабо хаотичный и слабо злой',
    'Mildly evil-aligned': 'слабо злой', 'Mildly Evil-Aligned': 'слабо злой', 'Strongly evil-aligned': 'сильно злой',
    'Mildly chaos-aligned and strongly evil-aligned': 'слабо хаотичный, сильно злой',
    'Mildly law-aligned and mildly evil-aligned': 'слабо законный и слабо злой', 'Mildly evil-aligned; Mildly chaos-aligned': 'слабо злой, слабо хаотичный',
    'Mildly chaos-aligned': 'слабо хаотичный', 'Mildly-neutral aligned': 'слабо нейтральный', 'Mildly neutral-aligned': 'слабо нейтральный',
    'Enhanced (divine enchantments and illusions': 'усилена — божественные очарования и иллюзии', 'Enhanced': 'усилена',
    'Normal magic': 'обычная', 'Wild magic': 'дикая магия', 'Enhanced (druid spells)': 'усилена — заклинания друидов',
    'Enhanced (wild magic)': 'усилена — дикая магия', 'Impeded (all)': 'ослаблена вся',
    'Enhanced Magic: spells and spell-like abilities are quickened': 'усилена: заклинания и подобные им способности ускорены',
    'Dead': 'мертва', "Cold-dominant in Auril's realm": 'во владении Auril преобладает холод',
    'Limited: spells that affect animals, otherwise normal': 'ограничена: заклинания на животных; остальное — обычно',
    'Normal, but semi-permanent': 'обычная, но эффекты почти постоянны',
    'Limited: School of Illusion (Illusions and phantasms are useless)': 'ограничена: школа иллюзии бесполезна',
    'Enhanced Magic: inflict spells, negative-energy related; Impeded Magic: cure spells, positive-energy related':
        'усилена — причинение ран и отрицательная энергия, ослаблена — лечение и положительная энергия',
    'Enhanced Magic: cure spells, positive-energy related; Impeded Magic: inflict spells, negative-energy related':
        'усилена — лечение и положительная энергия, ослаблена — причинение ран и отрицательная энергия',
    'Limited to dead: magic fades toward the center': 'слабеет к центру до полного исчезновения',
    'Normal, but sound-based spells have very limited range': 'обычная, но у звуковых заклинаний очень малая дальность',
    'Enhanced (shadow), Impeded (light and fire)': 'усилена — тень, ослаблена — свет и огонь',
}


def plane_box(text):
    """Поля {{Plane}}: значение — до следующей строки «| ключ =» (галереи и <br /> — многострочны)."""
    m = re.search(r'\{\{\s*Plane\s*\n', text)
    if not m:
        return None
    out, key = {}, None
    for line in text[m.end():].split('\n'):
        if line.startswith('}}'):
            break
        mm = re.match(r'\|\s*([\w &-]+?)\s*=\s*(.*)$', line)
        if mm:
            key = mm.group(1)
            out[key] = mm.group(2)
        elif key:
            out[key] += '\n' + line
    return out


def current(v):
    """Значение без прежних редакций ({{Former}} …): Великое колесо — каким его описывают сейчас."""
    return re.split(r'<br\s*/?>\s*\{\{Former\}\}', v)[0]


# Род зависит от свойства: гравитация и магия — «обычная», время — «обычное».
RU_BY = {('time', 'Normal'): 'обычное', ('elements', 'None'): 'нет', ('alignment', 'Mixed'): 'смешанное',
         ('gravity', 'Varies'): 'разная', ('elements', 'Varies'): 'разные'}


def trait(box, key, field, missing):
    raw = current(box.get(field, ''))
    if raw.lstrip().startswith('{{'):
        return None
    en = sj.clean(raw).replace('&deg;', '°')
    if not en:
        return None
    ru = RU_BY.get((key, en)) or RU.get(en)
    if not ru:
        missing.add(en)
    return {'en': en, 'ru': ru or ''}


def alignment(box, cos='GW'):
    cells = re.findall(r'\|\s*(on|off)\s*', box.get(f'alignment-{cos}', ''))
    return [GRID[i] for i, c in enumerate(cells[:9]) if c == 'on']


def l4_cards():
    path = os.path.join(ROOT, 'maps', 'llm', 'L4.jsonl')
    if not os.path.exists(path):
        return {}
    out = {}
    for line in open(path, encoding='utf-8'):
        r = json.loads(line)
        if r.get('status') == 'done' and r.get('card'):
            out[r['id'].removeprefix('plane:')] = {k: v for k, v in r['card'].items() if v}
    return out


def gates(text, ids):
    """Город-врата → план: «[[Automata]] (''portal'' to [[Mechanus]])» в предложении-перечне."""
    i = text.find(GATES_QUOTE)
    if i < 0:
        sys.exit(f'{GATES_TITLE}: нет перечня городов-врат')
    sentence = text[i:].split('\n', 1)[0]
    out = []
    for town, plane in re.findall(r"\[\[([^\]]+)\]\] \(''portal'' to (?:the )?\[\[([^\]]+)\]\]\)", sentence):
        town_title, _, town_name = town.partition('|')
        plane_title = GATES_ALIAS.get(plane.split('|')[0], plane.split('|')[0])
        if plane_title not in ids:
            sys.exit(f'{GATES_TITLE}: план {plane_title!r} не в списке')
        out.append({'town': town_name or town_title, 'plane': ids[plane_title], 'url': sj.WIKI + town_title.replace(' ', '_')})
    if len(out) != 16:
        sys.exit(f'{GATES_TITLE}: городов-врат {len(out)}, а не 16')
    return out


def main():
    dump = sys.argv[1]
    titles = [t for _, t, _ in PLANES] + [GATES_TITLE, WT_TITLE] + [t for _, t, *_ in WT_PLANES]
    pages = sj.read_dump(dump, titles)
    cards = l4_cards()
    missing, planes = set(), []
    for pid, title, kind in PLANES:
        text = pages[title]
        box = plane_box(text)
        if not box:
            sys.exit(f'нет карточки Plane: {title}')
        names = sj.named_refs(text)
        refs = sj.refs_in(box.get('refs-GW', '') + box.get('basicrefs', ''), names)[:3]
        p = {'id': pid, 'name': NAMES.get(title, title), 'kind': kind, 'url': sj.WIKI + title.replace(' ', '_'),
             'alignment': alignment(box)}
        for k, field in TRAITS.items():
            v = trait(box, k, f'{field}-GW', missing)
            if v:
                p[k] = v
        layers = [x.strip() for x in sj.clean(current(box.get('layers-GW', ''))).split(';') if x.strip()]
        if len(layers) > 1:
            p['layers'] = layers
        if loc := sj.clean(box.get('location-GW', '')):
            p['location'] = re.sub(r'^the ', '', loc)
        p['refs'] = refs
        if title in cards:
            p['card'] = cards[title]
        planes.append(p)
    if missing:
        sys.exit('нет перевода в RU:\n' + '\n'.join(sorted(missing)))
    links = [{'from': a, 'to': b, 'kind': kind, 'quote': q, 'url': sj.WIKI + t.replace(' ', '_'),
              'ref': sj.find_quote(pages[t], q, t)} for a, b, kind, t, q in LINKS]
    ids = {t: pid for pid, t, _ in PLANES}
    gate_text = pages[GATES_TITLE]
    outlands = {
        'gates': gates(gate_text, ids),
        'quote': GATES_QUOTE + ' …',
        'travelQuote': GATES_TRAVEL,
        'travelDays': [3, 18],
        'url': sj.WIKI + GATES_TITLE,
        'ref': sj.find_quote(gate_text, GATES_QUOTE, GATES_TITLE),
        'travelRef': sj.find_quote(gate_text, GATES_TRAVEL, GATES_TITLE),
    }
    outer = [p for p in planes if p['kind'] == 'outer' and p['id'] != 'outlands']
    if len(outer) != 16 or any(not p['alignment'] for p in outer):
        sys.exit('кольцо: нужно 16 внешних планов с сеткой мировоззрения')
    doc = {
        'cosmology': 'Great Wheel',
        'attribution': sj.ATTRIBUTION,
        'license': sj.LICENSE,
        'note': 'Свойства — поля модели Великого колеса из карточек планов вики (дословно и в переводе); место плана '
                'на кольце — по его сетке мировоззрения; русская карточка — ночная разметка L4, где она готова.',
        'planes': planes,
        'links': links,
        'outlands': outlands,
    }
    write('great-wheel.json', doc)
    write('world-tree.json', world_tree(pages, cards))


def write(name, doc):
    path = os.path.join(ROOT, 'content', 'cosmos', name)
    with open(path + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    os.replace(path + '.tmp', path)
    print(f'{path}: {len(doc["planes"])} планов, карточек L4 {sum(1 for p in doc["planes"] if "card" in p)}', file=sys.stderr)


def world_tree(pages, cards):
    """Великое древо: планы со свойствами *-WT, места на Древе, River of Blood, порталы — всё с цитатами статьи."""
    art = pages[WT_TITLE]
    url = sj.WIKI + WT_TITLE.replace(' ', '_')
    quote = lambda q: {'quote': q, 'url': url, 'ref': sj.find_quote(art, q, WT_TITLE)}
    missing, planes = set(), []
    for pid, title, kind, place, name in WT_PLANES:
        text = pages[title]
        box = plane_box(text) or {}
        refs = sj.refs_in(box.get('refs-WT', '') + box.get('basicrefs', ''), sj.named_refs(text))[:3]
        p = {'id': pid, 'name': name or NAMES.get(title, title), 'kind': kind, 'url': sj.WIKI + title.replace(' ', '_'),
             'alignment': alignment(box, 'WT')}
        if place:
            p['place'] = place
        for k, field in TRAITS.items():
            v = trait(box, k, f'{field}-WT', missing)
            if v:
                p[k] = v
        if not p['alignment'] and (v := trait(box, 'alignment', 'alignment-WT', missing)):
            p['alignmentText'] = v
        p['refs'] = refs
        if title in cards:
            p['card'] = cards[title]
        planes.append(p)
    if missing:
        sys.exit('нет перевода в RU (Древо):\n' + '\n'.join(sorted(missing)))
    ids = {p['id'] for p in planes}
    links, seen = [], set()
    for others, at, kind, q in WT_PORTALS:
        src = quote(q)
        for o in others:
            key = tuple(sorted((at, o)))
            if o not in ids or at not in ids:
                sys.exit(f'Древо: портал к неизвестному плану {at} — {o}')
            if key not in seen:
                seen.add(key)
                links.append({'from': at, 'to': o, 'kind': kind, **src})
    return {
        'cosmology': 'World Tree',
        'attribution': sj.ATTRIBUTION,
        'license': sj.LICENSE,
        'note': 'Модель Великого древа (1372 DR): свойства — поля *-WT карточек планов, связи — цитаты статьи World Tree '
                'cosmology; раскладка схемы своя.',
        'planes': planes,
        'tree': quote(WT_TREE),
        'river': {'order': WT_RIVER_ORDER, **quote(WT_RIVER)},
        'notes': {k: quote(q) for k, q in WT_NOTES.items()},
        'links': links,
    }


if __name__ == '__main__':
    main()
