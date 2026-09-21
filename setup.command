#!/bin/zsh
# Ставит и преднастраивает DM Cockpit на этом Mac. Ничего системного не трогает: всё — внутри пакета
# (.tools/node — свой Node.js, если в системе нет ≥ 20; node_modules; dist; *.generated.*).
#   setup.command            Node.js → пакеты по package-lock (npm ci) → тема, иконки, dist/ → проверка, что стол отдаётся по http
#   setup.command --test     то же плюс полный прогон npm test (около минуты)
#   setup.command --update   сначала подтянуть свежий код из репозитория (git pull или архив с GitHub)
#   start.command            играть: доустановить, что изменилось, и открыть http://localhost:5180 в браузере
#     --lan                  отдать стол и в локальную сеть — планшет мастера (F9) или экран игроков на другом устройстве
#     --dev                  сервер разработки с горячей заменой вместо собранного dist/
# Запуск: двойной клик в Finder или `zsh setup.command`. Повторный запуск безопасен. Запущенный не из пакета
# (скопирован на рабочий стол или `curl -fsSL https://raw.githubusercontent.com/dmitry00-00/cockpit/main/setup.command | zsh`)
# сам берёт пакет из репозитория в ~/cockpit (или $COCKPIT_DIR) и продолжает там.
# Node.js закреплён: версия и суммы архивов — ниже; сменить — взять из https://nodejs.org/dist/vX.Y.Z/SHASUMS256.txt
# и в setup.ps1 (версия для Windows) тоже — scripts/setup.test.mjs сверяет обе.
set -u

NODE_VERSION=22.23.0
NODE_MIN_MAJOR=20
typeset -A NODE_SHA256=(
  darwin-arm64 e0f383a215dd3093de6d2c74f87056dc2306a2e09ad494cbffdba28f89046f56
  darwin-x64   dc2ccab261fd70c347e4cc52085d8d226f471ccba1fc2a7252283949b31ca9f9
)
REPO=https://github.com/dmitry00-00/cockpit
PORT=5180
SMOKE_PORT=5181
TOOLS=.tools
VITE=node_modules/vite/bin/vite.js

MODE=setup; LAN=0; DEV=0; TEST=0; UPDATE=0
for a in "$@"; do
  case "$a" in
    --start) MODE=start ;;
    --lan) LAN=1 ;;
    --dev) DEV=1 ;;
    --test) TEST=1 ;;
    --update) UPDATE=1 ;;
    *) echo "неизвестный флаг: $a (есть --start, --lan, --dev, --test, --update)" >&2; exit 2 ;;
  esac
done

pause() { if [[ -t 0 ]]; then echo; echo "Enter — закрыть окно"; read -r _; fi; return 0; }
fail() { echo "✗ $1" >&2; pause; exit "${2:-1}"; }
step() { echo; echo "— $1"; }
in_package() { [[ -f "$1/package.json" ]] && grep -q '"name": "dm-cockpit"' "$1/package.json"; }
# git годится, только если он настоящий: без Command Line Tools /usr/bin/git — заглушка, что зовёт установщик.
git_ok() { command -v git >/dev/null 2>&1 && xcode-select -p >/dev/null 2>&1; }
# Архив ветки main с GitHub → каталог $1 (без верхней папки архива).
fetch_zip() {
  local zip; zip=$(mktemp -t cockpit-main) || fail "нет временного файла"
  curl -fsSL -o "$zip" "$REPO/archive/refs/heads/main.zip" || { rm -f "$zip"; fail "архив $REPO не скачался (нет сети?)"; }
  mkdir -p "$1"
  tar -xf "$zip" -C "$1" --strip-components 1 || { rm -f "$zip"; fail "архив не распаковался"; }
  rm -f "$zip"
}

