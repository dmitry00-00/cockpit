# Ставит и преднастраивает DM Cockpit на этом компьютере с Windows. Ничего системного не трогает: всё — внутри
# пакета (.tools\node — свой Node.js, если в системе нет >= 20; node_modules; dist; *.generated.*).
#   setup.cmd            Node.js → пакеты по package-lock (npm ci) → тема, иконки, dist\ → проверка, что стол отдаётся по http
#   setup.cmd -Test      то же плюс полный прогон npm test (около минуты)
#   setup.cmd -Update    сначала подтянуть свежий код из репозитория (git pull или архив с GitHub)
#   start.cmd            играть: доустановить, что изменилось, и открыть http://localhost:5180 в браузере
#     -Lan               отдать стол и в локальную сеть — планшет мастера (F9) или экран игроков на другом устройстве
#     -Dev               сервер разработки с горячей заменой вместо собранного dist\
# Запуск: двойной клик по setup.cmd или start.cmd (они зовут этот файл через powershell.exe с -ExecutionPolicy Bypass).
# Запущенный не из пакета (скопирован на рабочий стол или одной командой в PowerShell:
#   irm https://raw.githubusercontent.com/dmitry00-00/cockpit/main/setup.ps1 -OutFile $env:TEMP\setup.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\setup.ps1)
# сам берёт пакет из репозитория в %USERPROFILE%\cockpit (или $env:COCKPIT_DIR) и продолжает там.
# Файл — UTF-8 с BOM: без него Windows PowerShell 5.1 читает кириллицу как ANSI; потому не `irm | iex` — парсер
# спотыкается о BOM в строке, а файл с BOM через -File читается верно. Node.js закреплён: версия и суммы
# архивов — ниже; сменить — взять из https://nodejs.org/dist/vX.Y.Z/SHASUMS256.txt и в setup.command (версия для
# Mac) тоже — scripts/setup.test.mjs сверяет обе.
[CmdletBinding()]
param(
  [switch]$Start,
  [switch]$Lan,
  [switch]$Dev,
  [switch]$Test,
  [switch]$Update
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

$NodeVersion = '22.23.0'
$NodeMinMajor = 20
$NodeSha256 = @{
  'win-x64'   = '425a5bd68cc95e8eb16bcccd0a75081b48983fc6a26f67126bd4d6c7198231e8'
  'win-arm64' = '8d540a7a1eeb3ff6681f516c47d786964b874acdaa4fd83338d6898bbb4f68a4'
}
$Repo = 'https://github.com/dmitry00-00/cockpit'
$Port = 5180
$SmokePort = 5181
$Vite = 'node_modules/vite/bin/vite.js'

function Fail([string]$msg, [int]$code = 1) { Write-Host "Ошибка: $msg" -ForegroundColor Red; exit $code }
function Step([string]$s) { Write-Host ''; Write-Host "— $s" }
function In-Package([string]$dir) {
  if (-not $dir) { return $false }
  $pkg = Join-Path $dir 'package.json'
  return (Test-Path $pkg) -and ((Get-Content $pkg -Raw) -match '"name": "dm-cockpit"')
}
# Скачать: curl.exe есть в Windows 10 1803+ и показывает ход; иначе Invoke-WebRequest.
function Fetch([string]$url, [string]$to) {
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & $curl.Source -fL --progress-bar -o $to $url
    return ($LASTEXITCODE -eq 0)
  }
  try { Invoke-WebRequest -Uri $url -OutFile $to -UseBasicParsing -ErrorAction Stop; return $true } catch { return $false }
}
# Архив → каталог $to без верхней папки архива: tar.exe (Windows 10 1803+) или Expand-Archive.
function Unzip([string]$zip, [string]$to) {
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
  if ($tar) {
    & $tar.Source -xf $zip -C $to --strip-components 1
    return ($LASTEXITCODE -eq 0)
  }
  $tmp = "$to.unpack"
  try { Expand-Archive -Path $zip -DestinationPath $tmp -Force -ErrorAction Stop } catch { return $false }
  $inner = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  if (-not $inner) { return $false }
  Get-ChildItem -Path $inner.FullName -Force | Move-Item -Destination $to -Force
  Remove-Item -Recurse -Force $tmp
  return $true
}
function Fetch-Zip([string]$to) {
  $zip = Join-Path ([IO.Path]::GetTempPath()) 'cockpit-main.zip'
  if (-not (Fetch "$Repo/archive/refs/heads/main.zip" $zip)) { Remove-Item -Force $zip -ErrorAction SilentlyContinue; Fail "архив $Repo не скачался (нет сети?)" }
  if (-not (Unzip $zip $to)) { Remove-Item -Force $zip -ErrorAction SilentlyContinue; Fail 'архив не распаковался' }
  Remove-Item -Force $zip
}
function Table-Up([int]$port) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    return ($r.Content -like '*<title>DM Cockpit</title>*')
  } catch { return $false }
}

