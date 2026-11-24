# AGOT 25–48: черновики отсутствующих refs

Подготовлен read-only набор из 15 кратких карточек для именных ссылок без карточек в проверенном пакете Planetos `.35`: 6 людей, 8 мест и 1 событие. Сохранён в `refs-no-card-drafts.json`.

Файл содержит три самостоятельных блока `cockpit.entity-layer/1` по типам (`person`, `place`, `event`) внутри оболочки `cockpit.entity-layer-draft-set/1`: формат слоя допускает один `kind` на слой. Все записи имеют стабильный ref, источник AWOIAF с лицензией CC BY-SA 3.0, numeric locator главы, оригинальную короткую формулировку и статус `secondary-indexed-partial`; первичная сверка по выбранному изданию отмечена как ожидающая.

## Состав

- **Люди (6):** `person:colemon` — ch. 25, P2; `person:brandon-the-builder` — ch. 25, P1; `person:malleon` — ch. 25, P1; `person:aegon-v-targaryen` — ch. 25, P1; `person:jaehaerys-ii-targaryen` — ch. 25, P1; `person:maekar-i-targaryen` — ch. 25, P1.
- **Места (8):** `place:eastwatch` — ch. 41, P1; `place:isle-of-faces` — ch. 41, P1; `place:braavos` — ch. 41, P1; `place:mummers-ford` — ch. 43, P2; `place:wendish-town` — ch. 43, P2; `place:kingswood` — ch. 45, P1; `place:port-of-ibben` — ch. 45, P1; `place:summer-isles` — ch. 45, P1.
- **Событие (1):** `event:lannister-army-gathering-at-casterly-rock` — Catelyn VII, ch. 40, P1. Оно размечено как `reported`: Родрик передаёт Катлин сведения о сборе войска; карточка не представляет это как наблюдённое действие или установленный результат.

## Ограничения

AWOIAF используется как вторичный указатель и справочный источник, поэтому набор не подтверждает точность формулировок относительно конкретного издания романа. Для Brandon the Builder формулировка сохраняет легендарный/атрибутируемый характер сведений. У Mummer’s Ford и Wendish Town географические сведения ограничены опубликованным указателем. Абсолютные даты не добавлялись. Проект, пакет и manifest не изменялись.
