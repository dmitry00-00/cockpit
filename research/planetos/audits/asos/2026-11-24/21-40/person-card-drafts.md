# ASOS 21–40: P1 черновики отсутствующих персонажей

## Объём и ограничения

Отбор выполнен по локальному `candidates.csv` и сверке `global-reconciliation.csv`: только человеческие P1 с `missing-card-candidate`, отсутствующие в .38, без зафиксированного identity/alias ambiguity. Повторные строки сведены по ref; алиасы, существующие карточки, unresolved-типы и записи с `ambiguous-review` исключены.

AWOIAF — вторичный указатель; выбранное издание романа не проверялось. Описания намеренно говорят только о наличии имени в chapter-level `Appearing` list. У карточек статус `secondary-indexed-partial`, лицензия CC BY-SA 3.0, `primaryBook: pending`. В проекте ничего не менялось.

В диапазоне было 18 строк P1 `missing-card-candidate` → 13 уникальных refs. Четыре refs уже есть в provisional set для 0–20, поэтому здесь не дублируются: подготовлено **9 новых карточек**, а для прежних черновиков перечислено **6 локаторов на перенос**.

## Новые карточки

| ID | Имя | Локаторы | Global reconciliation |
|---|---|---|---|
| `person:lymond-lychester` | Lymond Lychester | [Arya IV (ch. 22)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_22) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |
| `person:ravella-smallwood` | Ravella Smallwood | [Arya IV (ch. 22)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_22) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |
| `person:kraznys-mo-nakloz` | Kraznys mo Nakloz | [Daenerys II (ch. 23)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_23); [Daenerys III (ch. 27)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_27) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |
| `person:alester-florent` | Alester Florent | [Davos III (ch. 25)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_25); [Davos IV (ch. 36)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_36) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |
| `person:symon-silver-tongue` | Symon Silver Tongue | [Tyrion IV (ch. 32)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_32) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |
| `person:clubfoot-karl` | Clubfoot Karl | [Samwell II (ch. 33)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_33) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |
| `person:edric-dayne` | Edric Dayne | [Arya VI (ch. 34)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_34); [Arya VII (ch. 39)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_39) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |
| `person:lothar-frey` | Lame Lothar Frey | [Catelyn IV (ch. 35)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_35) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |
| `person:walder-rivers` | Walder Rivers | [Catelyn IV (ch. 35)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_35) | `no-matching-card-in-.38`; human denominator yes; P1; no explicit ambiguity flagged |

## Локаторы для уже существующих черновиков 0–20

Эти refs уже имеют provisional person cards в `person-card-drafts.json` диапазона 0–20. Дополнить их локаторами ниже, не создавать вторые карточки:

| Ref | Локаторы для добавления |
|---|---|
| `person:jarl` | [Jon III (ch. 26)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_26); [Jon IV (ch. 30)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_30) |
| `person:styr` | [Jon III (ch. 26)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_26); [Jon IV (ch. 30)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_30) |
| `person:dirk` | [Samwell II (ch. 33)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_33) |
| `person:ollo-lophand` | [Samwell II (ch. 33)](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_33) |

## Ручная проверка

- У всех новых карточек первичная сверка ожидается; ничего сверх локаторов `Appearing` не выведено.
- `Lothar Frey`: global reconciliation собирает формы `Lothar Frey` и `Lame Lothar Frey`; первичную форму имени сверить до финального отображения.
- `Symon Silver Tongue`: глобальный ref устойчив, но в синопсисе AWOIAF используется написание `Symon Silvertongue`; проверить отображаемое имя по первичному изданию.
- `Styr` не дублируется; строка `the Magnar` — alias/title к `person:styr`, отдельную сущность не создавал.
- Global reconciliation подтверждает, что четыре carry-forward refs уже имеются в черновике 0–20; эти locators относятся только к 21–40.

## Файлы

- JSON: `/private/tmp/planetos-asos-people-21-40-2026-11-24/person-card-drafts.json`
- Источник диапазона: `/private/tmp/planetos-asos-range-21-40-2026-11-24/candidates.csv`
- Global reconciliation: `/private/tmp/planetos-asos-global-reconciliation-2026-11-24/global-reconciliation.csv`
