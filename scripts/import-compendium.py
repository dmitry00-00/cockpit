# Компендиум из наработанных таблиц: «Копия расы.xlsx» и «Копия файла _Копия Классы.xlsx_.xlsx»
# → content/compendium/{races,feats,classes}.json по схеме src/rules/compendium/schema.ts.
#
# Таблицы — визуальные: смысл в позиции клетки, а не в заголовке колонки. Карта колонок ниже
# снята с файлов 18.09.2026 и держится тестом src/rules/compendium/compendium.test.ts.
# Всё, что не разобралось, попадает в отчёт (stdout и content/compendium/report.md), а не в тишину.
#
# Запуск из корня пакета: .venv/bin/python scripts/import-compendium.py [--races ФАЙЛ] [--classes ФАЙЛ]
import sys, json, re, datetime
from collections import Counter, defaultdict
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'content' / 'compendium'
RACES_XLSX = ROOT / 'Копия расы.xlsx'
CLASSES_XLSX = ROOT / 'Копия файла _Копия Классы.xlsx_.xlsx'

args = sys.argv[1:]
if '--races' in args: RACES_XLSX = Path(args[args.index('--races') + 1])
if '--classes' in args: CLASSES_XLSX = Path(args[args.index('--classes') + 1])

report = []
resolved = []
def note(msg): report.append(msg)
def record_resolution(msg): resolved.append(msg)

ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha']

# ----------------------------------------------------------------- SRD 5.1: что есть в открытой части
# Только это помечается source: 'srd'; всё остальное из книг — 'book', с суффиксом (HB) — 'hb'.
SRD_RACES = {'человек': 'Human', 'эльф': 'Elf', 'дварф': 'Dwarf', 'полурослик': 'Halfling', 'гном': 'Gnome',
             'полуэльф': 'Half-Elf', 'полуорк': 'Half-Orc', 'тифлинг': 'Tiefling', 'драконорожденный': 'Dragonborn'}
SRD_SUBRACES = {('эльф', 'высший'): 'High Elf', ('дварф', 'холмовой'): 'Hill Dwarf', ('полурослик', 'легконогий'): 'Lightfoot',
                ('гном', 'скальный'): 'Rock Gnome', ('гном', 'каменный(скальный)'): 'Rock Gnome', ('гном', 'каменный'): 'Rock Gnome'}
SRD_CLASSES = {'варвар': 'Barbarian', 'бард': 'Bard', 'жрец': 'Cleric', 'друид': 'Druid', 'воин': 'Fighter', 'монах': 'Monk',
               'паладин': 'Paladin', 'следопыт': 'Ranger', 'плут': 'Rogue', 'чародей': 'Sorcerer', 'колдун': 'Warlock', 'волшебник': 'Wizard'}
# Подклассы SRD — по одному на класс; сопоставление точное, по нормализованному имени из таблицы.
SRD_SUBCLASSES = {'варвар': 'берсерка', 'бард': 'знаний', 'жрец': 'жизни', 'друид': 'земли', 'воин': 'чемпион', 'монах': 'открытойладони',
                  'паладин': 'преданности', 'следопыт': 'охотник', 'плут': 'вор', 'чародей': 'наследиедраконьейкрови', 'колдун': 'исчадие',
                  'волшебник': 'воплощения'}
SRD_FEATS = {'борец': 'Grappler', 'захватчик': 'Grappler'}
DEDUPLICATED_FEATS = {'stihiynyy-adept', 'podvijnyy'}
HB_FEAT_SOURCE_REFS = {
    'boazn-krovi': '«Черты приключенцев (расширенные)», стр. 5 (HB), копия сборника сообщества на Scribd: https://ru.scribd.com/document/464880188; издатель первоисточника не подтверждён',
}

CLASS_SHEETS = {'Воин': 'воин', 'Варвар': 'варвар', 'плут': 'плут', 'м': 'монах', 'с': 'следопыт', 'Паладин': 'паладин',
                'ж': 'жрец', 'и': 'изобретатель', 'б': 'бард', 'к': 'колдун', 'д': 'друид', 'ч': 'чародей', 'вол': 'волшебник'}
CLASS_NAMES_RU = {'воин': 'Воин', 'варвар': 'Варвар', 'плут': 'Плут', 'монах': 'Монах', 'следопыт': 'Следопыт', 'паладин': 'Паладин',
                  'жрец': 'Жрец', 'изобретатель': 'Изобретатель', 'бард': 'Бард', 'колдун': 'Колдун', 'друид': 'Друид', 'чародей': 'Чародей', 'волшебник': 'Волшебник'}
SUBCLASS_LABELS = {'подклассы', 'пути', 'путь', 'архетипы', 'архетип', 'домены', 'домен', 'круги', 'круг', 'коллегии', 'коллегия', 'клятвы', 'клятва',
                   'традиции', 'традиция', 'покровители', 'покровитель', 'происхождения', 'происхождение', 'специализации', 'специализация', 'школы', 'школа'}

# ----------------------------------------------------------------- утилиты
def clean(s):
    return re.sub(r'\s+', ' ', str(s).replace('\xa0', ' ')).strip()

def artificer_starting_equipment_plan(raw, source_sheet, source_cell):
    """Split only the known Artificer workbook row; preserve its exact text and provenance."""
    split = re.split(r'\s+либо\s+', raw, maxsplit=1, flags=re.IGNORECASE)
    if len(split) != 2:
        return None
    before_alternative, alternative = split
    bullets = [clean(part) for part in before_alternative.split('•') if clean(part)]
    if len(bullets) != 4:
        return None
    armor = re.fullmatch(r'а\)\s*(.+?)\s+или\s+б\)\s*(.+)', bullets[2], flags=re.IGNORECASE)
    if not armor:
        return None
    return {
        'sourceSheet': source_sheet,
        'sourceCell': source_cell,
        'granted': [bullets[0], bullets[1], bullets[3]],
        'choices': [{'name': 'Доспех', 'options': [clean(armor.group(1)), clean(armor.group(2))]}],
        'wholeSetAlternative': clean(alternative),
        'raw': raw,
    }

def tidy_num(s):
    """openpyxl отдаёт числовые клетки float: заголовок «0» приходит как 0.0, ячейки — как 3.0. Целое остаётся целым."""
    s = clean(s)
    return re.sub(r'^([-+]?\d+)\.0(?=$|[^\d.])', r'\1', s)

def title_case(s):
    """Имя из таблицы, где часть строк набрана КАПСОМ, а часть — со строчной: слова капсом опускаются, первая буква прописная."""
    s = ' '.join(w.lower() if len(w) > 1 and w.isupper() else w for w in clean(s).split(' '))
    return s[:1].upper() + s[1:]

def clean_text(s):
    """Текст черты: пробелы схлопываются, абзацы (пустые строки) остаются; линейки из подчёркиваний — разделители листа, не текст."""
    s = re.sub(r'_{4,}', '', str(s))
    lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in s.replace('\xa0', ' ').replace('\r', '').split('\n')]
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()