# 0. Пакет: запущен не из него — взять из репозитория и продолжить там (нужны только curl и tar, git — если есть).
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd -P) || HERE=$PWD
if ! in_package "$HERE"; then
  DEST=${COCKPIT_DIR:-$HOME/cockpit}
  if ! in_package "$DEST"; then
    step "Пакет"
    echo "стола рядом нет — беру из $REPO в $DEST"
    if git_ok; then
      git clone --quiet "$REPO.git" "$DEST" || fail "git clone не отработал (нет сети?)"
    else
      fetch_zip "$DEST"
    fi
  fi
  in_package "$DEST" || fail "в $DEST нет пакета dm-cockpit — репозиторий пуст или изменился?"
  [[ -z "${COCKPIT_BOOTSTRAPPED:-}" ]] || fail "пакет в $DEST на месте, но setup.command в нём себя не узнаёт"
  COCKPIT_BOOTSTRAPPED=1 exec zsh "$DEST/setup.command" "$@"
fi
cd "$HERE" || exit 1

# Быстрый путь: стол уже поднят — только браузер. Второй двойной клик не плодит второй сервер.
if [[ $MODE == start ]] && curl -fs --max-time 2 "http://localhost:$PORT/" 2>/dev/null | grep -q '<title>DM Cockpit</title>'; then
  echo "стол уже работает на http://localhost:$PORT/ — открываю браузер"
  open "http://localhost:$PORT/"
  exit 0
fi

if (( UPDATE )); then
  step "Обновление"
  if [[ -d .git ]] && git_ok; then
    git pull --ff-only || fail "git pull не отработал (нет сети или локальные правки?)"
  else
    tmp=$(mktemp -d -t cockpit-update) || fail "нет временного каталога"
    fetch_zip "$tmp"
    cp -R "$tmp/." . && rm -rf "$tmp" || fail "не скопировалось обновление"
    echo "код обновлён из архива $REPO"
  fi
fi

