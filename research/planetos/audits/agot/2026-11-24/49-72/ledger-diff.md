# Краткий ledger diff: AGOT 49–72

Основано на secondary-index AWOIAF, первичная сверка по роману не выполнена. Действия ниже — предложения для `.34`, а не правки проекта.

## ADD — locator к существующим карточкам

| Глава | Сущность | Связь | Действие |
|---|---|---|---|
| 49 Eddard XIV | `person:petyr-baelish`, `person:cayn`, `person:preston-greenfield`, `person:arys-oakheart`, `person:pycelle`, `person:barristan-selmy`, `person:tomard`, `person:varly`, `person:varys` | `people_appearing_ids` | Добавить пропущенные locator links. Все девять карточек уже есть в `.32`. |
| 49 Eddard XIV | `place:tower-of-the-hand`, `place:throne-room-of-red-keep` | `scene_place_ids` | Добавить существующие места: заседание совета в башне и последующая сцена в тронном зале. |
| 50 Arya IV | `person:syrio-forel`, `person:hullen` | `people_appearing_ids` | Добавить пропущенные locator links; карточки уже существуют. |
| 53 Bran VI | `person:eddard-karstark`, `person:harrion-karstark`, `person:torrhen-karstark`, `person:osha` | `people_appearing_ids` | Добавить пропущенные locator links к существующим карточкам. |
| 53 Bran VI | `person:mikken` | `people_appearing_ids` | Перенести locator ch.53 из `people_mentioned_ids`: индекс относит Mikken к appearing. Не создавать дубль. |
| 53 Bran VI | `place:great-hall-of-winterfell` | `scene_place_ids` | Добавить точное место приёма Карстарков; карточка уже существует. |
| 57 Sansa V | `place:throne-room-of-red-keep` | `scene_place_ids` | Добавить место главной сцены суда; карточка уже существует. |
| 60 Jon VIII | `person:mormonts-raven` | `people_appearing_ids` | Перенести locator ch.60 из `people_mentioned_ids`; классифицировать как нечеловеческого спутника. |
| 67 Sansa VI | `person:eddard-stark`, `person:ilyn-payne` | `people_in_dream_ids` | Добавить отдельные dream-presence links. Eddard также остаётся физически/визуально присутствующим как казнённый; Ilyn появляется в последующей сцене. |
| 67 Sansa VI | `place:maegors-holdfast`, `place:throne-room-of-red-keep` | `scene_place_ids` | Добавить вложенные места: комната Сансы и королевский зал суда; карточки уже существуют. |
| 56 Tyrion VII | `event:battle-in-hills-below-golden-tooth`, `event:battle-under-walls-of-riverrun` | `events_referenced_ids` | Создать краткие карточки и links как событий прошлого, пересказанных Тирионом; P1. Не ставить `occurred` в ch.56. |
| 56 Tyrion VII | `event:burning-of-pinkmaiden-castle`, `event:burning-of-stone-hedge`, `event:fall-of-raventree-hall`, `event:yielding-of-harrenhal` | `events_referenced_ids` | Создать только если нужен широкий военный контекст; P2. Это пересказанные прошлые события без выводимых здесь дат. |

## MERGE / RECLASSIFY

- Использовать уже существующие canonical refs для всех пропущенных связей; алиасы вроде `Ned`, `Hound`, `Mordane` не заводить отдельными карточками.
- Объединённый ledger-счёт остаётся 316 refs; текущие связи дают 204 person-kind, 50 place, 9 organization и 53 event refs. Существующие карточки не размножать ради новых главовых locator links.

## DEFER / EXCLUDE

| Глава | Ref/label | Решение |
|---|---|---|
| 49 | `Royal steward` | Исключить из denominator персон: роль без имени. |
| 50 | `Stableboy` | Не создавать named person; индексный role label. Если нужно, оставить безымянным участником сцены/события. |
| 50 | `place:small-hall-of-tower-of-the-hand` | Не менять до первичной сверки: scene assignment требует проверки. |
| 51 | возможное «сновидение о Joffrey» | Снять из списка подтверждённых дыр: AWOIAF chapter page не указывает этот сон. Не добавлять `people_in_dream_ids` без подтверждения выбранным изданием. |
| 53 | `person:galbart-glover` в `people_appearing_ids` | Вероятная ошибочная связь: имя отсутствует в странице/списке appearing, а список называет Robett Glover. Удалять после проверки первичного текста; до того пометить unresolved. |
| 53 | Dancer | Лошадь, не человек; без карточки в `.32`. Не добавлять в человеческий знаменатель. |
| 60 | `person:mormonts-raven` | Оставить карточку как animal companion отдельно от human-character count; исправление только relation. |
| 61 | Silver mare | Лошадь; source-index appearance, но не именованный человек. Добавить только если пакет учитывает животных. |
| 65 | High Septon | Титул/должность, не стабильная именованная личность для этой главы; исключить. |
| 65 | `person:meryn-trant` в appearing | Не подтверждается списком AWOIAF для Arya V; оставить unresolved до сверки романа. |
| 67 | `place:maegors-holdfast` как dream setting | Не добавлять автоматически в `places_in_dream_ids`: источник привязывает кошмар к опыту Сансы, но отдельная пространственная проекция сна не определена. Сценический locator выше подтверждён синопсисом. |

## Locator pages

- [Eddard XIV / ch.49](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_49)
- [Arya IV / ch.50](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_50)
- [Sansa IV / ch.51](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_51)
- [Bran VI / ch.53](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_53)
- [Tyrion VII / ch.56](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_56)
- [Sansa V / ch.57](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_57)
- [Jon VIII / ch.60](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_60)
- [Daenerys VII / ch.61](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_61)
- [Arya V / ch.65](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_65)
- [Sansa VI / ch.67](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_67)