def norm_key(s):
    """Ключ для сопоставления с SRD: нижний регистр, ё→е, без пробелов и невидимых символов."""
    return re.sub(r'[\s\u200b\ufeff]+', '', clean(s).lower().replace('ё', 'е'))

def is_empty(v):
    return v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, str) and v.strip() == '-')

def slug(s):
    t = clean(s).lower()
    t = re.sub(r'\(hb\)', '', t)
    table = str.maketrans('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abvgdeejziyklmnoprstufhccss_y_eua')
    t = t.translate(table)
    t = re.sub(r'[^a-z0-9]+', '-', t).strip('-')
    return t or 'x'

def split_trait(cell):
    """«Имя\n\nТекст» → (имя, текст). Имя без точки на конце и без «...»."""
    raw = str(cell).replace('\xa0', ' ').replace('\r', '').strip()
    parts = [p.strip() for p in re.split(r'\n\s*\n|\n', raw, maxsplit=1)]
    name = clean(parts[0]).rstrip('.').replace('...', '').strip()
    text = clean_text(parts[1]) if len(parts) > 1 else ''
    if name.endswith('/'):
        # «Имя /\nВторое имя\n\nТекст»: два перевода одного умения — оба в имя, текст — что осталось.
        alt, _, rest = text.partition('\n\n')
        if alt and '\n' not in alt and len(alt) <= 50:
            name = f"{name.rstrip('/ ').strip()} / {alt.strip()}"
            text = rest.strip()
    if not text and len(name) > 60:  # имя без переноса — это текст без имени
        return name[:60] + '…', clean_text(raw)
    return name, text

KIND_RULES = [
    # (фасет, ключи по названию черты); ключ с \b — целое слово, иначе подстрока
    ('vision', ['зрение', 'зрени']),
    ('weapon-armor', ['оружи', 'доспех', 'боевая подготовка', 'боевая тренировка', 'воинское воспитание']),
    ('tool', ['инструмент']),
    ('proficiency', ['владени', 'тренировка', 'подготовка', 'воспитание', 'мастерство', 'навык']),
    ('resistance', ['сопротивл', 'иммунитет', 'устойчивость']),
    ('spell', ['заклинани', 'заговор', 'магия', 'магическ', 'псионик', 'ритуал', 'иллюзи', 'благословение']),
    ('movement', ['скорост', 'ноги', 'полёт', 'полет', 'плов', 'амфибия', 'скакун', 'походка', r'\bшаг\b', 'бегство', 'прыжок', 'лазани', 'плаван']),
    ('size', ['телосложение', 'крупное тело', 'мощное', 'размер', r'\bтело\b']),
    ('natural-armor', ['броня', r'\bкожа\b', 'панцирь', 'чешуя']),
    ('unarmed', ['укус', 'когти', 'рога', 'хобот', 'баран', 'оружие дыхания', 'пасть', 'клюв', 'жало', 'копыт']),
    ('save', ['спасброс', 'храбр', 'стойкость', r'\bум\b', 'дисциплина', 'бесстрастие']),
    ('skill', ['чувства', 'нюх', 'интуиция', 'бдительн', 'наблюдательн', r'\bслух\b', 'хитрость']),
    ('limbs', ['конечност', r'\bруки\b', 'щупальц']),
    ('sense', ['телепати', 'чутьё', 'чутье']),
]

# Второй проход — по началу текста, когда название молчит: «Владение навыком Атлетика», «Вам известен заговор…».
TEXT_RULES = [
    ('natural-armor', [r'\+\d к (кд|классу доспеха)']),
    ('tool', [r'^(вы )?владе\w+ (\w+ )?инструмент', r'^один из инструментов']),
    ('skill', [r'^(вы )?владе\w+ (одним|двумя|навык)', r'^навык', r'^владения одним из навыков', r'преимуществ\w+ (для|на|при) провер\w+ (по )?(мудрости|ловкости|харизмы|интеллекта|силы)']),
    ('spell', [r'вам известен заговор', r'(наложить|сотворить|накладывать) заклинани', r'сотворить заклинания']),
    ('resistance', [r'сопротивлени\w* (к )?урон', r'получаете сопротивление']),
    ('save', [r'преимуществ\w+ (в|на|при) спасброск', r'спасброск\w+ от', r'невозможно магически усыпить']),
    ('vision', [r'т[её]мное зрение']),
    ('movement', [r'^ваша скорост\w+ (на плаву|плавания|пол[её]та|лазания|передвижения)', r'^вы можете дышать', r'перемещаться по труднопроходимой', r'переместитесь|перемещение со своей полной скоростью']),
    ('sense', [r'помех\w+ .{0,40}внимательност', r'подражать звукам']),
]

def kind_of(name, text=''):
    n = name.lower()
    for kind, keys in KIND_RULES:
        if any(re.search(k, n) if '\\' in k else k in n for k in keys):
            return kind, 'keyword'
    t = re.sub(r'\s+', ' ', text.lower())[:160]
    for kind, pats in TEXT_RULES:
        if any(re.search(p, t) for p in pats):
            return kind, 'text'
    return 'other', 'keyword'

def trait(cell, where):
    name, text = split_trait(cell)
    kind, how = kind_of(name, text)
    return {'id': slug(name), 'name': name, 'kind': kind, 'kindSource': how, 'text': text, 'cell': where}

def asi_of(row, first_col):
    """Шесть числовых колонок: 1.0 / 2.0 / «-». Пусто во всех шести → None."""
    vals = [row[first_col + i] for i in range(6)]
    if all(is_empty(v) for v in vals):
        return None
    out = {}
    for ab, v in zip(ABILITIES, vals):
        if is_empty(v):
            continue
        try:
            n = int(float(str(v).replace(',', '.')))
        except ValueError:
            note(f'ASI не число: {v!r}')
            continue
        if n:
            out[ab] = n
    return out

RACE_SOURCE_FRAGMENTS = {
    155: ({'B': 'Люди Метка Поиска'}, [(28, 'subrace', 'Человек / Поиска')]),
    156: ({'B': 'Свирфнеблин', 'C': 'кентавр', 'D': 'кованый', 'F': 'багбир'}, [
        (64, 'subrace', 'Гном / Свирфнеблин (Глубинные)'), (154, 'race', 'Кентавр'),
        (147, 'race', 'Кованый'), (118, 'subrace', 'Гоблиноиды / Багбир'),
    ]),
    157: ({'B': 'дроу'}, [(37, 'subrace', 'Эльф / Тёмный эльф')]),
    158: ({'B': 'Дуэргары'}, [(55, 'subrace', 'Дварф / Дуэргары')]),
}

