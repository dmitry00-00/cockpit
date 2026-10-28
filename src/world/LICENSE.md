# Attribution

`content/world/people/<0–7>.json` и `content/world/people-index.json` пишет `scripts/import-people.py` из дампа
Forgotten Realms Wiki (https://forgottenrealms.fandom.com): статьи с карточкой {{Person}} (20 611 NPC). Текст вики —
CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/), авторы — участники вики (история правок каждой статьи).
Взяты только поля карточек (имя, титул, раса, пол, род занятий, дом, бог-покровитель, годы рождения и смерти в DR) и
книги со страницами из сносок; текст статей не берётся. У каждой записи — ссылка на статью. Изменения: поля очищены от
разметки, «бывшие» значения ({{Former}}) отброшены, длинные поля обрезаны до 120 знаков, дом сведён к id места
справочника карты (content/maps), бог — к id божества (content/cosmos/deities.json). Forgotten Realms — товарный знак
Wizards of the Coast; материалы используются по Fan Content Policy.

`content/world/organizations.json` пишет `scripts/import-organizations.py` из того же дампа: статьи с карточкой
{{Organization}} (2 840). Взяты только поля карточек (тип, база, глава, боги, союзники и враги, мировоззрение, расы,
символ, численность, годы основания и роспуска) и книги со страницами из сносок; текст статей не берётся. Изменения:
поля очищены от разметки, «бывшие» значения отброшены, ссылки сведены к id мест, NPC, божеств и организаций.
`content/world/org-members.json` — членство NPC по категориям «Members of …» тех же статей.