# 1. Node.js: свой в .tools/node (если ставили), иначе первый подходящий из PATH и обычных мест, иначе — скачать.
node_major() { local v; v=$("$1" -v 2>/dev/null) || return 1; v=${v#v}; echo "${v%%.*}"; }
node_ok() { [[ -x "$1" ]] || return 1; local m; m=$(node_major "$1") || return 1; (( m >= NODE_MIN_MAJOR )); }
find_node() {
  local c
  local -a cands=("$TOOLS/node/bin/node")
  c=$(command -v node 2>/dev/null) && cands+=("$c")
  cands+=(/opt/homebrew/bin/node /usr/local/bin/node "$HOME/.local/bin/node" "$HOME/.volta/bin/node")
  for c in "$HOME"/.nvm/versions/node/*/bin/node(N); do cands+=("$c"); done
  for c in "${cands[@]}"; do node_ok "$c" && { echo "$c"; return 0; }; done
  return 1
}
# Каталог, где рядом с node лежит npm: у символической ссылки (~/.local/bin/node) npm может быть только у оригинала.
bin_of() {
  local d
  for d in "$(dirname "$1")" "$(dirname "$(readlink -f "$1")")"; do
    [[ -x "$d/npm" ]] && { (cd "$d" && pwd -P); return 0; }
  done
  return 1
}
install_node() {
  local arch
  case "$(uname -m)" in
    arm64) arch=darwin-arm64 ;;
    x86_64) arch=darwin-x64 ;;
    *) fail "неизвестная архитектура: $(uname -m)" ;;
  esac
  local name="node-v$NODE_VERSION-$arch.tar.gz"
  local url="https://nodejs.org/dist/v$NODE_VERSION/$name" tmp="$TOOLS/$name"
  mkdir -p "$TOOLS"
  echo "в системе нет Node.js ≥ $NODE_MIN_MAJOR — скачиваю v$NODE_VERSION в $TOOLS/node: $url"
  curl -fL --progress-bar -o "$tmp" "$url" || { rm -f "$tmp"; fail "Node.js не скачался (нет сети?)"; }
  local sum; sum=$(shasum -a 256 "$tmp" | cut -d' ' -f1)
  [[ "$sum" == "${NODE_SHA256[$arch]}" ]] || { rm -f "$tmp"; fail "сумма архива Node.js не сошлась — файл битый или подменён; ничего не установлено"; }
  rm -rf "$TOOLS/node"; mkdir -p "$TOOLS/node"
  tar -xzf "$tmp" -C "$TOOLS/node" --strip-components 1 || { rm -rf "$TOOLS/node" "$tmp"; fail "архив Node.js не распаковался"; }
  rm -f "$tmp"
}

step "Node.js"
NODE=$(find_node) || { install_node; NODE="$TOOLS/node/bin/node"; }
NODE_BIN=$(bin_of "$NODE") || fail "рядом с $NODE нет npm"
export PATH="$NODE_BIN:$PATH"
hash -r
echo "node $(node -v) · npm $(npm -v) · $NODE_BIN"

# 2. Пакеты ровно по package-lock. Повторно — только если lock сменился или node_modules пропал.
step "Пакеты"
LOCK_SUM=$(shasum -a 256 package-lock.json | cut -d' ' -f1)
if [[ -d node_modules && -f "$TOOLS/lock.sha256" && "$(<"$TOOLS/lock.sha256")" == "$LOCK_SUM" ]]; then
  echo "node_modules по текущему package-lock — пропускаю"
else
  npm ci --no-audit --no-fund || fail "npm ci не отработал (нет сети?)"
  mkdir -p "$TOOLS"; print -r -- "$LOCK_SUM" > "$TOOLS/lock.sha256"
fi

# 3. Сборка: тема и иконки из design/, проверка типов, dist/. Установка собирает всегда; старт — если dist старее исходников.
stale() {
  [[ -f dist/index.html ]] || return 0
  [[ -n "$(find src content design public index.html vite.config.ts package.json tsconfig.json tsconfig.app.json tsconfig.node.json -type f -newer dist/index.html -print -quit 2>/dev/null)" ]]
}
if (( DEV )); then
  : # сервер разработки соберёт тему и иконки сам, dist/ ему не нужен
elif [[ $MODE == setup ]] || stale; then
  step "Сборка"
  npm run build || fail "сборка не прошла"
fi

if [[ $MODE == start ]]; then
  local -a host=(); (( LAN )) && host=(--host)
  echo
  echo "Стол работает, пока открыто это окно. Закрыть окно или Ctrl+C — остановить."
  if (( DEV )); then exec npm run dev -- --open "${host[@]}"; fi
  exec node "$VITE" preview --port "$PORT" --strictPort --open "${host[@]}"
fi

# 4. Проверка: поднять собранный стол на запасном порту и убедиться, что он отдаёт страницу.
step "Проверка"
mkdir -p "$TOOLS"
node "$VITE" preview --port "$SMOKE_PORT" --strictPort >"$TOOLS/preview.log" 2>&1 &
SRV=$!
ok=0
for i in {1..40}; do
  if body=$(curl -fs --max-time 1 "http://localhost:$SMOKE_PORT/" 2>/dev/null) && [[ $body == *'<div id="root"'* ]]; then ok=1; break; fi
  kill -0 "$SRV" 2>/dev/null || break
  sleep 0.25
done
kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null
(( ok )) || { cat "$TOOLS/preview.log" >&2; fail "стол не ответил на http://localhost:$SMOKE_PORT/ (порт занят? см. выше)"; }
echo "стол отдаётся по http — ок"

if (( TEST )); then
  step "Тесты"
  npm test || fail "тесты не прошли"
fi

cat <<EOF

✓ Готово: Node.js, пакеты, сборка и проверка. Стол готов к игре — $HERE

  start.command              открыть стол: http://localhost:$PORT — работает, пока открыто окно Terminal
  zsh start.command --lan    то же плюс доступ из локальной сети (планшет, второй экран); адрес покажет сервер
  zsh setup.command --update подтянуть свежий код из $REPO
  zsh setup.command --test   полный прогон тестов (npm test)

  За столом: «Игроки» в полосе часов (или P) — вид без секретов для второго экрана;
  «Сохранить» в панели «Действия» кладёт журнал сессии в Загрузки, «Открыть…» поднимает его на любом компьютере.
EOF
pause
exit 0
