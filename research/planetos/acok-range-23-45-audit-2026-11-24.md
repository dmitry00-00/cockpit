# ACOK, главы 23–45: частичный chapter-index аудит

## Ограничения источника и обязательная первичная сверка

Использованы числовые страницы глав A Wiki of Ice and Fire (AWOIAF), то есть вторичный указатель. У страниц разная подробность synopsis и списков `Appearing` / `Mentioned`; дельта отбирает полезные сущности, а не полный перечень каждого имени, безымянного участника, места или события. Формулировки карточек — собственные короткие парафразы; текст романа не копировался.

Первичная сверка по выбранному изданию романа не выполнена. Перед интеграцией нужно сверить русские имена, книжную границу, подробности и статус сообщений по изданию владельца. Даты из порядка глав не выводились. Источник карточек и атрибуция: A Wiki of Ice and Fire contributors, CC BY-SA 3.0.

## Дельта

19 новых персонажей, 10 мест, 2 организации, 29 событий; ID проверены на отсутствие совпадений с пакетным срезом `.31` и между собой. Созданы 23 строки ledger со статусом `secondary-indexed-partial`. Поля ledger соответствуют названиям столбцов AGOT CSV, но массивы связей переданы как JSON-массивы. Это ограниченная выборка ссылок, не заявление полноты.

**Персонажи:** Craster, Gilly, Jarmen Buckwell, Thoren Smallwood, Ottyn Wythers, Rymolf Stormdrunk, Wex Pyke, Tickler, Chiswyck, Weese, Quaithe, Quhuru Mo, Benfred Tallhart, Dagmer Cleftjaw, Qhorin Halfhand, Alfyn Crowkiller, Cortnay Penrose, Reek, Lollys Stokeworth.

**Места:** Craster’s Keep, Frostfangs, Lordsport, Gods Eye village, Wailing Tower, Renly’s pavilion at Storm’s End, Stony Shore village, harbor of King’s Landing, cavern beneath Storm’s End, Red Fork.

**Организации:** The Pureborn; House Tallhart.

**События:** прибытие Большого похода к Крастеру; сбор Манса в Клыках Мороза (сообщение); отравление Серсеи; поручение Клеосу; допросы у Божьего Ока; весть о смерти Роберта; два сна Жойена; выбор Чисвика и смерть Чисвика; провал переговоров Станниса и Ренли; избиение Сансы и вмешательство Тириона; достижение Кулака Первых Людей; битва при Окс-кроссе (сообщение); пленение Вонючки; брачное предложение Тириона; пленение и гибель Бенфреда; план Теона; имя Уиза и обнаружение его тела; уход Тайвина; отказ Чистокровных; отплытие Мирцеллы; беспорядки; появление тени; показание пленного о плане прорыва Стены; падение Штормового Предела (сообщение); Битва у бродов.

## Свершившееся, сообщения, планы и сны

- **Свершившееся / наблюдаемое:** приход к Крастеру и Кулаку Первых Людей, отравление Серсеи, допросы у Божьего Ока, вмешательство Тириона, захват и гибель Бенфреда, выход Тайвина из Харренхола, отплытие Мирцеллы, беспорядки, появление тени.
- **Сон:** оба сна Жойена отмечены как сновидения; затопление Винтерфелла не записано как материальное событие. Сон Станниса о Ренли отражён только в ledger как образ сна.
- **Сообщение / неподтверждённая версия:** Крастер сообщает о Мансе в Клыках Мороза; Кхуру Мо передаёт известие о Роберте и слухи; победа у Окс-кросса известна через сообщение; план прорыва Стены — показание пленного; падение Штормового Предела передано Варисом.
- **План / приказ:** условия Тириона Роббу, брачный союз Джоффри и Маргери, замысел Теона атаковать Винтерфелл — планы/поручения, не исполненные события.
- **Битва у бродов:** глава включает наблюдаемые переправы и позднее сообщение о более широком результате; точный хронологический расклад требует сверки по роману.

## Сомнения и пропуски

- `person:reek` остаётся отдельно от `person:ramsay-snow`: в главе 35 пленник назван Вонючкой, его тождество на этой книжной границе не раскрыто. Не объединять без проверки границы раскрытия.
- Рассказ Джилли о сыновьях Крастера, обвинения Станниса о Джоне Аррене и версии о предательстве Роберта остаются речью персонажей, а не установленными фактами.
- Гибель Чисвика индексируется по сообщению, смерть Уиза — по обнаружению тела. Рождение тени не отождествляется с конкретным убийством или жертвой.
- Не добавлены все упомянутые малые персонажи, безымянные участники, корабли, предметы, дома и периферийные места. Указатели глав неодинаково полны.
- Эти материалы без фильтра книги/главы не следует выдавать игрокам как безопасные.

## Уже существующие карточки, переиспользованные без дублей

Примеры повторно использованных ID `.31`: `person:asha-greyjoy`, `person:jaqen-hghar`, `person:jojen-reed`, `person:meera-reed`, `person:brienne-of-tarth`, `person:melisandre`, `person:davos-seaworth`, `person:ramsay-snow`; `place:pyke`, `place:harrenhal`, `place:qarth`, `place:storms-end`, `place:winterfell`, `place:riverrun`, `place:kings-landing`, `place:fist-of-the-first-men`; `event:renly-killed-at-storms-end`. Кросс-книжные сущности остаются одной карточкой.

## Numeric chapter locators
- 23. Jon III — Jon Snow: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_23
- 24. Theon II — Theon Greyjoy: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_24
- 25. Tyrion VI — Tyrion Lannister: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_25
- 26. Arya VI — Arya Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_26
- 27. Daenerys II — Daenerys Targaryen: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_27
- 28. Bran IV — Bran Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_28
- 29. Tyrion VII — Tyrion Lannister: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_29
- 30. Arya VII — Arya Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_30
- 31. Catelyn III — Catelyn Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_31
- 32. Sansa III — Sansa Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_32
- 33. Catelyn IV — Catelyn Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_33
- 34. Jon IV — Jon Snow: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_34
- 35. Bran V — Bran Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_35
- 36. Tyrion VIII — Tyrion Lannister: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_36
- 37. Theon III — Theon Greyjoy: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_37
- 38. Arya VIII — Arya Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_38
- 39. Catelyn V — Catelyn Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_39
- 40. Daenerys III — Daenerys Targaryen: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_40
- 41. Tyrion IX — Tyrion Lannister: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_41
- 42. Davos II — Davos Seaworth: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_42
- 43. Jon V — Jon Snow: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_43
- 44. Tyrion X — Tyrion Lannister: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_44
- 45. Catelyn VI — Catelyn Stark: https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_45

## Файлы

- `people.json`, `places.json`, `organizations.json`, `events.json`: новые слои `cockpit.entity-layer/1`.
- `ledger-rows.json`: предложения строк ledger, массивы ссылок можно сериализовать как `;` для CSV.
- Все карточки и строки имеют статус `secondary-indexed-partial`; первичная сверка pending.