# 0. Пакет: запущен не из него — взять из репозитория и продолжить там (git — если есть, иначе архив).
$Here = $PSScriptRoot
if (-not (In-Package $Here)) {
  $dest = if ($env:COCKPIT_DIR) { $env:COCKPIT_DIR } else { Join-Path $HOME 'cockpit' }
  if (-not (In-Package $dest)) {
    Step 'Пакет'
    Write-Host "стола рядом нет — беру из $Repo в $dest"
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
      & $git.Source clone --quiet "$Repo.git" $dest
      if ($LASTEXITCODE -ne 0) { Fail 'git clone не отработал (нет сети?)' }
    } else {
      Fetch-Zip $dest
    }
  }
  $forward = @()
  foreach ($k in $PSBoundParameters.Keys) { $forward += "-$k" }
  & (Join-Path $dest 'setup.ps1') @forward
  exit $LASTEXITCODE
}
Set-Location $Here
$Root = $Here
$Tools = Join-Path $Root '.tools'

# Быстрый путь: стол уже поднят — только браузер. Второй двойной клик не плодит второй сервер.
if ($Start -and (Table-Up $Port)) {
  Write-Host "стол уже работает на http://localhost:$Port/ — открываю браузер"
  Start-Process "http://localhost:$Port/"
  exit 0
}

if ($Update) {
  Step 'Обновление'
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git -and (Test-Path (Join-Path $Root '.git'))) {
    & $git.Source pull --ff-only
    if ($LASTEXITCODE -ne 0) { Fail 'git pull не отработал (нет сети или локальные правки?)' }
  } else {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('cockpit-update-' + [Guid]::NewGuid().ToString('N'))
    Fetch-Zip $tmp
    Copy-Item -Path (Join-Path $tmp '*') -Destination $Root -Recurse -Force
    Remove-Item -Recurse -Force $tmp
    Write-Host "код обновлён из архива $Repo"
  }
}

# 1. Node.js: свой в .tools\node (если ставили), иначе первый подходящий из PATH и обычных мест, иначе — скачать.
function Node-Major([string]$exe) {
  try { $v = & $exe -v 2>$null } catch { return 0 }
  if ("$v" -match '^v(\d+)\.') { return [int]$Matches[1] } else { return 0 }
}
function Find-Node {
  $cands = @((Join-Path $Tools 'node\node.exe'))
  $c = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($c) { $cands += $c.Source }
  $cands += @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
    "$env:NVM_SYMLINK\node.exe",
    "$env:LOCALAPPDATA\Volta\bin\node.exe",
    "$env:APPDATA\fnm\aliases\default\node.exe"
  )
  foreach ($p in $cands) {
    if ($p -and (Test-Path $p) -and ((Node-Major $p) -ge $NodeMinMajor)) { return $p }
  }
  return $null
}
function Install-Node {
  $arch = 'win-x64'
  try {
    if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { $arch = 'win-arm64' }
  } catch {
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'win-arm64' }
  }
  $name = "node-v$NodeVersion-$arch.zip"
  $url = "https://nodejs.org/dist/v$NodeVersion/$name"
  New-Item -ItemType Directory -Force -Path $Tools | Out-Null
  $zip = Join-Path $Tools $name
  Write-Host "в системе нет Node.js >= $NodeMinMajor — скачиваю v$NodeVersion в .tools\node: $url"
  if (-not (Fetch $url $zip)) { Remove-Item -Force $zip -ErrorAction SilentlyContinue; Fail 'Node.js не скачался (нет сети?)' }
  $sum = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
  if ($sum -ne $NodeSha256[$arch]) { Remove-Item -Force $zip; Fail 'сумма архива Node.js не сошлась — файл битый или подменён; ничего не установлено' }
  $dir = Join-Path $Tools 'node'
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  if (-not (Unzip $zip $dir)) { Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue; Remove-Item -Force $zip; Fail 'архив Node.js не распаковался' }
  Remove-Item -Force $zip
}

Step 'Node.js'
$node = Find-Node
if (-not $node) { Install-Node; $node = Join-Path $Tools 'node\node.exe' }
$nodeDir = Split-Path -Parent $node
$npm = Join-Path $nodeDir 'npm.cmd'
if (-not (Test-Path $npm)) { Fail "рядом с $node нет npm.cmd" }
$env:Path = "$nodeDir;$env:Path"
Write-Host "node $(& $node -v) · npm $(& $npm -v) · $nodeDir"

