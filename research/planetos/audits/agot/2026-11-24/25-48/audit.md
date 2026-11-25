# AGOT 25–48: очистка знаменателя chapter-index кандидатов

Дата проверки: 2026-11-24. Сверен package Planetos версии 2026.11.24.32 (774 карточки; 54 слоя) и строки 25–48 в chapter ledger.

## Лимиты источника — что ещё сверить по роману

AWOIAF — вторичный chapter index, не полный текстовый реестр. Его списки персонажей и разделы мест не гарантируют полноту: synopsis может показывать участника, которого нет в списке «Appearing»; раздел «Places» объединяет сценовые точки и упоминания. Источник не устанавливает, что слух, письмо, приказ или прогноз уже произошли. До закрытия denominator проверить спорные места и статус ключевых фактов по выбранному изданию романа, с edition/page locator. Первичная сверка не выполнена; все 24 строки остаются secondary-indexed-partial.

Стабильные URL с числовыми локаторами: [ch. 25](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_25), [ch. 27](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_27), [ch. 28](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_28), [ch. 30](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_30), [ch. 34](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_34), [ch. 37](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_37), [ch. 39](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_39), [ch. 40](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_40), [ch. 41](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_41), [ch. 42](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_42), [ch. 43](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_43), [ch. 44](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_44), [ch. 45](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_45), [ch. 46](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_46), [ch. 47](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_47), [ch. 48](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_48).

## Итоги по типам

Числа по персонажам ниже — occurrences в chapter-level списках, не число уникальных людей. Алиасы внутри одной записи (Pyp / Monkey / Mummer’s Monkey; «Stone Head» и т. п.) не умножались. Из знаменателя «люди» исключены четыре неустойчивые записи: неназванная мать Барры, неназванная серебристая кобыла, безымянный septon и должность king’s steward. Лошадь Dancer отмечена отдельно как неоднозначная animal entity и не включена в 323. Названные direwolves остаются персонажами, поскольку пакет уже моделирует их карточками персонажей.

| Тип и связь | Кандидатный denominator | Есть в ledger | Не покрыто / особый статус |
|---|---:|---:|---|
| Персонажи, «Appearing» | 323 записей по главам после чистки ролей/безымянных записей | 284 совпавших записей | 39 появлений без связи; ещё 4 ledger-ссылки в ch. 30 отсутствуют в списке «Appearing», хотя synopsis их обсуждает |
| Персонажи во сне | 10 фигур в ch. 39 | Все 10 фигур перечислены | Ledger ошибочно добавляет самого Эддарда как фигуру сна: 11 refs вместо 10 |
| Персонажи, «Mentioned» | Не закрыт | 212 refs / 49 уникальных ID в ledger | Требуется полное поимённое сопоставление. В ch. 25 и 39 найдены большие недосвязанные подмножества |
| Места сцены | Полный denominator не закрыт | 74 refs / 38 уникальных ID; все 24 строки имеют хотя бы одну сценовую ссылку | Это наличие ссылок, не доказательство полноты точек сцены |
| Места во сне | Пока 1 связь | Tower of Joy в ch. 39 | Crypts of Winterfell в сне ch. 47 пропущены; сон Sansa/Lady в ch. 44 требует проверки |
| Места-отсылки | Не закрыт | 0 refs во всех 24 строках | Поле пусто несмотря на многочисленные места в AWOIAF Places lists |
| События «произошло» | Полный denominator не закрыт | 38 refs / 37 уникальных ID | Для некоторых карточек нужно уточнить, описывает ли название завершённый исход или приказ/разговор |
| События «сообщено/упомянуто» | Полный denominator не закрыт | 7 refs / 6 уникальных ID | Исторические события и переданные новости в страницах часто смешаны; кандидаты по главам не сведены полностью |

Для appearance index-list reconciliation: 284/323 (87,9%). Это не процент полноты романа: сама вторичная таблица может быть неполной, а четыре дополнительные ledger-ссылки главы 30 демонстрируют такой случай.

## Конкретные пробелы

### Персонажи

В 39 отсутствующих appearance-связях 27 относятся к кандидатам с уже существующей карточкой в .32; 12 связей указывают на кандидатов без карточки:

- В ch. 27 отсутствует Pycelle; в ch. 28 — Kurleket.
- В ch. 30 списком пропущены Jory Cassel и Arya Stark, хотя они в «Appearing»; одновременно ledger имеет четыре человека вне этого списка: Joffrey, Cersei, Boros Blount и Meryn Trant. Synopsis страницы обсуждает эти имена в контексте сцен шатра и турнира, но само по себе не подтверждает физическое присутствие каждого; ledger refs следует проверить по роману, а не удалять автоматически.
- В ch. 34 отсутствует Whitey. В ch. 37 отсутствуют Grey Wind, Hali, Joseth, Kyra, Quent, Stiv, Wallen и Wayn; из них шесть не имеют отдельной карточки в .32 (Hali, Joseth, Quent, Stiv, Wallen, Wayn).
- В ch. 40 отсутствует Lyn Corbray. В ch. 41 пропущены Albett, Dareon, Grenn, Halder, Jeren, Bowen Marsh, Pypar, Rast, Samwell Tarly, Alliser Thorne и Todder — все уже имеют карточки.
- В ch. 42 отсутствуют Jaggot и Torrek (обе карточки отсутствуют). В ch. 43 пропущены Alyn, Raymun Darry, Joss, Lothar Mallery и Porther; у Joss и Lothar нет карточек.
- В ch. 44 отсутствует Alyn; в ch. 45 — Tomard и Varly; в ch. 46 — Fogo, Jommo и Ogo (карточки нет только у Jommo); в ch. 47 — Desmond.

В ch. 37 Dancer — названная лошадь, но не персонаж-человек; оставлена как отдельный неоднозначный animal candidate, не включённый в 323. В ch. 46 «one-eyed crone» индивидуально присутствует, но без имени; не превращалась в стабильный person ID. В ch. 47 «king’s steward» — роль, не конкретная личность; исключена.

### Упоминания

В ch. 25 page index перечисляет около 29 упомянутых людей, тогда как ledger связывает 13. Среди видимых кандидатов без связи: Robert Arryn, Renly Baratheon, Brandon the Builder, Colemon, Vardis Egen, Syrio Forel, Tywin Lannister, Malleon, Old Nan, Barristan Selmy, Rickard Stark, Aerys II, Aegon V, Jaehaerys II, Maekar I и Varys. В ch. 39 source list содержит 20 названных упоминаний после исключения безымянной матери Барры; ledger связывает 9. Пропущенные полезные связи: Petyr Baelish, Barra, Willem Darry, Tywin Lannister, Pycelle, Brandon Stark, Aerys II, Rhaegar, Rhaella, Tregar и Mace Tyrell. Эти примеры показывают, почему 212 ledger refs нельзя считать знаменателем.

### Места

Сценовые ссылки есть в каждой главе, но все 24 поля places_referenced_ids пусты. Например, ch. 27 перечисляет Casterly Rock, Dragonstone, Great Sept, King's Gate, River Gate, Myr, Qohor, Storm's End, Eyrie и Winterfell; ledger хранит только King's Landing, мастерскую Tobho Mott и малый зал совета. В ch. 41 список содержит Braavos, Casterly Rock, Dorne, Eastwatch, Haunted Forest, Isle of Faces, King's Landing, Kingsroad, Riverrun, Shadow Tower, Valyria и Winterfell; сцены в ledger — Castle Black и Wall. Большинство перечисленного здесь — отсылки, а не сцены.
В ch. 47 synopsis помещает сон Эддарда в crypts beneath Winterfell; ledger не связывает dream-place. В ch. 39 Tower of Joy уже помечена именно как place-in-dream, а не сцена.

### События: границы статуса

- В ch. 37 новости о ранении Неда и убийствах Jory, Heward и Wyl переданы Bran через Alyn. Это сообщение о более раннем событии, а не новое событие ch. 37. Существующая карточка Jaime ambushes Ned and kills Jory не связана как referenced event главы 37.
- В ch. 39 сон о Tower of Joy сам является dream-framed recollection; событие не следует трактовать как действие в сценическом настоящем.
- В ch. 40 сбор армии Jaime у Casterly Rock сообщён письмом; дальнейший поход в этой главе не показан.
- В ch. 43 Эддард отдаёт приказ послать Берика за Грегором. Для карточки eddard-sends-beric-after-gregor нужно явно хранить приказ/миссию отдельно от исхода рейда.
- В ch. 47 пророчества о будущем Станниса, план Ренли захватить детей и предложение Littlefinger — сообщения/прогнозы/предложения. Само название события должно говорить о фактически совершённой части (например, «отказал», «написал», «попросил»), а не подразумевать исполнение предложенного плана.

## Следующий проход

1. Внести 39 недостающих person-appearance связей после проверки четырёх расхождений ch. 30; отдельно решить, нужны ли карточки для 12 отсутствующих в пакете кандидатов.
2. Полностью свести page-index mentions и классифицировать упоминания как слух, сообщение, план или установленную биографическую связь.
3. Для локаций разметить каждую запись как scene, dream-scene или reference; заполнить places_referenced_ids.
4. Для событий различить свершившееся действие, приказ/план, слух и полученное сообщение. Затем провести первичную сверку по выбранному изданию.

## Файлы результата

- chapter-counts.csv — счётчики для глав 25–48.
- candidate-deltas.csv — отдельные отсутствующие person relations, важные пропуски mentions/places/events и их source locator.

