# Маска ландшафта из растровой карты мира.
# Вход: равнопромежуточная карта (любой размер). Выход: сетка W×H с одним символом на клетку
# и её RLE. Классы: o океан, i лёд, u неисследованная суша, d пустыня/степь, g луг, f лес, m горы.
#
# Запуск: python3 mask-from-map.py карта.jpg [ширина] [высота] [ключи]
#   --extent LON0 LON1 LAT_TOP LAT_BOT   карта покрывает не всю планету, а этот прямоугольник в градусах
#                                       (долгота 0…360 слева направо, широта +90…−90 сверху вниз).
#                                       Без ключа карта считается полной развёрткой 0…360 × +90…−90.
#   --base ФАЙЛ.json | ocean[:ШИРОТА]     чем заполнять клетки вне экстента: готовой маской того же
#                                       формата или океаном со льдом от ±ШИРОТА (по умолчанию ocean:78).
#   --palette biome|parchment|schematic  стиль исходника: биомные цвета атласа (по умолчанию),
#                                       пергамент с тёмным морем (даёт только океан / лёд / суша),
#                                       схема «синее море / бирюзовый лёд / любая суша = не нанесено».
#   --blank X0 Y0 X1 Y1                  прямоугольник исходника в пикселях, который считается океаном:
#                                       картуш, легенда, роза ветров. Ключ можно повторять.
#   --json ФАЙЛ.json --id ID --label ИМЯ [--note ТЕКСТ]
#                                       записать результат в формате design/masks/*.json
#                                       (regions остаются пустыми — их заполняют руками).
# Без --json пишутся mask.txt (сетка для глаза) и mask.rle (строка для bundle.js), как раньше.
#
# Требуется Pillow: `zsh setup-python.command` в корне пакета ставит его в ./.venv, дальше
#   .venv/bin/python design/mask-from-map.py …
import sys, json, colorsys, datetime
from collections import Counter
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # исходники бывают на сотни мегапикселей; лимит «бомбы» нам мешает


def die(msg):
    sys.exit('mask-from-map: ' + msg)


def take(argv, i, n, key, conv):
    vals = argv[i + 1:i + 1 + n]
    if len(vals) < n:
        die(f'{key} ждёт {n} чисел, получил {len(vals)}')
    try:
        return tuple(conv(v) for v in vals)
    except ValueError:
        die(f'{key}: не число среди {vals}')


def parse_args(argv):
    pos, opts, i = [], {'base': None, 'palette': 'biome', 'blank': []}, 0
    while i < len(argv):
        a = argv[i]
        if a == '--extent':
            opts['extent'] = take(argv, i, 4, a, float); i += 5
        elif a == '--blank':
            opts['blank'].append(take(argv, i, 4, a, int)); i += 5
        elif a in ('--base', '--palette', '--json', '--id', '--label', '--note'):
            if i + 1 >= len(argv):
                die(f'{a} без значения')
            opts[a[2:]] = argv[i + 1]; i += 2
        elif a.startswith('--'):
            die(f'неизвестный ключ {a}')
        else:
            pos.append(a); i += 1
    if not pos:
        die('нужен путь к карте: python3 mask-from-map.py карта.jpg [ширина] [высота] [ключи]')
    if len(pos) > 3:
        die(f'лишние аргументы: {pos[3:]}')
    opts['src'] = pos[0]
    try:
        opts['W'] = int(pos[1]) if len(pos) > 1 else 160
        opts['H'] = int(pos[2]) if len(pos) > 2 else 80
    except ValueError:
        die(f'ширина и высота — целые, получил {pos[1:]}')
    if opts['W'] <= 0 or opts['H'] <= 0:
        die('ширина и высота должны быть больше нуля')
    if opts['palette'] not in PALETTES:
        die(f"палитра {opts['palette']!r}; есть {', '.join(PALETTES)}")
    if opts['base'] is not None and 'extent' not in opts:
        die('--base имеет смысл только вместе с --extent: без экстента вся сетка берётся из карты')
    if 'extent' in opts:
        lon0, lon1, lat_t, lat_b = opts['extent']
        if not (0 <= lon0 < lon1 <= 360 and 90 >= lat_t > lat_b >= -90):
            die('экстент: LON0<LON1 в 0…360, LAT_TOP>LAT_BOT в +90…−90; через шов 360→0 карту задать нельзя — режь на две')
        if opts['base'] is None:
            opts['base'] = 'ocean:78'
        elif opts['base'].startswith('ocean'):
            try:
                float(opts['base'].split(':')[1]) if ':' in opts['base'] else None
            except ValueError:
                die(f"--base {opts['base']}: после двоеточия — широта льда числом")
    return opts