# 2. Пакеты ровно по package-lock. Повторно — только если lock сменился или node_modules пропал.
Step 'Пакеты'
$lockSum = (Get-FileHash -Path (Join-Path $Root 'package-lock.json') -Algorithm SHA256).Hash.ToLower()
$lockFile = Join-Path $Tools 'lock.sha256'
$same = (Test-Path (Join-Path $Root 'node_modules')) -and (Test-Path $lockFile) -and ((Get-Content $lockFile -Raw).Trim() -eq $lockSum)
if ($same) {
  Write-Host 'node_modules по текущему package-lock — пропускаю'
} else {
  & $npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci не отработал (нет сети?)' }
  New-Item -ItemType Directory -Force -Path $Tools | Out-Null
  Set-Content -Path $lockFile -Value $lockSum -Encoding Ascii
}

# 3. Сборка: тема и иконки из design\, проверка типов, dist\. Установка собирает всегда; старт — если dist старее исходников.
function Stale {
  $index = Join-Path $Root 'dist\index.html'
  if (-not (Test-Path $index)) { return $true }
  $t = (Get-Item $index).LastWriteTimeUtc
  foreach ($r in @('src', 'content', 'design', 'public', 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json')) {
    $p = Join-Path $Root $r
    if (-not (Test-Path $p)) { continue }
    $newer = Get-ChildItem -Path $p -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -gt $t } | Select-Object -First 1
    if ($newer) { return $true }
  }
  return $false
}
if ($Dev) {
  # сервер разработки соберёт тему и иконки сам, dist\ ему не нужен
} elseif ((-not $Start) -or (Stale)) {
  Step 'Сборка'
  & $npm run build
  if ($LASTEXITCODE -ne 0) { Fail 'сборка не прошла' }
}

# 3½. Карта мира: пирамида тайлов из большого .tif (scripts\tile-map.py, HANDOFF §14 шаг 11). Исходника в git нет —
# нет его, Python с Pillow или GDAL — шаг говорит об этом и не останавливает установку: стол работает и без карты.
if (-not (Test-Path (Join-Path $Root 'maps\tiles\toril\done.json'))) {
  Step 'Карта мира'
  $py = Join-Path $Root '.venv\Scripts\python.exe'
  if (Test-Path $py) {
    & $py (Join-Path $Root 'scripts\tile-map.py') (Join-Path $Root 'content\maps\toril.json') --optional
    if ($LASTEXITCODE -ne 0) { Write-Host 'тайлы не нарезаны — см. выше; стол работает и без карты' }
  } else {
    Write-Host 'нет .venv с Pillow — карта без тайлов; чтобы нарезать: поставить Python с Pillow в .venv, потом снова setup.cmd'
  }
}
# Местность для похода (scripts\terrain-from-map.py, TASKS M9) — из тайлов z4, секунды; без неё поход — по галочке мастера.
$pyT = Join-Path $Root '.venv\Scripts\python.exe'
if ((Test-Path (Join-Path $Root 'maps\tiles\toril\done.json')) -and -not (Test-Path (Join-Path $Root 'maps\tiles\toril\terrain.png')) -and (Test-Path $pyT)) {
  Step 'Местность карты'
  & $pyT (Join-Path $Root 'scripts\terrain-from-map.py') (Join-Path $Root 'content\maps\toril.json') --optional
  if ($LASTEXITCODE -ne 0) { Write-Host 'местность не посчитана — поход по галочке мастера' }
}
# Дороги для похода (scripts\roads-from-map.py) и схема карты (scripts\schema-from-grids.py, TASKS M16) — как на Mac:
# пересчёт, когда файла нет или скрипт, сетка или справочник мест новее него.
function Test-Stale([string]$Out, [string[]]$From) {
  if (-not (Test-Path $Out)) { return $true }
  $t = (Get-Item $Out).LastWriteTime
  foreach ($f in $From) { if ((Test-Path $f) -and (Get-Item $f).LastWriteTime -gt $t) { return $true } }
  return $false
}
$roadsPng = Join-Path $Root 'maps\tiles\toril\roads.png'
$placesJson = Join-Path $Root 'content\maps\toril-places.json'
if ((Test-Path (Join-Path $Root 'maps\tiles\toril\done.json')) -and (Test-Path $pyT) -and (Test-Stale $roadsPng @((Join-Path $Root 'scripts\roads-from-map.py'), $placesJson, (Join-Path $Root 'content\maps\toril-cards.json')))) {
  Step 'Дороги карты'
  & $pyT (Join-Path $Root 'scripts\roads-from-map.py') (Join-Path $Root 'content\maps\toril.json') --optional
  if ($LASTEXITCODE -ne 0) { Write-Host 'дороги не посчитаны — поход без Open Roads' }
}
# Границы держав для схемы (scripts\borders-from-map.py) — как на Mac: пересчёт, когда файла нет или скрипт новее.
$bordersPng = Join-Path $Root 'maps\tiles\toril\borders.png'
if ((Test-Path (Join-Path $Root 'maps\tiles\toril\done.json')) -and (Test-Path $pyT) -and (Test-Stale $bordersPng @((Join-Path $Root 'scripts\borders-from-map.py'), (Join-Path $Root 'scripts\roads-from-map.py'), (Join-Path $Root 'scripts\schema-from-grids.py')))) {
  Step 'Границы карты'
  & $pyT (Join-Path $Root 'scripts\borders-from-map.py') (Join-Path $Root 'content\maps\toril.json') --optional
  if ($LASTEXITCODE -ne 0) { Write-Host 'границы не посчитаны — схема без границ' }
}
$terrainPng = Join-Path $Root 'maps\tiles\toril\terrain.png'
$schemaJson = Join-Path $Root 'maps\tiles\toril\schema.json'
if ((Test-Path $terrainPng) -and (Test-Path $pyT) -and (Test-Stale $schemaJson @((Join-Path $Root 'scripts\schema-from-grids.py'), $terrainPng, $roadsPng, $bordersPng, $placesJson))) {
  Step 'Схема карты'
  & $pyT (Join-Path $Root 'scripts\schema-from-grids.py') (Join-Path $Root 'content\maps\toril.json') --optional
  if ($LASTEXITCODE -ne 0) { Write-Host 'схема не собрана — карта растром' }
}
# Граф мира (scripts\graph-from-grids.py, SIMULATION.md С2) — как на Mac.
$graphJson = Join-Path $Root 'maps\tiles\toril\graph.json'
if ((Test-Path $roadsPng) -and (Test-Path $terrainPng) -and (Test-Path $pyT) -and (Test-Stale $graphJson @((Join-Path $Root 'scripts\graph-from-grids.py'), $roadsPng, $terrainPng, $schemaJson, $placesJson))) {
  Step 'Граф мира'
  & $pyT (Join-Path $Root 'scripts\graph-from-grids.py') (Join-Path $Root 'content\maps\toril.json') --optional
  if ($LASTEXITCODE -ne 0) { Write-Host 'граф мира не собран — процессы без путей' }
}