def resolve_race_source_fragment(row, values, races):
    """Связывает четыре именованных фрагмента листа с полными строками этого же источника по сверенным адресам."""
    spec = RACE_SOURCE_FRAGMENTS.get(row)
    if not spec:
        return False
    expected_cells, targets = spec
    actual_cells = {
        openpyxl.utils.get_column_letter(j + 1): clean(values[j])
        for j in range(1, 37) if not is_empty(values[j])
    }
    if actual_cells != expected_cells:
        return False
    imported_rows = {(race['row'], 'race') for race in races}
    imported_rows |= {(sub['row'], 'subrace') for race in races for sub in race['subraces']}
    if any((target_row, kind) not in imported_rows for target_row, kind, _ in targets):
        return False
    record_resolution(f"расы: строка {row} — фрагмент связан с " + ', '.join(f'{label} (строка {target_row})' for target_row, _, label in targets))
    return True

# ----------------------------------------------------------------- расы
def import_races():
    wb = openpyxl.load_workbook(RACES_XLSX, data_only=True)
    ws = wb['Полностью']
    rows = list(ws.iter_rows(values_only=True))
    # заливка фасетных колонок B–K: серая = отмечено (заполнено лишь у нескольких рас)
    facet_cols = {2: 'vision', 3: 'size', 4: 'natural-armor', 5: 'save', 6: 'limbs', 7: 'resistance',
                  8: 'skill', 9: 'weapon-armor', 10: 'tool', 11: 'unarmed'}
    fills = {}
    for r in ws.iter_rows(min_row=3, max_row=ws.max_row):
        marks = [facet_cols[c.column] for c in r[1:11] if c.fill and c.fill.fill_type and c.fill.fgColor.rgb == 'FF999999']
        if marks:
            fills[r[0].row] = marks

    races, cur, cur_sub = [], None, None
    for i, r in enumerate(rows[2:], start=3):
        a = r[0]
        if not is_empty(a):
            name = clean(a)
            en = SRD_RACES.get(norm_key(name))
            cur = {'id': slug(name), 'name': en or name, 'nameRu': name, 'source': 'srd' if en else 'book',
                   'asi': asi_of(r, 23), 'traits': [], 'subraces': [], 'facetMarks': fills.get(i, []), 'row': i}
            for j in range(11, 22):
                if not is_empty(r[j]):
                    cur['traits'].append(trait(r[j], f'{ws.cell(i, j + 1).coordinate}'))
            # фасетные колонки B–K: серая заливка — отметка, текст — значение («Когти», «Хобот»)
            for j in range(1, 11):
                if not is_empty(r[j]):
                    cur['facetMarks'].append(f"{facet_cols[j + 1]}: {clean(r[j])}")
            races.append(cur)
            cur_sub = None
            race_row = True
        else:
            race_row = False
        if cur is None:
            continue
        w = r[22]
        if not is_empty(w):
            sname = clean(w)
            sen = SRD_SUBRACES.get((norm_key(cur['nameRu']), norm_key(sname)))
            cur_sub = {'id': f"{cur['id']}-{slug(sname)}", 'name': sen or sname, 'nameRu': sname,
                       'source': 'srd' if sen else ('book' if cur['source'] == 'srd' else cur['source']),
                       'asi': asi_of(r, 23) or {}, 'traits': [], 'spells': [], 'row': i}
            for j in range(29, 34):
                if not is_empty(r[j]):
                    cur_sub['traits'].append(trait(r[j], ws.cell(i, j + 1).coordinate))
            if not is_empty(r[34]) and not str(r[34]).replace('.', '').isdigit():
                cur_sub['traits'].append(trait(r[34], ws.cell(i, 35).coordinate) | {'kind': 'spell'})
            cur['subraces'].append(cur_sub)
            continue
        # строки заклинаний подрасы: уровень в AI, названия в AJ, AK
        lv = r[34]
        if cur_sub is not None and not is_empty(lv) and str(lv).replace('.0', '').isdigit():
            for j in (35, 36):
                if not is_empty(r[j]):
                    cur_sub['spells'].append({'level': int(float(lv)), 'name': clean(r[j])})
        elif not race_row and any(not is_empty(r[j]) for j in range(1, 37)):
            stray = [(ws.cell(i, j + 1).coordinate, clean(r[j])[:30]) for j in range(1, 37) if not is_empty(r[j])]
            if not resolve_race_source_fragment(i, r, races):
                note(f'расы: строка {i} не разобрана: {stray[:4]}')
    for race in races:
        if race['asi'] is None:
            del race['asi']
        if not race['subraces'] and 'asi' not in race:
            note(f'расы: у {race["nameRu"]} нет ни ASI, ни подрас')
        # Гибкие бонусы (Q11): строка «+2 к одной, 1 во всех остальных пяти» — это «+2 и +1 к одной на выбор»
        # (Изменяющийся, Кованый, Метки Эберрона); шесть единиц — человек SRD (+1 ко всем), их не трогаем.
        for rec in [race] + race['subraces']:
            flex = flexible_asi(rec.get('asi'))
            if flex:
                rec['asi'], rec['asiChoice'] = flex
        # Для открытых SRD-рас исходная таблица не заменяет числовое правило. Исправляем расхождение
        # после сохранения пользовательского листа, сверенного с SRD 5.1 (Q14).
        if race['source'] == 'srd' and race['name'] in SRD_RACE_ASI:
            race['asi'] = SRD_RACE_ASI[race['name']].copy()
        # Полуэльф SRD: «Your Charisma score increases by 2, and two other ability scores of your choice increase by 1»
        # (SRD 5.1, Half-Elf) — в таблице только +2 CHA; выбор — правило SRD, а не догадка.
        if race['source'] == 'srd' and race['name'] == 'Half-Elf':
            choice = {'count': 2, 'amount': 1, 'from': [a for a in ABILITIES if a != 'cha']}
            race['asiChoice'] = choice
            for sub in race['subraces']:
                if sub['row'] == race['row'] and sub.get('asi') == race.get('asi'):
                    sub['asiChoice'] = choice
    check_srd_races(races)
    return races

# Бонусы рас SRD 5.1 (Racial Traits: Ability Score Increase) — для сверки таблицы, не для подмены: расхождение — в отчёт.
SRD_RACE_ASI = {
    'Human': {a: 1 for a in ABILITIES}, 'Dragonborn': {'str': 2, 'cha': 1}, 'Half-Elf': {'cha': 2},
    'Half-Orc': {'str': 2, 'con': 1}, 'Tiefling': {'cha': 2, 'int': 1},
}
SRD_SUBRACE_ASI = {
    'High Elf': {'dex': 2, 'int': 1}, 'Hill Dwarf': {'con': 2, 'wis': 1}, 'Rock Gnome': {'int': 2, 'con': 1}, 'Lightfoot': {'dex': 2, 'cha': 1},
}
SRD_SUBRACE_OF = {'Elf': 'High Elf', 'Dwarf': 'Hill Dwarf', 'Gnome': 'Rock Gnome', 'Halfling': 'Lightfoot'}