# ---------------------------------------------------------------- палитры

def classify_biome(p):
    """Атлас с биомными цветами: синий океан, зелень, песок, серые горы."""
    r, g, b = p
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    # океан: насыщенный синий
    if b > r + 45 and b > 120 and 0.52 < h < 0.72:
        return 'o'
    # лёд и снег: очень светлое и малонасыщенное
    if v > 0.86 and s < 0.14:
        return 'i'
    # неисследованная суша: ровный серый
    if s < 0.08 and 0.52 < v < 0.84:
        return 'u'
    if s < 0.12:
        return 'm' if v < 0.52 else 'u'
    # зелень
    if 0.16 < h < 0.42:
        if v < 0.46:
            return 'f'
        if s > 0.30 and v < 0.66:
            return 'f'
        return 'g'
    # тёплое: песок, степь, камень
    if h <= 0.16 or h > 0.9:
        return 'd' if v > 0.62 else 'm'
    return 'g'


def classify_parchment(p):
    """Пергаментная карта: тёмное сине-чёрное море, светлая бумага — суша, Земли Вечной Зимы — снег.
    Ни биомов, ни рельефа пергамент не отдаёт: штриховка гор и джунглей при сжатии до клетки сливается
    с затенённой бумагой (замер 18.09.2026 на «El Mundo Conocido»: Костяные горы → g, джунгли → m),
    поэтому вся суша — g."""
    r, g, b = p
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    # снег: бесцветное и светлое; бумага всегда заметно желтее (s от 0.3)
    if s < 0.2 and v > 0.55:
        return 'i'
    # море: тёмное и холодное или тёмное и бесцветное; тёмная тёплая штриховка — всё ещё суша
    if v < 0.45 and (s < 0.15 or 0.45 < h < 0.78):
        return 'o'
    return 'g'


def classify_schematic(p):
    """Схема без биомов: синее и насыщенно-бирюзовое море (полярное кольцо), бледно-бирюзовый лёд,
    любая другая заливка — суша, которую этот исходник не описывает, поэтому она получает u."""
    r, g, b = p
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if 0.58 < h < 0.75 and s > 0.35 and b > 120:
        return 'o'
    if 0.42 < h <= 0.58 and b > 150:
        return 'o' if s > 0.5 else 'i'
    if v > 0.9 and s < 0.1:
        return 'i'
    return 'u'


PALETTES = {'biome': classify_biome, 'parchment': classify_parchment, 'schematic': classify_schematic}


# ---------------------------------------------------------------- база

def decode_rle(r):
    out, i = [], 0
    while i < len(r):
        ch, j = r[i], i + 1
        while j < len(r) and r[j].isdigit():
            j += 1
        out.append(ch * int(r[i + 1:j])); i = j
    return ''.join(out)


def base_cell_fn(spec, W, H):
    """Возвращает функцию (x, y) → класс для клеток вне экстента."""
    if spec is None or spec.startswith('ocean'):
        ice = float(spec.split(':')[1]) if spec and ':' in spec else 78.0
        def cell(x, y):
            lat = 90 - (y + 0.5) * 180 / H
            return 'i' if abs(lat) >= ice else 'o'
        return cell
    m = json.load(open(spec))
    grid = ''.join(m['grid']) if isinstance(m.get('grid'), list) else (m.get('grid') or decode_rle(m['rle']))
    bw, bh = m['w'], m['h']
    if len(grid) != bw * bh:
        die(f'{spec}: сетка {len(grid)} клеток, а w×h = {bw}×{bh} = {bw * bh}')
    def cell(x, y):
        # база может быть другой плотности — берём клетку по тем же долготе и широте
        bx = min(bw - 1, int((x + 0.5) / W * bw)); by = min(bh - 1, int((y + 0.5) / H * bh))
        return grid[by * bw + bx]
    return cell


# ---------------------------------------------------------------- сборка

