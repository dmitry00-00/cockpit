# СО1 — desktop production-browser profile (22.11.2026)

## Статус

Выполнен desktop-профиль синтетического сценария на production-сборке модулей движка в Chrome на Mac. Результат — частичный: production cold/reload полной ширмы измерены в отдельном fresh local origin; физический мобильный прогон не проведён. СО1 и зависимая СО4 остаются открытыми до mobile-профиля.

## Среда и изоляция

- Chrome 157, `navigator.platform=MacIntel`, окно 1280×720 CSS px, DPR 1; управление браузером выполнялось через CUA на Mac.
- В отдельной копии в `/private/tmp/cockpit-so1-bench-20261122` собран Vite production bundle в `/private/tmp/cockpit-so1-prod`. Стенд импортирует реальные `planTimeStep`, `commitTimeStepPlan`, `createEngineStore`, `localStorageStore` и `serializeLog`.
- Сценарий начинается из synthetic seed: 100 открытых часов нитей и два активных маршрута из подготовленного route resource — Waterdeep → Neverwinter и Waterdeep → Silverymoon. Для long-log среза добавлено 500 synthetic notes.
- Каждый прогон использует отдельный `so1.profile.synthetic.commit:*` custom key; long-log replay хранится под `so1.profile.synthetic.long-log`. Код профиля не обращался к `dm-cockpit:log`; изолированная полная страница приложения настроена на `so1.profile.synthetic.app-log`.
- Для каждого шага выполнена настоящая цепочка: план → `commitTimeStepPlan` → `dispatchTransaction` → единичная синхронизация стора → production `localStorageStore.save` → `serializeLog` и нативный `localStorage.setItem`. После записи сохранённый текст сравнивался с production-сериализацией того же итогового журнала. `localStorage.setItem` измерен синхронно через wrapper над браузерным `localStorage`; serializer на том же журнале измерен отдельно.
- На каждый сценарий: 5 warm-up и 31 измеренный повтор; p50/p95 — nearest-rank, поэтому p95 для выборки 31 — 30-е упорядоченное значение. Все значения ниже — миллисекунды. Величины времени записи округлены; `0.0 ms` не означает отсутствия стоимости.

## Расчёт, сохранение и кадры

| Сценарий | Предложений | План p50/p95 | Commit + production save p50/p95 | Реальный setItem p50/p95 | serializeLog p50/p95 | Main-thread callback p50/p95 | RAF gap p50/p95 | Пропуск >20 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| День; synthetic seed, 100 часов, активные маршруты | — | 0.3 / 0.5 | 0.2 / 0.5 | 0.0 / 0.2 | 0.0 / 0.1 | 0.9 / 3.0 | 16.7 / 17.4 | 0/30 |
| Десятидневка; тот же fixture | 106 | 1.0 / 1.2 | 4.3 / 4.8 | 0.1 / 0.2 | 0.2 / 0.3 | 5.5 / 7.8 | 16.7 / 17.2 | 0/30 |
| Год; тот же fixture | 169 | 2.6 / 2.8 | 5.7 / 6.0 | 0.1 / 0.3 | 0.2 / 0.3 | 8.5 / 11.6 | 16.7 / 16.9 | 0/30 |
| Десятидневка; 500 synthetic notes + 100 часов + активные маршруты | 106 | 0.8 / 1.0 | 3.8 / 5.1 | 0.2 / 0.3 (max 1.1) | 0.4 / 0.8 | 4.8 / 7.0 | 16.7 / 17.8 | 0/30 |

Длина сохранённого журнала (UTF-16 code units): день — 3 336; десятидневка — 141 698; год — 244 040; long-log десятидневка — 265 374.

Отдельный input proxy: пять CUA-нажатий кнопки профиля измерили задержку от JS `click` handler до ближайшего `requestAnimationFrame`: **15.7, 5.9, 6.1, 14.4, 5.3 ms**, p50 6.1 ms, nearest-rank p95 15.7 ms. Это не измерение аппаратного события до показа пикселя.

## Загрузка и полный локальный граф Toril

- Browser-profile harness entry: initial navigation — `responseStart 3.8`, `domInteractive 15.8`, `DOMContentLoaded 42.6`, `load 42.9 ms`, transfer size 1 510 bytes; one reload — `responseStart 5.6`, `domInteractive 21.5`, `DOMContentLoaded 36.5`, `load 39.5 ms`, transfer size 300 bytes. These are harness page timings, not full-app timing.
- Full-app profile at fresh same-origin `http://localhost:4175/profile-app.html`: initial navigation — `responseStart 3.9`, `domInteractive 15.1`, `DOMContentLoaded 41.9`, `load 42.2 ms`, FCP 136 ms. Three same-origin reloads: `loadEventEnd` 40.4 / 33.3 / 27.6 ms (median 33.3); FCP 116 / 108 / 88 ms (median 108). Navigation `transferSize` on reload was 300 bytes for the document only; it is not a total resource transfer size. An earlier corrected build reload on `127.0.0.1:4175` showed load 60.2 ms and FCP 152 ms; kept separate because changing host changes the origin and storage partition.
- Synthetic long-log replay (`seedLog` + 500 notes): 5.4 ms at initial harness load and 3.2 ms on its reload.
- Local `maps/tiles/toril/graph.json`: 90,179 bytes, SHA-256 `63b051806797558a4ea202974e335ca3660dfec7fbc84e82ba5583f9d09b6970`; 820 nodes and 1,878 edges: 395 road, 603 water, 880 land. Generated and ignored by git rule `maps/tiles/`.

## Full-app profile capture notes

The first isolated production build of the profiling harness omitted the standard Vite `textSplit()` plugin for `?split=core`/`?split=texts`, so its first capture failed with 246 text slots and `undefined` texts, then a TypeError in the explain chunk. This was a harness configuration error, not a project crash. After adding the plugin, CUA confirmed the full app loads without console errors. The timing overlay initially did not appear because its `window.load` listener was registered after that event; it was changed to a DOMContentLoaded-safe call and rebuilt. The initial app timing and three reload samples above are from the corrected visible panel.

## Ограничения и вывод

- Браузерный стенд профилирует реальные вычислительные и persistence-модули в production bundle; его DOM не является полной ширмой. Main-thread callback и RAF gap — proxy на время синхронного вызова и соседние кадры, а не полноценная Chrome Performance trace. Для интервалов RAF на сценарий доступно 30 наблюдений после warm-up. Full-app startup/reload измерен один раз на navigate и три раза на reload; выборка мала и не представляет межустройственное распределение.
- Full-app navigation/reload и FCP измерены на fresh same-origin loopback host. Кэш Chrome отдельно не очищался, а `transferSize` отражает только документ, поэтому это не полный transfer/cold-cache trace.
- Профиль выполнен только на настольном Mac; физического мобильного устройства не было. Никакие мобильные показатели не экстраполируются.
- На измеренном fixture CPU-расчёт дня/декады/года укладывается в единицы миллисекунд; один синхронный transaction + production persistence для годового шага p95 — 6.0 ms, а RAF не показал интервалов >20 ms в этих 30 наблюдениях. Это не доказывает производительность полного Toril workload или длинной реальной кампании. Дальнейшие решения СО4 и любое решение о Rust/Wasm ждут подтверждённых полной ширмой и целевым mobile профилем.
