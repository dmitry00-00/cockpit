# Смысловой словарь изображений
01.11.2026. Решение владельца после просмотра живописного этюда. Художественное направление принято; корректируется соответствие предметов понятиям. БА21 завершена 01.11.2026 для этюда/реестра; в основной продукт роли переносятся через БА26.

| Понятие | Адрес/контекст | Образ | Статус |
|---|---|---|---|
| Следопыт | `class:sledopyt` | Лук со стрелами, листья допустимы как часть классовой эмблемы | Соответствие подтверждено владельцем |
| Скрытность | `skill:stealth` | Плащ или капюшон | Капюшон/плащ создан и проверен в этюде |
| Скорость / перемещение | Показатель скорости, действие движения | Сапог | Переиспользовать существующий рисунок сапога в этой роли |
| Поиск следов | `skill:survival`, контекст отслеживания | Отпечаток на земле/цепочка следов | Отдельные отпечатки созданы и проверены в этюде |
| Внимательность | `skill:perception` | Бронзовый талисман-глаз | Сохраняется из нового этюда |
| Конкретный длинный лук | `item:longbow` | Изображение предмета | Отдельный ассет вещи; классовая эмблема не подменяет инвентарь |

## Применение
Один готовый знак имеет основной смысл. Его можно повторять в разных представлениях того же понятия; нельзя тем же изображением обозначать класс, навык и команду так, что подпись становится единственным способом их различить. Общий предмет в разных композициях допустим: классовая эмблема и рисунок конкретного оружия — разные ассеты и роли.

Класс, навык, состояние, предмет и служебная команда имеют разные роли реестра. Подпись и tooltip сохраняются. «Следы» в компактной карточке — поясняющий контекст Выживания, в справочнике/броске используется полное имя навыка.

До генерации новой партии заполнить соответствия: понятие → entityRef/контекст → образ → роль ассета → подпись → рабочий размер. Проверять похожие пары рядом: плащ/броня, сапог/след, классовый лук/оружие, глаз/скрытость сведений, концентрация/недоступность действия.

## Действующие файлы и совместимость
- ranger-sign остаётся классу. В кнопке «Следы» используется survival-tracks-v1.
- stealth-cloak-v1 — Скрытность. Файл сапога имеет новый смысловой id movement-boot-v1 и используется у скорости 25 фт.
- Старое имя stealth-sign сохранено как alias на movement-boot-v1. PNG и прежние WebP не удалены; новые пути сапога имеют те же байты. История исходного запроса сохранена.
- perception-sign — Внимательность.

В manifest.json хранится roles → assetId → вариант файла/alt. HTML и сравнительная таблица читают этот реестр. Пять понятий проверены рядом при 32/48/64px; снимки preview-desktop-ba21.png и preview-semantics-v2.png. Это проверка этюда, не всех продуктовых компонентов.

## Core61: полный продуктовый словарь (17.11.2026)

Ниже зафиксированы все 61 семантических адреса и их явные `assetId`: 13 классов, 18 навыков, 6 характеристик, 8 школ, 15 условий SRD и отдельное правило концентрации. Это сверка с рабочими картами рендера и `public/art/manifest.json`, а не попытка вывести назначение по сходству названий. Рендер использует точные ID в `src/art/ClassEmblem.tsx`, `src/art/RuleMark.tsx` и `src/art/semanticBindings.ts`; шесть ранее созданных знаков включены в этот счёт один раз.

### Класс (13)

| Смысловой адрес | Подпись реестра | `assetId` |
|---|---|---|
| `class:voin` | Класс: Воин | `kimi-class-fighter-v1` |
| `class:paladin` | Класс: Паладин | `kimi-class-paladin-v1` |
| `class:varvar` | Класс: Варвар | `kimi-class-barbarian-v1` |
| `class:monah` | Класс: Монах | `kimi-class-monk-v1` |
| `class:plut` | Класс: Плут | `kimi-class-rogue-v1` |
| `class:sledopyt` | Класс: Следопыт | `kimi-class-ranger-v1` |
| `class:izobretatel` | Класс: Изобретатель | `kimi-class-artificer-v1` |
| `class:bard` | Класс: Бард | `kimi-class-bard-v1` |
| `class:koldun` | Класс: Колдун | `kimi-class-warlock-v1` |
| `class:carodey` | Класс: Чародей | `kimi-class-sorcerer-v1` |
| `class:volsebnik` | Класс: Волшебник | `kimi-class-wizard-v1` |
| `class:druid` | Класс: Друид | `kimi-class-druid-v1` |
| `class:jrec` | Класс: Жрец | `kimi-class-cleric-v1` |

### Характеристика (6)

| Смысловой адрес | Подпись реестра | `assetId` |
|---|---|---|
| `ability:str` | Сила | `kimi-core-ability-strength-v1` |
| `ability:dex` | Ловкость | `kimi-core-ability-dexterity-v1` |
| `ability:con` | Телосложение | `kimi-core-ability-constitution-v1` |
| `ability:int` | Интеллект | `kimi-core-ability-intelligence-v1` |
| `ability:wis` | Мудрость | `kimi-core-ability-wisdom-v1` |
| `ability:cha` | Харизма | `kimi-core-ability-charisma-v1` |