def asi_text(a):
    return ', '.join(f'+{v} {k.upper()}' for k, v in (a or {}).items()) or 'нет'

def check_srd_races(races):
    for race in races:
        if race['source'] != 'srd':
            continue
        if race['name'] in SRD_RACE_ASI and race.get('asi') != SRD_RACE_ASI[race['name']]:
            note(f"расы: {race['nameRu']} — в таблице {asi_text(race.get('asi'))}, в SRD {asi_text(SRD_RACE_ASI[race['name']])} (строка {race['row']})")
        sub_en = SRD_SUBRACE_OF.get(race['name'])
        if sub_en:
            sub = next((x for x in race['subraces'] if x['name'] == sub_en), None)
            if not sub:
                note(f"расы: у {race['nameRu']} нет подрасы SRD {sub_en} — без неё бонусы расы взяты из строки «{race['subraces'][0]['nameRu'] if race['subraces'] else '—'}»")
            elif sub['asi'] != SRD_SUBRACE_ASI[sub_en]:
                note(f"расы: {race['nameRu']} · {sub['nameRu']} — в таблице {asi_text(sub['asi'])}, в SRD {asi_text(SRD_SUBRACE_ASI[sub_en])}")

def flexible_asi(asi):
    if not asi or len(asi) != 6:
        return None
    twos = [a for a, v in asi.items() if v == 2]
    ones = [a for a, v in asi.items() if v == 1]
    if len(twos) == 1 and len(ones) == 5:
        return {twos[0]: 2}, {'count': 1, 'amount': 1, 'from': ones}
    return None

# ----------------------------------------------------------------- черты
FEAT_EFFECT_COLS = {15: 'saves', 16: 'advantage', 17: 'tools', 18: 'weapons-armor', 19: 'skills', 20: 'cantrips', 21: 'spells',
                    22: 'damage', 23: 'ac', 24: 'hp', 25: 'bonus', 26: 'speed', 27: 'attack-roll', 28: 'initiative'}

def import_feats():
    wb = openpyxl.load_workbook(RACES_XLSX, data_only=True)
    ws = wb['Нерасовые черты']
    rows = list(ws.iter_rows(values_only=True))
    feats = []
    for i, r in enumerate(rows[3:], start=4):
        if is_empty(r[0]):
            continue
        name, text = split_trait(r[0])
        m = re.search(r'\s*\((Требовани[ея]:[^)]*)\)\s*$', name, flags=re.I)
        if m:
            name = name[:m.start()].strip()
            text = f'{m.group(1).strip()}\n\n{text}'.strip()
        feat_key = slug(name)
        hb = '(hb)' in name.lower() or feat_key in HB_FEAT_SOURCE_REFS
        base = title_case(re.sub(r'\s*\(HB\)', '', name, flags=re.I))
        en = SRD_FEATS.get(norm_key(base))
        req = {ab: True for ab, j in zip(ABILITIES, range(1, 7)) if not is_empty(r[j])}
        effects = {FEAT_EFFECT_COLS[j + 1]: clean(r[j]) for j in range(14, 28) if j < len(r) and not is_empty(r[j])}
        if en == 'Grappler':
            # SRD 5.1 Grappler: преимущество к атакам по захваченному существу; концентрационные saves — чужая черта.
            effects.pop('saves', None)
            effects['advantage'] = '• Вы совершаете с преимуществом броски атаки по существу, захваченному вами.'
        feat = {
            'id': slug(name), 'name': en or base, 'nameRu': base, 'source': 'hb' if hb else ('srd' if en else 'book'),
            'prerequisites': {'abilities': sorted(req), 'spellcasting': not is_empty(r[7])},
            'asi': [ab for ab, j in zip(ABILITIES, range(8, 14)) if not is_empty(r[j])],
            'effects': effects,
            'text': text, 'row': i,
        }
        if feat_key in HB_FEAT_SOURCE_REFS:
            feat['sourceRef'] = HB_FEAT_SOURCE_REFS[feat_key]
        if hb:
            feat['id'] += '-hb'
        duplicate = next((f for f in feats if f['id'] == feat['id']), None)
        if duplicate and feat['id'] in DEDUPLICATED_FEATS and duplicate['source'] == feat['source']:
            # В таблице эти две записи повторены; второй вариант не становится отдельной чертой.
            continue
        if duplicate and {k: v for k, v in duplicate.items() if k != 'row'} == {k: v for k, v in feat.items() if k != 'row'}:
            continue
        if duplicate:
            note(f'черты: «{base}» встречается в таблице дважды (строка {i}) — второй экземпляр получил id с -2')
            feat['id'] += '-2'
        parse_requirement(feat)
        feats.append(feat)
    return feats

ABILITY_WORDS = {'сила': 'str', 'силы': 'str', 'ловкость': 'dex', 'ловкости': 'dex', 'телосложение': 'con', 'интеллект': 'int', 'мудрость': 'wis', 'харизма': 'cha'}

def parse_requirement(feat):
    """«Требование: …» из текста черты → поля prerequisites: уровень, порог характеристики, владение доспехами или
    оружием, заклинание или заговор. Что не разобралось — остаётся текстом в prerequisites.text и в отчёте."""
    m = re.match(r'Требовани[ея]:\s*([^\n]*)', feat['text'])
    if not m:
        return
    req = m.group(1).strip().rstrip('.')
    pre = feat['prerequisites']
    pre['text'] = req
    low = req.lower()
    lvl = re.search(r'(\d+)\s*уров', low)
    if lvl:
        pre['level'] = int(lvl.group(1))
    scores = re.findall(r'(сила|силы|ловкость|ловкости|телосложение|интеллект|мудрость|харизма)\s+(\d+)', low)
    if scores:
        pre['minScore'] = {ABILITY_WORDS[w]: int(n) for w, n in scores}
    arm = re.search(r'владение\s+(л[её]гкими|средними|тяж[её]лыми)\s+доспехами', low)
    if arm:
        pre['armor'] = {'л': 'light', 'с': 'medium', 'т': 'heavy'}[arm.group(1)[0]]
    if 'воинским оружием' in low:
        pre['weapons'] = 'martial'
    if 'заговор' in low:
        pre['cantrip'] = True
    elif 'заклинани' in low:
        pre['spellcasting'] = True
    if not any(k in pre for k in ('level', 'minScore', 'armor', 'weapons', 'cantrip')) and 'заклинани' not in low:
        if feat.get('sourceRef'):
            record_resolution(f"черты: «{feat['nameRu']}» — книжное условие сохранено текстом; отмечено HB в {feat['sourceRef']}")
        else:
            note(f"черты: «{feat['nameRu']}» — требование «{req}» оставлено текстом")

