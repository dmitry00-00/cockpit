# Реестр ресурсов — где смотреть и что можно брать

Собран 27.10.2026 по поискам этой недели. Новый источник сначала попадает сюда с решением, потом в код или данные.

**Решения**

- **берём** — открытая лицензия, можно класть в продукт с указанием авторства (и с той же лицензией, если она SA).
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
| Tome of Beasts 1–3, Creature Codex, Deep Magic, Vault of Magic, Tome of Heroes, Warlock Zine (Kobold); Tal'Dorei CS (Green Ronin) | ≈1500 монстров, 579 заклинаний, 1063 магических предмета, 40 рас, 76 классов и подклассов | OGL 1.0a | **берём** при нужде: текст OGL и раздел 15, без Product Identity (лор Midgard) |
| [oldmanumby/dnd.srd.5.1](https://github.com/oldmanumby/dnd.srd.5.1) | SRD 5.1 в Markdown | CC BY 4.0 (сам SRD) | **берём** для сверки |
| [grimpress — лицензия SRD](https://grimpress.net/5e-srd-license/) | разбор условий CC BY для SRD | — | **смотрим** |
| [D&D Wiki](https://www.dandwiki.com) | хоумбрю всех видов | GNU FDL (проверить) | **смотрим**; брать — после проверки лицензии |
| Homebrewery, GM Binder, r/UnearthedArcana, r/DnDHomebrew | хоумбрю | у авторов | **смотрим** |
| DMs Guild, DriveThruRPG, itch.io | платное и бесплатное сообщества | у каждой работы своя; часть — CC | **смотрим**, бесплатное с CC — **берём** по одному |
| [AideDD](https://www.aidedd.org) (правила, фильтры монстров) | справочник 5e | у автора | **факты** (пары «имя — класс») |
| [dnd.su](https://dnd.su), [ttg.club](https://ttg.club) | русские переводы и хоумбрю | не проверены; официальные переводы — права WotC | **смотрим** |
| [Kreozot/dnd5e-spells](https://github.com/Kreozot/dnd5e-spells) | список заклинаний с русскими названиями | код 0BSD, происхождение русских названий не указано | **смотрим** — кандидат для вопроса о русских названиях заклинаний |
| D&D Beyond, книги WotC | всё официальное | © WotC | **купить** |

## 2. Мир Forgotten Realms — тексты и факты

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| [Forgotten Realms Wiki](https://forgottenrealms.fandom.com), дамп с S3 (`wikia_xml_dumps`) | ≈10 800 статей о местах, планах и небесных телах; божества, организации | CC BY-SA 3.0 | **берём** — в работе: `scripts/wiki-extract.py`, `scripts/world-registry.py`, карточки L3 |
| [geospatial-grimoire/forgotten-realms-wiki-parser](https://github.com/geospatial-grimoire/forgotten-realms-wiki-parser) | парсер того же дампа в Markdown | MIT | **смотрим** (свой парсер есть) |
| [Obsidian TTRPG Atlas](https://github.com/ObsidianTTRPGProject/Obsidian-TTRPG-Atlas) | скрипты: вики → Markdown | GPL-3.0 | **смотрим** |
| `DND.7z` от владельца (28.10, `~/Downloads/`; для проверки состава распаковывались только заметки — после решения удалены) | хранилище Obsidian по-русски: ~6000 заметок лора (≈4200 — пустые заготовки), 764 записи справочника (классы, расы, монстры, снаряжение), 476 картинок на 1,1 ГБ (183 карты, портреты, божества); среди текстов — переводы глав книг (например, храмы из Faiths & Pantheons) | не указана, переводы книг WotC | **стол** — решение владельца 28.10: хранилище для его собственного стола в Obsidian; кокпит его не использует, в продукт и репозиторий не идёт |
| [Spelljammer Wiki](https://spelljammer.fandom.com) | тела Realmspace и других сфер | CC BY-SA | **берём** факты для схемы орбит |
| [realmshelps.net — Cosmology of Toril](https://www.realmshelps.net/faerun/planes/index.shtml) | пересказ космологии FRCS 2001: дерево планов, ~30 планов, пути между ними | без лицензии, текст близок к книге | **факты** (устройство и список планов) |
| [Raduziel/Deities-Of-Faerun](https://github.com/Raduziel/Deities-Of-Faerun) | божества Фаэруна | без лицензии | **факты** |
| [Cantilux/faerun-date](https://github.com/Cantilux/faerun-date) | перевод дат в календарь Харптоса | MIT | **берём** при нужде (календарь в кокпите свой) |
| [gibberlings3 dw_talents](https://gibberlings3.github.io/Documentation/readmes/readme-dw_talents.html), [2d4chan](https://2d4chan.org/wiki/Forgotten_Realms), [Living Forgotten Realms](https://www.livingforgottenrealms.com/), [alphastream](https://alphastream.org/index.php/resources/) | справочные статьи, моды, организованная игра | у авторов | **смотрим** |
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
| Dyson Logos | карты подземелий и зданий | часть — бесплатно с авторством, в т.ч. коммерчески | **берём** по одной, проверяя условия |

## 7. Графика

| Источник | Что | Лицензия | Решение |
|---|---|---|---|
| Elderberry Inn Icons (Open5e) | иконки | CC0 | **нет** — иконки только из генератора (`CLAUDE.md`) |

## 8. Не используем

- Нелицензионные копии книг и модулей: DnD-Books на GitHub, зеркало gowen.net / `s3…/mydnd`, 5e.tools, anyflip, Scribd, Pinterest.
- PDF книг в загрузках (Manual of the Planes, Faiths and Pantheons и др.) — не открываем; факты по ним — только через вики.
- Сканы официальных постеров (theplanardm.com) и агрегаторы картинок без авторства.
