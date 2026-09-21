# Attribution

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Текст в `conditions.ts`, `checks.ts` и `actions.ts` взят дословно из SRD 5.1 через открытые API
(https://www.dnd5eapi.co/api/2014/, сверка с https://api.open5e.com/v1/), снято 2026-09-18.
Таблицы в `abilities.ts`, `classes.ts`, `armor.ts` и блоки статов в `monsters.ts` (Bandit, Bandit Captain —
Appendix MM-B) сверены с теми же API 2026-09-18; числа дополнительно сведены между собой тестом
`src/campaign/derive.test.ts`.
Русские подписи (`label`, `labelRu`) — не часть SRD, это подписи интерфейса.