# ----------------------------------------------------------------- классы
def import_classes():
    wb = openpyxl.load_workbook(CLASSES_XLSX, data_only=True)
    classes = {}
    # 1. навыки и владения: колонки — классы
    ws = wb['Навыки и владения']
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    col_of = {}
    for j, v in enumerate(header):
        if is_empty(v):
            continue
        key = clean(v).lower().rstrip('.')
        key = {'изобр': 'изобретатель'}.get(key, key)
        if key in CLASS_NAMES_RU:
            col_of[key] = j
    for key, j in col_of.items():
        en = SRD_CLASSES.get(key)
        classes[key] = {'id': slug(key), 'name': en or CLASS_NAMES_RU[key], 'nameRu': CLASS_NAMES_RU[key],
                        'source': 'srd' if en else 'book', 'proficiencies': {}, 'levels': [], 'subclasses': []}
    labels = {'унив-ть класса': 'asiRule', 'навыки': 'skills', 'доспехи': 'armor', 'оружие': 'weapons', 'инструменты': 'tools', 'стартовое снаряжение': 'equipment'}
    for row_number, r in enumerate(rows[1:], start=2):
        lab = None
        for j in (0, 1):
            if not is_empty(r[j]):
                lab = labels.get(clean(r[j]).lower())
        if not lab:
            continue
        for key, j in col_of.items():
            if not is_empty(r[j]):
                classes[key]['proficiencies'][lab] = clean(r[j])
                if lab == 'equipment' and key == 'изобретатель':
                    plan = artificer_starting_equipment_plan(
                        clean(r[j]), ws.title, f"{openpyxl.utils.get_column_letter(j + 1)}{row_number}"
                    )
                    if plan:
                        classes[key]['startingEquipmentPlan'] = plan
                    else:
                        note('классы: не удалось безопасно разобрать варианты стартового снаряжения Изобретателя; сохранена исходная строка')
    # 2. сводка: бонус мастерства по уровням
    ws = wb['Сводка']
    prof = {}
    for r in ws.iter_rows(values_only=True):
        if not is_empty(r[5]) and str(r[5]).replace('.0', '').isdigit() and not is_empty(r[6]):
            prof[int(float(r[5]))] = int(float(r[6]))
    # 3. листы классов
    for sheet, key in CLASS_SHEETS.items():
        ws = wb[sheet]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        merged = {}
        for rg in ws.merged_cells.ranges:
            if rg.min_row <= 2:
                merged[(rg.min_row, rg.min_col)] = rg.max_col
        # колонка уровней — та, где стоят числа 1..20 подряд
        best, level_col = 0, None
        for j in range(min(12, len(rows[0]))):
            seq = [int(float(r[j])) for r in rows if j < len(r) and not is_empty(r[j]) and re.fullmatch(r'\d+(\.0)?', str(r[j]))]
            score = sum(1 for n in range(1, 21) if n in seq)
            if score > best:
                best, level_col = score, j
        if level_col is None or best < 15:
            note(f'классы: {sheet} — не нашёл колонку уровней (лучшее совпадение {best})')
            continue
        level_rows = {}
        for i, r in enumerate(rows):
            v = r[level_col] if level_col < len(r) else None
            if not is_empty(v) and re.fullmatch(r'\d+(\.0)?', str(v)):
                level_rows[int(float(v))] = i
        # подклассы: заголовки в строке 1 правее колонки уровней, кроме подписей вроде «Подклассы»
        head = rows[0]
        subs = []
        def texty(j):
            # колонка подкласса: под заголовком в строках уровней стоят тексты умений, а не числа
            cells = [rows[i][j] for i in level_rows.values() if j < len(rows[i]) and not is_empty(rows[i][j])]
            return sum(1 for c in cells if isinstance(c, str) and len(clean(c)) > 15 and not re.fullmatch(r'[-+]?\d+(\.\d+)?', clean(c)))
        for j in range(level_col + 1, len(head)):
            v = head[j]
            if is_empty(v):
                continue
            name = clean(v)
            low = name.lower()
            if low in SUBCLASS_LABELS or re.fullmatch(r'\d+(\.\d+)?', low):
                continue
            end = merged.get((1, j + 1), j + 1) - 1
            if sum(texty(k) for k in range(j, end + 1)) == 0:
                continue  # ресурс (ячейки, очки ци, урон ярости…), не подкласс
            subs.append({'name': name, 'col': j, 'end': end})
        for k, s in enumerate(subs):
            if k + 1 < len(subs):
                s['end'] = max(s['end'], subs[k + 1]['col'] - 1)
        first_sub_col = subs[0]['col'] if subs else len(head)
        # ресурсы: заголовки между колонкой уровней и первым подклассом (строки 1–2)
        res_cols = {}
        for j in range(level_col + 1, first_sub_col):
            h = next((tidy_num(rows[t][j]) for t in (0, 1) if j < len(rows[t]) and not is_empty(rows[t][j])), None)
            if h:
                res_cols[j] = h
        cls = classes[key]
        srd_key = SRD_SUBCLASSES.get(key)
        for s in subs:
            s_en = 'srd' if srd_key and norm_key(s['name']) == srd_key else 'book'
            cls['subclasses'].append({'id': f"{cls['id']}-{slug(s['name'])}", 'name': title_case(s['name']), 'source': s_en, 'gainedAt': None, 'features': []})
        for lv in range(1, 21):
            i = level_rows.get(lv)
            if i is None:
                note(f'классы: {sheet} — нет строки уровня {lv}')
                continue
            r = rows[i]
            entry = {'level': lv, 'proficiencyBonus': prof.get(lv), 'features': [], 'resources': {}}
            for j in range(0, level_col):
                v = r[j] if j < len(r) else None
                if is_empty(v) or clean(v).lower() in ('х', 'x'):
                    continue
                name, text = split_trait(v)
                entry['features'].append({'id': slug(name), 'name': name, 'text': text})
            for j in range(level_col + 1, first_sub_col):
                v = r[j] if j < len(r) else None
                if is_empty(v):
                    continue
                is_num = re.fullmatch(r'[-+]?\d+(\.\d+)?[a-zа-я+]*', clean(v).lower()) is not None
                if j in res_cols and (is_num or len(clean(v)) <= 24):
                    entry['resources'][res_cols[j]] = tidy_num(v)
                elif is_num:
                    entry['resources'][f'col{j + 1}'] = tidy_num(v)
                else:
                    name, text = split_trait(v)
                    entry['features'].append({'id': slug(name), 'name': name, 'text': text})
            for s, sub in zip(subs, cls['subclasses']):
                for j in range(s['col'], s['end'] + 1):
                    v = r[j] if j < len(r) else None
                    if is_empty(v) or clean(v).lower() in ('х', 'x'):
                        continue
                    if re.fullmatch(r'\d+(\.0)?', str(v)):
                        continue
                    name, text = split_trait(v)
                    s.setdefault('cells', []).append((lv, j, name, text, clean_text(v), ws.cell(i + 1, j + 1).coordinate))
            cls['levels'].append(entry)
        for s, sub in zip(subs, cls['subclasses']):
            if key == 'колдун' and norm_key(s['name']) == 'гений':
                s['variantLabels'] = {
                    j: clean(rows[1][j]) for j in range(s['col'] + 1, s['end'] + 1)
                    if j < len(rows[1]) and not is_empty(rows[1][j])
                }
                s['variantLabelCells'] = {
                    j: ws.cell(2, j + 1).coordinate for j in s['variantLabels']
                }
            sort_subclass_cells(key, s, sub)
        cls['sheet'] = sheet
        import_option_blocks(ws, rows, level_rows, subs, cls, key)
        cls['levelColumn'] = level_col + 1
    for key, cls in classes.items():
        mark_choice_placeholders(cls)
    for key, cls in classes.items():
        for block in cls.get('options', []):
            dest = OPTION_BLOCK_MOVES.get((key, norm_key(block['name'])))
            if dest:
                cls['options'].remove(block)
                classes[dest].setdefault('options', []).append(block)
    return list(classes.values())

