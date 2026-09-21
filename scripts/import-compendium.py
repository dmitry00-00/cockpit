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
def note(msg): report.append(msg)

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

CLASS_SHEETS = {'Воин': 'воин', 'Варвар': 'варвар', 'плут': 'плут', 'м': 'монах', 'с': 'следопыт', 'Паладин': 'паладин',
                'ж': 'жрец', 'и': 'изобретатель', 'б': 'бард', 'к': 'колдун', 'д': 'друид', 'ч': 'чародей', 'вол': 'волшебник'}
CLASS_NAMES_RU = {'воин': 'Воин', 'варвар': 'Варвар', 'плут': 'Плут', 'монах': 'Монах', 'следопыт': 'Следопыт', 'паладин': 'Паладин',
                  'жрец': 'Жрец', 'изобретатель': 'Изобретатель', 'бард': 'Бард', 'колдун': 'Колдун', 'друид': 'Друид', 'чародей': 'Чародей', 'волшебник': 'Волшебник'}
SUBCLASS_LABELS = {'подклассы', 'пути', 'путь', 'архетипы', 'архетип', 'домены', 'домен', 'круги', 'круг', 'коллегии', 'коллегия', 'клятвы', 'клятва',
                   'традиции', 'традиция', 'покровители', 'покровитель', 'происхождения', 'происхождение', 'специализации', 'специализация', 'школы', 'школа'}

# ----------------------------------------------------------------- утилиты
def clean(s):
    return re.sub(r'\s+', ' ', str(s).replace('\xa0', ' ')).strip()

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
            note(f'расы: строка {i} не разобрана: {stray[:4]}')
    for race in races:
        if race['asi'] is None:
            del race['asi']
        if not race['subraces'] and 'asi' not in race:
            note(f'расы: у {race["nameRu"]} нет ни ASI, ни подрас')
    return races

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
        hb = '(hb)' in name.lower()
        base = title_case(re.sub(r'\s*\(HB\)', '', name, flags=re.I))
        en = SRD_FEATS.get(norm_key(base))
        req = {ab: True for ab, j in zip(ABILITIES, range(1, 7)) if not is_empty(r[j])}
        feat = {
            'id': slug(name), 'name': en or base, 'nameRu': base, 'source': 'hb' if hb else ('srd' if en else 'book'),
            'prerequisites': {'abilities': sorted(req), 'spellcasting': not is_empty(r[7])},
            'asi': [ab for ab, j in zip(ABILITIES, range(8, 14)) if not is_empty(r[j])],
            'effects': {FEAT_EFFECT_COLS[j + 1]: clean(r[j]) for j in range(14, 28) if j < len(r) and not is_empty(r[j])},
            'text': text, 'row': i,
        }
        if hb:
            feat['id'] += '-hb'
        seen = {f['id'] for f in feats}
        if feat['id'] in seen:
            note(f'черты: «{base}» встречается в таблице дважды (строка {i}) — второй экземпляр получил id с -2')
            feat['id'] += '-2'
        feats.append(feat)
    return feats

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
    for r in rows[1:]:
        lab = None
        for j in (0, 1):
            if not is_empty(r[j]):
                lab = labels.get(clean(r[j]).lower())
        if not lab:
            continue
        for key, j in col_of.items():
            if not is_empty(r[j]):
                classes[key]['proficiencies'][lab] = clean(r[j])
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
                    sub['features'].append({'level': lv, 'id': slug(name), 'name': name, 'text': text})
                    if sub['gainedAt'] is None:
                        sub['gainedAt'] = lv
            cls['levels'].append(entry)
        cls['sheet'] = sheet
        cls['levelColumn'] = level_col + 1
    return list(classes.values())

# ----------------------------------------------------------------- запуск
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    races = import_races()
    feats = import_feats()
    classes = import_classes()
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
    text = '\n'.join(lines)
    (OUT / 'report.md').write_text(text + '\n')
    print(text)

if __name__ == '__main__':
    main()
