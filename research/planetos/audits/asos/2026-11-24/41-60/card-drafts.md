# ASOS 41–60: draft cards for P1 places and groups

Compared with Planetos package `2026.11.24.38` (898 unique refs). The 13 included stable refs are absent from the package. These are read-only drafts; no project files were changed. Each card has a singular `source`, a `locators` array, and `verification.primaryBook=pending`.

AWOIAF numeric chapter indexes are secondary sources. Each entry is `secondary-indexed-partial`; primary-edition and Russian-translation verification remains pending. Russian names below are working forms. Attribution: A Wiki of Ice and Fire chapter-index contributors, CC BY-SA 3.0; summaries are original concise paraphrases.

## Places

- **Queenscrown** (`place:queenscrown`; P1) — Место главы, где Джон находится среди людей Стайра и пытается вырваться, чтобы предупредить Чёрный замок. Locator: A Storm of Swords · Jon V (Chapter 41). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_41).
- **High Heart** (`place:high-heart`; P1) — Место встречи Арьи и Братства без знамён с Призраком Высокого Сердца; в этой сцене она рассказывает свои сны. Locator: A Storm of Swords · Arya VIII (Chapter 43). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_43).
- **Oldstones** (`place:oldstones`; P1) — Остановка на пути к Близнецам и место разговора Робба с Кейтлин о наследнике. Locator: A Storm of Swords · Catelyn V (Chapter 45). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_45).
- **Hag's Mire** (`place:hags-mire`; P1) — Место, где к отряду Робба присоединяется Джейсон Маллистер. Locator: A Storm of Swords · Catelyn V (Chapter 45). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_45).
- **Lord Harroway's Town** (`place:lord-harroways-town`; P1) — Затопленный город, через который Арья и Сандор пытаются найти переправу через Трезубец. Locator: A Storm of Swords · Arya IX (Chapter 47). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_47).
- **Nightfort** (`place:nightfort`; P1) — Заброшенная крепость у Стены, где пути Брана и Сэма пересекаются. Locator: A Storm of Swords · Bran IV (Chapter 56). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_56).
- **Black Gate** (`place:black-gate`; P1) — Древний проход под Стеной через Ночной Форт; Сэм открывает его, произнося клятву Ночного дозора. Locator: A Storm of Swords · Bran IV (Chapter 56). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_56).

## Organizations

- **Stormcrows** (`organization:stormcrows`; P1) — Наёмная компания, чьи капитаны ведут переговоры с Дейенерис; позднее Дарио объявляет о переходе своей роты на её сторону. Locator: A Storm of Swords · Daenerys IV (Chapter 42). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_42).
- **Second Sons** (`organization:second-sons`; P1) — Наёмная компания, капитан которой ведёт переговоры с Дейенерис перед ночным нападением на Юнкай. Locator: A Storm of Swords · Daenerys IV (Chapter 42). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_42).
- **Unsullied** (`organization:unsullied`; P1) — Военная сила Дейенерис, прибывающая вместе с ней к Юнкаю. Locator: A Storm of Swords · Daenerys IV (Chapter 42). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_42).
- **Brotherhood without Banners** (`organization:brotherhood-without-banners`; P1) — Группа, сопровождающая Арью к Высокому Сердцу. Locator: A Storm of Swords · Arya VIII (Chapter 43). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_43).
- **Brave Companions** (`organization:brave-companions`; P1) — Отряд под командованием Ворго Хоута, которому Руз Болтон оставляет Харренхолл. Locator: A Storm of Swords · Jaime VI (Chapter 44). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_44).
- **Thenns** (`organization:thenns`; P1) — Отряд Стайра, атаковавший Чёрный замок. Locator: A Storm of Swords · Jon VII (Chapter 55). [AWOIAF chapter](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_55).

## Excluded or alias references

- `place:goodbrook`: P2 scene-context in the audit; whether the ruined village is a separate stable place needs primary-text review.
- `place:flea-bottom`: P2 mentioned sublocation; outside the requested P1 draft set.
- `place:village-near-harrenhal`: Unnamed village descriptor in the chapter index; no stable proper-name entity proposed.
- `organization:bloody-mummers` → `organization:brave-companions`: Keep one organization card under Brave Companions; do not create a second card for the alternate group label.
- `person:jarmen-buckwell`: CSV records Jarman/Jarmen spelling variation; existing package card is outside this places/groups draft set.
- `event:battle-near-yunkai`: Existing event card; chapter locator review is separate from this places/groups draft set.

## Checks

- Drafted 7 places and 6 organizations; all 13 refs were checked against the package manifest layers and are absent from snapshot `2026.11.24.38`.
- The Brave Companions / Bloody Mummers naming is represented by one canonical group candidate; no separate alias card is created.
- No absolute dates, coordinates, or claims beyond the cited chapter indexes were added.