### Навык (18)

| Смысловой адрес | Подпись реестра | `assetId` |
|---|---|---|
| `skill:acrobatics` | Акробатика | `kimi-core-skill-acrobatics-v1` |
| `skill:animal-handling` | Уход за животными | `kimi-core-skill-animal-handling-v1` |
| `skill:arcana` | Магия | `kimi-core-sign-magic` |
| `skill:athletics` | Атлетика | `kimi-core-sign-athletics` |
| `skill:deception` | Обман | `kimi-core-skill-deception-v1` |
| `skill:history` | История | `kimi-core-skill-history-v1` |
| `skill:insight` | Проницательность | `kimi-core-skill-insight-v1` |
| `skill:intimidation` | Запугивание | `kimi-core-skill-intimidation-v1` |
| `skill:investigation` | Расследование | `kimi-core-skill-investigation-v1` |
| `skill:medicine` | Медицина | `kimi-core-sign-medicine` |
| `skill:nature` | Природа | `kimi-core-skill-nature-v1` |
| `skill:perception` | Внимательность | `kimi-core-skill-perception-v1` |
| `skill:performance` | Выступление | `kimi-core-skill-performance-v1` |
| `skill:persuasion` | Убеждение | `kimi-core-skill-persuasion-v1` |
| `skill:religion` | Религия | `kimi-core-skill-religion-v1` |
| `skill:sleight-of-hand` | Ловкость рук | `kimi-core-skill-sleight-of-hand-v1` |
| `skill:stealth` | Скрытность: компактный капюшон и верх плаща | `kimi-core-icon-stealth-hood` |
| `skill:survival` | Выживание/следы | `kimi-core-skill-survival-v1` |

### Школа заклинаний (8)

| Смысловой адрес | Подпись реестра | `assetId` |
|---|---|---|
| `spell-school:abjuration` | Ограждение | `kimi-core-school-abjuration-v1` |
| `spell-school:conjuration` | Вызов | `kimi-core-school-conjuration-v1` |
| `spell-school:divination` | Прорицание | `kimi-core-school-divination-v1` |
| `spell-school:enchantment` | Очарование | `kimi-core-school-enchantment-v1` |
| `spell-school:evocation` | Воплощение | `kimi-core-school-evocation-v1` |
| `spell-school:illusion` | Иллюзия | `kimi-core-school-illusion-v1` |
| `spell-school:necromancy` | Некромантия | `kimi-core-school-necromancy-v1` |
| `spell-school:transmutation` | Преобразование | `kimi-core-school-transmutation-v1` |

### Состояние (15)

| Смысловой адрес | Подпись реестра | `assetId` |
|---|---|---|
| `condition:blinded` | Ослеплён | `kimi-core-condition-blinded-v1` |
| `condition:charmed` | Очарован | `kimi-core-condition-charmed-v1` |
| `condition:deafened` | Оглохший | `kimi-core-condition-deafened-v1` |
| `condition:exhaustion` | Истощение | `kimi-core-condition-exhaustion-v1` |
| `condition:frightened` | Испуган | `kimi-core-condition-frightened-v1` |
| `condition:grappled` | Захвачен | `kimi-core-condition-grappled-v1` |
| `condition:incapacitated` | Недееспособен | `kimi-core-condition-incapacitated-v1` |
| `condition:invisible` | Невидим | `kimi-core-condition-invisible-v1` |
| `condition:paralyzed` | Парализован | `kimi-core-condition-paralyzed-v1` |
| `condition:petrified` | Окаменевший | `kimi-core-condition-petrified-v1` |
| `condition:poisoned` | Отравлён | `kimi-core-sign-poisoned` |
| `condition:prone` | Лежащий | `kimi-core-condition-prone-v1` |
| `condition:restrained` | Опутан | `kimi-core-condition-restrained-v1` |
| `condition:stunned` | Оглушён | `kimi-core-condition-stunned-v1` |
| `condition:unconscious` | Без сознания | `kimi-core-condition-unconscious-v1` |

### Правило (1)

| Смысловой адрес | Подпись реестра | `assetId` |
|---|---|---|
| `rule:concentration` | Концентрация | `kimi-core-sign-concentration` |

### Границы приёмки

- У всех 61 ID есть запись продукта, мастер в `design/art/kimi-production-v1/` и производные WebP 48/96/192 px. Старые пиксельные маски не считаются в этом комплекте.
- В таблице `Магия` соответствует SRD-навыку `skill:arcana`; `rule:concentration` — отдельное правило каталога, а не шестнадцатое условие SRD.
- Семантические подписи, имена и tooltips остаются основным носителем смысла; миниатюра не заменяет текст. Числовые правила не меняются. Художественное `productionReady` не выводится из наличия связи или производных: оно хранится отдельно в манифесте.

