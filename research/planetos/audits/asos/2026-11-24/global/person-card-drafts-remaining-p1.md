# ASOS people-card drafts — remaining P0/P1

## Scope and source limits

Сверены global reconciliation и локальные аудиты диапазонов 21–40, 41–60 и 61–81 с текущим manifest Planetos `2026.11.24.40` в `/Users/dmitrij/.codex/worktrees/d10-downtime-integration/cockpit` (1,099 уникальных refs в content/planetos). Пакет и исходные аудиты не изменялись. AWOIAF — вторичный chapter index, CC BY-SA 3.0; первичная сверка романа ожидает выполнения. Все черновики помечены `secondary-indexed-partial`, `verification.primaryBook=pending`. Никакая биография сверх локаторов не добавлена.

## Результат

- Подготовлены 8 карточек: Coldhands (P0) и семь P1 персонажей; все восемь candidate refs отсутствовали в `.40`.
- У Coldhands global row не отмечает full-roster appearance, тогда как локальный audit ch.46 явно указывает `appearing`; это расхождение относится к знаменателю и не отменяет chapter-level locator. В ch.56 оставлено только упоминание/роль проводника.
- Количество chapter locators: 20. Для Coldhands сохранено различие между появлением в ch.46 и упоминанием/функцией проводника в ch.56.
- Ghost of High Heart заведён как отдельный stable ref от лютоволка `person:ghost`; в global reconciliation его классификация как nonhuman противоречит локальному аудиту, который отдельно фиксирует пророчицу. Основной индекс признаётся вторичным; тип и перевод имени требуют первичной сверки.
- Grigg the Goat появляется в ch.26; индексная форма Grigg в ch.30 связана с той же страницей персонажа. Имя/алиас всё ещё требуют сверки по роману.
- Имена Hareth, Kegs, Mully, Owen the Oaf и Spare Boot переданы только как именованные появления AWOIAF в указанных главах; роль, дом и биография не выводятся.

## Черновые карточки

- `person:coldhands` — Coldhands (P0): Samwell III ch.46 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_46)); Bran IV ch.56 — mentioned/route-guide ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_56)).
- `person:ghost-of-high-heart` — Ghost of High Heart (P1): Arya IV ch.22 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_22)); Arya VIII ch.43 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_43)).
- `person:grigg-the-goat` — Grigg the Goat (P1): Jon III ch.26 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_26)); Jon IV ch.30 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_30)).
- `person:hareth` — Hareth (P1): Jon VIII ch.64 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_64)); Jon IX ch.69 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_69)); Jon XII ch.79 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_79)).
- `person:kegs` — Kegs (P1): Jon VIII ch.64 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_64)); Jon IX ch.69 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_69)).
- `person:mully` — Mully (P1): Jon VIII ch.64 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_64)); Jon IX ch.69 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_69)); Jon XII ch.79 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_79)).
- `person:owen-the-oaf` — Owen the Oaf (P1): Jon VIII ch.64 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_64)); Jon IX ch.69 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_69)); Jon XII ch.79 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_79)).
- `person:spare-boot` — Spare Boot (P1): Jon VIII ch.64 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_64)); Jon IX ch.69 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_69)); Jon XII ch.79 — appearing ([AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_79)).

## Отложенный alias review

- `person:aemon-targaryen` — deferred-alias-review; `.40`: `person:maester-aemon`. The .40 package contains person:maester-aemon; candidate ref is absent. Do not create a duplicate until identity/ref policy is reconciled.
- `person:tormund-giantsbane` — already-present; alias review deferred; `.40`: `person:tormund-giantsbane`. Exact stable ref is present in .40; no new card.
- `person:brown-ben-plumm` — deferred-alias-review; `.40`: `person:ben-plumm`. The .40 package contains person:ben-plumm; candidate ref is absent. ASOS 57 appears only as route-intelligence context in this pass; no new person card until alias/appearance scope is reconciled.

## Проверки

Выход содержит `cockpit.entity-layer/1` person payload; у каждого карточного источника есть cite с книгой/главой и numeric AWOIAF URL, CC-BY-SA-3.0, `status=secondary-indexed-partial`, `verification.primaryBook=pending`. Все refs уникальны, отсутствовали в `.40`, ссылки на чужие карты не добавлены.

### Что остаётся проверить

- Первичным изданием подтвердить appearance-vs-mention и русские имена.
- Для Coldhands ch.56 сохранить только упоминание/роль проводника; appearance локатор дан по ch.46. Его global denominator flag и selected audit relation расходятся, поэтому полноту знаменателя нужно отдельно пересмотреть.
- Для Ghost of High Heart подтвердить отдельность и тип по роману; не связывать её с direwolf Ghost.
- Для Grigg подтвердить, что форма Grigg в ch.30 и Grigg the Goat в ch.26 — одна персона; локальный audit ссылается на [AWOIAF character page](https://awoiaf.westeros.org/index.php/Grigg_the_Goat).
- Alias review: Aemon Targaryen ↔ `person:maester-aemon`; Brown Ben Plumm ↔ `person:ben-plumm`; Tormund exact ref already exists.
