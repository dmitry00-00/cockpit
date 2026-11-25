# ACOK candidate denominator, главы 0–69

## Scope and source limits

Read-only reconciliation of the three range audits (`acok-range-0-22`, `23-45`, `46-69`), the 70-row `research/planetos/acok-chapter-coverage.csv`, the resolved `acok-candidate-triage-2026-11-24.csv`, and Planetos package in this checkout:

`/Users/dmitrij/.codex/worktrees/d10-downtime-integration/cockpit`

Первый прочитанный срез пакета был `2026.11.24.37` (57 слоёв, 837 карточек; 1,056 связей и 369 уникальных refs). Общий checkout позднее обновился до `.38` (60 слоёв, 898 карточек). Итоговая сверка выполнена по `.38` и обновлённому ledger: 70 глав, 1,059 связей, 370 уникальных refs; все refs разрешаются в карточки. `person:rattleshirt` присутствует в `.38`.

Знаменатель — сверка отобранных chapter-index кандидатов. AWOIAF является вторичным указателем; его списки глав и синопсисы не исчерпывающие. Полный текст романа и выбранное издание не проверялись. Проценты полноты не вычислялись.

## Итоговые количества

Ledger содержит 1,059 контекстных связей: 716 человек/животных/фигур сна, 186 мест, 65 групп и 92 события. Это 370 уникальных refs до канонизации: 208 person refs, 72 place refs, 19 organization refs и 71 event ref. После схлопывания Reek/Ramsay остаётся 369 канонических сущностей.

| Тип | Количество | Примечание |
|---|---:|---|
| Люди с появлением или обычным упоминанием | 195 | Reek и Ramsay считаются одной личностью после раскрытия в ch66; ранние контексты сохраняют «Reek». Включён Rattleshirt. |
| Животные-персонажи | 4 | Ghost, Nymeria, Shaggydog и Summer; считаются отдельно от людей. |
| Именованные фигуры, присутствующие в книге только во сне | 8 | Не считаются физическими появлениями/упоминаниями. |
| Физические места сцены или отсылки | 72 | Включают три описательных ID безымянных мест, не канонические собственные имена. |
| Устойчивые группы | 19 | Атрибуция The Thirteen of Qarth в ch48 остаётся неоднозначной. |
| События с классифицированным состоянием | 65 | 46 произошли, 14 сообщаются, 5 являются планами/поручениями. |
| События-сны | 3 | Отделены от произошедших событий. |
| События, оставшиеся только контекстной отсылкой | 3 | Battle of the Green Fork, казнь Эддарда, пленение Джейме Роббом. Их статус для конкретной главы не уточнён. |

В 18 контекстах event refs стоят как reference-only; пять из этих refs имеют лучше классифицированный контекст в другой главе, три остаются только отсылками. Ложное сообщение о смерти Брана и Рикона не превращено в событие их смерти. Сообщения остаются сообщениями, а планы — планами.

`candidate-reconciliation.csv` содержит 1,083 строки: 1,059 текущих ledger links, 10 контекстов из triage без совпадающей записи в главе и 14 строк альтернативных/устаревших refs. `count-summary.csv` агрегирует количества по типам связей, статусам событий и решениям по кандидатам.

## Дедупликация и отдельные категории

- `person:reek` и `person:ramsay-snow` сведены к одной личности для знаменателя; контексты до раскрытия в ch66 оставлены под именем «Reek».
- Альтернативные refs сведены к существующим: `event:battle-of-the-blackwater` → `event:battle-of-blackwater`; `event:daenerys-enters-house-of-the-undying` → `event:daenerys-enters-the-house-of-the-undying`; `person:maester-vyman` → `person:vyman`; `organization:city-watch-of-kings-landing` → `organization:kings-landing-city-watch`.
- Шортхенд `event:bran-rickon-search` сопоставлен карточке приказа/начала поисков в ch50; `event:theon-orders-reek-to-hire-men` — карточке поручения-плана в ch56. Встреча посланников Иллирио сохранена; буквальное предложение отдать корабли не утверждается.
- `person:aegon-targaryen` в видении Дома Бессмертных имеет неустановленную личность. Верховный септон в ch49 не назван по имени. Wildlings слишком широкое объединение, а Royal Fleet — временное построение; эти ссылки не образуют отдельные устойчивые карточки группы.
- Дом с красной дверью и хижина у Закатного моря остаются местами сна/воспоминания, не физическими местами посещения. Сцены сна отмечены отдельно, даже если физическая карточка локации существует.
- `person:orell` — карточка упомянутого человека в ch68; его физическое присутствие в ch51 не подтверждено. Связь Lord of Bones/Rattleshirt также не закрыта первичной сверкой.
- `organization:thirteen-of-qarth` оставлен как именованная кандидатная группа по ch12, но её состав и полномочия из chapter index не следуют. В ch48 ledger содержит этот ref, однако triage отмечает, что страница перечисляет другие группы Кварта; присутствие/атрибуция в этой главе остаётся открытой классификацией. Локаторы: [ch12 Daenerys I](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_12), [ch48 Daenerys IV](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_48).

## Три дельты, интегрированные в текущий ledger

Эти строки отсутствовали в исходном срезе denominator и были добавлены в общий ledger во время аудита. В текущем `.38` у всех трёх `ledger_link_status=covered`:

| Ref | Поле ledger | Источник AWOIAF |
|---|---|---|
| `person:rattleshirt` | `people_appearing_ids`, ch68 Jon VIII | [Chapter 68](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_68) |
| `event:sansa-dontos-escape-plan` | `events_referenced_ids`, ch52 Sansa IV; переданный план, не завершённый побег | [Chapter 52](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_52) |
| `place:blackwater-rush` | `scene_place_ids`, ch59 Tyrion XIII | [Chapter 59](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_59) |

После интеграции не осталось ясных пропусков этих трёх контекстных связей. Открыты только классификации Orell в ch51 и The Thirteen of Qarth в ch48, описанные выше, а также три context-only event refs.

## Артефакты

- `candidate-reconciliation.csv` — одна строка на каждую связь/кандидатный контекст, с главой, URL, ролью/статусом, canonical ref, наличием карточки, ledger coverage и решением.
- `count-summary.csv` — агрегированные количества по ledger links, состояниям событий, disposition и каноническому знаменателю.

Этот проход оставался read-only; три ledger-связи интегрировал root. Сам package, manifest и ledger агент не изменял.
