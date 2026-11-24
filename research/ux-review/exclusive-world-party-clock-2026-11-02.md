# Карта / партия / часы — разделение по уточнению02.11.2026

Последнее требование владельца: либо карта с единственной линией настоящих корешков, либо экран партии с до6 компактных карточек в строку и общими данными ниже. Масштабы справа рядом с map controls. Время — квадрат с мировыми часами, манипуляции в modal.

Реализовано Luna и интегрировано Codex:
- Map mode не рендерит одиночную party-PC card в инспекторе и не резервирует пустой inspector. Корешок/инфокнопка открывает весь party mode. «Карта мира» возвращает карту; состояние карточек сохраняется. Сквозные тесты покрывают modes, modal sheet, state/drafts, ids, отсутствие событий навигации.
- Карты compact fit реальным размером max240px, без transform: адаптивная сетка текущей страницы до6 колонок, реальный header и отдельная плотная типографика. Полный лист не уменьшен. Pager доступен и на collapsed линии.
- ScaleLadder перемещена направо от main world surface; map toolbar остаётся справа внутри карты.
- ClockBar:68×68 dial/world time; modal «Управление временем» содержит calendar/context/tempo/step/rest. Initiative/views/Players снаружи. Step и calendar entity links закрывают modal, чтобы результат не оставался за ним. У игроков нет манипуляций.

Проверки:169 файлов,1569/1569 тестов; npm run build exit0, включая TypeScript/package/art gates. Логи /private/tmp/cockpit-exclusive-ui-verified-tests.log и /private/tmp/cockpit-exclusive-ui-verified-build.log. Старое единственное ожидание видимого TimeTempo в PlayersView test переведено на явное открытие modal, проверки секретности не ослаблялись.

CUA на1280×720 до файлового диалога: clock68×68, в map mode0 видимых full PC cards; scale лежит справа от карты; scrollWidth1280. Клик Bo открыл4 карточки234×327 с общей одинаковой y177, standalone spines0, world aria-hidden. Экраны действительно исключают друг друга. После visual review уплотнены конкретные attack/ability числа; test/type gates повторены.

Незавершённая browser приёмка6: fixture /private/tmp/cockpit-six-party-fixture.json, memory-only QA page design/qa/six-party/index.html, server127.0.0.1:5182 (exec28494). Production campaign5181 не импортировалась. Filechooser CUA8 завис; kernel reset, tabs7/8 focus emulation time out. Host запрещает Computer Use для самого com.openai.codex, поэтому native picker не управляется. Пользователю задана async просьба закрыть окно (Отмена/Esc). Не обходить ограничение shell/headless. После ручного закрытия открыть read-only QA route (без импорта), проверить6 в одной строке безscroll/дублей, context below; затем clock dialog/focus и fresh screenshots. До этого не заявлять визуальную приёмку6 и не использовать прежние grouped-party screenshots как доказательство новой плотности. Временный server пока оставлен для продолжения этой проверки.

Общая цель снята, Kimi и обе автоматизации остаются остановлены; текущая отдельная UI-задача ожидает лишь описанную browser приёмку. Push не выполнялся.


## Повторная CUA-приёмка 20.11.2026 — закрыта

Вместо старого пути через файловый диалог использована только read-only QA-страница design/qa/six-party/index.html. Она создаёт контрольную партию из шести карточек в памяти (seedEngine + memoryStore), не импортирует файл и не меняет пользовательскую кампанию.

При viewport 1280×720 все шесть карточек видны в один ряд: ширина списка 1208 px, карточек 195×272 px; их Y-координаты совпадают, горизонтального переполнения страницы нет. «Партия сейчас» расположена под рядом. Окно мирового времени визуально просмотрено; Esc закрыл его, фокус вернулся на кнопку часов, время осталось 15 Mirtul 1492 DR, 08:00. Это закрывает оставшуюся CUA-приёмку раскладки и часов без импорта fixture и без участия сохранённой кампании.
