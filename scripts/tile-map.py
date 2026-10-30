# Пирамида тайлов карты мира из большого растра (HANDOFF §10, §15): исходник в бандл не идёт никогда,
# стол берёт с диска квадраты 256×256 того уровня приближения, который сейчас на экране.
#
# Запуск: .venv/bin/python scripts/tile-map.py content/maps/toril.json [--force] [--optional]
#   Паспорт карты (content/maps/<id>.json) называет исходник, размер и куда класть тайлы. Пишется
#   maps/tiles/<id>/<z>/<x>_<y>.webp; z = maxZoom — полный размер исходника, каждый уровень ниже вдвое меньше.
#   Краевые тайлы не дополняются: их размер — остаток уровня, его знает и стол (src/map/projection.ts).
#   --optional — для установки (setup.command / setup.ps1): нет исходника или GDAL — сказать и выйти с 0, стол
#   работает и без карты.
#
# Читает исходник через gdal_translate полосами по одному ряду тайлов: полосовой TIFF на 817 МБ так не
# поднимается в память целиком (у Toril это 1,2 ГБ RGB). GDAL ищется в PATH, затем в Postgres.app.
# Небольшие растры (планы городов, M10: WebP, PNG, JPEG — GDAL Postgres.app WebP не читает) режутся через Pillow в памяти.
# Требуется Pillow с WebP: `zsh setup-python.command` ставит его в ./.venv.
import json, math, os, shutil, subprocess, sys, tempfile
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GDAL_DIRS = ['/Applications/Postgres.app/Contents/Versions/latest/bin', '/opt/homebrew/bin', '/usr/local/bin']


OPTIONAL = '--optional' in sys.argv
# Форматы, которые читаются целиком через Pillow: растр в память помещается, GDAL не нужен.
SMALL_FORMATS = ('.webp', '.png', '.jpg', '.jpeg')


def die(msg):
    if OPTIONAL:
        print('tile-map: ' + msg + ' — карта без тайлов, стол работает и так')
        sys.exit(0)
    sys.exit('tile-map: ' + msg)


def gdal_translate():
    found = shutil.which('gdal_translate')
    if found:
        return found
    for d in GDAL_DIRS:
        p = os.path.join(d, 'gdal_translate')
        if os.access(p, os.X_OK):
            return p
    die('нет gdal_translate: поставьте GDAL (brew install gdal) или Postgres.app')


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    if len(args) != 1:
        sys.exit('tile-map: укажите паспорт карты: scripts/tile-map.py content/maps/toril.json [--force] [--optional]')
    passport = json.load(open(args[0], encoding='utf-8'))
    src = os.path.join(ROOT, passport['source']['file'])
    if not os.path.exists(src):
        die(f'нет исходника {src}')
    w, h, size, zmax = passport['width'], passport['height'], passport['tileSize'], passport['maxZoom']
    if math.ceil(math.log2(max(w, h) / size)) != zmax:
        die(f'maxZoom {zmax} не сходится с размером {w}×{h} и тайлом {size}')
    out = os.path.join(ROOT, passport['tiles'].lstrip('/'))
    done = os.path.join(out, 'done.json')
    if os.path.exists(done) and '--force' not in argv:
        print(f'тайлы уже нарезаны: {out} (--force — заново)')
        return
    small = os.path.splitext(src)[1].lower() in SMALL_FORMATS
    if small:
        whole = Image.open(src).convert('RGB')
        if whole.size != (w, h):
            die(f'исходник {whole.size[0]}×{whole.size[1]}, а в паспорте {w}×{h}')
    gt = None if small else gdal_translate()
    quality = passport.get('quality', 82)
    count = 0
    with tempfile.TemporaryDirectory(prefix='tile-map-') as tmp:
        strip_path = os.path.join(tmp, 'strip.tif')
        for z in range(zmax, -1, -1):
            k = 2 ** (zmax - z)  # пикселей исходника в пикселе уровня
            wz, hz = math.ceil(w / k), math.ceil(h / k)
            cols, rows = math.ceil(wz / size), math.ceil(hz / size)
            os.makedirs(os.path.join(out, str(z)), exist_ok=True)
            for y in range(rows):
                y0 = y * size * k
                sh = min(size * k, h - y0)
                oh = min(size, hz - y * size)
                if small:
                    strip = whole.crop((0, y0, w, y0 + sh)).resize((wz, oh), Image.Resampling.BOX)
                else:
                    subprocess.run([gt, '-q', '-of', 'GTiff', '-srcwin', '0', str(y0), str(w), str(sh), '-outsize', str(wz), str(oh),
                                    '-r', 'average', src, strip_path], check=True)
                    strip = Image.open(strip_path).convert('RGB')
                for x in range(cols):
                    tw = min(size, wz - x * size)
                    strip.crop((x * size, 0, x * size + tw, oh)).save(os.path.join(out, str(z), f'{x}_{y}.webp'), 'WEBP', quality=quality, method=4)
                    count += 1
            print(f'z{z}: {wz}×{hz}, {cols}×{rows} тайлов', flush=True)
    json.dump({'id': passport['id'], 'tiles': count, 'width': w, 'height': h, 'maxZoom': zmax}, open(done, 'w'), ensure_ascii=False)
    print(f'готово: {count} тайлов в {out}')


if __name__ == '__main__':
    main(sys.argv[1:])
