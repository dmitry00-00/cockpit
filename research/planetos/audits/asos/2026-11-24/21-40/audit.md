# ASOS 21–40: candidate-аудит

Checkout: /Users/dmitrij/.codex/worktrees/d10-downtime-integration/cockpit
Пакет Planetos: версия 2026.11.24.38, 60 manifest layers.
Диапазон сверялся по register и numeric chapter pages AWOIAF 21–40.

## Объём и границы

- CSV: 330 chapter-level записей: 279 person rows, 23 scene-place rows, 19 событий/сообщений/планов и 9 выбранных групп, домов и alias rows.
- Полный secondary-index appearing cast включён для всех 20 глав диапазона. Для мест взяты только Place в шапке главы как scene candidates; длинные списки Places из Mentions не выданы за сцены.
- Peripheral character mentions и весь перечень домов/организаций/ссылочных мест оставлены вне этого первого прохода; это не полный denominator главы.
- Отдельного нормализованного dream ledger в AWOIAF страницах диапазона нет. Отмечены сообщение о снах Ghost of High Heart (гл. 22) и неоднозначно dreamlike появление Quaithe (гл. 27); иных dream-place связей не утверждаю.
- Для событий отличены текущие события, пересказанное прошлое, references и планы. Даты по порядку глав не выводились; календарные даты здесь не назначены.
- Все записи помечены secondary-indexed-partial; первичная сверка по выбранному изданию романа pending. Синопсис AWOIAF — только вторичный указатель, не основание заявлять больше его текста.
- matched_ref означает, что карточка есть в .38; ASOS chapter ledger в checkout пока отсутствует, значит chapter relation отдельно не зафиксирована.
- Содержание романа не цитировалось; краткие русские формулировки — рабочие перефразы.

## Решения по CSV

- existing-card-no-asos-ledger: 151
- missing-card-candidate: 141
- alias-to-existing-card: 16
- alias-to-missing-card: 1
- ambiguous-review: 21

## Alias и ambiguity

- Brienne Tarth → существующая Brienne of Tarth; Arryk и Erryk → карточки Cargyll; Arstan Whitebeard → Barristan Selmy; the Goat → Vargo Hoat; the Hound → Sandor Clegane.
- Styr отсутствует в .38; the Magnar обработан как титул-кандидат для person:styr, а не как отдельное лицо.
- Brave Companions / Bloody Mummers, вероятно, альтернативные названия одной компании; слияние оставлено неоднозначным до проверки.
- Ghost of High Heart — отдельная провидица, не direwolf Ghost. The Liddle не сливается с Torren Liddle. Mad Huntsman остаётся неподтверждённым прозвищем/титулом.
- Grazdan descriptors не объединены с Grazdan mo Ullhor. Младенец Gilly, её мать и wives Craster — неназванные роли/группа; без первичного текста не создавать именные карточки.
- small sept, cave near Greyguard и septry in the Riverlands требуют уточнения конкретной локации.

## Приоритетные missing-card кандидаты

Для ведущего особенно полезны новые повторяющиеся/сюжетные участники: Ghost of High Heart, Lymond Lychester, Ravella Smallwood, Kraznys mo Nakloz, Jarl, Styr, участники мятежа у Craster, Symon Silver Tongue, Lothar Frey, Walder Rivers и придворные Дорна вокруг Oberyn. Из scene places в .38 отсутствуют Maidenpool, Duskendale road, High Heart, Acorn Hall, cave near Greyguard, Greyguard, Stoney Sept, hollow hill и Queenscrown; часть ярлыков требует идентификационной проверки.

P1 event candidates: пленение Jaime/Brienne и гибель Cleos; свадьба Tyrion/Sansa; переход свободного народа через Стену и гибель Jarl; Mutiny at Craster’s Keep; trial by combat Sandor/Beric; похороны Hoster Tully; назначение Davos Десницей; убийство Aerys в рассказе Jaime; Battle at the Burning Septry. Sack/Fall of Astapor и Sack of Winterfell сопоставлены с близкими существующими карточками, но locator relation ещё не внесён.

## Артефакты

- candidates.csv: chapter, exact numeric URL, title, role, candidate ref/match, decision, priority, alias/ambiguity and Russian paraphrase.
- Файлы проекта не менялись.

### CSV role counts

- alias-cluster: 7
- appearance-dream-ambiguous: 1
- appearing: 272
- appearing group: 3
- appearing/mentioned group: 1
- appearing/referenced house: 1
- historical-reference: 1
- historical-reference group: 1
- occurred-per-synopsis: 9
- plan: 1
- referenced: 2
- referenced house: 2
- reported: 1
- reported-current-war: 1
- reported-dream: 1
- reported-historical: 3
- scene: 23