def apply_srd_class_corrections(classes):
    """Небольшие корректировки строк SRD, проверенные по открытой таблице 5.1; повторные заклинания схлопываем."""
    by_name = {cls['name']: cls for cls in classes}
    bard = by_name.get('Bard')
    if bard:
        level10 = next((level for level in bard['levels'] if level['level'] == 10), None)
        if level10:
            # Таблица SRD 5.1: Bard знает 4 заговора на 10-м уровне.
            level10['resources']['0'] = '4'

    monk = by_name.get('Monk')
    if monk:
        level2 = next((level for level in monk['levels'] if level['level'] == 2), None)
        if level2:
            # Эти три действия описаны под таблицей класса в исходной книге, но являются функциями SRD 5.1.
            below_table = [
                ('terpelivaa-oborona', 'Терпеливая оборона', 'Вы тратите 1 очко ци в свой ход, чтобы совершить бонусным действием Уклонение.'),
                ('post-vetra', 'Поступь ветра', 'Вы можете потратить 1 очко ци в свой ход, чтобы совершить бонусным действием Отход или Рывок. В этот ход дальность ваших прыжков удваивается.'),
                ('shkval-udarov', 'Шквал ударов', 'Сразу после того, как вы в свой ход совершили действие Атака, вы можете потратить 1 очко ци, чтобы совершить бонусным действием две безоружные атаки.'),
            ]
            existing = {feature['id'] for feature in level2['features']}
            for id_, name, text in below_table:
                if id_ not in existing:
                    level2['features'].append({'id': id_, 'name': name, 'text': text})

    sorcerer = by_name.get('Sorcerer')
    if sorcerer:
        metamagic = next((block for block in sorcerer.get('options', []) if norm_key(block['name']) == norm_key('Метамагия')), None)
        if metamagic and not any(item.get('srdName') == 'Twinned Spell' for item in metamagic['items']):
            metamagic['items'].append({
                'id': 'udvoennoe-zaklinanie', 'name': 'Удвоенное заклинание',
                'text': 'Когда вы сотворяете заклинание, нацеленное только на одно существо и не имеющее дистанции «На себя», потратьте единицы чародейства в количестве, равном уровню заклинания (1 для заговора), чтобы выбрать второе существо в пределах дистанции. Заклинание не должно быть способно нацеливаться на несколько существ на текущем уровне ячейки.',
                'source': 'srd', 'srdName': 'Twinned Spell',
            })

    for cls in classes:
        for subclass in cls['subclasses']:
            spells = subclass.get('spells')
            if spells:
                seen = set()
                unique = []
                for spell in spells:
                    key = (spell['level'], norm_key(spell['name']), norm_key(spell.get('terrain', '')), norm_key(spell.get('variant', '')))
                    if key not in seen:
                        seen.add(key)
                        unique.append(spell)
                subclass['spells'] = unique

def add_land_circle_srd_spells(classes):
    """Круг Земли: связывает книжные колонки с местностью и дополняет 3-й уровень списком CC-BY SRD.
    Подземье остаётся отдельным книжным вариантом: в SRD CC v5.1 его нет."""
    srd = json.loads((ROOT / 'content' / 'srd' / 'spells.json').read_text())
    land = srd['subclassSpells']['land']['spells']
    spell_names = {spell['id']: spell['name'] for spell in srd['spells']}
    terrain_names = {
        'arctic': 'Тундра', 'coast': 'Побережье', 'desert': 'Пустыня', 'forest': 'Лес',
        'grassland': 'Луг', 'mountain': 'Гора', 'swamp': 'Болото', 'underdark': 'Подземье',
    }
    druid = next((cls for cls in classes if cls['name'] == 'Druid'), None)
    circle = next((sub for sub in (druid or {}).get('subclasses', []) if sub['id'] == 'druid-zemli'), None)
    if not circle:
        note('классы: Круг Земли не найден — список заклинаний SRD не добавлен')
        return
    existing = circle.setdefault('spells', [])
    for entry in land:
        if entry['classLevel'] != 3:
            continue
        spell_id = entry['id']
        if spell_id not in spell_names or entry['terrain'] not in terrain_names:
            note(f"классы: Круг Земли — неизвестное заклинание или местность SRD ({spell_id}, {entry['terrain']})")
            continue
        existing.append({
            'level': entry['classLevel'], 'name': spell_names[spell_id], 'nameEn': spell_names[spell_id],
            'srdId': spell_id, 'terrain': terrain_names[entry['terrain']], 'source': 'srd',
        })
    book_spells = sum(1 for spell in existing if spell.get('source') == 'book')
    expected = len(land) + book_spells
    if len(existing) != expected:
        note(f'классы: Круг Земли — ожидалось {expected} заклинаний с местностями, импортировано {len(existing)}')

# Классы, у подклассов которых в таблице рядом с умениями стоят списки заклинаний (домены, клятвы, покровители,
# круги, специализации изобретателя): клетка без текста не в первой колонке блока — заклинание, а не умение.
SPELL_LIST_CLASSES = {'жрец', 'паладин', 'колдун', 'изобретатель', 'друид'}
# Блоки, где эта раскладка не работает: у круга Земли — местности, у Гения — виды гениев со своими списками.
SPELL_SPLIT_SKIP = set()