if ($Start) {
  $hostArgs = @()
  if ($Lan) { $hostArgs = @('--host') }
  Write-Host ''
  Write-Host 'Стол работает, пока открыто это окно. Закрыть окно или Ctrl+C — остановить.'
  if ($Dev) { & $npm run dev -- --open @hostArgs }
  else { & $node $Vite preview --port $Port --strictPort --open @hostArgs }
  exit $LASTEXITCODE
}

# 4. Проверка: поднять собранный стол на запасном порту и убедиться, что он отдаёт страницу.
Step 'Проверка'
New-Item -ItemType Directory -Force -Path $Tools | Out-Null
$log = Join-Path $Tools 'preview.log'
$err = Join-Path $Tools 'preview.err'
$srv = Start-Process -FilePath $node -ArgumentList @($Vite, 'preview', '--port', "$SmokePort", '--strictPort') -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$SmokePort/" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($r.Content -like '*<div id="root"*') { $ok = $true; break }
  } catch { }
  if ($srv.HasExited) { break }
  Start-Sleep -Milliseconds 250
}
if (-not $srv.HasExited) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
if (-not $ok) {
  Get-Content $log, $err -ErrorAction SilentlyContinue | Write-Host
  Fail "стол не ответил на http://localhost:$SmokePort/ (порт занят? см. выше)"
}
Write-Host 'стол отдаётся по http — ок'

if ($Test) {
  Step 'Тесты'
  & $npm test
  if ($LASTEXITCODE -ne 0) { Fail 'тесты не прошли' }
}

Write-Host @"

Готово: Node.js, пакеты, сборка и проверка. Стол готов к игре — $Root

  start.cmd            открыть стол: http://localhost:$Port — работает, пока открыто окно
  start.cmd -Lan       то же плюс доступ из локальной сети (планшет, второй экран); адрес покажет сервер
  setup.cmd -Update    подтянуть свежий код из $Repo
  setup.cmd -Test      полный прогон тестов (npm test)

  За столом: «Игроки» в полосе часов (или P) — вид без секретов для второго экрана;
  «Сохранить» в панели «Действия» кладёт журнал сессии в Загрузки, «Открыть…» поднимает его на любом компьютере.
"@
exit 0
