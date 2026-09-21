#!/bin/zsh
# Ставит Python-зависимости пакета в отдельный venv ./.venv рядом с этим файлом:
#   Pillow   — design/mask-from-map.py (маски планет)
#   openpyxl — scripts/import-compendium.py (компендиум из таблиц .xlsx)
# Запуск: двойной клик в Finder или `zsh setup-python.command`. Повторный запуск безопасен.
# Ничего системного не трогает: только каталог .venv внутри пакета.
set -u
cd "$(dirname "$0")" || exit 1

fail() { echo "✗ $1" >&2; pause; exit "${2:-1}"; }
pause() { if [[ -t 0 ]]; then echo; echo "Enter — закрыть окно"; read -r _; fi; return 0; }

# 1. Интерпретатор: первый python3 в PATH не младше 3.9 (Pillow 10+ ниже не собирается).
PY=""
for cand in python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3 /opt/homebrew/bin/python3 /usr/bin/python3; do
  command -v "$cand" >/dev/null 2>&1 || continue
  if "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then PY="$cand"; break; fi
done
[[ -n "$PY" ]] || fail "не нашёл python3 ≥ 3.9. Поставь с python.org или через Homebrew и запусти снова."
echo "python: $($PY -c 'import sys; print(sys.executable, sys.version.split()[0])')"

# 2. venv: создаём один раз, дальше только доустанавливаем.
if [[ ! -x .venv/bin/python ]]; then
  "$PY" -m venv .venv || fail "python3 -m venv .venv не отработал (нет модуля venv?)"
  echo "создан .venv"
else
  echo ".venv уже есть — обновляю пакеты"
fi

# 3. Pillow. pip обновляем тихо, чтобы не тянуть предупреждения в лог.
.venv/bin/python -m pip install --quiet --upgrade pip || fail "не обновился pip"
.venv/bin/python -m pip install --quiet --upgrade 'pillow>=10' 'openpyxl>=3.1' || fail "не установились Pillow и openpyxl (нет сети?)"

# 4. Проверка: импорт и поддержка WebP — без неё не откроется maps/ASOIAF/i.webp.
.venv/bin/python - <<'PYEOF' || fail "пакеты поставились, но не импортируются"
import PIL, openpyxl
from PIL import Image, features
print(f"Pillow {PIL.__version__}", "· webp: " + ("да" if features.check("webp") else "НЕТ — i.webp не откроется, пересобери колесо или конвертируй в png"), f"· openpyxl {openpyxl.__version__}")
PYEOF

cat <<EOF

✓ Готово. Из корня пакета:

  .venv/bin/python design/mask-from-map.py карта.jpg 160 80        # маска планеты (точные команды — в source.commands масок)
  .venv/bin/python scripts/import-compendium.py                     # компендиум из двух .xlsx → content/compendium/
EOF
pause
exit 0