def sort_subclass_cells(key, s, sub):
    """Клетки подкласса → умения, заклинания, подписи колонок.

    Подпись — клетка без текста выше первого описанного умения подкласса («Заклинания клятвы», «Ячейки заклинаний»):
    это заголовок колонки, а не умение, иначе подкласс «получается» на 1-м уровне. Заклинание — клетка без текста
    не в первой колонке блока у классов из SPELL_LIST_CLASSES; уровень — строка таблицы: у колдуна это круг
    заклинания (таблица покровителя — по кругам), у остальных — уровень класса.
    """
    cells = s.get('cells', [])
    texted = [lv for lv, _, _, text, _, _ in cells if text]
    first = min(texted) if texted else None
    labels, spells = [], []
    land_circle = key == 'друид' and norm_key(sub['name']) == 'земли'
    genie_circle = key == 'колдун' and norm_key(sub['name']) == 'гений'
    split = key in SPELL_LIST_CLASSES and (key, norm_key(sub['name'])) not in SPELL_SPLIT_SKIP
    terrain_by_column, terrain_cell_by_column = {}, {}
    for lv, j, name, text, raw, source_cell in cells:
        if genie_circle and lv == 1 and not text and j in s.get('variantLabels', {}) and norm_key(name) == norm_key(s['variantLabels'][j]):
            continue
        if land_circle and not text and j != s['col'] and lv == 3:
            terrain_by_column[j] = clean(name)
            terrain_cell_by_column[j] = source_cell
            continue
        if land_circle and not text and j != s['col'] and lv in (5, 7, 9):
            terrain_col = max((column for column in terrain_by_column if column <= j), default=None)
            if terrain_col is None:
                note(f'классы: Круг Земли — заклинание «{name}» на {lv}-м уровне без заголовка местности')
                sub['features'].append({'level': lv, 'id': slug(name), 'name': name, 'text': text})
                continue
            terrain = terrain_by_column[terrain_col]
            spells.append({'level': lv, 'name': clean(name), 'terrain': terrain,
                           'optionCell': terrain_cell_by_column[terrain_col], 'sourceCell': source_cell,
                           'source': 'book' if norm_key(terrain) == norm_key('Подземье') else 'srd'})
            continue
        if genie_circle and j != s['col'] and lv >= 2:
            variant = s.get('variantLabels', {}).get(j)
            if not variant:
                note(f'классы: Гений — заклинание «{name}» на уровне {lv} без подписи вида гения')
                sub['features'].append({'level': lv, 'id': slug(name), 'name': name, 'text': text})
                continue
            # Строки под AD2:AH2 идут по кругам 1–5; отдельное заклинание 9-го круга остаётся на строке 9.
            spell_level = lv - 1 if 2 <= lv <= 6 else lv
            spells.append({'level': spell_level, 'name': clean(raw), 'variant': variant, 'source': 'book',
                           'sourceCell': source_cell, 'optionCell': s['variantLabelCells'][j]})
            continue
        if not text and first is not None and lv < first:
            labels.append(name)
            continue
        if split and not text and j != s['col']:
            spells.append({'level': lv, 'name': clean(name), 'sourceCell': source_cell})
            continue
        sub['features'].append({'level': lv, 'id': slug(name), 'name': name, 'text': text})
    if spells:
        sub['spells'] = spells
        sub['spellLevel'] = 'spell' if key == 'колдун' else 'class'
    if labels:
        sub['labels'] = labels
    sub['gainedAt'] = min((f['level'] for f in sub['features']), default=None)

def mark_choice_placeholders(cls):
    """Умение в таблице уровней, названное одним из вариантов блока («Сражение большим оружием» у воина 1-го уровня), —
    это место выбора, а не само умение: имя становится именем блока («Боевой стиль»), вариант — в выборах персонажа."""
    for block in cls.get('options', []):
        if block.get('subclassId'):
            continue
        names = {norm_key(i['name']) for i in block['items']}
        for lvl in cls['levels']:
            for f in lvl['features']:
                if norm_key(f['name']) in names and not f['text']:
                    f['name'], f['id'], f['text'], f['choice'] = block['name'], slug(block['name']), block['text'], block['id']

# Блок «Боевой стиль» с листа друида по составу (Воин-друид, Сражение вслепую…) — стили следопыта из TCE.
OPTION_BLOCK_MOVES = {('друид', 'боевойстиль'): 'следопыт'}
# Эти три SRD-функции монаха добавляются в умения 2-го уровня после разбора таблиц.
SRD_IMPORTED_UNDER_TABLE = {('монах', 'B23'), ('монах', 'G23'), ('монах', 'J23')}
# Варианты из SRD 5.1 — по русскому имени из таблицы; остальные — книга (TCE и др.).
SRD_OPTIONS = {
    'стрельба': 'Archery', 'оборона': 'Defense', 'дуэлянт': 'Dueling', 'сражениебольшиморужием': 'Great Weapon Fighting',
    'защита': 'Protection', 'сражениедвумяоружиями': 'Two-Weapon Fighting',
    'аккуратноезаклинание': 'Careful Spell', 'далёкоезаклинание': 'Distant Spell', 'далекоезаклинание': 'Distant Spell',
    'усиленноезаклинание': 'Empowered Spell', 'продлённоезаклинание': 'Extended Spell', 'продленноезаклинание': 'Extended Spell',
    'непреодолимоезаклинание': 'Heightened Spell', 'ускоренноезаклинание': 'Quickened Spell', 'неуловимоезаклинание': 'Subtle Spell',
    'удвоенноезаклинание': 'Twinned Spell', 'двойноезаклинание': 'Twinned Spell',
    'договоргримуара': 'Pact of the Tome', 'договорцепи': 'Pact of the Chain', 'договорклинка': 'Pact of the Blade',
}