## БА25: расширенные семейства (17.11.2026)

Таблица фиксирует роли, уже подключённые к рендеру, и незакрытые места без устойчивого typed ID. Привязки влияют только на рисунок и сохраняют текстовые подписи/пиктограммы-резерв.

### Интерфейс персонажа: виды особенностей и слоты

| Семейство | Покрытие | `assetId` / способ связи |
|---|---:|---|
| Виды особенностей | 13/13 | `codex-kind-claw-v1`, `codex-kind-resist-v1`, `codex-kind-save-v1`, `codex-kind-proficiency-v1`, `codex-kind-tool-v1`, `codex-kind-vision-v1`, `codex-kind-sense-v1`, `codex-kind-size-v1`, `codex-kind-bonus-v1`, `codex-kind-rest-v1`, `codex-kind-aura-v1`, `codex-kind-shape-v1`, `codex-kind-other-v1` |
| Слоты экипировки | 9/9 | Голова, плащ, кисти, кольцо, пояс и обувь — `codex-slot-*`; шея — `kimi-item-item-holy-symbol-generic-v1`; доспех — `kimi-item-item-chainmail-v1`; оружие — `kimi-item-item-shortsword-v1` |

Три повторных использования совпадают с ролью слота по аудиту `research/coordination/extended-art-reuse.md`. Подпись и состояние заполнения ячейки остаются рядом с рисунком; правила экипировки не меняются.

### Время и погода

| Роль | Покрытие | ID |
|---|---:|---|
| Фазы суток | 4/4 | `codex-sky-dawn-v1`, `codex-sky-day-v1`, `codex-sky-dusk-v1`, `codex-sky-night-v1` |
| Погода | 4/4 | `codex-sky-clear-v1`, `codex-sky-cloudy-v1`, `codex-sky-rain-v1`, `codex-sky-storm-v1` |
| Фазы Selûne | 4/4 | `codex-moon-new-v1`, `codex-moon-waxing-v1`, `codex-moon-full-v1`, `codex-moon-waning-v1` |

Рендеры: полоса суток, часы/погода и календарь. Это 12 связей, уже отображаемых на рабочих поверхностях.

### Места

| Тип источника справочника | Роль рисунка | `assetId` |
|---|---|---|
| `City`, `Town` | Городская застройка | `codex-place-city-v1` |
| `Village` | Деревня | `codex-place-village-v1` |
| `Fortification`, `fortress` | Крепость | `codex-place-fortress-v1` |
| `Temple`, `temple` | Храм | `codex-place-temple-v1` |
| `Inn` | Таверна / постоялый двор | `codex-place-tavern-v1` |
| `Ruins`, `ruins` | Руины | `codex-place-ruins-v1` |
| `Cave` | Пещера | `codex-place-cave-v1` |
| `Mine`, `mine` | Шахта | `codex-place-mine-v1` |

Подписи `kind` берутся из карточки Toril GIS/справочника. Изображение появляется в поиске и карточке места мастера; у привязанного кампанийного пина — только при точном `place:<id>` и только в виде мастера. Масштаб, имя и похожие слова не используются для догадки; тип игрока не расширяется через metadata/DOM. Четыре других рисунка серии (`tower`, `dungeon`, `bridge`, `harbour`) остаются в реестре без продуктового типа: соответствующих typed-классов в текущей выборке нет.

### Предметы

| Точный ID предмета | `assetId` |
|---|---|
| `chain-mail` | `kimi-item-item-chainmail-v1` |
| `dagger` | `kimi-item-item-dagger-v1` |
| `amulet` | `kimi-item-item-holy-symbol-generic-v1` |
| `longbow` | `kimi-item-item-longbow-v1` |
| `rations-1-day` | `kimi-item-item-rations-v1` |
| `rope-hempen-50-feet` | `kimi-item-item-rope-v1` |
| `shield` | `kimi-item-item-shield-v1` |
| `shortsword` | `kimi-item-item-shortsword-v1` |
| `spellbook` | `kimi-item-item-spellbook-v1` |
| `warhammer` | `kimi-item-item-warhammer-v1` |
| `potion-of-healing` | `kimi-item-item-healing-potion` |
| `lantern-hooded` | `kimi-item-item-lantern` |
| `waterskin` | `codex-travel-waterskin-v1` |

Эти 13 точных ссылок рендерятся в инвентаре. Семь других дорожных рисунков (`wagon`, `mount`, `boat`, `tent`, `campfire`, `firewood`, `shelter`) не соединены с каталогом правил без подходящего ID. Семейство предметов пока не достигло планового диапазона 20–30 точных продуктовых связей.

### Незакрытые маркеры

Шесть `codex-pin-*` (задание, опасность, торговля, слух, лагерь, дорога) пока не привязаны к пинам карты: у `MapPinItem` нет отдельного typed-поля назначения, а `facts`, встречи и тип сущности не равнозначны этим ролям. Требуется модель/редактор таких маркеров; не подменять их по тексту имени или типу сущности.

