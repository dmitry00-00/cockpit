# Реестр ресурсов — где смотреть и что можно брать

Собран 27.10.2026 по поискам этой недели. Новый источник сначала попадает сюда с решением, потом в код или данные.

**Решения**

- **берём** — открытая лицензия, можно класть в продукт с указанием авторства (и с той же лицензией, если она SA).
  - **CC BY-SA — только внутри** (решение пользователя 30.10.2026): вики Forgotten Realms и другие источники под SA идут в разработку и тестирование, вовне — никогда и нигде, даже для внешнего тестирования.
- **факты** — права у автора: берём только факты (имена, виды, принадлежность, связи, числа), без текста и рисунка; схему рисуем сами.
- **стол** — фанатский материал без лицензии или по Fan Content Policy WotC: годится для личного стола владельца, в репозиторий и продукт не идёт.
- **смотрим** — справка и вдохновение, ничего не переносим.
- **купить** — официальное: только у владельца в книге или на D&D Beyond.
- **нет** — нелицензионные копии книг и сканы: не скачиваем и не открываем.

Механика в продукте — по `CLAUDE.md`: дословно, с `source`; всё не из SRD — отдельным фильтром.

## 1. Правила 5e

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| SRD 5.1 через [dnd5eapi.co](https://www.dnd5eapi.co) ([5e-bits/5e-database](https://github.com/5e-bits/5e-database), MIT) | заклинания, монстры, снаряжение, классы | CC BY 4.0 | **берём** — в `content/srd/`: 319 заклинаний, все 334 блока монстров, 122 предмета снаряжения, 239 магических предметов (27.10) |
| SRD 5.2 (правила 2024) | 331 монстр, 339 заклинаний, 760 магических предметов, 17 черт | CC BY 4.0 | **берём**, если стол перейдёт на 2024 |
| [Open5e API](https://api.open5e.com/v2/documents/) | 24 документа с лицензией у каждого — сводка ниже | по документу | **берём** по таблице |
| [A5E SRD](https://a5esrd.com/a5esrd) (EN Publishing, Level Up) | 586 монстров, 371 заклинание, 59 черт, 21 предыстория; главы Exploration (86 стр.) и Exploration Challenges — походы, припасы, испытания в пути | CC BY 4.0 / OGL / ORC на выбор | **берём** — правила похода в `content/a5e/journey.json` (поход по карте), 586 монстров в `content/a5e/monsters.json` (27.10) |
| Black Flag SRD (Kobold Press) | 360 монстров | CC BY 4.0 | **берём** — в `content/bf/monsters.json` (27.10) |
| Spells That Don't Suck | 180 заклинаний | CC BY 4.0 | **берём** (хоумбрю) |
| [Free5e](https://github.com/wyrmworkspublishing/free5e) (Wyrmworks Publishing) | свободная система, совместимая с 5e, — правила в Markdown на трёх языках (en-US, de-DE, es-MX), из них собираются HTML, PDF и EPUB; есть инструменты перевода между вариантами 5e | CC BY 4.0 (шрифты — SIL OFL 1.1) | **берём** при нужде, как SRD: с авторством и `source`; объём в записях не считан (29.10) |
| Tome of Beasts 1–3, Creature Codex, Deep Magic, Vault of Magic, Tome of Heroes, Warlock Zine (Kobold); Tal'Dorei CS (Green Ronin) | ≈1500 монстров, 579 заклинаний, 1063 магических предмета, 40 рас, 76 классов и подклассов | OGL 1.0a | **берём** при нужде: текст OGL и раздел 15, без Product Identity (лор Midgard) |
| [oldmanumby/dnd.srd.5.1](https://github.com/oldmanumby/dnd.srd.5.1) | SRD 5.1 в Markdown | CC BY 4.0 (сам SRD) | **берём** для сверки |
| [grimpress — лицензия SRD](https://grimpress.net/5e-srd-license/) | разбор условий CC BY для SRD | — | **смотрим** |
| [D&D Wiki](https://www.dandwiki.com) | хоумбрю всех видов | GNU FDL 1.3 (подвал сайта, проверено 29.10); страницы `SRD:` — OGL 1.0a | **смотрим**; брать — по одной странице: FDL требует той же лицензии и истории правок |
| [D&D Wiki — SRD:Equipment](https://www.dandwiki.com/wiki/SRD:Equipment) | снаряжение, оружие, доспехи из **3.5e** Revised SRD (категории страницы: OGL, 3.5e, SRD) | OGL 1.0a | **смотрим** — механика 3.5e с 5e не сходится (другие цены, доспехи, свойства оружия); снаряжение 5e уже взято из SRD 5.1 (`content/srd/`, 122 предмета) (29.10) |
| [D&D Wiki — 5e SRD](https://www.dandwiki.com/wiki/5e_SRD:System_Reference_Document) | SRD 5.1 разбит по страницам: правила, расы, классы, списки заклинаний по классам, снаряжение (вкл. инструменты, товары, яды), монстры по типам, NPC, «фэнтези-исторические пантеоны», болезни, отдых, планы, ловушки, состояния, безумие, магические предметы по редкости | на сайте помечен OGL 1.0a | **смотрим** — для сверки; данные берём из первоисточника под CC BY 4.0 (dnd5eapi, `content/srd/`), а не из копии под OGL (29.10) |
| [D&D Wiki — 5e Homebrew](https://www.dandwiki.com/wiki/5e_Homebrew) | крупнейший свод хоумбрю 5e (счётчики раздела 29.10): опции персонажа 7100, снаряжение 7017, существа 5065, заклинания 4055, расы 2725, классы 2219, предыстории 458, награды 458, правила 531, карты 206, сеттинги 118, ловушки 102, болезни 99, опасности 81, окружения 61, квесты 39, таблицы встреч 10 | GNU FDL 1.3 — копилефт: взятое распространяется под FDL с указанием авторов и истории | **смотрим**; если брать, то по одной записи, с `source: hb` и отметкой FDL. Качество неровное, проверки нет — сначала читаем запись целиком (29.10) |
| [D&D Wiki — SRD Infrastructure](https://www.dandwiki.com/wiki/SRD_Infrastructure) | служебные шаблоны вики: подвалы и «хлебные крошки» страниц SRD 3e, 3.5e и 5e | GNU FDL 1.3 | **смотрим** — содержимого нет, брать нечего; годится только как оглавление разделов SRD на сайте (29.10) |
| Homebrewery, GM Binder, r/UnearthedArcana, r/DnDHomebrew | хоумбрю | у авторов | **смотрим** |
| DMs Guild, DriveThruRPG, itch.io | платное и бесплатное сообщества | у каждой работы своя; часть — CC | **смотрим**, бесплатное с CC — **берём** по одному |
| [AideDD](https://www.aidedd.org) (правила, фильтры монстров) | справочник 5e | у автора | **факты** (пары «имя — класс») |
| [dnd.su](https://dnd.su), [ttg.club](https://ttg.club) | русские переводы и хоумбрю | не проверены; официальные переводы — права WotC | **смотрим** |
| [dnd.su/spells](https://dnd.su/spells/), [5e14.ttg.club/spells](https://5e14.ttg.club/spells) | каталоги заклинаний по-русски: официальные и хоумбрю, переключатель 2014/2024 (dnd.su), фильтры по кругу, школе, компонентам, концентрации, ритуалу; у ttg.club — источник каждой записи (PHB, XGE, TCE…) | лицензии нет: dnd.su — «© 2017–2026», ttg.club — без отметки; откуда переводы, не сказано | **смотрим** — образец фильтров и карточки заклинания (29.10) |
| [dm-stuff.ru — каталог заклинаний](https://dm-stuff.ru/spell-catalog/) | «Инструменты мастера D&D»: каталоги классов, рас, существ, предметов, богов, языков; генераторы добычи, дикой магии, книги заклинаний; у заклинаний ~20 фильтров — время, дистанция, спасбросок, тип урона, состояния, стоимость компонентов | не указана, автор не назван | **смотрим** — самый полный набор фильтров из встреченных (29.10) |
| [adventure-tavern.app](https://adventure-tavern.app/library/spells/antimagic-field-2014) | справочник заклинаний 2014 по-русски, по странице на заклинание | не указана | **смотрим** (29.10) |
| [candysrise.ru — подборки заклинаний](https://candysrise.ru/dnd-helper/spell-lists/) | списки заклинаний по классам и кругам, заговоры, ритуалы PHB 2024; генераторы сокровищ и встреч, трекер инициативы | «© 2026 C4ndy5», лицензии нет | **смотрим** (29.10) |
| [dndcodex.ru — заклинания](https://dndcodex.ru/refs/spells) | справочник 2014/2024, лист персонажа, бестиарий, ширма мастера, кубы, импорт наборов данных | заявлено «на основе SRD 5.1 / 5.2 (CC BY 4.0)»; чей русский текст, не сказано | **смотрим**; второй кандидат для вопроса о русских названиях — если подтвердится, что русский текст свой и отдан под CC BY (29.10) |
| [Королевство Авенгар](https://avengar.ru/) | «русскоязычный справочник правил, существ, заклинаний и предметов»; страница собирается скриптом, содержимое не прочитано | не указана | **смотрим** (29.10) |
| [Samovar](https://grjdh.github.io/samovar/) ([код](https://github.com/grJDh/samovar)) | приложение со списком заклинаний 5e по-русски: поиск, фильтры, карточки; React, последняя правка 07.2023 | у репозитория лицензии нет, откуда данные, не сказано | **смотрим** (29.10) |
| [rpgd100.ru — магические предметы](https://rpgd100.ru/content_pages/magic_items_dnd5e) | 934 официальных магических предмета по книгам (DMG 283, XGE 48, TCE 47…) с русским и английским именем, редкость, тип, настройка, цена; фильтры | лицензии нет; называет предметы «официальными» — тексты книг WotC в переводе | **факты** (пары «английское имя — русское имя», редкость, тип); текст описаний не берём (29.10) |
| [Aternia Games — материалы](https://aternia.games/materials) | библиотека PDF по-русски: 349 работ — приключения, ваншоты, кампании, дополнения; метки «официальное», «перевод», «авторское», «хоумбрю», «конкурс» | условий нет | **смотрим** авторское и хоумбрю; переводы официальных книг — **нет** (29.10) |
| [Kreozot/dnd5e-spells](https://github.com/Kreozot/dnd5e-spells) | интерактивный список заклинаний 5e: 361 заклинание по-английски (`src/content/spells.yaml`), списки классов | код 0BSD | **смотрим** — **русских названий нет**: проверено 29.10 по всем файлам и 14 веткам (прежняя запись «с русскими названиями» была ошибкой); копия — внешний диск, `datasets/kreozot-dnd5e-spells-2026-10-29/` |
| [ZwS/foundryvtt-dnd5e-lang-ru](https://github.com/ZwS/foundryvtt-dnd5e-lang-ru) | русский перевод компендиумов SRD системы dnd5e для Foundry (модуль Babele): 319 заклинаний — ровно наш `content/srd/spells.json`, по английскому id — русское имя и текст; ещё предметы, классы, умения классов, расы; последняя правка 12.05.2021 | лицензии нет; имена совпадают с dnd.su («Кислотная стрела», «Подмога», «Сигнал тревоги») — перевод, видимо, оттуда | **смотрим** — для русских названий слаб: перевод не доделан, русское имя есть у **77 из 319** заклинаний (остальные — английское имя как было), у предметов — 316 из 797. Сверка с таблицами владельца: из 224 русских имён таблиц пару нашли 42 точно и ~6 написанием; попутно — 11 случаев разнобоя и опечаток в самих таблицах (Q14). Отчёт и скрипт — внешний диск, `datasets/foundry-dnd5e-lang-ru-2026-10-29/report-spell-names.md` (29.10) |
| Русский SRD от WotC | — | — | **нет такого**: WotC перевели SRD 5.1 под CC BY на испанский, итальянский, немецкий и французский; русского нет (поиск 29.10) |
| D&D Beyond, книги WotC | всё официальное | © WotC | **купить** |

## 2. Мир Forgotten Realms — тексты и факты

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| [Forgotten Realms Wiki](https://forgottenrealms.fandom.com), дамп с S3 (`wikia_xml_dumps`) | ≈10 800 статей о местах, планах и небесных телах; божества, организации; 3068 статей-годов «N DR» | CC BY-SA 3.0 | **берём** — в работе: `scripts/wiki-extract.py`, `scripts/world-registry.py`, карточки L3; хронология — строки событий как есть, по-английски, с авторством (`content/chronology/`, 29.10) |
| [geospatial-grimoire/forgotten-realms-wiki-parser](https://github.com/geospatial-grimoire/forgotten-realms-wiki-parser) | парсер того же дампа в Markdown | MIT | **смотрим** (свой парсер есть) |
| [Obsidian TTRPG Atlas](https://github.com/ObsidianTTRPGProject/Obsidian-TTRPG-Atlas) | скрипты: вики → Markdown | GPL-3.0 | **смотрим** |
| `DND.7z` от владельца (28.10, `~/Downloads/`; для проверки состава распаковывались только заметки — после решения удалены) | хранилище Obsidian по-русски: ~6000 заметок лора (≈4200 — пустые заготовки), 764 записи справочника (классы, расы, монстры, снаряжение), 476 картинок на 1,1 ГБ (183 карты, портреты, божества); среди текстов — переводы глав книг (например, храмы из Faiths & Pantheons) | не указана, переводы книг WotC | **стол** — решение владельца 28.10: хранилище для его собственного стола в Obsidian; кокпит его не использует, в продукт и репозиторий не идёт |
| [Spelljammer Wiki](https://spelljammer.fandom.com) | тела Realmspace и других сфер | CC BY-SA | **берём** факты для схемы орбит |
| [realmshelps.net — Cosmology of Toril](https://www.realmshelps.net/faerun/planes/index.shtml) | пересказ космологии FRCS 2001: дерево планов, ~30 планов, пути между ними | без лицензии, текст близок к книге | **факты** (устройство и список планов) |
| [Raduziel/Deities-Of-Faerun](https://github.com/Raduziel/Deities-Of-Faerun) | божества Фаэруна | без лицензии | **факты** |
| [Cantilux/faerun-date](https://github.com/Cantilux/faerun-date) | перевод дат в календарь Харптоса | MIT | **берём** при нужде (календарь в кокпите свой) |
| [gibberlings3 dw_talents](https://gibberlings3.github.io/Documentation/readmes/readme-dw_talents.html), [2d4chan](https://2d4chan.org/wiki/Forgotten_Realms), [Living Forgotten Realms](https://www.livingforgottenrealms.com/), [alphastream](https://alphastream.org/index.php/resources/) | справочные статьи, моды, организованная игра | у авторов | **смотрим** |
| [The Parchment Paladin — FR Travel Matrices](https://verdant-twilight-b1de89.netlify.app/blog/2023/dec/fr-travel-matrices/) ([Sea of Swords](https://verdant-twilight-b1de89.netlify.app/blog/2023/dec/fr-travel-matrix-sea-of-swords/)) | таблицы расстояний в милях: Trade Way (14 остановок, Calimport — Waterdeep), река Chionthar, Sea of Swords — картинками и страницами Homebrewery | без лицензии; мили намерены щелчками по атласу AideDD, таблицу пар собрал ChatGPT — не канон | **смотрим** — сверено 29.10: для калибровки не годится — отношение «их дорога / наша прямая» по соседним городам от 0,98 до 2,38 (Baldur's Gate → Daggerford 548 миль при прямой 270); сходится только итог Waterdeep → Baldur's Gate, 658 против канонических ~750 (−12 %). Калибровка 0,37 остаётся. Отчёт и исходник — внешний диск, `datasets/parchment-paladin-fr-travel-2026-10-29/` |
| [spriggans-den — как менялась карта Faerûn](https://spriggans-den.com/2021/11/29/how-the-map-of-faerun-changed-over-time/), [The Alexandrian — Phandalin hexmap](https://thealexandrian.net/?p=50981) | статьи о картах | у авторов | **смотрим** |

## 3. Карты Toril

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| [Toril GIS](https://github.com/geospatial-grimoire/toril-gis) (Geospatial Grimoire) | 1851 именованный объект: точки, области, реки; иерархия `location_paths`, русские имена, описания; слои Подземья `udk_` | CC BY-SA 4.0 + WotC Fan Content Policy | **берём** с авторством — в работе (`maps/gis/`) |
| [forgotten-realms-rasters](https://github.com/geospatial-grimoire/forgotten-realms-rasters) | геопривязанные растры Toril | не указана | **стол** |
| Карта HandsomeRob (`maps/abeir toril/`) | растр 30600×13400 — основа карты кокпита | не указана, фанатская | **стол**, автора указываем; в git не идёт |
| [AideDD atlas](https://www.aidedd.org/atlas/faerun) | ~1440 меток с классом по цвету | у автора | **факты** (имя — класс, `scripts/l1-eval.py`) |
| [AideDD atlas — Neverwinter](https://www.aidedd.org/atlas/neverwinter) | план города: районы-области и метки с текстами, линейка; данные грузит скрипт (не прочитаны), основа не названа — по виду официальный план | не указана, у автора | **факты** — список районов и пары «место — район» для уровня поселения (M10); многоугольники, рисунок и тексты не берём, план рисуем сами; районы сначала — из FR Wiki (CC BY-SA) (28.10) |
| [Nations of the Forgotten Realms](https://atlasoficeandfireblog.wordpress.com/2022/11/11/nations-of-the-forgotten-realms-the-full-guide/) (werthead, Atlas of Ice and Fire) | 39 статей по странам Faerûn с картами границ (PNG) на 1371–72 DR; «drawn from The Forgotten Realms Interactive Atlas CD-ROM» и книг 1e/2e | не указана | **смотрим** — производное от официального; сверка «кто чем владеет», для 5e устарело, границы не обводим (28.10) |
| [Forgotten Maps](https://forgottenmaps.web.app/map/Faerun) | приложение на Firebase: Faerûn с уровнем Underdark, Calimport, поиск лора из Fandom | не указана, автор и основа не названы | **смотрим** (28.10) |
| [LoreMaps](https://loremaps.net/maps/faerun/) ([код](https://github.com/loremaps/LoreMaps)), [LoreMaps-Faerun-Tiles](http://loremaps.github.io/LoreMaps-Faerun-Tiles/) | тайлы карты Faerûn 3.5 («image by Pocket Plane Group»), метки — GeoJSON-точки только с `name`, тексты из FR Wiki по API; гексы, линейка | не указана; «map data and lore belong to their respective creators» | **смотрим** — растр производный от официального, имён сверх Toril GIS и AideDD нет |
| [vectorized-realms](https://jonovotny.github.io/vectorized-realms/) | векторная карта FR в работе | не указана | **смотрим**; брать — спросить автора |
| [ProjectFaerun/Faerun](https://github.com/ProjectFaerun/Faerun) | мод с картой Faerûn | не указана | **смотрим** |
| World Anvil (cleggerama, rothguard, [Adventure's Guild of Faerûn — Kassimir](https://www.worldanvil.com/w/adventure-s-guild-of-faerun-kassimir/map/8e7f9d2a-779d-430d-b77d-7b5cbc19d957) — 28.10 отвечает 403, содержимое не проверено, и др.), [fables.gg](https://fables.gg) | миры энтузиастов | у авторов | **смотрим** |
| Mike Schley, Tych (Patreon) | официальные и авторские карты | © авторов | **купить** |

## 4. Подземье

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| Toril GIS, слои `udk_` | 15 доменов, 70 точек, 17 озёр; ярусы Upper/Middle/Lowerdark; на одной сетке с поверхностью | CC BY-SA 4.0 + FCP | **берём** — основа |
| Underdark (WotC 2003), Out of the Abyss (2015), Menzoberranzan (1992, 2012), Drizzt's Guide to the Underdark (1999), City of the Spider Queen (2002), Dungeon of the Mad Mage (2018) | обзорные карты и планы городов | © WotC | **купить**; в продукт только как ссылка |
| [The Underdark Map: Revisited](https://www.dmsguild.com/en/product/488270/the-underdark-map-revisited) (DMs Guild) | перерисованная общая карта | платная, личное использование | **купить**, если нужна подложка |
| [EN World — глубина Подземья](https://www.enworld.org/threads/how-deep-is-the-underdark.329832/) | глубины ярусов (вторичный источник) | — | **смотрим** |

## 5. Планы и космос

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| FR Wiki: 277 статей о планах и слоях, 87 о небесных телах | Great Wheel, World Tree, World Axis; Realmspace: солнце, 8 планет, луны, Tears of Selûne | CC BY-SA 3.0 | **берём** — в `maps/world/locations.json`; тела Realmspace и течения вокруг него — в `content/cosmos/` (планетарий и схема течений, 28.10) |
| «The Arcane Inner Flow Quadrant» © Nerik ([World Anvil](https://www.worldanvil.com/w/spelljammer-universe-franciscovega/map/e4ce4ddc-d219-4b3e-99c9-876986c71e9a); у владельца — PNG 2085×1489 и две копии) | ~150 сфер, флоу-реки с днями пути, области, пометки | © Nerik | **сверка** — граф течений взят из FR Wiki с книгами (28.10); карта — только для сверки, её авторские сферы и дни не переносим |
| Картинки владельца в `~/Downloads/subject_404/`: Great Wheel (PezAs 2013), «Cosmologie des royaumes», «La Grande Ruota», «The Outer Planes» (53 слоя) | схемы космологии | © авторов | **факты** — своя SVG по устройству |
| [City of Doors](https://github.com/amargon/city-of-doors) (Sigil) | 289 точек заведений по районам в `map.json`; карта 6400×4400 | код MIT, данные CC BY 4.0; карта — производная от официальной | данные **берём**, карту — **стол** |
| [nether-whisper.ru — карта Sigil](https://nether-whisper.ru/rp/planescape/map-of-sigil/) | зеркало City of Doors | как выше | **смотрим** |
| planewalker.com — Sigil_Map2.pdf, Sigil Venues2.xls (Ambrus, 2011) | карта и таблица заведений | без отдельной лицензии | **стол** |
| [mimir.net — Outlands](https://mimir.net/planes/outlands/) (Jon Winter-Holt) | WebP 2500×2500 | FCP, без лицензии на перенос | **стол**; публиковать — спросить автора |
| [theplanardm.com](https://theplanardm.com/resources/) — 43 постера | сканы постеров TSR 1994–95 | © WotC | **нет** |
| Постеры Realmspace (1991), Sigil and the Outlands (2023), Rock of Bral (2022) | официальные | © WotC | **купить** |

## 6. Другие миры (на будущее)

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| [Open Source Exandria](https://github.com/RossThorn/open-source-exandria) | полноценный GIS: GeoJSON + QGIS, геопривязанные растры | не указана | **стол**; дальше — спросить автора |
| Flanaess (Greyhawk), Anna B. Meyer | растр 576 и 598 CY | по поиску CC BY-NC — проверить у автора | **смотрим** до проверки |
| [athas.org](https://athas.org/resources) (Dark Sun) | карты и PDF сообщества; карта 4e — оригинал WotC | без лицензии | **смотрим** |
| [sharn-map](https://github.com/a-ws-m/sharn-map) (Eberron) | SVG и районы Sharn в JSON | AGPL-3.0 | **смотрим** (AGPL заразна для кода) |
| Fraternity of Shadows (Ravenloft) | карты доменов | «not public domain» | только по разрешению автора |
| Shapefile Westeros и Essos ([разбор с GeoPandas](https://ric70x7.github.io/got.html); файлы — на форуме Cartographers' Guild) | континенты, острова, реки, озёра, дороги, города, границы — по фанатской «A Song of Ice and Fire — Speculative world map», по первой книге | не указана, фанатская | **смотрим** — для второй кампании (M11): сверить с `maps/ASOIAF/`; файлы не скачаны, ссылки на загрузку в статье нет (29.10) |
| Dyson Logos | карты подземелий и зданий | часть — бесплатно с авторством, в т.ч. коммерчески | **берём** по одной, проверяя условия |
| [D&D: World of Warcraft](https://wpn.wizards.com/en/products/dnd-world-of-warcraft) (WotC × Blizzard) | расширение на правилах 2024: 11 видов (дреней, ворген, таурен…), 6 новых и 3 обновлённых подкласса, 60+ заклинаний, 25+ магических предметов, 50+ монстров и 30 боссов, 7 подземелий, 23 фракции с известностью; только по-английски; выход 17.11.2026, в магазинах WPN — с 03.11 | © WotC, ™ Blizzard | **купить**; 23 фракции с известностью — образец для известности партии (E10) (29.10) |
| [Azgaar's Fantasy Map Generator](https://azgaar.github.io/Fantasy-Map-Generator/) ([код](https://github.com/Azgaar/Fantasy-Map-Generator)) | генератор и редактор карт мира в браузере: рельеф, реки, державы, культуры, религии, поселения, пути; свой файл `.map` (проверено 30.10) | код — MIT (LICENSE проверен 30.10); карта, которую сгенерировал сам пользователь, — его | **берём** как вход конвертера карт (П12) и прецедент для симуляции (И3) и генерации (И4); форматы выгрузки — проверить |
| [Fantasy Town Generator](https://www.fantasytowngenerator.com/) | генератор городов в браузере | условия прочитаны в браузере 30.10 (исследование движка карт): ToS запрещает разбирать и копировать саму программу; Creative License разрешает делиться сгенерированными городами и переделывать их, в том числе коммерчески, авторство — только при коммерческом использовании | **смотрим** как прецедент генерации (И4); город, сгенерированный мастером, — **берём** по Creative License |
| [forgottenmaps.com](https://forgottenmaps.com/waterdeep/) (Rogue Tech LLC) | интерактивные карты Forgotten Realms: 902 места с пиксельными координатами, та же лестница Waterdeep → Sword Coast → … → Toril → Realmspace | условий нет, только политика конфиденциальности (30.10) | **смотрим** — только идеи |

**Генераторы и инструменты мастера** (присланы пользователем 30.10.2026; лицензии кода — по GitHub API, условия сайтов — по их страницам, 30.10). Кандидаты для генерации (П7, И4), импорта (П6) и конвертера карт (П12).

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| [thomascgray/fantasy-content-generator](https://github.com/thomascgray/fantasy-content-generator) | библиотека JS: NPC, поселения, таверны, магические предметы, имена «во вкусе 5e» | MIT | **берём** — кандидат таблиц генерации П7 |
| [OpenDnD](https://github.com/opendnd) | набор генераторов: персонажи (personae), династии (dynastia), королевства и города (dominia), имена (nomina), здания (aedificia), квесты (questae), карты (cartae), наследуемые черты (genetica) | MIT (api — без явной лицензии, core и similia — без лицензии) | **берём** MIT-репозитории; dynastia и dominia — прецедент для держав и симуляции (И3) |
| [dhorions/DnDGenerate](https://github.com/dhorions/DnDGenerate) | сценарий приключения из идеи через ИИ | MPL-2.0 (копилефт на уровне файла) | **смотрим** — прецедент П7 |
| [AdrianSI666/DnD_Bestiary-Spellbook-CT](https://github.com/AdrianSI666/DnD_Bestiary-Spellbook-CT) | бестиарий, книга заклинаний и трекер боя на Java Swing | GPL-3.0 | **смотрим** — копилефт и чужой стек |
| [mpmcpherson/dndmodulegenerator](https://github.com/mpmcpherson/dndmodulegenerator) | случайные элементы приключения, NPC, места | лицензии нет — все права у автора | **смотрим** |
| [Watabou — Procgen Arcana](https://watabou.github.io/) ([город](https://watabou.itch.io/medieval-fantasy-city-generator), код города — [TownGeneratorOS](https://github.com/watabou/TownGeneratorOS)) | генераторы державы, города, района, деревни, пещеры, подземелья, жилища, особняка | карты: «You can use maps created by the generator as you like: copy, modify, include in your commercial rpg adventures etc. Attribution is appreciated, but not required» (страница itch.io); код города — GPL-3.0 | **берём** сгенерированные карты — вход конвертера карт П12; код — **смотрим** (GPL) |
| [LoreKeeper — генераторы](https://www.lorekeeper.com/generator) (LoreKeeper Ltd) | NPC, монстры, таверны, подземелья, боевые карты — генерация ИИ | © LoreKeeper Ltd, условия на /terms не прочитаны | **смотрим** |
| [D&D Compendium — генераторы](https://www.dnd-compendium.com/dm-resources/generators) | фанатский сборник таблиц (Google Sites) | фанатский, без лицензии; заявление о непричастности WotC | **смотрим** |
| [Kassoon — генераторы](https://www.kassoon.com/dnd/generators) | генераторы мастера | условия не прочитаны: страница за защитой Cloudflare (30.10) | **смотрим** до проверки |
| [Tetra-cube — генератор персонажа 5e](https://tetra-cube.com/dnd/dnd-char-gen.html) | случайный персонаж 5e | лицензии на странице нет | **смотрим** |
| [Dungeon Church — Software Stack](https://www.dungeon.church/dungeon-church-software-stack/) | разбор связки инструментов живой группы: Foundry, боты Discord, вики, рассылка | блог, © Dungeon Church | **смотрим** — идеи для моста к столу и соло-режима |
| [Aurora Builder](https://aurorabuilder.com/) | конструктор персонажа 5e: SRD под OGL в комплекте, расширяется файлами | «© 2026 Bas Driessen. All Rights Reserved» | **смотрим**; формат его файлов персонажа — кандидат входа импорта П6; «дополнительный контент» сообщества не берём |

## 7. Графика

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| Elderberry Inn Icons (Open5e) | иконки | CC0 | **нет** — иконки только из генератора (`CLAUDE.md`) |
| Pinterest владельца — доска [card-game-design](https://ru.pinterest.com/serzpobedinski/card-game-design/) | референсы дизайна игровых карточек — для карточек кокпита (сущность, заклинание, предмет, монстр) | картинки чужие, у каждой свой автор | **смотрим** — вёрстку и приёмы описываем словами в `DESIGN.md` и рисуем сами; картинки в репозиторий не кладём (29.10) |
| Pinterest владельца — [профиль](https://ru.pinterest.com/serzpobedinski/), доска [dnd](https://ru.pinterest.com/serzpobedinski/dnd/) и другие доски с «DND» в названии | вдохновение по миру и игре | то же | **смотрим** (29.10). Без входа Pinterest отдаёт пустую страницу, поэтому доски не прочитаны: смотреть их вживую или по скриншотам |

## 8. Не используем

- Нелицензионные копии книг и модулей: DnD-Books на GitHub, зеркало gowen.net / `s3…/mydnd`, 5e.tools, anyflip, Scribd, Pinterest как источник страниц книг (доски владельца с референсами — в разделе 7).
- PDF книг в загрузках (Manual of the Planes, Faiths and Pantheons и др.) — не открываем; факты по ним — только через вики.
- Сканы официальных постеров (theplanardm.com) и агрегаторы картинок без авторства.