def import_option_blocks(ws, rows, level_rows, subs, cls, key):
    """Списки выбора под таблицей уровней: боевые стили, приёмы, метамагия, инфузии, руны; «Предрасположенность»
    подклассов; спутники («Спутник/ Гримуар»). Заголовок блока — клетка одна в своей строке (соседи слева и справа
    пусты), под ней есть клетка, и сама она — подпись без текста или с вводным абзацем через пустую строку; вариант —
    клетка ниже заголовка в его колонках (до следующей клетки строки заголовка). Что не легло — в отчёт."""
    start = max(level_rows.values()) + 1
    cell = lambda i, j: rows[i][j] if i < len(rows) and j < len(rows[i]) and not is_empty(rows[i][j]) else None
    sub_at = lambda j: next((sub for s, sub in zip(subs, cls['subclasses']) if s['col'] <= j <= s['end']), None)
    blocks = []  # {name, text, row, col, end, items}
    for i in range(start, len(rows)):
        row = rows[i]
        filled = [j for j in range(len(row)) if cell(i, j) is not None]
        if not filled:
            continue
        if norm_key(row[filled[0]]).startswith('предрасположенность'):
            for j in filled[1:]:
                sub = sub_at(j)
                lines = [clean(x) for x in re.split(r'\n+', str(rows[i][j])) if clean(x)]
                if sub:
                    sub.setdefault('affinity', []).extend(lines)
                else:
                    note(f'классы: {cls["sheet"]} — «Предрасположенность» в {ws.cell(i + 1, j + 1).coordinate} вне колонок подклассов')
            continue
        for j in filled:
            raw = str(rows[i][j])
            name, text = split_trait(raw)
            if norm_key(name).startswith('спутник'):
                sub = sub_at(j)
                body = clean_text(raw.split('\n', 1)[1] if '\n' in raw else '')
                comp_name, _, comp_text = body.partition('\n')
                if sub:
                    sub['companion'] = {'name': clean(comp_name), 'text': clean_text(comp_text)}
                continue
            isolated = cell(i, j - 1) is None and cell(i, j + 1) is None
            intro = re.search(r'\n\s*\n', raw.strip()) is not None
            below_affinity = i + 1 < len(rows) and any(cell(i + 1, k) is not None and norm_key(cell(i + 1, k)).startswith('предрасположенность') for k in range(len(rows[i + 1])))
            if isolated and cell(i + 1, j) is not None and not below_affinity and (not text or intro or len(text) < 30):
                nxt = next((k for k in filled if k > j), None)
                blocks = [b for b in blocks if not (b['col'] <= j <= b['end'])]
                blocks.append({'name': clean(f'{name} {text}') if text and not intro and len(text) < 30 else name,
                               'text': text if intro else '', 'col': j, 'end': (nxt - 1) if nxt else 10 ** 6, 'items': [], 'row': i})
                cls.setdefault('_blocks', []).append(blocks[-1])
                continue
            owner = next((b for b in blocks if b['col'] <= j <= b['end'] and b['row'] < i), None)
            if owner is None:
                coordinate = ws.cell(i + 1, j + 1).coordinate
                if key == 'жрец' and coordinate == 'BG25' and norm_key(name) == norm_key('Ограждение магией'):
                    sub = sub_at(j)
                    duplicate = next((f for f in (sub or {}).get('features', [])
                                      if norm_key(f['name']) == norm_key(name) and f.get('text')), None)
                    if duplicate:
                        record_resolution('классы: жрец BG25 — повтор заголовка «Ограждение магией»; полное умение уже импортировано из BG5 в домен Магии, 2-й уровень')
                        continue
                if key == 'колдун' and coordinate == 'A23':
                    # Pact Boon заголовок и варианты стоят под таблицей Warlock; Talisman остаётся book (TCE).
                    options = [line.strip() for line in raw.splitlines()[1:] if line.strip()]
                    block = {'id': slug(name), 'name': name, 'text': '', 'items': []}
                    for option in options:
                        source_name = SRD_OPTIONS.get(norm_key(option))
                        item = {'id': slug(option), 'name': option, 'text': '', 'source': 'srd' if source_name else 'book', 'cell': coordinate}
                        if source_name:
                            item['srdName'] = source_name
                        block['items'].append(item)
                    if block['items']:
                        cls.setdefault('options', []).append(block)
                    continue
                if (key, coordinate) not in SRD_IMPORTED_UNDER_TABLE:
                    note(f'классы: {cls["sheet"]} — {coordinate} «{name[:40]}» под таблицей не разобрано')
                continue
            if not text and len(name) > 60:
                name, text = name[:60].rstrip() + '…', clean_text(raw)
            m = re.search(r'\s*\((TCE|XGE|ТСЕ)\)\s*$', name, flags=re.I)
            clean_name = name[:m.start()].strip() if m else name.rstrip('. ').strip()
            srd = SRD_OPTIONS.get(norm_key(clean_name))
            item = {'id': slug(clean_name), 'name': clean_name, 'text': text, 'source': 'srd' if srd else 'book', 'cell': ws.cell(i + 1, j + 1).coordinate}
            if srd:
                item['srdName'] = srd
            owner['items'].append(item)
    out = []
    for b in cls.pop('_blocks', []):
        if not b['items']:
            note(f'классы: {cls["sheet"]} — блок «{b["name"]}» без вариантов')
            continue
        sub = sub_at(b['col'])
        block = {'id': slug(b['name']), 'name': b['name'][:1].upper() + b['name'][1:], 'text': b['text'], 'items': b['items']}
        if re.search(r'выберите\s+один\s+из\s+следующих\s+вариантов', b['text'], flags=re.I):
            block['choose'] = 1
        if sub:
            block['subclassId'] = sub['id']
        out.append(block)
    if out:
        cls['options'] = out

# ----------------------------------------------------------------- запуск
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    races = import_races()
    feats = import_feats()
    classes = import_classes()
    apply_srd_class_corrections(classes)
    add_land_circle_srd_spells(classes)
    stamp = {'importedAt': datetime.date.today().isoformat(), 'importer': 'scripts/import-compendium.py',
             'sources': {'races': RACES_XLSX.name, 'classes': CLASSES_XLSX.name},
             'license': 'srd — SRD 5.1 CC-BY-4.0; book — переводы книг WotC, только для своего стола; hb — хоумбрю'}
    json.dump({'meta': stamp, 'races': races}, open(OUT / 'races.json', 'w'), ensure_ascii=False, indent=1)
    json.dump({'meta': stamp, 'feats': feats}, open(OUT / 'feats.json', 'w'), ensure_ascii=False, indent=1)
    json.dump({'meta': stamp, 'classes': classes}, open(OUT / 'classes.json', 'w'), ensure_ascii=False, indent=1)

    subraces = sum(len(r['subraces']) for r in races)
    kinds = Counter(t['kind'] for r in races for t in r['traits'] + [t for s in r['subraces'] for t in s['traits']])
    src = Counter(r['source'] for r in races), Counter(f['source'] for f in feats)
    lines = [f"# Импорт компендиума — {stamp['importedAt']}", '',
             f"расы: {len(races)} (srd {src[0]['srd']}, book {src[0]['book']}), подрасы: {subraces}, черты рас: {sum(kinds.values())}",
             'фасеты черт по ключевым словам: ' + ', '.join(f'{k} {v}' for k, v in kinds.most_common()),
             f"черты (feats): {len(feats)} (srd {src[1]['srd']}, book {src[1]['book']}, hb {src[1]['hb']})",
             f"классы: {len(classes)}; подклассов: {sum(len(c['subclasses']) for c in classes)}; "
             f"умений по уровням: {sum(len(l['features']) for c in classes for l in c['levels'])}; умений подклассов: {sum(len(s['features']) for c in classes for s in c['subclasses'])}",
             '']
    for c in classes:
        lines.append(f"  {c['nameRu']:13s} лист «{c['sheet']}», уровни {len(c['levels'])}, умений {sum(len(l['features']) for l in c['levels'])}, "
                     f"подклассов {len(c['subclasses'])} ({sum(len(s['features']) for s in c['subclasses'])} умений), владения {len(c['proficiencies'])}")
    lines += ['', f'замечания ({len(report)}):'] + [f'- {m}' for m in report]
    if resolved:
        lines += ['', f'связанные фрагменты источника ({len(resolved)}):'] + [f'- {m}' for m in resolved]
    text = '\n'.join(lines)
    (OUT / 'report.md').write_text(text + '\n')
    print(text)

if __name__ == '__main__':
    main()
