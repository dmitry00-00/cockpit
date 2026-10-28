# Attribution

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Текст в `conditions.ts`, `checks.ts` и `actions.ts` взят дословно из SRD 5.1 через открытые API
(https://www.dnd5eapi.co/api/2014/, сверка с https://api.open5e.com/v1/), снято 2026-09-18.
Таблицы в `abilities.ts`, `classes.ts`, `armor.ts` и блоки статов в `monsters.ts` (Bandit, Bandit Captain —
Appendix MM-B) сверены с теми же API 2026-09-18; числа дополнительно сведены между собой тестом
`src/campaign/derive.test.ts`.
Русские подписи (`label`, `labelRu`) — не часть SRD, это подписи интерфейса.
Монстры (`content/srd/monsters.json`, весь SRD 5.1 — 334 блока) и магические предметы (`content/srd/magic-items.json`,
239 предметов) сняты с https://www.dnd5eapi.co/api/2014/ 2026-10-27; расхождения API с печатным SRD 5.1 исправлены
в FIXES импортёра по Markdown-копии SRD (https://github.com/oldmanumby/dnd.srd.5.1).

## Другие открытые библиотеки монстров (с 27.10.2026)

This work includes material from the Black Flag Reference Document (https://koboldpress.com/black-flag-reference-document/)
by Open Design LLC d/b/a Kobold Press, available under the Creative Commons Attribution 4.0 License
(https://creativecommons.org/licenses/by/4.0/).

This work includes material taken from the A5E System Reference Document (A5ESRD) by EN Publishing and available at
A5ESRD.com, based on Level Up: Advanced 5th Edition, available at www.levelup5e.com. The A5ESRD is licensed under the
Creative Commons Attribution 4.0 International License.

`content/bf/monsters.json` (360 блоков) и `content/a5e/monsters.json` (586 блоков, Monstrous Menagerie) сняты через
Open5e API v2 (https://api.open5e.com/v2/creatures/) скриптом `scripts/import-open5e-monsters.mjs`. Разметка Markdown
Open5e снята; в блоках A5E Open5e потерял запятые (на их месте двойной пробел) — запятые возвращены, потерянные
апострофы («creatures saving throw») остаются как в источнике.