def build(opts):
    W, H = opts['W'], opts['H']
    classify = PALETTES[opts['palette']]
    im = Image.open(opts['src']).convert('RGB')
    if opts['blank']:
        # картуш и роза ветров нарисованы поверх моря цветом суши — закрашиваем их морем до классификации
        from PIL import ImageDraw
        draw = ImageDraw.Draw(im)
        for x0, y0, x1, y1 in opts['blank']:
            draw.rectangle((x0, y0, x1, y1), fill=(0, 0, 40) if opts['palette'] == 'parchment' else (43, 95, 128))
    FW, FH = W * 3, H * 3  # мелкая сетка в 3 раза плотнее нужной: голосование 3×3 спасает от рек и подписей
    if 'extent' in opts:
        lon0, lon1, lat_t, lat_b = opts['extent']
        fx0, fy0 = round(lon0 / 360 * FW), round((90 - lat_t) / 180 * FH)
        fx1, fy1 = round(lon1 / 360 * FW), round((90 - lat_b) / 180 * FH)
        if fx1 <= fx0 or fy1 <= fy0:
            die(f'экстент {opts["extent"]} уже одной клетки сетки {W}×{H}: карта не дала бы ни одной клетки')
    else:
        fx0, fy0, fx1, fy1 = 0, 0, FW, FH
    fine = im.resize((fx1 - fx0, fy1 - fy0), Image.BILINEAR)
    px = fine.load()
    base = base_cell_fn(opts['base'], W, H)
    grid = []
    for y in range(H):
        row = ''
        for x in range(W):
            c = Counter()
            for dy in range(3):
                for dx in range(3):
                    fx, fy = x * 3 + dx, y * 3 + dy
                    if fx0 <= fx < fx1 and fy0 <= fy < fy1:
                        c[classify(px[fx - fx0, fy - fy0])] += 1
                    else:
                        c[base(x, y)] += 1
            # суша побеждает океан при равенстве: береговая линия важнее воды
            best = c.most_common()
            top = best[0][1]
            cand = [k for k, n in best if n == top]
            row += sorted(cand, key=lambda k: (k == 'o', k))[0]
        grid.append(row)
    return grid


def encode_rle(flat):
    # RLE: буква класса + длина десятичными цифрами. Цифры и буквы не пересекаются,
    # поэтому декодер читает длину до следующей буквы и не может сбиться.
    out, i = [], 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i]:
            j += 1
        out.append(flat[i] + str(j - i))
        i = j
    return ''.join(out)


LEGEND = {'o': 'океан', 'i': 'лёд', 'u': 'не нанесено на карту', 'd': 'пустыня и степь',
          'g': 'равнина', 'f': 'лес', 'm': 'горы'}

if __name__ == '__main__':
    opts = parse_args(sys.argv[1:])
    grid = build(opts)
    flat = ''.join(grid)
    rle = encode_rle(flat)
    stats = Counter(flat)
    print(f"сетка {opts['W']}×{opts['H']} = {len(flat)} клеток, RLE {len(rle)} символов, сжатие {len(flat)/len(rle):.1f}×")
    print('состав:', ', '.join(f'{k} {100*v/len(flat):.1f}%' for k, v in stats.most_common()))
    if opts.get('json'):
        doc = {
            'id': opts.get('id') or 'mask', 'label': opts.get('label') or opts.get('id') or 'mask',
            'note': opts.get('note', ''),
            'w': opts['W'], 'h': opts['H'], 'projection': 'equirectangular',
            'longitude': [0, 360], 'latitude': [90, -90],
            'legend': LEGEND, 'regions': [],
            'source': {
                'file': opts['src'].split('/')[-1], 'palette': opts['palette'],
                'extent': list(opts['extent']) if 'extent' in opts else [0, 360, 90, -90],
                'base': opts['base'],
                'blank': [list(b) for b in opts['blank']],
                'date': datetime.date.today().isoformat(),
            },
            'rle': rle, 'grid': grid,
        }
        json.dump(doc, open(opts['json'], 'w'), ensure_ascii=False, indent=2)
        print(f"{opts['json']} — маска в формате design/masks; regions заполнить руками")
    else:
        open('mask.txt', 'w').write('\n'.join(grid))
        open('mask.rle', 'w').write(rle)
        print('mask.txt — сетка для глаза, mask.rle — строка для bundle.js')
